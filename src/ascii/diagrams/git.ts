import { commitType, type GitCommit, type GitModel } from '../../diagrams/git/db.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { label } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

interface View {
  commit: GitCommit;
  lane: number;
  lines: string[];
  main: number;
  group: number;
}
interface Link { from: View; to: View; fork: boolean; picked: boolean }

function text(raw: string, width: number): string[] {
  return label(raw).lines.flatMap(line => wrap(line, width));
}

function symbol(commit: GitCommit): string {
  switch (commit.customType ?? commit.type) {
    case commitType.REVERSE: return '×';
    case commitType.HIGHLIGHT: return '■';
    case commitType.MERGE: return '◉';
    case commitType.CHERRY_PICK: return '◇';
    default: return '●';
  }
}

export function renderGit(model: GitModel, ctx: AsciiContext, forceVertical = false): Canvas {
  const canvas = new Canvas();
  const config = ctx.config.gitGraph as Record<string, unknown> | undefined;
  const branches = config?.showBranches !== false;
  const ids = config?.showCommitLabel !== false;
  const vertical = model.direction !== 'LR' || ctx.compact || forceVertical;
  const flip = model.direction === 'BT';
  const laneOf = new Map(model.lanes.map((name, i) => [name, i]));
  const views: View[] = [...model.commits.values()].sort((a, b) => a.seq - b.seq).map(commit => ({
    commit, lane: laneOf.get(commit.branch) ?? 0, lines: [], main: 0, group: 0,
  }));
  const byId = new Map(views.map(view => [view.commit.id, view]));
  const links: Link[] = [];
  for (const to of views) {
    to.commit.parents.forEach((id, i) => {
      const from = byId.get(id);
      if (from && from !== to) links.push({
        from, to, fork: i === 0, picked: i > 0 && to.commit.type === commitType.CHERRY_PICK,
      });
    });
  }

  for (const edge of links.filter(edge => edge.picked)) {
    const between = (lane: number): boolean => views.some(view => view.lane === lane && view.commit.seq > edge.from.commit.seq && view.commit.seq < edge.to.commit.seq);
    // An old cherry-pick source may have newer commits. Never draw through them as ancestry.
    if (between(edge.from.lane)) edge.fork = true;
  }

  const parallel = config?.parallelCommits === true;
  const groups: View[][] = [];
  for (const view of views) {
    const parents = view.commit.parents.map(id => byId.get(id)).filter((parent): parent is View => parent !== undefined && parent.commit.seq < view.commit.seq);
    view.group = parallel ? Math.max(0, ...parents.map(parent => parent.group + 1)) : groups.length;
    (groups[view.group] ??= []).push(view);
  }

  const nameWrap = vertical
    ? Math.max(2, Math.min(ctx.compact ? 8 : 16, Math.floor((ctx.maxWidth - 20) / Math.max(1, model.lanes.length)) - 2))
    : 24;
  const names = model.lanes.map(name => branches ? text(name, nameWrap) : []);
  const laneX: number[] = [];
  let headerWidth = 0;
  names.forEach(lines => {
    const width = Math.max(1, ...lines.map(displayWidth));
    laneX.push(headerWidth + Math.floor(width / 2));
    headerWidth += width + 2;
  });
  const labelX = Math.max(0, headerWidth - 2) + 3;
  const wrapAt = vertical ? Math.max(2, Math.min(ctx.compact ? 28 : 40, ctx.maxWidth - labelX)) : 24;
  for (const view of views) {
    const c = view.commit;
    if (ids && c.customId) view.lines.push(...text(c.id, wrapAt));
    if (c.type < commitType.MERGE && c.message) view.lines.push(...text(c.message, wrapAt));
    if (c.type !== commitType.CHERRY_PICK || c.customTags) {
      for (const tag of c.tags) view.lines.push(...text(tag, wrapAt));
    }
    // Cherry-pick's source id is written in the command, unlike its generated commit id.
    if (c.type === commitType.CHERRY_PICK) {
      const source = c.parents[1];
      if (source) view.lines.push(...text(source, wrapAt));
      if (c.cherryPickParent) view.lines.push(...text(`parent: ${c.cherryPickParent}`, wrapAt));
    }
  }
  const groupLabels = groups.map(group => [...group].sort((a, b) => a.lane - b.lane).flatMap(view => {
    if (group.length === 1 || !vertical || view.lines.length === 0) return view.lines;
    const prefix = branches ? `${model.lanes[view.lane]}: ` : '';
    return text(`${prefix}${view.lines.join(' ')}`, wrapAt);
  }));
  let end = 0;
  groups.forEach((group, i) => {
    for (const view of group) view.main = end;
    const size = vertical ? Math.max(1, groupLabels[i].length) : Math.max(1, ...group.flatMap(view => view.lines.map(displayWidth)));
    // A commit column also carries its fork/merge stem; keep the following caption clear of it.
    end += vertical ? size + 1 : size + 7;
  });

  const laneY: number[] = [];
  let y = 0;
  for (let i = 0; i < model.lanes.length; i++) {
    laneY.push(y);
    const height = Math.max(0, names[i].length - 1, ...views.filter(view => view.lane === i).map(view => view.lines.length));
    y += height + 2;
  }
  if (!vertical) {
    const stems = links.filter(edge => edge.from.lane !== edge.to.lane).map(edge => ({
      x: edge.fork ? edge.from.main : edge.to.main,
      top: Math.min(laneY[edge.from.lane], laneY[edge.to.lane]),
      bottom: Math.max(laneY[edge.from.lane], laneY[edge.to.lane]),
    }));
    const enclosed = views.some(view => view.lines.some((line, i) => {
      const row = laneY[view.lane] + 1 + i;
      const active = stems.filter(stem => stem.top <= row && row <= stem.bottom);
      return active.some(stem => stem.x < view.main + 3) && active.some(stem => stem.x > view.main + 2 + displayWidth(line));
    }));
    // Put captions beside vertical history when horizontal stems would enclose them.
    if (enclosed) return renderGit(model, ctx, true);
  }
  const nameWidth = Math.max(0, ...names.flat().map(displayWidth));
  const headerHeight = vertical && branches ? Math.max(0, ...names.map(lines => lines.length)) + 1 : 0;
  const last = groups.at(-1);
  const lastMain = last?.[0].main ?? 0;
  const lastHeight = groups.length > 0 ? Math.max(1, groupLabels[groups.length - 1].length) : 1;
  const bottom = lastMain + lastHeight - 1;
  const point = (main: number, cross: number): readonly [number, number] => vertical
    ? [cross, headerHeight + (flip ? bottom - main : main)]
    : [nameWidth + (branches ? 3 : 0) + main, cross];
  const cross = (view: View): number => vertical ? laneX[view.lane] : laneY[view.lane];

  for (const edge of links) {
    const { from, to } = edge;
    if (edge.picked && views.some(view => view.lane === (edge.fork ? to.lane : from.lane) && view.commit.seq > from.commit.seq && view.commit.seq < to.commit.seq)) continue;
    const a = cross(from);
    const b = cross(to);
    const bend: readonly [number, number] = edge.fork ? [from.main, b] : [to.main, a];
    const points: readonly (readonly [number, number])[] = [[from.main, a], bend, [to.main, b]];
    canvas.path(points.map(([main, lane]) => point(main, lane)), { dashed: edge.picked, role: 'edge' });
  }

  if (branches) {
    names.forEach((lines, i) => lines.forEach((line, j) => {
      if (vertical) canvas.text(laneX[i] - Math.floor(displayWidth(line) / 2), headerHeight - lines.length - 1 + j, line, { role: 'label' });
      else canvas.textIn(0, laneY[i] + j, nameWidth, line, 'right', { role: 'label' });
    }));
  }
  for (const view of views) {
    const [x, row] = point(view.main, cross(view));
    canvas.put(x, row, symbol(view.commit), { role: 'accent' });
    const lines = vertical ? (groups[view.group][0] === view ? groupLabels[view.group] : []) : view.lines;
    lines.forEach((line, j) => {
      if (vertical) canvas.text(labelX, flip ? row - lines.length + 1 + j : row + j, line, { role: 'label' });
      else canvas.text(x + 3, row + 1 + j, line, { role: 'label' });
    });
  }
  return canvas;
}

export const git: AsciiDiagram<GitModel> = { type: 'gitGraph', render: renderGit };

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
  start: number;
  end: number;
  group: number;
}
interface Link { from: View; to: View; picked: boolean; track: number; gap: number }

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

export function renderGit(model: GitModel, ctx: AsciiContext): Canvas {
  const canvas = new Canvas();
  const config = ctx.config.gitGraph as Record<string, unknown> | undefined;
  const branches = config?.showBranches !== false;
  const ids = config?.showCommitLabel !== false;
  const vertical = model.direction !== 'LR' || ctx.compact;
  const flip = model.direction === 'BT';
  const laneOf = new Map(model.lanes.map((name, i) => [name, i]));
  const views: View[] = [...model.commits.values()].sort((a, b) => a.seq - b.seq).map(commit => ({
    commit, lane: laneOf.get(commit.branch) ?? 0, lines: [], main: 0, start: 0, end: 0, group: 0,
  }));
  const byId = new Map(views.map(view => [view.commit.id, view]));
  const links: Link[] = [];
  for (const to of views) {
    to.commit.parents.forEach((id, i) => {
      const from = byId.get(id);
      if (from && from !== to) links.push({
        from, to, picked: i > 0 && to.commit.type === commitType.CHERRY_PICK, track: -1, gap: -1,
      });
    });
  }

  const parallel = config?.parallelCommits === true;
  const groups: View[][] = [];
  for (const view of views) {
    const parents = view.commit.parents.map(id => byId.get(id)).filter((parent): parent is View => parent !== undefined && parent.commit.seq < view.commit.seq);
    view.group = parallel ? Math.max(0, ...parents.map(parent => parent.group + 1)) : groups.length;
    (groups[view.group] ??= []).push(view);
  }

  // Cross-branch edges get private tracks. Reuse a track only after its previous edge ends.
  const trackEnds: number[][] = model.lanes.map(() => []);
  for (const edge of links) {
    if (edge.from.lane === edge.to.lane && !edge.picked) continue;
    const lo = Math.min(edge.from.group, edge.to.group);
    const hi = Math.max(edge.from.group, edge.to.group);
    edge.gap = Math.min(edge.from.lane, edge.to.lane);
    const ends = trackEnds[edge.gap];
    let track = ends.findIndex(end => end < lo);
    if (track < 0) track = ends.length;
    ends[track] = hi;
    edge.track = track;
  }
  const laneX: number[] = [];
  let graphWidth = 0;
  for (let i = 0; i < model.lanes.length; i++) {
    laneX.push(graphWidth);
    if (i < model.lanes.length - 1) graphWidth += (ctx.compact ? 3 : 4) + trackEnds[i].length * 2;
  }
  const labelX = graphWidth + 3;
  const wrapAt = vertical
    ? Math.max(2, Math.min(ctx.compact ? 28 : 40, ctx.maxWidth - labelX))
    : 24;
  for (const view of views) {
    const c = view.commit;
    if (ids && c.type !== commitType.CHERRY_PICK && (c.type !== commitType.MERGE || c.customId)) {
      view.lines.push(...text(c.id, wrapAt));
    }
    if (c.type < commitType.MERGE && c.message) view.lines.push(...text(c.message, wrapAt));
    for (const tag of c.tags) view.lines.push(...text(`tag: ${tag}`, wrapAt));
    // A custom marker must not hide the fact that this commit has two parents.
    if (c.type === commitType.MERGE && c.customType !== undefined) view.lines.push(...text('merge', wrapAt));
  }

  const incoming = new Map<number, Link[]>();
  const outgoing = new Map<number, Link[]>();
  for (const edge of links.filter(edge => edge.track >= 0)) {
    const ins = incoming.get(edge.to.group) ?? [];
    ins.push(edge); incoming.set(edge.to.group, ins);
    const outs = outgoing.get(edge.from.group) ?? [];
    outs.push(edge); outgoing.set(edge.from.group, outs);
  }
  const groupLabels = groups.map(group => group.flatMap(view => {
    if (group.length === 1 || !vertical) return view.lines;
    if (view.lines.length === 0) return [];
    const prefix = branches ? `${model.lanes[view.lane]}: ` : '';
    return text(`${prefix}${view.lines.join(' ')}`, wrapAt);
  }));
  let end = -2;
  groups.forEach((group, i) => {
    const before = incoming.get(i)?.length ?? 0;
    const after = outgoing.get(i)?.length ?? 0;
    const size = vertical ? Math.max(1, groupLabels[i].length) : Math.max(1, ...group.flatMap(view => view.lines.map(displayWidth)));
    const start = end < 0 ? 0 : end + before + 1;
    for (const view of group) {
      view.start = start;
      view.main = vertical ? start : start + Math.floor(size / 2);
      view.end = start + size - 1;
    }
    end = start + size - 1 + after + 1;
  });

  const names = model.lanes.map(name => text(name, vertical ? Math.max(2, ctx.maxWidth - graphWidth - 1) : 24));
  const laneY: number[] = [];
  let y = 0;
  for (let i = 0; i < model.lanes.length; i++) {
    laneY.push(y);
    y += Math.max(branches ? names[i].length - 1 : 0, 0, ...views.filter(v => v.lane === i).map(v => v.lines.length)) + 3 + trackEnds[i].length * 2;
  }
  const nameWidth = branches ? Math.max(0, ...names.flat().map(displayWidth)) : 0;
  const headerHeight = branches && vertical ? names.reduce((sum, lines) => sum + Math.max(1, lines.length), 0) + 1 : 0;
  const point = (main: number, cross: number): readonly [number, number] => vertical
    ? [cross, headerHeight + (flip ? end - main : main)]
    : [nameWidth + (branches ? 3 : 0) + main, cross];
  const cross = (view: View): number => vertical ? laneX[view.lane] : laneY[view.lane];
  const path = (points: readonly (readonly [number, number])[], picked = false): void => {
    canvas.path(points.map(([m, c]) => point(m, c)), { dashed: picked, role: 'edge' });
  };

  for (const edge of links) {
    const { from, to } = edge;
    const a = cross(from);
    const b = cross(to);
    if (edge.track < 0) {
      path([[from.main, a], [to.main, b]]);
      continue;
    }
    const out = outgoing.get(from.group)!.indexOf(edge);
    const into = incoming.get(to.group)!.indexOf(edge);
    const leave = from.end + 2 + out;
    const enter = to.start - 2 - into;
    const track = vertical ? laneX[edge.gap] + 2 + edge.track * 2 : laneY[edge.gap + 1] - 2 - edge.track * 2;
    path([[from.main, a], [leave, a], [leave, track], [enter, track], [enter, b], [to.main, b]], edge.picked);
  }

  if (branches) {
    if (vertical) {
      let row = 0;
      names.forEach((lines, i) => {
        // Stagger names so long branch names do not collide with neighboring headings.
        for (const line of lines) canvas.text(laneX[i], row++, line, { role: 'label' });
        if (lines.length === 0) row++;
      });
    } else {
      names.forEach((lines, i) => lines.forEach((line, j) => canvas.textIn(0, laneY[i] + j, nameWidth, line, 'right', { role: 'label' })));
    }
  }
  for (const view of views) {
    const [x, row] = point(view.main, cross(view));
    canvas.put(x, row, symbol(view.commit), { role: 'accent' });
    const lines = vertical ? (groups[view.group][0] === view ? groupLabels[view.group] : []) : view.lines;
    lines.forEach((line, j) => {
      if (vertical) {
        const labelRow = flip ? row - lines.length + 1 + j : row + j;
        canvas.text(labelX, labelRow, line, { role: 'label' });
      } else {
        canvas.textIn(point(view.start, 0)[0], row + 1 + j, view.end - view.start + 1, line, 'center', { role: 'label' });
      }
    });
  }
  return canvas;
}

export const git: AsciiDiagram<GitModel> = { type: 'gitGraph', render: renderGit };

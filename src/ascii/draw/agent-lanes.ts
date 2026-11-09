import { direction, type Dir } from '../../layout/compound.js';
import { canonicalShape } from '../../diagrams/flowchart/shapes.js';
import { Canvas, type Rect } from '../canvas/canvas.js';
import type { AsciiContext } from '../core.js';
import { alignPorts, gridLabel, gridWires, port, type Side, type Wire } from './grid-wires.js';
import { drawShape, shapeKind, shapeSize } from './shapes.js';
import { layoutGraph, type GraphNode, type GraphEdge } from '../layout/graph.js';
import type { TextBlock } from '../text/label.js';

export interface LaneNode {
  id: string; label: string | undefined; labelType: string; shape: string;
  isGroup: boolean; parentId: string | undefined; dir: string | undefined;
}
export interface LaneEdge {
  start: string; end: string; label: string; labelType: string;
  thickness: string | undefined; pattern: string | undefined;
  arrowTypeStart: string; arrowTypeEnd: string; minlen: number | undefined;
}
export type LanePlacer = (nodes: GraphNode[], edges: GraphEdge[], dir: Dir) => Rect[];

// Share drawing and obstacle routing, while keeping swimlane placement independent of compound flows.
export function drawAgentLanes(raw: LaneNode[], edges: LaneEdge[], ctx: AsciiContext, dir: Dir, agent: boolean, place?: LanePlacer): Canvas {
  const sideways = dir === 'LR' || dir === 'RL';
  const width = ctx.compact ? 12 : 24;
  const texts = raw.map(n => gridLabel(n.label, { maxWidth: width, markdown: n.labelType === 'markdown' }));
  const index = new Map(raw.map((n, i) => [n.id, i]));
  const degree = raw.map(n => edges.filter(e => e.start === n.id || e.end === n.id).length);
  const kinds = raw.map(n => shapeKind(canonicalShape(n.shape)));
  const nodes: GraphNode[] = raw.map((n, i) => {
    const t = texts[i];
    if (n.isGroup) return { w: 0, h: 0, isGroup: true, dir: n.dir ? direction(n.dir) : undefined,
      padX: 3, padTop: t.height + 2, padBottom: 2, minW: t.width + 8 + degree[i] * 2 };
    const size = shapeSize(kinds[i], t);
    if (agent && kinds[i] === 'subroutine') size.w += 2;
    // Distinct ports keep parallel and returning relations separate at the node border.
    size.h = Math.max(size.h, (sideways || degree[i] > 2) ? degree[i] * 2 + 1 : 3);
    size.w = Math.max(size.w, sideways ? 5 : degree[i] * 2 + 3);
    if (agent && n.shape === 'collapsedGroup') size.h += 2;
    return size;
  });
  raw.forEach((n, i) => nodes[i].parent = index.get(n.parentId ?? '') ?? -1);
  const drawn = edges.flatMap(e => {
    const src = index.get(e.start), dst = index.get(e.end);
    if (src === undefined || dst === undefined) return [];
    const text = gridLabel(e.label, { maxWidth: ctx.compact ? 10 : 16, markdown: e.labelType === 'markdown' });
    return [{ e, src, dst, text }];
  });
  const graphEdges = drawn.map(d => ({ src: d.src, dst: d.dst, minlen: d.e.minlen, labelW: d.text.width, labelH: d.text.height }));
  const rects = place ? place(nodes, graphEdges, dir) : layoutGraph(nodes, graphEdges, dir, { nodeSep: 6, rankSep: sideways ? 8 : 3 }).nodes;
  if (!place) {
    // Rounded compound bounds can leave only one cell between adjacent containers.
    const cuts = rects.filter((_, i) => raw[i].isGroup).map(group => {
      const before = rects.filter(r => r.y + r.h <= group.y);
      const end = Math.max(-Infinity, ...before.map(r => r.y + r.h));
      return { at: group.y, add: Math.max(0, 4 - (group.y - end)) };
    }).filter(c => c.add > 0).sort((a, b) => b.at - a.at);
    for (const { at, add } of cuts) for (const r of rects) {
      if (r.y >= at) r.y += add;
      else if (r.y + r.h > at) r.h += add;
    }
  }
  const bounds = rects.length ? { top: Math.min(...rects.map(r => r.y)), bottom: Math.max(...rects.map(r => r.y + r.h)) } : undefined;
  if (bounds) {
    let blanks = 0;
    const removed: number[] = [];
    for (let y = bounds.top; y < bounds.bottom; y++) {
      if (rects.some(r => y >= r.y && y < r.y + r.h) || drawn.some(d => y >= Math.min(rects[d.src].y, rects[d.dst].y) && y < Math.max(rects[d.src].y + rects[d.src].h, rects[d.dst].y + rects[d.dst].h))) blanks = 0;
      else if (++blanks > 2) removed.push(y);
    }
    for (const r of rects) r.y -= removed.filter(y => y < r.y).length;
  }
  const canvas = new Canvas();
  const frames = rects.filter((_, i) => raw[i].isGroup);
  const boxes = rects.filter((_, i) => !raw[i].isGroup);
  const titles: Rect[] = [];
  raw.forEach((n, i) => {
    if (!n.isGroup) return;
    const r = rects[i], t = texts[i];
    canvas.box(r.x, r.y, r.w, r.h, { fill: false, round: agent });
    if (t.height) titles.push({ x: r.x + 2, y: r.y, w: t.width + 2, h: t.height });
  });
  const marker = (s: string) => s === 'arrow_point' ? 'arrow' : s === 'arrow_cross' ? 'cross' : s === 'arrow_circle' ? 'circle' : 'none';
  const wires: Wire[] = drawn.filter(d => d.e.thickness !== 'invisible').map(d => {
    const a = rects[d.src], b = rects[d.dst];
    let from: Side, to: Side;
    if (d.src === d.dst) { from = 'R'; to = 'T'; }
    else if (sideways) {
      const forward = dir === 'LR' ? b.x > a.x : b.x < a.x;
      if (!forward) { from = 'B'; to = 'B'; }
      else { from = dir === 'LR' ? 'R' : 'L'; to = dir === 'LR' ? 'L' : 'R'; }
    } else {
      const forward = dir === 'TB' ? b.y > a.y : b.y < a.y;
      if (!forward) { from = 'L'; to = 'L'; }
      else { from = dir === 'TB' ? 'B' : 'T'; to = dir === 'TB' ? 'T' : 'B'; }
    }
    return { from: port(a, from), to: port(b, to), text: d.text,
      style: { head: marker(d.e.arrowTypeEnd), tail: marker(d.e.arrowTypeStart), dashed: d.e.pattern === 'dotted', stroke: d.e.thickness === 'thick' ? 'heavy' : 'light' } };
  });
  alignPorts(wires);
  // Keep container ports clear of titles and give each relation a separate attachment.
  for (const r of frames) {
    const ports = wires.flatMap(w => [w.from, w.to]).filter(p => p.rect === r && p.side === 'T');
    const title = titles.find(t => t.y === r.y && t.x === r.x + 2);
    if (!title || !ports.length) continue;
    const left = title.x + title.w + 2;
    const right = r.x + r.w - 2;
    ports.sort((a, b) => a.at[0] - b.at[0]);
    ports.forEach((p, i) => p.at[0] = Math.max(left + 2 * i, Math.min(right - 2 * (ports.length - 1 - i), p.at[0])));
  }
  const finish = gridWires(canvas, boxes, frames, titles, wires);
  raw.forEach((n, i) => {
    const r = rects[i], t = texts[i];
    if (n.isGroup) {
      t.lines.forEach((line, j) => canvas.text(r.x + 2, r.y + j, ` ${line} `, { role: 'title' }));
    } else if (agent) drawAgentNode(canvas, r, n.shape, t);
    else drawShape(canvas, r, kinds[i], t);
  });
  finish();
  return canvas;
}

function drawAgentNode(canvas: Canvas, r: Rect, shape: string, text: TextBlock): void {
  const right = r.x + r.w - 1, bottom = r.y + r.h - 1;
  const kind = shapeKind(canonicalShape(shape));
  // A tool's inner rails use single lines; double borders are reserved for terminal states.
  if (kind === 'subroutine') {
    canvas.box(r.x, r.y, r.w, r.h);
    canvas.segment(r.x + 1, r.y, r.x + 1, bottom);
    canvas.segment(right - 1, r.y, right - 1, bottom);
    text.lines.forEach((line, i) => canvas.textIn(r.x + 2, r.y + 1 + Math.floor((r.h - 2 - text.height) / 2) + i, r.w - 4, line));
    return;
  }
  drawShape(canvas, r, kind, text);
  if (shape === 'diamond') canvas.put(r.x, r.y, '◇');
  if (shape === 'lean-right') {
    canvas.put(r.x, r.y, '╱'); canvas.put(right, r.y, '╱');
    canvas.put(r.x, bottom, '╱'); canvas.put(right, bottom, '╱');
  }
  if (shape === 'lin-doc' || shape === 'lined-document') {
    canvas.put(right, r.y, '/');
    canvas.put(r.x + 1, bottom, '~');
  }
  if (shape === 'connector') canvas.put(r.x + 1, r.y, '○');
  if (shape === 'collapsedGroup') canvas.textIn(r.x + 1, bottom - 1, r.w - 2, '…');
}

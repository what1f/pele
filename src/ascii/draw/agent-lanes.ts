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
      padX: 2, padTop: t.height + 1, padBottom: 1, minW: t.width + 6 + degree[i] * 2 };
    const size = shapeSize(kinds[i], t);
    if (agent && kinds[i] === 'subroutine') size.w += 2;
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
    const clear = (i: number, candidate: Rect): boolean => !rects.some((r, j) => j !== i && !raw[j].isGroup && nodes[j].parent === nodes[i].parent && candidate.x < r.x + r.w + 2 && candidate.x + candidate.w + 2 > r.x && candidate.y < r.y + r.h + 1 && candidate.y + candidate.h + 1 > r.y);
    if (sideways) {
      for (let pass = 0; pass < 2; pass++) for (const d of drawn) {
        if (d.e.pattern === 'dotted' || raw[d.src].isGroup || raw[d.dst].isGroup) continue;
        const a = rects[d.src], b = rects[d.dst];
        const forward = dir === 'LR' ? b.x > a.x + a.w : b.x + b.w < a.x;
        if (!forward || drawn.filter(e => e.dst === d.dst).length !== 1) continue;
        const candidate = { ...b, y: a.y + Math.floor((a.h - b.h) / 2) };
        if (clear(d.dst, candidate)) Object.assign(b, candidate);
      }
      for (const d of drawn) {
        if (d.e.pattern !== 'dotted' || !drawn.some(e => e.src === d.src && e.e.pattern !== 'dotted')) continue;
        const a = rects[d.src], b = rects[d.dst];
        if (b.y < a.y + a.h || raw[d.dst].isGroup) continue;
        const candidate = { ...b, x: a.x + Math.floor((a.w - b.w) / 2) };
        if (clear(d.dst, candidate)) Object.assign(b, candidate);
      }
    } else {
      for (const d of drawn) {
        if (raw[d.src].isGroup || raw[d.dst].isGroup || drawn.filter(e => e.dst === d.dst).length !== 1) continue;
        const a = rects[d.src], b = rects[d.dst];
        if (b.y <= a.y) continue;
        const left = Math.max(a.x + 1, b.x + 1), right = Math.min(a.x + a.w - 2, b.x + b.w - 2);
        if (left <= right || left - right > 3) continue;
        const dx = b.x < a.x ? left - right : right - left;
        const candidate = { ...b, x: b.x + dx };
        if (clear(d.dst, candidate)) Object.assign(b, candidate);
      }
    }
  }
  if (!place) {
    const depth = (i: number): number => {
      let d = 0;
      for (let p = nodes[i].parent ?? -1; p >= 0; p = nodes[p].parent ?? -1) d++;
      return d;
    };
    const groups = raw.map((n, i) => n.isGroup ? i : -1).filter(i => i >= 0).sort((a, b) => depth(b) - depth(a));
    for (const i of groups) {
      const children = rects.filter((_, j) => nodes[j].parent === i);
      if (!children.length) continue;
      const left = Math.min(...children.map(r => r.x)) - 3;
      const right = Math.max(...children.map(r => r.x + r.w)) + 3;
      const top = Math.min(...children.map(r => r.y)) - texts[i].height - 1;
      const bottom = Math.max(...children.map(r => r.y + r.h)) + 2;
      const w = Math.max(right - left, nodes[i].minW ?? 0);
      Object.assign(rects[i], { x: left - Math.floor((w - right + left) / 2), y: top, w, h: bottom - top });
    }
  }
  if (!place && rects.length) {
    const top = Math.min(...rects.map(r => r.y)), bottom = Math.max(...rects.map(r => r.y + r.h));
    const removed: number[] = [];
    let blanks = 0;
    for (let y = top; y < bottom; y++) {
      const busy = rects.some((r, i) => raw[i].isGroup ? (y >= r.y && y < r.y + Math.max(1, texts[i].height)) || y === r.y + r.h - 1 : y >= r.y && y < r.y + r.h);
      const labelled = drawn.some(d => d.text.height && y > Math.min(rects[d.src].y, rects[d.dst].y) && y < Math.max(rects[d.src].y, rects[d.dst].y));
      if (busy) blanks = 0;
      else if (++blanks > (labelled || drawn.some(d => d.src === d.dst && y >= rects[d.src].y - 4 && y < rects[d.src].y + rects[d.src].h + 3) ? 3 : 2)) removed.push(y);
    }
    for (const r of rects) {
      const end = r.y + r.h;
      r.h -= removed.filter(y => y >= r.y && y < end).length;
      r.y -= removed.filter(y => y < r.y).length;
    }
  }
  const canvas = new Canvas();
  const frames = rects.filter((_, i) => raw[i].isGroup);
  const boxes = rects.filter((_, i) => !raw[i].isGroup);
  const titles: Rect[] = [];
  const frameTitles = new Map<Rect, Rect>();
  raw.forEach((n, i) => {
    if (!n.isGroup) return;
    const r = rects[i], t = texts[i];
    canvas.box(r.x, r.y, r.w, r.h, { fill: false, round: agent });
    if (t.height) {
      const title = { x: r.x + 2, y: r.y, w: t.width + 2, h: t.height };
      const sources = drawn.filter(d => d.dst === i).map(d => rects[d.src]);
      const right = r.x + r.w - title.w - 1;
      if (sources.some(a => a.x + a.w - 2 < title.x + title.w + 2 && a.x + a.w - 2 >= r.x + 1 && a.x + 1 < right - 1)) title.x = right;
      titles.push(title);
      frameTitles.set(r, title);
    }
  });
  const marker = (s: string) => s === 'arrow_point' ? 'arrow' : s === 'arrow_cross' ? 'cross' : s === 'arrow_circle' ? 'circle' : 'none';
  const used = new Map<Rect, Map<Side, number>>();
  const take = (r: Rect, preferred: Side, outgoing: boolean): ReturnType<typeof port> => {
    const counts = used.get(r) ?? new Map<Side, number>();
    used.set(r, counts);
    const alternatives: Side[] = sideways ? (outgoing ? ['R', 'B', 'T', 'L'] : ['L', 'T', 'B', 'R']) : (outgoing ? ['B', 'R', 'L', 'T'] : ['T', 'R', 'L', 'B']);
    const candidates = [preferred, ...alternatives.filter(s => s !== preferred)];
    const capacity = (s: Side) => Math.max(1, Math.floor(((s === 'L' || s === 'R' ? r.h : r.w) - 3) / 2) + 1);
    const side = candidates.find(s => (counts.get(s) ?? 0) < capacity(s)) ?? preferred;
    counts.set(side, (counts.get(side) ?? 0) + 1);
    return port(r, side);
  };
  const wires: Wire[] = drawn.filter(d => d.e.thickness !== 'invisible').map(d => {
    const a = rects[d.src], b = rects[d.dst];
    let from: Side, to: Side;
    if (d.src === d.dst) { from = 'R'; to = 'T'; }
    else if (sideways) {
      const below = b.y >= a.y + a.h + 2, above = a.y >= b.y + b.h + 2;
      const overlap = Math.max(a.x + 1, b.x + 1) <= Math.min(a.x + a.w - 2, b.x + b.w - 2);
      if (below || above) {
        from = overlap ? (below ? 'B' : 'T') : b.x > a.x ? 'R' : 'L';
        to = below ? 'T' : 'B';
      } else {
        const forward = dir === 'LR' ? b.x > a.x : b.x < a.x;
        if (!forward) { from = 'T'; to = 'T'; }
        else { from = dir === 'LR' ? 'R' : 'L'; to = dir === 'LR' ? 'L' : 'R'; }
      }
    } else {
      const forward = dir === 'TB' ? b.y > a.y : b.y < a.y;
      if (!forward) { from = 'R'; to = 'R'; }
      else { from = dir === 'TB' ? 'B' : 'T'; to = dir === 'TB' ? 'T' : 'B'; }
    }
    if (!sideways && d.e.pattern === 'dotted' && nodes[d.src].parent !== nodes[d.dst].parent && drawn.some(e => e.src === d.src && e.e.pattern !== 'dotted')) from = 'L';
    const source = take(a, from, true);
    if (d.src !== d.dst && (source.side === 'B' || source.side === 'T') && (to === 'T' || to === 'B') && Math.max(a.x + 1, b.x + 1) > Math.min(a.x + a.w - 2, b.x + b.w - 2)) to = b.x > source.at[0] ? 'L' : 'R';
    return { from: source, to: take(b, to, false), text: d.text,
      style: { head: marker(d.e.arrowTypeEnd), tail: marker(d.e.arrowTypeStart), dashed: d.e.pattern === 'dotted', stroke: d.e.thickness === 'thick' ? 'heavy' : 'light' } };
  });
  alignPorts(wires);
  // Keep container ports clear of titles and give each relation a separate attachment.
  for (const r of frames) {
    const ports = wires.flatMap(w => [w.from, w.to]).filter(p => p.rect === r && p.side === 'T');
    const title = frameTitles.get(r);
    if (!title || !ports.length) continue;
    const available = Array.from({ length: r.w - 2 }, (_, i) => r.x + 1 + i).filter(x => x < title.x - 1 || x > title.x + title.w);
    const used: number[] = [];
    ports.sort((a, b) => a.at[0] - b.at[0]);
    ports.forEach(p => {
      const candidates = available.filter(x => used.every(at => Math.abs(at - x) >= 2));
      if (candidates.length) p.at[0] = candidates.reduce((a, b) => Math.abs(a - p.at[0]) <= Math.abs(b - p.at[0]) ? a : b);
      used.push(p.at[0]);
      p.fixed = true;
    });
  }
  for (const wire of wires) for (const p of [wire.from, wire.to]) {
    if (p.side !== 'T' || !p.rect || p.fixed) continue;
    const r = p.rect;
    const near = titles.filter(t => t.y + t.h > r.y - 3 && t.y < r.y);
    if (!near.length) continue;
    const free = (x: number) => !near.some(t => x >= t.x - 1 && x <= t.x + t.w);
    const xs = Array.from({ length: Math.max(0, r.w - 2) }, (_, i) => r.x + 1 + i).filter(free);
    if (xs.length) { p.at[0] = xs.reduce((a, b) => Math.abs(a - p.at[0]) <= Math.abs(b - p.at[0]) ? a : b); p.fixed = true; }
  }
  alignPorts(wires);
  wires.sort((a, b) => Number(b.from.rect === b.to.rect) - Number(a.from.rect === a.to.rect));
  const finish = gridWires(canvas, boxes, frames, titles, wires, { tightFrames: true });
  raw.forEach((n, i) => {
    const r = rects[i], t = texts[i];
    if (n.isGroup) {
      t.lines.forEach((line, j) => canvas.text(frameTitles.get(r)?.x ?? r.x + 2, r.y + j, ` ${line} `, { role: 'title' }));
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
  if (shape === 'collapsedGroup') canvas.put(r.x + 1, r.y, '+');
}

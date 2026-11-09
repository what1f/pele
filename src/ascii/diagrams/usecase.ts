import { buildUsecaseGraph } from '../../diagrams/usecase/graph.js';
import type { UsecaseModel } from '../../diagrams/usecase/types.js';
import { Canvas, type Rect } from '../canvas/canvas.js';
import { Arm } from '../canvas/glyphs.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { drawEdgeLine, finishEdge, placeLabel, type EdgeStyle, type Marker } from '../draw/edges.js';
import { layoutGraph, type GraphLayout, type GraphNode, type Point } from '../layout/graph.js';
import { label, type TextBlock } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

function marker(type: string): Marker {
  switch (type) {
    case 'arrow_point': return 'arrow';
    case 'arrow_circle': return 'circle';
    case 'arrow_cross': return 'cross';
    case 'extension': return 'triangle';
    default: return 'none';
  }
}

// Compound routes can share a return lane after rounding to terminal cells.
function separateRoutes(routes: Point[][], boxes: Rect[]): void {
  const overlap = (a: Point, b: Point, c: Point, d: Point): boolean => {
    if (a[1] === b[1] && c[1] === d[1] && a[1] === c[1]) return Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) > Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0]));
    if (a[0] === b[0] && c[0] === d[0] && a[0] === c[0]) return Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) > Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1]));
    return false;
  };
  const blocked = (a: Point, b: Point): boolean => boxes.some(r => {
    if (a[1] === b[1]) return a[1] >= r.y && a[1] < r.y + r.h && Math.max(a[0], b[0]) > r.x && Math.min(a[0], b[0]) < r.x + r.w - 1;
    return a[0] >= r.x && a[0] < r.x + r.w && Math.max(a[1], b[1]) > r.y && Math.min(a[1], b[1]) < r.y + r.h - 1;
  });
  for (let i = 0; i < routes.length; i++) {
    const points = routes[i];
    for (let k = 1; k + 2 < points.length; k++) {
      const a = points[k], b = points[k + 1];
      const conflicts = (a: Point, b: Point) => routes.slice(0, i).some(route => route.some((c, j) => j + 1 < route.length && overlap(a, b, c, route[j + 1])));
      if (!conflicts(a, b)) continue;
      const axis = a[1] === b[1] ? 1 : 0;
      for (let distance = 1; distance <= 32; distance++) {
        let found = false;
        for (const sign of [1, -1]) {
          const c: Point = [...a], d: Point = [...b];
          c[axis] += sign * distance; d[axis] += sign * distance;
          if (blocked(c, d) || blocked(a, c) || blocked(b, d) || conflicts(c, d) || conflicts(points[k - 1], c) || conflicts(d, points[k + 2])) continue;
          // Adjacent segments only grow in their existing clear lanes.
          const before = points[k - 1], after = points[k + 2];
          if ((c[axis] - before[axis]) * (a[axis] - before[axis]) < 0 || (d[axis] - after[axis]) * (b[axis] - after[axis]) < 0) continue;
          a[axis] = c[axis]; b[axis] = d[axis];
          found = true;
          break;
        }
        if (found) break;
      }
    }
  }
}

function spreadPorts(layout: GraphLayout, edges: { src: number; dst: number }[]): void {
  const occupied = new Map<string, Set<number>>();
  layout.edges.forEach((e, i) => {
    if (e.loop) return;
    if (e.points.length === 2) {
      const [a, b] = e.points;
      const vertical = a[0] === b[0];
      const mid = Math.floor((a[vertical ? 1 : 0] + b[vertical ? 1 : 0]) / 2);
      e.points = vertical ? [a, [a[0], mid], [b[0], mid], b] : [a, [mid, a[1]], [mid, b[1]], b];
    }
    for (const source of [true, false]) {
      const id = source ? edges[i].src : edges[i].dst;
      const r = layout.nodes[id];
      const end = source ? e.points[0] : e.points[e.points.length - 1];
      const next = source ? e.points[1] : e.points[e.points.length - 2];
      const vertical = end[0] === next[0];
      const axis = vertical ? 0 : 1;
      const side = vertical ? (end[1] <= r.y ? 'top' : 'bottom') : (end[0] <= r.x ? 'left' : 'right');
      const key = `${id}:${side}`;
      const used = occupied.get(key) ?? new Set<number>();
      occupied.set(key, used);
      const lo = (vertical ? r.x : r.y) + 1;
      const hi = lo + (vertical ? r.w : r.h) - 3;
      let at = end[axis];
      for (let gap = 0; gap <= hi - lo; gap++) {
        const free = [at + gap, at - gap].find(p => p >= lo && p <= hi && !used.has(p));
        if (free !== undefined) { at = free; break; }
      }
      used.add(at);
      end[axis] = at;
      next[axis] = at;
    }
  });
}

function tightenRows(layout: GraphLayout, nodes: GraphNode[], texts: TextBlock[]): void {
  const keep = new Set<number>();
  const protect = (y: number, h = 1) => { for (let j = 0; j < h; j++) keep.add(y + j); };
  layout.nodes.forEach((r, i) => {
    protect(r.y, nodes[i].isGroup ? (nodes[i].padTop ?? 2) - 1 : r.h);
    protect(r.y + r.h - 1);
  });
  layout.edges.forEach((e, i) => {
    e.points.forEach(p => protect(p[1]));
    if (e.label) {
      const t = texts[i];
      const [, y] = placeLabel(e.points, [e.label[0] + (t.width >> 1), e.label[1] + (t.height >> 1)], t.width, t.height);
      protect(y, t.height);
    }
  });
  const min = Math.min(...keep), max = Math.max(...keep);
  const rows = new Map<number, number>();
  let next = min, idle = 0;
  for (let y = min; y <= max; y++) {
    idle = keep.has(y) ? 0 : idle + 1;
    rows.set(y, next);
    if (idle <= 2) next++;
  }
  const at = (y: number) => rows.get(y) ?? y;
  layout.nodes.forEach(r => { const bottom = at(r.y + r.h - 1); r.y = at(r.y); r.h = bottom - r.y + 1; });
  layout.edges.forEach(e => { e.points.forEach(p => { p[1] = at(p[1]); }); if (e.label) e.label[1] = at(e.label[1]); });
}

function render(model: UsecaseModel, ctx: AsciiContext): Canvas {
  const graph = buildUsecaseGraph(model);
  const canvas = new Canvas();
  if (!graph.nodes.length) return canvas;
  const width = ctx.compact ? 14 : 26;
  const text = (raw: string | undefined, markdown = false, max = width): TextBlock => {
    const lines = label(raw, { markdown }).lines.flatMap(line => wrap(line, max));
    return { lines, width: Math.max(0, ...lines.map(displayWidth)), height: lines.length };
  };
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const titles = graph.nodes.map(n => text(n.label, n.labelType === 'markdown'));
  const texts = graph.nodes.map((n, i) => {
    const lines = [
      ...(n.stereotype ? text(`«${n.stereotype}»`).lines : []),
      ...titles[i].lines,
    ];
    return { lines, width: Math.max(0, ...lines.map(displayWidth)), height: lines.length };
  });
  const rows = graph.nodes.map(n => n.jsonRows?.map(r => ({ key: text(r.key), value: text(r.value) })) ?? []);
  const keyWidths = rows.map(rs => Math.max(0, ...rs.map(r => r.key.width)));
  const nodes: GraphNode[] = graph.nodes.map((n, i) => {
    if (n.isGroup) return { w: 0, h: 0, isGroup: true, padX: 2, padTop: titles[i].height + 2 + (n.boundaryType === 'package' ? 1 : 0), padBottom: 2, minW: titles[i].width + 6 };
    const actor = n.actorType !== undefined;
    const table = n.jsonRows !== undefined;
    const w = Math.max(7, texts[i].width + 4 + (n.business && !actor ? 2 : 0), table ? keyWidths[i] + Math.max(0, ...rows[i].map(r => r.value.width)) + 7 : 0);
    const h = texts[i].height + 2 + (actor ? 3 : 0) + (table ? rows[i].reduce((sum, r) => sum + Math.max(1, r.key.height, r.value.height) + 1, 0) : 0);
    return { w, h, parent: n.parentId ? index.get(n.parentId) : -1 };
  });
  // Notes stay in the same boundary as their subject.
  graph.nodes.forEach((n, i) => {
    if (n.noteTarget) nodes[i].parent = nodes[index.get(n.noteTarget)!].parent;
  });
  const edges = graph.edges.map(e => ({
    src: index.get(e.start)!, dst: index.get(e.end)!, minlen: e.minlen,
    text: text(e.label, e.labelType === 'markdown', ctx.compact ? 12 : 20),
    style: { head: marker(e.arrowTypeEnd), tail: marker(e.arrowTypeStart), dashed: e.pattern === 'dotted' } satisfies EdgeStyle,
  }));
  const dir = ctx.compact && (model.direction === 'LR' || model.direction === 'RL') ? 'TB' : model.direction === 'TD' ? 'TB' : model.direction;
  const sideways = dir === 'LR' || dir === 'RL';
  const loops = new Map<number, number>();
  for (const e of edges) {
    if (e.src === e.dst) {
      const count = (loops.get(e.src) ?? 0) + 1;
      loops.set(e.src, count);
      nodes[e.src].extraRight = Math.max(nodes[e.src].extraRight ?? 0, 4 * count + e.text.width + 2);
      nodes[e.src].h = Math.max(nodes[e.src].h, edges.filter(other => other.src === e.src && other.dst === e.src).reduce((sum, other) => sum + other.text.height + 3, 0) + 2);
    }
  }
  nodes.forEach((n, i) => {
    if (n.isGroup) return;
    const degree = edges.filter(e => e.src !== e.dst && (e.src === i || e.dst === i)).length;
    if (sideways) n.h = Math.max(n.h, degree + 2);
    if (sideways && loops.has(i)) n.h = Math.max(n.h, degree + 2 + edges.filter(e => e.src === i && e.dst === i).reduce((sum, e) => sum + e.text.height + 3, 0));
    if (!sideways) n.w = Math.max(n.w, degree * 2 + 3);
  });
  const layout = layoutGraph(nodes, edges.map(e => ({ ...e, labelW: e.text.width, labelH: e.text.height })), dir, { nodeSep: sideways ? 2 : 4, rankSep: sideways ? 7 : 3, edgeSep: 2 });
  spreadPorts(layout, edges);
  separateRoutes(layout.edges.map(e => e.points), layout.nodes.filter((_, i) => !nodes[i].isGroup));
  tightenRows(layout, nodes, edges.map(e => e.text));
  const groups = graph.nodes.map((n, i) => n.isGroup ? i : -1).filter(i => i >= 0);
  for (const i of groups) {
    const r = layout.nodes[i];
    canvas.box(r.x, r.y, r.w, r.h, { fill: false });
  }
  layout.edges.forEach((e, i) => { if (!e.loop) drawEdgeLine(canvas, e.points, edges[i].style); });
  graph.nodes.forEach((n, i) => {
    if (n.isGroup) return;
    const r = layout.nodes[i];
    const actor = n.actorType !== undefined;
    canvas.box(r.x, r.y, r.w, r.h, { round: n.shape === 'usecaseEllipse' || n.shape === 'usecaseBusiness' });
    const contentH = texts[i].height + (actor ? 3 : 0);
    let y = r.y + 1 + (n.jsonRows ? 0 : Math.floor((r.h - 2 - contentH) / 2));
    if (actor) {
      const cx = r.x + Math.floor(r.w / 2);
      canvas.put(cx, y, n.actorType === 'awesome' ? '●' : '○');
      if (n.business) canvas.put(cx + 1, y, '/');
      canvas.text(cx - 1, y + 1, n.actorType === 'awesome' ? '▄█▄' : n.actorType === 'hollow' ? '╭┼╮' : '─┼─');
      canvas.text(cx - 1, y + 2, '╱ ╲');
      y += 3;
    }
    texts[i].lines.forEach((line, j) => canvas.textIn(r.x + 2, y + j, r.w - 4 - (n.business && !actor ? 2 : 0), line));
    if (n.business && !actor) canvas.put(r.x + r.w - 3, y, '/');
    y += texts[i].height;
    if (n.jsonRows) {
      canvas.segment(r.x, y, r.x + r.w - 1, y);
      const split = r.x + keyWidths[i] + 3;
      canvas.segment(split, y, split, r.y + r.h - 1);
      for (const row of rows[i]) {
        y++;
        const h = Math.max(1, row.key.height, row.value.height);
        row.key.lines.forEach((line, j) => canvas.text(r.x + 2, y + j, line));
        row.value.lines.forEach((line, j) => canvas.text(split + 2, y + j, line));
        y += h;
        canvas.segment(r.x, y, r.x + r.w - 1, y);
      }
    }
    if (n.shape === 'note') canvas.put(r.x + r.w - 1, r.y, '╲');
  });
  for (const i of groups) {
    const r = layout.nodes[i];
    const w = titles[i].width + 2;
    let x = r.x + 2;
    for (let at = r.x + 2; at + w < r.x + r.w - 1; at++) {
      const free = titles[i].lines.every((_, j) => Array.from({ length: w + 2 }, (_, k) => at + k - 1).every(k => !(canvas.armsAt(k, r.y + j) & (Arm.Up | Arm.Down))));
      if (free) { x = at; break; }
    }
    if (graph.nodes[i].boundaryType === 'package') {
      const tab = Math.min(r.w - 2, x - r.x + titles[i].width + 2);
      canvas.segment(r.x, r.y + titles[i].height, r.x + tab, r.y + titles[i].height);
      canvas.segment(r.x + tab, r.y, r.x + tab, r.y + titles[i].height);
    }
    titles[i].lines.forEach((line, j) => canvas.text(x, r.y + j, ` ${line} `, { role: 'title' }));
  }
  layout.edges.forEach((e, i) => { if (!e.loop) finishEdge(canvas, e.points, edges[i].style); });
  layout.edges.forEach((e, i) => {
    const d = edges[i];
    if (e.loop || !e.label || !d.text.height) return;
    const [x, y] = placeLabel(e.points, [e.label[0] + (d.text.width >> 1), e.label[1] + (d.text.height >> 1)], d.text.width, d.text.height);
    canvas.clear(x - 1, y, d.text.width + 2, d.text.height);
    d.text.lines.forEach((line, j) => canvas.textIn(x, y + j, d.text.width, line, 'center', { role: 'label' }));
  });
  const loopCounts = new Map<number, number>();
  const loopRows = new Map<number, Set<number>>();
  layout.edges.forEach((e, i) => {
    if (!e.loop) return;
    const d = edges[i], r: Rect = layout.nodes[d.src];
    const nth = loopCounts.get(d.src) ?? 0;
    loopCounts.set(d.src, nth + 1);
    let used = loopRows.get(d.src);
    if (!used) {
      used = new Set<number>();
      layout.edges.forEach((route, j) => {
        if (route.loop) return;
        if (edges[j].src === d.src) used!.add(route.points[0][1]);
        if (edges[j].dst === d.src) used!.add(route.points[route.points.length - 1][1]);
      });
      loopRows.set(d.src, used);
    }
    let y = r.y + 1;
    while (used.has(y)) y++;
    let back = y + d.text.height + 2;
    while (used.has(back)) back++;
    for (let at = y; at <= back; at++) used.add(at);
    const right = r.x + r.w - 1, out = right + 3 + nth * 4;
    const pts: Point[] = [[right, y], [out, y], [out, back], [right + 1, back]];
    drawEdgeLine(canvas, pts, d.style);
    finishEdge(canvas, pts, d.style);
    d.text.lines.forEach((line, j) => canvas.text(out + 2, y + 1 + j, line));
  });
  return canvas;
}

export const usecase: AsciiDiagram<UsecaseModel> = { type: 'usecase', render };

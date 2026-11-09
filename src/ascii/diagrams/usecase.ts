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
    if (a[0] === b[0] && a[1] === b[1] || c[0] === d[0] && c[1] === d[1]) return false;
    if (a[1] === b[1] && c[1] === d[1] && a[1] === c[1]) return Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) >= Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0]));
    if (a[0] === b[0] && c[0] === d[0] && a[0] === c[0]) return Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) >= Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1]));
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
  interface Port { end: Point; next: Point; axis: 0 | 1; lo: number; hi: number }
  const groups = new Map<string, Port[]>();
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
      const ports = groups.get(key) ?? [];
      groups.set(key, ports);
      const lo = (vertical ? r.x : r.y) + 1;
      ports.push({ end, next, axis, lo, hi: lo + (vertical ? r.w : r.h) - 3 });
    }
  });
  for (const ports of groups.values()) {
    const { axis, lo, hi } = ports[0];
    ports.sort((a, b) => a.end[axis] - b.end[axis]);
    const start = ports.length === 1 ? Math.max(lo, Math.min(hi, ports[0].end[axis])) : lo + Math.floor((hi - lo - 2 * (ports.length - 1)) / 2);
    ports.forEach((p, i) => { p.end[axis] = p.next[axis] = start + i * 2; });
  }
}

function spaceLanes(layout: GraphLayout): void {
  const insert = (axis: 0 | 1, cut: number) => {
    layout.nodes.forEach(r => {
      const start = axis === 0 ? r.x : r.y;
      const size = axis === 0 ? r.w : r.h;
      if (start >= cut) { if (axis === 0) r.x++; else r.y++; }
      else if (start + size > cut) { if (axis === 0) r.w++; else r.h++; }
    });
    layout.edges.forEach(e => {
      e.points.forEach(p => { if (p[axis] >= cut) p[axis]++; });
      if (e.label && e.label[axis] >= cut) e.label[axis]++;
    });
  };
  for (let pass = 0; pass < 100; pass++) {
    let gap: { axis: 0 | 1; cut: number } | undefined;
    for (let i = 0; i < layout.edges.length && !gap; i++) {
      const route = layout.edges[i].points;
      for (let j = 0; j < i && !gap; j++) {
        const other = layout.edges[j].points;
        for (let k = 0; k + 1 < route.length && !gap; k++) {
          const a = route[k], b = route[k + 1];
          for (let l = 0; l + 1 < other.length; l++) {
            const c = other[l], d = other[l + 1];
            if (a[0] === b[0] && c[0] === d[0] && Math.abs(a[0] - c[0]) === 1 && Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) >= Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1]))) gap = { axis: 0, cut: Math.max(a[0], c[0]) };
            if (a[1] === b[1] && c[1] === d[1] && Math.abs(a[1] - c[1]) === 1 && Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) >= Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0]))) gap = { axis: 1, cut: Math.max(a[1], c[1]) };
            if (gap) break;
          }
        }
      }
    }
    if (!gap) break;
    insert(gap.axis, gap.cut);
  }
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

function edgeLabels(layout: GraphLayout, texts: TextBlock[], nodes: GraphNode[]): (Point | undefined)[] {
  const placed: Rect[] = [];
  const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const segment = (a: Point, b: Point): Rect => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]) + 1, h: Math.abs(a[1] - b[1]) + 1 });
  return layout.edges.map((e, i) => {
    const t = texts[i];
    if (!e.label || !t.height || e.loop) return undefined;
    const near: Point = [e.label[0] + (t.width >> 1), e.label[1] + (t.height >> 1)];
    const candidates: { p: Point; score: number }[] = [];
    for (let k = 0; k + 1 < e.points.length; k++) {
      const a = e.points[k], b = e.points[k + 1];
      const horizontal = a[1] === b[1];
      const size = horizontal ? t.width + 4 : t.height + 2;
      const length = horizontal ? Math.abs(a[0] - b[0]) : Math.abs(a[1] - b[1]);
      if (length < size) continue;
      const lo = Math.min(a[horizontal ? 0 : 1], b[horizontal ? 0 : 1]);
      for (let at = lo + 2; at <= lo + length - size + 2; at++) {
        const p: Point = horizontal ? [at, a[1] - (t.height >> 1)] : [a[0] - (t.width >> 1), at];
        const box: Rect = { x: p[0] - 1, y: p[1], w: t.width + 2, h: t.height };
        if (placed.some(r => intersects(box, r))) continue;
        if (layout.nodes.some((r, j) => nodes[j].isGroup
          ? [segment([r.x, r.y], [r.x + r.w - 1, r.y]), segment([r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]), segment([r.x, r.y], [r.x, r.y + r.h - 1]), segment([r.x + r.w - 1, r.y], [r.x + r.w - 1, r.y + r.h - 1])].some(side => intersects(box, side))
          : intersects(box, r))) continue;
        if (layout.edges.some((route, j) => route.points.some((c, l) => l + 1 < route.points.length && (j !== i || l !== k) && intersects(box, segment(c, route.points[l + 1]))))) continue;
        candidates.push({ p, score: (p[0] + t.width / 2 - near[0]) ** 2 + 4 * (p[1] + t.height / 2 - near[1]) ** 2 });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    const p = candidates[0]?.p ?? placeLabel(e.points, near, t.width, t.height);
    placed.push({ x: p[0] - 1, y: p[1], w: t.width + 2, h: t.height });
    return p;
  });
}

function actorBounds(r: Rect, text: TextBlock, business: boolean | undefined, y: number): [number, number] {
  const figureH = r.h - text.height - 2;
  const row = y - r.y - 1;
  if (row >= figureH) {
    const w = displayWidth(text.lines[row - figureH] ?? '');
    const x = r.x + 2 + Math.floor((r.w - 4 - w) / 2);
    return [x, x + w - 1];
  }
  const cx = r.x + Math.floor(r.w / 2);
  const arms = row === 1 || row === figureH - 1;
  return [cx - (arms ? 1 : 0), cx + (arms || row === 0 && business ? 1 : 0)];
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
    if (n.isGroup) return { w: 0, h: 0, isGroup: true, padX: 2, padTop: titles[i].height + 2, padBottom: 2, minW: titles[i].width + 6 };
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
    const degree = Math.max(edges.filter(e => e.src !== e.dst && e.src === i).length, edges.filter(e => e.src !== e.dst && e.dst === i).length);
    if (graph.nodes[i].actorType !== undefined) {
      const total = edges.filter(e => e.src !== e.dst && (e.src === i || e.dst === i)).length;
      const loopH = edges.filter(e => e.src === i && e.dst === i).reduce((sum, e) => sum + e.text.height + 3, 0);
      n.h = Math.max(n.h, total * 2 + texts[i].height + 1, loopH ? loopH + texts[i].height + 4 : 0);
    }
    if (sideways) n.h = Math.max(n.h, degree * 2 + 1);
    if (sideways && loops.has(i)) n.h = Math.max(n.h, degree * 2 + 1 + edges.filter(e => e.src === i && e.dst === i).reduce((sum, e) => sum + e.text.height + 3, 0));
    if (!sideways) n.w = Math.max(n.w, degree * 2 + 3);
  });
  const layout = layoutGraph(nodes, edges.map(e => ({ ...e, labelW: e.text.width, labelH: e.text.height })), dir, { nodeSep: sideways ? 2 : 4, rankSep: sideways ? 7 : 3, edgeSep: 3 });
  spreadPorts(layout, edges);
  separateRoutes(layout.edges.map(e => e.points), layout.nodes.filter((_, i) => !nodes[i].isGroup));
  // Put repeated return relationships around opposite sides of the drawing.
  layout.edges.forEach((route, i) => {
    const e = edges[i];
    if (route.loop || !edges.slice(0, i).some(other => other.src === e.src && other.dst === e.dst)) return;
    const a = layout.nodes[e.src], b = layout.nodes[e.dst];
    if (!route.points.some(p => p[1] >= Math.max(a.y + a.h, b.y + b.h))) return;
    const right = b.x > a.x;
    const top = Math.min(...layout.nodes.map(r => r.y)) - 3;
    const x = a.x + Math.floor(a.w / 2);
    const side = right ? b.x + b.w + 2 : b.x - 3;
    const y = b.y + Math.floor(b.h / 2);
    route.points = [[x, a.y], [x, top], [side, top], [side, y], [right ? b.x + b.w : b.x - 1, y]];
  });
  separateRoutes(layout.edges.map(e => e.points), layout.nodes.filter((_, i) => !nodes[i].isGroup));
  spaceLanes(layout);
  graph.nodes.forEach((node, id) => {
    if (node.actorType === undefined) return;
    const r = layout.nodes[id];
    const cx = r.x + Math.floor(r.w / 2);
    const bodyBounds = (y: number) => actorBounds(r, texts[id], node.business, y);
    const usedRows = new Map<boolean, number[]>();
    const portY = (right: boolean): number => {
      const used = usedRows.get(right) ?? [];
      usedRows.set(right, used);
      const figureH = r.h - texts[id].height - 2;
      const choices: number[] = [];
      for (let row = 1; row < figureH - 1; row += 2) choices.push(r.y + 1 + row);
      const widest = texts[id].lines.findIndex(line => displayWidth(line) === texts[id].width);
      if (widest >= 0) choices.push(r.y + 1 + figureH + widest);
      const y = choices.find(y => used.every(other => Math.abs(y - other) >= 2)) ?? choices[0];
      used.push(y);
      return y;
    };
    let nth = 0;
    layout.edges.forEach((route, i) => {
      if (route.loop) return;
      for (const source of [true, false]) {
        if ((source ? edges[i].src : edges[i].dst) !== id) continue;
        const points = source ? route.points : [...route.points].reverse();
        const end = points[0], next = points[1];
        if (end[0] === next[0]) {
          const other = layout.nodes[source ? edges[i].dst : edges[i].src];
          let right = other.x + other.w / 2 >= cx;
          const slot = nth++;
          let y = r.y + 2 + slot * 2;
          const laneAt = (right: boolean) => right ? r.x + r.w + 1 + slot * 2 : r.x - 2 - slot * 2;
          const blocked = (x: number) => layout.nodes.some((box, j) => j !== id && !nodes[j].isGroup && x >= box.x && x < box.x + box.w && Math.max(y, next[1]) >= box.y && Math.min(y, next[1]) < box.y + box.h);
          if (blocked(laneAt(right)) && !blocked(laneAt(!right))) right = !right;
          y = portY(right);
          const bounds = bodyBounds(y);
          const x = right ? bounds[1] : bounds[0];
          let lane = laneAt(right);
          while (layout.nodes.some((box, j) => nodes[j].isGroup && Math.max(y, next[1]) >= box.y && Math.min(y, next[1]) < box.y + box.h && (Math.abs(lane - box.x) < 2 || Math.abs(lane - (box.x + box.w - 1)) < 2))) lane += right ? 1 : -1;
          points.splice(0, 1, [x + (source ? 0 : right ? 1 : -1), y], [lane, y], [lane, next[1]]);
        } else {
          const right = next[0] > cx;
          end[1] = next[1] = portY(right);
          const bounds = bodyBounds(end[1]);
          end[0] = (right ? bounds[1] : bounds[0]) + (source ? 0 : right ? 1 : -1);
        }
        route.points = source ? points : points.reverse();
      }
    });
  });
  layout.edges.forEach(e => {
    const points: Point[] = [];
    for (const p of e.points) {
      if (points.length && points[points.length - 1][0] === p[0] && points[points.length - 1][1] === p[1]) continue;
      const n = points.length;
      if (n > 1 && (points[n - 2][0] === points[n - 1][0] && p[0] === points[n - 1][0] || points[n - 2][1] === points[n - 1][1] && p[1] === points[n - 1][1])) points[n - 1] = p;
      else points.push(p);
    }
    e.points = points;
  });
  separateRoutes(layout.edges.map(e => e.points), layout.nodes.filter((_, i) => !nodes[i].isGroup));
  spaceLanes(layout);
  graph.nodes.forEach((node, id) => {
    if (node.actorType === undefined) return;
    const r = layout.nodes[id], cx = r.x + Math.floor(r.w / 2);
    layout.edges.forEach((route, i) => {
      if (route.loop) return;
      for (const source of [true, false]) {
        if ((source ? edges[i].src : edges[i].dst) !== id) continue;
        const end = source ? route.points[0] : route.points[route.points.length - 1];
        const next = source ? route.points[1] : route.points[route.points.length - 2];
        const right = next[0] > cx;
        const [left, last] = actorBounds(r, texts[id], node.business, end[1]);
        end[0] = (right ? last : left) + (source ? 0 : right ? 1 : -1);
      }
    });
  });
  tightenRows(layout, nodes, edges.map(e => e.text));
  const labels = edgeLabels(layout, edges.map(e => e.text), nodes);
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
    if (!actor) canvas.box(r.x, r.y, r.w, r.h, { round: n.shape === 'usecaseEllipse' || n.shape === 'usecaseBusiness' });
    const figureH = actor ? r.h - texts[i].height - 2 : 0;
    const contentH = texts[i].height + figureH;
    let y = r.y + 1 + (n.jsonRows ? 0 : Math.floor((r.h - 2 - contentH) / 2));
    if (actor) {
      const cx = r.x + Math.floor(r.w / 2);
      canvas.put(cx, y, n.actorType === 'awesome' ? '●' : '○');
      if (n.business) canvas.put(cx + 1, y, '/');
      canvas.segment(cx, y + 1, cx, y + figureH - 2);
      canvas.text(cx - 1, y + 1, n.actorType === 'awesome' ? '▄█▄' : n.actorType === 'hollow' ? '╭┼╮' : '─┼─');
      canvas.text(cx - 1, y + figureH - 1, '╱ ╲');
      y += figureH;
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
  });
  for (const i of groups) {
    const r = layout.nodes[i];
    const w = titles[i].width + 2;
    let x = r.x + 2;
    for (let at = r.x + 2; at + w < r.x + r.w - 1; at++) {
      const free = titles[i].lines.every((_, j) => Array.from({ length: w + 2 }, (_, k) => at + k - 1).every(k => !(canvas.armsAt(k, r.y + j) & (Arm.Up | Arm.Down))));
      if (free) { x = at; break; }
    }
    titles[i].lines.forEach((line, j) => canvas.text(x, r.y + j, ` ${line} `, { role: 'title' }));
  }
  layout.edges.forEach((e, i) => { if (!e.loop) finishEdge(canvas, e.points, edges[i].style); });
  layout.edges.forEach((e, i) => {
    const d = edges[i];
    if (e.loop || !e.label || !d.text.height) return;
    const [x, y] = labels[i]!;
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
    const actor = graph.nodes[d.src].actorType !== undefined;
    let y = r.y + (actor ? 2 : 1);
    while (used.has(y)) y++;
    let back = y + d.text.height + 2;
    while (used.has(back)) back++;
    for (let at = y; at <= back; at++) used.add(at);
    const right = r.x + r.w - 1, out = right + 3 + nth * 4;
    const start = actor ? actorBounds(r, texts[d.src], graph.nodes[d.src].business, y)[1] : right;
    const end = actor ? actorBounds(r, texts[d.src], graph.nodes[d.src].business, back)[1] : right;
    const pts: Point[] = [[start, y], [out, y], [out, back], [end + 1, back]];
    drawEdgeLine(canvas, pts, d.style);
    finishEdge(canvas, pts, d.style);
    d.text.lines.forEach((line, j) => canvas.text(out + 2, y + 1 + j, line));
  });
  return canvas;
}

export const usecase: AsciiDiagram<UsecaseModel> = { type: 'usecase', render };

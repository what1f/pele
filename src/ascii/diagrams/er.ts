import { direction } from '../../layout/compound.js';
import { parseGenericTypes } from '../../diagrams/common/generics.js';
import { buildErGraph, type ErGraphNode } from '../../diagrams/er/graph.js';
import type { ErModel } from '../../diagrams/er/types.js';
import { Canvas, type Rect } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { finishEdge } from '../draw/edges.js';
import { routeEr } from '../layout/er.js';
import { layoutGraph, type GraphNode, type GraphEdge, type Point, type Dir } from '../layout/graph.js';
import { label, type TextBlock } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

function text(raw: string, width: number, markdown = true): TextBlock {
  const lines = label(raw, { markdown, maxWidth: width }).lines.flatMap((line) => wrap(line, width));
  return { lines, width: Math.max(0, ...lines.map(displayWidth)), height: lines.length };
}

function attribute(raw: string, width: number): TextBlock {
  const converted = parseGenericTypes(raw);
  return text(converted === raw ? raw : converted.replace(/</g, '&lt;').replace(/>/g, '&gt;'), width, false);
}

interface View {
  title: TextBlock;
  rows: TextBlock[][];
  cols: number[];
  w: number;
  h: number;
}

function view(node: ErGraphNode, compact: boolean, width: number): View {
  const title = text(node.alias || node.label, node.isGroup ? 1000 : width, node.labelType === 'markdown');
  const rows = node.attributes.map((a) => {
    if (compact) {
      const head = [a.type, a.name, a.keys.join(', ')].filter(Boolean).join(' ');
      const first = attribute(head, width);
      const comment = text(a.comment, Math.max(2, width - 2), false);
      return [{
        lines: [...first.lines, ...comment.lines.map((line) => `  ${line}`)],
        width: Math.max(first.width, comment.width > 0 ? comment.width + 2 : 0),
        height: first.height + comment.height,
      }];
    }
    return [attribute(a.type, 14), attribute(a.name, width), attribute(a.keys.join(', '), 7), text(a.comment, width, false)];
  });
  const active = rows.length ? rows[0].map((_, col) => col).filter((col) => rows.some((row) => row[col].width > 0)) : [];
  const cols = active.map((col) => Math.max(...rows.map((row) => row[col].width)));
  const filtered = rows.map((row) => active.map((col) => row[col]));
  const w = Math.max(5, title.width + 4, cols.reduce((sum, col) => sum + col + 3, 1));
  const h = Math.max(1, title.height) + 2 + (rows.length ? 1 + filtered.reduce((sum, row) => sum + Math.max(1, ...row.map((c) => c.height)), 0) : 0);
  return { title, rows: filtered, cols, w, h };
}

function entity(canvas: Canvas, r: Rect, v: View): void {
  canvas.box(r.x, r.y, r.w, r.h);
  v.title.lines.forEach((line, j) => canvas.textIn(r.x + 2, r.y + 1 + j, r.w - 4, line));
  if (!v.rows.length) return;
  const divider = r.y + Math.max(1, v.title.height) + 1;
  canvas.segment(r.x, divider, r.x + r.w - 1, divider);
  let colX = r.x;
  for (let k = 0; k + 1 < v.cols.length; k++) {
    colX += v.cols[k] + 3;
    canvas.segment(colX, divider, colX, r.y + r.h - 1);
  }
  let y = divider + 1;
  for (const row of v.rows) {
    let x = r.x + 2;
    row.forEach((cell, k) => {
      cell.lines.forEach((line, j) => canvas.text(x, y + j, line));
      x += v.cols[k] + 3;
    });
    y += Math.max(1, ...row.map((c) => c.height));
  }
}

// Reserve a two-cell marker band outside each entity, with a continuous centre line.
function cardinality(canvas: Canvas, p: Point, next: Point, kind: string): Rect {
  const dx = Math.sign(next[0] - p[0]);
  const dy = Math.sign(next[1] - p[1]);
  const at = (distance: number): Point => [p[0] + dx * distance, p[1] + dy * distance];
  const bar = (distance: number): void => {
    const [x, y] = at(distance);
    canvas.segment(x - Math.abs(dy), y - Math.abs(dx), x + Math.abs(dy), y + Math.abs(dx), { role: 'accent' });
  };
  if (kind === 'md_parent') {
    const [x, y] = at(1);
    canvas.put(x, y, '◇', { role: 'accent' });
  } else {
    if (kind === 'one_or_more' || kind === 'zero_or_more') {
      const [x, y] = at(1);
      if (dx) canvas.put(x, y, dx > 0 ? '>' : '<', { role: 'accent' });
      else {
        canvas.put(x - 1, y, dy > 0 ? '╲' : '╱', { role: 'accent' });
        canvas.put(x + 1, y, dy > 0 ? '╱' : '╲', { role: 'accent' });
      }
    } else bar(1);
    if (kind === 'zero_or_one' || kind === 'zero_or_more') {
      const [x, y] = at(2);
      canvas.put(x, y, '○', { role: 'accent' });
    } else bar(2);
  }
  return { x: Math.min(p[0] + dx, p[0] + dx * 2) - Math.abs(dy), y: Math.min(p[1] + dy, p[1] + dy * 2) - Math.abs(dx), w: dx ? 2 : 3, h: dy ? 2 : 3 };
}

function draw(model: ErModel, ctx: AsciiContext, flow: Dir, spacing = 0): Canvas {
  const graph = buildErGraph(model);
  const width = ctx.compact ? Math.max(8, Math.min(20, Math.floor(ctx.maxWidth / 3) - 6)) : 24;
  const views = graph.nodes.map((n) => view(n, ctx.compact, width));
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const nodes: GraphNode[] = graph.nodes.map((n, i) => ({
    w: n.isGroup ? 0 : views[i].w,
    h: n.isGroup ? 0 : views[i].h,
    isGroup: n.isGroup,
    parent: n.parentId ? (index.get(n.parentId) ?? -1) : -1,
    dir: n.dir ? direction(n.dir) : undefined,
    padX: 2, padTop: 2, padBottom: 1,
    minW: n.isGroup ? views[i].title.width + 12 : undefined,
  }));
  const drawn = graph.edges.flatMap((e) => {
    const src = index.get(e.start);
    const dst = index.get(e.end);
    if (src === undefined || dst === undefined) return [];
    return [{ ...e, src, dst, text: text(e.label, ctx.compact ? 12 : 18) }];
  });
  const bundles = new Map<string, typeof drawn>();
  const loopPad = nodes.map(() => 0);
  drawn.forEach((e) => {
    if (e.src === e.dst) {
      loopPad[e.src] += e.text.height + 2 + (loopPad[e.src] === 0 ? 1 : 0);
      nodes[e.src].w = Math.max(nodes[e.src].w, e.text.width + 12);
    } else {
      const key = [e.src, e.dst].sort((a, b) => a - b).join(':');
      const list = bundles.get(key) ?? [];
      list.push(e);
      bundles.set(key, list);
    }
  });
  nodes.forEach((n, i) => {
    const ports = drawn.filter((e) => e.src !== e.dst && (e.src === i || e.dst === i)).length;
    if (n.isGroup) n.minW = Math.max(n.minW ?? 0, views[i].title.width + 12 + ports * 4);
    else n.w = Math.max(n.w, Math.max(0, ports - 1) * 4 + 5);
  });
  for (const list of bundles.values()) {
    if (list.length < 2) continue;
    const gap = Math.max(4, ...list.map((e) => e.text.width + 4));
    for (const i of [list[0].src, list[0].dst]) {
      if (!nodes[i].isGroup) nodes[i].w = Math.max(nodes[i].w, (list.length - 1) * gap + 9);
    }
  }
  const edges: GraphEdge[] = drawn.map((e) => ({ src: e.src, dst: e.dst, labelW: e.text.width, labelH: e.text.height }));
  const envelopes = nodes.map((n, i) => n.isGroup ? n : { ...n, w: n.w + 6, h: n.h + 6 + loopPad[i] });
  const layout = layoutGraph(envelopes, edges, flow, { nodeSep: 5 + spacing, rankSep: 2 + spacing, edgeSep: 3 });
  layout.nodes = layout.nodes.map((r, i) => ({
    x: r.x + 3, y: r.y + 3 + (nodes[i].isGroup ? 0 : loopPad[i]),
    w: Math.max(4, r.w - 6), h: nodes[i].isGroup ? Math.max(3, r.h - 6) : views[i].h,
  }));
  const neighbors = nodes.map((_, i) => new Set(drawn.filter((e) => e.src !== e.dst && (e.src === i || e.dst === i)).map((e) => e.src === i ? e.dst : e.src)));
  for (const list of bundles.values()) {
    if (list.length < 2) continue;
    let hub = list[0].src;
    let leaf = list[0].dst;
    if (neighbors[leaf].size !== 1) [hub, leaf] = [leaf, hub];
    if (neighbors[leaf].size !== 1 || nodes[leaf].isGroup || nodes[hub].isGroup) continue;
    const a = layout.nodes[hub];
    const b = layout.nodes[leaf];
    if (a.y + a.h + 3 >= b.y && b.y + b.h + 3 >= a.y) continue;
    const targetX = Math.round(a.x + (a.w - b.w) / 2);
    const moved = { ...b, x: targetX };
    if (layout.nodes.some((r, i) => i !== leaf && !nodes[i].isGroup && moved.x < r.x + r.w + 2 && r.x < moved.x + moved.w + 2 && moved.y < r.y + r.h + 1 && r.y < moved.y + moved.h + 1)) continue;
    b.x = targetX;
    if ((nodes[leaf].parent ?? -1) < 0) {
      let outer = hub;
      for (let parent = nodes[outer].parent ?? -1; parent >= 0; parent = nodes[outer].parent ?? -1) outer = parent;
      const boundary = layout.nodes[outer];
      const y = b.y > a.y ? Math.max(boundary.y + boundary.h + 5, a.y + a.h + 8) : Math.min(boundary.y - b.h - 5, a.y - b.h - 8);
      if (!layout.nodes.some((r, i) => i !== leaf && y < r.y + r.h + 1 && r.y < y + b.h + 1 && b.x < r.x + r.w + 2 && r.x < b.x + b.w + 2)) b.y = y;
    }
    // Keep a single child beside the parallel corridor instead of directly in its path.
    const gap = Math.max(4, ...list.map((e) => e.text.width + 4));
    const left = a.x + (a.w - 1) / 2 - (list.length - 1) * gap / 2;
    nodes.forEach((n, i) => {
      if (n.isGroup || i === leaf || neighbors[i].size !== 1 || !neighbors[i].has(hub) || n.parent !== nodes[hub].parent) return;
      const r = layout.nodes[i];
      if (r.y > a.y && r.y < b.y) r.x = Math.floor(left - 3 - r.w);
    });
  }
  const groups = graph.nodes.map((n, i) => n.isGroup ? i : -1).filter((i) => i >= 0);
  for (const i of [...groups].reverse()) {
    const r = layout.nodes[i];
    nodes.forEach((n, j) => {
      if (n.parent !== i) return;
      const child = layout.nodes[j];
      const left = Math.min(r.x, child.x - 3);
      const top = Math.min(r.y, child.y - loopPad[j] - 2);
      r.w = Math.max(r.x + r.w, child.x + child.w + 3) - left;
      r.h = Math.max(r.y + r.h, child.y + child.h + 2) - top;
      r.x = left;
      r.y = top;
    });
  }
  if (ctx.compact) {
    const bottom = Math.max(0, ...layout.nodes.map((r) => r.y + r.h));
    let y = bottom + 2;
    nodes.forEach((n, i) => {
      if (n.isGroup || (n.parent ?? -1) >= 0 || neighbors[i].size || loopPad[i]) return;
      layout.nodes[i].x = Math.min(...layout.nodes.map((r) => r.x));
      layout.nodes[i].y = y;
      y += layout.nodes[i].h + 2;
    });
  }
  const routeNodes = layout.nodes.map((r, i) => ({ ...r, group: !!nodes[i].isGroup, titleWidth: views[i].title.width }));
  const order = drawn.map((_, i) => i).sort((a, b) => Number(drawn[b].src === drawn[b].dst) - Number(drawn[a].src === drawn[a].dst));
  const routed = routeEr(routeNodes, order.map((i) => drawn[i]));
  if (!routed) return draw(model, ctx, flow, spacing + 2);
  const canvas = new Canvas();
  for (const i of groups) {
    const r = layout.nodes[i];
    canvas.box(r.x, r.y, r.w, r.h, { fill: false });
  }
  routed.forEach((r, k) => canvas.path(r.points, { dashed: drawn[order[k]].pattern === 'dashed' }));
  nodes.forEach((n, i) => { if (!n.isGroup) entity(canvas, layout.nodes[i], views[i]); });
  routed.forEach((route, k) => {
    const e = drawn[order[k]];
    const pts = route.points.map((p) => [...p] as Point);
    const border = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const end: Point = [border[0] + Math.sign(prev[0] - border[0]), border[1] + Math.sign(prev[1] - border[1])];
    finishEdge(canvas, [...pts.slice(0, -1), end], { head: 'none', dashed: e.pattern === 'dashed' });
    cardinality(canvas, pts[0], pts[1], e.arrowTypeStart);
    cardinality(canvas, border, prev, e.arrowTypeEnd);
    if (route.label) {
      const [x, y] = route.label;
      canvas.clear(x - 1, y, e.text.width + 2, e.text.height);
      e.text.lines.forEach((line, j) => canvas.textIn(x, y + j, e.text.width, line, 'center', { role: 'label' }));
    }
  });
  for (const i of groups) canvas.text(layout.nodes[i].x + 2, layout.nodes[i].y, ` ${views[i].title.lines.join(' ')} `, { role: 'title' });
  return canvas;
}

export const er: AsciiDiagram<ErModel> = {
  type: 'er',
  render(model, ctx) {
    const flow = direction(model.direction);
    if (!ctx.compact) return draw(model, ctx, flow);
    const candidates = [flow, 'TB', 'LR'] as Dir[];
    let best: Canvas | undefined;
    for (const dir of new Set(candidates)) {
      const canvas = draw(model, ctx, dir);
      if (!best || (canvas.bounds()?.w ?? 0) < (best.bounds()?.w ?? 0)) best = canvas;
      if ((canvas.bounds()?.w ?? 0) <= ctx.maxWidth) return canvas;
    }
    return best!;
  },
};

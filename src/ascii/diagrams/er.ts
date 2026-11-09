import { direction } from '../../layout/compound.js';
import { parseGenericTypes } from '../../diagrams/common/generics.js';
import { buildErGraph, type ErGraphNode } from '../../diagrams/er/graph.js';
import type { ErModel } from '../../diagrams/er/types.js';
import { Canvas, type Rect } from '../canvas/canvas.js';
import { Arm } from '../canvas/glyphs.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { finishEdge, placeLabel } from '../draw/edges.js';
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

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
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
    minW: n.isGroup ? views[i].title.width * 2 + 18 : undefined,
  }));
  const edges: GraphEdge[] = [];
  const drawn = graph.edges.flatMap((e) => {
    const src = index.get(e.start);
    const dst = index.get(e.end);
    if (src === undefined || dst === undefined) return [];
    const caption = text(e.label, ctx.compact ? 12 : 18);
    edges.push({ src, dst, labelW: caption.width, labelH: caption.height });
    return [{ ...e, src, dst, caption }];
  });
  const loops = new Map<number, number>();
  drawn.forEach((e) => {
    if (e.src !== e.dst) return;
    const count = (loops.get(e.src) ?? 0) + Math.max(6, e.caption.height + 3);
    loops.set(e.src, count);
    nodes[e.src].extraRight = Math.max(nodes[e.src].extraRight ?? 0, e.caption.width + 10);
  });
  nodes.forEach((n, i) => {
    const ports = drawn.filter((e) => e.src !== e.dst && (e.src === i || e.dst === i)).length;
    if (n.isGroup) {
      n.minW = Math.max(n.minW ?? 0, views[i].title.width * 2 + 18 + ports * 4);
      return;
    }
    if (flow === 'LR' || flow === 'RL') n.h = Math.max(n.h, Math.max(0, ports - 1) * 4 + 3);
    else n.w = Math.max(n.w, Math.max(0, ports - 1) * 4 + 5);
    n.h = Math.max(n.h, (loops.get(i) ?? 0) + 3);
  });
  // Layout the clearance envelopes, then bring the ports back to the visible borders.
  const envelopes = nodes.map((n) => n.isGroup ? n : { ...n, w: n.w + 6, h: n.h + 6 });
  const layout = layoutGraph(envelopes, edges, flow, { nodeSep: (ctx.compact ? 3 : 5) + spacing, rankSep: 2 + spacing, edgeSep: 3 });
  layout.nodes = layout.nodes.map((r) => ({ x: r.x + 3, y: r.y + 3, w: Math.max(4, r.w - 6), h: Math.max(3, r.h - 6) }));
  const ports = new Map<string, { edge: number; start: boolean; coordinate: number }[]>();
  layout.edges.forEach((e, k) => {
    if (e.points.length < 2) return;
    for (const start of [true, false]) {
      const p = e.points[start ? 0 : e.points.length - 1];
      const q = e.points[start ? 1 : e.points.length - 2];
      const vertical = p[0] === q[0];
      const side = vertical ? (q[1] > p[1] ? 'bottom' : 'top') : (q[0] > p[0] ? 'right' : 'left');
      const key = `${start ? edges[k].src : edges[k].dst}:${side}`;
      const list = ports.get(key) ?? [];
      list.push({ edge: k, start, coordinate: p[vertical ? 0 : 1] });
      ports.set(key, list);
    }
  });
  const portAt = new Map<string, number>();
  for (const [key, list] of ports) {
    const [node, side] = key.split(':');
    const r = layout.nodes[Number(node)];
    if (list.length < 2 && !(nodes[Number(node)].isGroup && side === 'top')) continue;
    const vertical = side === 'top' || side === 'bottom';
    const center = vertical ? r.x + (r.w - 1) / 2 : r.y + (r.h - 1) / 2;
    list.sort((a, b) => a.coordinate - b.coordinate || a.edge - b.edge);
    list.forEach((port, j) => portAt.set(`${port.edge}:${port.start}`, nodes[Number(node)].isGroup && side === 'top' ? r.x + r.w - 3 - (list.length - 1 - j) * 4 : Math.round(center + (j - (list.length - 1) / 2) * 4)));
  }
  layout.edges.forEach((e, k) => {
    if (e.points.length < 2) return;
    const from = layout.nodes[edges[k].src];
    const to = layout.nodes[edges[k].dst];
    const pts = e.points;
    const first = pts[0];
    const next = pts[1];
    const end = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const firstVertical = first[0] === next[0];
    const lastVertical = end[0] === prev[0];
    const out = firstVertical ? Math.sign(next[1] - first[1]) : Math.sign(next[0] - first[0]);
    const into = lastVertical ? Math.sign(end[1] - prev[1]) : Math.sign(end[0] - prev[0]);
    const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
    if (firstVertical) {
      first[0] = clamp(portAt.get(`${k}:true`) ?? first[0], from.x + 1, from.x + from.w - 2);
      first[1] = out > 0 ? from.y + from.h - 1 : from.y;
    } else {
      first[1] = clamp(portAt.get(`${k}:true`) ?? first[1], from.y + 1, from.y + from.h - 2);
      first[0] = out > 0 ? from.x + from.w - 1 : from.x;
    }
    if (lastVertical) {
      end[0] = clamp(portAt.get(`${k}:false`) ?? end[0], to.x + 1, to.x + to.w - 2);
      end[1] = into > 0 ? to.y - 1 : to.y + to.h;
    } else {
      end[1] = clamp(portAt.get(`${k}:false`) ?? end[1], to.y + 1, to.y + to.h - 2);
      end[0] = into > 0 ? to.x - 1 : to.x + to.w;
    }
    if (pts.length === 2) {
      if (first[0] !== end[0] && first[1] !== end[1]) {
        const mid = firstVertical ? Math.round((first[1] + end[1]) / 2) : Math.round((first[0] + end[0]) / 2);
        pts.splice(1, 0, firstVertical ? [first[0], mid] : [mid, first[1]], firstVertical ? [end[0], mid] : [mid, end[1]]);
      }
    } else {
      if (firstVertical) next[0] = first[0]; else next[1] = first[1];
      if (lastVertical) prev[0] = end[0]; else prev[1] = end[1];
    }
  });
  const canvas = new Canvas();
  const groups = graph.nodes.map((n, i) => n.isGroup ? i : -1).filter((i) => i >= 0);
  for (const i of groups) {
    const r = layout.nodes[i];
    canvas.box(r.x, r.y, r.w, r.h, { fill: false });
  }
  const loopAt = new Map<number, number>();
  drawn.forEach((e, k) => {
    if (!layout.edges[k].loop) return;
    const offset = loopAt.get(e.src) ?? 0;
    const band = Math.max(6, e.caption.height + 3);
    loopAt.set(e.src, offset + band);
    const r = layout.nodes[e.src];
    const right = r.x + r.w - 1;
    const y = r.y + 1 + offset;
    const out = right + e.caption.width + 8;
    layout.edges[k].points = [[right, y], [out, y], [out, y + band - 3], [right + 1, y + band - 3]];
    layout.edges[k].label = [right + 4, y];
  });
  drawn.forEach((e, k) => canvas.path(layout.edges[k].points, { dashed: e.pattern === 'dashed' }));
  nodes.forEach((n, i) => { if (!n.isGroup) entity(canvas, layout.nodes[i], views[i]); });
  const blocked: Rect[] = [];
  drawn.forEach((e, k) => {
    const pts = layout.edges[k].points;
    if (pts.length < 2) return;
    finishEdge(canvas, pts, { head: 'none', dashed: e.pattern === 'dashed' });
    blocked.push(cardinality(canvas, pts[0], pts[1], e.arrowTypeStart));
    const end = pts[pts.length - 1];
    const before = pts[pts.length - 2];
    const border: Point = [end[0] + Math.sign(end[0] - before[0]), end[1] + Math.sign(end[1] - before[1])];
    blocked.push(cardinality(canvas, border, before, e.arrowTypeEnd));
  });
  for (const i of groups) {
    const r = layout.nodes[i];
    const title = ` ${views[i].title.lines.join(' ')} `;
    let x = r.x + 2;
    for (; x + displayWidth(title) < r.x + r.w - 1; x++) {
      if (Array.from({ length: displayWidth(title) + 2 }, (_, k) => canvas.armsAt(x + k - 1, r.y)).every((a) => !(a & (Arm.Up | Arm.Down)))) break;
    }
    canvas.text(x, r.y, title, { role: 'title' });
  }
  const segments = layout.edges.map((e) => e.points.slice(1).map((b, j) => {
    const a = e.points[j];
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]) + 1, h: Math.abs(a[1] - b[1]) + 1 };
  }));
  let needsSpace = false;
  drawn.forEach((e, k) => {
    const laid = layout.edges[k];
    const t = e.caption;
    if (!laid.label || !t.height) return;
    const near: Point = [laid.label[0] + (t.width >> 1), laid.label[1] + (t.height >> 1)];
    const preferred = placeLabel(laid.points, near, t.width, t.height);
    const candidates: Point[] = [preferred];
    for (let j = 1; j < laid.points.length; j++) {
      const a = laid.points[j - 1];
      const b = laid.points[j];
      const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
      for (let step = 3; step < len - 2; step++) {
        const x = a[0] + Math.sign(b[0] - a[0]) * step;
        const y = a[1] + Math.sign(b[1] - a[1]) * step;
        candidates.push([x - (t.width >> 1), y - (t.height >> 1)]);
        if (a[0] === b[0]) candidates.push([x + 2, y - (t.height >> 1)], [x - t.width - 1, y - (t.height >> 1)]);
        else candidates.push([x - (t.width >> 1), y - t.height], [x - (t.width >> 1), y + 1]);
      }
    }
    const safe = ([x, y]: Point): boolean => {
      const area = { x: x - 1, y, w: t.width + 2, h: t.height };
      if (blocked.some((r) => intersects(area, r))) return false;
      if (segments.some((list, j) => j !== k && list.some((r) => intersects(area, r)))) return false;
      return layout.nodes.every((r, i) => nodes[i].isGroup
        ? !intersects(area, { ...r, h: 1 }) && !intersects(area, { ...r, y: r.y + r.h - 1, h: 1 }) && !intersects(area, { ...r, w: 1 }) && !intersects(area, { ...r, x: r.x + r.w - 1, w: 1 })
        : !intersects(area, r));
    };
    const at = candidates.find(safe);
    if (!at) { needsSpace = true; return; }
    canvas.clear(at[0] - 1, at[1], t.width + 2, t.height);
    t.lines.forEach((line, j) => canvas.textIn(at[0], at[1] + j, t.width, line, 'center', { role: 'label' }));
    blocked.push({ x: at[0] - 1, y: at[1], w: t.width + 2, h: t.height });
  });
  return needsSpace ? draw(model, ctx, flow, spacing + 2) : canvas;
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

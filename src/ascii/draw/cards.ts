import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext } from '../core.js';
import { drawEdgeLine, finishEdge, placeLabel, type EdgeStyle } from './edges.js';
import { layoutGraph, type Dir, type GraphNode, type Point } from '../layout/graph.js';
import { displayWidth, wrap } from '../text/width.js';
import { label, type TextBlock } from '../text/label.js';

export interface Card {
  sections: TextBlock[];
  parent?: number;
  group?: boolean;
  form?: 'rect' | 'database' | 'queue' | 'person';
}
export interface CardLink {
  src: number;
  dst: number;
  text: TextBlock;
  style: EdgeStyle;
  contains?: boolean;
}

export function cardText(text: string | undefined, ctx: AsciiContext, markdown = false): TextBlock {
  const width = ctx.compact ? 14 : 26;
  const block = label(text, { maxWidth: width, markdown });
  const lines = block.lines.flatMap((line) => wrap(line, width));
  return { lines, width: Math.max(0, ...lines.map(displayWidth)), height: lines.length };
}

export function drawCards(cards: Card[], links: CardLink[], dir: Dir, ctx: AsciiContext, stack = false): Canvas {
  const nodes: GraphNode[] = cards.map((c) => {
    const parts = c.sections.filter((s) => s.height > 0);
    const width = Math.max(1, ...parts.map((s) => s.width));
    return c.group
      ? { w: 0, h: 0, parent: c.parent, isGroup: true, minW: width + 8, padX: ctx.compact ? 1 : 3, padTop: parts.reduce((h, s) => h + s.height, 0) + 2, padBottom: 2 }
      : { w: width + (c.form === 'queue' ? 6 : 4), h: (c.form === 'database' || c.form === 'person' ? 1 : 0) + parts.reduce((h, s) => h + s.height, 0) + Math.max(0, parts.length - 1) + 2, parent: c.parent };
  });
  cards.forEach((_, i) => {
    const loops = links.filter((l) => l.src === i && l.dst === i);
    if (!loops.length) return;
    nodes[i].extraRight = Math.max(...loops.map((l) => l.text.width)) + 6;
    const loopHeight = loops.reduce((h, l) => h + Math.max(3, l.text.height + 2), 0);
    nodes[i].insetTop = loopHeight;
    nodes[i].h = Math.max(nodes[i].h, loopHeight + 4);
  });
  const edges = links.map((l) => ({ src: l.src, dst: l.dst, labelW: l.text.width + 2, labelH: l.text.height }));
  if (ctx.compact && stack) {
    const previous = new Map<number, number>();
    cards.forEach((c, i) => {
      const parent = c.parent ?? -1;
      const prev = previous.get(parent);
      if (prev !== undefined) edges.push({ src: prev, dst: i, labelW: 0, labelH: 0 });
      previous.set(parent, i);
    });
  }
  const layout = layoutGraph(nodes, edges, dir,
    { nodeSep: ctx.compact ? 2 : 5, rankSep: 5, edgeSep: 3 });
  const canvas = new Canvas();
  cards.forEach((c, i) => {
    if (!c.group) return;
    const r = layout.nodes[i];
    canvas.box(r.x, r.y, r.w, r.h, { fill: false });
  });
  const routes: Point[][] = layout.edges.slice(0, links.length).map((e, i) => {
    if (!e.loop) return e.points;
    const l = links[i];
    const r = layout.nodes[l.src];
    const offset = links.slice(0, i).filter((p) => p.src === l.src && p.dst === l.dst).reduce((h, p) => h + Math.max(3, p.text.height + 2), 0);
    const right = r.x + r.w - 1;
    const out = right + 3;
    const y = r.y + 1 + offset;
    const bottom = y + Math.max(2, l.text.height + 1);
    return [[right, y], [out, y], [out, bottom], [right + 1, bottom]];
  });
  // Incoming and outgoing edges share the same port pool.
  const ports = new Set<string>();
  routes.forEach((points, i) => {
    for (const source of [true, false]) {
      if (layout.edges[i].loop) continue;
      const end = source ? 0 : points.length - 1;
      const next = source ? 1 : points.length - 2;
      const a = points[end];
      const b = points[next];
      const r = layout.nodes[source ? links[i].src : links[i].dst];
      const vertical = a[0] === b[0];
      const axis = vertical ? 0 : 1;
      const fixed = vertical ? 1 : 0;
      const border = source ? a[fixed] : a[fixed] - Math.sign(b[fixed] - a[fixed]);
      const key = (v: number): string => `${source ? links[i].src : links[i].dst}:${vertical ? 'v' : 'h'}:${border}:${v}`;
      const low = vertical ? r.x + 1 : r.y + 1 + (nodes[source ? links[i].src : links[i].dst].insetTop ?? 0);
      const high = vertical ? r.x + r.w - 2 : r.y + r.h - 2;
      let value = a[axis];
      for (let offset = 0; ports.has(key(value)) && offset < high - low + 1; offset++) {
        const delta = Math.ceil((offset + 1) / 2) * (offset % 2 === 0 ? -1 : 1);
        const candidate = a[axis] + delta;
        if (candidate >= low && candidate <= high && !ports.has(key(candidate))) { value = candidate; break; }
      }
      ports.add(key(value));
      if (value !== a[axis] && points.length > 2) { a[axis] = value; b[axis] = value; }
    }
  });
  // Keep routes clear of the complete boundary heading, including wrapped metadata.
  const headings = cards.flatMap((c, i) => {
    if (!c.group) return [];
    const r = layout.nodes[i];
    return [{ x: r.x + 2, y: r.y - 1, w: Math.max(0, ...c.sections.map((s) => s.width)) + 4,
      h: c.sections.reduce((h, s) => h + s.height, 0) + 2 }];
  });
  const headingRoutes = routes.map((points) => points.map((p): Point => [...p]));
  routes.forEach((points, i) => {
    let path = points;
    for (const box of headings) {
      const crossing = headingRoutes.flatMap((route, j) => route.slice(1).flatMap((b, k) => {
        const a = route[k];
        return a[0] === b[0] && a[0] >= box.x && a[0] < box.x + box.w && Math.min(a[1], b[1]) <= box.y && Math.max(a[1], b[1]) >= box.y + box.h ? [{ index: j, x: a[0] }] : [];
      })).sort((a, b) => a.x - b.x || a.index - b.index);
      const lane = crossing.findIndex((c) => c.index === i);
      const out: Point[] = [path[0]];
      for (let k = 1; k < path.length; k++) {
        const a = path[k - 1];
        const b = path[k];
        const bottom = box.y + box.h;
        if (a[0] === b[0] && a[0] >= box.x && a[0] < box.x + box.w &&
            Math.min(a[1], b[1]) < bottom && Math.max(a[1], b[1]) > box.y) {
          const down = b[1] > a[1];
          const enter = down ? box.y : bottom;
          const leave = down ? bottom : box.y;
          if (Math.min(a[1], b[1]) <= box.y && Math.max(a[1], b[1]) >= bottom) {
            const x = lane === 0 ? box.x - 1 : box.x + box.w + Math.max(0, lane - 1) * 2;
            out.push([a[0], enter], [x, enter], [x, leave], [b[0], leave]);
          }
        }
        out.push(b);
      }
      path = out;
    }
    routes[i] = path;
  });
  const tracks = new Set<string>();
  const trackKeys = (a: Point, b: Point): string[] => {
    const dx = Math.sign(b[0] - a[0]);
    const dy = Math.sign(b[1] - a[1]);
    return Array.from({ length: Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) }, (_, n) =>
      `${Math.min(a[0] + n * dx, a[0] + (n + 1) * dx)},${Math.min(a[1] + n * dy, a[1] + (n + 1) * dy)},${dx === 0 ? 'v' : 'h'}`);
  };
  routes.forEach((points) => {
    for (let k = 1; k + 2 < points.length; k++) {
      const a = points[k];
      const b = points[k + 1];
      if (!trackKeys(a, b).some((key) => tracks.has(key))) continue;
      const axis = a[0] === b[0] ? 0 : 1;
      for (const delta of [-1, 1, -2, 2, -3, 3]) {
        const aa: Point = [...a];
        const bb: Point = [...b];
        aa[axis] += delta;
        bb[axis] += delta;
        const path = [points[k - 1], aa, bb, points[k + 2]];
        const keys = path.slice(1).flatMap((p, j) => trackKeys(path[j], p));
        if (keys.some((key) => tracks.has(key))) continue;
        const blocked = path.slice(1).some((p, j) => {
          const q = path[j];
          const box = { x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), w: Math.abs(p[0] - q[0]) + 1, h: Math.abs(p[1] - q[1]) + 1 };
          return headings.some((r) => box.x < r.x + r.w && box.x + box.w > r.x && box.y < r.y + r.h && box.y + box.h > r.y) || layout.nodes.some((r, n) => !cards[n].group && box.x < r.x + r.w - 1 && box.x + box.w > r.x + 1 && box.y < r.y + r.h - 1 && box.y + box.h > r.y + 1);
        });
        if (blocked) continue;
        points[k] = aa;
        points[k + 1] = bb;
        break;
      }
    }
    for (let k = 1; k < points.length; k++) for (const key of trackKeys(points[k - 1], points[k])) tracks.add(key);
  });
  links.forEach((l, i) => drawEdgeLine(canvas, routes[i], l.style));
  cards.forEach((c, i) => {
    const r = layout.nodes[i];
    const parts = c.sections.filter((s) => s.height > 0);
    if (!c.group) {
      canvas.box(r.x, r.y, r.w, r.h, { round: c.form === 'database' });
      if (c.form === 'database') canvas.segment(r.x, r.y + 1, r.x + r.w - 1, r.y + 1);
      if (c.form === 'person') canvas.textIn(r.x + 1, r.y + 1, r.w - 2, '○');
      if (c.form === 'queue') {
        canvas.segment(r.x + 1, r.y, r.x + 1, r.y + r.h - 1);
        canvas.segment(r.x + r.w - 2, r.y, r.x + r.w - 2, r.y + r.h - 1);
      }
    }
    const headingX = r.x + 3;
    let y = r.y + (c.group ? 0 : c.form === 'database' || c.form === 'person' ? 2 : 1);
    parts.forEach((part, j) => {
      if (j > 0 && !c.group) {
        canvas.segment(r.x, y, r.x + r.w - 1, y);
        y++;
      }
      part.lines.forEach((line) => {
        if (c.group && y === r.y) {
          canvas.text(headingX, y++, ` ${line} `, { role: 'title' });
        } else if (c.group) canvas.textIn(headingX + 1, y++, Math.max(0, ...parts.map((p) => p.width)), line);
        else canvas.textIn(r.x + 2, y++, r.w - 4, line);
      });
    });
  });
  links.forEach((l, i) => {
    finishEdge(canvas, routes[i], l.style);
    if (l.contains) {
      const [a, b] = routes[i];
      if (a && b) canvas.put(a[0] + Math.sign(b[0] - a[0]), a[1] + Math.sign(b[1] - a[1]), '⊕', { role: 'accent' });
    }
  });
  const occupied: Set<string>[] = routes.map((points) => {
    const cells = new Set<string>();
    for (let k = 1; k < points.length; k++) {
      const a = points[k - 1];
      const b = points[k];
      const dx = Math.sign(b[0] - a[0]);
      const dy = Math.sign(b[1] - a[1]);
      const distance = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
      for (let j = 0; j <= distance; j++) cells.add(`${a[0] + j * dx},${a[1] + j * dy}`);
    }
    return cells;
  });
  const labels: { x: number; y: number; w: number; h: number }[] = [];
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  links.forEach((l, i) => {
    if (!l.text.height) return;
    const e = layout.edges[i];
    const points = routes[i];
    const preferred: Point = e.loop ? [points[1][0] + 2, points[1][1]]
      : placeLabel(points, e.label ? [e.label[0] + (l.text.width >> 1), e.label[1] + (l.text.height >> 1)] : points[0], l.text.width, l.text.height);
    const candidates: Point[] = [preferred];
    for (let k = 1; k < points.length; k++) {
      const a = points[k - 1];
      const b = points[k];
      if (a[0] === b[0]) {
        for (let y = Math.min(a[1], b[1]) + 2; y + l.text.height <= Math.max(a[1], b[1]) - 1; y++) {
          candidates.push([a[0] - (l.text.width >> 1), y], [a[0] + 2, y], [a[0] - l.text.width - 1, y]);
        }
      } else {
        for (let x = Math.min(a[0], b[0]) + 2; x + l.text.width < Math.max(a[0], b[0]) - 1; x++) {
          candidates.push([x, a[1] - (l.text.height >> 1)], [x, a[1] - l.text.height]);
        }
      }
    }
    candidates.sort((a, b) => Math.abs(a[0] - preferred[0]) + 2 * Math.abs(a[1] - preferred[1]) - Math.abs(b[0] - preferred[0]) - 2 * Math.abs(b[1] - preferred[1]));
    const at = candidates.find(([x, y]) => {
      const box = { x: x - 1, y, w: l.text.width + 2, h: l.text.height };
      if (labels.some((r) => overlaps(box, r)) || headings.some((r) => overlaps(box, r))) return false;
      if (layout.nodes.some((r, j) => !cards[j].group && overlaps(box, r))) return false;
      // A label can interrupt its own line, but must preserve every other route and endpoint.
      for (let yy = y; yy < y + box.h; yy++) for (let xx = box.x; xx < box.x + box.w; xx++) {
        if (occupied.some((cells, j) => j !== i && cells.has(`${xx},${yy}`))) return false;
        const ch = canvas.charAt(xx, yy);
        if (ch !== undefined && ch !== ' ') return false;
        if (cards.some((c, j) => c.group && (yy === layout.nodes[j].y || yy === layout.nodes[j].y + layout.nodes[j].h - 1) && xx >= layout.nodes[j].x && xx < layout.nodes[j].x + layout.nodes[j].w)) return false;
      }
      return true;
    }) ?? preferred;
    labels.push({ x: at[0] - 1, y: at[1], w: l.text.width + 2, h: l.text.height });
    canvas.clear(at[0] - 1, at[1], l.text.width + 2, l.text.height);
    l.text.lines.forEach((line, j) => canvas.textIn(at[0], at[1] + j, l.text.width, line, 'center', { role: 'label' }));
  });
  return canvas;
}

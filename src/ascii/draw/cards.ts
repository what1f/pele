import { Canvas, type Rect } from '../canvas/canvas.js';
import type { AsciiContext } from '../core.js';
import { drawEdgeLine, finishEdge, placeLabel, type EdgeStyle } from './edges.js';
import { layoutGraph, type Dir, type GraphNode, type Point } from '../layout/graph.js';
import { displayWidth, wrap } from '../text/width.js';
import { label, type TextBlock } from '../text/label.js';

export interface Card {
  sections: TextBlock[];
  parent?: number;
  group?: boolean;
  minWidth?: number;
  headingSource?: TextBlock[];
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

export function drawCards(cards: Card[], links: CardLink[], dir: Dir, ctx: AsciiContext, stack = false, rankGap = ctx.compact && stack ? 7 : 5): Canvas {
  const nodes: GraphNode[] = cards.map((c) => {
    const parts = c.sections.filter((s) => s.height > 0);
    const width = Math.max(1, ...parts.map((s) => s.width));
    return c.group
      ? { w: 0, h: 0, parent: c.parent, isGroup: true, minW: Math.max(width + 10, c.minWidth ?? 0), padX: ctx.compact ? 1 : 3, padTop: parts.reduce((h, s) => h + s.height, 0) + 2, padBottom: 2 }
      : { w: width + (c.form === 'queue' ? 6 : 4), h: (c.form === 'database' || c.form === 'person' ? 1 : 0) + parts.reduce((h, s) => h + s.height, 0) + Math.max(0, parts.length - 1) + 2, parent: c.parent };
  });
  cards.forEach((_, i) => {
    const loops = links.filter((l) => l.src === i && l.dst === i);
    if (!loops.length) return;
    nodes[i].extraRight = Math.max(...loops.map((l) => l.text.width)) + 6;
    const loopHeight = loops.reduce((h, l) => h + Math.max(5, l.text.height + 4), 0);
    nodes[i].insetTop = loopHeight + 2;
    nodes[i].h = Math.max(nodes[i].h, loopHeight + 8);
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
    { nodeSep: ctx.compact ? 2 : 5, rankSep: rankGap, edgeSep: 3 });
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
    const offset = links.slice(0, i).filter((p) => p.src === l.src && p.dst === l.dst).reduce((h, p) => h + Math.max(5, p.text.height + 4), 0);
    const right = r.x + r.w - 1;
    const out = right + 3;
    const y = r.y + 1 + offset;
    const bottom = y + Math.max(2, l.text.height + 1);
    return [[right, y], [out, y], [out, bottom], [right + 1, bottom]];
  });
  // Incoming and outgoing edges share the same port pool.
  const ports = new Map<string, number[]>();
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
      const key = `${source ? links[i].src : links[i].dst}:${vertical ? 'v' : 'h'}:${border}`;
      const taken = ports.get(key) ?? [];
      const free = (value: number): boolean => taken.every((p) => Math.abs(value - p) >= 2);
      const margin = cards[source ? links[i].src : links[i].dst].group ? 3 : 1;
      const low = vertical ? r.x + margin : r.y + 1 + (nodes[source ? links[i].src : links[i].dst].insetTop ?? 0);
      const high = vertical ? r.x + r.w - 1 - margin : r.y + r.h - 2;
      let value = cards[source ? links[i].src : links[i].dst].group && vertical ? high : a[axis];
      for (let offset = 0; !free(value) && offset < high - low + 1; offset++) {
        const delta = Math.ceil((offset + 1) / 2) * (offset % 2 === 0 ? -1 : 1);
        const candidate = (cards[source ? links[i].src : links[i].dst].group && vertical ? high : a[axis]) + delta;
        if (candidate >= low && candidate <= high && free(candidate)) { value = candidate; break; }
      }
      taken.push(value);
      ports.set(key, taken);
      if (value !== a[axis] && points.length > 2) { a[axis] = value; b[axis] = value; }
    }
  });
  // Align nearly coincident ports instead of introducing a one-cell dogleg.
  routes.forEach((points, i) => {
    if (points.length > 4 || points.length < 2 || layout.edges[i].loop) return;
    const a = points[0];
    const b = points[points.length - 1];
    const src = layout.nodes[links[i].src];
    const dst = layout.nodes[links[i].dst];
    const vertical = a[0] === points[1][0] && b[0] === points[points.length - 2][0];
    if (!vertical || Math.abs(a[0] - b[0]) > 2) return;
    const x = a[0];
    if (x <= dst.x || x >= dst.x + dst.w - 1 || x <= src.x || x >= src.x + src.w - 1) return;
    if (routes.some((route, j) => j !== i && route.some((p) => Math.abs(p[0] - x) < 2 && (p[1] === a[1] || Math.abs(p[1] - b[1]) <= 1)))) return;
    if (layout.nodes.some((r, n) => n !== links[i].src && n !== links[i].dst && !cards[n].group && x >= r.x && x < r.x + r.w && Math.min(a[1], b[1]) < r.y + r.h && Math.max(a[1], b[1]) > r.y)) return;
    routes[i] = [[x, a[1]], [x, b[1]]];
  });
  const simplify = (points: Point[]): Point[] => {
    const clean: Point[] = [];
    for (const p of points) {
      const last = clean[clean.length - 1];
      if (last && p[0] === last[0] && p[1] === last[1]) continue;
      if (clean.length >= 2) {
        const before = clean[clean.length - 2];
        if ((p[0] === last[0] && p[0] === before[0]) || (p[1] === last[1] && p[1] === before[1])) clean.pop();
      }
      clean.push([...p]);
    }
    return clean;
  };
  routes.forEach((points, i) => { routes[i] = simplify(points); });
  const groups = layout.nodes.filter((_, i) => cards[i].group);
  const nearFrame = (a: Point, b: Point): boolean => groups.some((r) => {
    if (a[0] === b[0]) return Math.max(a[1], b[1]) > r.y && Math.min(a[1], b[1]) < r.y + r.h - 1 &&
      (Math.abs(a[0] - r.x) < 3 || Math.abs(a[0] - (r.x + r.w - 1)) < 3);
    return Math.max(a[0], b[0]) > r.x && Math.min(a[0], b[0]) < r.x + r.w - 1 &&
      (Math.abs(a[1] - r.y) < 3 || Math.abs(a[1] - (r.y + r.h - 1)) < 3);
  });
  const terminalFits = (p: Point, q: Point, node: number, source: boolean): boolean => {
    const r = layout.nodes[node];
    const x = p[0] + (source ? 0 : Math.sign(p[0] - q[0]));
    const y = p[1] + (source ? 0 : Math.sign(p[1] - q[1]));
    return ((x === r.x || x === r.x + r.w - 1) && y > r.y && y < r.y + r.h - 1) ||
      ((y === r.y || y === r.y + r.h - 1) && x > r.x && x < r.x + r.w - 1);
  };
  for (let sweep = 0; sweep < 4; sweep++) {
    routes.forEach((points, i) => { routes[i] = simplify(points); });
    routes.forEach((points, i) => {
      for (let k = 0; k + 1 < points.length; k++) {
        if (!nearFrame(points[k], points[k + 1])) continue;
        const axis = points[k][0] === points[k + 1][0] ? 0 : 1;
        for (let distance = 1; distance <= 24; distance++) {
          let moved = false;
          for (const sign of [-1, 1]) {
            const candidate = points.map((p): Point => [...p]);
            candidate[k][axis] += distance * sign;
            candidate[k + 1][axis] += distance * sign;
            if (!terminalFits(candidate[0], candidate[1], links[i].src, true) || !terminalFits(candidate[candidate.length - 1], candidate[candidate.length - 2], links[i].dst, false)) continue;
            const count = (path: Point[]): number => path.slice(1).filter((p, n) => nearFrame(path[n], p)).length;
            if (count(candidate) >= count(points)) continue;
            const blocked = candidate.slice(1).some((b, n) => {
              const a = candidate[n];
              return layout.nodes.some((r, j) => !cards[j].group &&
                Math.min(a[0], b[0]) < r.x + r.w - 1 && Math.max(a[0], b[0]) > r.x &&
                Math.min(a[1], b[1]) < r.y + r.h - 1 && Math.max(a[1], b[1]) > r.y);
            });
            if (blocked) continue;
            points[k][axis] = candidate[k][axis];
            points[k + 1][axis] = candidate[k + 1][axis];
            moved = true;
            break;
          }
          if (moved) break;
        }
      }
    });
  }
  routes.forEach((points, i) => { routes[i] = simplify(points); });
  const tracks = new Set<string>();
  const trackKeys = (a: Point, b: Point): string[] => {
    const dx = Math.sign(b[0] - a[0]);
    const dy = Math.sign(b[1] - a[1]);
    return Array.from({ length: Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) }, (_, n) =>
      `${Math.min(a[0] + n * dx, a[0] + (n + 1) * dx)},${Math.min(a[1] + n * dy, a[1] + (n + 1) * dy)},${dx === 0 ? 'v' : 'h'}`);
  };
  routes.forEach((points, i) => {
    const conflicts = (path: Point[]): number => path.slice(1).reduce((count, b, n) => count + trackKeys(path[n], b).filter((key) => tracks.has(key)).length, 0);
    for (let k = 0; k + 1 < points.length; k++) {
      const a = points[k];
      const b = points[k + 1];
      if (!trackKeys(a, b).some((key) => tracks.has(key))) continue;
      const axis = a[0] === b[0] ? 0 : 1;
      for (let distance = 1; distance <= 16; distance++) {
        let moved = false;
        for (const sign of [-1, 1]) {
          const candidate = points.map((p): Point => [...p]);
          candidate[k][axis] += distance * sign;
          candidate[k + 1][axis] += distance * sign;
          if (conflicts(candidate) >= conflicts(points)) continue;
          if (!terminalFits(candidate[0], candidate[1], links[i].src, true) || !terminalFits(candidate[candidate.length - 1], candidate[candidate.length - 2], links[i].dst, false)) continue;
          const blocked = candidate.slice(1).some((p, j) => {
            const q = candidate[j];
            if (nearFrame(p, q)) return true;
            return layout.nodes.some((r, n) => !cards[n].group && Math.min(p[0], q[0]) < r.x + r.w - 1 && Math.max(p[0], q[0]) > r.x && Math.min(p[1], q[1]) < r.y + r.h - 1 && Math.max(p[1], q[1]) > r.y);
          });
          if (blocked) continue;
          points[k][axis] = candidate[k][axis];
          points[k + 1][axis] = candidate[k + 1][axis];
          moved = true;
          break;
        }
        if (moved) break;
      }
    }
    routes[i] = simplify(points);
    for (let k = 1; k < points.length; k++) for (const key of trackKeys(points[k - 1], points[k])) tracks.add(key);
  });
  const headings: Rect[] = [];
  const headingX = new Map<number, number>();
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card.group) continue;
    const r = layout.nodes[i];
    const width = Math.max(0, ...card.sections.map((s) => s.width));
    const height = card.sections.reduce((h, s) => h + s.height, 0);
    let at: number | undefined;
    for (let x = r.x + 2; x + width + 2 <= r.x + r.w - 2; x++) {
      const blocked = routes.some((route) => route.slice(1).some((b, k) => {
        const a = route[k];
        return Math.max(a[0], b[0]) >= x - 1 && Math.min(a[0], b[0]) <= x + width + 2 &&
          Math.max(a[1], b[1]) >= r.y - 1 && Math.min(a[1], b[1]) <= r.y + height;
      }));
      if (!blocked) { at = x; break; }
    }
    if (at === undefined) {
      const minimum = ctx.compact ? 8 : 12;
      const cap = Math.max(minimum, width - 2);
      // Rewrap the original heading so repeated passes do not fragment words.
      const narrowed = cards.map((c, n) => n !== i ? c : { ...c, minWidth: width <= minimum ? r.w + 8 : c.minWidth, headingSource: c.headingSource ?? c.sections, sections: (c.headingSource ?? c.sections).map((section) => {
        const lines = section.lines.flatMap((line) => wrap(line, cap));
        return { lines, width: Math.max(0, ...lines.map(displayWidth)), height: lines.length };
      }) });
      return drawCards(narrowed, links, dir, ctx, stack, rankGap);
    }
    headingX.set(i, at);
    headings.push({ x: at - 1, y: r.y - 1, w: width + 4, h: height + 2 });
  }
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
    const titleX = headingX.get(i) ?? r.x + 2;
    let y = r.y + (c.group ? 0 : c.form === 'database' || c.form === 'person' ? 2 : 1);
    parts.forEach((part, j) => {
      if (j > 0 && !c.group) {
        canvas.segment(r.x, y, r.x + r.w - 1, y);
        y++;
      }
      part.lines.forEach((line) => {
        if (c.group && y === r.y) {
          canvas.text(titleX, y++, ` ${line} `, { role: 'title' });
        } else if (c.group) canvas.textIn(titleX + 1, y++, Math.max(0, ...parts.map((p) => p.width)), line);
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
  for (let i = 0; i < links.length; i++) {
    const l = links[i];
    if (!l.text.height) continue;
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
    });
    if (!at) return drawCards(cards, links, dir, ctx, stack, rankGap + 2);
    const position = at;
    labels.push({ x: position[0] - 1, y: position[1], w: l.text.width + 2, h: l.text.height });
    canvas.clear(position[0] - 1, position[1], l.text.width + 2, l.text.height);
    l.text.lines.forEach((line, j) => canvas.textIn(position[0], position[1] + j, l.text.width, line, 'center', { role: 'label' }));
  }
  return canvas;
}

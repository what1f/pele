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
  headRoom?: number;
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
  const width = ctx.compact ? 13 : 26;
  const block = label(text, { maxWidth: width, markdown });
  const lines = block.lines.flatMap((line) => wrap(line, width));
  return { lines, width: Math.max(0, ...lines.map(displayWidth)), height: lines.length };
}

export function drawCards(cards: Card[], links: CardLink[], dir: Dir, ctx: AsciiContext, stack = false, rankGap = ctx.compact && stack ? 7 : 5): Canvas {
  const nodes: GraphNode[] = cards.map((c) => {
    const parts = c.sections.filter((s) => s.height > 0);
    const width = Math.max(1, ...parts.map((s) => s.width));
    return c.group
      ? { w: 0, h: 0, parent: c.parent, isGroup: true, minW: Math.max(width + 8, c.minWidth ?? 0), padX: ctx.compact ? 1 : 3, padTop: parts.reduce((h, s) => h + s.height, 0) + 2 + (c.headRoom ?? 0), padBottom: 2 }
      : { w: width + (c.form === 'queue' ? 6 : 4), h: (c.form === 'database' || c.form === 'person' ? 1 : 0) + parts.reduce((h, s) => h + s.height, 0) + Math.max(0, parts.length - 1) + 2, parent: c.parent };
  });
  cards.forEach((_, i) => {
    const loops = links.filter((l) => l.src === i && l.dst === i);
    if (!loops.length) return;
    nodes[i].extraRight = Math.max(...loops.map((l) => l.text.width)) + 6 + 4 * (loops.length - 1);
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
    const nth = links.slice(0, i).filter((p) => p.src === l.src && p.dst === l.dst).length;
    const right = r.x + r.w - 1;
    if (nth % 2 === 0) {
      const out = right + 3 + Math.floor(nth / 2) * 4;
      return [[right, r.y + 1], [out, r.y + 1], [out, r.y + r.h - 2], [right + 1, r.y + r.h - 2]];
    }
    const x0 = r.x + r.w - 3;
    const x1 = r.x + Math.max(2, Math.floor(r.w / 3));
    const top = r.y - 5 - Math.floor(nth / 2) * 3;
    const out = right + 6 + Math.floor(nth / 2) * 4;
    return [[x0, r.y], [x0, r.y - 2], [out, r.y - 2], [out, top], [x1, top], [x1, r.y - 1]];

  });
  // Incoming and outgoing edges share the same port pool.
  const ports = new Map<string, number[]>();
  const endpoint = (points: Point[], source: boolean): Point => {
    if (source) return points[0];
    const end = points[points.length - 1];
    const before = points[points.length - 2];
    return [end[0] + Math.sign(end[0] - before[0]), end[1] + Math.sign(end[1] - before[1])];
  };
  const portsClear = (path: Point[], index: number, others = routes): boolean => [true, false].every((source) => {
    const p = endpoint(path, source);
    const node = source ? links[index].src : links[index].dst;
    return others.every((route, j) => j === index || [true, false].every((otherSource) => {
      if ((otherSource ? links[j].src : links[j].dst) !== node) return true;
      const q = endpoint(route, otherSource);
      return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) >= 2;
    }));
  });
  const hitsNode = (path: Point[], index: number): boolean => path.slice(1).some((b, k) => {
    const a = path[k];
    return layout.nodes.some((r, node) => {
      if (cards[node].group) return false;
      const left = Math.max(Math.min(a[0], b[0]), r.x);
      const right = Math.min(Math.max(a[0], b[0]), r.x + r.w - 1);
      const top = Math.max(Math.min(a[1], b[1]), r.y);
      const bottom = Math.min(Math.max(a[1], b[1]), r.y + r.h - 1);
      if (left > right || top > bottom) return false;
      if (left === right && top === bottom) {
        const src = path[0];
        if (node === links[index].src && left === src[0] && top === src[1]) return false;
        const dst = endpoint(path, false);
        if (node === links[index].dst && left === dst[0] && top === dst[1]) return false;
      }
      return true;
    });
  });
  routes.forEach((points, i) => {
    if (!layout.edges[i].loop) return;
    for (const source of [true, false]) {
      const p = endpoint(points, source);
      const q = source ? points[1] : points[points.length - 2];
      const vertical = p[0] === q[0];
      const key = `${links[i].src}:${vertical ? 'v' : 'h'}:${p[vertical ? 1 : 0]}`;
      ports.set(key, [...(ports.get(key) ?? []), p[vertical ? 0 : 1]]);
    }
  });
  routes.forEach((points, i) => {
    if (layout.edges[i].loop) return;
    for (const source of [true, false]) {
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
      const free = (value: number): boolean => taken.every((p) => Math.abs(value - p) >= 3);
      const margin = cards[source ? links[i].src : links[i].dst].group ? 3 : 1;
      const low = vertical ? r.x + margin : r.y + 1 + (nodes[source ? links[i].src : links[i].dst].insetTop ?? 0);
      const high = vertical ? r.x + r.w - 1 - margin : r.y + r.h - 2;
      const node = source ? links[i].src : links[i].dst;
      const count = source ? 1 : links.filter((l) => l.dst === node && l.style.head !== 'none').length;
      const slots = count > 1 && !cards[node].group && vertical
        ? Array.from({ length: count }, (_, k) => low + Math.round((k + 1) * (high - low) / (count + 1))).filter(free)
        : [];
      const preferred = cards[node].group && vertical ? high : a[axis];
      const candidates = [...slots.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred)), preferred,
        ...Array.from({ length: high - low + 1 }, (_, k) => low + k).sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))];
      const move = (value: number): Point[] => {
        const moved = points.map((p): Point => [...p]);
        if (moved.length === 2) {
          const p: Point = [...moved[0]];
          const q: Point = [...moved[1]];
          p[fixed] = q[fixed] = Math.round((p[fixed] + q[fixed]) / 2);
          moved.splice(1, 0, p, q);
        }
        moved[source ? 0 : moved.length - 1][axis] = value;
        moved[source ? 1 : moved.length - 2][axis] = value;
        return moved;
      };
      const value = candidates.find((v) => free(v) && !hitsNode(move(v), i)) ??
        candidates.find((v) => taken.every((p) => Math.abs(v - p) >= 2) && !hitsNode(move(v), i)) ?? preferred;
      taken.push(value);
      ports.set(key, taken);
      if (value !== a[axis]) points.splice(0, points.length, ...move(value));
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
    const straight: Point[] = [[x, a[1]], [x, b[1]]];
    if (portsClear(straight, i) && !hitsNode(straight, i)) routes[i] = straight;
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
            if (!portsClear(candidate, i) || hitsNode(candidate, i)) continue;
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
          if (!portsClear(candidate, i) || hitsNode(candidate, i)) continue;
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
      const titleLeft = r.x + 2;
      const titleRight = titleLeft + width + 3;
      const candidateRoutes = routes.map((route) => route.map((p): Point => [...p]));
      let clear = true;
      // Earlier shifts in this pass already occupy their new ports.
      const usable = (candidate: Point[], index: number): boolean => {
        if (hitsNode(candidate, index) || !portsClear(candidate, index, candidateRoutes) || !terminalFits(candidate[0], candidate[1], links[index].src, true) || !terminalFits(candidate[candidate.length - 1], candidate[candidate.length - 2], links[index].dst, false)) return false;
        return !candidate.slice(1).some((q, n) => {
          const p = candidate[n];
          if (nearFrame(p, q)) return true;
          if (headings.some((box) => Math.max(p[0], q[0]) >= box.x && Math.min(p[0], q[0]) < box.x + box.w && Math.max(p[1], q[1]) >= box.y && Math.min(p[1], q[1]) < box.y + box.h)) return true;
          if (layout.nodes.some((box, node) => !cards[node].group && Math.min(p[0], q[0]) < box.x + box.w - 1 && Math.max(p[0], q[0]) > box.x && Math.min(p[1], q[1]) < box.y + box.h - 1 && Math.max(p[1], q[1]) > box.y)) return true;
          const keys = trackKeys(p, q);
          return candidateRoutes.some((other, j) => j !== index && other.slice(1).some((b, k) => trackKeys(other[k], b).some((key) => keys.includes(key))));
        });
      };
      for (let j = 0; j < routes.length && clear; j++) {
        const route = candidateRoutes[j];
        for (let k = 0; k + 1 < route.length; k++) {
          const a = route[k];
          const b = route[k + 1];
          if (a[0] !== b[0] || a[0] < titleLeft - 1 || a[0] > titleRight || Math.max(a[1], b[1]) < r.y - 1 || Math.min(a[1], b[1]) > r.y + height) continue;
          let shifted = false;
          for (let x = titleRight + 1; x < r.x + r.w - 3; x++) {
            const candidate = route.map((p): Point => [...p]);
            candidate[k][0] = candidate[k + 1][0] = x;
            if (!usable(candidate, j)) continue;
            route[k][0] = route[k + 1][0] = x;
            shifted = true;
            break;
          }
          if (!shifted && card.headRoom) {
            const above = r.y - 3;
            const below = r.y + height + 3;
            if (Math.min(a[1], b[1]) <= above && Math.max(a[1], b[1]) >= below) {
              for (let x = titleRight + 1; x < r.x + r.w - 3; x++) {
                const down = a[1] < b[1];
                const enter = down ? above : below;
                const leave = down ? below : above;
                const detour: Point[] = [[a[0], enter], [x, enter], [x, leave], [b[0], leave]];
                const candidate = [...route.slice(0, k + 1), ...detour, ...route.slice(k + 1)];
                if (!usable(candidate, j)) continue;
                route.splice(0, route.length, ...simplify(candidate));
                shifted = true;
                break;
              }
            }
          }
          if (!shifted) { clear = false; break; }
        }
      }
      clear &&= !candidateRoutes.some((route) => route.slice(1).some((b, k) => {
        const a = route[k];
        return Math.max(a[0], b[0]) >= titleLeft - 1 && Math.min(a[0], b[0]) <= titleRight &&
          Math.max(a[1], b[1]) >= r.y - 1 && Math.min(a[1], b[1]) <= r.y + height;
      }));
      if (clear) {
        candidateRoutes.forEach((route, j) => { routes[j] = simplify(route); });
        at = titleLeft;
      }
    }
    if (at === undefined) {
      const widened = cards.map((c, n) => n !== i ? c : card.headRoom
        ? { ...c, minWidth: r.w + 1 }
        : { ...c, headRoom: 3 });
      return drawCards(widened, links, dir, ctx, stack, rankGap);
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
    const preferred: Point = e.loop ? (points[0][1] === layout.nodes[l.src].y
      ? [points[3][0] + 2, points[3][1]]
      : [points[1][0] + 2, points[1][1]])
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

import { Canvas, type Rect } from '../canvas/canvas.js';
import { drawEdgeLine, finishEdge, type EdgeStyle } from './edges.js';
import type { Point } from '../layout/graph.js';
import { label, type TextBlock } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

export function gridLabel(raw: string | undefined, options: { maxWidth: number; markdown?: boolean }): TextBlock {
  const text = label(raw, options);
  const lines = text.lines.flatMap((line) => wrap(line, options.maxWidth));
  return {
    lines,
    width: Math.max(0, ...lines.map(displayWidth)),
    height: lines.length,
  };
}

export type Side = 'L' | 'R' | 'T' | 'B';
export interface Port {
  at: Point;
  side: Side;
  rect?: Rect;
  fixed?: boolean;
}
export interface Wire {
  from: Port;
  to: Port;
  style: EdgeStyle;
  text: TextBlock;
}
const steps: Point[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const sides: Side[] = ['L', 'R', 'T', 'B'];
const key = (x: number, y: number) => `${x},${y}`;
const axis = (d: number) => (d < 2 ? 1 : 2);
const inside = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
export function port(r: Rect, side: Side, nth = 0, count = 1): Port {
  const vertical = side === 'L' || side === 'R';
  const span = (vertical ? r.h : r.w) - 2;
  const offset = span < 1 ? 0 : count === 1 ? 1 + Math.floor((span - 1) / 2) : 1 + Math.round((nth * (span - 1)) / (count - 1));
  return {
    side,
    rect: r,
    at: [
      side === 'L' ? r.x : side === 'R' ? r.x + r.w - 1 : r.x + offset,
      side === 'T' ? r.y : side === 'B' ? r.y + r.h - 1 : r.y + offset,
    ],
  };
}

// Ports can slide along a side. Keep the ordering of neighbours and spread fan-in before routing.
export function alignPorts(wires: Wire[]): void {
  const groups = new Map<Rect, Map<Side, { p: Port; other: Port; loop: boolean }[]>>();
  const coord = (p: Port) => (p.side === 'T' || p.side === 'B' ? 0 : 1);
  const range = (p: Port): [number, number] => {
    if (!p.rect || p.fixed) return [p.at[coord(p)], p.at[coord(p)]];
    const c = coord(p),
      lo = c === 0 ? p.rect.x : p.rect.y,
      size = c === 0 ? p.rect.w : p.rect.h;
    return size <= 2 ? [lo, lo + size - 1] : [lo + 1, lo + size - 2];
  };
  const sizes = new Map<Port, number>();
  for (const wire of wires)
    for (const [p, other] of [
      [wire.from, wire.to],
      [wire.to, wire.from],
    ]) {
      if (!p.rect || p.fixed) continue;
      const bySide = groups.get(p.rect) ?? new Map<Side, { p: Port; other: Port; loop: boolean }[]>();
      groups.set(p.rect, bySide);
      const list = bySide.get(p.side) ?? [];
      bySide.set(p.side, list);
      list.push({ p, other, loop: p.rect === other.rect });
    }
  for (const bySide of groups.values())
    for (const list of bySide.values()) {
      list.forEach(({ p }) => sizes.set(p, list.length));
      if (list.length < 2) continue;
      const c = coord(list[0].p),
        [lo, hi] = range(list[0].p);
      list.sort((a, b) => a.other.at[c] - b.other.at[c]);
      const desired = list.map((e) => (e.loop ? Math.round((lo + hi) / 2) : Math.max(lo, Math.min(hi, e.other.at[c]))));
      const step = Math.min(
        Math.floor((hi - lo) / (list.length - 1)),
        Math.max(list.some((e) => e.loop) ? 4 : 2, Math.round((Math.max(...desired) - Math.min(...desired)) / (list.length - 1))),
      );
      const start = Math.max(
        lo,
        Math.min(hi - step * (list.length - 1), Math.round((desired[0] + desired[desired.length - 1] - step * (list.length - 1)) / 2)),
      );
      list.forEach(({ p }, i) => (p.at[c] = start + i * step));
    }
  for (const { from: a, to: b } of wires) {
    if (a.rect === b.rect) continue;
    if (sides.indexOf(a.side) !== (sides.indexOf(b.side) ^ 1)) {
      for (const [p, other] of [
        [a, b],
        [b, a],
      ])
        if (!p.fixed && (sizes.get(p) ?? 1) === 1) {
          const c = coord(p),
            [lo, hi] = range(p);
          p.at[c] = Math.max(lo, Math.min(hi, other.at[c] + steps[sides.indexOf(other.side)][c] * 2));
        }
      continue;
    }
    const c = coord(a),
      [al, ah] = range(a),
      [bl, bh] = range(b);
    if (Math.max(al, bl) > Math.min(ah, bh)) {
      if (!a.fixed && (sizes.get(a) ?? 1) === 1) a.at[c] = Math.max(al, Math.min(ah, b.at[c]));
      if (!b.fixed && (sizes.get(b) ?? 1) === 1) b.at[c] = Math.max(bl, Math.min(bh, a.at[c]));
      continue;
    }
    const af = a.fixed || (sizes.get(a) ?? 1) > 1,
      bf = b.fixed || (sizes.get(b) ?? 1) > 1;
    if (af && bf) continue;
    const preferred = af ? a.at[c] : bf ? b.at[c] : Math.round((a.at[c] + b.at[c]) / 2);
    const at = Math.max(al, bl, Math.min(ah, bh, preferred));
    if ((af && at !== a.at[c]) || (bf && at !== b.at[c])) continue;
    a.at[c] = at;
    b.at[c] = at;
  }
}

// Fixed ports and manually placed grids cannot use the layered graph router.
export function gridWires(canvas: Canvas, boxes: Rect[], frames: Rect[], titles: Rect[], wires: Wire[]): () => void {
  const occupied = new Map<string, number>();
  const blocked = [...boxes, ...titles.map((r) => ({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }))];
  let owner = -1;
  const approaches = new Map<string, Set<number>>();
  wires.forEach((wire, i) => {
    for (const p of [wire.from, wire.to]) {
      const d = sides.indexOf(p.side);
      for (let step = 1; step <= 2; step++) {
        const k = key(p.at[0] + steps[d][0] * step, p.at[1] + steps[d][1] * step);
        const set = approaches.get(k) ?? new Set<number>();
        set.add(i);
        approaches.set(k, set);
      }
    }
  });
  const protectedAt = (x: number, y: number) => {
    const set = approaches.get(key(x, y));
    return set !== undefined && !set.has(owner);
  };
  const labels: { rect: Rect; text: TextBlock }[] = [];
  const paths: { points: Point[]; style: EdgeStyle }[] = [];
  let x0 = Math.min(0, ...boxes.map((r) => r.x), ...frames.map((r) => r.x)) - 4;
  let y0 = Math.min(0, ...boxes.map((r) => r.y), ...frames.map((r) => r.y)) - 4;
  let x1 = Math.max(1, ...boxes.map((r) => r.x + r.w), ...frames.map((r) => r.x + r.w)) + 4;
  let y1 = Math.max(1, ...boxes.map((r) => r.y + r.h), ...frames.map((r) => r.y + r.h)) + 4;
  const frameAxis = (x: number, y: number): number => {
    let mask = 0;
    for (const r of frames) {
      if (x >= r.x && x < r.x + r.w && (y === r.y || y === r.y + r.h - 1)) mask |= 1;
      if (y >= r.y && y < r.y + r.h && (x === r.x || x === r.x + r.w - 1)) mask |= 2;
    }
    return mask;
  };
  const reserve = (points: Point[]): void => {
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      const dx = Math.sign(b[0] - a[0]),
        dy = Math.sign(b[1] - a[1]);
      const mask = dx ? 1 : 2;
      let [x, y] = a;
      for (;;) {
        occupied.set(key(x, y), (occupied.get(key(x, y)) ?? 0) | mask);
        if (x === b[0] && y === b[1]) break;
        x += dx;
        y += dy;
      }
    }
  };
  const route = (start: Point, end: Point, first: number, last: number): Point[] => {
    // A* with heading in the state: crossings must stay straight and bends cost extra.
    for (let attempt = 0; ; attempt++) {
      const margin = attempt * 6;
      type State = {
        x: number;
        y: number;
        d: number;
        cost: number;
        score: number;
        prev?: State;
      };
      const heap: State[] = [];
      const push = (s: State): void => {
        heap.push(s);
        let i = heap.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (heap[p].score <= s.score) break;
          heap[i] = heap[p];
          i = p;
        }
        heap[i] = s;
      };
      const pop = (): State => {
        const top = heap[0],
          tail = heap.pop()!;
        if (heap.length) {
          let i = 0;
          while (i * 2 + 1 < heap.length) {
            let j = i * 2 + 1;
            if (j + 1 < heap.length && heap[j + 1].score < heap[j].score) j++;
            if (heap[j].score >= tail.score) break;
            heap[i] = heap[j];
            i = j;
          }
          heap[i] = tail;
        }
        return top;
      };
      const best = new Map<string, number>();
      push({ x: start[0], y: start[1], d: first, cost: 0, score: 0 });
      while (heap.length) {
        const s = pop(),
          sk = `${s.x},${s.y},${s.d}`;
        if ((best.get(sk) ?? Infinity) < s.cost) continue;
        if (s.x === end[0] && s.y === end[1] && (last < 0 || s.d === last)) {
          const result: Point[] = [];
          for (let p: State | undefined = s; p; p = p.prev) result.push([p.x, p.y]);
          return result.reverse();
        }
        const here = occupied.get(key(s.x, s.y)) ?? 0;
        for (let d = 0; d < 4; d++) {
          if (d === (s.d ^ 1)) continue;
          if ((here || frameAxis(s.x, s.y)) && d !== s.d) continue;
          const x = s.x + steps[d][0],
            y = s.y + steps[d][1];
          if (x < x0 - margin || x > x1 + margin || y < y0 - margin || y > y1 + margin) continue;
          if (blocked.some((r) => inside(r, x, y)) || protectedAt(x, y)) continue;
          const mask = occupied.get(key(x, y)) ?? 0;
          if ((mask | frameAxis(x, y)) & axis(d)) continue;
          // A crossing is allowed; parallel runs keep one empty cell between them.
          if (
            d < 2
              ? [y - 1, y + 1].some((yy) => ((occupied.get(key(x, yy)) ?? 0) & 1) !== 0)
              : [x - 1, x + 1].some((xx) => ((occupied.get(key(xx, y)) ?? 0) & 2) !== 0)
          )
            continue;
          if (
            [...boxes, ...frames].some((r) =>
              d < 2
                ? (y === r.y - 1 || y === r.y + r.h) && x >= r.x && x < r.x + r.w
                : (x === r.x - 1 || x === r.x + r.w) && y >= r.y && y < r.y + r.h,
            )
          )
            continue;
          if (
            frames.some((r) =>
              d < 2
                ? (y === r.y + 1 || y === r.y + r.h - 2) && x > r.x && x < r.x + r.w - 1
                : (x === r.x + 1 || x === r.x + r.w - 2) && y > r.y && y < r.y + r.h - 1,
            )
          )
            continue;
          const cost = s.cost + 1 + (d === s.d ? 0 : 3) + (mask ? 4 : 0);
          const k = `${x},${y},${d}`;
          if ((best.get(k) ?? Infinity) <= cost) continue;
          best.set(k, cost);
          push({
            x,
            y,
            d,
            cost,
            score: cost + Math.abs(end[0] - x) + Math.abs(end[1] - y),
            prev: s,
          });
        }
      }
      if (attempt === 5) throw new Error('Unable to draw this diagram.');
    }
  };
  const planned: Point[][] = [];
  const future = new Map<string, Set<number>>();
  for (const [wi, wire] of wires.entries()) {
    owner = wi;
    const sd = sides.indexOf(wire.from.side),
      td = sides.indexOf(wire.to.side);
    const a: Point = [wire.from.at[0] + steps[sd][0], wire.from.at[1] + steps[sd][1]];
    const b: Point = [wire.to.at[0] + steps[td][0], wire.to.at[1] + steps[td][1]];
    const loop = wire.from.rect !== undefined && wire.from.rect === wire.to.rect;
    const start: Point = loop ? [a[0] + steps[sd][0], a[1] + steps[sd][1]] : a;
    const end: Point = loop ? [b[0] + steps[td][0], b[1] + steps[td][1]] : b;
    let points: Point[] = [wire.from.at, ...(loop ? [a] : []), ...route(start, end, sd, loop ? -1 : td ^ 1), ...(loop ? [b] : [])];
    planned.push(points);
    reserve(points);
    for (const p of points) {
      const set = future.get(key(p[0], p[1])) ?? new Set<number>();
      set.add(wi);
      future.set(key(p[0], p[1]), set);
    }
  }
  occupied.clear();
  for (const [wi, wire] of wires.entries()) {
    owner = wi;
    const sd = sides.indexOf(wire.from.side),
      td = sides.indexOf(wire.to.side);
    const a: Point = [wire.from.at[0] + steps[sd][0], wire.from.at[1] + steps[sd][1]];
    const b: Point = [wire.to.at[0] + steps[td][0], wire.to.at[1] + steps[td][1]];
    let points = planned[wi];
    if (wire.text.height) {
      const w = wire.text.width,
        h = wire.text.height;
      const candidates: { rect: Rect; score: number }[] = [];
      const free = (r: Rect): boolean => {
        for (let y = r.y - 1; y <= r.y + r.h; y++)
          for (let x = r.x - 1; x <= r.x + r.w; x++) {
            if ((x === r.x - 1 || x === r.x + r.w) && (y === r.y - 1 || y === r.y + r.h)) continue;
            if (
              blocked.some((box) => inside(box, x, y)) ||
              frameAxis(x, y) ||
              occupied.has(key(x, y)) ||
              approaches.has(key(x, y)) ||
              [...(future.get(key(x, y)) ?? [])].some((i) => i !== owner)
            )
              return false;
            // The associated line may sit immediately below or beside its text, never wrap around it.
            if (points.some((p) => p[0] === x && p[1] === y) && y !== r.y + r.h) return false;
          }
        return true;
      };
      for (let i = 1; i < points.length; i++) {
        const p = points[i];
        if (p[1] === points[i - 1][1]) candidates.push({ rect: { x: p[0] - Math.floor(w / 2), y: p[1] - h, w, h }, score: 0 });
        else for (const x of [p[0] + 2, p[0] - w - 1]) candidates.push({ rect: { x, y: p[1] - Math.floor(h / 2), w, h }, score: 1 });
      }
      const mid: Point = [Math.floor((a[0] + b[0]) / 2), Math.floor((a[1] + b[1]) / 2)];
      candidates.forEach((c) => (c.score += Math.abs(c.rect.x + w / 2 - mid[0]) + Math.abs(c.rect.y + h / 2 - mid[1])));
      candidates.sort((a, b) => a.score - b.score);
      let chosen = candidates.find((c) => free(c.rect))?.rect;
      if (!chosen) {
        for (let i = 0; i < planned.length; i++) if (i !== owner) reserve(planned[i]);
        // A straight labelled run is reserved only when the shortest route has no room beside it.
        for (let radius = 0; !chosen; radius++) {
          for (let dy = -radius; dy <= radius && !chosen; dy++)
            for (let dx = -radius; dx <= radius; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
              const r = { x: mid[0] - Math.floor(w / 2) + dx, y: mid[1] + dy, w, h };
              const band = { x: r.x - 3, y: r.y - 1, w: w + 6, h: h + 3 };
              if (!free(band)) continue;
              const left: Point = [r.x - 3, r.y + h],
                right: Point = [r.x + w + 2, r.y + h];
              blocked.push({ x: r.x - 2, y: r.y - 1, w: w + 4, h: h + 1 });
              x0 = Math.min(x0, left[0] - 4);
              x1 = Math.max(x1, right[0] + 4);
              y0 = Math.min(y0, r.y - 4);
              y1 = Math.max(y1, right[1] + 4);
              const p = route(a, left, sd, 1);
              reserve(p);
              const q = route(right, b, 1, td ^ 1);
              points = [wire.from.at, ...p, right, ...q.slice(1)];
              chosen = r;
              break;
            }
        }
      }
      labels.push({ rect: chosen, text: wire.text });
      blocked.push(chosen);
    }
    // Collapse cell steps before finishEdge so its end direction is unambiguous.
    const simple: Point[] = [];
    for (const p of points) {
      const n = simple.length;
      if (n && simple[n - 1][0] === p[0] && simple[n - 1][1] === p[1]) continue;
      if (n > 1 && ((simple[n - 2][0] === p[0] && simple[n - 1][0] === p[0]) || (simple[n - 2][1] === p[1] && simple[n - 1][1] === p[1])))
        simple[n - 1] = p;
      else simple.push(p);
    }
    reserve(points);
    drawEdgeLine(canvas, simple, wire.style);
    paths.push({ points: simple, style: wire.style });
  }
  return () => {
    for (const p of paths) finishEdge(canvas, p.points, p.style);
    for (const { rect, text } of labels) {
      canvas.clear(rect.x, rect.y, rect.w, rect.h);
      text.lines.forEach((line, i) =>
        canvas.textIn(rect.x, rect.y + i, rect.w, line, 'center', {
          role: 'label',
        }),
      );
    }
  };
}

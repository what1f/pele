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
  const offset = span < 1 ? 0 : 1 + Math.floor((span - count) / 2) + nth;
  return {
    side,
    at: [
      side === 'L' ? r.x : side === 'R' ? r.x + r.w - 1 : r.x + offset,
      side === 'T' ? r.y : side === 'B' ? r.y + r.h - 1 : r.y + offset,
    ],
  };
}

// Fixed ports and manually placed grids cannot use the layered graph router.
export function gridWires(canvas: Canvas, boxes: Rect[], frames: Rect[], titles: Rect[], wires: Wire[]): () => void {
  const occupied = new Map<string, number>();
  const blocked = [...boxes, ...titles];
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
        if (s.x === end[0] && s.y === end[1] && s.d === last) {
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
  for (const [wi, wire] of wires.entries()) {
    owner = wi;
    const sd = sides.indexOf(wire.from.side),
      td = sides.indexOf(wire.to.side);
    const a: Point = [wire.from.at[0] + steps[sd][0], wire.from.at[1] + steps[sd][1]];
    const b: Point = [wire.to.at[0] + steps[td][0], wire.to.at[1] + steps[td][1]];
    let points: Point[];
    if (wire.text.height) {
      const w = wire.text.width + 2,
        h = wire.text.height;
      const cx = Math.floor((a[0] + b[0] - w) / 2),
        cy = Math.floor((a[1] + b[1]) / 2);
      let rect: Rect | undefined;
      for (let radius = 0; !rect; radius++) {
        for (let dy = -radius; dy <= radius && !rect; dy++)
          for (let dx = -radius; dx <= radius; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
            const r = { x: cx + dx, y: cy + dy, w, h };
            let free = true;
            for (let y = r.y - 1; y <= r.y + h && free; y++)
              for (let x = r.x - 2; x <= r.x + w + 1; x++) {
                if (blocked.some((box) => inside(box, x, y)) || frameAxis(x, y) || occupied.has(key(x, y)) || approaches.has(key(x, y))) {
                  free = false;
                  break;
                }
              }
            if (free) {
              rect = r;
              break;
            }
          }
      }
      blocked.push(rect);
      labels.push({ rect, text: wire.text });
      x0 = Math.min(x0, rect.x - 4);
      x1 = Math.max(x1, rect.x + w + 4);
      y0 = Math.min(y0, rect.y - 4);
      y1 = Math.max(y1, rect.y + h + 4);
      const left: Point = [rect.x - 1, rect.y],
        right: Point = [rect.x + w, rect.y];
      const p = route(a, left, sd, 1);
      reserve(p);
      const q = route(right, b, 1, td ^ 1);
      points = [wire.from.at, ...p, right, ...q.slice(1)];
    } else points = [wire.from.at, ...route(a, b, sd, td ^ 1)];
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
        canvas.textIn(rect.x + 1, rect.y + i, rect.w - 2, line, 'center', {
          role: 'label',
        }),
      );
    }
  };
}

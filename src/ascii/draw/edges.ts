// 连线、箭头、端点标记的画法。
//
// 约定（和 layout/graph.ts 一致）：折线第一个点在起点框的边上，最后一个点在终点框外紧挨边框的一格。
// 画的顺序：先画所有连线，再画节点（节点会清掉框内和框边上的线），最后调用 finishEdges 补上框边的接口和箭头。

import type { Canvas, Role } from '../canvas/canvas.js';
import { Arm, type Stroke } from '../canvas/glyphs.js';
import type { Point } from '../layout/graph.js';

// 端点标记。arrow 实心箭头，open 空心箭头，circle 圆点，cross 叉，
// diamond/diamondOpen 组合/聚合，triangle 继承的空心三角，
// one/many/zeroOne/zeroMany/oneMany 等 ER 图的鸦脚记号由 ER 渲染器自己处理。
export type Marker = 'none' | 'arrow' | 'open' | 'circle' | 'cross' | 'diamond' | 'diamondOpen' | 'triangle';

export interface EdgeStyle {
  stroke?: Stroke;
  dashed?: boolean;
  role?: Role;
  head?: Marker;
  tail?: Marker;
}

type Dir = 'up' | 'down' | 'left' | 'right';

// 从 a 走到 b 的方向。
function heading(a: Point, b: Point): Dir {
  if (a[0] === b[0]) return b[1] > a[1] ? 'down' : 'up';
  return b[0] > a[0] ? 'right' : 'left';
}

const MARKS: Record<Exclude<Marker, 'none'>, Record<Dir, string>> = {
  arrow: { up: '▲', down: '▼', left: '◀', right: '▶' },
  open: { up: '△', down: '▽', left: '◁', right: '▷' },
  triangle: { up: '△', down: '▽', left: '◁', right: '▷' },
  circle: { up: '●', down: '●', left: '●', right: '●' },
  cross: { up: '×', down: '×', left: '×', right: '×' },
  diamond: { up: '◆', down: '◆', left: '◆', right: '◆' },
  diamondOpen: { up: '◇', down: '◇', left: '◇', right: '◇' },
};

export function markerGlyph(marker: Exclude<Marker, 'none'>, dir: Dir): string {
  return MARKS[marker][dir];
}

// 第一步：只画线。
export function drawEdgeLine(canvas: Canvas, points: Point[], style: EdgeStyle = {}): void {
  if (points.length < 2) return;
  canvas.path(points, { stroke: style.stroke, dashed: style.dashed, role: style.role ?? 'edge' });
}

const ARM: Record<Dir, Arm> = { up: Arm.Up, down: Arm.Down, left: Arm.Left, right: Arm.Right };
const BACK: Record<Dir, Arm> = { up: Arm.Down, down: Arm.Up, left: Arm.Right, right: Arm.Left };
const STEP: Record<Dir, Point> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// 第二步（节点画完之后）：在起点框边上补出线的接口，在终点放箭头（或者没有箭头时把线接到框边上），
// 起点有标记时放在紧挨起点框的那一格。
export function finishEdge(canvas: Canvas, points: Point[], style: EdgeStyle = {}): void {
  if (points.length < 2) return;
  const line = { stroke: style.stroke, dashed: style.dashed, role: style.role ?? 'edge' };
  const n = points.length;
  const start = points[0];
  const out = heading(start, points[1]);
  canvas.stub(start[0], start[1], ARM[out], line);
  // 起点框外第一格补一条回指的臂，保证线和框边连上。
  const s1: Point = [start[0] + STEP[out][0], start[1] + STEP[out][1]];
  canvas.stub(s1[0], s1[1], BACK[out], line);

  const end = points[n - 1];
  const into = heading(points[n - 2], end);
  const head = style.head ?? 'arrow';
  if (head === 'none') {
    // 没有箭头：线一直接到终点框的边上。
    const border: Point = [end[0] + STEP[into][0], end[1] + STEP[into][1]];
    canvas.stub(end[0], end[1], ARM[into], line);
    canvas.stub(border[0], border[1], BACK[into], line);
  } else {
    canvas.put(end[0], end[1], markerGlyph(head, into), { role: 'accent' });
  }
  const tail = style.tail ?? 'none';
  if (tail !== 'none' && n >= 2) {
    canvas.put(s1[0], s1[1], markerGlyph(tail, heading(points[1], start)), { role: 'accent' });
  }
}

// 连线标签放在哪：找离排版给的位置最近、放得下的一段线，把标签嵌在这段线中间（横线上压住线，竖线上居中盖住）。
// near 是排版给的标签中心；返回标签左上角。
export function placeLabel(points: Point[], near: Point, w: number, h: number): Point {
  let best: Point = [near[0] - (w >> 1), near[1] - (h >> 1)];
  let bestScore = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    let p: Point;
    let fits: boolean;
    if (ay === by) {
      // 横线：标签占这一行（多行时往上下展开）。标签左右各清一格空白，再各留一格线，不碰两端的框。
      const lo = Math.min(ax, bx) + 2;
      const hi = Math.max(ax, bx) - 2 - w + 1;
      fits = hi >= lo;
      const x = Math.max(lo, Math.min(hi, near[0] - (w >> 1)));
      p = [fits ? x : Math.min(ax, bx) + ((Math.abs(bx - ax) - w) >> 1), ay - (h >> 1)];
    } else {
      // 竖线：标签横向居中在这一列上，竖向避开两端。
      const lo = Math.min(ay, by) + 1;
      const hi = Math.max(ay, by) - 1 - h + 1;
      fits = hi >= lo;
      const y = Math.max(lo, Math.min(hi, near[1] - (h >> 1)));
      p = [ax - (w >> 1), fits ? y : lo];
    }
    const dx = p[0] + (w >> 1) - near[0];
    const dy = p[1] + (h >> 1) - near[1];
    const score = dx * dx + dy * dy * 4 + (fits ? 0 : 1e6);
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

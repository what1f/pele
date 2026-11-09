// 节点形状的字符画法。尺寸都按格算，含边框。
//
// 终端里画不出真正的圆、菱形，只求「一眼能分辨」：
//   rect       ┌──┐    rounded/stadium/circle  ╭──╮    subroutine  ╓──╖
//   cylinder   ╭──╮ 下接 ├──┤                    diamond/hexagon  ╱──╲ … ╲──╱
//   start ●  stop ◉  junction ●  fork/join ━━━━  text 无边框
// 没列出的形状一律画成 rect。

import type { Canvas, Rect, Role } from '../canvas/canvas.js';
import type { TextBlock } from '../text/label.js';

export type ShapeKind =
  | 'rect'
  | 'rounded'
  | 'subroutine'
  | 'cylinder'
  | 'diamond'
  | 'hexagon'
  | 'dot' // 实心小圆点：开始、汇合点
  | 'bullseye' // 结束
  | 'bar' // fork/join 粗横条
  | 'text' // 无边框文字
  | 'double'; // 双线框（双圆等）

// Mermaid 形状名 → 字符画形状。
export function shapeKind(name: string): ShapeKind {
  switch (name) {
    case 'rounded':
    case 'stadium':
    case 'circle':
    case 'event':
    case 'cloud':
    case 'bang':
    case 'delay':
    case 'state':
      return 'rounded';
    case 'dbl-circ':
    case 'doublecircle':
      return 'double';
    case 'fr-rect':
    case 'subroutine':
    case 'div-rect':
    case 'lin-rect':
    case 'win-pane':
      return 'subroutine';
    case 'cyl':
    case 'h-cyl':
    case 'lin-cyl':
    case 'datastore':
      return 'cylinder';
    case 'diam':
    case 'diamond':
    case 'question':
    case 'choice':
      return 'diamond';
    case 'hex':
    case 'hexagon':
      return 'hexagon';
    case 'sm-circ':
    case 'f-circ':
    case 'stateStart':
      return 'dot';
    case 'fr-circ':
    case 'stateEnd':
      return 'bullseye';
    case 'fork':
    case 'join':
    case 'forkJoin':
      return 'bar';
    case 'text':
      return 'text';
    default:
      return 'rect';
  }
}

// 装下这段文字需要多大的框。
export function shapeSize(kind: ShapeKind, text: TextBlock): { w: number; h: number } {
  switch (kind) {
    case 'dot':
    case 'bullseye':
      return { w: 1, h: 1 };
    case 'bar':
      return { w: Math.max(8, text.width + 4), h: 1 };
    case 'text':
      return { w: Math.max(1, text.width + 2), h: Math.max(1, text.height) + 2 };
    case 'cylinder':
      return { w: text.width + 4, h: Math.max(1, text.height) + 3 };
    case 'diamond':
    case 'hexagon':
      return { w: text.width + 4, h: Math.max(1, text.height) + 2 };
    default:
      return { w: text.width + 4, h: Math.max(1, text.height) + 2 };
  }
}

export interface NodeStyle {
  role?: Role;
  textRole?: Role;
  dashed?: boolean;
  heavy?: boolean;
}

// 在矩形里画形状并居中写字。
export function drawShape(canvas: Canvas, r: Rect, kind: ShapeKind, text: TextBlock, style: NodeStyle = {}): void {
  const role = style.role ?? 'border';
  const stroke = style.heavy ? 'heavy' : 'light';
  const x1 = r.x + r.w - 1;
  const y1 = r.y + r.h - 1;
  switch (kind) {
    case 'dot':
      canvas.clear(r.x, r.y, r.w, r.h);
      canvas.put(r.x, r.y, '●', { role });
      return;
    case 'bullseye':
      canvas.clear(r.x, r.y, r.w, r.h);
      canvas.put(r.x, r.y, '◉', { role });
      return;
    case 'bar':
      canvas.clear(r.x, r.y, r.w, r.h);
      canvas.segment(r.x, r.y, x1, r.y, { stroke: 'heavy', role });
      return;
    case 'text':
      canvas.clear(r.x, r.y, r.w, r.h);
      break;
    case 'rounded':
      canvas.box(r.x, r.y, r.w, r.h, { round: true, stroke, dashed: style.dashed, role });
      break;
    case 'double':
      canvas.box(r.x, r.y, r.w, r.h, { stroke: 'double', role });
      break;
    case 'subroutine':
      canvas.box(r.x, r.y, r.w, r.h, { stroke, dashed: style.dashed, role });
      // 左右两条竖边画成双线：╓──╖ ║ ║ ╙──╜
      canvas.segment(r.x, r.y, r.x, y1, { stroke: 'double', role });
      canvas.segment(x1, r.y, x1, y1, { stroke: 'double', role });
      break;
    case 'cylinder':
      canvas.box(r.x, r.y, r.w, r.h, { round: true, stroke, role });
      canvas.segment(r.x, r.y + 1, x1, r.y + 1, { stroke, role });
      break;
    case 'diamond':
    case 'hexagon':
      canvas.box(r.x, r.y, r.w, r.h, { stroke, dashed: style.dashed, role });
      canvas.put(r.x, r.y, '╱', { role });
      canvas.put(x1, r.y, '╲', { role });
      canvas.put(r.x, y1, '╲', { role });
      canvas.put(x1, y1, '╱', { role });
      break;
    default:
      canvas.box(r.x, r.y, r.w, r.h, { stroke, dashed: style.dashed, role });
  }
  // 文字竖直居中；圆柱的文字放在顶部那道线下面。
  const top = kind === 'cylinder' ? r.y + 2 : r.y + 1;
  const room = (kind === 'cylinder' ? y1 - 2 : y1 - 1) - top + 1;
  const y0 = top + Math.max(0, Math.floor((room - text.height) / 2));
  text.lines.forEach((line, i) => canvas.textIn(r.x + 1, y0 + i, r.w - 2, line, 'center', { role: style.textRole ?? 'text' }));
}

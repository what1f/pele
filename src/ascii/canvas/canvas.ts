// 字符画布：一格一列一行，坐标可以是任意整数（含负数），输出时按实际用到的范围裁剪。
//
// 每个格子有两层：
// - 线条层：四个方向的臂和线型，交汇处输出时自动选框线字符（┼ ├ ┬ …）。
// - 字符层：文字、箭头、标记。有字符的格子输出字符，盖过线条。
// 宽字符（中文、emoji）占两格：左格放字符，右格放续位标记，输出时跳过续位格。

import { cells, displayWidth } from '../text/width.js';
import { Arm, Weight, asciiLineGlyph, asciiSymbol, lineGlyph, weightOf, type Stroke } from './glyphs.js';

// 格子的语义角色，用于以后上色（ANSI 或宿主主题）。纯文本输出时不起作用。
export type Role =
  | 'border' // 节点、容器的边框
  | 'edge' // 连线
  | 'text' // 节点里的文字
  | 'label' // 连线上的标签
  | 'title' // 标题
  | 'muted' // 次要信息（坐标轴、注释）
  | 'accent' // 强调（箭头、标记）
  | `series${number}`; // 图表的第 n 组数据

export interface LineStyle {
  stroke?: Stroke;
  dashed?: boolean;
  role?: Role;
}

export interface BoxStyle extends LineStyle {
  // 圆角。只对细线生效。
  round?: boolean;
  // 清空框内原有的线和字符（节点盖在连线上面时用）。默认 true。
  fill?: boolean;
}

export interface TextStyle {
  role?: Role;
  // 文字是否盖掉格子里已有的字符。默认 true；false 时只写到空格子（标签互不覆盖）。
  overwrite?: boolean;
}

const CONT = '\0'; // 宽字符右半格的续位标记

interface Cell {
  // 四个臂的线型，每臂 2 位：up 0-1、down 2-3、left 4-5、right 6-7。
  arms: number;
  // 哪些臂是虚线（Arm 的组合）。只有所有臂都是虚线时，这一格才画成虚线；实线压在虚线上时实线优先。
  dash: number;
  round: boolean;
  ch: string | undefined;
  role: Role | undefined;
}

function armShift(arm: Arm): number {
  return arm === Arm.Up ? 0 : arm === Arm.Down ? 2 : arm === Arm.Left ? 4 : 6;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Canvas {
  private rows = new Map<number, Map<number, Cell>>();

  private cell(x: number, y: number, create: true): Cell;
  private cell(x: number, y: number, create?: false): Cell | undefined;
  private cell(x: number, y: number, create = false): Cell | undefined {
    let row = this.rows.get(y);
    if (!row) {
      if (!create) return undefined;
      row = new Map();
      this.rows.set(y, row);
    }
    let c = row.get(x);
    if (!c && create) {
      c = { arms: 0, dash: 0, round: false, ch: undefined, role: undefined };
      row.set(x, c);
    }
    return c;
  }

  // ---- 线条 ----

  // 在格子上加一条臂。
  private arm(x: number, y: number, arm: Arm, style: LineStyle): void {
    const c = this.cell(x, y, true);
    const shift = armShift(arm);
    const w = weightOf(style.stroke ?? 'light');
    const old = (c.arms >> shift) & 3;
    if (w > old) c.arms = (c.arms & ~(3 << shift)) | (w << shift);
    if (!style.dashed) c.dash &= ~arm;
    else if (old === 0) c.dash |= arm;
    if (style.role && !c.role) c.role = style.role;
  }

  // 水平或竖直线段，两端都包含在内。端点格只连向线段内侧，和别的线自然拼成拐角、T 字。
  segment(x0: number, y0: number, x1: number, y1: number, style: LineStyle = {}): void {
    if (y0 === y1) {
      const [a, b] = x0 <= x1 ? [x0, x1] : [x1, x0];
      if (a === b) return;
      for (let x = a; x <= b; x++) {
        if (x > a) this.arm(x, y0, Arm.Left, style);
        if (x < b) this.arm(x, y0, Arm.Right, style);
      }
    } else if (x0 === x1) {
      const [a, b] = y0 <= y1 ? [y0, y1] : [y1, y0];
      for (let y = a; y <= b; y++) {
        if (y > a) this.arm(x0, y, Arm.Up, style);
        if (y < b) this.arm(x0, y, Arm.Down, style);
      }
    } else {
      // 斜线拆成先横后竖。
      this.segment(x0, y0, x1, y0, style);
      this.segment(x1, y0, x1, y1, style);
    }
  }

  // 折线：依次连接各点，相邻两点必须横平或竖直（否则先横后竖）。
  path(points: readonly (readonly [number, number])[], style: LineStyle = {}): void {
    for (let i = 1; i < points.length; i++) {
      this.segment(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], style);
    }
  }

  // 给线头补一条伸向某方向的臂（线从框边伸出时，让框边出现 ┬ ├ 之类的接口）。
  stub(x: number, y: number, arm: Arm, style: LineStyle = {}): void {
    this.arm(x, y, arm, style);
  }

  // 矩形框，(x, y) 是左上角，w、h 含边框。
  box(x: number, y: number, w: number, h: number, style: BoxStyle = {}): void {
    if (w < 2 || h < 2) return;
    if (style.fill !== false) this.clear(x + 1, y + 1, w - 2, h - 2);
    const x1 = x + w - 1;
    const y1 = y + h - 1;
    // 框的四条边先清掉原来的臂，再画，避免连线穿过框边留下 ┼。
    for (let i = x; i <= x1; i++) {
      this.wipeLine(i, y);
      this.wipeLine(i, y1);
    }
    for (let j = y; j <= y1; j++) {
      this.wipeLine(x, j);
      this.wipeLine(x1, j);
    }
    this.segment(x, y, x1, y, style);
    this.segment(x, y1, x1, y1, style);
    this.segment(x, y, x, y1, style);
    this.segment(x1, y, x1, y1, style);
    if (style.round) for (const [cx, cy] of [[x, y], [x1, y], [x, y1], [x1, y1]]) this.cell(cx, cy, true).round = true;
  }

  private wipeLine(x: number, y: number): void {
    const c = this.cell(x, y);
    if (c) {
      c.arms = 0;
      c.dash = 0;
      c.round = false;
    }
  }

  // 清空一块区域（线和字符都清掉）。
  clear(x: number, y: number, w: number, h: number): void {
    for (let j = y; j < y + h; j++) {
      const row = this.rows.get(j);
      if (!row) continue;
      for (let i = x; i < x + w; i++) row.delete(i);
    }
  }

  // ---- 字符 ----

  // 在 (x, y) 写一个字符或符号（箭头、标记）。宽字符占两格。
  put(x: number, y: number, ch: string, style: TextStyle = {}): void {
    const w = displayWidth(ch) >= 2 ? 2 : 1;
    if (style.overwrite === false) {
      for (let i = 0; i < w; i++) if (this.cell(x + i, y)?.ch !== undefined) return;
    }
    this.detach(x, y);
    if (w === 2) this.detach(x + 1, y);
    const c = this.cell(x, y, true);
    c.ch = ch;
    c.role = style.role ?? c.role;
    if (w === 2) {
      const r = this.cell(x + 1, y, true);
      r.ch = CONT;
      r.role = c.role;
    }
  }

  // 写入格子前，把压在上面的半个宽字符拆掉，免得输出错位。
  private detach(x: number, y: number): void {
    const c = this.cell(x, y);
    if (!c || c.ch === undefined) return;
    if (c.ch === CONT) {
      const left = this.cell(x - 1, y);
      if (left) left.ch = undefined;
    } else if (displayWidth(c.ch) >= 2) {
      const right = this.cell(x + 1, y);
      if (right?.ch === CONT) right.ch = undefined;
    }
    c.ch = undefined;
  }

  // 从 (x, y) 开始写一行文字，返回占用的列数。
  text(x: number, y: number, text: string, style: TextStyle = {}): number {
    if (style.overwrite === false) {
      let i = x;
      for (const c of cells(text)) {
        for (let k = 0; k < c.width; k++) if (this.cell(i + k, y)?.ch !== undefined) return 0;
        i += c.width;
      }
    }
    let i = x;
    for (const c of cells(text)) {
      this.put(i, y, c.ch, { role: style.role });
      i += c.width;
    }
    return i - x;
  }

  // 在 [x, x + width) 范围里按对齐方式写一行文字，返回起始列。
  textIn(x: number, y: number, width: number, text: string, align: 'left' | 'center' | 'right' = 'center', style: TextStyle = {}): number {
    const tw = displayWidth(text);
    const start = align === 'left' ? x : align === 'right' ? x + width - tw : x + Math.floor((width - tw) / 2);
    this.text(start, y, text, style);
    return start;
  }

  // 读出某格当前的字符（续位格返回 ''），没有字符返回 undefined。
  charAt(x: number, y: number): string | undefined {
    const ch = this.cell(x, y)?.ch;
    return ch === CONT ? '' : ch;
  }

  // 某格是否有线或字符。
  occupied(x: number, y: number): boolean {
    const c = this.cell(x, y);
    return c !== undefined && (c.arms !== 0 || c.ch !== undefined);
  }

  // 某格的线条臂掩码（Arm 的组合）。
  armsAt(x: number, y: number): number {
    const c = this.cell(x, y);
    if (!c) return 0;
    let mask = 0;
    if (c.arms & 3) mask |= Arm.Up;
    if ((c.arms >> 2) & 3) mask |= Arm.Down;
    if ((c.arms >> 4) & 3) mask |= Arm.Left;
    if ((c.arms >> 6) & 3) mask |= Arm.Right;
    return mask;
  }

  // ---- 组合 ----

  // 把另一张画布整体贴到 (dx, dy)。被贴的格子覆盖原有内容。
  blit(other: Canvas, dx: number, dy: number): void {
    for (const [y, row] of other.rows) {
      for (const [x, c] of row) {
        const t = this.cell(x + dx, y + dy, true);
        t.arms = c.arms;
        t.dash = c.dash;
        t.round = c.round;
        t.ch = c.ch;
        t.role = c.role;
      }
    }
  }

  // 用到的范围；空画布返回 undefined。
  bounds(): Rect | undefined {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [y, row] of this.rows) {
      for (const [x, c] of row) {
        // Text hides the line underneath, including when it is a blank.
        const ch = c.ch === CONT ? row.get(x - 1)?.ch : c.ch;
        if (ch !== undefined ? !/\S/u.test(ch) : c.arms === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return minX === Infinity ? undefined : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  // 输出文本。每行去掉行尾空格；charset 为 'ascii' 时只用 ASCII 画线和符号（文字照常保留）。
  toLines(charset: 'unicode' | 'ascii' = 'unicode'): string[] {
    const b = this.bounds();
    if (!b) return [];
    const ascii = charset === 'ascii';
    const out: string[] = [];
    for (let y = b.y; y < b.y + b.h; y++) {
      const row = this.rows.get(y);
      let line = '';
      for (let x = b.x; x < b.x + b.w; x++) {
        const c = row?.get(x);
        if (!c) {
          line += ' ';
          continue;
        }
        if (c.ch === CONT) continue;
        if (c.ch !== undefined) {
          line += ascii ? asciiSymbol(c.ch) : c.ch;
          continue;
        }
        const mask = this.armsAt(x, y);
        const h = Math.max((c.arms >> 4) & 3, (c.arms >> 6) & 3) as Weight;
        const v = Math.max(c.arms & 3, (c.arms >> 2) & 3) as Weight;
        line += (ascii ? asciiLineGlyph : lineGlyph)(mask, h, v, (c.dash & mask) === mask, c.round);
      }
      out.push(line.trimEnd());
    }
    return out;
  }

  toString(charset: 'unicode' | 'ascii' = 'unicode'): string {
    return this.toLines(charset).join('\n');
  }
}

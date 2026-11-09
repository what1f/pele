// 字符在终端里占几列：中日韩全角、全角标点、emoji 占 2 列，组合符号、零宽字符占 0 列，其余 1 列。
// 范围取自 Unicode East Asian Width（W、F）和 Emoji_Presentation，只收常用区段，够终端排版用。

// [起, 止] 成对排列，必须升序。
const WIDE = [
  0x1100, 0x115f, 0x231a, 0x231b, 0x2329, 0x232a, 0x23e9, 0x23ec, 0x23f0, 0x23f0, 0x23f3, 0x23f3, 0x25fd, 0x25fe,
  0x2614, 0x2615, 0x2648, 0x2653, 0x267f, 0x267f, 0x2693, 0x2693, 0x26a1, 0x26a1, 0x26aa, 0x26ab, 0x26bd, 0x26be,
  0x26c4, 0x26c5, 0x26ce, 0x26ce, 0x26d4, 0x26d4, 0x26ea, 0x26ea, 0x26f2, 0x26f3, 0x26f5, 0x26f5, 0x26fa, 0x26fa,
  0x26fd, 0x26fd, 0x2705, 0x2705, 0x270a, 0x270b, 0x2728, 0x2728, 0x274c, 0x274c, 0x274e, 0x274e, 0x2753, 0x2755,
  0x2757, 0x2757, 0x2795, 0x2797, 0x27b0, 0x27b0, 0x27bf, 0x27bf, 0x2b1b, 0x2b1c, 0x2b50, 0x2b50, 0x2b55, 0x2b55,
  0x2e80, 0x303e, 0x3041, 0x33ff, 0x3400, 0x4dbf, 0x4e00, 0x9fff, 0xa000, 0xa4cf, 0xa960, 0xa97f, 0xac00, 0xd7a3,
  0xf900, 0xfaff, 0xfe10, 0xfe19, 0xfe30, 0xfe6f, 0xff00, 0xff60, 0xffe0, 0xffe6, 0x16fe0, 0x16fe4, 0x17000, 0x18cff,
  0x1b000, 0x1b2ff, 0x1f004, 0x1f004, 0x1f0cf, 0x1f0cf, 0x1f18e, 0x1f18e, 0x1f191, 0x1f19a, 0x1f200, 0x1f251,
  0x1f300, 0x1f320, 0x1f32d, 0x1f335, 0x1f337, 0x1f37c, 0x1f37e, 0x1f393, 0x1f3a0, 0x1f3ca, 0x1f3cf, 0x1f3d3,
  0x1f3e0, 0x1f3f0, 0x1f3f4, 0x1f3f4, 0x1f3f8, 0x1f43e, 0x1f440, 0x1f440, 0x1f442, 0x1f4fc, 0x1f4ff, 0x1f53d,
  0x1f54b, 0x1f54e, 0x1f550, 0x1f567, 0x1f57a, 0x1f57a, 0x1f595, 0x1f596, 0x1f5a4, 0x1f5a4, 0x1f5fb, 0x1f64f,
  0x1f680, 0x1f6c5, 0x1f6cc, 0x1f6cc, 0x1f6d0, 0x1f6d2, 0x1f6d5, 0x1f6d7, 0x1f6dc, 0x1f6df, 0x1f6eb, 0x1f6ec,
  0x1f6f4, 0x1f6fc, 0x1f7e0, 0x1f7eb, 0x1f7f0, 0x1f7f0, 0x1f90c, 0x1f93a, 0x1f93c, 0x1f945, 0x1f947, 0x1f9ff,
  0x1fa70, 0x1faff, 0x20000, 0x2fffd, 0x30000, 0x3fffd,
];

// 组合符号、零宽字符、变体选择符：不占列。
const ZERO = [
  0x0300, 0x036f, 0x0483, 0x0489, 0x0591, 0x05bd, 0x0610, 0x061a, 0x064b, 0x065f, 0x0e31, 0x0e31, 0x0e34, 0x0e3a,
  0x0e47, 0x0e4e, 0x1ab0, 0x1aff, 0x1dc0, 0x1dff, 0x200b, 0x200f, 0x2028, 0x202e, 0x2060, 0x2064, 0x20d0, 0x20ff,
  0x302a, 0x302d, 0x3099, 0x309a, 0xfe00, 0xfe0f, 0xfe20, 0xfe2f, 0xfeff, 0xfeff, 0x1f3fb, 0x1f3ff, 0xe0000, 0xe0fff,
];

function inRanges(table: number[], code: number): boolean {
  let lo = 0;
  let hi = (table.length >> 1) - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (code < table[mid * 2]) hi = mid - 1;
    else if (code > table[mid * 2 + 1]) lo = mid + 1;
    else return true;
  }
  return false;
}

// 一个码点占几列。
export function charWidth(code: number): 0 | 1 | 2 {
  if (code < 0x300) return code < 32 || (code >= 0x7f && code < 0xa0) ? 0 : 1;
  if (inRanges(ZERO, code)) return 0;
  return inRanges(WIDE, code) ? 2 : 1;
}

// 字符串的显示列数。
export function displayWidth(text: string): number {
  let n = 0;
  for (const ch of text) n += charWidth(ch.codePointAt(0)!);
  return n;
}

// 把字符串拆成「一个显示单元」的数组：基础字符带上它后面的零宽字符（组合符号、变体选择符、ZWJ 序列）。
export function cells(text: string): { ch: string; width: number }[] {
  const out: { ch: string; width: number }[] = [];
  let joinNext = false;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    const w = charWidth(code);
    if ((w === 0 || joinNext) && out.length > 0) {
      out[out.length - 1].ch += ch;
      joinNext = code === 0x200d;
      continue;
    }
    joinNext = false;
    out.push({ ch, width: w === 0 ? 1 : w });
  }
  return out;
}

// 按显示宽度截断，超出的部分用省略号代替。
export function truncate(text: string, max: number, ellipsis = '…'): string {
  if (displayWidth(text) <= max) return text;
  const room = max - displayWidth(ellipsis);
  if (room <= 0) return ellipsis.slice(0, Math.max(0, max));
  let used = 0;
  let out = '';
  for (const c of cells(text)) {
    if (used + c.width > room) break;
    out += c.ch;
    used += c.width;
  }
  return out + ellipsis;
}

// 按显示宽度折行：优先在空格处断，中日韩文字可以在任意字之间断。
export function wrap(text: string, max: number): string[] {
  if (max <= 0 || displayWidth(text) <= max) return [text];
  const lines: string[] = [];
  let line = '';
  let lineW = 0;
  // 记录行内最后一个可断开的位置（空格后、宽字符前后）。
  let breakAt = -1;
  for (const c of cells(text)) {
    if (lineW + c.width > max && line !== '') {
      if (breakAt > 0) {
        lines.push(line.slice(0, breakAt).trimEnd());
        line = line.slice(breakAt).trimStart();
        lineW = displayWidth(line);
      } else {
        lines.push(line.trimEnd());
        line = '';
        lineW = 0;
      }
      breakAt = -1;
      if (c.ch === ' ' && line === '') continue;
    }
    if (c.width === 2 && line !== '') breakAt = line.length;
    line += c.ch;
    lineW += c.width;
    if (c.ch === ' ' || c.width === 2) breakAt = line.length;
  }
  if (line.trim() !== '' || lines.length === 0) lines.push(line.trimEnd());
  return lines;
}

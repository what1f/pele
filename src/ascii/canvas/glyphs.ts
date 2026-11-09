// 线条交汇处的字符选择。每个格子记录四个方向的「臂」各是什么线型，输出时查表得到框线字符。

export const enum Arm {
  Up = 1,
  Down = 2,
  Left = 4,
  Right = 8,
}

// 线型。数值越大越「重」，同一个格子里横、竖方向各取最重的一种。
export const enum Weight {
  None = 0,
  Light = 1,
  Heavy = 2,
  Double = 3,
}

export type Stroke = 'light' | 'heavy' | 'double';

export function weightOf(stroke: Stroke): Weight {
  return stroke === 'heavy' ? Weight.Heavy : stroke === 'double' ? Weight.Double : Weight.Light;
}

// 按 arm 掩码（0..15）索引。单臂（线头）画成整格的线，比半截的 ╵ 好认。
const LIGHT = ' │││─┘┐┤─└┌├─┴┬┼'.split('');
const HEAVY = ' ┃┃┃━┛┓┫━┗┏┣━┻┳╋'.split('');
const DOUBLE = ' ║║║═╝╗╣═╚╔╠═╩╦╬'.split('');
// 横竖线型不同时的字符，按 [横, 竖] 组合。只覆盖 Unicode 里有的组合。
const MIXED: Record<string, string[]> = {
  // 横粗竖细
  '21': ' │││━┙┑┥━┕┍┝━┷┯┿'.split(''),
  // 横细竖粗
  '12': ' ┃┃┃─┚┒┨─┖┎┠─┸┰╂'.split(''),
  // 横双竖细
  '31': ' │││═╛╕╡═╘╒╞═╧╤╪'.split(''),
  // 横细竖双
  '13': ' ║║║─╜╖╢─╙╓╟─╨╥╫'.split(''),
};
const ROUND: Record<number, string> = {
  [Arm.Up | Arm.Left]: '╯',
  [Arm.Down | Arm.Left]: '╮',
  [Arm.Up | Arm.Right]: '╰',
  [Arm.Down | Arm.Right]: '╭',
};

export function lineGlyph(mask: number, h: Weight, v: Weight, dashed: boolean, round: boolean): string {
  if (mask === 0) return ' ';
  const vertical = (mask & (Arm.Left | Arm.Right)) === 0;
  const horizontal = (mask & (Arm.Up | Arm.Down)) === 0;
  if (dashed && (vertical || horizontal)) {
    const w = vertical ? v : h;
    if (w !== Weight.Double) return vertical ? (w === Weight.Heavy ? '┇' : '┆') : w === Weight.Heavy ? '┅' : '┄';
  }
  if (horizontal) v = h;
  if (vertical) h = v;
  if (round && h === Weight.Light && v === Weight.Light && ROUND[mask]) return ROUND[mask];
  if (h === v) return (h === Weight.Heavy ? HEAVY : h === Weight.Double ? DOUBLE : LIGHT)[mask];
  const mixed = MIXED[`${h}${v}`];
  if (mixed) return mixed[mask];
  // 粗线和双线混在一起时没有对应字符，退成细线。
  return LIGHT[mask];
}

// 纯 ASCII 输出时的线条字符。
export function asciiLineGlyph(mask: number, h: Weight, _v: Weight, dashed: boolean, round: boolean): string {
  if (mask === 0) return ' ';
  const vertical = (mask & (Arm.Left | Arm.Right)) === 0;
  const horizontal = (mask & (Arm.Up | Arm.Down)) === 0;
  if (vertical) return dashed ? ':' : '|';
  if (horizontal) return h === Weight.Double ? '=' : '-';
  if (round) {
    if (mask === (Arm.Down | Arm.Right) || mask === (Arm.Down | Arm.Left)) return '.';
    if (mask === (Arm.Up | Arm.Right) || mask === (Arm.Up | Arm.Left)) return "'";
  }
  return '+';
}

// 符号（箭头、标记、图表方块）在纯 ASCII 下的替代字符。不在表里的字符原样输出（文字、中文都保留）。
const ASCII_SYMBOLS: Record<string, string> = {
  '▲': '^', '▼': 'v', '◀': '<', '▶': '>', '△': '^', '▽': 'v', '◁': '<', '▷': '>',
  '↑': '^', '↓': 'v', '←': '<', '→': '>', '⇢': '>', '⇠': '<',
  '●': '*', '○': 'o', '◉': '@', '◎': '@', '◆': '*', '◇': 'o', '■': '#', '□': '#', '▪': '#', '▫': '.',
  '×': 'x', '✕': 'x', '✓': 'v', '★': '*', '☆': '*', '•': '*', '·': '.', '…': '~',
  '█': '#', '▉': '#', '▊': '#', '▋': '#', '▌': '#', '▍': '|', '▎': '|', '▏': '|',
  '▁': '_', '▂': '_', '▃': '=', '▄': '=', '▅': '=', '▆': '#', '▇': '#', '▀': '"', '▐': '#',
  '░': '.', '▒': ':', '▓': '#',
  '╱': '/', '╲': '\\', '╳': 'X',
  '┄': '-', '┅': '-', '┆': ':', '┇': ':', '─': '-', '━': '-', '═': '=', '│': '|', '┃': '|', '║': '|',
  '╭': '.', '╮': '.', '╰': "'", '╯': "'",
  '├': '+', '┤': '+', '┬': '+', '┴': '+', '┼': '+', '┌': '+', '┐': '+', '└': '+', '┘': '+',
  '╟': '+', '╢': '+', '╞': '+', '╡': '+', '╤': '+', '╧': '+', '╪': '+', '╫': '+',
  '⊕': '+', '⊗': 'x', '◐': 'o', '◑': 'o', '⬤': '*',
};

export function asciiSymbol(ch: string): string {
  return ASCII_SYMBOLS[ch] ?? ch;
}

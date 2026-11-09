// 把 Mermaid 标签（可能带 HTML 标签、Markdown、<br>、实体）转成终端里的若干行纯文本。
// 解析、换行、折行都复用 pele 的 layoutLabel，只是把「宽度」换成终端列数。

import { layoutLabel } from '../../text/label.js';
import type { TextMeasurer } from '../../text/measurer.js';
import { displayWidth } from './width.js';

// 排版换算：一格按 CX × CY 像素算。复用 pele 的像素排版时，节点尺寸乘上它，结果再除回来。
export const CX = 8;
export const CY = 16;

// 让 pele 按「终端列数 × CX」量文字宽度。
export const cellMeasurer: TextMeasurer = {
  width: (text) => displayWidth(text) * CX,
};

export interface TextBlock {
  lines: string[];
  // 最宽一行的列数。
  width: number;
  // 行数。
  height: number;
}

export const EMPTY_BLOCK: TextBlock = { lines: [], width: 0, height: 0 };

export interface LabelOptions {
  // 超过这么多列就折行。默认不折。
  maxWidth?: number;
  // 标签是 Markdown（流程图里 "`...`" 包起来的标签）。
  markdown?: boolean;
}

// 标签 → 行。空标签返回 EMPTY_BLOCK。
export function label(raw: string | undefined, options: LabelOptions = {}): TextBlock {
  if (raw === undefined || raw.trim() === '') return EMPTY_BLOCK;
  const max = options.maxWidth !== undefined && options.maxWidth > 0 ? options.maxWidth * CX : 1e9;
  const laid = layoutLabel(raw, options.markdown === true, cellMeasurer, 16, max);
  const lines = laid.lines.map((spans) =>
    spans
      .map((s) => (s.icon !== undefined ? '' : s.text))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
  );
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) return EMPTY_BLOCK;
  let width = 0;
  for (const line of lines) width = Math.max(width, displayWidth(line));
  return { lines, width, height: lines.length };
}

// 只要一行：多行用空格接起来。
export function oneLine(raw: string | undefined): string {
  return label(raw).lines.join(' ');
}

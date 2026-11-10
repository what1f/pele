// pele/ascii：把 Mermaid 画成终端里的字符图。
//
//   import { renderAscii } from 'pele/ascii';
//   const { text } = renderAscii(source, { maxWidth: process.stdout.columns });
//
// 解析用 pele 自己的 parse()，每种图在 ./diagrams/ 下有一个字符渲染器，由 ./diagrams/all.ts 统一注册。

import { parse } from '../index.js';
import { preprocess } from '../preprocess.js';
import { Canvas } from './canvas/canvas.js';
import { AsciiError, registerAscii, rendererFor, type AsciiContext, type AsciiOptions, type AsciiResult } from './core.js';
import { oneLine } from './text/label.js';
import { displayWidth, truncate } from './text/width.js';
import { all } from './diagrams/all.js';

registerAscii(...all);

export { AsciiError, asciiSupports, registerAscii } from './core.js';
export type { AsciiContext, AsciiDiagram, AsciiErrorCode, AsciiOptions, AsciiRenderer, AsciiResult } from './core.js';
export { Canvas } from './canvas/canvas.js';
export { displayWidth } from './text/width.js';
// 这里本来就带着整个 pele，一并导出 SVG 渲染，两样都要的不用再打一份解析器
export { render } from '../index.js';

export function renderAscii(source: string, options: AsciiOptions = {}): AsciiResult {
  const model = parse(source, { config: options.config });
  // Swimlanes reuse FlowDb, whose type is flowchart. The parser retains the authored type.
  const type = model.mermaidType === 'swimlane' ? 'swimlane' : model.type;
  const renderer = rendererFor(type);
  if (renderer === undefined) throw new AsciiError(`No ASCII renderer for "${type}" diagrams yet.`, 'unsupported', type);
  const extra = options.config;
  const own = preprocess(source).config;
  const config = extra ? { ...extra, ...own } : own;
  const maxWidth = options.maxWidth !== undefined && options.maxWidth > 0 ? options.maxWidth : Infinity;
  const charset = options.charset ?? 'unicode';

  const draw = (compact: boolean): string[] => {
    const ctx: AsciiContext = { maxWidth, compact, config };
    return withTitle(renderer(model, ctx), titleOf(model), maxWidth).toLines(charset);
  };
  let lines = draw(false);
  if (widest(lines) > maxWidth) lines = draw(true);
  const width = widest(lines);
  if (width > maxWidth) {
    throw new AsciiError(`Diagram needs ${width} columns, ${maxWidth} available.`, 'too-wide', type);
  }
  return { text: lines.join('\n'), lines, width, height: lines.length, type };
}

function widest(lines: string[]): number {
  let w = 0;
  for (const line of lines) w = Math.max(w, displayWidth(line));
  return w;
}

function titleOf(model: object): string {
  const title = (model as { title?: unknown }).title;
  return typeof title === 'string' ? oneLine(title) : '';
}

// 标题居中放在图的上方，空一行。
function withTitle(canvas: Canvas, title: string, maxWidth: number): Canvas {
  const b = canvas.bounds();
  if (title === '') return canvas;
  if (b === undefined) {
    canvas.text(0, 0, truncate(title, maxWidth), { role: 'title' });
    return canvas;
  }
  const text = truncate(title, Math.min(maxWidth, Math.max(b.w, displayWidth(title))));
  const out = new Canvas();
  const tw = displayWidth(text);
  const x = Math.max(0, (b.w - tw) >> 1);
  out.text(x, 0, text, { role: 'title' });
  out.blit(canvas, -b.x, -b.y + 2);
  return out;
}

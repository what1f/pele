// ASCII 渲染的注册表和调度。解析交给 pele 的 parse()，每种图的字符渲染器只负责「模型 → 画布」。

import type { Config } from '../preprocess.js';
import type { DiagramModel } from '../models.js';
import type { Canvas } from './canvas/canvas.js';

export interface AsciiOptions {
  // 可用的终端列数。超出时渲染器先尝试紧凑排版，仍然放不下就抛 AsciiError('too-wide')。不填表示不限。
  maxWidth?: number;
  // 'unicode'（默认）用框线字符；'ascii' 只用 + - | 这类 ASCII 字符画线（文字照常保留）。
  charset?: 'unicode' | 'ascii';
  // 额外的 Mermaid 配置，和 pele 的 RenderOptions.config 一样。
  config?: Config;
}

export interface AsciiResult {
  // 画好的文本，行尾无空格，行间用 \n 连接。
  text: string;
  lines: string[];
  // 最宽一行的显示列数、行数。
  width: number;
  height: number;
  type: string;
}

// 渲染器拿到的上下文。
export interface AsciiContext {
  // 可用列数；不限时为 Infinity。
  maxWidth: number;
  // true 表示上一次按正常间距画出来太宽，这次请尽量紧凑（缩小间距、改方向、折行）。
  compact: boolean;
  // 文档 frontmatter 里的配置合并上调用方传入的 config。
  config: Config;
}

// 一种图的字符渲染器：模型 → 画布。画布坐标随意，输出时会裁剪到实际用到的范围。
export type AsciiRenderer<M = DiagramModel> = (model: M, ctx: AsciiContext) => Canvas;

// 每个 diagrams/<type>.ts 导出一个，由 diagrams/all.ts 收集。type 和 pele 的 DiagramType 一致。
export interface AsciiDiagram<M = any> {
  type: string;
  render: AsciiRenderer<M>;
}

export type AsciiErrorCode = 'unsupported' | 'too-wide';

export class AsciiError extends Error {
  code: AsciiErrorCode;
  type: string | undefined;
  constructor(message: string, code: AsciiErrorCode, type?: string) {
    super(message);
    this.name = 'AsciiError';
    this.code = code;
    this.type = type;
  }
}

const renderers = new Map<string, AsciiRenderer<any>>();

// 按模型的 type 字段注册（'flowchart'、'sequence'、'state' …，和 pele 的 DiagramType 一致）。
export function registerAscii(...list: AsciiDiagram[]): void {
  for (const d of list) renderers.set(d.type, d.render);
}

export function asciiSupports(type: string): boolean {
  return renderers.has(type);
}

export function rendererFor(type: string): AsciiRenderer<any> | undefined {
  return renderers.get(type);
}

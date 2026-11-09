import type { CynefinModel, DomainName } from '../../diagrams/cynefin/model.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { wrappedLabel } from '../text/wrapped-label.js';
import { displayWidth } from '../text/width.js';

const META: Record<DomainName, readonly [string, string, string]> = {
  complex: ['Complex', 'Probe → Sense → Respond', 'Emergent Practices'],
  complicated: ['Complicated', 'Sense → Analyse → Respond', 'Good Practices'],
  chaotic: ['Chaotic', 'Act → Sense → Respond', 'Novel Practices'],
  clear: ['Clear', 'Sense → Categorise → Respond', 'Best Practices'],
  confusion: ['Confusion', '', 'Disorder'],
};

function render(model: CynefinModel, ctx: AsciiContext): Canvas {
  const canvas = new Canvas();
  const conf = ctx.config.cynefin as Record<string, unknown> | undefined;
  const room = Math.max(12, Math.min(ctx.compact ? 24 : 30, Math.floor((ctx.maxWidth - 10) / 2)));
  const block = (name: DomainName) => {
    const [title, ...descriptions] = META[name];
    const lines: string[] = [];
    if (conf?.showDomainDescriptions !== false) {
      for (const description of descriptions) lines.push(...wrappedLabel(description, room).lines);
    }
    for (const item of model.domains.get(name)?.items ?? []) {
      const text = wrappedLabel(item.label, room);
      if (!text.height) continue;
      if (lines.length) lines.push('');
      lines.push(...text.lines);
    }
    return { title, lines, width: Math.max(displayWidth(title) + 6, 4 + Math.max(0, ...lines.map(displayWidth))), height: lines.length ? lines.length + 4 : 3 };
  };
  const names: DomainName[] = ['complex', 'complicated', 'chaotic', 'clear', 'confusion'];
  const blocks = new Map(names.map(name => [name, block(name)]));
  const column = Math.max(...[...blocks.values()].map(b => b.width));
  const totalWidth = column * 2 + 2;
  const draw = (name: DomainName, x: number, y: number, height?: number) => {
    const b = blocks.get(name)!;
    const h = height ?? b.height;
    canvas.box(x, y, column, h);
    canvas.text(x + 2, y, ` ${b.title} `, { role: 'title' });
    b.lines.forEach((line, k) => canvas.textIn(x + 2, y + 2 + k, column - 4, line));
    return h;
  };
  const topHeight = Math.max(blocks.get('complex')!.height, blocks.get('complicated')!.height);
  draw('complex', 0, 0, topHeight);
  draw('complicated', column + 2, 0, topHeight);
  let y = topHeight + 1;
  y += draw('confusion', Math.floor((totalWidth - column) / 2), y) + 1;
  const bottomHeight = Math.max(blocks.get('chaotic')!.height, blocks.get('clear')!.height);
  draw('chaotic', 0, y, bottomHeight);
  draw('clear', column + 2, y, bottomHeight);
  y += bottomHeight + 1;
  // A separate row per transition keeps repeated and diagonal moves unambiguous.
  for (const transition of model.transitions) {
    const from = META[transition.from][0], to = META[transition.to][0];
    const sourceWidth = displayWidth(from) + 4;
    const targetWidth = displayWidth(to) + 4;
    const text = wrappedLabel(transition.label, Math.max(2, totalWidth - sourceWidth - targetWidth - 4));
    const gap = Math.max(4, text.width + 4);
    const targetX = sourceWidth + gap;
    const lineY = y + Math.max(1, text.height);
    canvas.box(0, lineY - 1, sourceWidth, 3);
    canvas.textIn(1, lineY, sourceWidth - 2, from);
    canvas.box(targetX, lineY - 1, targetWidth, 3);
    canvas.textIn(targetX + 1, lineY, targetWidth - 2, to);
    canvas.segment(sourceWidth - 1, lineY, targetX, lineY);
    canvas.put(targetX - 1, lineY, '▶');
    text.lines.forEach((line, k) => canvas.textIn(sourceWidth + 1, y + k, gap - 2, line));
    y = lineY + 3;
  }
  return canvas;
}

export const cynefin: AsciiDiagram<CynefinModel> = { type: 'cynefin', render };

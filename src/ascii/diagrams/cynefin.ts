import type { CynefinModel, DomainName } from '../../diagrams/cynefin/model.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { wrappedLabel } from '../text/wrapped-label.js';
import { label } from '../text/label.js';
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
  const top: typeof model.transitions = [], bottom: typeof model.transitions = [];
  const vertical: { transition: typeof model.transitions[number]; left: boolean }[] = [];
  const fallback: typeof model.transitions = [];
  for (const transition of model.transitions) {
    const pair = [transition.from, transition.to].sort().join(' ');
    if (pair === 'complex complicated') top.push(transition);
    else if (pair === 'chaotic clear') bottom.push(transition);
    else if (pair === 'chaotic complex' || pair === 'clear complicated') {
      const left = pair === 'chaotic complex';
      vertical.push({ transition, left });
    } else fallback.push(transition);
  }
  const horizontalRoom = Math.max(2, Math.min(ctx.compact ? 16 : 28,
    ctx.compact ? ctx.maxWidth - column * 2 - 4 : Infinity));
  const horizontal = (transitions: typeof model.transitions) => transitions.map(transition => ({
    transition, text: wrappedLabel(transition.label, horizontalRoom),
  }));
  const topEdges = horizontal(top), bottomEdges = horizontal(bottom);
  const gap = Math.max(model.transitions.length ? 4 : 2, ...[...topEdges, ...bottomEdges].map(edge => edge.text.width + 4));
  const rightX = column + gap;
  const totalWidth = column * 2 + gap;
  const center = Math.floor(column / 2);
  const confusionLeft = Math.floor((totalWidth - column) / 2);
  const confusionRight = confusionLeft + column - 1;
  const lanes = new Map<boolean, number>();
  const bands = new Map<boolean, number>();
  const verticalEdges = vertical.flatMap(edge => {
    const lane = lanes.get(edge.left) ?? 0;
    const text = wrappedLabel(edge.transition.label, Math.max(2, Math.min(center - 3, column - center - 3)));
    // A second labeled lane would put its label nearer the first line.
    if (lane > 0 && text.height) { fallback.push(edge.transition); return []; }
    const localX = center + (edge.left ? 2 : -2) * lane;
    const x = (edge.left ? 0 : rightX) + localX;
    const name: DomainName = edge.left ? 'chaotic' : 'clear';
    if (localX < displayWidth(META[name][0]) + 6 || localX > column - 3 ||
      (edge.left ? x >= confusionLeft - 1 : x <= confusionRight + 1)) {
      fallback.push(edge.transition);
      return [];
    }
    lanes.set(edge.left, lane + 1);
    const band = bands.get(edge.left) ?? 0;
    bands.set(edge.left, band + text.height + 1);
    return [{ ...edge, text, x, band }];
  });
  const edgeHeight = (edges: typeof topEdges) => edges.reduce((height, edge) => height + Math.max(1, edge.text.height) + 2, 2);
  const topHeight = Math.max(blocks.get('complex')!.height, blocks.get('complicated')!.height, edgeHeight(topEdges));
  const bottomHeight = Math.max(blocks.get('chaotic')!.height, blocks.get('clear')!.height, edgeHeight(bottomEdges));
  const confusionY = topHeight + Math.max(0, ...bands.values()) + 1;
  const bottomY = confusionY + blocks.get('confusion')!.height + 1;
  const draw = (name: DomainName, x: number, y: number, height?: number) => {
    const b = blocks.get(name)!;
    canvas.box(x, y, column, height ?? b.height);
    canvas.text(x + 2, y, ` ${b.title} `, { role: 'title' });
    b.lines.forEach((line, k) => canvas.textIn(x + 2, y + 2 + k, column - 4, line));
  };
  draw('complex', 0, 0, topHeight);
  draw('complicated', rightX, 0, topHeight);
  draw('confusion', Math.floor((totalWidth - column) / 2), confusionY);
  draw('chaotic', 0, bottomY, bottomHeight);
  draw('clear', rightX, bottomY, bottomHeight);
  const drawHorizontal = (edges: typeof topEdges, topY: number) => {
    let y = topY + 1;
    for (const { transition, text } of edges) {
      const arrowY = y + Math.max(1, text.height);
      const toRight = transition.from === 'complex' || transition.from === 'chaotic';
      canvas.segment(column - 1, arrowY, rightX, arrowY);
      canvas.put(toRight ? rightX - 1 : column, arrowY, toRight ? '▶' : '◀');
      text.lines.forEach((line, k) => canvas.textIn(column + 1, y + k, gap - 2, line));
      y = arrowY + 2;
    }
  };
  drawHorizontal(topEdges, 0);
  drawHorizontal(bottomEdges, bottomY);
  for (const { transition, left, text, x, band } of verticalEdges) {
    const down = transition.from === 'complex' || transition.from === 'complicated';
    canvas.segment(x, topHeight - 1, x, bottomY);
    canvas.put(x, down ? bottomY - 1 : topHeight, down ? '▼' : '▲');
    const textX = left ? center - text.width - 2 : rightX + center + 2;
    text.lines.forEach((line, k) => canvas.text(textX, topHeight + 1 + band + k, line));
  }
  // Moves without a clear lane around the center remain readable as text.
  let y = bottomY + bottomHeight + 1;
  for (const transition of fallback) {
    const from = META[transition.from][0], to = META[transition.to][0];
    const description = label(transition.label).lines.join(' ');
    const raw = description ? `${from} ─ ${description} ─▶ ${to}` : `${from} ─▶ ${to}`;
    const text = wrappedLabel(raw, Math.min(totalWidth, ctx.maxWidth));
    text.lines.forEach((line, k) => canvas.text(0, y + k, line));
    y += text.height + 1;
  }
  return canvas;
}

export const cynefin: AsciiDiagram<CynefinModel> = { type: 'cynefin', render };

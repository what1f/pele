import type { VennModel, VennSubset } from '../../diagrams/venn/types.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { label, type TextBlock } from '../text/label.js';
import { displayWidth } from '../text/width.js';
import { wrappedLabel } from '../text/wrapped-label.js';

function render(model: VennModel, ctx: AsciiContext): Canvas {
  const canvas = new Canvas();
  const key = (sets: string[]) => JSON.stringify(sets);
  const subsets = new Map<string, VennSubset>();
  for (const subset of model.subsets) subsets.set(key(subset.sets), subset);
  const singles = [...subsets.values()].filter(subset => subset.sets.length === 1);
  const ids = singles.map(subset => subset.sets[0]);
  const room = ctx.compact ? 14 : 24;
  const titles = singles.map(subset => wrappedLabel(subset.label ?? subset.sets[0], room));
  const region = (members: number[]): TextBlock => {
    const sets = members.map(i => ids[i]).sort();
    const subset = subsets.get(key(sets));
    const lines = members.length === 1 ? titles[members[0]].lines.slice(1) : wrappedLabel(subset?.label, room).lines;
    for (const node of model.textNodes) {
      if (key(node.sets) === key(sets)) lines.push(...wrappedLabel(node.label ?? node.id, room).lines);
    }
    return { lines, width: Math.max(0, ...lines.map(displayWidth)), height: lines.length };
  };
  const list = () => {
    let y = 0;
    const rows = [...subsets.values()].sort((a, b) => a.sets.length - b.sets.length);
    for (const subset of rows) {
      const raw = [subset.sets.join(' & '), subset.label,
        ...model.textNodes.filter(node => key(node.sets) === key(subset.sets)).map(node => node.label ?? node.id)]
        .filter(Boolean).map(text => label(text).lines.join(' ')).join(' · ');
      const text = wrappedLabel(raw, Math.max(2, Math.min(72, ctx.maxWidth)));
      text.lines.forEach((line, k) => canvas.text(0, y + k, line));
      y += Math.max(1, text.height);
    }
    return canvas;
  };
  if (!ids.length || ids.length > 3) return list();
  const outline = (left: number, top: number, right: number, bottom: number) =>
    canvas.path([[left, top], [right, top], [right, bottom], [left, bottom], [left, top]]);
  const textIn = (text: TextBlock, left: number, top: number, right: number, bottom: number) => {
    const y = top + Math.floor((bottom - top + 1 - text.height) / 2);
    text.lines.forEach((line, k) => canvas.textIn(left, y + k, right - left + 1, line));
  };
  const title = (i: number) => titles[i].lines[0] ?? ids[i];
  const a = region([0]);
  if (ids.length === 1) {
    const width = Math.max(a.width + 4, displayWidth(title(0)) + 6);
    if (width > ctx.maxWidth) return ctx.compact ? list() : render(model, { ...ctx, compact: true });
    outline(0, 0, width - 1, Math.max(3, a.height + 3));
    canvas.text(2, 0, ` ${title(0)} `, { role: 'title' });
    textIn(a, 2, 2, width - 3, Math.max(2, a.height + 1));
    return canvas;
  }
  const b = region([1]), ab = region([0, 1]);
  if (ids.length === 2) {
    const left = Math.max(a.width + 4, displayWidth(title(0)) + 6);
    const middle = Math.max(4, ab.width + 4);
    const right = Math.max(b.width + 4, displayWidth(title(1)) + 6);
    const endA = left + middle, endB = endA + right;
    if (endB + 1 > ctx.maxWidth) return ctx.compact ? list() : render(model, { ...ctx, compact: true });
    const bottomA = Math.max(1, a.height, b.height, ab.height) + 5;
    outline(0, 0, endA, bottomA);
    outline(left, 2, endB, bottomA + 2);
    canvas.text(2, 0, ` ${title(0)} `, { role: 'title' });
    canvas.text(endA + 2, 2, ` ${title(1)} `, { role: 'title' });
    textIn(a, 2, 4, left - 2, bottomA - 2);
    textIn(ab, left + 2, 4, endA - 2, bottomA - 2);
    textIn(b, endA + 2, 4, endB - 2, bottomA - 2);
    return canvas;
  }
  const c = region([2]), ac = region([0, 2]), bc = region([1, 2]), abc = region([0, 1, 2]);
  let acWidth = Math.max(4, ac.width + 4, displayWidth(title(2)) + 6);
  let bcWidth = Math.max(4, bc.width + 4);
  const middle = Math.max(4, ab.width + 4, abc.width + 4);
  const extra = Math.max(0, c.width + 4 - acWidth - middle - bcWidth);
  acWidth += Math.ceil(extra / 2);
  bcWidth += Math.floor(extra / 2);
  const left = Math.max(3, a.width + 4 - acWidth, displayWidth(title(0)) + 6 - acWidth);
  const right = Math.max(3, b.width + 4 - bcWidth, displayWidth(title(1)) + 6 - bcWidth);
  const x1 = left, x2 = x1 + acWidth, x3 = x2 + middle, x4 = x3 + bcWidth, x5 = x4 + right;
  if (x5 + 1 > ctx.maxWidth) return ctx.compact ? list() : render(model, { ...ctx, compact: true });
  const middleY = Math.max(1, a.height, b.height, ab.height) + 5;
  const bottomA = middleY + Math.max(1, ac.height, bc.height, abc.height) + 3;
  const bottomB = bottomA + 2;
  const bottomC = bottomB + (c.height ? c.height + 3 : 2);
  outline(0, 0, x3, bottomA);
  outline(x2, 2, x5, bottomB);
  outline(x1, middleY, x4, bottomC);
  canvas.text(2, 0, ` ${title(0)} `, { role: 'title' });
  canvas.text(x3 + 2, 2, ` ${title(1)} `, { role: 'title' });
  canvas.text(x1 + 2, middleY, ` ${title(2)} `, { role: 'title' });
  textIn(a, 2, 4, x2 - 2, middleY - 2);
  textIn(ab, x2 + 2, 4, x3 - 2, middleY - 2);
  textIn(b, x3 + 2, 4, x5 - 2, middleY - 2);
  textIn(ac, x1 + 2, middleY + 2, x2 - 2, bottomA - 2);
  textIn(abc, x2 + 2, middleY + 2, x3 - 2, bottomA - 2);
  textIn(bc, x3 + 2, middleY + 2, x4 - 2, bottomA - 2);
  textIn(c, x1 + 2, bottomB + 2, x4 - 2, bottomC - 2);
  return canvas;
}

export const venn: AsciiDiagram<VennModel> = { type: 'venn', render };

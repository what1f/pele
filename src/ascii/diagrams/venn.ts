import type { VennModel, VennSubset } from '../../diagrams/venn/types.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { wrappedLabel } from '../text/wrapped-label.js';
import { displayWidth } from '../text/width.js';

function render(model: VennModel, ctx: AsciiContext): Canvas {
  const canvas = new Canvas();
  const key = (sets: string[]) => JSON.stringify(sets);
  const subsets = new Map<string, VennSubset>();
  for (const subset of model.subsets) subsets.set(key(subset.sets), subset);
  const max = Math.max(0, ...[...subsets.values()].map(subset => subset.size));
  const barWidth = ctx.compact ? 12 : 20;
  const valueWidth = Math.max(1, ...[...subsets.values()].map(subset => displayWidth(String(subset.size))));
  const room = Math.max(2, Math.min(ctx.compact ? 36 : 48, ctx.maxWidth - barWidth - valueWidth - 4));
  const rows = [...subsets.values()].map(subset => {
    const relation = wrappedLabel(subset.sets.join(' & '), room);
    const title = wrappedLabel(subset.label, room);
    const lines = [...relation.lines];
    if (subset.label !== undefined && subset.label !== subset.sets.join(' & ')) lines.push(...title.lines);
    for (const node of model.textNodes) {
      if (key(node.sets) === key(subset.sets)) {
        lines.push(...wrappedLabel(node.label ?? node.id, Math.max(2, room - 2)).lines.map(line => `  ${line}`));
      }
    }
    return { subset, lines };
  });
  const width = Math.max(1, ...rows.flatMap(row => row.lines.map(displayWidth)));
  let y = 0;
  for (const { subset, lines } of rows) {
    lines.forEach((line, k) => canvas.text(0, y + k, line));
    // Intersections are not additive: compare areas to the largest stated region.
    const length = max > 0 && subset.size > 0 ? Math.max(1, Math.round(subset.size / max * barWidth)) : 0;
    canvas.text(width + 2, y, '█'.repeat(length), { role: 'accent' });
    canvas.text(width + barWidth + 3, y, String(subset.size));
    y += Math.max(1, lines.length) + 1;
  }
  return canvas;
}

export const venn: AsciiDiagram<VennModel> = { type: 'venn', render };

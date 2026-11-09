import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext } from '../core.js';
import { label } from '../text/label.js';
import { wrap } from '../text/width.js';

export interface ProportionRow {
  name: string;
  value: number;
  depth?: number;
  ancestors?: boolean[];
  last?: boolean;
  detail?: string;
}

export function drawProportions(rows: ProportionRow[], total: number, ctx: AsciiContext): Canvas {
  const canvas = new Canvas();
  const width = ctx.compact ? Math.min(72, ctx.maxWidth) : 72;
  const barWidth = Math.max(1, Math.min(20, width - 14));
  let y = 0;
  for (const row of rows) {
    const depth = row.depth ?? 0;
    const x = depth * 3;
    const lines = label(row.name).lines.flatMap(line => wrap(line, Math.max(2, width - x)));
    const share = total > 0 ? row.value / total : 0;
    const percent = `${Number((share * 100).toPrecision(4))}%`;
    const detail = row.detail === undefined ? percent : `${row.detail}  ${percent}`;
    const bars = Math.round(Math.max(0, Math.min(1, share)) * barWidth);
    const h = Math.max(1, lines.length) + 1;
    for (let d = 0; d < depth - 1; d++) {
      if (row.ancestors?.[d + 1]) canvas.segment(d * 3, y - 1, d * 3, y + h - 1);
    }
    if (depth > 0) {
      canvas.segment(x - 3, y - 1, x - 3, row.last ? y : y + h - 1);
      canvas.segment(x - 3, y, x - 2, y);
    }
    lines.forEach((line, i) => canvas.text(x, y + i, line));
    const by = y + Math.max(1, lines.length);
    if (bars > 0) canvas.text(x, by, '█'.repeat(bars), { role: 'accent' });
    const dx = x + barWidth + 2;
    const details = wrap(detail, Math.max(2, width - dx));
    details.forEach((line, i) => canvas.text(dx, by + i, line, { role: 'muted' }));
    y += h + Math.max(0, details.length - 1) + 1;
  }
  return canvas;
}

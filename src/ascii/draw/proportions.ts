import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext } from '../core.js';
import { label } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

export interface ProportionRow {
  name: string;
  value: number;
  depth?: number;
  ancestors?: boolean[];
  last?: boolean;
  detail?: string;
}

const FRACTIONS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

export function drawProportions(rows: ProportionRow[], total: number, ctx: AsciiContext): Canvas {
  const canvas = new Canvas();
  const width = Math.min(80, ctx.maxWidth);
  const prepared = rows.map(row => ({
    ...row,
    depth: row.depth ?? 0,
    lines: label(row.name).lines,
    share: total > 0 ? row.value / total : 0,
  }));
  let naturalLabelWidth = 0;
  let minimumLabelWidth = 2;
  let detailWidth = 0;
  let percentWidth = 0;
  const percentages = prepared.map(row => `${(row.share * 100).toFixed(1)}%`);
  prepared.forEach((row, i) => {
    const indent = row.depth * 3;
    minimumLabelWidth = Math.max(minimumLabelWidth, indent + 2);
    for (const line of row.lines) naturalLabelWidth = Math.max(naturalLabelWidth, indent + displayWidth(line));
    detailWidth = Math.max(detailWidth, displayWidth(row.detail ?? ''));
    percentWidth = Math.max(percentWidth, displayWidth(percentages[i]));
  });
  const detailRoom = detailWidth > 0 ? detailWidth + 2 : 0;
  const labelWidth = Math.max(minimumLabelWidth,
    Math.min(naturalLabelWidth, 24, Math.floor(width / 3), width - detailRoom - percentWidth - 5));
  const barWidth = Math.max(1, Math.min(40, width - labelWidth - detailRoom - percentWidth - 4));
  const barX = labelWidth + 2;
  const detailX = barX + barWidth + 2;
  const percentX = detailX + detailRoom;

  let y = 0;
  prepared.forEach((row, i) => {
    const x = row.depth * 3;
    const lines = row.lines.flatMap(line => wrap(line, labelWidth - x));
    const height = Math.max(1, lines.length);
    for (let j = 0; j < height; j++) {
      for (let d = 0; d < row.depth - 1; d++) {
        if (row.ancestors?.[d + 1]) canvas.text(d * 3, y + j, '│');
      }
      if (row.depth > 0) {
        const branch = j === 0 ? (row.last ? '└─' : '├─') : (row.last ? '' : '│');
        canvas.text(x - 3, y + j, branch);
      }
      canvas.text(x, y + j, lines[j] ?? '');
    }
    const eighths = Math.round(Math.max(0, Math.min(1, row.share)) * barWidth * 8);
    const bar = '█'.repeat(Math.floor(eighths / 8)) + FRACTIONS[eighths % 8];
    if (bar !== '') canvas.text(barX, y, bar, { role: 'accent' });
    if (row.detail !== undefined) canvas.textIn(detailX, y, detailWidth, row.detail, 'right', { role: 'muted' });
    canvas.textIn(percentX, y, percentWidth, percentages[i], 'right', { role: 'muted' });
    y += height;
  });
  return canvas;
}

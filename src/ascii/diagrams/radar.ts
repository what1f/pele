import type { RadarModel } from '../../diagrams/radar/model.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { barText, chartNumber as num, fraction } from '../draw/chart.js';
import { label } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

function render(model: RadarModel, ctx: AsciiContext): Canvas {
  const c = new Canvas();
  const available = Math.min(ctx.maxWidth, 104);
  const max = model.options.max ?? Math.max(model.options.min, ...model.curves.flatMap(curve => curve.entries));
  const amount = (value: number) => max === model.options.min ? 0 : fraction(value, model.options.min, max);
  const axisWidth = Math.min(ctx.compact ? 12 : 20, Math.max(2, ...model.axes.map(a => label(a.label).width)));
  const names = model.curves.map(curve => label(curve.label).lines.flatMap(s => wrap(s, 20)));
  const numberWidth = Math.max(1, ...model.curves.flatMap(curve => curve.entries.map(v => displayWidth(num(v)))));
  const barWidth = ctx.compact ? 12 : 18;
  const column = Math.max(barWidth + numberWidth + 2, ...names.flat().map(displayWidth));
  const grouped = axisWidth + 2 + model.curves.length * (column + 3) - 3 <= available;
  const axisLines = model.axes.map(a => label(a.label).lines.flatMap(s => wrap(s, axisWidth)));
  if (grouped) {
    let y = Math.max(0, ...names.map(n => n.length));
    names.forEach((lines, i) => lines.forEach((s, k) => c.textIn(axisWidth + 2 + i * (column + 3), k, column, s)));
    if (y) y++;
    model.axes.forEach((_, i) => {
      axisLines[i].forEach((s, k) => c.text(0, y + k, s));
      model.curves.forEach((curve, j) => {
        if (curve.entries.length !== model.axes.length) return;
        const x = axisWidth + 2 + j * (column + 3), value = curve.entries[i];
        c.text(x, y, barText(amount(value) * barWidth, barWidth));
        c.textIn(x + barWidth + 1, y, numberWidth, num(value), 'right');
      });
      y += Math.max(1, axisLines[i].length);
    });
  } else {
    const nameWidth = Math.max(2, Math.min(20, Math.floor(available / 3), Math.max(2, ...names.flat().map(displayWidth))));
    const span = Math.max(2, Math.min(24, available - nameWidth - numberWidth - 6));
    let y = 0;
    model.axes.forEach((axis, i) => {
      label(axis.label).lines.flatMap(s => wrap(s, Math.max(2, available))).forEach(s => c.text(0, y++, s));
      model.curves.forEach(curve => {
        const lines = label(curve.label).lines.flatMap(s => wrap(s, nameWidth));
        lines.forEach((s, k) => c.text(2, y + k, s));
        if (curve.entries.length === model.axes.length) {
          const value = curve.entries[i];
          c.text(nameWidth + 4, y, barText(amount(value) * span, span));
          c.textIn(nameWidth + span + 5, y, numberWidth, num(value), 'right');
        }
        y += Math.max(1, lines.length);
      });
      y++;
    });
  }
  return c;
}
export const radar: AsciiDiagram<RadarModel> = { type: 'radar', render };

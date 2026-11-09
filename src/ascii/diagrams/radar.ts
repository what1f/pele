import type { RadarModel } from '../../diagrams/radar/model.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { chartLine, chartNumber as num, chartText, fraction } from '../draw/chart.js';
import { displayWidth } from '../text/width.js';

function render(model: RadarModel, ctx: AsciiContext): Canvas {
  const c = new Canvas();
  const width = Math.max(18, Math.min(ctx.compact ? ctx.maxWidth : 68, 68));
  const rx = Math.max(6, Math.floor((width - 12) / 2)), ry = ctx.compact ? 8 : 10;
  const cx = rx + 5, cy = ry + 1;
  const units = model.axes.map((_, i) => {
    const a = 2 * Math.PI * i / model.axes.length - Math.PI / 2;
    return [Math.cos(a), Math.sin(a)] as const;
  });
  const min = model.options.min;
  const values = model.curves.flatMap(curve => curve.entries).filter(Number.isFinite);
  const max = model.options.max ?? Math.max(min, ...values);
  let top = 0;
  const panels = model.curves.length ? model.curves : [undefined];
  for (const curve of panels) {
    if (top) top++;
    if (curve && model.options.showLegend) top += chartText(c, curve.label, 0, top, width);
    const origin = top;
    const at = (u: readonly [number, number], r: number): [number, number] => [Math.round(cx + rx * u[0] * r), Math.round(origin + cy + ry * u[1] * r)];
    for (let t = 1; t <= model.options.ticks; t++) {
      const r = t / model.options.ticks;
      if (model.options.graticule === 'circle') {
        const n = Math.ceil(rx * 8);
        for (let j = 0; j < n; j++) { const a = 2 * Math.PI * j / n; const p = at([Math.cos(a), Math.sin(a)], r); c.put(p[0], p[1], '·'); }
      } else units.forEach((u, i) => chartLine(c, at(u, r), at(units[(i + 1) % units.length], r), '·'));
    }
    units.forEach(u => chartLine(c, [cx, origin + cy], at(u, 1), '·'));
    if (curve && curve.entries.length === units.length) {
      const shape = new Canvas();
      const points = units.map((u, i) => at(u, fraction(curve.entries[i], min, max)));
      points.forEach((p, i) => chartLine(shape, p, points[(i + 1) % points.length]));
      points.forEach(p => shape.put(p[0], p[1], '●'));
      c.blit(shape, 0, 0);
    }
    units.forEach((u, i) => {
      const p = at(u, 1.15), text = String(i + 1);
      let y = p[1], x = Math.max(0, Math.min(width - displayWidth(text), p[0] - Math.floor(displayWidth(text) / 2)));
      while (Array.from({ length: displayWidth(text) + 2 }, (_, k) => c.occupied(x + k - 1, y)).some(Boolean)) y++;
      c.text(x, y, text);
    });
    top = (c.bounds()?.y ?? 0) + (c.bounds()?.h ?? 0) + 1;
    // Numeric scale stays outside the plot, so it never hides a curve or spoke.
    const scale = Array.from({ length: model.options.ticks + 1 }, (_, i) => num(min * (1 - i / Math.max(1, model.options.ticks)) + max * i / Math.max(1, model.options.ticks)));
    top += chartText(c, scale.join(' · '), 0, top, width);
    model.axes.forEach((axis, i) => {
      const value = curve?.entries.length === units.length ? curve.entries[i] : undefined;
      top += chartText(c, `${i + 1} ${axis.label}${value !== undefined ? `: ${num(value)}` : ''}`, 0, top, width);
    });
  }
  return c;
}
export const radar: AsciiDiagram<RadarModel> = { type: 'radar', render };

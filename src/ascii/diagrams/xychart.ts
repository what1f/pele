import type { XyChartModel } from '../../diagrams/xychart/db.js';
import { tickStep, ticksBetween } from '../../diagrams/xychart/ticks.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { chartLine, chartNumber as num, chartText, fraction } from '../draw/chart.js';
import { label } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

function render(model: XyChartModel, ctx: AsciiContext): Canvas {
  const c = new Canvas();
  const conf = ctx.config.xyChart as Record<string, unknown> | undefined;
  const xconf = conf?.xAxis as Record<string, unknown> | undefined;
  const yconf = conf?.yAxis as Record<string, unknown> | undefined;
  const horizontal = model.orientation === 'horizontal';
  const width = Math.max(20, Math.min(ctx.compact ? ctx.maxWidth : 88, 88));
  let lo = model.yAxis.min, hi = model.yAxis.max;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (!model.hasSetYAxis && model.plots.some(p => p.type === 'bar')) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (lo === hi) { const delta = Math.abs(lo) / 2 || 1; lo -= delta; hi += delta; }
  const ticks = [...new Set([lo, ...ticksBetween(Math.min(lo, hi), Math.max(lo, hi), tickStep(Math.abs(hi - lo), 4)), hi])];
  const margin = Math.max(...ticks.map(v => displayWidth(num(v)))) + 2;
  const count = Math.max(1, ...model.plots.map(p => p.data.length));
  const textWidth = ctx.compact ? Math.max(2, Math.min(4, Math.floor((width - margin) / count) - 2)) : Math.max(4, Math.min(10, Math.floor((width - margin) / count) - 2));
  let top = 0;
  const plots = model.plots.length ? model.plots : [{ type: 'line' as const, title: '', data: model.xAxis.type === 'band' ? model.xAxis.categories.map(name => [name, undefined] as [string, undefined]) : [[String(model.xAxis.min), undefined], [String(model.xAxis.max), undefined]] as [string, undefined][] }];
  for (const plot of plots) {
    if (top) top++;
    const heading = `${plot.type === 'bar' ? '█' : '●'}${plot.title && conf?.showLegend !== false ? ` ${plot.title}` : ''}`;
    if (model.plots.length) top += chartText(c, heading, 0, top, width) + 1;
    if (yconf?.showTitle !== false) top += chartText(c, model.yAxis.title, 0, top, width);
    const data = plot.data;
    const texts = data.map(([name]) => label(model.xAxis.type === 'linear' ? num(Number(name)) : name).lines.flatMap(s => wrap(s, horizontal ? (ctx.compact ? 12 : 20) : textWidth)));
    if (horizontal) {
      const left = Math.max(1, ...texts.flat().map(displayWidth)) + 2;
      const span = Math.max(8, width - left - margin - 3);
      const start = left;
      let row = top + 1;
      const points: ([number, number] | undefined)[] = [];
      const base = start + Math.round(fraction(0, lo, hi) * span);
      const pitch = Math.max(1, ...texts.map(t => t.length)) + 1;
      data.forEach(([, value], i) => {
        const cy = row + Math.floor(Math.max(1, texts[i].length) / 2);
        if (xconf?.showLabel !== false) texts[i].forEach((s, k) => c.textIn(0, row + k, left - 2, s, 'right'));
        if (xconf?.showTick !== false) c.segment(start - 1, cy, start, cy);
        if (value !== undefined && Number.isFinite(value)) {
          const px = start + Math.round(fraction(value, lo, hi, plot.type !== 'line') * span);
          points.push([px, cy]);
          if (plot.type === 'bar') for (let x = Math.min(base, px); x <= Math.max(base, px); x++) c.put(x, cy, '█');
        } else points.push(undefined);
        row += pitch;
      });
      if (xconf?.showAxisLine !== false) c.segment(start, top, start, row);
      if (yconf?.showAxisLine !== false) c.segment(start, row, start + span, row);
      if (plot.type === 'bar' && Math.min(lo, hi) <= 0 && Math.max(lo, hi) >= 0) c.segment(base, top, base, row);
      let lastLabel = -Infinity;
      for (const value of [...ticks].sort((a, b) => fraction(a, lo, hi) - fraction(b, lo, hi))) {
        const x = start + Math.round(span * fraction(value, lo, hi));
        if (yconf?.showTick !== false) c.segment(x, row, x, row + 1);
        const left = x - Math.floor(displayWidth(num(value)) / 2);
        if (yconf?.showLabel !== false && left > lastLabel + 1) { c.text(left, row + 2, num(value)); lastLabel = left + displayWidth(num(value)); }
      }
      if (plot.type === 'line') drawLine(c, points, [start, top, start + span, row - 1]);
      top = row + 4;
    } else {
      const slot = textWidth + 2;
      const span = Math.max(slot, data.length * slot);
      const height = ctx.compact ? 12 : 16;
      const bottom = top + height;
      if (yconf?.showAxisLine !== false) c.segment(margin, top, margin, bottom);
      if (xconf?.showAxisLine !== false) c.segment(margin, bottom, margin + span, bottom);
      const tickRows = new Set<number>();
      [lo, hi, ...(Math.min(lo, hi) <= 0 && Math.max(lo, hi) >= 0 ? [0] : []), ...ticks].forEach(v => {
        const y = bottom - 1 - Math.round((height - 2) * fraction(v, lo, hi));
        if (tickRows.has(y)) return;
        tickRows.add(y);
        if (yconf?.showLabel !== false) c.textIn(0, y, margin - 2, num(v), 'right');
        if (yconf?.showTick !== false) c.segment(margin - 1, y, margin, y);
      });
      const base = bottom - 1 - Math.round(fraction(0, lo, hi) * (height - 2));
      if (plot.type === 'bar' && Math.min(lo, hi) <= 0 && Math.max(lo, hi) >= 0) c.segment(margin, base, margin + span, base);
      const points = data.map(([, v], i): [number, number] | undefined => {
        const x = margin + Math.floor(slot * (i + 0.5));
        if (xconf?.showTick !== false) c.segment(x, bottom, x, bottom + 1);
        if (xconf?.showLabel !== false) texts[i].forEach((s, k) => c.textIn(margin + i * slot + 1, bottom + 2 + k, slot - 2, s));
        if (v === undefined || !Number.isFinite(v)) return undefined;
        const y = bottom - 1 - Math.round(fraction(v, lo, hi, plot.type !== 'line') * (height - 2));
        if (plot.type === 'bar') for (let cy = Math.min(base, y); cy <= Math.max(base, y); cy++) { c.put(x, cy, '█'); c.put(x + 1, cy, '█'); }
        return [x, y];
      });
      if (plot.type === 'line') drawLine(c, points, [margin + 1, top + 1, margin + span, bottom - 1]);
      top = bottom + 2 + Math.max(1, ...texts.map(t => t.length));
    }
    if (xconf?.showTitle !== false) top += chartText(c, model.xAxis.title, 0, top, width);
    data.forEach(([name, v], i) => {
      const annotation = plot.pointLabels?.[i];
      if (!annotation && !(conf?.showDataLabel === true && plot.type === 'bar')) return;
      top += chartText(c, `${label(name).lines.join(' ')}: ${v === undefined ? '' : num(v)}${annotation ? ` - ${annotation}` : ''}`, 0, top, width);
    });
  }
  return c;
}
function drawLine(c: Canvas, points: ([number, number] | undefined)[], bounds: [number, number, number, number]): void {
  const [left, top, right, bottom] = bounds;
  const inside = (p: [number, number]) => p[0] >= left && p[0] <= right && p[1] >= top && p[1] <= bottom;
  points.forEach((p, i) => {
    const a = points[i - 1];
    if (!p || !a || ![...a, ...p].every(Number.isFinite)) return;
    const dx = p[0] - a[0], dy = p[1] - a[1];
    let from = 0, to = 1;
    // Clip the segment, rather than moving out-of-range samples onto the boundary.
    for (const [d, q] of [[-dx, a[0] - left], [dx, right - a[0]], [-dy, a[1] - top], [dy, bottom - a[1]]]) {
      if (d === 0) { if (q < 0) return; }
      else if (d < 0) from = Math.max(from, q / d);
      else to = Math.min(to, q / d);
    }
    if (from > to) return;
    chartLine(c, [Math.round(a[0] + dx * from), Math.round(a[1] + dy * from)], [Math.round(a[0] + dx * to), Math.round(a[1] + dy * to)]);
  });
  points.forEach(p => { if (p && inside(p)) c.put(p[0], p[1], '●'); });
}
export const xychart: AsciiDiagram<XyChartModel> = { type: 'xychart', render };

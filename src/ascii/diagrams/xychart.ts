import type { XyChartModel } from '../../diagrams/xychart/db.js';
import { tickIndex, tickStep, tickValue, ticksBetween } from '../../diagrams/xychart/ticks.js';
import { Canvas } from '../canvas/canvas.js';
import { Arm } from '../canvas/glyphs.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { barText, chartColumn, chartLine, chartNumber as num, chartText, fraction } from '../draw/chart.js';
import { label, type TextBlock } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

type Point = [number, number];
interface Note { text: TextBlock; point: Point; fallback: string }
interface ValueLabel { text: string; point: Point; negative: boolean }

function render(model: XyChartModel, ctx: AsciiContext): Canvas {
  const c = new Canvas();
  const conf = ctx.config.xyChart as Record<string, unknown> | undefined;
  const xconf = conf?.xAxis as Record<string, unknown> | undefined;
  const yconf = conf?.yAxis as Record<string, unknown> | undefined;
  const horizontal = model.orientation === 'horizontal';
  const width = Math.max(24, Math.min(ctx.maxWidth, ctx.compact ? 80 : 96));
  const bars = model.plots.filter(p => p.type === 'bar');
  let lo = model.yAxis.min, hi = model.yAxis.max;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (!model.hasSetYAxis && bars.length) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const reversed = lo > hi;
  if (reversed) [lo, hi] = [hi, lo];
  if (lo === hi) { const delta = Math.abs(lo) / 2 || 1; lo -= delta; hi += delta; }
  const step = tickStep(hi - lo, 4);
  lo = tickValue(step, Math.floor(tickIndex(step, lo) + 1e-9));
  hi = tickValue(step, Math.ceil(tickIndex(step, hi) - 1e-9));
  const ticks = ticksBetween(lo, hi, step);
  const intervals = Math.max(1, ticks.length - 1);
  const min = reversed ? hi : lo, max = reversed ? lo : hi;
  const valueWidth = Math.max(1, ...ticks.map(v => displayWidth(num(v))));
  const ytitle = horizontal ? model.xAxis.title : model.yAxis.title;
  const xtitle = horizontal ? model.yAxis.title : model.xAxis.title;
  let top = 0;
  const legend = conf?.showLegend === false ? [] : model.plots.filter(p => p.title).map(p => `${p.type === 'bar' ? '█' : '●'} ${label(p.title).lines.join(' ')}`);
  if (legend.length) {
    let row = '';
    for (const item of legend) {
      if (row && displayWidth(row) + displayWidth(item) + 3 > width) { wrap(row, width).forEach(s => c.text(0, top++, s)); row = ''; }
      row += (row ? '   ' : '') + item;
    }
    wrap(row, width).forEach(s => c.text(0, top++, s));
    top++;
  }
  if ((horizontal ? xconf : yconf)?.showTitle !== false) top += chartText(c, ytitle, 0, top, width);
  const count = model.xAxis.type === 'band' ? model.xAxis.categories.length : Math.max(1, ...model.plots.map(p => p.data.length));
  const categoryNames = model.xAxis.type === 'band' ? model.xAxis.categories : numericCategories(model);
  const numeric = model.xAxis.type === 'linear';
  const categoryFraction = (name: string, i: number, n: number) => numeric && model.xAxis.type === 'linear'
    ? fraction(Number(name), model.xAxis.min, model.xAxis.max) : (i + 0.5) / Math.max(1, n);
  const inset = numeric ? (bars.length ? 0.5 / Math.max(1, count) : 0) : 0;
  const categoryAt = (name: string, i: number, n: number) => inset + categoryFraction(name, i, n) * (1 - inset * 2);
  const notes: Note[] = [], values: ValueLabel[] = [];
  const shapes: (Point | undefined)[][] = [];
  const hasNotes = model.plots.some(p => p.pointLabels?.some(Boolean));
  const headroom = hasNotes || conf?.showDataLabel === true ? 2 : 1;
  top += headroom;
  let left: number, right: number, bottom: number, axis: number;
  let after: number;
  if (!horizontal) {
    left = valueWidth + 2;
    const slot = Math.max(bars.length * (ctx.compact ? 2 : 3) + 2, Math.min(12, Math.floor((width - left - 1) / Math.max(1, categoryNames.length))));
    const span = Math.max(slot * Math.max(1, categoryNames.length), 24);
    right = left + span;
    const height = intervals * (ctx.compact ? 3 : 4);
    bottom = top + height;
    axis = bottom - Math.round(fraction(0, min, max) * height);
    if (yconf?.showAxisLine !== false) c.segment(left, top, left, bottom);
    if (xconf?.showAxisLine !== false) c.segment(left, axis, right, axis);
    ticks.forEach(v => {
      const y = bottom - Math.round(fraction(v, min, max) * height);
      if (yconf?.showLabel !== false) c.textIn(0, y, left - 2, num(v), 'right');
      if (yconf?.showTick !== false) c.segment(left - 1, y, left, y);
    });
    const labelWidth = Math.max(2, Math.floor(span / Math.max(1, categoryNames.length)) - 2);
    const texts = categoryNames.map(s => label(s).lines.flatMap(t => wrap(t, labelWidth)));
    categoryNames.forEach((s, i) => {
      const x = left + Math.round(categoryAt(s, i, categoryNames.length) * span);
      if (xconf?.showTick !== false) c.stub(x, axis, Arm.Down);
      if (xconf?.showLabel !== false) texts[i].forEach((t, k) => {
        const tx = Math.max(left, Math.min(right - displayWidth(t), x - Math.floor(displayWidth(t) / 2)));
        c.text(tx, bottom + 1 + k, t);
      });
    });
    const barWidth = Math.max(1, Math.min(3, Math.floor((slot - 2) / Math.max(1, bars.length)) - 1));
    for (const plot of model.plots) {
      const points = plot.data.map(([name, v], i): Point | undefined => {
        if (v === undefined || !Number.isFinite(v)) return undefined;
        const x = left + Math.round(categoryAt(name, i, plot.data.length) * span);
        const rawY = bottom - fraction(v, min, max, false) * height;
        if (plot.type === 'bar') {
          const offset = Math.round((bars.indexOf(plot) - (bars.length - 1) / 2) * (barWidth + 1));
          const bx = Math.max(left + 1, Math.min(right - barWidth, x + offset - Math.floor(barWidth / 2)));
          const tip = Math.max(top, Math.min(bottom, rawY));
          chartColumn(c, bx, axis, tip, barWidth);
          if (conf?.showDataLabel === true) values.push({ text: num(v), point: [bx + Math.floor(barWidth / 2), Math.round(tip)], negative: tip > axis });
        }
        let py = Math.round(rawY);
        if (v !== 0 && py === axis) py += rawY < axis ? -1 : 1;
        const point: Point = [x, py];
        if (plot.pointLabels?.[i]) notes.push({ text: label(plot.pointLabels[i], { maxWidth: 18 }), point, fallback: `${numeric ? num(Number(name)) : label(name).lines.join(' ')}: ${label(plot.pointLabels[i]).lines.join(' ')}` });
        return point;
      });
      if (plot.type === 'line') shapes.push(points);
    }
    after = bottom + 1 + (xconf?.showLabel === false ? 0 : Math.max(1, ...texts.map(t => t.length)));
  } else {
    const texts = categoryNames.map(s => label(s).lines.flatMap(t => wrap(t, ctx.compact ? 12 : 18)));
    left = Math.max(1, ...texts.flat().map(displayWidth)) + 2;
    const endRoom = conf?.showDataLabel === true ? Math.max(valueWidth, ...bars.flatMap(p => p.data.map(([, v]) => displayWidth(num(v ?? 0))))) + 2 : 2;
    const span = Math.max(12, Math.floor((width - left - endRoom) / intervals) * intervals);
    right = left + span;
    const pitch = Math.max(bars.length * 2 + 1, ...texts.map(t => t.length + 1));
    const height = Math.max(pitch, categoryNames.length * pitch);
    bottom = top + height;
    axis = left + Math.round(fraction(0, min, max) * span);
    if (xconf?.showAxisLine !== false) c.segment(axis, top, axis, bottom);
    if (yconf?.showAxisLine !== false) c.segment(left, bottom, right, bottom);
    ticks.forEach(v => {
      const x = left + Math.round(fraction(v, min, max) * span);
      if (yconf?.showTick !== false) c.stub(x, bottom, Arm.Down);
      if (yconf?.showLabel !== false) c.text(x - Math.floor(displayWidth(num(v)) / 2), bottom + 1, num(v));
    });
    const at = (name: string, i: number, n: number) => top + Math.round((numeric ? inset + categoryFraction(name, i, n) * (1 - 2 * inset) : (i + 0.5) / Math.max(1, n)) * height);
    categoryNames.forEach((s, i) => {
      const y = at(s, i, categoryNames.length);
      if (xconf?.showTick !== false) c.stub(axis, y, Arm.Left);
      if (xconf?.showLabel !== false) texts[i].forEach((t, k) => c.textIn(0, y - Math.floor((texts[i].length - 1) / 2) + k, left - 2, t, 'right'));
    });
    for (const plot of model.plots) {
      const points = plot.data.map(([name, v], i): Point | undefined => {
        if (v === undefined || !Number.isFinite(v)) return undefined;
        const y = at(name, i, plot.data.length);
        const rawX = left + fraction(v, min, max, false) * span;
        if (plot.type === 'bar') {
          const by = Math.max(top + 1, Math.min(bottom - 1, y + (bars.indexOf(plot) * 2 - bars.length + 1)));
          const tip = Math.max(left, Math.min(right, rawX));
          const length = Math.abs(tip - axis);
          if (tip >= axis) c.text(axis + 1, by, barText(length, Math.ceil(length)));
          else {
            const text = barText(length, Math.ceil(length));
            c.text(axis - displayWidth(text), by, text);
          }
          if (conf?.showDataLabel === true) values.push({ text: num(v), point: [Math.ceil(tip), by], negative: tip < axis });
        }
        const point: Point = [Math.round(rawX), y];
        if (plot.pointLabels?.[i]) notes.push({ text: label(plot.pointLabels[i], { maxWidth: 18 }), point, fallback: `${numeric ? num(Number(name)) : label(name).lines.join(' ')}: ${label(plot.pointLabels[i]).lines.join(' ')}` });
        return point;
      });
      if (plot.type === 'line') shapes.push(points);
    }
    after = bottom + 2;
  }
  const lines = new Canvas();
  for (const points of shapes) drawLine(lines, points, [left, top, right, bottom]);
  c.blit(lines, 0, 0);
  const vacant = (x: number, y: number, w: number, h: number, pad = 1) => {
    if (x < left || x + w > width || y < top - headroom || y + h > bottom + 1) return false;
    for (let row = y - pad; row < y + h + pad; row++) for (let col = x - pad; col < x + w + pad; col++) if (c.occupied(col, row)) return false;
    return true;
  };
  for (const value of values) {
    const [x, y] = value.point, w = displayWidth(value.text);
    const tx = horizontal ? x + 2 : Math.max(left + 2, Math.min(right - w - 1, x - Math.floor(w / 2)));
    const candidates: Point[] = horizontal
      ? [[tx, y], [tx, y - 2], [tx, y + 2]]
      : [1, 2, 3].map(d => [tx, y + (value.negative ? d : -d)] as Point);
    if (!horizontal) candidates.push([x + 3, y], [x - w - 2, y], [x + 3, y + 1], [x - w - 2, y + 1]);
    for (let d = 4; d <= bottom - top + headroom; d++) candidates.push([tx, y - d]);
    const at = candidates.find(([x, y]) => vacant(x, y, w, 1));
    if (at) c.text(at[0], at[1], value.text);
  }
  if ((horizontal ? yconf : xconf)?.showTitle !== false) {
    const title = label(xtitle).lines.flatMap(s => wrap(s, right - left));
    title.forEach((s, i) => c.textIn(left, after + i, right - left + 1, s));
    after += title.length;
  }
  const fallback: string[] = [];
  for (const note of notes) {
    const [x, y] = note.point, { width: w, height: h } = note.text;
    const candidates = [[x + 2, y], [x - w - 1, y], [x + 2, y - 1], [x - w - 1, y - 1], [x - Math.floor(w / 2), y - h - 1], [x - Math.floor(w / 2), y + 2]];
    const at = candidates.find(([x, y]) => vacant(x, y, w, h));
    if (at) note.text.lines.forEach((s, i) => c.text(at[0], at[1] + i, s));
    else fallback.push(note.fallback);
  }
  if (fallback.length) {
    after++;
    for (const text of fallback) after += chartText(c, text, left, after, right - left + 1);
  }
  return c;
}

function numericCategories(model: XyChartModel): string[] {
  if (model.xAxis.type !== 'linear') return [];
  const { min, max } = model.xAxis;
  if (min === max) return [num(min)];
  const marks = ticksBetween(Math.min(min, max), Math.max(min, max), tickStep(Math.abs(max - min), 5));
  return (min > max ? marks.reverse() : marks).map(num);
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

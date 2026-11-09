import type { QuadrantModel, QuadrantText } from '../../diagrams/quadrant/db.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { chartNumber as num, chartText } from '../draw/chart.js';
import { label } from '../text/label.js';
import { displayWidth } from '../text/width.js';

function render(model: QuadrantModel, ctx: AsciiContext): Canvas {
  const c = new Canvas();
  const width = Math.max(24, Math.min(ctx.compact ? ctx.maxWidth : 76, 76));
  const half = Math.floor((width - 3) / 2), right = half * 2 + 2, mid = half + 1;
  const text = (t: QuadrantText | undefined, max: number) => label(t?.text, { markdown: t?.type === 'markdown', maxWidth: max });
  let y = 0;
  y += chartText(c, model.yAxisTop?.text, 0, y, width, model.yAxisTop?.type === 'markdown');
  const qs = model.quadrants.map(t => text(t, half - 2));
  const qh = Math.max(1, ...qs.map(t => t.height));
  const top = y, center = top + qh + 10, bottom = center + qh + 10;
  c.box(0, top, right + 1, bottom - top + 1, { fill: false });
  c.segment(mid, top, mid, bottom);
  c.segment(0, center, right, center);
  [1, 0, 2, 3].forEach((q, i) => {
    const left = i % 2 === 0 ? 1 : mid + 1;
    const row = i < 2 ? top + 1 : center + 1;
    qs[q].lines.forEach((s, k) => c.textIn(left + 1, row + k, half - 2, s));
  });
  // Points that share a terminal cell share a key; the key retains exact coordinates.
  const groups = new Map<string, { x: number; y: number; points: number[] }>();
  const keyWidth = displayWidth(String(model.points.length));
  const slots = Math.max(1, Math.floor((half - 2) / (keyWidth + 1)));
  model.points.forEach((p, i) => {
    const east = p.x >= 0.5, north = p.y >= 0.5;
    const localX = east ? (p.x - 0.5) * 2 : p.x * 2;
    const localY = north ? (1 - p.y) * 2 : (0.5 - p.y) * 2;
    const x = (east ? mid : 0) + 2 + Math.round(localX * (slots - 1)) * (keyWidth + 1);
    const py = (north ? top : center) + qh + 2 + Math.round(localY * 6);
    const key = `${x},${py}`;
    const group = groups.get(key) ?? { x, y: py, points: [] };
    group.points.push(i); groups.set(key, group);
  });
  let next = bottom + 1;
  next += chartText(c, model.yAxisBottom?.text, 0, next, width, model.yAxisBottom?.type === 'markdown');
  const xl = text(model.xAxisLeft, half - 2), xr = text(model.xAxisRight, half - 2);
  xl.lines.forEach((s, k) => c.text(0, next + k, s));
  xr.lines.forEach((s, k) => c.textIn(mid + 1, next + k, half, s, 'right'));
  next += Math.max(xl.height, xr.height) + 1;
  [...groups.values()].forEach((group, i) => {
    c.text(group.x, group.y, String(i + 1));
    group.points.forEach(j => {
      const p = model.points[j];
      next += chartText(c, `${i + 1} ${label(p.text.text, { markdown: p.text.type === 'markdown' }).lines.join(' ')} (${num(p.x)}, ${num(p.y)})`, 0, next, width);
    });
  });
  return c;
}
export const quadrant: AsciiDiagram<QuadrantModel> = { type: 'quadrantChart', render };

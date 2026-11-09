import type { QuadrantModel, QuadrantText } from '../../diagrams/quadrant/db.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { chartText } from '../draw/chart.js';
import { label } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

function render(model: QuadrantModel, ctx: AsciiContext): Canvas {
  const c = new Canvas();
  const width = Math.max(30, Math.min(ctx.maxWidth, ctx.compact ? 80 : 90));
  const text = (t: QuadrantText | undefined, max: number) => label(t?.text, { markdown: t?.type === 'markdown' }).lines.flatMap(s => wrap(s, max));
  const high = text(model.yAxisTop, ctx.compact ? 12 : 16), low = text(model.yAxisBottom, ctx.compact ? 12 : 16);
  const left = Math.max(0, ...[...high, ...low].map(displayWidth)) + (high.length || low.length ? 2 : 0);
  const half = Math.max(12, Math.floor((width - left - 3) / 2)), mid = left + half + 1, right = mid + half + 1;
  const qs = model.quadrants.map(t => text(t, half - 2));
  const qh = Math.max(1, ...qs.map(t => t.length));
  const center = qh + 9, bottom = center * 2;
  c.box(left, 0, right - left + 1, bottom + 1, { fill: false });
  c.segment(mid, 0, mid, bottom);
  c.segment(left, center, right, center);
  high.forEach((s, i) => c.text(0, i, s));
  low.forEach((s, i) => c.text(0, bottom - low.length + 1 + i, s));
  [1, 0, 2, 3].forEach((q, i) => {
    const x = i % 2 === 0 ? left + 2 : mid + 2;
    qs[q].forEach((s, k) => c.textIn(x, (i < 2 ? 1 : center + 1) + k, half - 2, s));
  });
  const groups = new Map<string, { x: number; y: number; points: number[] }>();
  const keyWidth = displayWidth(String(model.points.length));
  model.points.forEach((p, i) => {
    let x = left + 2 + Math.round(p.x * (right - left - 4));
    let y = 2 + Math.round((1 - p.y) * (bottom - 4));
    x = Math.min(x, right - keyWidth - 1);
    if (x <= mid + 1 && x + keyWidth >= mid) x = p.x >= 0.5 ? mid + 2 : mid - keyWidth - 1;
    if (y === center) y += p.y >= 0.5 ? -1 : 1;
    if (y <= qh + 1) y = qh + 2;
    if (y > center && y <= center + qh + 1) y = center + qh + 2;
    const neighbor = [...groups.values()].find(g => g.y === y && (g.x < mid) === (x < mid) && Math.abs(g.x - x) <= keyWidth);
    const key = neighbor ? `${neighbor.x},${neighbor.y}` : `${x},${y}`;
    const group = groups.get(key) ?? { x, y, points: [] };
    group.points.push(i); groups.set(key, group);
  });
  const entries = [...groups.values()];
  entries.forEach(g => c.text(g.x, g.y, '●' + ' '.repeat(keyWidth - 1)));
  const xl = text(model.xAxisLeft, half - 1), xr = text(model.xAxisRight, half - 1);
  xl.forEach((s, i) => c.text(left, bottom + 1 + i, s));
  xr.forEach((s, i) => c.textIn(mid + 2, bottom + 1 + i, half, s, 'right'));
  let next = bottom + Math.max(xl.length, xr.length) + 2;
  const clear = (x: number, y: number, w: number, h: number) => {
    if (x <= left || x + w >= right || y < 1 || y + h > bottom) return false;
    for (let row = y - 1; row <= y + h; row++) for (let col = x - 1; col <= x + w; col++) if (c.occupied(col, row)) return false;
    return true;
  };
  const placements = entries.map((g, index) => {
    const p = model.points[g.points[0]], lines = text(p.text, half - 3);
    const w = Math.max(0, ...lines.map(displayWidth)), y = g.y - Math.floor((lines.length - 1) / 2);
    const tileLeft = g.x < mid ? left + 2 : mid + 2;
    const tileRight = g.x < mid ? mid - 2 : right - 2;
    const centered = Math.max(tileLeft, Math.min(tileRight - w + 1, g.x - Math.floor(w / 2)));
    const candidates = [[g.x + keyWidth + 1, y], [g.x - w - 1, y], [centered, g.y - lines.length - 1], [centered, g.y + 2]];
    const room = candidates.filter(([x, y]) => clear(x, y, w, lines.length)).length;
    for (const gap of [2, 3]) candidates.push([centered, g.y - lines.length - gap - 1], [centered, g.y + gap + 1]);
    const tileTop = g.y < center ? 1 : center + 1, tileBottom = g.y < center ? center - 1 : bottom - 1;
    return { g, index, lines, w, candidates: candidates.filter(([, y]) => y >= tileTop && y + lines.length - 1 <= tileBottom), room };
  });
  // Place constrained labels before labels that have several free sides.
  placements.sort((a, b) => a.room - b.room || a.index - b.index);
  placements.forEach(({ g, index, lines, w, candidates }) => {
    const at = candidates.find(([x, y]) => clear(x, y, w, lines.length));
    if (g.points.length === 1 && at !== undefined) lines.forEach((s, i) => c.text(at[0], at[1] + i, s));
    else {
      const key = String(index + 1);
      // A crowded cell uses one key for all of its labels.
      c.text(g.x, g.y, key);
      g.points.forEach(i => {
        const p = model.points[i];
        next += chartText(c, `${key} ${label(p.text.text, { markdown: p.text.type === 'markdown' }).lines.join(' ')}`, left, next, right - left + 1);
      });
    }
  });
  return c;
}
export const quadrant: AsciiDiagram<QuadrantModel> = { type: 'quadrantChart', render };

import { Canvas } from '../canvas/canvas.js';
import { label } from '../text/label.js';
import { wrap } from '../text/width.js';

export function chartText(canvas: Canvas, raw: string | undefined, x: number, y: number, width: number, markdown = false): number {
  const lines = label(raw, { markdown }).lines.flatMap(line => wrap(line, Math.max(2, width)));
  lines.forEach((line, i) => canvas.text(x, y + i, line));
  return lines.length;
}

export function chartNumber(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toPrecision(6))) : '';
}

export function fraction(value: number, min: number, max: number, clamp = true): number {
  if (min === max) return 0.5;
  const scale = Math.max(Math.abs(min), Math.abs(max), 1);
  const ratio = (value / scale - min / scale) / (max / scale - min / scale);
  return clamp ? Math.max(0, Math.min(1, ratio)) : ratio;
}

// Sample in terminal cells, including both ends; diagonal segments stay connected.
export function chartLine(canvas: Canvas, a: readonly [number, number], b: readonly [number, number], glyph?: string): void {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  let previous = a;
  for (let i = 0; i <= steps; i++) {
    const p = [Math.round(a[0] + dx * i / steps), Math.round(a[1] + dy * i / steps)] as const;
    if (glyph) canvas.put(p[0], p[1], glyph);
    else canvas.path([previous, [p[0], previous[1]], p]);
    previous = p;
  }
}

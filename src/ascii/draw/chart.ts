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

export function barText(length: number, width: number): string {
  const units = Math.max(0, Math.min(width * 8, Math.round(length * 8)));
  const full = Math.floor(units / 8), tail = units % 8;
  return '█'.repeat(full) + (tail ? '▏▎▍▌▋▊▉'[tail - 1] : '');
}

export function chartColumn(canvas: Canvas, x: number, base: number, tip: number, width: number): void {
  const height = Math.abs(tip - base), full = Math.floor(height + 1e-9);
  const part = Math.round((height - full) * 8);
  const up = tip <= base;
  for (let col = 0; col < width; col++) {
    for (let row = 1; row <= full; row++) canvas.put(x + col, base + (up ? -row : row), '█');
    if (part) canvas.put(x + col, base + (up ? -full - 1 : full + 1), up ? '▁▂▃▄▅▆▇█'[part - 1] : part <= 4 ? '▀' : '█');
  }
}

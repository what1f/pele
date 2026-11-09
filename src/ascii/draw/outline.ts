import { Canvas } from '../canvas/canvas.js';
import { Arm } from '../canvas/glyphs.js';
import type { AsciiContext } from '../core.js';
import { label, type TextBlock } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

export function outlineLabel(raw: string | undefined, width: number, markdown = false): TextBlock {
  const lines = label(raw, { markdown }).lines.flatMap(line => wrap(line, Math.max(2, width)));
  return { lines, width: Math.max(0, ...lines.map(displayWidth)), height: lines.length };
}

export interface OutlineTile {
  canvas: Canvas;
  w: number;
  h: number;
  anchor: number;
}

// Each parent owns one trunk, extended once per child rather than retraced for every edge.
export function drawOutline<T>(
  roots: T[],
  children: (node: T) => T[],
  tile: (node: T, room: number) => OutlineTile,
  ctx: AsciiContext,
  options: { forest?: boolean; reverse?: boolean; towardRoot?: boolean } = {},
): Canvas {
  const step = ctx.compact || options.forest ? 4 : 6;
  const pending = roots.map(node => ({ node, depth: 0, parent: -1 }));
  if (!options.reverse) pending.reverse();
  const rows: (OutlineTile & { x: number; y: number; parent: number; end: number })[] = [];
  let y = 0;
  while (pending.length) {
    const { node, depth, parent } = pending.pop()!;
    const x = (depth + (options.forest ? 1 : 0)) * step;
    const item = tile(node, ctx.compact ? ctx.maxWidth - x : Infinity);
    const index = rows.length;
    rows.push({ ...item, x, y, parent, end: 0 });
    y += item.h + 1;
    const list = children(node);
    for (let k = 0; k < list.length; k++) {
      const i = options.reverse ? k : list.length - 1 - k;
      pending.push({ node: list[i], depth: depth + 1, parent: index });
    }
  }
  const canvas = new Canvas();
  for (const row of rows) {
    if (options.reverse) row.y = y - 1 - row.y - row.h;
    row.end = options.reverse ? row.y : row.y + row.h - 1;
    canvas.blit(row.canvas, row.x, row.y);
  }
  let forestEnd = rows[0] ? rows[0].y + rows[0].anchor : 0;
  const linked = new Set<number>();
  for (const row of rows) {
    const parent = rows[row.parent];
    if (!parent && !options.forest) continue;
    const x = parent ? parent.x + 2 : 0;
    const cy = row.y + row.anchor;
    canvas.segment(x, parent?.end ?? forestEnd, x, cy, { role: 'edge' });
    canvas.segment(x, cy, row.x, cy, { role: 'edge' });
    canvas.stub(row.x, cy, Arm.Left, { role: 'edge' });
    if (parent) {
      if (!linked.has(row.parent) && options.towardRoot) {
        canvas.put(x, parent.end + (options.reverse ? -1 : 1), options.reverse ? '▼' : '▲', { role: 'edge' });
      }
      linked.add(row.parent);
      parent.end = cy;
    } else {
      if (!linked.has(-1)) canvas.stub(x, cy, Arm.Up, { role: 'edge' });
      linked.add(-1);
      forestEnd = cy;
    }
  }
  return canvas;
}

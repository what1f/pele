import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext } from '../core.js';
import { label } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

export interface CardColumn {
  title?: string;
  cards: string[][];
}

// Each card part is separated by a rule; groups remain transparent containers.
export function cardColumns(columns: CardColumn[], ctx: AsciiContext, connected = false, down = false): Canvas {
  const canvas = new Canvas();
  const limit = Math.max(2, Math.min(ctx.compact ? 36 : 28, ctx.maxWidth - 8));
  const lines = (raw: string): string[] => label(raw, { maxWidth: limit }).lines.flatMap((line) => wrap(line, limit));
  let x = 0;
  let y = 0;
  for (const column of columns) {
    const title = lines(column.title ?? '');
    const cards = column.cards.map((parts) => parts.map(lines).filter((part) => part.length > 0));
    const textWidth = Math.max(2, ...title.map(displayWidth), ...cards.flat(2).map(displayWidth));
    const cardW = textWidth + 4;
    const grouped = column.title !== undefined;
    const w = cardW + (grouped ? 4 : 0);
    const heights = cards.map((parts) => 2 + Math.max(1, parts.reduce((sum, part) => sum + part.length, 0)) + Math.max(0, parts.length - 1));
    const gap = connected ? 3 : 1;
    const headerH = grouped ? Math.max(1, title.length) + 1 : 0;
    const h = headerH + heights.reduce((a, b) => a + b, 0) + Math.max(0, cards.length - 1) * gap + (grouped ? 2 : 0);
    if (grouped) {
      canvas.box(x, y, w, Math.max(h, headerH + 2), { fill: false });
      title.forEach((line, i) => {
        if (i === 0) canvas.text(x + 2, y, ` ${line} `);
        else canvas.text(x + Math.floor((w - displayWidth(line)) / 2), y + i, line);
      });
    }
    let cy = y + headerH;
    const cx = x + (grouped ? 2 : 0);
    cards.forEach((parts, i) => {
      const ch = heights[i];
      canvas.box(cx, cy, cardW, ch);
      let ty = cy + 1;
      parts.forEach((part, p) => {
        if (p > 0) canvas.segment(cx, ty, cx + cardW - 1, ty++);
        for (const line of part) canvas.text(cx + Math.floor((cardW - displayWidth(line)) / 2), ty++, line);
      });
      if (connected && i > 0) {
        const center = cx + Math.floor(cardW / 2);
        canvas.segment(center, cy - gap - 1, center, cy - 1);
        canvas.put(center, cy - 1, '▼');
      }
      cy += ch + gap;
    });
    if (ctx.compact || down) y += Math.max(h, headerH + 2) + 1;
    else x += w + 2;
  }
  return canvas;
}

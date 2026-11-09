import type { PacketBlock, PacketModel } from '../../diagrams/packet/model.js';
import type { Config } from '../../preprocess.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiDiagram } from '../core.js';
import { label } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

export const packet: AsciiDiagram<PacketModel> = {
  type: 'packet',
  render(model, ctx) {
    const canvas = new Canvas();
    const config = (ctx.config.packet ?? {}) as Config;
    const descending = config.bitOrder === 'descending';
    const showBits = config.showBits !== false;
    const last = model.rows.at(-1)?.at(-1)?.end ?? 0;
    const minimum = Math.max(6, displayWidth(String(last)) + 3);
    const count = ctx.compact
      ? Math.min(model.bitsPerRow, Math.max(1, 2 ** Math.floor(Math.log2(Math.max(1, (ctx.maxWidth - 1) / minimum)))))
      : model.bitsPerRow;
    const unit = ctx.compact ? Math.max(minimum, Math.min(8, Math.floor((ctx.maxWidth - 1) / count))) : minimum;
    const rows = new Map<number, PacketBlock[]>();
    // Join only model-generated pieces before splitting at the terminal's row width.
    const fields: PacketBlock[] = [];
    for (const row of model.rows) for (const block of row) {
      const previous = fields.at(-1);
      if (previous && previous.bits === previous.end - previous.start &&
          block.bits === block.end - block.start && previous.label === block.label &&
          previous.end + 1 === block.start && block.start % model.bitsPerRow === 0) {
        previous.end = block.end;
        previous.bits = previous.end - previous.start;
      } else fields.push({ ...block });
    }
    for (const block of fields) {
      for (let start = block.start; start <= block.end;) {
        const index = Math.floor(start / count);
        const end = Math.min(block.end, (index + 1) * count - 1);
        const target = rows.get(index) ?? [];
        target.push({ ...block, start, end });
        rows.set(index, target);
        start = end + 1;
      }
    }
    let y = 0;
    for (const blocks of rows.values()) {
      const texts = blocks.map(block => label(block.label).lines.flatMap(line =>
        wrap(line, (block.end - block.start + 1) * unit - 3)));
      const height = Math.max(1, ...texts.map(lines => lines.length)) + 2;
      const top = y + (showBits ? 1 : 0);
      blocks.forEach((block, i) => {
        const bits = block.end - block.start + 1;
        const first = block.start % count;
        const x = (descending ? count - first - bits : first) * unit;
        const width = bits * unit + 1;
        canvas.box(x, top, width, height);
        texts[i].forEach((line, j) => canvas.textIn(x + 1,
          top + 1 + Math.floor((height - 2 - texts[i].length) / 2) + j, width - 2, line));
      });
      // Restore table junctions after adjacent boxes have cleared their shared border.
      for (const block of blocks) {
        const bits = block.end - block.start + 1;
        const first = block.start % count;
        const x = (descending ? count - first - bits : first) * unit;
        const right = x + bits * unit;
        canvas.segment(x, top, right, top);
        canvas.segment(x, top + height - 1, right, top + height - 1);
        if (showBits) {
          const leading = String(descending ? block.end : block.start);
          const trailing = String(descending ? block.start : block.end);
          if (bits === 1) canvas.textIn(x + 1, y, unit - 1, leading);
          else {
            canvas.text(x + 1, y, leading);
            canvas.text(right - displayWidth(trailing), y, trailing);
          }
        }
      }
      y = top + height + 1;
    }
    return canvas;
  },
};

import type { TreeViewModel } from '../../diagrams/treeview/model.js';
import { decodeEntities } from '../../text/entities.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiDiagram } from '../core.js';
import { drawOutline, outlineLabel } from '../draw/outline.js';

// File names and descriptions are literal, including angle brackets and Markdown punctuation.
function literal(raw: string): string {
  return decodeEntities(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const treeView: AsciiDiagram<TreeViewModel> = {
  type: 'treeView',
  render(model, ctx) {
    return drawOutline(model.root.children, node => node.children, (node, room) => {
      const canvas = new Canvas();
      const width = Math.min(ctx.compact ? 48 : 64, room - 2);
      const name = outlineLabel(literal(node.name + (node.nodeType === 'directory' ? '/' : '')), width);
      const description = outlineLabel(literal(node.description ?? ''), width);
      name.lines.forEach((line, y) => canvas.text(2, y, line));
      description.lines.forEach((line, y) => canvas.text(2, Math.max(1, name.height) + y, line, { role: 'muted' }));
      return { canvas, w: Math.max(name.width, description.width) + 2, h: Math.max(1, name.height) + description.height, anchor: 0 };
    }, ctx, { forest: true });
  },
};

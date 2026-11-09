import type { MindmapModel, MindmapNode } from '../../diagrams/mindmap/db.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiDiagram } from '../core.js';
import { drawOutline, outlineLabel, type OutlineTile } from '../draw/outline.js';
import { drawShape, shapeSize, type ShapeKind } from '../draw/shapes.js';

function tile(node: MindmapNode, room: number, wrap: number): OutlineTile {
  const text = outlineLabel(node.descr, Math.min(wrap, room - 6), true);
  const canvas = new Canvas();
  if (node.type === 0 && !node.isRoot && node.children.length === 0) {
    const h = Math.max(1, text.height);
    text.lines.forEach((line, y) => canvas.text(2, y, line));
    return { canvas, w: text.width + 2, h, anchor: 0 };
  }
  const kind: ShapeKind = node.type === 2 ? 'rect' : node.type === 6 ? 'hexagon' : 'rounded';
  const size = shapeSize(kind, text);
  if (node.type === 3) {
    size.w += 2;
    size.h += 2;
    const { w, h } = size;
    canvas.path([[1, 1], [1, 0], [w - 2, 0], [w - 2, 1], [w - 1, 1], [w - 1, h - 2], [w - 2, h - 2], [w - 2, h - 1], [1, h - 1], [1, h - 2], [0, h - 2], [0, 1], [1, 1]]);
    text.lines.forEach((line, y) => canvas.textIn(1, y + 2, w - 2, line));
  } else {
    drawShape(canvas, { x: 0, y: 0, ...size }, kind, text);
    if (node.type === 4 || node.type === 5) {
      for (let x = 1; x < size.w - 1; x++) {
        const ch = node.type === 4 ? '~' : x % 2 ? '╱' : '╲';
        canvas.put(x, 0, ch, { role: 'border' });
        canvas.put(x, size.h - 1, ch, { role: 'border' });
      }
      if (node.children.length) {
        canvas.clear(2, size.h - 1, 1, 1);
        canvas.segment(1, size.h - 1, 3, size.h - 1, { role: 'border' });
      }
    }
  }
  return { canvas, ...size, anchor: Math.floor(size.h / 2) };
}

export const mindmap: AsciiDiagram<MindmapModel> = {
  type: 'mindmap',
  render(model, ctx) {
    const configured = (ctx.config.mindmap as { maxNodeWidth?: number } | undefined)?.maxNodeWidth;
    const width = typeof configured === 'number' && configured > 0 ? configured / 8 : 32;
    return drawOutline(model.nodes.slice(0, 1), node => node.children, (node, room) => tile(node, room, ctx.compact ? Math.min(24, width) : width), ctx);
  },
};

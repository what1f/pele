import type { IshikawaModel, IshikawaNode } from '../../diagrams/ishikawa/types.js';
import { Canvas } from '../canvas/canvas.js';
import { Arm } from '../canvas/glyphs.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { drawOutline, outlineLabel, type OutlineTile } from '../draw/outline.js';
import { drawShape, shapeSize } from '../draw/shapes.js';

function tile(node: IshikawaNode, framed: boolean, room: number): OutlineTile {
  const text = outlineLabel(node.text, Math.min(28, room - 4));
  const canvas = new Canvas();
  if (framed) {
    const size = shapeSize('rect', text);
    drawShape(canvas, { x: 0, y: 0, ...size }, 'rect', text);
    return { canvas, ...size, anchor: Math.floor(size.h / 2) };
  }
  text.lines.forEach((line, y) => canvas.text(2, y, line));
  return { canvas, w: text.width + 2, h: Math.max(1, text.height), anchor: 0 };
}

function render(model: IshikawaModel, ctx: AsciiContext): Canvas {
  const canvas = new Canvas();
  const root = model.root;
  if (!root) return canvas;
  if (ctx.compact) {
    const framed = new Set([root, ...root.children]);
    return drawOutline([root], node => node.children, (node, room) => tile(node, framed.has(node), room), ctx, { towardRoot: true });
  }
  const head = tile(root, true, Infinity);
  if (!root.children.length) return head.canvas;
  const groups = root.children.map((node, i) => {
    const above = i % 2 === 0;
    const picture = drawOutline([node], n => n.children, n => tile(n, n === node, Infinity), ctx, { reverse: above, towardRoot: true });
    const bounds = picture.bounds()!;
    return { picture, above, w: Math.max(8, bounds.w), h: bounds.h };
  });
  let x = 0;
  for (let i = 0; i < groups.length; i += 2) {
    const pair = groups.slice(i, i + 2);
    for (const group of pair) {
      const y = group.above ? -3 - group.h + 1 : 3;
      canvas.blit(group.picture, x, y);
      const edgeY = group.above ? -3 : 3;
      canvas.path([[x + 2, edgeY], [x + 2, group.above ? -2 : 2], [x + 5, group.above ? -2 : 2], [x + 5, 0]], { role: 'edge' });
      canvas.put(x + 5, group.above ? -1 : 1, group.above ? '▼' : '▲', { role: 'edge' });
      // The category is at the spine end of its tree, with causes growing away from it.
      canvas.stub(x + 2, group.above ? edgeY : y, group.above ? Arm.Down : Arm.Up, { role: 'edge' });
    }
    x += Math.max(...pair.map(group => group.w)) + 4;
  }
  const headX = x + 2;
  const headY = -head.anchor;
  canvas.blit(head.canvas, headX, headY);
  canvas.segment(0, 0, headX, 0, { role: 'edge' });
  canvas.put(headX - 1, 0, '▶', { role: 'edge' });
  return canvas;
}

export const ishikawa: AsciiDiagram<IshikawaModel> = { type: 'ishikawa', render };

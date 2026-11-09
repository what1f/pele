import type { Block, BlockModel } from '../../diagrams/block/types.js';
import { arrowMask, RIGHT, LEFT, UP, DOWN } from '../../diagrams/block/arrows.js';
import { Canvas, type Rect } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { markerGlyph, type Marker } from '../draw/edges.js';
import { gridLabel as label, gridWires, port, type Side, type Wire } from '../draw/grid-wires.js';
import { drawShape, shapeSize, type ShapeKind } from '../draw/shapes.js';
import type { TextBlock } from '../text/label.js';

interface View extends Rect {
  block: Block;
  text: TextBlock;
  kind: ShapeKind;
  children: View[];
  col: number;
  row: number;
  span: number;
  cols: number;
  rowH: number[];
  cw: number;
}
const kinds: Record<string, ShapeKind> = {
  round: 'rounded',
  circle: 'rounded',
  stadium: 'rounded',
  doublecircle: 'double',
  diamond: 'diamond',
  hexagon: 'hexagon',
  cylinder: 'cylinder',
  subroutine: 'subroutine',
};
function render(model: BlockModel, ctx: AsciiContext): Canvas {
  const canvas = new Canvas();
  const gx = ctx.compact ? (model.edges.length ? 3 : 2) : 4,
    gy = model.edges.length ? 2 : 1;
  const wrap = ctx.compact ? Math.max(4, Math.min(10, Math.floor(ctx.maxWidth / 5))) : 24;
  const degree = new Map<string, number>();
  for (const e of model.edges)
    for (const id of [e.start, e.end]) {
      if (id) degree.set(id, (degree.get(id) ?? 0) + 1);
    }
  const nodeSize = (kind: ShapeKind, text: TextBlock, id: string) => {
    const size = shapeSize(kind, text),
      n = degree.get(id) ?? 0;
    return { w: Math.max(size.w, n + 2), h: Math.max(size.h, n + 2) };
  };
  const views: View[] = [];
  const make = (block: Block): View => {
    const text = label(block.type === 'space' ? undefined : block.label, {
      maxWidth: wrap,
    });
    const kind = kinds[block.type ?? ''] ?? 'rect';
    const size = nodeSize(kind, text, block.id);
    const v: View = {
      block,
      text,
      kind,
      children: [],
      x: 0,
      y: 0,
      ...size,
      col: 0,
      row: 0,
      span: block.widthInColumns ?? 1,
      cols: 0,
      rowH: [],
      cw: 0,
    };
    views.push(v);
    v.children = (block.children ?? []).map(make);
    if (block.type === 'space') {
      v.w = 1;
      v.h = 1;
    }
    if (block.type === 'composite') {
      const root = block === model.root;
      let pos = 0;
      const columns = block.columns ?? -1;
      for (const c of v.children) {
        c.col = columns > 0 ? pos % columns : pos;
        c.row = columns > 0 ? Math.floor(pos / columns) : 0;
        c.span = Math.max(1, Math.min(c.span, columns > 0 ? columns - c.col : 1000));
        pos += c.span;
        v.cols = Math.max(v.cols, c.col + c.span);
        v.cw = Math.max(v.cw, Math.ceil((c.w - gx * (c.span - 1)) / c.span));
        v.rowH[c.row] = Math.max(v.rowH[c.row] ?? 0, c.h);
      }
      const px = root ? 0 : 3,
        py = root ? 0 : 2;
      v.cw = Math.max(v.cw, Math.ceil(((text.height ? text.width + 6 : 0) - 2 * px - gx * Math.max(0, v.cols - 1)) / Math.max(1, v.cols)));
      v.w = Math.max(root ? 0 : text.width + 6, v.cols * v.cw + Math.max(0, v.cols - 1) * gx + 2 * px);
      v.h = Math.max(
        root ? 0 : 4,
        v.rowH.reduce((a, b) => a + b, 0) + Math.max(0, v.rowH.length - 1) * gy + 2 * py + Math.max(0, text.height - 1),
      );
    }
    return v;
  };
  const root = make(model.root);
  const place = (v: View): void => {
    const isRoot = v === root;
    if (v.cols) v.cw = Math.floor((v.w - (isRoot ? 0 : 6) - (v.cols - 1) * gx) / v.cols);
    let y = v.y + (isRoot ? 0 : 2) + Math.max(0, v.text.height - 1);
    for (let row = 0; row < v.rowH.length; row++) {
      for (const c of v.children.filter((c) => c.row === row)) {
        c.x = v.x + (isRoot ? 0 : 3) + c.col * (v.cw + gx);
        c.y = y;
        c.w = v.cw * c.span + gx * (c.span - 1);
        c.h = v.rowH[row];
        if (['circle', 'doublecircle', 'diamond', 'block_arrow'].includes(c.block.type ?? '')) {
          const natural = nodeSize(c.kind, c.text, c.block.id);
          c.x += Math.floor((c.w - natural.w) / 2);
          c.y += Math.floor((c.h - natural.h) / 2);
          c.w = natural.w;
          c.h = natural.h;
        }
        place(c);
      }
      y += v.rowH[row] + gy;
    }
  };
  place(root);
  const index = new Map(views.filter((v) => v !== root).map((v) => [v.block.id, v]));
  const frames = views.filter((v) => v !== root && v.block.type === 'composite');
  const leaves = views.filter((v) => v !== root && v.block.type !== 'composite' && v.block.type !== 'space');
  const titles = frames.flatMap((v) =>
    v.text.lines.map((_, i) => ({
      x: v.x + 2,
      y: v.y + i,
      w: v.text.width + 2,
      h: 1,
    })),
  );
  frames.forEach((v) => canvas.box(v.x, v.y, v.w, v.h, { fill: false }));
  const specs = model.edges.flatMap((e) => {
    const a = index.get(e.start ?? ''),
      b = index.get(e.end ?? '');
    if (!a || !b) return [];
    const dx = b.x + b.w / 2 - a.x - a.w / 2,
      dy = b.y + b.h / 2 - a.y - a.h / 2;
    const horizontal = Math.abs(dx) > Math.abs(dy) * 2;
    const sa: Side = a === b ? 'T' : horizontal ? (dx > 0 ? 'R' : 'L') : dy >= 0 ? 'B' : 'T';
    const sb: Side = a === b ? 'R' : horizontal ? (dx > 0 ? 'L' : 'R') : dy >= 0 ? 'T' : 'B';
    return [{ e, a, b, sa, sb }];
  });
  const counts = new Map<string, number>(),
    used = new Map<string, number>();
  for (const s of specs)
    for (const [v, side] of [
      [s.a, s.sa],
      [s.b, s.sb],
    ] as const) {
      const k = `${v.block.id}:${side}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  const endpoint = (v: View, side: Side) => {
    const k = `${v.block.id}:${side}`,
      n = used.get(k) ?? 0;
    used.set(k, n + 1);
    return port(v, side, n, counts.get(k));
  };
  const mark = (s?: string): Marker =>
    s === 'arrow_point' ? 'arrow' : s === 'arrow_circle' ? 'circle' : s === 'arrow_cross' ? 'cross' : 'none';
  const wires: Wire[] = specs.map(({ e, a, b, sa, sb }) => ({
    from: endpoint(a, sa),
    to: endpoint(b, sb),
    text: label(e.label, { maxWidth: ctx.compact ? 12 : 20 }),
    style: {
      head: mark(e.arrowTypeEnd),
      tail: mark(e.arrowTypeStart),
      dashed: e.pattern === 'dotted',
      stroke: e.thickness === 'thick' ? 'heavy' : 'light',
    },
  }));
  const finish = gridWires(canvas, leaves, frames, titles, wires);
  for (const v of leaves) {
    drawShape(canvas, v, v.kind, v.text);
    const x = v.x,
      y = v.y,
      right = x + v.w - 1,
      bottom = y + v.h - 1;
    const slants: Record<string, string[]> = {
      lean_right: ['╱', '╱', '╱', '╱'],
      lean_left: ['╲', '╲', '╲', '╲'],
      trapezoid: ['╱', '╲', '╱', '╲'],
      inv_trapezoid: ['╲', '╱', '╲', '╱'],
      rect_left_inv_arrow: ['▷', '┐', '▷', '┘'],
    };
    const corners = slants[v.block.type ?? ''];
    if (corners)
      [
        [x, y],
        [right, y],
        [x, bottom],
        [right, bottom],
      ].forEach(([cx, cy], i) => canvas.put(cx, cy, corners[i]));
    if (v.block.type === 'block_arrow') {
      if (!v.text.height) {
        canvas.clear(v.x, v.y, v.w, v.h);
        const p = port(v, 'T').at;
        canvas.segment(p[0], v.y, p[0], bottom);
        const q = port(v, 'L').at;
        if (arrowMask(v.block.directions) & (LEFT | RIGHT)) {
          canvas.clear(v.x, v.y, v.w, v.h);
          canvas.segment(v.x, q[1], right, q[1]);
          if (arrowMask(v.block.directions) & (UP | DOWN)) canvas.segment(p[0], v.y, p[0], bottom);
        }
      }
      const mask = arrowMask(v.block.directions);
      for (const [bit, side, dir] of [
        [LEFT, 'L', 'left'],
        [RIGHT, 'R', 'right'],
        [UP, 'T', 'up'],
        [DOWN, 'B', 'down'],
      ] as const) {
        if (mask & bit) {
          const p = port(v, side).at;
          canvas.put(p[0], p[1], markerGlyph('arrow', dir));
        }
      }
    }
  }
  finish();
  for (const v of frames) v.text.lines.forEach((line, i) => canvas.text(v.x + 2, v.y + i, ` ${line} `, { role: 'title' }));
  return canvas;
}
export const block: AsciiDiagram<BlockModel> = { type: 'block', render };

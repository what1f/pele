import type { ArchitectureModel } from '../../diagrams/architecture/db.js';
import { placeOnGrid } from '../../diagrams/architecture/layout.js';
import { Canvas, type Rect } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { gridLabel as label, gridWires, port, type Side, type Wire } from '../draw/grid-wires.js';
import { drawShape, shapeSize } from '../draw/shapes.js';

function render(model: ArchitectureModel, ctx: AsciiContext): Canvas {
  const canvas = new Canvas();
  const nodes = [...model.nodes.values()],
    groups = [...model.groups.values()];
  if (!nodes.length && !groups.length) return canvas;
  const grid = placeOnGrid(nodes, groups, model.edges, model.layoutHints);
  const texts = nodes.map((n) =>
    label(n.type === 'service' ? [n.iconText, n.title].filter(Boolean).join('<br>') || n.id : undefined, {
      maxWidth: ctx.compact ? 6 : 22,
      markdown: true,
    }),
  );
  const heads = groups.map((g) => label(g.title, { maxWidth: ctx.compact ? 12 : 32, markdown: true }));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const groupIndex = new Map(groups.map((g, i) => [g.id, i]));
  const endpointIndex = (id: string, via?: boolean): string => {
    const n = model.nodes.get(id)!;
    return via && n.in ? `g:${n.in}` : `n:${id}`;
  };
  const counts = new Map<string, number>(),
    used = new Map<string, number>();
  for (const e of model.edges)
    for (const [id, side, via] of [
      [e.lhsId, e.lhsDir, e.lhsGroup],
      [e.rhsId, e.rhsDir, e.rhsGroup],
    ] as const) {
      const k = `${endpointIndex(id, via)}:${side}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  const sizes = nodes.map((n, i) => {
    if (n.type === 'junction') return { w: 1, h: 1 };
    const size = shapeSize('rect', texts[i]);
    for (const side of ['L', 'R', 'T', 'B']) {
      const count = counts.get(`n:${n.id}:${side}`) ?? 0;
      if (side === 'L' || side === 'R') size.h = Math.max(size.h, count + 2);
      else size.w = Math.max(size.w, count + 2);
    }
    return size;
  });
  const C = Math.max(0, ...grid.col, ...groups.map((_, g) => grid.groupCol[g] + grid.groupCols[g] - 1)) + 1;
  const R = Math.max(0, ...grid.row, ...groups.map((_, g) => grid.groupRow[g] + grid.groupRows[g] - 1)) + 1;
  const cw = Array<number>(C).fill(1),
    rh = Array<number>(R).fill(1);
  nodes.forEach((_, i) => {
    cw[grid.col[i]] = Math.max(cw[grid.col[i]], sizes[i].w);
    rh[grid.row[i]] = Math.max(rh[grid.row[i]], sizes[i].h);
  });
  const l = Array<number>(C).fill(0),
    r = [...l],
    t = Array<number>(R).fill(0),
    b = [...t];
  const ins = groups.map(() => ({ l: 0, r: 0, t: 0, b: 0 }));
  for (let g = groups.length - 1; g >= 0; g--) {
    const c0 = grid.groupCol[g],
      c1 = c0 + grid.groupCols[g] - 1,
      r0 = grid.groupRow[g],
      r1 = r0 + grid.groupRows[g] - 1;
    const pad = ins[g];
    pad.l += 3;
    pad.r += 3;
    pad.t += Math.max(2, heads[g].height + 1);
    pad.b += 2;
    const room = cw.slice(c0, c1 + 1).reduce((a, v) => a + v, 0) + (c1 - c0) * (ctx.compact ? 4 : 6) + pad.l + pad.r;
    if (room < heads[g].width + 6) cw[c1] += heads[g].width + 6 - room;
    l[c0] = Math.max(l[c0], pad.l);
    r[c1] = Math.max(r[c1], pad.r);
    t[r0] = Math.max(t[r0], pad.t);
    b[r1] = Math.max(b[r1], pad.b);
    const p = grid.groupParent[g];
    if (p >= 0) {
      if (grid.groupCol[p] === c0) ins[p].l = Math.max(ins[p].l, pad.l);
      if (grid.groupCol[p] + grid.groupCols[p] - 1 === c1) ins[p].r = Math.max(ins[p].r, pad.r);
      if (grid.groupRow[p] === r0) ins[p].t = Math.max(ins[p].t, pad.t);
      if (grid.groupRow[p] + grid.groupRows[p] - 1 === r1) ins[p].b = Math.max(ins[p].b, pad.b);
    }
  }
  const rowGap = 4;
  const x: number[] = [],
    y: number[] = [];
  for (let c = 0, at = 0; c < C; c++) {
    x[c] = at + l[c];
    at = x[c] + cw[c] + r[c] + (ctx.compact ? 4 : 6);
  }
  for (let row = 0, at = 0; row < R; row++) {
    y[row] = at + t[row];
    at = y[row] + rh[row] + b[row] + rowGap;
  }
  const boxes: Rect[] = nodes.map((_, i) => ({
    x: x[grid.col[i]] + Math.floor((cw[grid.col[i]] - sizes[i].w) / 2),
    y: y[grid.row[i]] + Math.floor((rh[grid.row[i]] - sizes[i].h) / 2),
    ...sizes[i],
  }));
  const frames: Rect[] = groups.map((_, g) => {
    const c0 = grid.groupCol[g],
      c1 = c0 + grid.groupCols[g] - 1,
      r0 = grid.groupRow[g],
      r1 = r0 + grid.groupRows[g] - 1;
    return {
      x: x[c0] - ins[g].l,
      y: y[r0] - ins[g].t,
      w: x[c1] + cw[c1] + ins[g].r - x[c0] + ins[g].l,
      h: y[r1] + rh[r1] + ins[g].b - y[r0] + ins[g].t,
    };
  });
  frames.forEach((f) => canvas.box(f.x, f.y, f.w, f.h, { fill: false }));
  const internal: Wire[] = [];
  const endpoint = (id: string, side: Side, via?: boolean) => {
    const node = model.nodes.get(id)!,
      i = index.get(id)!;
    const gi = via && node.in ? groupIndex.get(node.in) : undefined;
    const rect = gi === undefined ? boxes[i] : frames[gi];
    const k = `${endpointIndex(id, via)}:${side}`,
      nth = used.get(k) ?? 0;
    used.set(k, nth + 1);
    // Group edges retain the service's row or column, as in the SVG renderer.
    const p = port(rect, side, nth, counts.get(k));
    if (gi !== undefined && (counts.get(k) ?? 0) === 1) {
      if (side === 'L' || side === 'R') p.at[1] = boxes[i].y + Math.floor(boxes[i].h / 2);
      else p.at[0] = boxes[i].x + Math.floor(boxes[i].w / 2);
    }
    if (gi !== undefined && node.type === 'junction') {
      const opposite: Record<Side, Side> = { L: 'R', R: 'L', T: 'B', B: 'T' };
      internal.push({
        from: port(boxes[i], side),
        to: { at: p.at, side: opposite[side] },
        text: label(undefined, { maxWidth: 1 }),
        style: { head: 'none', tail: 'none' },
      });
    }
    return p;
  };
  const wires: Wire[] = model.edges.map((e) => ({
    from: endpoint(e.lhsId, e.lhsDir, e.lhsGroup),
    to: endpoint(e.rhsId, e.rhsDir, e.rhsGroup),
    text: label(e.title, { maxWidth: ctx.compact ? 12 : 20, markdown: true }),
    style: {
      tail: e.lhsInto ? 'arrow' : 'none',
      head: e.rhsInto ? 'arrow' : 'none',
    },
  }));
  const headX = frames.map((f, g) => {
    const vertical = wires
      .flatMap((w) => [w.from, w.to])
      .filter((p) => p.side === 'T' || p.side === 'B')
      .map((p) => p.at[0]);
    for (let at = f.x + 2; at + heads[g].width + 2 < f.x + f.w - 1; at++) {
      if (!vertical.some((v) => v >= at - 1 && v <= at + heads[g].width + 2)) return at;
    }
    return f.x + 2;
  });
  const titles = frames.flatMap((f, g) =>
    heads[g].lines.map((_, i) => ({
      x: headX[g],
      y: f.y + i,
      w: heads[g].width + 2,
      h: 1,
    })),
  );
  const finish = gridWires(canvas, boxes, frames, titles, [...wires, ...internal]);
  nodes.forEach((n, i) => drawShape(canvas, boxes[i], n.type === 'junction' ? 'dot' : 'rect', texts[i]));
  finish();
  frames.forEach((f, g) => heads[g].lines.forEach((line, i) => canvas.text(headX[g], f.y + i, ` ${line} `, { role: 'title' })));
  return canvas;
}
export const architecture: AsciiDiagram<ArchitectureModel> = {
  type: 'architecture',
  render,
};

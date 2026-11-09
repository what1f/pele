import type { WardleyModel } from '../../diagrams/wardley/model.js';
import { Canvas, type Rect } from '../canvas/canvas.js';
import { Arm } from '../canvas/glyphs.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { drawEdgeLine, finishEdge, type EdgeStyle } from '../draw/edges.js';
import { gridLabel } from '../draw/grid-wires.js';
import type { Point } from '../layout/graph.js';
import type { TextBlock } from '../text/label.js';

interface Item {
  id?: string;
  evolution: number;
  visibility: number;
  x: number;
  y: number;
  symbol: string;
  raw: string;
  inertia?: boolean;
  caption?: Rect;
}
interface Line { points: Point[]; style: EdgeStyle; label?: string }
const key = (x: number, y: number) => `${x},${y}`;

function draw(model: WardleyModel, ctx: AsciiContext, gap: number): Canvas | undefined {
  const canvas = new Canvas();
  const width = Math.max(34, Math.min(ctx.compact ? 88 : 104, ctx.maxWidth - 8));
  const text = (raw: string | undefined, room = ctx.compact ? 14 : 22) => gridLabel(raw, { maxWidth: Math.max(2, room) });
  const stages = model.axes.stages?.length ? model.axes.stages : ['Genesis', 'Custom Built', 'Product', 'Commodity'];
  const custom = model.axes.stageBoundaries?.length === stages.length;
  const boundaries = stages.map((_, i) => custom ? model.axes.stageBoundaries![i] : (i + 1) / stages.length);
  const project = (x: number) => 5 + Math.round(x / 100 * (width - 12));
  const stageXs = boundaries.slice(0, -1).map(b => project(b * 100));
  const items: Item[] = [];
  const byId = new Map<string, Item>();
  const columns: number[] = [];
  const add = (evolution: number, visibility: number, symbol: string, raw: string, id?: string, inertia?: boolean): Item => {
    const desired = project(evolution);
    const options = [0, ...Array.from({ length: width }, (_, n) => [n + 1, -n - 1]).flat()];
    const x = symbol ? options.map(n => desired + n).find(x => x >= 3 && x < width - 3 && stageXs.every(s => s !== x) && columns.every(c => Math.abs(c - x) > 1)) ?? desired : desired;
    if (symbol) columns.push(x);
    const item = { evolution, visibility, x, y: 0, symbol, raw, id, inertia };
    items.push(item);
    if (id) byId.set(id, item);
    return item;
  };
  for (const n of model.nodes) {
    const symbol = n.className === 'anchor' ? '◆' : n.sourceStrategy === 'build' ? '◇' : n.sourceStrategy === 'buy' ? '○' : n.sourceStrategy === 'outsource' ? '◉' : n.sourceStrategy === 'market' ? '△' : '●';
    add(n.x!, n.y!, symbol, n.label, n.id, n.inertia);
  }
  for (const note of model.notes) add(note.x, note.y, '', note.text);
  for (const a of model.annotations) for (const p of a.coordinates) add(p.x, p.y, '', `${a.number} ${a.text ?? ''}`);
  for (const f of model.accelerators) add(f.x, f.y, '▶', f.name);
  for (const f of model.deaccelerators) add(f.x, f.y, '◀', f.name);
  let y = 3;
  for (const item of [...items].sort((a, b) => b.visibility - a.visibility)) {
    const h = text(item.raw).height;
    item.y = y + h;
    y = item.y + gap + 2;
  }
  const evolved = model.trends.flatMap(t => {
    const source = byId.get(t.nodeId);
    if (!source) return [];
    let x = project(t.targetX);
    if (Math.abs(x - source.x) < 4) x = source.x + (t.targetX >= source.evolution ? 4 : -4);
    const item: Item = { evolution: t.targetX, visibility: t.targetY, x, y: source.y, symbol: '○', raw: source.raw };
    items.push(item);
    return [{ source, target: item }];
  });
  const bottom = y + 2;
  for (const x of stageXs) canvas.segment(x, 1, x, bottom, { dashed: true, role: 'muted' });

  const ink = new Set<string>();
  const reserve = (r: Rect, pad = 0): void => {
    for (let yy = r.y - pad; yy < r.y + r.h + pad; yy++) for (let xx = r.x - pad; xx < r.x + r.w + pad; xx++) ink.add(key(xx, yy));
  };
  for (const item of items) if (item.symbol) reserve({ x: item.x, y: item.y, w: item.inertia ? 2 : 1, h: 1 });
  const lines: Line[] = [];
  const tracks: { x: number; top: number; bottom: number }[] = [];
  const departures = new Map<Item, number>();
  for (const l of model.links) {
    const from = byId.get(l.source), to = byId.get(l.target);
    // The SVG renderer also ignores self-dependencies.
    if (!from || !to || from === to) continue;
    const a = from.y < to.y ? from : to, b = a === from ? to : from;
    const nth = departures.get(a) ?? 0;
    departures.set(a, nth + 1);
    const preferred = nth === 0 ? a.x : a.x + (nth % 2 ? -1 : 1) * Math.ceil(nth / 2) * 2;
    const candidates = [0, ...Array.from({ length: width }, (_, n) => [n + 1, -n - 1]).flat()];
    const x = candidates.map(n => preferred + n).find(x => {
      if (x < 2 || x >= width - 2 || stageXs.includes(x)) return false;
      if (x !== a.x && Math.abs(x - a.x) < 2 || x !== b.x && Math.abs(x - b.x) < 2) return false;
      if (b.inertia && x > b.x && x - b.x < 3) return false;
      if (tracks.some(t => t.top < b.y && t.bottom > a.y && Math.abs(t.x - x) < 2)) return false;
      if (items.some(i => i.symbol && i !== a && i !== b && i.y >= a.y && i.y <= b.y && (i.x === x || i.y === a.y && i.x >= Math.min(a.x, x) && i.x <= Math.max(a.x, x)))) return false;
      return !evolved.some(t => t.source === a && x !== a.x && (x - a.x) * (t.target.x - a.x) > 0 || t.source === b && (x - b.x) * (t.target.x - b.x) > 0);
    });
    if (x === undefined) return undefined;
    tracks.push({ x, top: a.y, bottom: b.y });
    const points: Point[] = [[a.x + (a.inertia && x > a.x ? 1 : 0), a.y]];
    if (x !== a.x) points.push([x, a.y]);
    const end: Point = x === b.x ? [x, b.y - 1] : [b.x + (b.inertia && x > b.x ? 2 : -Math.sign(b.x - x)), b.y];
    if (x !== b.x) points.push([x, b.y]);
    points.push(end);
    const forward = l.flow === 'forward' || l.flow === 'bidirectional';
    const backward = l.flow === 'backward' || l.flow === 'bidirectional';
    lines.push({ points, label: l.label, style: { dashed: l.dashed, head: (a === from ? forward : backward) ? 'arrow' : 'none', tail: (a === from ? backward : forward) ? 'arrow' : 'none' } });
  }
  for (const { source, target } of evolved) {
    const sign = Math.sign(target.x - source.x);
    lines.push({ points: [[source.x, source.y], [target.x - sign, target.y]], style: { dashed: true, head: 'arrow' } });
  }
  for (const line of lines) {
    drawEdgeLine(canvas, line.points, line.style);
    finishEdge(canvas, line.points, line.style);
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1], b = line.points[i];
      const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
      let [x, y] = a;
      for (;;) {
        ink.add(key(x, y));
        if (x === b[0] && y === b[1]) break;
        x += dx; y += dy;
      }
    }
  }
  const free = (r: Rect): boolean => {
    if (r.x < 2 || r.x + r.w >= width - 1 || r.y < 2 || r.y + r.h > bottom) return false;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (ink.has(key(x, y))) return false;
    return true;
  };
  const write = (block: TextBlock, r: Rect): void => {
    canvas.clear(r.x - 1, r.y, r.w + 2, r.h);
    block.lines.forEach((s, i) => canvas.textIn(r.x, r.y + i, r.w, s));
    reserve(r, 1);
  };
  // Reserve edge labels first, directly above or beside their own segment.
  for (const line of lines) if (line.label) {
    const block = text(line.label);
    const candidates: Rect[] = [];
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1], b = line.points[i];
      if (a[1] === b[1]) {
        for (let x = Math.min(a[0], b[0]) + 2; x + block.width < Math.max(a[0], b[0]) - 1; x++) candidates.push({ x, y: a[1] - block.height, w: block.width, h: block.height });
      } else {
        for (let y = Math.min(a[1], b[1]) + 2; y + block.height < Math.max(a[1], b[1]); y++) for (const x of [a[0] + 2, a[0] - block.width - 1]) candidates.push({ x, y, w: block.width, h: block.height });
      }
    }
    const r = candidates.find(free);
    if (!r) return undefined;
    write(block, r);
  }
  for (const item of items) {
    if (item.symbol) {
      canvas.put(item.x, item.y, item.symbol);
      if (item.inertia) canvas.put(item.x + 1, item.y, '┃');
    }
    let found = false;
    for (const room of [ctx.compact ? 14 : 22, 14, 10, 6]) {
      const block = text(item.raw, room);
      if (!block.height) { found = true; break; }
      const candidates: Rect[] = [];
      for (const dy of [0, 1 - block.height, -block.height - 1, 2, -block.height - 2, 3]) {
        const xs = item.symbol ? [item.x + (item.inertia ? 3 : 2), item.x - block.width - 2, item.x - Math.floor(block.width / 2)] : [Math.min(width - block.width - 2, item.x), item.x - block.width - 2, ...Array.from({ length: width }, (_, n) => [item.x + n, item.x - n]).flat()];
        for (const x of xs) candidates.push({ x, y: item.y + dy, w: block.width, h: block.height });
      }
      const r = candidates.find(free);
      if (!r) continue;
      write(block, r); item.caption = r; found = true; break;
    }
    if (!found) return undefined;
  }
  for (const pipeline of model.pipelines) {
    const members = [pipeline.nodeId, ...pipeline.componentIds].map(id => byId.get(id)).filter((i): i is Item => i !== undefined);
    if (members.length < 2) continue;
    let x0 = Math.min(...members.map(i => Math.min(i.x, i.caption?.x ?? i.x))) - 2;
    let x1 = Math.max(...members.map(i => Math.max(i.x + 1, (i.caption?.x ?? i.x) + (i.caption?.w ?? 1)))) + 2;
    let y0 = Math.min(...members.map(i => Math.min(i.y, i.caption?.y ?? i.y))) - 2;
    let y1 = Math.max(...members.map(i => Math.max(i.y + 1, (i.caption?.y ?? i.y) + (i.caption?.h ?? 1)))) + 2;
    const conflict = (x: number, y: number, axis: number) => (canvas.armsAt(x, y) & axis) !== 0 || /\S/u.test(canvas.charAt(x, y) ?? '');
    for (let pass = 0; pass < 20; pass++) {
      let moved = false;
      if (Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i).some(x => conflict(x, y0, Arm.Left | Arm.Right))) { y0--; moved = true; }
      if (Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i).some(x => conflict(x, y1, Arm.Left | Arm.Right))) { y1++; moved = true; }
      if (Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).some(y => conflict(x0, y, Arm.Up | Arm.Down))) { x0--; moved = true; }
      if (Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).some(y => conflict(x1, y, Arm.Up | Arm.Down))) { x1++; moved = true; }
      if (!moved) break;
    }
    canvas.path([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]);
  }
  const bounds = canvas.bounds();
  const end = Math.max(bottom, bounds ? bounds.y + bounds.h + 1 : 0);
  canvas.segment(0, 1, 0, end);
  canvas.segment(0, end, width - 1, end);
  text(model.axes.yLabel ?? 'Visibility', width).lines.forEach((s, i) => canvas.text(0, -1 + i, s));
  let start = 0, height = 0;
  stages.forEach((stage, i) => {
    const next = i === stages.length - 1 ? width : stageXs[i];
    const block = text(stage, Math.max(2, next - start - 2));
    block.lines.forEach((s, row) => canvas.textIn(start, end + 1 + row, next - start, s));
    height = Math.max(height, block.height); start = next;
  });
  text(model.axes.xLabel ?? 'Evolution', width).lines.forEach((s, i) => canvas.textIn(0, end + height + 2 + i, width, s));
  return canvas;
}

export const wardley: AsciiDiagram<WardleyModel> = {
  type: 'wardley',
  render(model, ctx) {
    for (const gap of [3, 6, 10, 16]) {
      const canvas = draw(model, ctx, gap);
      if (canvas) return canvas;
    }
    throw new Error('Unable to draw this diagram.');
  },
};

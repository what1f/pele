import type { WardleyModel } from '../../diagrams/wardley/model.js';
import { Canvas, type Rect } from '../canvas/canvas.js';
import { Arm } from '../canvas/glyphs.js';
import type { AsciiDiagram } from '../core.js';
import { gridLabel, gridWires, port, type Wire } from '../draw/grid-wires.js';
import type { TextBlock } from '../text/label.js';

interface Item {
  id?: string;
  x: number;
  visibility: number;
  symbol: string;
  inertia?: boolean;
  connector?: boolean;
  text: TextBlock;
  rect: Rect;
  caption: Rect;
}

export const wardley: AsciiDiagram<WardleyModel> = {
  type: 'wardley',
  render(model, ctx) {
    const canvas = new Canvas();
    const width = Math.max(34, Math.min(ctx.compact ? 88 : 104, ctx.maxWidth - 12));
    const text = (raw: string | undefined, room = ctx.compact ? 14 : 22) => gridLabel(raw, { maxWidth: Math.max(2, room) });
    const stages = model.axes.stages?.length ? model.axes.stages : ['Genesis', 'Custom Built', 'Product', 'Commodity'];
    const custom = model.axes.stageBoundaries?.length === stages.length;
    const boundaries = stages.map((_, i) => custom ? model.axes.stageBoundaries![i] : (i + 1) / stages.length);
    const project = (x: number) => 6 + Math.round(x / 100 * (width - 14));
    const stageXs = boundaries.slice(0, -1).map(b => project(b * 100));
    const items: Item[] = [];
    const byId = new Map<string, Item>();
    const outgoing = new Map<string, number>();
    const incoming = new Map<string, number>();
    for (const link of model.links) {
      outgoing.set(link.source, (outgoing.get(link.source) ?? 0) + 1);
      incoming.set(link.target, (incoming.get(link.target) ?? 0) + 1);
    }
    for (const trend of model.trends) outgoing.set(trend.nodeId, (outgoing.get(trend.nodeId) ?? 0) + 1);
    const add = (x: number, visibility: number, symbol: string, raw?: string, id?: string, inertia?: boolean): Item => {
      const degree = id ? Math.max(outgoing.get(id) ?? 0, incoming.get(id) ?? 0, 1) : 1;
      const item: Item = {
        id, x, visibility, symbol, inertia, text: text(raw),
        rect: { x: 0, y: 0, w: symbol ? degree === 1 ? 1 : 2 * degree + 1 : 0, h: 1 },
        caption: { x: 0, y: 0, w: 0, h: 0 },
      };
      items.push(item);
      if (id) byId.set(id, item);
      return item;
    };
    for (const n of model.nodes) {
      const symbol = n.className === 'anchor' ? '◆' : n.sourceStrategy === 'build' ? '◇' : n.sourceStrategy === 'buy' ? '○' : n.sourceStrategy === 'outsource' ? '◉' : n.sourceStrategy === 'market' ? '△' : '●';
      add(n.x!, n.y!, symbol, n.label, n.id, n.inertia);
    }
    const trends = model.trends.map(t => add(t.targetX, t.targetY, '○'));
    for (const note of model.notes) add(note.x, note.y, '', note.text);
    for (const a of model.annotations) for (const p of a.coordinates) add(p.x, p.y, '', `${a.number} ${a.text ?? ''}`);
    for (const f of model.accelerators) add(f.x, f.y, '▶', f.name);
    for (const f of model.deaccelerators) add(f.x, f.y, '◀', f.name);

    // Reserve edge captions before routing; a long label must stay inside the map.
    const captions = new Map<object, Item>();
    for (const link of model.links) {
      const a = byId.get(link.source), b = byId.get(link.target);
      if (!link.label || !a || !b) continue;
      const caption = add((a.x + b.x) / 2, (a.visibility + b.visibility) / 2, '', link.label);
      caption.connector = true;
      captions.set(link, caption);
    }
    let y = 2;
    const overlaps = (a: Rect, b: Rect) => a.x <= b.x + b.w + 3 && a.x + a.w + 3 >= b.x && a.y <= b.y + b.h + 2 && a.y + a.h + 2 >= b.y;
    const reserved: Rect[] = [];
    for (const visibility of [...new Set(items.map(i => i.visibility))].sort((a, b) => b - a)) {
      let bottom = y;
      for (const item of items.filter(i => i.visibility === visibility)) {
        const desired = project(item.x);
        // Nudge ports off stage dividers so vertical exits cannot follow the grid.
        const candidates = [0, ...Array.from({ length: 8 }, (_, n) => [n + 1, -n - 1]).flat()];
        const x = candidates.map(offset => desired + offset).find(x => {
          const r = { ...item.rect, x: x - Math.floor(item.rect.w / 2) };
          const ports = item.id ? [['B', outgoing.get(item.id) ?? 0], ['T', incoming.get(item.id) ?? 0]] as const : [];
          const xs = ports.flatMap(([side, count]) => Array.from({ length: count }, (_, n) => port(r, side, n, count).at[0]));
          if (trends.includes(item)) xs.push(x);
          return r.x >= 2 && r.x + r.w < width - 2 && stageXs.every(s => xs.every(p => Math.abs(p - s) > (trends.includes(item) ? 3 : 1)));
        }) ?? desired;
        item.rect.x = x - Math.floor(item.rect.w / 2);
        const right = item.rect.x + item.rect.w + (item.inertia ? 2 : 1);
        const left = item.rect.x - item.text.width - 2;
        const onRight = right + item.text.width < width - 2 || left < 2;
        const room = onRight ? width - 2 - right : item.rect.x - 4;
        if (item.text.width > room) item.text = text(item.text.lines.join('<br>'), room);
        item.caption.w = item.text.width;
        item.caption.h = item.text.height;
        item.caption.x = item.symbol ? onRight ? right : item.rect.x - item.text.width - 2 : Math.max(2, Math.min(width - item.text.width - 2, x));
        let row = y;
        for (;;) {
          item.caption.y = row;
          item.rect.y = row + Math.max(0, item.text.height - 1);
          if (item.connector) item.rect = { ...item.caption };
          const regions = item.symbol ? [item.rect, item.caption] : [item.caption];
          if (!regions.some(a => reserved.some(b => overlaps(a, b)))) break;
          row++;
        }
        if (item.symbol || item.connector) {
          const above = Math.max(1, 2 * (incoming.get(item.id ?? '') ?? 0));
          const below = Math.max(1, 2 * (outgoing.get(item.id ?? '') ?? 0) + 1);
          reserved.push({ x: item.rect.x - 1, y: item.rect.y - above, w: item.rect.w + 2, h: above + below + 1 });
        }
        if (item.text.height) reserved.push({ ...item.caption });
        bottom = Math.max(bottom, item.rect.y + 1, item.caption.y + item.caption.h);
      }
      y = bottom + Math.max(4, 2 * Math.max(1, ...items.filter(i => i.visibility === visibility).map(i => outgoing.get(i.id ?? '') ?? 0)) + 2);
    }
    const plotBottom = Math.max(5, y - 1);
    const dividers: Rect[] = [];
    for (let i = 0; i < stages.length - 1; i++) {
      const x = stageXs[i];
      canvas.segment(x, 1, x, plotBottom, { dashed: true, role: 'muted' });
      dividers.push({ x, y: 1, w: 1, h: plotBottom });
    }
    const pipelines: Rect[] = model.pipelines.flatMap(pipeline => {
      const members = [pipeline.nodeId, ...pipeline.componentIds].map(id => byId.get(id)).filter((i): i is Item => i !== undefined);
      if (members.length < 2) return [];
      const x = Math.min(...members.map(i => Math.min(i.rect.x, i.caption.x))) - 3;
      const right = Math.max(...members.map(i => Math.max(i.rect.x + i.rect.w, i.caption.x + i.caption.w))) + 3;
      const top = Math.min(...members.map(i => i.caption.y)) - 3;
      const bottom = Math.max(...members.map(i => i.rect.y)) + 3;
      return [{ x, y: top, w: right - x + 1, h: bottom - top + 1 }];
    });
    const wires: Wire[] = [];
    const outs = new Map<string, number>(), ins = new Map<string, number>();
    const captionPort = (item: Item, side: 'T' | 'B') => {
      const result = port(item.rect, side);
      const xs = Array.from({ length: Math.max(1, item.rect.w - 2) }, (_, n) => item.rect.x + n + 1);
      xs.sort((a, b) => Math.abs(a - result.at[0]) - Math.abs(b - result.at[0]));
      result.at[0] = xs.find(x => stageXs.every(s => Math.abs(s - x) > 1)) ?? result.at[0];
      result.fixed = true;
      return result;
    };
    const sourcePort = (item: Item) => {
      const n = outs.get(item.id!) ?? 0;
      outs.set(item.id!, n + 1);
      return { ...port(item.rect, 'B', n, outgoing.get(item.id!) ?? 1), fixed: true };
    };
    for (const l of model.links) {
      const a = byId.get(l.source), b = byId.get(l.target);
      if (!a || !b) continue;
      const n = ins.get(l.target) ?? 0;
      ins.set(l.target, n + 1);
      const from = sourcePort(a);
      const to = { ...port(b.rect, 'T', n, incoming.get(l.target) ?? 1), fixed: true };
      const head = l.flow === 'forward' || l.flow === 'bidirectional' ? 'arrow' : 'none';
      const tail = l.flow === 'backward' || l.flow === 'bidirectional' ? 'arrow' : 'none';
      const caption = captions.get(l);
      if (caption) {
        wires.push({ from, to: captionPort(caption, 'T'), text: text(undefined), style: { dashed: l.dashed, head: 'none', tail } });
        wires.push({ from: captionPort(caption, 'B'), to, text: text(undefined), style: { dashed: l.dashed, head, tail: 'none' } });
      } else wires.push({ from, to, text: text(undefined), style: { dashed: l.dashed, head, tail } });
    }
    model.trends.forEach((t, i) => {
      const from = byId.get(t.nodeId);
      if (from) wires.push({ from: sourcePort(from), to: { ...port(trends[i].rect, t.targetX >= from.x ? 'L' : 'R'), fixed: true }, style: { dashed: true, head: 'arrow' }, text: text(undefined) });
    });
    const walls: Rect[] = [{ x: -3, y: -20, w: 4, h: plotBottom + 50 }, { x: width - 1, y: -20, w: 4, h: plotBottom + 50 }];
    const finish = gridWires(canvas, [...walls, ...items.filter(i => i.symbol || i.connector).map(i => i.rect)], dividers, items.filter(i => i.text.height && !i.connector).map(i => i.caption), wires);
    for (const item of items) {
      if (item.symbol) {
        canvas.segment(item.rect.x, item.rect.y, item.rect.x + item.rect.w - 1, item.rect.y);
        canvas.put(item.rect.x + Math.floor(item.rect.w / 2), item.rect.y, item.symbol);
        if (item.inertia) canvas.put(item.rect.x + item.rect.w, item.rect.y, '┃');
      }
      if (item.text.height && !item.connector) {
        canvas.clear(item.caption.x - 1, item.caption.y, item.caption.w + 2, item.caption.h);
        item.text.lines.forEach((s, i) => canvas.text(item.caption.x, item.caption.y + i, s));
      }
    }
    finish();
    for (const item of captions.values()) {
      canvas.clear(item.caption.x, item.caption.y, item.caption.w, item.caption.h);
      item.text.lines.forEach((s, i) => canvas.textIn(item.caption.x, item.caption.y + i, item.caption.w, s));
    }
    // Expand transparent pipeline frames rather than drawing a border along a wire.
    for (const frame of pipelines) {
      let x0 = frame.x, x1 = frame.x + frame.w - 1, y0 = frame.y, y1 = frame.y + frame.h - 1;
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
    const bottom = Math.max(plotBottom, bounds ? bounds.y + bounds.h + 1 : 0);
    canvas.segment(0, 1, 0, bottom);
    canvas.segment(0, bottom, width - 1, bottom);
    const heading = text(model.axes.yLabel ?? 'Visibility', width);
    heading.lines.forEach((s, i) => canvas.text(0, -heading.height + i, s));
    let start = 0, height = 0;
    stages.forEach((stage, i) => {
      const end = i === stages.length - 1 ? width : dividers[i].x;
      const rows = text(stage, Math.max(2, end - start - 2));
      rows.lines.forEach((s, j) => canvas.textIn(start, bottom + 1 + j, end - start, s));
      height = Math.max(height, rows.height); start = end;
    });
    text(model.axes.xLabel ?? 'Evolution', width).lines.forEach((s, i) => canvas.textIn(0, bottom + height + 2 + i, width, s));
    return canvas;
  },
};

import type { EventModelingModel } from '../../diagrams/eventmodeling/model.js';
import { Canvas, type Rect } from '../canvas/canvas.js';
import type { AsciiDiagram } from '../core.js';
import { alignPorts, gridLabel, gridWires, port, type Wire } from '../draw/grid-wires.js';
import { displayWidth } from '../text/width.js';

export const eventmodeling: AsciiDiagram<EventModelingModel> = {
  type: 'eventmodeling',
  render(model, ctx) {
    const canvas = new Canvas();
    const laneIndex = new Map(model.lanes.map((lane, i) => [lane, i]));
    const room = Math.max(8, Math.min(ctx.compact ? 14 : 24, Math.floor((ctx.maxWidth - Math.max(0, model.lanes.length - 1) * 3) / Math.max(1, model.lanes.length)) - 4));
    const text = (raw: string | undefined, max = room) => gridLabel(raw, { maxWidth: Math.max(2, max) });
    const literal = (raw: string, max = room) => text(raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split('\n').join('<br>'), max);
    const cards = model.boxes.map(box => {
      const incoming = model.relations.filter(r => r.target === box).length;
      const outgoing = model.relations.filter(r => r.source === box).length;
      const name = text(box.name);
      const data = box.data === undefined ? undefined : literal(box.data);
      const type = box.dataType ? text(box.dataType) : undefined;
      // Fan-in uses the top border after the ID; it never adds empty card rows.
      const w = Math.max(name.width + 4, (data?.width ?? 0) + 4, (type?.width ?? 0) + 4, displayWidth(box.id) + incoming * 2 + 7, outgoing * 2 + 3);
      return { box, name, data, type, incoming, rect: { x: 0, y: 0, w, h: name.height + 2 + (data ? data.height + 1 : 0) + (type ? type.height + 1 : 0) } };
    });
    const headings = model.lanes.map(lane => text(lane.label));
    const widths = model.lanes.map((_, i) => Math.max(headings[i].width, ...cards.filter(c => laneIndex.get(c.box.lane) === i).map(c => c.rect.w), 4));
    const columns: number[] = [];
    let total = 0;
    widths.forEach(w => { columns.push(total); total += w + 3; });
    total = Math.max(0, total - 3);
    const stacked = total > ctx.maxWidth;
    let y = 0;
    const titles: Rect[] = [];
    if (!stacked) {
      headings.forEach((head, i) => {
        const r = { x: columns[i], y: 0, w: widths[i], h: head.height };
        titles.push(r);
        head.lines.forEach((s, row) => canvas.textIn(r.x, row, r.w, s));
      });
      y = Math.max(0, ...headings.map(h => h.height)) + 1;
    }
    let previous = -1;
    cards.forEach(c => {
      const lane = laneIndex.get(c.box.lane)!;
      if (stacked && lane !== previous) {
        const heading = text(c.box.lane.label, Math.max(8, ctx.maxWidth - 4));
        heading.lines.forEach((s, row) => canvas.text(2, y + row, s));
        titles.push({ x: 2, y, w: heading.width, h: heading.height });
        y += heading.height + (c.incoming > 1 ? 3 : 1);
      }
      c.rect.x = stacked ? 6 : columns[lane] + Math.floor((widths[lane] - c.rect.w) / 2);
      c.rect.y = y;
      previous = lane;
      const connected = model.relations.some(r => r.source === c.box);
      y += c.rect.h + (connected ? 3 : 1);
    });
    const byBox = new Map(cards.map(c => [c.box, c]));
    const wires: Wire[] = [];
    const incoming = new Map<object, number>();
    for (const relation of model.relations) {
      const a = byBox.get(relation.source), b = byBox.get(relation.target);
      if (!a || !b) continue;
      const n = incoming.get(b) ?? 0;
      incoming.set(b, n + 1);
      // A side entrance keeps folded lane headings close to their cards.
      const target = port(b.rect, stacked && b.incoming === 1 ? 'R' : 'T');
      if (target.side === 'T') target.at[0] = b.rect.x + b.rect.w - 2 - n * 2;
      target.fixed = true;
      wires.push({ from: port(a.rect, 'B'), to: target, style: { head: 'arrow' }, text: text(undefined) });
    }
    alignPorts(wires);
    const finish = gridWires(canvas, cards.map(c => c.rect), [], titles, wires);
    for (const c of cards) {
      const r = c.rect;
      canvas.box(r.x, r.y, r.w, r.h, { dashed: c.box.reset });
      canvas.text(r.x + 2, r.y, ` ${c.box.id} `);
      let row = r.y + 1;
      c.name.lines.forEach(s => canvas.textIn(r.x + 2, row++, r.w - 4, s));
      for (const section of [c.type, c.data]) {
        if (!section) continue;
        canvas.segment(r.x, row, r.x + r.w - 1, row, { dashed: c.box.reset });
        row++;
        section.lines.forEach(s => canvas.textIn(r.x + 2, row++, r.w - 4, s));
      }
    }
    finish();
    const bounds = canvas.bounds();
    y = bounds ? bounds.y + bounds.h + 2 : 0;
    const max = Math.max(8, Math.min(48, ctx.maxWidth - 6));
    const card = (heading: string, raw: string): void => {
      const head = text(heading, max);
      const body = literal(raw, max);
      const w = Math.max(head.width, body.width) + 4;
      canvas.box(2, y, w, head.height + body.height + 3);
      head.lines.forEach((s, i) => canvas.textIn(4, y + 1 + i, w - 4, s));
      const divider = y + head.height + 1;
      canvas.segment(2, divider, w + 1, divider);
      body.lines.forEach((s, i) => canvas.textIn(4, divider + 1 + i, w - 4, s));
      y += head.height + body.height + 4;
    };
    for (const note of model.notes) card(`Note ${note.frame}${note.dataType ? ' (' + note.dataType + ')' : ''}`, note.text);
    for (const spec of model.specifications) {
      const rows = [`Given: ${spec.given.join(', ')}`];
      if (spec.when.length) rows.push(`When: ${spec.when.join(', ')}`);
      rows.push(`Then: ${spec.then.join(', ')}`);
      card(`Given / When / Then ${spec.frame}`, rows.join('\n'));
    }
    if (model.entities.length) card('Entities', model.entities.join('\n'));
    return canvas;
  },
};

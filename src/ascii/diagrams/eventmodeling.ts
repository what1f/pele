import type { EmBox, EventModelingModel } from '../../diagrams/eventmodeling/model.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiDiagram } from '../core.js';
import { drawEdgeLine, finishEdge } from '../draw/edges.js';
import type { Point } from '../layout/graph.js';
import { label } from '../text/label.js';
import { wrap } from '../text/width.js';

export const eventmodeling: AsciiDiagram<EventModelingModel> = {
  type: 'eventmodeling',
  render(model, ctx) {
    const canvas = new Canvas();
    const order = new Map(model.boxes.map((b, i) => [b, i]));
    const relations = model.relations.filter(r => order.has(r.source) && order.has(r.target));
    // Reuse a rail only after its previous relation has ended, never for overlapping runs.
    const ends: number[] = [];
    const rails = relations.map(r => {
      const start = Math.min(order.get(r.source)!, order.get(r.target)!);
      const end = Math.max(order.get(r.source)!, order.get(r.target)!);
      let rail = ends.findIndex(e => e < start);
      if (rail < 0) rail = ends.length;
      ends[rail] = end;
      return rail;
    });
    const x = ends.length ? ends.length * 2 + 2 : 0;
    const room = Math.max(8, Math.min(ctx.compact ? 32 : 44, ctx.maxWidth - x - 4));
    const plain = (raw: string): string[] => label(raw, { maxWidth: room }).lines.flatMap(s => wrap(s, room));
    const literal = (raw: string): string[] => raw.split('\n').flatMap(s => plain(s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')));
    const placed = new Map<EmBox, { y: number; h: number; ports: number[]; incoming: number; outgoing: number }>();
    let y = 0;
    for (const box of model.boxes) {
      const sections: string[][] = [plain(`${box.id} ${box.kind}${box.reset ? ' · reset' : ''}`), plain(box.name)];
      if (box.dataType) sections.push(plain(box.dataType));
      if (box.data !== undefined) sections.push(literal(box.data));
      const incoming = relations.filter(r => r.target === box).length;
      const outgoing = relations.filter(r => r.source === box).length;
      const head = plain(box.lane.label);
      head.forEach((s, j) => canvas.textIn(x, y + j, room + 4, s));
      y += head.length;
      const rows = sections.reduce((n, s) => n + s.length, 0) + sections.length - 1;
      const h = Math.max(rows + 2, incoming + outgoing + sections.length + 2);
      const w = room + 4;
      canvas.box(x, y, w, h);
      let row = y + 1;
      const dividers = new Set<number>();
      sections.forEach((section, i) => {
        if (i > 0) {
          dividers.add(row);
          canvas.segment(x, row, x + w - 1, row);
          row++;
        }
        section.forEach(s => canvas.textIn(x + 2, row++, room, s));
      });
      const ports = Array.from({ length: h - 2 }, (_, i) => y + i + 1).filter(r => !dividers.has(r));
      placed.set(box, { y, h, ports, incoming: 0, outgoing: 0 });
      y += h + 1;
    }
    relations.forEach((r, i) => {
      const source = placed.get(r.source)!;
      const target = placed.get(r.target)!;
      const sy = source.ports[source.ports.length - 1 - source.outgoing++];
      const ty = target.ports[target.incoming++];
      const rail = rails[i] * 2;
      const points: Point[] = [[x, sy], [rail, sy], [rail, ty], [x - 1, ty]];
      drawEdgeLine(canvas, points);
      finishEdge(canvas, points);
    });
    const card = (heading: string, raw: string): void => {
      const head = plain(heading);
      const rows = literal(raw);
      const w = room + 4;
      canvas.box(x, y, w, head.length + rows.length + 3);
      head.forEach((s, j) => canvas.textIn(x + 2, y + 1 + j, room, s));
      const divider = y + 1 + head.length;
      canvas.segment(x, divider, x + w - 1, divider);
      rows.forEach((s, j) => canvas.textIn(x + 2, divider + 1 + j, room, s));
      y += head.length + rows.length + 4;
    };
    for (const note of model.notes) card(`Note · ${note.frame}${note.dataType ? ' · ' + note.dataType : ''}`, note.text);
    for (const spec of model.specifications) {
      const rows = [`Given: ${spec.given.join(', ')}`];
      if (spec.when.length) rows.push(`When: ${spec.when.join(', ')}`);
      rows.push(`Then: ${spec.then.join(', ')}`);
      card(`Given / When / Then · ${spec.frame}`, rows.join('\n'));
    }
    if (model.entities.length) card('Entities', model.entities.join('\n'));
    return canvas;
  },
};

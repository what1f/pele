import type { WardleyModel } from '../../diagrams/wardley/model.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiDiagram } from '../core.js';
import { drawEdgeLine, finishEdge, type EdgeStyle } from '../draw/edges.js';
import type { Point } from '../layout/graph.js';
import { label } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

const number = (value: number): string => String(Number(value.toFixed(6)));

interface Entry { key: string; text: string; x: number; y: number; symbol: string }

export const wardley: AsciiDiagram<WardleyModel> = {
  type: 'wardley',
  render(model, ctx) {
    const canvas = new Canvas();
    const entries: Entry[] = [];
    const ids = new Map<string, string>();
    const add = (key: string, raw: string, x: number, y: number, symbol: string): void => { entries.push({ key, text: raw, x, y, symbol }); };
    model.nodes.forEach((n, i) => {
      const key = String(i + 1);
      ids.set(n.id, key);
      const details = [n.className === 'anchor' ? 'anchor' : n.isPipelineParent ? 'pipeline' : '', n.sourceStrategy, n.inertia ? 'inertia' : ''].filter(Boolean);
      add(key, `${n.label}${details.length ? ' · ' + details.join(' · ') : ''}`, n.x!, n.y!, n.className === 'anchor' ? '◆' : '●');
    });
    model.trends.forEach((t, i) => add(`E${i + 1}`, `Evolve ${ids.get(t.nodeId) ?? t.nodeId}`, t.targetX, t.targetY, '○'));
    model.notes.forEach((n, i) => add(`N${i + 1}`, n.text, n.x, n.y, ''));
    for (const a of model.annotations) a.coordinates.forEach((p, i) => add(`A${a.number}${i ? '.' + (i + 1) : ''}`, a.text ?? '', p.x, p.y, ''));
    model.accelerators.forEach((f, i) => add(`F${i + 1}`, `Accelerator · ${f.name}`, f.x, f.y, '▶'));
    model.deaccelerators.forEach((f, i) => add(`D${i + 1}`, `Deaccelerator · ${f.name}`, f.x, f.y, '◀'));
    const left = Math.max(6, ...entries.map(e => displayWidth(number(e.y)) + 2));
    const width = Math.max(28, Math.min(ctx.compact ? 72 : 96, ctx.maxWidth - left - 1));
    const room = width - 4;
    const text = (raw: string, limit = room): string[] => label(raw, { maxWidth: limit }).lines.flatMap(s => wrap(s, limit));
    const stages = model.axes.stages?.length ? model.axes.stages : ['Genesis', 'Custom Built', 'Product', 'Commodity'];
    const custom = model.axes.stageBoundaries?.length === stages.length;
    const boundaries = stages.map((_, i) => custom ? Math.max(0, Math.min(1, model.axes.stageBoundaries![i])) : (i + 1) / stages.length);
    text(model.axes.yLabel ?? 'Visibility', width).forEach((s, i) => canvas.text(left, i, s));
    const tokenWidth = Math.max(2, ...entries.map(e => displayWidth(e.symbol + e.key)));
    const projectX = (value: number): number => left + 2 + Math.round(value / 100 * (width - 6 - tokenWidth));
    const top = text(model.axes.yLabel ?? 'Visibility', width).length + 1;
    let y = top;
    const groups = [...new Set(entries.map(e => e.y))].sort((a, b) => b - a);
    // Labels live below the map, so dense coordinates cannot hide names or dependencies.
    for (const value of groups) {
      const rows: { end: number; entries: { entry: Entry; x: number }[] }[] = [];
      for (const entry of entries.filter(e => e.y === value).sort((a, b) => a.x - b.x)) {
        const x = projectX(entry.x);
        let row = rows.find(r => r.end + 2 <= x);
        if (!row) { row = { end: -Infinity, entries: [] }; rows.push(row); }
        row.entries.push({ entry, x }); row.end = x + displayWidth(entry.symbol + entry.key);
      }
      canvas.textIn(0, y, left - 2, number(value), 'right');
      for (const row of rows) {
        row.entries.forEach(p => canvas.text(p.x - 1, y, ' ' + p.entry.symbol + p.entry.key + ' '));
        y += 2;
      }
    }
    const bottom = Math.max(top + 2, y);
    canvas.segment(left, top - 1, left, bottom);
    canvas.segment(left, bottom, left + width - 1, bottom);
    let prior = 0;
    let stageHeight = 0;
    stages.forEach((stage, i) => {
      const end = i === stages.length - 1 ? width - 1 : projectX(boundaries[i] * 100) - left;
      const start = i === 0 ? 0 : projectX(prior * 100) - left;
      const w = Math.max(2, end - start);
      const rows = text(stage, w - 1);
      rows.forEach((s, j) => canvas.textIn(left + start, bottom + 1 + j, w, s));
      stageHeight = Math.max(stageHeight, rows.length);
      if (i > 0) canvas.segment(left + start, top - 1, left + start, bottom, { dashed: true, role: 'muted' });
      prior = boundaries[i];
    });
    y = bottom + stageHeight + 2;
    text(model.axes.xLabel ?? 'Evolution').forEach(s => canvas.textIn(left, y++, width, s));
    y++;
    const card = (heading: string, rows: string[]): void => {
      const title = ` ${text(heading).join(' ')} `;
      const body = rows.flatMap(s => text(s));
      const w = Math.min(width, Math.max(displayWidth(title) + 4, ...body.map(s => displayWidth(s) + 4)));
      canvas.box(left, y, w, body.length + 4, { fill: false });
      canvas.text(left + 2, y, title);
      body.forEach((s, j) => canvas.textIn(left + 2, y + 2 + j, w - 4, s));
      y += body.length + 5;
    };
    for (const e of entries) {
      const rows = text(`${e.symbol}${e.key} · ${e.text} [${number(e.y)}, ${number(e.x)}]`);
      rows.forEach((s, i) => canvas.text(left + (i ? 2 : 0), y++, s));
    }
    if (entries.length) y++;
    for (const p of model.pipelines) card(`Pipeline · ${ids.get(p.nodeId) ?? p.nodeId}`, p.componentIds.map(id => `${ids.get(id) ?? id} · ${model.nodes.find(n => n.id === id)?.label ?? id}`));
    const connection = (a: string, b: string, caption: string | undefined, style: EdgeStyle): void => {
      const captions = caption ? text(caption, width - 16) : [];
      const aw = displayWidth(a) + 4, bw = displayWidth(b) + 4;
      const span = Math.min(width, Math.max(24, ...captions.map(s => displayWidth(s) + 16), aw + bw + 8));
      const ly = y + captions.length + 1;
      captions.forEach((s, j) => canvas.textIn(left + aw + 1, y + j, span - aw - bw - 2, s));
      canvas.box(left, ly - 1, aw, 3);
      canvas.text(left + 2, ly, a);
      const bx = left + span - bw;
      canvas.box(bx, ly - 1, bw, 3);
      canvas.text(bx + 2, ly, b);
      const points: Point[] = [[left + aw - 1, ly], [bx - 1, ly]];
      drawEdgeLine(canvas, points, style);
      finishEdge(canvas, points, style);
      y = ly + 3;
    };
    for (const l of model.links) {
      const from = ids.get(l.source), to = ids.get(l.target);
      if (!from || !to) continue;
      connection(from, to, l.label, {
        dashed: l.dashed,
        head: l.flow === 'forward' || l.flow === 'bidirectional' ? 'arrow' : 'none',
        tail: l.flow === 'backward' || l.flow === 'bidirectional' ? 'arrow' : 'none',
      });
    }
    model.trends.forEach((t, i) => connection(ids.get(t.nodeId) ?? t.nodeId, `○E${i + 1}`, undefined, { dashed: true, head: 'arrow' }));
    return canvas;
  },
};

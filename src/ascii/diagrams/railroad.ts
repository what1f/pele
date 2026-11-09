import { fold, parts } from '../../diagrams/railroad/common.js';
import type { RailroadModel, RailroadNode } from '../../diagrams/railroad/types.js';
import { decodeEntities } from '../../text/entities.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { label } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

type Point = readonly [number, number];
interface Placed { box: Box; x: number; y: number }
interface Box {
  w: number;
  up: number;
  down: number;
  kids: Placed[];
  paths: Point[][];
  marks: { x: number; y: number; text: string }[];
  leaf?: 'terminal' | 'nonterminal' | 'special';
  lines?: string[];
}

function box(w: number, up = 0, down = 0): Box {
  return { w, up, down, kids: [], paths: [], marks: [] };
}

// Grammar literals are data, including markup and whitespace. Escape before label() parses HTML.
function literal(raw: string, width: number): string[] {
  const decoded = raw.includes('¶ß') ? decodeEntities(raw.replace(/&/g, '&amp;')) : raw;
  const shown = decoded.replace(/[\n\r\t]/g, (c) => c === '\n' ? '\\n' : c === '\r' ? '\\r' : '\\t');
  const visible = shown === '' ? '""' : shown.replace(/^ +| +$| {2,}/g, (spaces) => spaces.replace(/ /g, '␣'));
  const escaped = visible.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\:$]/g, (c) => `&#${c.codePointAt(0)};`);
  return label(escaped).lines.flatMap((line) => wrap(line, width));
}

function sequence(kids: Box[], gap: number): Box {
  const result = box(Math.max(2, kids.reduce((sum, k) => sum + k.w, 0) + Math.max(0, kids.length - 1) * gap));
  let x = 0;
  for (const kid of kids) {
    result.up = Math.max(result.up, kid.up);
    result.down = Math.max(result.down, kid.down);
    result.kids.push({ box: kid, x, y: 0 });
    if (x > 0) result.paths.push([[x - gap, 0], [x, 0]]);
    x += kid.w + gap;
  }
  if (!kids.length) result.paths.push([[0, 0], [result.w - 1, 0]]);
  return result;
}

function folded(rows: Box[]): Box {
  const result = box(Math.max(...rows.map((r) => r.w)) + 10, rows[0].up);
  const right = result.w - 1;
  let y = 0;
  rows.forEach((row, i) => {
    result.kids.push({ box: row, x: 4, y });
    if (i === 0) result.paths.push([[0, 0], [4, 0]]);
    if (i + 1 < rows.length) {
      const turn = y + row.down + 2;
      const next = turn + 2 + rows[i + 1].up;
      result.paths.push([[4 + row.w - 1, y], [right - 3, y], [right - 3, turn], [1, turn], [1, next], [4, next]]);
      result.marks.push({ x: 3, y: next, text: '▶' }, { x: Math.floor(right / 2), y: turn, text: '◀' });
      y = next;
    } else {
      result.paths.push([[4 + row.w - 1, y], [right - 1, y], [right - 1, 0], [right, 0]]);
      result.down = y + row.down;
    }
  });
  return result;
}

function bypass(kid: Box): Box {
  const up = kid.up + 2;
  const result = box(kid.w + 6, up, kid.down);
  const right = result.w - 1;
  result.kids.push({ box: kid, x: 3, y: 0 });
  result.paths.push([[0, 0], [3, 0]], [[right - 3, 0], [right, 0]], [[1, 0], [1, -up], [right - 1, -up], [right - 1, 0]]);
  result.marks.push({ x: Math.floor(right / 2), y: -up, text: '▶' });
  return result;
}

function measure(root: RailroadNode, ctx: AsciiContext): Box {
  const budgets = new Map<RailroadNode, number>();
  const pending: [RailroadNode, number][] = [[root, ctx.compact ? ctx.maxWidth - 6 : Infinity]];
  for (let i = 0; i < pending.length; i++) {
    const [node, room] = pending[i];
    budgets.set(node, room);
    const inset = node.type === 'sequence' ? 10 : node.type === 'repetition' && node.min === 0 ? 12 : 6;
    for (const kid of parts(node)) pending.push([kid, Math.max(8, room - inset)]);
  }
  return fold<RailroadNode, Box>(root, parts, (node, kids) => {
    const room = budgets.get(node)!;
    switch (node.type) {
      case 'terminal':
      case 'nonterminal':
      case 'special': {
        const raw = node.type === 'terminal' ? node.value : node.type === 'nonterminal' ? node.name : node.text;
        const width = ctx.compact ? Math.max(2, Math.min(22, room - 4 - (node.type === 'special' ? 4 : 0))) : 36;
        const lines = literal(raw, width);
        if (node.type === 'special') {
          lines[0] = '? ' + lines[0];
          lines[lines.length - 1] += ' ?';
        }
        const height = Math.max(1, lines.length);
        const up = Math.ceil(height / 2);
        return { ...box(Math.max(4, ...lines.map((l) => displayWidth(l) + 4)), up, height + 1 - up), leaf: node.type, lines };
      }
      case 'sequence': {
        const gap = ctx.compact ? 2 : 3;
        const result = sequence(kids, gap);
        if (result.w <= room || kids.length < 2) return result;
        const rows: Box[] = [];
        let row: Box[] = [];
        let width = 0;
        for (const kid of kids) {
          if (row.length && width + gap + kid.w > room - 10) {
            rows.push(sequence(row, gap));
            row = []; width = 0;
          }
          width += (row.length ? gap : 0) + kid.w;
          row.push(kid);
        }
        rows.push(sequence(row, gap));
        return rows.length > 1 ? folded(rows) : result;
      }
      case 'choice': {
        if (!kids.length) return sequence([], 0);
        const result = box(Math.max(...kids.map((k) => k.w)) + 6, kids[0].up);
        const right = result.w - 1;
        let y = 0;
        kids.forEach((kid, i) => {
          const x = 3 + Math.floor((result.w - 6 - kid.w) / 2);
          result.kids.push({ box: kid, x, y });
          result.paths.push([[1, y], [x, y]], [[x + kid.w - 1, y], [right - 1, y]]);
          if (i + 1 < kids.length) y += kid.down + 2 + kids[i + 1].up;
          else result.down = y + kid.down;
        });
        result.paths.push([[0, 0], [1, 0], [1, y]], [[right - 1, y], [right - 1, 0], [right, 0]]);
        return result;
      }
      case 'optional': return bypass(kids[0]);
      case 'repetition': {
        const kid = kids[0];
        if (node.min === 1 && node.max === 1) return kid;
        // The count describes total visits, not the number of return trips.
        const count = `${node.min}..${Number.isFinite(node.max) ? node.max : '*'} x`;
        const result = box(Math.max(kid.w + 6, displayWidth(count) + 6), kid.up, kid.down + 3);
        const right = result.w - 1;
        const x = Math.floor((result.w - kid.w) / 2);
        const loop = kid.down + 2;
        result.kids.push({ box: kid, x, y: 0 });
        result.paths.push([[0, 0], [x, 0]], [[x + kid.w - 1, 0], [right, 0]], [[right - 1, 0], [right - 1, loop], [1, loop], [1, 0]]);
        result.marks.push({ x: Math.floor(right / 2), y: loop, text: '◀' }, { x: Math.floor((result.w - displayWidth(count)) / 2), y: loop + 1, text: count });
        return node.min === 0 ? bypass(result) : result;
      }
    }
  });
}

function draw(canvas: Canvas, root: Box, x: number, y: number): void {
  const pending: Placed[] = [{ box: root, x, y }];
  while (pending.length) {
    const { box: b, x, y } = pending.pop()!;
    if (b.leaf) {
      canvas.box(x, y - b.up, b.w, b.up + b.down + 1, { round: b.leaf === 'terminal' });
      b.lines!.forEach((line, i) => canvas.textIn(x + 2, y - b.up + 1 + i, b.w - 4, line));
    }
    // Reconnect leaf ports after box() clears its border.
    for (const path of b.paths) canvas.path(path.map(([px, py]) => [x + px, y + py] as const));
    if (b.leaf) {
      canvas.segment(x - 1, y, x, y);
      canvas.segment(x + b.w - 1, y, x + b.w, y);
    }
    for (const mark of b.marks) canvas.text(x + mark.x, y + mark.y, mark.text);
    for (let i = b.kids.length - 1; i >= 0; i--) {
      const kid = b.kids[i];
      pending.push({ box: kid.box, x: x + kid.x, y: y + kid.y });
    }
  }
}

export const railroad: AsciiDiagram<RailroadModel> = {
  type: 'railroad',
  render(model, ctx) {
    const canvas = new Canvas();
    let top = 0;
    for (const rule of model.rules) {
      const heading = label(rule.name, { maxWidth: ctx.maxWidth });
      heading.lines.forEach((line, i) => canvas.text(0, top + i, line, { role: 'title' }));
      const b = measure(rule.definition, ctx);
      const y = top + heading.height + 1 + b.up;
      draw(canvas, b, 3, y);
      canvas.segment(0, y, 3, y);
      canvas.segment(b.w + 2, y, b.w + 5, y);
      canvas.put(0, y, '●');
      canvas.put(b.w + 5, y, '▶');
      top = y + b.down + 2;
    }
    return canvas;
  },
};

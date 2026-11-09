import { isLineMessage, numberMessages } from '../../diagrams/sequence/render.js';
import { LINETYPE as L, PLACEMENT as P, type SequenceModel } from '../../diagrams/sequence/types.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { markerGlyph, type Marker } from '../draw/edges.js';
import { label, type TextBlock } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

const kinds = new Map<number, string>([
  [L.LOOP_START, 'loop'], [L.ALT_START, 'alt'], [L.OPT_START, 'opt'],
  [L.PAR_START, 'par'], [L.PAR_OVER_START, 'par'], [L.CRITICAL_START, 'critical'],
  [L.BREAK_START, 'break'], [L.RECT_START, 'rect'],
]);
const ends = new Set<number>([L.LOOP_END, L.ALT_END, L.OPT_END, L.PAR_END, L.CRITICAL_END, L.BREAK_END, L.RECT_END]);
const branches = new Set<number>([L.ALT_ELSE, L.PAR_AND, L.CRITICAL_OPTION]);
interface Extent { left: number; right: number }
interface Frame extends Extent {
  start: number; end: number; children: Frame[]; titles: Map<number, TextBlock>;
  top: number; bottom: number;
}
interface Event extends Extent { y: number; h: number; text: TextBlock; slot: number; frame?: Frame }

function block(raw: string, width: number): TextBlock {
  const lines = label(raw).lines.flatMap(line => wrap(line, width));
  return { lines, width: Math.max(0, ...lines.map(displayWidth)), height: lines.length };
}
function arrow(type: number): { head: Marker; tail: Marker; dashed: boolean } {
  const half = type >= 41 && type <= 58;
  const base = type >= 51 ? type - 10 : type;
  const reverse = half && base >= 45;
  const open = [L.SOLID_OPEN, L.DOTTED_OPEN, L.SOLID_POINT, L.DOTTED_POINT, 43, 44, 47, 48].includes(base);
  const mark: Marker = [L.SOLID_CROSS, L.DOTTED_CROSS].includes(type) ? 'cross' : open ? 'open' : 'arrow';
  return {
    head: reverse ? 'none' : mark,
    tail: reverse || type === L.BIDIRECTIONAL_SOLID || type === L.BIDIRECTIONAL_DOTTED ? mark : 'none',
    dashed: [L.DOTTED, L.DOTTED_CROSS, L.DOTTED_OPEN, L.DOTTED_POINT, L.BIDIRECTIONAL_DOTTED].includes(type) || type >= 51,
  };
}

function render(model: SequenceModel, ctx: AsciiContext): Canvas {
  const canvas = new Canvas();
  const cols = [...model.actors].map(([id, actor]) => {
    const text = block(actor.description, ctx.compact ? 12 : 24);
    const figure = actor.type === 'actor';
    return { id, actor, text, figure, w: Math.max(5, text.width + 4), h: text.height + 2 + (figure ? 3 : 0), x: 0, birth: -1, death: -1 };
  });
  if (!cols.length) return canvas;
  for (const box of model.boxes) {
    const members = cols.filter(c => c.actor.box === box);
    if (members.length === 1) members[0].w = Math.max(members[0].w, block(box.name ?? '', ctx.compact ? 12 : 36).width + 2);
  }
  const index = new Map(cols.map((c, i) => [c.id, i]));
  const col = (id: string | undefined) => index.get(id ?? '') ?? 0;
  const n = cols.length;
  const numbering = numberMessages(model.messages, (ctx.config.sequence as Record<string, unknown> | undefined)?.showSequenceNumbers === true);
  const width = ctx.compact ? Math.max(6, Math.min(18, Math.floor(ctx.maxWidth / Math.max(2, n)) - 4)) : 36;
  const gap = Array.from({ length: n }, (_, i) => i + 1 < n ? Math.ceil(cols[i].w / 2) + Math.ceil(cols[i + 1].w / 2) + (ctx.compact ? 4 : 8) : 8);
  const levels = Array(n).fill(0) as number[];
  const maxLevels = Array(n).fill(0) as number[];
  const atLevel = model.messages.map(m => {
    if (m.type === L.ACTIVE_START) {
      const a = col(m.from);
      levels[a]++;
      maxLevels[a] = Math.max(maxLevels[a], levels[a]);
    } else if (m.type === L.ACTIVE_END) levels[col(m.from)] = Math.max(0, levels[col(m.from)] - 1);
    return [...levels];
  });
  const events: Event[] = [];
  const roots: Frame[] = [];
  const stack: Frame[] = [];
  const pad = 3;
  let depth = 0;
  for (let i = 0; i < model.messages.length; i++) {
    const m = model.messages[i];
    const t = m.type ?? -1;
    const a = col(m.from), b = col(m.to);
    const slot = a === b ? a : Math.max(a, b) - 1;
    const raw = typeof m.message === 'string' ? m.message : '';
    const text = block((numbering.shown[i] ? `${numbering.index[i]}. ` : '') + raw, width);
    const e: Event = { y: 0, h: 0, text, slot, left: Infinity, right: -Infinity };
    if (kinds.has(t)) {
      const title = block(`${kinds.get(t)}${raw && t !== L.RECT_START ? ` [${raw}]` : ''}`, width);
      const frame: Frame = { start: i, end: i, children: [], titles: new Map([[i, title]]), left: Infinity, right: -Infinity, top: 0, bottom: 0 };
      (stack.length ? stack[stack.length - 1].children : roots).push(frame);
      stack.push(frame);
      depth = Math.max(depth, stack.length);
      e.frame = frame;
    } else if (branches.has(t)) {
      e.frame = stack[stack.length - 1];
      e.frame?.titles.set(i, block(raw ? `[${raw}]` : '', width));
    } else if (ends.has(t)) {
      e.frame = stack.pop();
      if (e.frame) e.frame.end = i;
    } else if (isLineMessage(t)) {
      gap[slot] = Math.max(gap[slot], text.width + (a === b ? 9 + maxLevels[a] : 4 + 2 * Math.max(maxLevels[a], maxLevels[b])), a !== b && model.createdActors.has(cols[b].id) ? text.width + Math.ceil(cols[b].w / 2) + 4 : 0);
    } else if (t === L.NOTE) {
      const w = text.width + 4;
      if (m.placement === P.LEFTOF && a > 0) gap[a - 1] = Math.max(gap[a - 1], w + 4 + maxLevels[a - 1]);
      else if (m.placement === P.RIGHTOF || a === b) {
        if (m.placement === P.OVER) {
          if (a > 0) gap[a - 1] = Math.max(gap[a - 1], Math.ceil(w / 2) + 3);
          gap[a] = Math.max(gap[a], Math.ceil(w / 2) + 3);
        } else gap[a] = Math.max(gap[a], w + 3 + Math.max(1, maxLevels[a]));
      } else gap[Math.min(a, b)] = Math.max(gap[Math.min(a, b)], w + 4);
    }
    events.push(e);
  }
  const titleGaps = (f: Frame) => {
    let first = n - 1;
    for (let i = f.start; i <= f.end; i++) {
      const m = model.messages[i];
      if (m.from) first = Math.min(first, col(m.from));
      if (m.to) first = Math.min(first, col(m.to));
    }
    const w = Math.max(0, ...[...f.titles.values()].map(t => t.width));
    gap[first] = Math.max(gap[first], w + 6 + maxLevels[first]);
    f.children.forEach(titleGaps);
  };
  roots.forEach(titleGaps);
  for (const box of model.boxes) {
    const members = cols.filter(c => c.actor.box === box);
    if (members.length > 1) {
      const first = col(members[0].id);
      gap[first] = Math.max(gap[first], block(box.name ?? '', width).width + 4);
    }
  }
  // Leave separate lanes for the sides of nested fragments.
  for (let i = 0; i < n; i++) gap[i] = Math.max(gap[i], depth * 4 + 8);
  cols[0].x = Math.ceil(cols[0].w / 2) + depth * 2 + 3;
  for (let i = 1; i < n; i++) cols[i].x = cols[i - 1].x + gap[i - 1];
  const nextLine = (at: number | undefined): number => {
    if (at === undefined) return -1;
    for (let i = at; i < model.messages.length; i++) if (isLineMessage(model.messages[i].type)) return i;
    return -1;
  };
  for (const c of cols) {
    c.birth = nextLine(model.createdActors.get(c.id));
    c.death = nextLine(model.destroyedActors.get(c.id));
  }
  const runs = model.boxes.map(box => {
    const members = cols.filter(c => c.actor.box === box);
    const text = block(box.name ?? '', width);
    return { members, text, left: members.length ? members[0].x - Math.floor(members[0].w / 2) - 2 : 0,
      right: members.length ? members[members.length - 1].x + Math.ceil(members[members.length - 1].w / 2) + 1 : 0 };
  }).filter(run => run.members.length);
  const boxH = runs.length ? Math.max(1, ...runs.map(r => r.text.height)) + 1 : 0;
  const headH = Math.max(...cols.map(c => c.h));
  const headBottom = boxH + headH - 1;
  let y = headBottom + (runs.length ? 3 : 2);
  const textX: number[] = [];
  for (let i = 0; i < events.length; i++) {
    const m = model.messages[i], e = events[i], t = m.type ?? -1;
    const a = cols[col(m.from)], b = cols[col(m.to)];
    e.y = y;
    if (kinds.has(t) || branches.has(t)) {
      e.h = Math.max(1, e.frame?.titles.get(i)?.height ?? 0) + 1;
      if (kinds.has(t) && e.frame) e.frame.top = y;
    } else if (ends.has(t)) {
      e.h = 2;
      if (e.frame) e.frame.bottom = y;
    } else if (isLineMessage(t)) {
      const self = a === b;
      e.h = self ? Math.max(3, e.text.height + 2) + 1 : Math.max(1, e.text.height) + 2;
      if (b.birth === i) e.h = Math.max(e.h, b.h + 1);
      const left = cols[e.slot].x;
      const right = e.slot + 1 < n ? cols[e.slot + 1].x : left + gap[e.slot];
      textX[i] = self ? a.x + maxLevels[col(m.from)] + 6 : Math.floor((left + right - e.text.width) / 2);
      if (b.birth === i && !self) textX[i] = a.x < b.x ? Math.min(textX[i], b.x - Math.floor(b.w / 2) - e.text.width - 2) : Math.max(textX[i], b.x + Math.ceil(b.w / 2) + 2);
      e.left = Math.min(a.x, b.x, textX[i] - 1);
      e.right = Math.max(a.x, b.x, textX[i] + e.text.width + 1, self ? a.x + 4 : 0);
      if (b.birth === i) { e.left = Math.min(e.left, b.x - Math.floor(b.w / 2)); e.right = Math.max(e.right, b.x + Math.ceil(b.w / 2)); }
      if (a.death === i || b.death === i) e.h++;
    } else if (t === L.NOTE) {
      const w = Math.max(e.text.width + 4, m.placement === P.OVER ? Math.abs(a.x - b.x) + 5 : 0);
      textX[i] = m.placement === P.LEFTOF ? a.x - w - 2 : m.placement === P.RIGHTOF ? a.x + Math.max(1, maxLevels[col(m.from)]) + 1 : Math.floor((a.x + b.x - w + 1) / 2);
      e.left = textX[i]; e.right = e.left + w - 1;
      e.h = e.text.height + 3;
    }
    y += e.h;
  }
  const bottom = y;
  const safe = (x: number, dir: number) => {
    while (cols.some(c => x >= c.x - 1 && x <= c.x + Math.max(1, maxLevels[col(c.id)]))) x += dir;
    return x;
  };
  const titleLane = (f: Frame, w: number): number | undefined => {
    let left = f.left + 2;
    for (const c of cols) {
      if (c.x < f.left) continue;
      if (Math.min(c.x - 2, f.right - 1) - left >= w) return left;
      left = c.x + Math.max(1, maxLevels[col(c.id)]) + 1;
    }
    return f.right - 1 - left >= w ? left : undefined;
  };
  const fitFrame = (f: Frame): void => {
    f.children.forEach(fitFrame);
    for (let i = f.start; i <= f.end; i++) { f.left = Math.min(f.left, events[i].left); f.right = Math.max(f.right, events[i].right); }
    for (const child of f.children) { f.left = Math.min(f.left, child.left); f.right = Math.max(f.right, child.right); }
    if (!Number.isFinite(f.left)) { f.left = cols[0].x; f.right = cols[n - 1].x; }
    f.left = safe(f.left - pad, -1); f.right = safe(f.right + pad, 1);
    const titleW = Math.max(0, ...[...f.titles.values()].map(t => t.width));
    if (titleLane(f, titleW) === undefined && titleW) {
      const first = cols.find(c => c.x >= f.left);
      if (first && first.x + titleW + 4 < (cols[col(first.id) + 1]?.x ?? Infinity)) {
        f.right = safe(Math.max(f.right, first.x + titleW + 4), 1);
      } else f.left = safe(Math.min(f.left, (first?.x ?? f.left) - titleW - 4), -1);
    }
  };
  roots.forEach(fitFrame);
  const outline = (l: number, top: number, r: number, end: number) => {
    canvas.path([[l, top], [r, top], [r, end], [l, end], [l, top]]);
  };
  const drawFrame = (f: Frame) => {
    outline(f.left, f.top, f.right, f.bottom);
    for (const [i, text] of f.titles) {
      const e = events[i];
      if (i !== f.start) canvas.segment(f.left, e.y, f.right, e.y, { dashed: true });
      const tx = titleLane(f, text.width) ?? f.left + 2;
      for (let k = 0; k < text.height; k++) {
        if (k) canvas.segment(f.left, e.y + k, f.right, e.y + k, { dashed: i !== f.start });
        canvas.text(tx - 1, e.y + k, ` ${text.lines[k]} `);
      }
    }
    f.children.forEach(drawFrame);
  };
  roots.forEach(drawFrame);
  for (const r of runs) {
    r.right = Math.max(r.right, r.left + r.text.width + 3);
    outline(r.left, 0, r.right, headBottom + 1);
    for (let k = 0; k < r.text.height; k++) canvas.text(r.left + 2, k, ` ${r.text.lines[k]} `);
  }
  const messageY = (i: number) => events[i].y + (cols[col(model.messages[i].from)] === cols[col(model.messages[i].to)] ? events[i].h - 2 : Math.max(1, events[i].text.height, cols[col(model.messages[i].to)].birth === i ? cols[col(model.messages[i].to)].h - 2 : 0));
  for (const c of cols) {
    const start = c.birth < 0 ? headBottom : messageY(c.birth) + 1;
    const end = c.death < 0 ? bottom : messageY(c.death) + 1;
    canvas.segment(c.x, start, c.x, end);
    const active: number[] = [];
    for (let i = 0; i < model.messages.length; i++) {
      const m = model.messages[i];
      if (m.from !== c.id) continue;
      if (m.type === L.ACTIVE_START) active.push(Math.max(start, i > 0 && isLineMessage(model.messages[i - 1].type) ? messageY(i - 1) : events[i].y));
      if (m.type === L.ACTIVE_END && active.length) {
        const depth = active.length - 1;
        canvas.segment(c.x + depth, active.pop()!, c.x + depth, Math.min(end, events[i].y - 1), { stroke: 'heavy' });
      }
    }
    active.forEach((top, d) => canvas.segment(c.x + d, top, c.x + d, end, { stroke: 'heavy' }));
  }
  const actor = (c: typeof cols[number], top: number, footer = false) => {
    const left = c.x - Math.floor(c.w / 2);
    if (c.figure && !footer) {
      canvas.clear(left, top, c.w, 3);
      canvas.put(c.x, top, '○'); canvas.text(c.x - 1, top + 1, '─┼─'); canvas.text(c.x - 1, top + 2, '╱ ╲');
      top += 3;
    }
    canvas.clear(left, top, c.w, c.text.height + 2);
    canvas.box(left, top, c.w, c.text.height + 2);
    c.text.lines.forEach((line, k) => canvas.textIn(left + 1, top + k + 1, c.w - 2, line));
    if (footer) canvas.segment(c.x, top - 1, c.x, top);
    else canvas.segment(c.x, top + c.text.height + 1, c.x, top + c.text.height + 2);
  };
  for (const c of cols) {
    if (c.birth < 0) actor(c, headBottom - c.h + 1);
    if (c.death < 0) actor(c, bottom, true);
  }
  for (let i = 0; i < events.length; i++) {
    const m = model.messages[i], e = events[i], t = m.type ?? -1;
    const a = cols[col(m.from)], b = cols[col(m.to)];
    if (t === L.NOTE) {
      canvas.clear(e.left, e.y, e.right - e.left + 1, e.text.height + 2);
      canvas.box(e.left, e.y, e.right - e.left + 1, e.text.height + 2);
      e.text.lines.forEach((line, k) => canvas.textIn(e.left + 1, e.y + k + 1, e.right - e.left - 1, line));
    } else if (isLineMessage(t)) {
      const lineY = messageY(i);
      const style = arrow(t);
      const self = a === b;
      const aDepth = atLevel[i][col(m.from)];
      let bDepth = atLevel[i][col(m.to)];
      // Only the immediately following activation starts on this message's arrow row.
      const next = model.messages[i + 1];
      if (next?.type === L.ACTIVE_START && next.from === m.to) bDepth++;
      const source = a.x + Math.max(0, aDepth - 1);
      let target = b.x + Math.max(0, bDepth - 1);
      if (b.birth === i) {
        actor(b, lineY - b.h + 2);
        target += a.x < b.x ? -Math.floor(b.w / 2) : Math.ceil(b.w / 2) - 1;
      }
      const dir = target > source ? 1 : -1;
      if (self) canvas.path([[source, e.y], [Math.max(source, target) + 4, e.y], [Math.max(source, target) + 4, lineY], [target + (style.head === 'none' ? 0 : 1), lineY]], style);
      else canvas.segment(source, lineY, target - (style.head === 'none' ? 0 : dir), lineY, style);
      if (style.head !== 'none') canvas.put(self ? target + 1 : target - dir, lineY, markerGlyph(style.head, self || dir < 0 ? 'left' : 'right'));
      if (style.tail !== 'none') canvas.put(source + (self ? 1 : dir), self ? e.y : lineY, markerGlyph(style.tail, self || dir > 0 ? 'left' : 'right'));
      const cc = m.centralConnection;
      if (cc === L.CENTRAL_CONNECTION || cc === L.CENTRAL_CONNECTION_DUAL) canvas.put(b.x, lineY, '○');
      if (cc === L.CENTRAL_CONNECTION_REVERSE || cc === L.CENTRAL_CONNECTION_DUAL) canvas.put(a.x, lineY, '○');
      e.text.lines.forEach((line, k) => canvas.textIn(textX[i], (self ? e.y + 1 : lineY - Math.max(1, e.text.height)) + k, e.text.width, line));
      for (const c of new Set([a, b])) if (c.death === i) canvas.put(c.x, lineY + 1, '×');
    }
  }
  return canvas;
}

export const sequence: AsciiDiagram<SequenceModel> = { type: 'sequence', render };

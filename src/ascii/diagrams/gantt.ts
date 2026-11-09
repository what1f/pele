import { autoTicks, intervalTicks, timeFormat } from '../../diagrams/gantt/axis.js';
import { add, addDays } from '../../diagrams/gantt/dates.js';
import type { GanttDb } from '../../diagrams/gantt/db.js';
import type { GanttTask } from '../../diagrams/gantt/types.js';
import { Canvas } from '../canvas/canvas.js';
import { Arm } from '../canvas/glyphs.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { label } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

function lines(raw: string, width: number): string[] {
  return label(raw).lines.flatMap(line => wrap(line, width));
}

function scheduled(task: GanttTask): boolean {
  return task.startTime !== undefined && task.endTime !== undefined
    && Number.isFinite(+task.startTime) && Number.isFinite(+task.endTime);
}

function caption(task: GanttTask): string {
  const tags = [task.crit ? 'crit' : '', task.active ? 'active' : '', task.done ? 'done' : '', task.vert && !scheduled(task) ? 'vert' : ''].filter(Boolean);
  return task.task + (tags.length ? ` [${tags.join(', ')}]` : '');
}

function render(model: GanttDb, ctx: AsciiContext): Canvas {
  const canvas = new Canvas();
  // ASCII has no clock option. Anchor partial dates and implicit starts, and omit the live today marker.
  const tasks = model.getTasks(new Date(2000, 0, 1));
  const dated = tasks.filter(scheduled);
  const config = (ctx.config.gantt ?? {}) as Record<string, unknown>;
  const setting = (key: string): string => typeof config[key] === 'string' ? config[key] as string : '';
  const packed = model.displayMode === 'compact';
  const width = Math.max(24, Math.min(ctx.compact ? 80 : 100, Math.floor(ctx.maxWidth)));
  const labelWidth = packed ? 0 : Math.min(ctx.compact ? 22 : 30, Math.max(8, Math.floor(width / 3)));
  const left = packed ? 0 : labelWidth + 2;
  const plot = width - left;
  const right = width - 1;
  const start = dated.length ? Math.min(...dated.map(t => +t.startTime!)) : 0;
  const stop = dated.length ? Math.max(start, ...dated.map(t => +t.endTime!)) : start;
  const x = (time: number): number => left + (stop > start
    ? Math.round(Math.max(0, Math.min(1, (time - start) / (stop - start))) * (plot - 1))
    : Math.floor((plot - 1) / 2));
  const format = model.axisFormat || (model.dateFormat === 'D' ? '%d' : setting('axisFormat') || '%Y-%m-%d');
  const tickText = (time: number): string => label(timeFormat(format, new Date(time))).lines.join(' ');
  const count = Math.max(2, Math.floor(plot / Math.max(8, displayWidth(tickText(start)) + 3)));
  const ticks = intervalTicks(model.tickInterval || setting('tickInterval'), model.weekday ?? (setting('weekday') || 'sunday'), start, stop, plot)
    ?? autoTicks(start, stop, count);
  const axis = (y: number, top: boolean): number => {
    canvas.segment(left, y, right, y);
    let end = left - 2;
    let previous: string | undefined;
    for (const time of ticks) {
      const tx = x(time);
      canvas.stub(tx, y, top ? Arm.Up : Arm.Down);
      const text = tickText(time);
      const w = displayWidth(text);
      const at = Math.max(left, Math.min(right - w + 1, tx - Math.floor(w / 2)));
      if (at <= end + 1 || w > plot || text === previous) continue;
      canvas.text(at, y + (top ? -1 : 1), text, { role: 'muted' });
      end = at + w - 1;
      previous = text;
    }
    return y + 2;
  };

  let y = 0;
  const markers = new Map<number, GanttTask[]>();
  for (const task of dated.filter(t => t.vert)) {
    const at = x(+task.startTime!);
    const group = markers.get(at) ?? [];
    group.push(task);
    markers.set(at, group);
  }
  const markerStarts = new Map<number, number>();
  for (const [at, group] of markers) {
    const text = lines(group.map(caption).join(' / '), packed ? Math.min(28, plot) : labelWidth);
    if (packed) {
      const tx = Math.max(left, Math.min(right - Math.max(0, ...text.map(displayWidth)) + 1, at));
      text.forEach((line, i) => canvas.text(tx, y + i, line));
      y += text.length;
    } else {
      text.forEach((line, i) => canvas.text(0, y + i, line));
      y += Math.max(1, text.length) - 1;
    }
    canvas.put(at, y, '▼');
    markerStarts.set(at, y + 1);
    y += 2;
  }
  if (dated.length && (model.topAxis || config.topAxis === true)) y = axis(y + 1, true);
  if (dated.length && (model.excludes.length || model.includes.length) && +add(new Date(start), 6, 'y') > stop) {
    const excluded = new Set<number>();
    for (let day = new Date(start); +day <= stop; day = addDays(day, 1)) {
      if (!model.isInvalidDate(day)) continue;
      const from = new Date(day); from.setHours(0, 0, 0, 0);
      const to = addDays(from, 1);
      for (let at = x(+from); at < x(+to); at++) excluded.add(at);
    }
    if (excluded.size) {
      if (packed) { canvas.text(0, y++, 'excludes'); }
      else canvas.text(0, y, 'excludes');
      for (const at of excluded) canvas.put(at, y, '░');
      y += 2;
    }
  }

  interface Bar { task: GanttTask; text: string[]; tx: number; x0: number; x1: number; row: number }
  const bars: Bar[] = [];
  const sections: { title: string[]; y: number }[] = [];
  const rows = tasks.filter(t => !t.vert || !scheduled(t));
  const groups: GanttTask[][] = [];
  for (const task of rows) {
    const last = packed ? groups.find(group => group[0].section === task.section) : groups[groups.length - 1];
    if (last && last[0].section === task.section) last.push(task);
    else groups.push([task]);
  }
  for (const group of groups) {
    const section = group[0].section;
    if (section) {
      const title = lines(section, width - 4);
      sections.push({ title, y });
      y += title.length + 1;
    }
    const lanes: { end: number; time: number; bars: Bar[]; height: number }[] = [];
    for (const task of packed ? [...group].sort((a, b) => (+a.startTime! - +b.startTime!) || a.order - b.order) : group) {
      const valid = scheduled(task);
      const text = lines(caption(task), packed ? Math.min(28, plot) : labelWidth);
      const tw = Math.max(0, ...text.map(displayWidth));
      const x0 = valid ? x(task.milestone ? (+task.startTime! + +task.endTime!) / 2 : +task.startTime!) : left;
      const x1 = valid ? Math.max(x0, x(+(task.renderEndTime ?? task.endTime!)) - 1) : left;
      const tx = packed ? Math.max(left, Math.min(right - tw + 1, x0)) : 0;
      const extent = Math.max(x1, tx + tw - 1);
      const bar: Bar = { task, text, tx, x0, x1, row: 0 };
      let lane = packed && valid ? lanes.find(l => l.end + 2 < Math.min(tx, x0) && l.time <= +task.startTime!) : undefined;
      if (!lane) { lane = { end: -Infinity, time: -Infinity, bars: [], height: 0 }; lanes.push(lane); }
      lane.bars.push(bar);
      lane.end = extent;
      lane.time = valid ? +task.endTime! : Infinity;
      lane.height = Math.max(lane.height, Math.max(1, text.length) + (packed ? 1 : 0));
    }
    for (const lane of lanes) {
      for (const bar of lane.bars) { bar.row = y + (packed ? lane.height - 1 : Math.floor(lane.height / 2)); bars.push(bar); }
      y += lane.height + 1;
    }
  }
  if (!rows.length && !dated.length) {
    for (const section of model.sections) {
      const title = lines(section, width - 4);
      sections.push({ title, y }); y += title.length + 1;
    }
  }
  const bottom = Math.max(y, 1);
  for (const [at, from] of markerStarts) if (from < bottom) canvas.segment(at, from, at, bottom, { dashed: true });
  for (const section of sections) {
    canvas.segment(0, section.y, right, section.y);
    section.title.forEach((line, i) => {
      canvas.clear(2, section.y + i, displayWidth(line) + 2, 1);
      canvas.text(2, section.y + i, ` ${line} `);
    });
  }
  for (const bar of bars) {
    const { task, row, text, tx, x0, x1 } = bar;
    const ty = packed ? row - text.length : row - Math.floor(text.length / 2);
    text.forEach((line, i) => {
      canvas.clear(tx - 1, ty + i, displayWidth(line) + 2, 1);
      canvas.text(tx, ty + i, line);
    });
    if (!scheduled(task)) { canvas.put(left, row, '?'); continue; }
    canvas.clear(x0, row, task.milestone ? 1 : x1 - x0 + 1, 1);
    if (task.milestone) canvas.put(x0, row, '◆');
    else canvas.text(x0, row, '█'.repeat(x1 - x0 + 1), { role: task.crit ? 'accent' : 'series0' });
  }
  if (dated.length) axis(bottom, false);
  if (!canvas.bounds()) canvas.text(0, 0, '─');
  return canvas;
}

export const gantt: AsciiDiagram<GanttDb> = { type: 'gantt', render };

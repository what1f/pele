import type { TimelineModel, TimelinePeriod } from '../../diagrams/timeline/db.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiDiagram } from '../core.js';
import { label } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

export const timeline: AsciiDiagram<TimelineModel> = {
  type: 'timeline',
  render(model, ctx) {
    const canvas = new Canvas();
    const room = Math.max(12, Math.min(ctx.maxWidth, 88));
    const timeLimit = Math.max(2, Math.min(ctx.compact ? 16 : 24, Math.floor((room - 12) / 3)));
    const text = (raw: string, width: number): string[] =>
      label(raw, { maxWidth: width }).lines.flatMap((line) => wrap(line, width));
    const times = model.periods.map((period) => text(period.text, timeLimit));
    const timeW = Math.max(2, ...times.flat().map(displayWidth));
    const eventLimit = Math.max(2, room - timeW - 12);
    const events = model.periods.map((period) => period.events.flatMap((event) => text(event, eventLimit)));
    const eventW = Math.max(2, ...events.flat().map(displayWidth));
    const groups: { title?: string; periods: TimelinePeriod[] }[] = model.sections.map((title) => ({ title, periods: [] }));
    const leading: typeof groups[number] = { periods: [] };
    for (const period of model.periods) (groups[period.sectionIndex] ?? leading).periods.push(period);
    if (leading.periods.length > 0) groups.unshift(leading);
    const indices = new Map(model.periods.map((period, i) => [period, i]));
    const bodyW = timeW + eventW + 12;
    const axisX = timeW + 5;
    let y = 0;
    for (const group of groups) {
      const title = text(group.title ?? '', Math.max(2, bodyW - 6));
      const framed = group.title !== undefined;
      const headerH = framed ? Math.max(1, title.length) + 1 : 0;
      const rows = group.periods.map((period) => {
        const i = indices.get(period)!;
        return { time: times[i], events: events[i], h: Math.max(1, times[i].length, events[i].length) };
      });
      const contentH = rows.reduce((sum, row) => sum + row.h, 0) + Math.max(0, rows.length - 1);
      const h = headerH + (rows.length === 0 ? 1 : contentH + (framed ? 2 : 0));
      if (framed) {
        canvas.box(0, y, bodyW, h, { fill: false });
        title.forEach((line, i) => canvas.text(i === 0 ? 2 : 3, y + i, i === 0 ? ` ${line} ` : line));
      }
      let ry = y + headerH;
      if (rows.length > 0) canvas.segment(axisX, ry, axisX, ry + contentH - 1);
      for (const row of rows) {
        canvas.segment(axisX - 1, ry, axisX + 1, ry);
        canvas.put(axisX, ry, '●');
        row.time.forEach((line, i) => canvas.text(3 + timeW - displayWidth(line), ry + i, line));
        row.events.forEach((line, i) => canvas.text(axisX + 3, ry + i, line));
        ry += row.h + 1;
      }
      y += h + 1;
    }
    return canvas;
  },
};

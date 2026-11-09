import type { JourneyModel, JourneyTask } from '../../diagrams/journey/db.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiDiagram } from '../core.js';
import { label } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';

export const journey: AsciiDiagram<JourneyModel> = {
  type: 'journey',
  render(model, ctx) {
    const canvas = new Canvas();
    const groups: { title?: string; tasks: JourneyTask[] }[] = [];
    const leading: typeof groups[number] = { tasks: [] };
    for (const task of model.tasks) {
      if (task.section === '') leading.tasks.push(task);
      else {
        if (groups.at(-1)?.title !== task.section) groups.push({ title: task.section, tasks: [] });
        groups[groups.length - 1].tasks.push(task);
      }
    }
    if (leading.tasks.length > 0) groups.unshift(leading);
    const available = Math.max(4, ctx.maxWidth - 15);
    const nameLimit = ctx.compact ? Math.max(2, Math.min(30, Math.floor(available * 0.6))) : 28;
    const peopleLimit = ctx.compact ? Math.max(2, Math.min(24, available - nameLimit)) : 24;
    const text = (raw: string, width: number): string[] =>
      label(raw, { maxWidth: width }).lines.flatMap((line) => wrap(line, width));
    const panels = groups.map((group) => {
      const rows = group.tasks.map((task) => ({
        task,
        name: text(task.task, nameLimit),
        people: text(task.people.filter(Boolean).join(', '), peopleLimit),
      }));
      const nameW = Math.max(2, ...rows.flatMap((row) => row.name).map(displayWidth));
      const peopleW = Math.max(0, ...rows.flatMap((row) => row.people).map(displayWidth));
      const title = text(group.title ?? '', nameW + peopleW + 9);
      const w = Math.max(nameW + peopleW + 15, ...title.map((line) => displayWidth(line) + 6));
      const headerH = Math.max(1, title.length) + 1;
      const h = headerH + rows.reduce((sum, row) => sum + Math.max(1, row.name.length, row.people.length), 0) + 2;
      return { rows, nameW, title, w, h, headerH };
    });
    const stacked = ctx.compact || panels.reduce((sum, panel) => sum + panel.w + 2, -2) > ctx.maxWidth;
    let x = 0;
    let y = 0;
    for (const panel of panels) {
      canvas.box(x, y, panel.w, panel.h, { fill: false });
      panel.title.forEach((line, i) => canvas.text(x + (i === 0 ? 2 : 3), y + i, i === 0 ? ` ${line} ` : line));
      let ry = y + panel.headerH;
      for (const row of panel.rows) {
        row.name.forEach((line, i) => canvas.text(x + 3, ry + i, line));
        const score = Number.isNaN(row.task.score) ? undefined : Math.round(Math.max(1, Math.min(5, row.task.score)));
        const bar = score === undefined ? '─────' : '●'.repeat(score) + '○'.repeat(5 - score);
        canvas.text(x + 3 + panel.nameW + 2, ry, bar);
        row.people.forEach((line, i) => canvas.text(x + 3 + panel.nameW + 9, ry + i, line));
        ry += Math.max(1, row.name.length, row.people.length);
      }
      if (stacked) y += panel.h + 1;
      else x += panel.w + 2;
    }
    return canvas;
  },
};

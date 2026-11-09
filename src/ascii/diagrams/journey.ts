import type { JourneyModel } from '../../diagrams/journey/db.js';
import type { AsciiDiagram } from '../core.js';
import { cardColumns, type CardColumn } from '../draw/cards.js';

export const journey: AsciiDiagram<JourneyModel> = {
  type: 'journey',
  render(model, ctx) {
    const columns: CardColumn[] = [];
    let previous: string | undefined;
    for (const task of model.tasks) {
      if (previous !== task.section) {
        columns.push({ title: task.section || undefined, cards: [] });
        previous = task.section;
      }
      const mood = task.score > 3 ? ':)' : task.score < 3 ? ':(' : ':|';
      columns[columns.length - 1].cards.push([
        task.task,
        `${mood}  ${Number.isNaN(task.score) ? '?' : String(task.score)}`,
        ...task.people.filter(Boolean),
      ]);
    }
    return cardColumns(columns, ctx, true);
  },
};

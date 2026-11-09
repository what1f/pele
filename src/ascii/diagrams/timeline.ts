import type { TimelineModel } from '../../diagrams/timeline/db.js';
import type { AsciiDiagram } from '../core.js';
import { cardColumns, type CardColumn } from '../draw/cards.js';

export const timeline: AsciiDiagram<TimelineModel> = {
  type: 'timeline',
  render(model, ctx) {
    const columns: CardColumn[] = model.sections.map((title) => ({ title, cards: [] }));
    const leading: CardColumn = { cards: [] };
    for (const period of model.periods) {
      (columns[period.sectionIndex] ?? leading).cards.push([period.text, ...period.events]);
    }
    if (leading.cards.length > 0) columns.unshift(leading);
    return cardColumns(columns, ctx, true, model.direction === 'TD');
  },
};

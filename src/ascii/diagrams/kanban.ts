import type { KanbanModel } from '../../diagrams/kanban/db.js';
import type { AsciiDiagram } from '../core.js';
import { cardColumns } from '../draw/card-stack.js';

export const kanban: AsciiDiagram<KanbanModel> = {
  type: 'kanban',
  render(model, ctx) {
    return cardColumns(model.sections.map((section) => ({
      title: section.label,
      cards: section.items.map((item) => [
        item.label,
        ...(item.ticket ? [item.ticket] : []),
        ...(item.assigned ? [`@${item.assigned}`] : []),
        ...(item.priority ? [item.priority] : []),
      ]),
    })), ctx);
  },
};

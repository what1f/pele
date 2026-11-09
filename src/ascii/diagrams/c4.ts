import type { C4Model, C4Shape } from '../../diagrams/c4/types.js';
import { PeleError } from '../../errors.js';
import { label } from '../text/label.js';
import type { AsciiDiagram } from '../core.js';
import { cardText, drawCards, type Card, type CardLink } from '../draw/cards.js';

function form(shape: C4Shape): Card['form'] {
  const forms: Record<string, Card['form']> = { person: 'person', box: 'rect', rounded: 'rect', component: 'rect',
    cylinder: 'database', database: 'database', db: 'database', queue: 'queue', pipe: 'queue' };
  const explicit = forms[(shape.shape ?? '').toLowerCase()] ?? forms[(shape.sprite ?? '').toLowerCase()];
  if (explicit) return explicit;
  for (const tag of shape.tags?.split(',') ?? []) if (forms[tag.trim().toLowerCase()]) return forms[tag.trim().toLowerCase()];
  return shape.kind.endsWith('person') ? 'person' : shape.kind.endsWith('_db') ? 'database' : shape.kind.endsWith('_queue') ? 'queue' : 'rect';
}

export const c4: AsciiDiagram<C4Model> = {
  type: 'c4',
  render(model, ctx) {
    const text = (s: string | undefined) => cardText(s, ctx);
    const boundaries = model.boundaries.slice(1);
    const elements = [...boundaries, ...model.shapes];
    const index = new Map(elements.map((e, i) => [e, i]));
    const aliases = new Map(elements.map((e, i) => [e.alias, i]));
    const cards: Card[] = elements.map((e) => ({
      parent: e.parent ? index.get(e.parent) ?? -1 : -1,
      group: !('kind' in e),
      form: 'kind' in e ? form(e as C4Shape) : undefined,
      sections: 'kind' in e
        ? [text(`«${String(e.kind).replace(/_/g, ' ')}»`), text(e.label), text(e.techn ? `[${e.techn}]` : undefined), text(e.descr)]
        : [label(e.label), text(e.type ? `[${e.type}]` : undefined), text(e.descr)],
    }));
    const links: CardLink[] = model.rels.map((r, i) => {
      const src = r.fromAttr ? undefined : aliases.get(r.from);
      const dst = r.toAttr ? undefined : aliases.get(r.to);
      if (src === undefined || dst === undefined) throw new PeleError(`C4 rel "${r.from}" -> "${r.to}" references an unknown shape or boundary`, 'semantic', { type: 'c4' });
      return { src, dst, text: text([(model.c4Type === 'C4Dynamic' ? `${i + 1}: ` : '') + r.label, r.techn && `[${r.techn}]`, r.descr].filter(Boolean).join('<br>')),
        style: { head: r.type === 'rel_b' ? 'none' : 'arrow', tail: r.type === 'birel' || r.type === 'rel_b' ? 'arrow' : 'none' } };
    });
    return drawCards(cards, links, 'TB', ctx, true);
  },
};

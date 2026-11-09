import type { RequirementModel } from '../../diagrams/requirement/types.js';
import { direction } from '../../layout/compound.js';
import type { AsciiDiagram } from '../core.js';
import { cardText, drawCards, type Card, type CardLink } from '../draw/cards.js';

export const requirement: AsciiDiagram<RequirementModel> = {
  type: 'requirement',
  render(model, ctx) {
    const cards: Card[] = [];
    const index = new Map<string, number>();
    const text = (s: string | undefined) => cardText(s, ctx, true);
    for (const r of model.requirements.values()) {
      index.set(r.name, cards.length);
      cards.push({ sections: [text(`«${r.type}»`), text(r.name), text([
        r.requirementId && `ID: ${r.requirementId}`, r.text && `Text: ${r.text}`,
        r.risk && `Risk: ${r.risk}`, r.verifyMethod && `Verification: ${r.verifyMethod}`,
      ].filter(Boolean).join('<br>'))] });
    }
    for (const e of model.elements.values()) {
      index.set(e.name, cards.length);
      cards.push({ sections: [text('«Element»'), text(e.name), text([
        e.type && `Type: ${e.type}`, e.docRef && `Doc ref: ${e.docRef}`,
      ].filter(Boolean).join('<br>'))] });
    }
    const links: CardLink[] = [];
    for (const rel of model.relations) {
      const src = index.get(rel.src);
      const dst = index.get(rel.dst);
      if (src === undefined || dst === undefined) continue;
      const contains = rel.type === 'contains';
      links.push({ src, dst, text: text(rel.type), contains, style: { dashed: !contains, head: contains ? 'none' : 'open' } });
    }
    const dir = direction(model.direction);
    return drawCards(cards, links, ctx.compact && (dir === 'LR' || dir === 'RL') ? 'TB' : dir, ctx);
  },
};

import type { PieModel } from '../../diagrams/pie/model.js';
import type { AsciiDiagram } from '../core.js';
import { drawProportions } from '../draw/proportions.js';

export const pie: AsciiDiagram<PieModel> = {
  type: 'pie',
  render(model, ctx) {
    const entries = [...model.sections];
    // Scaling first keeps percentages finite even when the sum overflows.
    const scale = Math.max(0, ...entries.map(([, value]) => value));
    const total = entries.reduce((sum, [, value]) => sum + (scale > 0 ? value / scale : 0), 0);
    return drawProportions(entries.map(([name, value]) => ({
      name,
      value: scale > 0 ? value / scale : 0,
      detail: model.showData ? String(value) : undefined,
    })), total, ctx);
  },
};

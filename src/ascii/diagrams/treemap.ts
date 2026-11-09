import type { TreemapModel, TreemapNode } from '../../diagrams/treemap/model.js';
import { formatter } from '../../diagrams/treemap/format.js';
import type { Config } from '../../preprocess.js';
import type { AsciiDiagram } from '../core.js';
import { drawProportions, type ProportionRow } from '../draw/proportions.js';

export const treemap: AsciiDiagram<TreemapModel> = {
  type: 'treemap',
  render(model, ctx) {
    const config = (ctx.config.treemap ?? {}) as Config;
    const format = formatter(typeof config.valueFormat === 'string' ? config.valueFormat : ',');
    const values = new Map<TreemapNode, number>();
    const valueOf = (node: TreemapNode): number => {
      const value = node.children !== undefined
        ? node.children.reduce((sum, child) => sum + valueOf(child), 0)
        : Number.isFinite(node.value) && node.value! > 0 ? node.value! : 0;
      values.set(node, value);
      return value;
    };
    const total = model.roots.reduce((sum, node) => sum + valueOf(node), 0);
    const rows: ProportionRow[] = [];
    const visit = (nodes: TreemapNode[], depth: number, ancestors: boolean[]): void => {
      nodes.forEach((node, i) => {
        const last = i === nodes.length - 1;
        const value = values.get(node)!;
        rows.push({ name: node.name, value, depth, ancestors, last,
          detail: config.showValues === false ? undefined : format(value) });
        if (node.children) visit(node.children, depth + 1, [...ancestors, !last]);
      });
    };
    visit(model.roots, 0, []);
    return drawProportions(rows, total, ctx);
  },
};

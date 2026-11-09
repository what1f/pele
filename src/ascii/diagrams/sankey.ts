import type { SankeyModel } from '../../diagrams/sankey/db.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { label } from '../text/label.js';
import { displayWidth } from '../text/width.js';
import { wrappedLabel } from '../text/wrapped-label.js';

function render(model: SankeyModel, ctx: AsciiContext): Canvas {
  const canvas = new Canvas();
  const conf = ctx.config.sankey as Record<string, unknown> | undefined;
  const option = (key: string) => {
    const value = conf?.[key];
    return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? String(value) : '';
  };
  const number = (value: number) => label(`${option('prefix')}${value}${option('suffix')}`).lines.join(' ');
  const totals = new Map(model.nodes.map(node => [node, { incoming: 0, outgoing: 0 }]));
  for (const link of model.links) {
    totals.get(link.source)!.outgoing += link.value;
    totals.get(link.target)!.incoming += link.value;
  }
  const nodeValue = (node: SankeyModel['nodes'][number]) => {
    const total = totals.get(node)!;
    const value = Math.max(total.incoming, total.outgoing);
    return number(Math.abs(value) < 1e15 ? Math.round(value * 100) / 100 : value);
  };
  const barWidth = ctx.compact ? 10 : 18;
  const values = model.links.map(link => number(link.value));
  const valueWidth = Math.max(0, ...values.map(displayWidth));
  const room = Math.max(2, Math.min(ctx.compact ? 18 : 28,
    Math.floor((ctx.maxWidth - barWidth - valueWidth - 7) / 2)));
  const names = model.nodes.map(node => wrappedLabel(node.id, room));
  const nameWidth = Math.max(1, ...names.map(name => name.width),
    ...(conf?.showValues === false ? [] : model.nodes.map(node => displayWidth(nodeValue(node)))));
  const right = nameWidth + 3;
  const barX = right + nameWidth + 2;
  const max = Math.max(0, ...model.links.map(link => link.value));
  let y = 0;
  model.links.forEach((link, i) => {
    const source = names[model.nodes.indexOf(link.source)];
    const target = names[model.nodes.indexOf(link.target)];
    const height = Math.max(1, source.height, target.height);
    source.lines.forEach((line, k) => canvas.text(0, y + k, line));
    target.lines.forEach((line, k) => canvas.text(right, y + k, line));
    canvas.put(nameWidth + 1, y, '▶');
    // All links use the same scale; zero flows retain a number but no filled cell.
    const length = max > 0 && link.value > 0 ? Math.max(1, Math.round(link.value / max * barWidth)) : 0;
    canvas.text(barX, y, '█'.repeat(length), { role: 'accent' });
    canvas.text(barX + barWidth + 1, y, values[i]);
    if (conf?.showValues !== false) {
      canvas.text(0, y + height, nodeValue(link.source), { role: 'muted' });
      canvas.text(right, y + height, nodeValue(link.target), { role: 'muted' });
    }
    y += height + (conf?.showValues === false ? 1 : 2);
  });
  return canvas;
}

export const sankey: AsciiDiagram<SankeyModel> = { type: 'sankey', render };

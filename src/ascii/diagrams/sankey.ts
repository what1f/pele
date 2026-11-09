import type { SankeyModel, SankeyNode } from '../../diagrams/sankey/db.js';
import { Canvas } from '../canvas/canvas.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { label } from '../text/label.js';
import { displayWidth, wrap } from '../text/width.js';
import { wrappedLabel } from '../text/wrapped-label.js';

function render(model: SankeyModel, ctx: AsciiContext): Canvas {
  const canvas = new Canvas();
  const conf = ctx.config.sankey as Record<string, unknown> | undefined;
  const option = (key: string) => {
    const value = conf?.[key];
    return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? String(value) : '';
  };
  const format = (value: number) => label(`${option('prefix')}${value.toFixed(1)}${option('suffix')}`).lines.join(' ');
  const nodes = new Map(model.nodes.map(node => [node, { outgoing: 0, degree: 0, links: [] as SankeyModel['links'] }]));
  for (const link of model.links) {
    const source = nodes.get(link.source)!, target = nodes.get(link.target)!;
    source.outgoing += link.value;
    source.links.push(link);
    target.degree++;
  }
  const ordered: SankeyNode[] = model.nodes.filter(node => nodes.get(node)!.degree === 0);
  for (let i = 0; i < ordered.length; i++) {
    for (const link of nodes.get(ordered[i])!.links) {
      if (--nodes.get(link.target)!.degree === 0) ordered.push(link.target);
    }
  }
  // Cycles have no topological ordering; retain their source order without losing links.
  const seen = new Set(ordered);
  ordered.push(...model.nodes.filter(node => !seen.has(node)));
  const barWidth = ctx.compact ? 12 : 20;
  const totals = model.nodes.map(node => format(nodes.get(node)!.outgoing));
  const values = model.links.map(link => format(link.value));
  const valueWidth = Math.max(1, ...[...values, ...totals].map(displayWidth));
  const room = Math.max(2, Math.min(ctx.compact ? 28 : 42, ctx.maxWidth - barWidth - valueWidth - 9));
  const targets = new Map(model.nodes.map(node => [node, wrappedLabel(node.id, room)]));
  const singles = new Map(model.nodes.filter(node => nodes.get(node)!.links.length === 1).map(node => {
    const target = nodes.get(node)!.links[0].target;
    const sourceName = label(node.id).lines.join(' ');
    const targetName = label(target.id).lines.join(' ');
    const lines = wrap(`${sourceName} ─▶ ${targetName}`, room + 4);
    return [node, { lines, width: Math.max(0, ...lines.map(displayWidth)), height: lines.length }];
  }));
  const nameWidth = Math.max(1, ...[...targets.values()].map(text => text.width),
    ...[...singles.values()].map(text => text.width - 4));
  const barX = nameWidth + 6;
  const valueX = barX + barWidth + 1;
  const max = Math.max(0, ...model.links.map(link => link.value));
  const fractions = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
  const drawValue = (value: number, y: number) => {
    const units = max > 0 && value > 0 ? Math.max(1, Math.round(value / max * barWidth * 8)) : 0;
    canvas.text(barX, y, '█'.repeat(Math.floor(units / 8)) + fractions[units % 8], { role: 'accent' });
    canvas.textIn(valueX, y, valueWidth, format(value), 'right');
  };
  let y = 0;
  let previousSingle = true;
  let hasGroup = false;
  for (const node of ordered) {
    const group = nodes.get(node)!;
    if (!group.links.length) continue;
    const single = singles.get(node);
    if (hasGroup && (!single || !previousSingle)) y++;
    previousSingle = single !== undefined;
    hasGroup = true;
    if (single) {
      single.lines.forEach((line, k) => canvas.text(0, y + k, line));
      drawValue(group.links[0].value, y + Math.max(1, single.height) - 1);
      y += Math.max(1, single.height);
      continue;
    }
    const title = wrappedLabel(node.id, Math.max(2, valueX - 2));
    title.lines.forEach((line, k) => canvas.text(0, y + k, line, { role: 'title' }));
    canvas.textIn(valueX, y, valueWidth, format(group.outgoing), 'right');
    y += Math.max(1, title.height);
    group.links.forEach((link, i) => {
      const text = targets.get(link.target)!;
      const height = Math.max(1, text.height);
      const last = i === group.links.length - 1;
      canvas.segment(0, y - 1, 0, y);
      if (!last) canvas.segment(0, y, 0, y + height);
      canvas.segment(0, y, 2, y);
      canvas.put(2, y, '▶');
      text.lines.forEach((line, k) => canvas.text(4, y + k, line));
      drawValue(link.value, y);
      y += height;
    });
  }
  return canvas;
}

export const sankey: AsciiDiagram<SankeyModel> = { type: 'sankey', render };

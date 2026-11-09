import { direction } from '../../layout/compound.js';
import { buildClassGraph, type ClassGraph, type EndMarker } from '../../diagrams/class/graph.js';
import { parseGenericTypes } from '../../diagrams/common/generics.js';
import type { ClassModel } from '../../diagrams/class/types.js';
import { Canvas } from '../canvas/canvas.js';
import { AsciiError, type AsciiContext, type AsciiDiagram } from '../core.js';
import { drawEdgeLine, finishEdge, type EdgeStyle, type Marker } from '../draw/edges.js';
import { layoutGraph, type GraphNode, type Point } from '../layout/graph.js';
import { label, type TextBlock } from '../text/label.js';
import { displayWidth, wrap as wrapText } from '../text/width.js';

function marker(end: EndMarker): Marker {
  switch (end) {
    case 'aggregation': return 'diamondOpen';
    case 'composition': return 'diamond';
    case 'extension': return 'triangle';
    case 'dependency': return 'arrow';
    default: return 'none';
  }
}

// Escape type brackets before label() interprets HTML.
function literal(raw: string): string {
  return raw.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderClass(model: ClassModel, ctx: AsciiContext): Canvas {
  const config = (ctx.config.class ?? {}) as Record<string, unknown>;
  const graph = buildClassGraph(model, config.hierarchicalNamespaces !== false);
  // Pack disconnected components without changing their internal directions.
  const roots = graph.nodes.map((_, i) => i);
  const root = (i: number): number => roots[i] === i ? i : (roots[i] = root(roots[i]));
  const join = (a: number, b: number): void => { roots[root(a)] = root(b); };
  graph.nodes.forEach((n, i) => { if (n.parent >= 0) join(i, n.parent); });
  graph.edges.forEach((e) => { if (e.source >= 0 && e.target >= 0) join(e.source, e.target); });
  const components = new Map<number, number[]>();
  graph.nodes.forEach((_, i) => {
    const key = root(i);
    const ids = components.get(key) ?? [];
    ids.push(i);
    components.set(key, ids);
  });
  const canvas = new Canvas();
  let x = 0, y = 0, rowHeight = 0;
  for (const ids of components.values()) {
    const index = new Map(ids.map((id, i) => [id, i]));
    const part: ClassGraph = {
      nodes: ids.map((id) => ({ ...graph.nodes[id], parent: index.get(graph.nodes[id].parent) ?? -1 })),
      edges: graph.edges.filter((e) => index.has(e.source) && index.has(e.target)).map((e) => ({ ...e, source: index.get(e.source)!, target: index.get(e.target)! })),
    };
    const piece = drawClass(part, model.direction, ctx);
    const bounds = piece.bounds();
    if (!bounds) continue;
    if (x > 0 && x + bounds.w > ctx.maxWidth) { x = 0; y += rowHeight + 2; rowHeight = 0; }
    canvas.blit(piece, x - bounds.x, y - bounds.y);
    x += bounds.w + (ctx.compact ? 3 : 5);
    rowHeight = Math.max(rowHeight, bounds.h);
  }
  return canvas;
}

function drawClass(graph: ClassGraph, modelDirection: string, ctx: AsciiContext, spacing = 0): Canvas {
  const wrap = ctx.compact ? 18 : 32;
  const block = (raw: string | undefined, width: number, markdown = false): TextBlock => {
    const lines = label(raw, { maxWidth: width, markdown }).lines.flatMap((line) => wrapText(line, width));
    return { lines, width: Math.max(0, ...lines.map(displayWidth)), height: lines.length };
  };
  const text = (raw: string | undefined, plain = false): TextBlock => block(plain && raw ? literal(raw) : raw, wrap);
  const sections = graph.nodes.map((n): string[][] => {
    const cls = n.classNode;
    if (!cls) {
      const width = n.isGroup ? (ctx.compact ? 12 : 26) : wrap;
      const raw = n.isGroup && displayWidth(n.label) > width ? n.label.replace(/\./g, '.<br>') : n.label;
      return [block(raw, width, n.shape === 'note').lines];
    }
    const head = cls.annotations.flatMap((a) => text(`«${a.trim()}»`, true).lines);
    head.push(...text(cls.label + (cls.type ? literal(`<${parseGenericTypes(cls.type)}>`): '')).lines);
    // Keep static/abstract classifiers visible without terminal font styling.
    const members = (list: typeof cls.members): string[] => list.flatMap((m) => text(m.getDisplayDetails().displayText + m.classifier, true).lines);
    if (cls.members.length === 0 && cls.methods.length === 0) return [head];
    return [head, members(cls.members), members(cls.methods)];
  });
  const nodes: GraphNode[] = graph.nodes.map((n, i) => {
    const parts = sections[i];
    const w = Math.max(6, ...parts.flat().map((s) => displayWidth(s) + 4));
    const h = parts.reduce((sum, s) => sum + Math.max(1, s.length), 0) + parts.length + 1;
    const children = graph.nodes.some((other) => other.parent === i);
    return { w: n.isGroup && children ? 0 : w, h: n.isGroup && children ? 0 : n.shape === 'interface' ? Math.max(2, parts[0].length + 1) : h,
      parent: n.parent, isGroup: n.isGroup && children,
      padX: 2, padTop: Math.max(2, parts[0].length + 1), padBottom: 1, minW: n.isGroup ? w * 2 + 4 : w };
  });
  const edges = graph.edges.filter((e) => e.source >= 0 && e.target >= 0);
  const labels = edges.map((e) => block(e.label, wrap, true));
  const cards = edges.map((e) => [text(e.startLabelRight, true), text(e.endLabelLeft, true)]);
  const styles: EdgeStyle[] = edges.map((e) => ({ head: marker(e.arrowTypeEnd), tail: marker(e.arrowTypeStart), dashed: e.pattern !== 'solid' }));
  const dir = ctx.compact && ['LR', 'RL'].includes(modelDirection) ? 'TB' : direction(modelDirection);
  const sideways = dir === 'LR' || dir === 'RL';
  edges.forEach((e, i) => {
    if (e.source === e.target) nodes[e.source].extraRight = (nodes[e.source].extraRight ?? 0) + Math.max(labels[i].width, ...cards[i].map((c) => c.width)) + 6;
  });
  nodes.forEach((n, i) => {
    if (n.isGroup) return;
    const degree = edges.filter((e) => e.source !== e.target && (e.source === i || e.target === i)).length;
    const loopCount = edges.filter((e) => e.source === i && e.target === i).length;
    if (loopCount > 0) n.h = Math.max(n.h, loopCount * 2 + 3);
    if (sideways && graph.nodes[i].shape !== 'interface') n.h = Math.max(n.h, degree * 2 + 3);
    else n.w = Math.max(n.w, degree * 4 + 4);
  });
  const layout = layoutGraph(nodes, edges.map((e, i) => ({ src: e.source, dst: e.target,
    labelW: Math.max(labels[i].width, ...cards[i].map((c) => c.width)),
    labelH: labels[i].height + cards[i][0].height + cards[i][1].height + (labels[i].height > 0 || cards[i].some((c) => c.height > 0) ? 2 : 0) })), dir,
    { nodeSep: (ctx.compact ? 3 : 5) + spacing, rankSep: (sideways ? 8 : 3) + spacing, edgeSep: 3 });
  const canvas = new Canvas();
  const groups = nodes.map((_, i) => i).filter((i) => nodes[i].isGroup);
  const depth = (i: number): number => nodes[i].parent! < 0 ? 0 : 1 + depth(nodes[i].parent!);
  groups.sort((a, b) => depth(a) - depth(b));
  for (const i of groups) {
    const r = layout.nodes[i];
    canvas.box(r.x, r.y, r.w, r.h, { fill: false });
  }
  const loops = new Map<number, number>();
  layout.edges.forEach((e, i) => {
    if (e.loop) {
      const r = layout.nodes[edges[i].source];
      const nth = loops.get(edges[i].source) ?? 0;
      loops.set(edges[i].source, nth + 1);
      const out = r.x + r.w + 2 + nth * 3;
      const top = r.y + 1 + nth;
      const bottom = r.y + r.h - 2 - nth;
      e.points = [[r.x + r.w - 1, top], [out, top], [out, bottom], [r.x + r.w, bottom]];
      e.label = [out + 2, top + 1];
    }
    drawEdgeLine(canvas, e.points, styles[i]);
  });
  graph.nodes.forEach((n, i) => {
    const r = layout.nodes[i];
    if (nodes[i].isGroup) return;
    canvas.clear(r.x, r.y, r.w, r.h);
    if (n.shape === 'interface') return;
    canvas.box(r.x, r.y, r.w, r.h);
    let y = r.y + 1;
    sections[i].forEach((lines, section) => {
      if (section > 0) {
        canvas.segment(r.x, y, r.x + r.w - 1, y);
        y++;
      }
      for (const line of lines) canvas.textIn(r.x + 2, y++, r.w - 4, line, section > 0 ? 'left' : 'center');
      if (lines.length === 0) y++;
    });
  });
  layout.edges.forEach((e, i) => {
    finishEdge(canvas, e.points, styles[i]);
    // A lollipop stays hollow, unlike the filled circle marker used by flowcharts.
    const end = edges[i];
    if (end.arrowTypeStart === 'lollipop' && graph.nodes[end.source].shape !== 'interface') {
      const [a, b] = e.points;
      canvas.put(a[0] + Math.sign(b[0] - a[0]), a[1] + Math.sign(b[1] - a[1]), '○');
    }
    if (end.arrowTypeEnd === 'lollipop' && graph.nodes[end.target].shape !== 'interface') {
      const p = e.points[e.points.length - 1];
      canvas.put(p[0], p[1], '○');
    }
  });
  graph.nodes.forEach((n, i) => {
    if (n.shape !== 'interface') return;
    const k = edges.findIndex((e) => e.source === i || e.target === i);
    if (k < 0) return;
    const points = layout.edges[k].points;
    const source = edges[k].source === i;
    const p = source ? points[0] : points[points.length - 1];
    const next = source ? points[1] : points[points.length - 2];
    const at: Point = source ? p : [p[0] + Math.sign(p[0] - next[0]), p[1] + Math.sign(p[1] - next[1])];
    const r = layout.nodes[i];
    canvas.put(at[0], at[1], '○');
    const top = at[1] === r.y ? r.y + 1 : r.y;
    sections[i][0].forEach((line, j) => canvas.textIn(r.x + 2, top + j, r.w - 4, line));
  });
  // Reserve labels against all borders, markers and other labels, including namespace titles.
  const free = (x: number, y: number, block: TextBlock, inline: boolean, points: Point[]): boolean => {
    for (let dy = 0; dy < block.height; dy++) for (let dx = -1; dx <= block.width; dx++) {
      const xx = x + dx, yy = y + dy;
      if (layout.nodes.some((r, k) => !nodes[k].isGroup && xx >= r.x && xx < r.x + r.w && yy >= r.y && yy < r.y + r.h)) return false;
      if (!canvas.occupied(xx, yy)) continue;
      if (canvas.charAt(xx, yy) !== undefined) return false;
      const own = points.some((p, j) => j > 0 && ((p[0] === points[j - 1][0] && xx === p[0] && yy >= Math.min(p[1], points[j - 1][1]) && yy <= Math.max(p[1], points[j - 1][1])) || (p[1] === points[j - 1][1] && yy === p[1] && xx >= Math.min(p[0], points[j - 1][0]) && xx <= Math.max(p[0], points[j - 1][0]))));
      if (!inline || !own) return false;
      // Crossing another line must remain visible.
      if (canvas.armsAt(xx, yy) === 15) return false;
      if (layout.nodes.some((r) => xx >= r.x && xx < r.x + r.w && yy >= r.y && yy < r.y + r.h)) return false;
    }
    return true;
  };
  const write = (p: Point, block: TextBlock): void => {
    canvas.clear(p[0] - 1, p[1], block.width + 2, block.height);
    block.lines.forEach((line, j) => canvas.textIn(p[0], p[1] + j, block.width, line, 'center', { role: 'label' }));
  };
  for (const i of groups) {
    const r = layout.nodes[i];
    const lines = sections[i][0];
    const w = Math.max(0, ...lines.map(displayWidth)) + 2;
    let at = r.x + 2;
    for (let x = r.x + 2; x + w < r.x + r.w - 1; x++) {
      if (lines.every((_, j) => Array.from({ length: w }, (_, k) => canvas.armsAt(x + k, r.y + j)).every((a) => j === 0 ? a === 12 : a === 0))) { at = x; break; }
    }
    lines.forEach((line, j) => canvas.text(at, r.y + j, ` ${line} `));
  }
  let missing = false;
  layout.edges.forEach((e, i) => {
    const place = (block: TextBlock, near: Point, inline: boolean): void => {
      if (!block.height) return;
      const candidates: Point[] = [];
      for (let j = 1; j < e.points.length; j++) {
        const a = e.points[j - 1], b = e.points[j];
        if (a[0] === b[0]) {
          for (let y = Math.min(a[1], b[1]) + 2; y + block.height <= Math.max(a[1], b[1]) - 1; y++) {
            if (inline) candidates.push([a[0] - (block.width >> 1), y]);
            candidates.push([a[0] + 2, y], [a[0] - block.width - 1, y]);
          }
        } else {
          for (let x = Math.min(a[0], b[0]) + 2; x + block.width < Math.max(a[0], b[0]); x++) {
            if (inline) candidates.push([x, a[1] - (block.height >> 1)]);
            candidates.push([x, a[1] - block.height], [x, a[1] + 1]);
          }
        }
      }
      candidates.sort((a, b) => (a[0] + block.width / 2 - near[0]) ** 2 + (a[1] - near[1]) ** 2 * 4 - ((b[0] + block.width / 2 - near[0]) ** 2 + (b[1] - near[1]) ** 2 * 4));
      const at = candidates.find(([x, y]) => free(x, y, block, inline, e.points));
      if (at) write(at, block);
      else missing = true;
    };
    place(cards[i][0], e.points[0], false);
    place(cards[i][1], e.points[e.points.length - 1], false);
    if (e.loop && labels[i].height > 0 && e.label && free(e.label[0], e.label[1], labels[i], false, e.points)) write(e.label, labels[i]);
    else place(labels[i], e.label ?? e.points[Math.floor(e.points.length / 2)], true);
  });
  if (missing && spacing < 20) return drawClass(graph, modelDirection, ctx, spacing + 2);
  if (missing) throw new AsciiError('This diagram is too crowded to render.', 'unsupported', 'class');
  return canvas;
}

export const classDiagram: AsciiDiagram<ClassModel> = { type: 'class', render: renderClass };

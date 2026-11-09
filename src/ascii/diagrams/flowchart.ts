// 流程图（flowchart / graph）。也是节点-连线类图的参考实现：
// 量尺寸 → layoutGraph 排版 → 按「分组框 → 连线 → 节点 → 线头箭头 → 连线标签 → 自环」的顺序画。

import { direction, type Dir } from '../../layout/compound.js';
import { buildFlowGraph } from '../../diagrams/flowchart/graph.js';
import { canonicalShape } from '../../diagrams/flowchart/shapes.js';
import type { FlowDb } from '../../diagrams/flowchart/db.js';
import { Canvas, type Rect } from '../canvas/canvas.js';
import { Arm } from '../canvas/glyphs.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { drawEdgeLine, finishEdge, placeLabel, type EdgeStyle, type Marker } from '../draw/edges.js';
import { drawShape, shapeKind, shapeSize, type ShapeKind } from '../draw/shapes.js';
import { layoutGraph, type GraphEdge, type GraphNode, type Point } from '../layout/graph.js';
import { label, type TextBlock } from '../text/label.js';
import { displayWidth, truncate } from '../text/width.js';

// 节点文字超过这么多列就折行（Mermaid 默认 200px，约 25 个半角字符）。
const WRAP = 24;
const WRAP_COMPACT = 14;
const EDGE_WRAP = 16;
// 自环在节点右侧占的列数（不含标签）。
const LOOP = 3;

function marker(type: string | undefined): Marker {
  switch (type) {
    case 'arrow_point':
      return 'arrow';
    case 'arrow_circle':
      return 'circle';
    case 'arrow_cross':
      return 'cross';
    default:
      return 'none';
  }
}

export function renderFlowchart(db: FlowDb, ctx: AsciiContext, dirOverride?: Dir): Canvas {
  const graph = buildFlowGraph(db);
  const dir = dirOverride ?? direction(db.direction);
  // 紧凑模式下横向的图改成竖向，通常能省一大半宽度。
  const flow: Dir = ctx.compact && (dir === 'LR' || dir === 'RL') ? 'TB' : dir;
  const wrap = ctx.compact ? WRAP_COMPACT : WRAP;

  const index = new Map<string, number>();
  graph.nodes.forEach((n, i) => index.set(n.id, i));

  const texts: TextBlock[] = [];
  const kinds: ShapeKind[] = [];
  const titles: string[] = [];
  const gnodes: GraphNode[] = graph.nodes.map((n, i) => {
    const markdown = n.labelType === 'markdown';
    if (n.isGroup) {
      const title = truncate(label(n.label, { markdown }).lines.join(' '), Math.max(8, Math.min(40, ctx.maxWidth - 6)));
      titles[i] = title;
      texts[i] = label(undefined);
      kinds[i] = 'rect';
      const tw = displayWidth(title);
      return {
        w: 0,
        h: 0,
        isGroup: true,
        dir: n.dir ? direction(n.dir) : undefined,
        padX: 2,
        padTop: 2,
        padBottom: 1,
        minW: tw > 0 ? tw + 6 : 4,
      };
    }
    const kind = shapeKind(canonicalShape(n.shape));
    const text = label(n.label, { maxWidth: wrap, markdown });
    texts[i] = text;
    kinds[i] = kind;
    titles[i] = '';
    return shapeSize(kind, text);
  });
  graph.nodes.forEach((n, i) => {
    gnodes[i].parent = n.parentId !== undefined ? (index.get(n.parentId) ?? -1) : -1;
  });

  interface Drawn {
    src: number;
    dst: number;
    text: TextBlock;
    style: EdgeStyle;
  }
  const drawn: Drawn[] = [];
  const gedges: GraphEdge[] = [];
  for (const e of graph.edges) {
    const src = index.get(e.start);
    const dst = index.get(e.end);
    if (src === undefined || dst === undefined) continue;
    const text = label(e.label, { maxWidth: EDGE_WRAP, markdown: e.labelType === 'markdown' });
    const invisible = e.thickness === 'invisible';
    const style: EdgeStyle = {
      stroke: e.thickness === 'thick' ? 'heavy' : 'light',
      dashed: e.pattern === 'dotted',
      head: marker(e.arrowTypeEnd),
      tail: marker(e.arrowTypeStart),
    };
    if (src === dst) {
      gnodes[src].extraRight = (gnodes[src].extraRight ?? 0) + LOOP + (text.width > 0 ? text.width + 1 : 0);
    }
    drawn.push({ src, dst, text: invisible ? label(undefined) : text, style: invisible ? { ...style, head: 'none' } : style });
    gedges.push({ src, dst, minlen: e.minlen, labelW: invisible ? 0 : text.width, labelH: invisible ? 0 : text.height });
    if (invisible) drawn[drawn.length - 1].src = -1;
  }

  const sideways = flow === 'LR' || flow === 'RL';
  // 横向排时节点只有一行字，同一侧有几条线就把框加高几行，免得线头挤在同一格。
  if (sideways) {
    const ins = new Array<number>(gnodes.length).fill(0);
    const outs = new Array<number>(gnodes.length).fill(0);
    for (const e of gedges) {
      if (e.src === e.dst) continue;
      outs[e.src]++;
      ins[e.dst]++;
    }
    gnodes.forEach((n, i) => {
      if (n.isGroup || kinds[i] === 'dot' || kinds[i] === 'bullseye' || kinds[i] === 'bar') return;
      const inset = kinds[i] === 'cylinder' ? 1 : 0;
      n.h = Math.max(n.h, Math.min(Math.max(ins[i], outs[i]), 5) + 2 + inset);
    });
  }
  gnodes.forEach((n, i) => {
    if (kinds[i] === 'cylinder') n.insetTop = 1;
  });
  const layout = layoutGraph(gnodes, gedges, flow, ctx.compact ? { nodeSep: sideways ? 1 : 2, rankSep: sideways ? 4 : 2 } : {});
  const canvas = new Canvas();

  // 分组框：外层先画，标题嵌在上边框里。
  const depth = (i: number): number => {
    let d = 0;
    for (let p = gnodes[i].parent ?? -1; p >= 0 && d < 1000; p = gnodes[p].parent ?? -1) d++;
    return d;
  };
  const groups = gnodes.map((_, i) => i).filter((i) => gnodes[i].isGroup);
  groups.sort((a, b) => depth(a) - depth(b));
  for (const i of groups) {
    const r = layout.nodes[i];
    canvas.box(r.x, r.y, r.w, r.h, { round: true, role: 'muted', fill: false });
  }

  // 连线。
  drawn.forEach((d, k) => {
    if (d.src < 0) return;
    const e = layout.edges[k];
    if (!e.loop) drawEdgeLine(canvas, e.points, d.style);
  });

  // 节点。
  gnodes.forEach((n, i) => {
    if (n.isGroup) return;
    drawShape(canvas, layout.nodes[i], kinds[i], texts[i]);
  });

  // 分组标题嵌在上边框里，避开从上边框穿过的连线。
  for (const i of groups) {
    if (!titles[i]) continue;
    const r = layout.nodes[i];
    const text = ` ${titles[i]} `;
    const tw = displayWidth(text);
    const crossed = (x: number): boolean => (canvas.armsAt(x, r.y) & Arm.Up) !== 0;
    let at = r.x + 2;
    for (let x = r.x + 2; x + tw <= r.x + r.w - 2; x++) {
      let free = true;
      for (let k = x - 1; k <= x + tw && free; k++) if (crossed(k)) free = false;
      if (free) {
        at = x;
        break;
      }
    }
    canvas.text(at, r.y, text, { role: 'title' });
  }

  // 线头、箭头。
  drawn.forEach((d, k) => {
    if (d.src < 0) return;
    const e = layout.edges[k];
    if (!e.loop) finishEdge(canvas, e.points, d.style);
  });

  // 连线标签：盖在线上，左右各留一格空白。
  drawn.forEach((d, k) => {
    const e = layout.edges[k];
    if (d.src < 0 || e.loop || !e.label || d.text.height === 0) return;
    const [lx, ly] = placeLabel(e.points, [e.label[0] + (d.text.width >> 1), e.label[1] + (d.text.height >> 1)], d.text.width, d.text.height);
    canvas.clear(lx - 1, ly, d.text.width + 2, d.text.height);
    d.text.lines.forEach((line, j) => canvas.textIn(lx, ly + j, d.text.width, line, 'center', { role: 'label' }));
  });

  // 自环：从节点上边框伸出，绕到右侧，再指回节点右边框。
  const loopsAt = new Map<number, number>();
  drawn.forEach((d, k) => {
    if (d.src < 0 || !layout.edges[k].loop) return;
    const nth = loopsAt.get(d.src) ?? 0;
    loopsAt.set(d.src, nth + 1);
    drawLoop(canvas, layout.nodes[d.src], nth, d.text, d.style);
  });

  return canvas;
}

function drawLoop(canvas: Canvas, r: Rect, nth: number, text: TextBlock, style: EdgeStyle): void {
  const x1 = r.x + r.w - 1;
  const out = x1 + 2 + nth * 2;
  const top = r.y - 1 - nth;
  const back = r.y + Math.min(r.h - 2, 1);
  const pts: Point[] = [
    [Math.max(r.x + 1, x1 - 1 - nth), r.y],
    [Math.max(r.x + 1, x1 - 1 - nth), top],
    [out, top],
    [out, back],
    [x1 + 1, back],
  ];
  drawEdgeLine(canvas, pts, style);
  finishEdge(canvas, pts, style);
  if (text.height > 0) text.lines.forEach((line, j) => canvas.text(out + 1, back - 1 + j, line, { role: 'label' }));
}

export const flowchart: AsciiDiagram<FlowDb> = { type: 'flowchart', render: (db, ctx) => renderFlowchart(db, ctx) };

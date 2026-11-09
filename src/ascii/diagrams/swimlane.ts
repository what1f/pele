import { buildFlowGraph } from '../../diagrams/flowchart/graph.js';
import type { FlowDb } from '../../diagrams/flowchart/db.js';
import { cnode, direction, type CEdge } from '../../layout/compound.js';
import { laneLayout } from '../../layout/lanes.js';
import type { AsciiDiagram } from '../core.js';
import { drawAgentLanes, type LanePlacer } from '../draw/agent-lanes.js';

const place: LanePlacer = (nodes, edges, dir) => {
  const sideways = dir === 'LR' || dir === 'RL';
  const cnodes = nodes.map((n, i) => {
    const c = cnode(n.w * 8, n.h * 10, n.parent ?? -1);
    c.seq = i;
    c.isGroup = n.isGroup ?? false;
    c.padX = 32; c.padTop = Math.max(34, (n.padTop ?? 3) * 10 + 20); c.padBottom = 30;
    c.minW = (n.minW ?? 0) * 8;
    return c;
  });
  const cedges: CEdge[] = edges.map(e => ({ src: e.src, dst: e.dst, minlen: e.minlen ?? 1,
    labelW: ((e.labelW ?? 0) + 2) * 8, labelH: (e.labelH ?? 0) * 10, route: [], labelX: 0, labelY: 0 }));
  laneLayout(cnodes, cedges, dir, { nodeSep: 40, rankSep: sideways ? 64 : 40, edgeSep: 16, portSep: 16, tracks: true, headRoom: 0 }, 32);
  const laneRoots = nodes.map((n, i) => n.isGroup && (n.parent ?? -1) < 0 ? i : -1).filter(i => i >= 0).reverse();
  const slot = (i: number): number => {
    let root = i;
    while ((nodes[root].parent ?? -1) >= 0) root = nodes[root].parent!;
    return Math.max(0, laneRoots.indexOf(root));
  };
  const rects = cnodes.map((c, i) => {
    const w = c.isGroup ? Math.round(c.w / 8) : nodes[i].w;
    const h = c.isGroup ? Math.round(c.h / 10) : nodes[i].h;
    return { x: Math.round(c.x / 8) - Math.floor(w / 2) + (sideways ? 0 : slot(i) * 3), y: Math.round(c.y / 10) - Math.floor(h / 2) + (sideways ? slot(i) * 3 : 0), w, h };
  });
  // Lane headers share one band; trim the SVG layout's extra leading header space.
  const items = rects.filter((_, i) => !laneRoots.includes(i));
  if (items.length && laneRoots.length) {
    if (sideways) {
      const left = Math.min(...items.map(r => r.x)) - 3;
      for (const i of laneRoots) {
        const r = rects[i], delta = Math.max(0, left - r.x);
        r.x += delta; r.w -= delta;
      }
    } else {
      const head = Math.max(...laneRoots.map(i => nodes[i].padTop ?? 3));
      const top = Math.min(...items.map(r => r.y)) - head;
      for (const i of laneRoots) {
        const r = rects[i], delta = Math.max(0, top - r.y);
        r.y += delta; r.h -= delta;
      }
    }
  }
  return rects;
};

export const swimlane: AsciiDiagram<FlowDb> = {
  type: 'swimlane',
  render(db, ctx) {
    const graph = buildFlowGraph(db);
    if (graph.nodes.some(n => !n.isGroup && n.parentId === undefined)) {
      const id = '__ascii_swimlane_default__';
      graph.nodes.forEach(n => { if (!n.isGroup && n.parentId === undefined) n.parentId = id; });
      graph.nodes.push({ id, label: undefined, labelType: 'text', shape: 'rect', isGroup: true, parentId: undefined,
        cssStyles: [], cssCompiledStyles: [], cssClasses: '', dir: undefined });
    }
    const dir = direction(db.direction ?? 'LR');
    return drawAgentLanes(graph.nodes.map(n => ({ ...n, dir: undefined })), graph.edges, ctx,
      ctx.compact && (dir === 'LR' || dir === 'RL') ? 'TB' : dir, false, place);
  },
};

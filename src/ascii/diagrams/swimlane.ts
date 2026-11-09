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
  const descendants = (root: number): number[] => nodes.map((_, i) => {
    let p = i;
    while (p >= 0 && p !== root) p = nodes[p].parent ?? -1;
    return p === root && i !== root ? i : -1;
  }).filter(i => i >= 0);
  const nested = nodes.map((n, i) => n.isGroup && !laneRoots.includes(i) ? i : -1).filter(i => i >= 0);
  const depth = (i: number): number => (nodes[i].parent ?? -1) < 0 ? 0 : depth(nodes[i].parent!) + 1;
  nested.sort((a, b) => depth(b) - depth(a));
  for (const i of nested) {
    const children = rects.filter((_, j) => nodes[j].parent === i);
    if (!children.length) continue;
    const x = Math.min(...children.map(r => r.x)) - 3;
    const y = Math.min(...children.map(r => r.y)) - (nodes[i].padTop ?? 2);
    Object.assign(rects[i], { x, y, w: Math.max(nodes[i].minW ?? 0, Math.max(...children.map(r => r.x + r.w)) + 3 - x), h: Math.max(...children.map(r => r.y + r.h)) + 2 - y });
  }
  const content = rects.filter((_, i) => !laneRoots.includes(i));
  if (!content.length) return rects;
  const start = Math.min(...content.map(r => sideways ? r.x : r.y));
  const end = Math.max(...content.map(r => sideways ? r.x + r.w : r.y + r.h));
  let cross = 0;
  for (const i of laneRoots) {
    const members = descendants(i);
    const children = members.filter(j => nodes[j].parent === i).map(j => rects[j]);
    const min = children.length ? Math.min(...children.map(r => sideways ? r.y : r.x)) : 0;
    const max = children.length ? Math.max(...children.map(r => sideways ? r.y + r.h : r.x + r.w)) : 1;
    const pad = sideways ? (nodes[i].padTop ?? 2) : 3;
    const channel = sideways ? Math.max(0, ...edges.filter(e => members.includes(e.src) && !members.includes(e.dst) && (e.labelH ?? 0) > 0).map(e => (e.labelH ?? 0) + 1)) : 0;
    const breadth = Math.max(max - min + pad + (sideways ? 2 + channel : 3), sideways ? 4 : (nodes[i].minW ?? 4));
    const shift = cross + pad - min;
    for (const j of members) {
      if (sideways) rects[j].y += shift;
      else rects[j].x += shift;
    }
    Object.assign(rects[i], sideways
      ? { x: start - 3, y: cross, w: Math.max(end - start + 6, nodes[i].minW ?? 0), h: breadth }
      : { x: cross, y: start - (nodes[i].padTop ?? 2), w: breadth, h: end - start + (nodes[i].padTop ?? 2) + 2 });
    cross += breadth + (sideways ? 1 : 2);
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

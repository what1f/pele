// 节点-连线类图的通用排版：复用 pele 的 compoundLayout（分层排版 + 直角走线），结果换算成格子坐标。
//
// 用法：调用方按格子给出每个节点的宽高（含边框）、连线和标签尺寸，拿回每个节点的矩形和每条线的折线。
// 流程图、状态图、类图、ER 图、需求图、用例图等都走这里。

import { cnode, compoundLayout, inheritCrossedDirections, type CEdge, type CNode, type Dir } from '../../layout/compound.js';
import type { LayeredOptions } from '../../layout/layered.js';
import type { Rect } from '../canvas/canvas.js';
import { CX } from '../text/label.js';

export type { Dir };

export interface GraphNode {
  // 宽高，单位格，含边框。分组节点填 0，由排版算出。
  w: number;
  h: number;
  // 所在分组的下标，-1 表示顶层。
  parent?: number;
  isGroup?: boolean;
  // 分组内部的排版方向，不填沿用外层。
  dir?: Dir;
  // 分组的内边距（格）：左右、上（含标题）、下。
  padX?: number;
  padTop?: number;
  padBottom?: number;
  // 分组的最小宽度（格），一般是标题宽度加边框。
  minW?: number;
  // 右侧额外留出的列数（画自环用）。返回的矩形不含这部分。
  extraRight?: number;
  // 左右两侧的接口避开顶部这么多行（圆柱的盖子）。
  insetTop?: number;
}

export interface GraphEdge {
  src: number;
  dst: number;
  // 跨越的最少层数，默认 1。Mermaid 里 `--->` 这类加长连线用。
  minlen?: number;
  // 标签尺寸（格），没有标签填 0。
  labelW?: number;
  labelH?: number;
}

export interface GraphOptions {
  // 同层节点之间、相邻两层之间、平行连线之间的最小间距（格）。
  nodeSep?: number;
  rankSep?: number;
  edgeSep?: number;
}

export type Point = [x: number, y: number];

export interface LaidEdge {
  // 折线各点（格），相邻两点横平或竖直。第一个点在起点框的边上，最后一个点在终点框外紧挨边框的一格（放箭头）。
  points: Point[];
  // 标签左上角（格）；没有标签为 undefined。
  label: Point | undefined;
  // 自环（src === dst）：排版不处理，由调用方自己画。points 为空。
  loop: boolean;
}

export interface GraphLayout {
  nodes: Rect[];
  edges: LaidEdge[];
}

// 一格按多少像素交给 pele 排。竖直方向故意取得比 CY 小：pele 的轨道间距是按像素写死的，
// 行高取太大会让相邻的横向轨道挤进同一行。
const PX = CX;
const PY = 10;

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], dir: Dir, options: GraphOptions = {}): GraphLayout {
  const sideways = dir === 'LR' || dir === 'RL';
  const cnodes: CNode[] = nodes.map((n) => {
    const c = cnode((n.w + (n.extraRight ?? 0)) * PX, n.h * PY, n.parent ?? -1);
    if (n.isGroup) {
      c.isGroup = true;
      c.dir = n.dir;
      c.padX = (n.padX ?? 2) * PX;
      c.padTop = (n.padTop ?? 2) * PY;
      c.padBottom = (n.padBottom ?? 1) * PY;
      c.minW = (n.minW ?? 0) * PX;
      c.span = Infinity;
    } else {
      // 连线可以分散在节点的整条边上（留出两端的框角）。
      c.span = sideways ? Math.max(0, (n.h - 2) * PY) : Math.max(0, (n.w - 2) * PX);
    }
    return c;
  });
  cnodes.forEach((c, i) => (c.seq = i));
  inheritCrossedDirections(cnodes, edges.map((e) => [e.src, e.dst] as const));

  const cedges: CEdge[] = [];
  const index: number[] = [];
  edges.forEach((e, i) => {
    if (e.src === e.dst) return;
    index[i] = cedges.length;
    cedges.push({
      src: e.src,
      dst: e.dst,
      minlen: e.minlen ?? 1,
      labelW: (e.labelW ?? 0) > 0 ? (e.labelW! + 2) * PX : 0,
      labelH: (e.labelH ?? 0) > 0 ? e.labelH! * PY + 4 : 0,
      route: [],
      labelX: 0,
      labelY: 0,
    });
  });

  const opt: LayeredOptions = {
    nodeSep: (options.nodeSep ?? (sideways ? 1 : 4)) * (sideways ? PY : PX),
    edgeSep: (options.edgeSep ?? 2) * PX,
    rankSep: (options.rankSep ?? (sideways ? 6 : 2)) * (sideways ? PX : PY),
    portSep: sideways ? PY : 2 * PX,
    tracks: true,
    headRoom: 0,
  };
  compoundLayout(cnodes, cedges, dir, opt);

  // 像素 → 格。节点按中心点取整，保证同一行/列上的节点对齐。
  const col = (x: number) => Math.round(x / PX);
  const row = (y: number) => Math.round(y / PY);
  const rects: Rect[] = cnodes.map((c, i) => {
    const w = nodes[i].isGroup ? Math.max(4, Math.round(c.w / PX)) : nodes[i].w;
    const h = nodes[i].isGroup ? Math.max(3, Math.round(c.h / PY)) : nodes[i].h;
    const full = w + (nodes[i].isGroup ? 0 : (nodes[i].extraRight ?? 0));
    return { x: col(c.x) - (full >> 1), y: row(c.y) - (h >> 1), w, h };
  });

  // 分组框按成员实际占的格子重新算：像素取整后，pele 算的分组尺寸会和成员差一两格。
  const depthOf = (i: number): number => {
    let d = 0;
    for (let p = nodes[i].parent ?? -1; p >= 0 && d < 1000; p = nodes[p].parent ?? -1) d++;
    return d;
  };
  const groupIds = nodes.map((_, i) => i).filter((i) => nodes[i].isGroup);
  groupIds.sort((a, b) => depthOf(b) - depthOf(a));
  for (const g of groupIds) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    nodes.forEach((n, i) => {
      if ((n.parent ?? -1) !== g) return;
      const r = rects[i];
      const extra = n.isGroup ? 0 : (n.extraRight ?? 0);
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w + extra);
      y1 = Math.max(y1, r.y + r.h);
    });
    if (x0 === Infinity) continue;
    const n = nodes[g];
    const padX = n.padX ?? 2;
    const r: Rect = { x: x0 - padX - 1, y: y0 - (n.padTop ?? 2), w: x1 - x0 + 2 * padX + 2, h: 0 };
    r.h = y1 + (n.padBottom ?? 1) + 1 - r.y;
    const minW = n.minW ?? 0;
    if (r.w < minW) {
      r.x -= (minW - r.w) >> 1;
      r.w = minW;
    }
    // 和 pele 算的分组框取并集：连线是绕着 pele 的分组框走的，框只能大不能小，否则线会压在边框上。
    const p = rects[g];
    const ux = Math.min(r.x, p.x);
    const uy = Math.min(r.y, p.y);
    rects[g] = {
      x: ux,
      y: uy,
      w: Math.max(r.x + r.w, p.x + p.w) - ux,
      h: Math.max(r.y + r.h, p.y + p.h) - uy,
    };
  }

  const ports = (i: number): Rect => {
    const inset = nodes[i].insetTop ?? 0;
    const r = rects[i];
    return inset > 0 && r.h - inset >= 3 ? { x: r.x, y: r.y + inset, w: r.w, h: r.h - inset } : r;
  };
  const laid: LaidEdge[] = edges.map((e, i) => {
    if (e.src === e.dst) return { points: [], label: undefined, loop: true };
    const ce = cedges[index[i]];
    const pts: Point[] = [];
    for (let k = 0; k < ce.route.length; k += 3) pts.push([col(ce.route[k]), row(ce.route[k + 1])]);
    const points = attach(orthogonal(dedupe(pts)), rects[e.src], rects[e.dst], ports(e.src), ports(e.dst));
    const lw = e.labelW ?? 0;
    const lh = e.labelH ?? 0;
    const label: Point | undefined = lw > 0 ? [col(ce.labelX) - (lw >> 1), row(ce.labelY) - (lh >> 1)] : undefined;
    return { points, label, loop: false };
  });

  // 连线顺着分组边框走（压在同一行/列上）时，把分组框往外扩一格，让线走在框里面。
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const g of groupIds) {
      const r = rects[g];
      for (const e of laid) {
        for (let k = 0; k + 1 < e.points.length; k++) {
          const [ax, ay] = e.points[k];
          const [bx, by] = e.points[k + 1];
          if (ay === by) {
            const lo = Math.max(Math.min(ax, bx), r.x + 1);
            const hi = Math.min(Math.max(ax, bx), r.x + r.w - 2);
            if (hi - lo < 1) continue;
            if (ay === r.y) {
              r.y--;
              r.h++;
              moved = true;
            } else if (ay === r.y + r.h - 1) {
              r.h++;
              moved = true;
            }
          } else {
            const lo = Math.max(Math.min(ay, by), r.y + 1);
            const hi = Math.min(Math.max(ay, by), r.y + r.h - 2);
            if (hi - lo < 1) continue;
            if (ax === r.x) {
              r.x--;
              r.w++;
              moved = true;
            } else if (ax === r.x + r.w - 1) {
              r.w++;
              moved = true;
            }
          }
        }
      }
    }
    if (!moved) break;
  }

  // 整体平移到从 (0, 0) 开始。
  let minX = Infinity;
  let minY = Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
  }
  for (const e of laid) {
    for (const [x, y] of e.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
    }
    if (e.label) {
      minX = Math.min(minX, e.label[0]);
      minY = Math.min(minY, e.label[1]);
    }
  }
  if (minX === Infinity) return { nodes: rects, edges: laid };
  for (const r of rects) {
    r.x -= minX;
    r.y -= minY;
  }
  for (const e of laid) {
    for (const p of e.points) {
      p[0] -= minX;
      p[1] -= minY;
    }
    if (e.label) {
      e.label[0] -= minX;
      e.label[1] -= minY;
    }
  }
  return { nodes: rects, edges: laid };
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

// 取整后可能出现斜线段，补一个拐点让它横平竖直；顺便去掉共线的中间点。
function orthogonal(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last[0] !== p[0] && last[1] !== p[1]) out.push([p[0], last[1]]);
    out.push([p[0], p[1]]);
  }
  const clean: Point[] = [];
  for (const p of out) {
    const n = clean.length;
    if (n >= 1 && clean[n - 1][0] === p[0] && clean[n - 1][1] === p[1]) continue;
    if (n >= 2) {
      const a = clean[n - 2];
      const b = clean[n - 1];
      if ((a[0] === b[0] && b[0] === p[0]) || (a[1] === b[1] && b[1] === p[1])) clean[n - 1] = p;
      else clean.push(p);
    } else clean.push(p);
  }
  return clean;
}

function inside(p: Point, r: Rect): boolean {
  return p[0] >= r.x && p[0] < r.x + r.w && p[1] >= r.y && p[1] < r.y + r.h;
}

// 把线头吸附到框上：起点落在起点框的边上，终点落在终点框外紧挨边框的一格。
// 先去掉落在框内部的多余点，再按最后一段的方向决定从哪条边进出。
// fromPorts/toPorts：左右两侧允许接线的行范围（一般就是框本身）。
function attach(points: Point[], from: Rect, to: Rect, fromPorts: Rect = from, toPorts: Rect = to): Point[] {
  if (points.length < 2) return points;
  let pts = points.map((p) => [p[0], p[1]] as Point);
  while (pts.length > 2 && inside(pts[1], from)) pts.shift();
  while (pts.length > 2 && inside(pts[pts.length - 2], to)) pts.pop();

  // vertical：这一端是竖直进出（落在框的上下边），否则水平进出（落在左右边）。
  const snap = (end: Point, next: Point, r: Rect, outside: boolean, vertical: boolean, side: Rect = r): void => {
    const off = outside ? 1 : 0;
    if (vertical) {
      const x = Math.min(r.x + r.w - 2, Math.max(r.x + 1, end[0]));
      const down = next[1] > r.y + (r.h >> 1);
      end[0] = x;
      end[1] = down ? r.y + r.h - 1 + off : r.y - off;
      next[0] = x;
    } else {
      const y = Math.min(side.y + side.h - 2, Math.max(side.y + 1, end[1]));
      const right = next[0] > r.x + (r.w >> 1);
      end[1] = y;
      end[0] = right ? r.x + r.w - 1 + off : r.x - off;
      next[1] = y;
    }
  };
  if (pts.length === 2) {
    // 只有两点：两端可能吸附到不同的行列，中间补两个拐点。
    const [a, b] = pts;
    const vertical = a[0] === b[0];
    snap(a, [b[0], b[1]], from, false, vertical, fromPorts);
    snap(b, [a[0], a[1]], to, true, vertical, toPorts);
    if (a[0] === b[0] || a[1] === b[1]) return [a, b];
    if (vertical) {
      const m = (a[1] + b[1]) >> 1;
      return [a, [a[0], m], [b[0], m], b];
    }
    const m = (a[0] + b[0]) >> 1;
    return [a, [m, a[1]], [m, b[1]], b];
  }
  const n = pts.length;
  const firstVertical = pts[0][0] === pts[1][0];
  const lastVertical = pts[n - 1][0] === pts[n - 2][0];
  snap(pts[0], pts[1], from, false, firstVertical, fromPorts);
  snap(pts[n - 1], pts[n - 2], to, true, lastVertical, toPorts);
  return orthogonal(pts);
}

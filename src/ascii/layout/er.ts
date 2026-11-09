import type { Rect } from '../canvas/canvas.js';
import type { TextBlock } from '../text/label.js';
import type { Point } from './graph.js';

export interface ErRouteNode extends Rect {
  group: boolean;
  titleWidth: number;
}

export interface ErRouteEdge {
  src: number;
  dst: number;
  text: TextBlock;
}

export interface ErRoute {
  points: Point[];
  label?: Point;
}

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function segment(a: Point, b: Point): Rect {
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]) + 1, h: Math.abs(a[1] - b[1]) + 1 };
}

function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const b = out[out.length - 1];
    if (b && b[0] === p[0] && b[1] === p[1]) continue;
    const a = out[out.length - 2];
    if (a && b && ((a[0] === b[0] && b[0] === p[0]) || (a[1] === b[1] && b[1] === p[1]))) out.pop();
    out.push(p);
  }
  return out;
}

function marker(p: Point, q: Point): Rect {
  const dx = Math.sign(q[0] - p[0]);
  const dy = Math.sign(q[1] - p[1]);
  return { x: Math.min(p[0] + dx, p[0] + dx * 2) - Math.abs(dy), y: Math.min(p[1] + dy, p[1] + dy * 2) - Math.abs(dx), w: dx ? 2 : 3, h: dy ? 2 : 3 };
}

interface Port {
  point: Point;
  dx: number;
  dy: number;
}

function ports(r: ErRouteNode, peer: ErRouteNode): Port[] {
  const out: Port[] = [];
  for (const vertical of [true, false]) {
    const lo = vertical ? r.x + 2 : r.y + 1;
    const hi = vertical ? r.x + r.w - 3 : r.y + r.h - 2;
    const center = (lo + hi) / 2;
    const other = vertical ? peer.x + (peer.w - 1) / 2 : peer.y + (peer.h - 1) / 2;
    const common = (Math.max(lo, vertical ? peer.x + 2 : peer.y + 1) + Math.min(hi, vertical ? peer.x + peer.w - 3 : peer.y + peer.h - 2)) / 2;
    const values = new Set<number>();
    for (const base of [center, other, common]) {
      const reach = Math.ceil((hi - lo) / 4) * 4;
      for (let offset = -reach; offset <= reach; offset += 4) {
        const v = Math.round(base + offset);
        if (v >= lo && v <= hi) values.add(v);
      }
    }
    const sorted = [...values].sort((a, b) => Math.abs(a - common) - Math.abs(b - common) || a - b).slice(0, Math.max(18, Math.ceil((hi - lo) / 4) + 1));
    for (const v of sorted) {
      if (vertical) {
        if (!r.group || v > r.x + r.titleWidth + 4) out.push({ point: [v, r.y], dx: 0, dy: -1 });
        out.push({ point: [v, r.y + r.h - 1], dx: 0, dy: 1 });
      } else {
        out.push({ point: [r.x, v], dx: -1, dy: 0 }, { point: [r.x + r.w - 1, v], dx: 1, dy: 0 });
      }
    }
  }
  return out;
}

// Route against the visible boxes. Containers may be crossed, but never followed.
export function routeEr(nodes: ErRouteNode[], edges: ErRouteEdge[]): ErRoute[] | undefined {
  const routes: ErRoute[] = [];
  const ink: Rect[] = [];
  const markers: Rect[] = [];
  const labels: Rect[] = [];
  const titles = nodes.filter((n) => n.group).map((n) => ({ x: n.x + 2, y: n.y, w: n.titleWidth + 2, h: 1 }));
  const borders = nodes.filter((n) => n.group).flatMap((r) => [
    { x: r.x, y: r.y, w: r.w, h: 1 }, { x: r.x, y: r.y + r.h - 1, w: r.w, h: 1 },
    { x: r.x, y: r.y, w: 1, h: r.h }, { x: r.x + r.w - 1, y: r.y, w: 1, h: r.h },
  ]);
  const boxes = nodes.filter((n) => !n.group);
  const blocked = (s: Rect, start: Point, end: Point): boolean => {
    if (titles.some((r) => overlap(s, r)) || labels.some((r) => overlap(s, r)) || markers.some((r) => overlap(s, r))) return true;
    for (const r of boxes) {
      if (!overlap(s, r)) continue;
      const x0 = Math.max(s.x, r.x);
      const x1 = Math.min(s.x + s.w - 1, r.x + r.w - 1);
      const y0 = Math.max(s.y, r.y);
      const y1 = Math.min(s.y + s.h - 1, r.y + r.h - 1);
      if (x0 !== x1 || y0 !== y1 || ![start, end].some((p) => p[0] === x0 && p[1] === y0)) return true;
    }
    const horizontal = s.h === 1;
    for (const r of borders) {
      if (horizontal && r.h === 1 && s.y === r.y && Math.min(s.x + s.w, r.x + r.w) - Math.max(s.x, r.x) > 1) return true;
      if (!horizontal && r.w === 1 && s.x === r.x && Math.min(s.y + s.h, r.y + r.h) - Math.max(s.y, r.y) > 1) return true;
    }
    for (const r of ink) {
      if (horizontal !== (r.h === 1)) continue;
      if (horizontal && Math.abs(s.y - r.y) < 2 && Math.min(s.x + s.w, r.x + r.w) - Math.max(s.x, r.x) > 1) return true;
      if (!horizontal && Math.abs(s.x - r.x) < 2 && Math.min(s.y + s.h, r.y + r.h) - Math.max(s.y, r.y) > 1) return true;
    }
    return false;
  };
  const labelAt = (pts: Point[], ownMarkers: Rect[], t: TextBlock): Point | undefined => {
    if (!t.height) return undefined;
    const candidates: { point: Point; score: number; host: number }[] = [];
    pts.slice(1).forEach((b, j) => {
      const a = pts[j];
      const vertical = a[0] === b[0];
      const lo = Math.min(a[vertical ? 1 : 0], b[vertical ? 1 : 0]);
      const hi = Math.max(a[vertical ? 1 : 0], b[vertical ? 1 : 0]);
      for (let v = lo + 2; v <= hi - 2; v++) {
        const x = vertical ? a[0] : v;
        const y = vertical ? v : a[1];
        const score = Math.abs(v - (lo + hi) / 2);
        candidates.push({ point: [x - (t.width >> 1), y - (t.height >> 1)], score, host: j });
        if (vertical) {
          candidates.push({ point: [x + 2, y - (t.height >> 1)], score: score + 3, host: j });
          candidates.push({ point: [x - t.width - 1, y - (t.height >> 1)], score: score + 3, host: j });
        } else candidates.push({ point: [x - (t.width >> 1), y - t.height], score: score + 1, host: j });
      }
    });
    candidates.sort((a, b) => a.score - b.score);
    const own = pts.slice(1).map((b, j) => segment(pts[j], b));
    for (const { point: [x, y], host } of candidates) {
      const area = { x: x - 1, y, w: t.width + 2, h: t.height };
      if (own.some((r, j) => j !== host && overlap(area, r))) continue;
      if ([...boxes, ...borders, ...labels, ...ink, ...markers, ...ownMarkers].some((r) => overlap(area, r))) continue;
      return [x, y];
    }
    return undefined;
  };
  for (const edge of edges) {
    const from = nodes[edge.src];
    const to = nodes[edge.dst];
    const container = edge.src === edge.dst ? nodes.filter((r) => r.group && r !== from && from.x > r.x && from.x + from.w < r.x + r.w && from.y > r.y && from.y + from.h < r.y + r.h).sort((a, b) => a.w * a.h - b.w * b.h)[0] : undefined;
    const starts = ports(from, to);
    const ends = ports(to, from);
    let best: { points: Point[]; label?: Point; score: number; marks: Rect[] } | undefined;
    const consider = (raw: Point[], p: Port, q: Port): void => {
      const pts = simplify(raw);
      if (pts.length < 2) return;
      if (container && pts.some(([x, y]) => x <= container.x || x >= container.x + container.w - 1 || y <= container.y || y >= container.y + container.h - 1)) return;
      const first = pts[1];
      const last = pts[pts.length - 2];
      if (Math.sign(first[0] - p.point[0]) !== p.dx || Math.sign(first[1] - p.point[1]) !== p.dy) return;
      if (Math.sign(last[0] - q.point[0]) !== q.dx || Math.sign(last[1] - q.point[1]) !== q.dy) return;
      if (Math.abs(first[0] - p.point[0]) + Math.abs(first[1] - p.point[1]) < 4 || Math.abs(last[0] - q.point[0]) + Math.abs(last[1] - q.point[1]) < 4) return;
      const segs = pts.slice(1).map((b, j) => segment(pts[j], b));
      const length = segs.reduce((sum, s) => sum + s.w + s.h - 2, 0);
      const score = length + (pts.length - 2) * 24;
      if (best && score >= best.score) return;
      if (segs.some((s) => blocked(s, p.point, q.point))) return;
      const marks = [marker(p.point, first), marker(q.point, last)];
      if (marks.some((s) => [...boxes, ...titles, ...ink, ...markers, ...labels].some((r) => overlap(s, r)))) return;
      const caption = labelAt(pts, marks, edge.text);
      if (edge.text.height && !caption) return;
      best = { points: pts, label: caption, score, marks };
    };
    for (const p of starts) for (const q of ends) {
      if (edge.src === edge.dst && p.dx === q.dx && p.dy === q.dy && Math.abs(p.point[0] - q.point[0]) + Math.abs(p.point[1] - q.point[1]) < 4) continue;
      const a = p.point;
      const b = q.point;
      if (a[0] === b[0] || a[1] === b[1]) consider([a, b], p, q);
      consider([a, [a[0], b[1]], b], p, q);
      consider([a, [b[0], a[1]], b], p, q);
      if (p.dy && q.dy) {
        const tracks = new Set([Math.round((a[1] + b[1]) / 2), a[1] + p.dy * 4, b[1] + q.dy * 4]);
        for (const n of nodes) { tracks.add(n.y - 4); tracks.add(n.y + n.h + 3); }
        for (const r of ink) if (r.h === 1) { tracks.add(r.y - 2); tracks.add(r.y + 2); }
        for (const y of tracks) consider([a, [a[0], y], [b[0], y], b], p, q);
      } else if (p.dx && q.dx) {
        const tracks = new Set([Math.round((a[0] + b[0]) / 2), a[0] + p.dx * 4, b[0] + q.dx * 4]);
        for (const n of nodes) { tracks.add(n.x - 4); tracks.add(n.x + n.w + 3); }
        for (const r of ink) if (r.w === 1) { tracks.add(r.x - 2); tracks.add(r.x + 2); }
        for (const x of tracks) consider([a, [x, a[1]], [x, b[1]], b], p, q);
      }
    }
    if (!best) {
      for (const p of starts) for (const q of ends) {
        const a: Point = [p.point[0] + p.dx * 4, p.point[1] + p.dy * 4];
        const b: Point = [q.point[0] + q.dx * 4, q.point[1] + q.dy * 4];
        consider([p.point, a, [a[0], b[1]], b, q.point], p, q);
        consider([p.point, a, [b[0], a[1]], b, q.point], p, q);
      }
    }
    if (!best) return undefined;
    const chosen: { points: Point[]; label?: Point; score: number; marks: Rect[] } = best;
    routes.push({ points: chosen.points, label: chosen.label });
    ink.push(...chosen.points.slice(1).map((b, j) => segment(chosen.points[j], b)));
    markers.push(...chosen.marks);
    if (chosen.label) labels.push({ x: chosen.label[0] - 1, y: chosen.label[1], w: edge.text.width + 2, h: edge.text.height });
  }
  return routes;
}

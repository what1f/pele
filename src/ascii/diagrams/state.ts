import type { StateDb } from '../../diagrams/state/db.js';
import { direction, type Dir } from '../../layout/compound.js';
import { Canvas, type Rect } from '../canvas/canvas.js';
import { Arm } from '../canvas/glyphs.js';
import type { AsciiContext, AsciiDiagram } from '../core.js';
import { drawEdgeLine, finishEdge } from '../draw/edges.js';
import { drawShape, type ShapeKind } from '../draw/shapes.js';
import { layoutGraph, type GraphNode, type GraphEdge, type Point } from '../layout/graph.js';
import { label, type TextBlock } from '../text/label.js';
import { displayWidth, wrap, truncate } from '../text/width.js';

const STEPS: Point[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
interface Port {
  p: Point;
  border: Point;
  dir: number;
}
interface Caption {
  rect: Rect;
  text: TextBlock;
  gates?: Point[];
}

// Each route owns its tracks. Existing lines may only be crossed at right angles.
function route(
  canvas: Canvas,
  solids: Rect[],
  captions: Caption[],
  starts: Port[],
  ends: Port[],
  bounds: Rect,
  active?: Caption,
): Point[] {
  const key = (x: number, y: number, d: number): number => ((y - bounds.y) * bounds.w + x - bounds.x) * 4 + d;
  const size = bounds.w * bounds.h * 4;
  const cost = new Int32Array(size).fill(0x7fffffff);
  const prev = new Int32Array(size).fill(-1);
  const roots = new Map<number, Port>();
  const buckets: number[][] = [];
  const inside = (x: number, y: number, r: Rect): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  const free = (x: number, y: number): boolean =>
    inside(x, y, bounds) &&
    !solids.some((r) => inside(x, y, r)) &&
    !captions.some(
      (cap) => inside(x, y, cap.rect) || (cap !== active && cap.gates?.some((p) => p[0] === x && p[1] === y)),
    ) &&
    canvas.charAt(x, y) === undefined;
  const can = (x: number, y: number, d: number): boolean => {
    if (!free(x, y)) return false;
    const arms = canvas.armsAt(x, y);
    return (arms & (d % 2 ? Arm.Left | Arm.Right : Arm.Up | Arm.Down)) === 0;
  };
  const preferredStart = starts[starts.length - 1];
  const preferredEnd = ends[ends.length - 1];
  for (const s of starts) {
    if (!can(s.p[0], s.p[1], s.dir)) continue;
    const k = key(...s.p, s.dir);
    const initial =
      Math.abs(s.border[0] - preferredStart.border[0]) +
      Math.abs(s.border[1] - preferredStart.border[1]) +
      (s.dir === preferredStart.dir ? 0 : 3);
    cost[k] = initial;
    roots.set(k, s);
    (buckets[initial] ??= []).push(k);
  }
  const goals = new Map<number, Port>();
  for (const e of ends) if (can(...e.p, e.dir)) goals.set(key(...e.p, e.dir), e);
  let bestCost = Infinity,
    bestKey = -1;
  let bestGoal: Port | undefined;
  for (let n = 0; n < buckets.length && n <= bestCost; n++) {
    const bucket = buckets[n];
    if (!bucket) continue;
    while (bucket.length) {
      const k = bucket.pop()!;
      if (cost[k] !== n) continue;
      const d = k % 4;
      const cell = (k - d) / 4;
      const x = (cell % bounds.w) + bounds.x,
        y = Math.floor(cell / bounds.w) + bounds.y;
      const goal = goals.get(k);
      if (goal) {
        const total =
          n +
          Math.abs(goal.border[0] - preferredEnd.border[0]) +
          Math.abs(goal.border[1] - preferredEnd.border[1]) +
          (goal.dir === preferredEnd.dir ? 0 : 3);
        if (total < bestCost) {
          bestCost = total;
          bestKey = k;
          bestGoal = goal;
        }
      }
      for (const nd of [d, (d + 1) % 4, (d + 3) % 4]) {
        // Candidate ports are alternatives, not occupied tracks.
        if (nd !== d && canvas.armsAt(x, y)) continue;
        const [dx, dy] = STEPS[nd];
        const nx = x + dx,
          ny = y + dy;
        if (!can(nx, ny, nd)) continue;
        const nk = key(nx, ny, nd),
          nc = n + 1 + (nd === d ? 0 : 4);
        if (nc >= cost[nk]) continue;
        cost[nk] = nc;
        prev[nk] = k;
        (buckets[nc] ??= []).push(nk);
      }
    }
  }
  if (!bestGoal) return [];
  const points: Point[] = [];
  let at = bestKey;
  while (at >= 0) {
    const d = at % 4,
      cell = (at - d) / 4;
    points.push([(cell % bounds.w) + bounds.x, Math.floor(cell / bounds.w) + bounds.y]);
    if (prev[at] < 0) break;
    at = prev[at];
  }
  points.push(roots.get(at)!.border);
  points.reverse();
  points.push(bestGoal.border);
  // A caption gate can coincide with a port; duplicate cells have no heading.
  return points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
}

function ports(r: Rect, incoming: boolean): Port[] {
  const out: Port[] = [];
  const add = (x: number, y: number, d: number): void => {
    const [dx, dy] = STEPS[d];
    out.push({ border: [x, y], p: [x + dx, y + dy], dir: incoming ? (d + 2) % 4 : d });
  };
  const xs = Array.from({ length: r.w > 2 ? r.w - 2 : r.w }, (_, i) => r.x + i + (r.w > 2 ? 1 : 0));
  const ys = Array.from({ length: r.h > 2 ? r.h - 2 : r.h }, (_, i) => r.y + i + (r.h > 2 ? 1 : 0));
  xs.sort((a, b) => Math.abs(a - r.x - r.w / 2) - Math.abs(b - r.x - r.w / 2));
  ys.sort((a, b) => Math.abs(a - r.y - r.h / 2) - Math.abs(b - r.y - r.h / 2));
  for (const x of xs) {
    add(x, r.y, 0);
    add(x, r.y + r.h - 1, 2);
  }
  for (const y of ys) {
    add(r.x + r.w - 1, y, 1);
    add(r.x, y, 3);
  }
  return out;
}

export function renderState(db: StateDb, ctx: AsciiContext): Canvas {
  const graph = db.graph;
  const nodes = graph.nodes.filter((n) => n.shape !== 'noteGroup');
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const flow = (raw: string | undefined): Dir => {
    const d = direction(raw);
    return ctx.compact && (d === 'LR' || d === 'RL') ? 'TB' : d;
  };
  const text = (raw: string | undefined, maxWidth = ctx.compact ? 14 : 24): TextBlock => {
    const b = label(raw, { markdown: true });
    const lines = b.lines.flatMap((line) => {
      const width = displayWidth(line);
      const columns =
        /[\u3400-\u9fff]/u.test(line) && width > maxWidth
          ? Math.min(maxWidth, Math.ceil(width / Math.ceil(width / maxWidth) / 2) * 2)
          : maxWidth;
      return wrap(line, columns);
    });
    return { lines, height: lines.length, width: Math.max(0, ...lines.map(displayWidth)) };
  };
  const titles = nodes.map((n) => {
    if (!n.isGroup) return text(n.label);
    const title =
      n.shape === 'divider'
        ? ''
        : truncate(label(n.label, { markdown: true }).lines.join(' '), Math.max(2, ctx.maxWidth - 12));
    return { lines: title ? [title] : [], height: title ? 1 : 0, width: displayWidth(title) };
  });
  const descriptions = nodes.map((n) => n.description.map((s) => text(s)));
  const kinds: ShapeKind[] = nodes.map((n) =>
    n.shape === 'stateStart'
      ? 'dot'
      : n.shape === 'stateEnd'
        ? 'bullseye'
        : n.shape === 'choice'
          ? 'diamond'
          : n.shape === 'fork' || n.shape === 'join'
            ? 'bar'
            : 'rounded',
  );
  const gn: GraphNode[] = nodes.map((n, i) => {
    if (n.isGroup)
      return {
        w: 0,
        h: 0,
        isGroup: true,
        dir: flow(n.dir),
        padX: n.shape === 'divider' ? 1 : 2,
        padTop: n.shape === 'divider' ? 1 : Math.max(2, titles[i].height + 1),
        padBottom: 1,
        minW: titles[i].width + 6,
      };
    const kind = kinds[i],
      b = titles[i],
      desc = descriptions[i];
    if (kind === 'dot' || kind === 'bullseye' || kind === 'diamond') return { w: 1, h: 1 };
    if (kind === 'bar') return { w: 9, h: 1 };
    return {
      w: Math.max(5, b.width + 4, ...desc.map((d) => d.width + 4)),
      h: Math.max(1, b.height) + 2 + (desc.length ? 1 + desc.reduce((s, d) => s + Math.max(1, d.height), 0) : 0),
    };
  });
  nodes.forEach((n, i) => {
    const p = n.parentId === undefined ? undefined : index.get(n.parentId);
    gn[i].parent = p !== undefined && p !== i && nodes[p].isGroup ? p : -1;
  });
  for (let i = 0; i < nodes.length; i++) {
    const seen = new Set<number>([i]);
    for (let p = gn[i].parent ?? -1; p >= 0; p = gn[p].parent ?? -1) {
      if (seen.has(p)) {
        gn[i].parent = -1;
        break;
      }
      seen.add(p);
    }
  }
  kinds.forEach((kind, i) => {
    if (kind !== 'bar') return;
    const parent = gn[i].parent ?? -1;
    const dir = flow(parent < 0 ? db.direction : nodes[parent].dir);
    if (dir === 'LR' || dir === 'RL') {
      gn[i].w = 1;
      gn[i].h = 7;
    }
  });
  // Keep a note and its owner together without turning the note into a transition.
  const noteOwners = new Map<number, number>();
  nodes.forEach((n, i) => {
    const owner = n.noteFor ? index.get(n.noteFor) : undefined;
    if (owner !== undefined) {
      noteOwners.set(i, owner);
      gn[i].parent = gn[owner].parent;
    }
  });
  const edges = graph.edges.filter((e) => e.pattern !== 'dashed' && index.has(e.start) && index.has(e.end));
  const labels = edges.map((e) => text(e.label, ctx.compact ? 12 : 16));
  const ge: GraphEdge[] = edges.map((e, k) => ({
    src: index.get(e.start)!,
    dst: index.get(e.end)!,
    labelW: labels[k].width,
    labelH: labels[k].height,
  }));
  const loops = new Map<number, number>();
  ge.forEach((e, k) => {
    if (e.src !== e.dst) return;
    const nth = loops.get(e.src) ?? 0;
    loops.set(e.src, nth + 1);
    gn[e.src].extraRight = Math.max(gn[e.src].extraRight ?? 0, labels[k].width + 14 + nth * 2);
    if (!gn[e.src].isGroup && nth > 0) gn[e.src].h = Math.max(gn[e.src].h, nth * 2 + 7);
  });
  // Invisible constraints stack concurrent regions in compact mode.
  const ordering: GraphEdge[] = [];
  if (ctx.compact)
    nodes.forEach((n, i) => {
      if (n.shape !== 'divider') return;
      const next = nodes.findIndex((m, j) => j > i && m.shape === 'divider' && gn[j].parent === gn[i].parent);
      if (next >= 0) ordering.push({ src: i, dst: next });
    });
  // Notes are measured as part of their owner's footprint, then placed beside its actual box.
  const noteOffsets = new Map<number, number>();
  for (const [i, owner] of noteOwners) {
    const left = nodes[i].position === 'left of';
    const room = gn[i].w + 4;
    if (left) noteOffsets.set(owner, (noteOffsets.get(owner) ?? 0) + room);
    gn[owner].extraRight = (gn[owner].extraRight ?? 0) + room;
    if (!gn[owner].isGroup) gn[owner].h = Math.max(gn[owner].h, gn[i].h);
  }
  for (const [owner] of loops) {
    const parent = gn[owner].parent ?? -1;
    if (parent >= 0) {
      const room =
        ge.reduce((sum, e, k) => sum + (e.src === owner && e.dst === owner ? labels[k].height + 2 : 0), 0) + 1;
      gn[parent].padTop = Math.max(gn[parent].padTop ?? 2, room);
    }
  }
  const layoutNodes = gn.map((n, i) => (noteOwners.has(i) ? { ...n, w: 0, h: 0, parent: -1 } : n));
  const laid = layoutGraph(layoutNodes, [...ge, ...ordering], flow(db.direction), {
    rankSep: 3,
    nodeSep: ctx.compact ? 3 : 5,
  });
  const rects = laid.nodes;
  // Compound bounds can consume the gap allocated to an outside transition.
  for (let pass = 0; pass < 3; pass++)
    ge.forEach((e, k) => {
      if (e.src === e.dst) return;
      const a = rects[e.src],
        b = rects[e.dst];
      const upper = a.y + a.h <= b.y ? a : b.y + b.h <= a.y ? b : undefined;
      if (!upper) return;
      const lower = upper === a ? b : a;
      const gap = lower.y - upper.y - upper.h;
      const needed = Math.max(3, labels[k].height + 4);
      if (gap >= needed) return;
      const cut = lower.y,
        delta = needed - gap;
      rects.forEach((r, i) => {
        if (r.y >= cut) r.y += delta;
        else if (nodes[i].isGroup && r.y + r.h > cut) r.h += delta;
      });
      laid.edges.forEach((edge) => {
        if (edge.label && edge.label[1] >= cut) edge.label[1] += delta;
      });
    });
  // Concurrent regions share a starting row even when their contents have different heights.
  if (!ctx.compact) {
    const parents = new Set(nodes.flatMap((n, i) => n.shape === 'divider' ? [gn[i].parent ?? -1] : []));
    for (const parent of parents) {
      const regions = nodes.flatMap((n, i) => n.shape === 'divider' && gn[i].parent === parent ? [i] : []);
      const anchors = regions.map(region => Math.min(...nodes.flatMap((_, i) => gn[i].parent === region ? [rects[i].y] : [])));
      const top = Math.min(...anchors);
      regions.forEach((region, k) => {
        if (!Number.isFinite(anchors[k])) return;
        const delta = top - anchors[k];
        nodes.forEach((_, i) => {
          for (let p = i; p >= 0; p = gn[p].parent ?? -1) {
            if (p !== region) continue;
            rects[i].y += delta;
            break;
          }
        });
      });
    }
  }
  const loopEdges = new Map<number, number[]>();
  ge.forEach((e, k) => {
    if (e.src !== e.dst) return;
    const ks = loopEdges.get(e.src) ?? [];
    ks.push(k);
    loopEdges.set(e.src, ks);
  });
  for (const [owner, offset] of noteOffsets) rects[owner].x += offset;
  for (const [i, owner] of noteOwners) {
    const r = rects[owner];
    rects[i] = {
      x: nodes[i].position === 'left of' ? r.x - gn[i].w - 4 : r.x + r.w + 4,
      y: r.y,
      w: gn[i].w,
      h: gn[i].h,
    };
  }
  const c = new Canvas();
  const solids = rects.filter((_, i) => !nodes[i].isGroup);
  const depth = (i: number): number => {
    let d = 0;
    for (let p = gn[i].parent ?? -1; p >= 0; p = gn[p].parent ?? -1) d++;
    return d;
  };
  const groups = nodes
    .map((_, i) => i)
    .filter((i) => nodes[i].isGroup)
    .sort((a, b) => depth(a) - depth(b));
  const captions: Caption[] = [];
  const write = (b: TextBlock, r: Rect, y: number): void =>
    b.lines.forEach((line, j) => c.textIn(r.x + 1, y + j, r.w - 2, line));
  for (const i of groups) {
    const r = rects[i];
    if (nodes[i].shape === 'divider') continue;
    c.box(r.x, r.y, r.w, r.h, { round: true, fill: false });
    const b = titles[i];
    if (b.height) {
      c.text(r.x + 2, r.y, ` ${b.lines[0]} `);
      captions.push({ rect: { x: r.x + 1, y: r.y, w: Math.max(b.width + 4, r.w - 2), h: b.height }, text: b });
    }
  }
  nodes.forEach((n, i) => {
    if (n.shape !== 'divider') return;
    const j = nodes.findIndex((m, j) => j > i && m.shape === 'divider' && gn[j].parent === gn[i].parent);
    if (j < 0) return;
    const a = rects[i],
      b = rects[j];
    const p = gn[i].parent ?? -1;
    const outer = p < 0 ? undefined : rects[p];
    if (ctx.compact) {
      const y = Math.floor((a.y + a.h + b.y) / 2);
      c.segment(
        outer ? outer.x : Math.min(a.x, b.x),
        y,
        outer ? outer.x + outer.w - 1 : Math.max(a.x + a.w, b.x + b.w),
        y,
        { dashed: true },
      );
    } else {
      const x = Math.floor((a.x + a.w + b.x) / 2);
      c.segment(
        x,
        outer ? outer.y + titles[p].height + 1 : Math.min(a.y, b.y),
        x,
        outer ? outer.y + outer.h - 1 : Math.max(a.y + a.h, b.y + b.h),
        { dashed: true },
      );
    }
  });
  nodes.forEach((n, i) => {
    if (n.isGroup) return;
    const r = rects[i],
      b = titles[i],
      kind = kinds[i];
    if (kind === 'diamond') c.put(r.x, r.y, '◇');
    else if (kind === 'bar' && r.w === 1) c.segment(r.x, r.y, r.x, r.y + r.h - 1, { stroke: 'heavy' });
    else if (kind === 'bar' || kind === 'dot' || kind === 'bullseye') drawShape(c, r, kind, text(undefined));
    else {
      c.box(r.x, r.y, r.w, r.h, { round: n.shape !== 'note' });
      const contentHeight =
        Math.max(1, b.height) +
        (descriptions[i].length ? 1 + descriptions[i].reduce((sum, d) => sum + Math.max(1, d.height), 0) : 0);
      const top = r.y + 1 + Math.floor((r.h - 2 - contentHeight) / 2);
      write(b, r, top);
      if (descriptions[i].length) {
        let y = top + Math.max(1, b.height);
        c.segment(r.x, y, r.x + r.w - 1, y);
        for (const d of descriptions[i]) {
          y++;
          write(d, r, y);
          y += Math.max(1, d.height) - 1;
        }
      }
    }
  });
  // A dashed tether carries note association; the note itself remains a solid box.
  for (const [i, owner] of noteOwners) {
    const a = rects[owner],
      b = rects[i],
      left = b.x < a.x;
    const y = a.y + Math.floor(Math.min(a.h, b.h) / 2);
    const pts: Point[] = left
      ? [
          [a.x, y],
          [b.x + b.w, y],
        ]
      : [
          [a.x + a.w - 1, y],
          [b.x - 1, y],
        ];
    drawEdgeLine(c, pts, { dashed: true });
    finishEdge(c, pts, { dashed: true, head: 'none' });
  }
  // Outer loops leave farther left, rise higher and return lower than inner loops.
  const loopCaptions: Caption[] = [];
  for (const [owner, ks] of loopEdges) {
    const r = rects[owner];
    const innerRight = r.x + r.w + 3 + Math.max(0, ...ks.map((k) => labels[k].width));
    let top = r.y - 2;
    ks.forEach((k, nth) => {
      const b = labels[k];
      const x = r.x + r.w - 2 - nth;
      const right = innerRight + nth * 2;
      const back = r.y + 1 + nth * 2;
      const pts: Point[] = [
        [x, r.y],
        [x, top],
        [right, top],
        [right, back],
        [r.x + r.w, back],
      ];
      drawEdgeLine(c, pts);
      finishEdge(c, pts);
      if (b.height) {
        const cap: Caption = { rect: { x: r.x + r.w + 1, y: top - b.height, w: b.width + 2, h: b.height }, text: b };
        loopCaptions.push(cap);
        captions.push(cap);
      }
      top -= b.height + 2;
    });
  }
  for (const cap of loopCaptions) {
    c.clear(cap.rect.x, cap.rect.y, cap.rect.w, cap.rect.h);
    cap.text.lines.forEach((line, j) => c.textIn(cap.rect.x + 1, cap.rect.y + j, cap.rect.w - 2, line));
  }
  const bounds = c.bounds() ?? { x: 0, y: 0, w: 1, h: 1 };
  const board: Rect = { x: bounds.x - 6, y: bounds.y - 6, w: bounds.w + 20, h: bounds.h + 20 };
  const occupied = (r: Rect): boolean => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (c.occupied(x, y)) return true;
    return captions.some(({ rect: q }) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
  };
  const edgeCaptions: (Caption | undefined)[] = labels.map((b, k) => {
    if (!b.height || ge[k].src === ge[k].dst) return undefined;
    const e = ge[k],
      r = rects[e.src];
    const target = rects[e.dst];
    const gapTop = r.y + r.h <= target.y ? r.y + r.h : target.y + target.h;
    const gapBottom = r.y + r.h <= target.y ? target.y : r.y;
    const horizontal = gapBottom <= gapTop;
    const forward = target.x >= r.x;
    const baseline = forward ? r.y + Math.floor(r.h / 2) : Math.max(r.y + r.h, target.y + target.h) + b.height + 1;
    const near: Point = horizontal
      ? [
          Math.floor((Math.min(r.x + r.w, target.x + target.w) + Math.max(r.x, target.x) - b.width) / 2),
          baseline - b.height,
        ]
      : gapBottom > gapTop && e.src !== e.dst
        ? [
            laid.edges[k].label?.[0] ?? Math.floor((r.x + r.w / 2 + target.x + target.w / 2 - b.width) / 2),
            gapTop + Math.floor((gapBottom - gapTop - b.height) / 2),
          ]
        : (laid.edges[k].label ?? [r.x + r.w + 3, r.y + 1]);
    if (!horizontal && target.y < r.y) {
      const left = Math.max(r.x + (r.w > 2 ? 1 : 0), target.x + (target.w > 2 ? 1 : 0));
      const right = Math.min(r.x + r.w - (r.w > 2 ? 2 : 1), target.x + target.w - (target.w > 2 ? 2 : 1));
      // Keep the caption passage within both port spans when a straight connection fits.
      if (left <= right) {
        const center = near[0] - 1 + Math.floor((b.width + 2) / 2);
        const delta = Math.max(left, Math.min(right, center)) - center;
        const aligned = { x: near[0] + delta - 2, y: near[1] - 2, w: b.width + 4, h: b.height + 4 };
        if (!occupied(aligned)) near[0] += delta;
      }
    }
    for (let radius = 0; radius < Math.max(board.w, board.h); radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const dx = radius - Math.abs(dy);
        for (const offset of dx ? [-dx, dx] : [0]) {
          const rect = { x: near[0] + offset - 1, y: near[1] + dy, w: b.width + 2, h: b.height };
          if (
            rect.x < board.x + 2 ||
            rect.y < board.y + 2 ||
            rect.x + rect.w >= board.x + board.w - 2 ||
            rect.y + rect.h >= board.y + board.h - 2 ||
            occupied(
              horizontal ? { ...rect, h: rect.h + 1 } : { x: rect.x - 1, y: rect.y - 2, w: rect.w + 2, h: rect.h + 4 },
            )
          )
            continue;
          const cap = { rect, text: b };
          captions.push(cap);
          return cap;
        }
      }
    }
    throw new Error('Unable to arrange this state diagram.');
  });
  const passages = edgeCaptions.map((cap, k) => {
    if (!cap) return undefined;
    const e = ge[k],
      a = rects[e.src],
      b = rects[e.dst],
      r = cap.rect;
    const vertical = a.y + a.h <= b.y || b.y + b.h <= a.y;
    const side = e.src !== e.dst && !vertical;
    const forward = side ? b.x >= a.x : b.y >= a.y;
    const x = r.x + Math.floor(r.w / 2),
      y = r.y + r.h;
    const entry: Point = side ? [forward ? r.x : r.x + r.w - 1, y] : [x, forward ? r.y - 1 : r.y + r.h];
    const exit: Point = side ? [forward ? r.x + r.w - 1 : r.x, y] : [x, forward ? r.y + r.h : r.y - 1];
    const d = side ? (forward ? 1 : 3) : forward ? 2 : 0;
    const [dx, dy] = STEPS[d];
    cap.gates = [entry, exit, [entry[0] - dx, entry[1] - dy], [exit[0] + dx, exit[1] + dy]];
    return { entry, exit, d };
  });
  const connect = (starts: Port[], ends: Port[], cap?: Caption): Point[] =>
    route(c, solids, captions, starts, ends, board, cap);
  ge.forEach((e, k) => {
    if (e.src === e.dst) return;
    const a = rects[e.src],
      b = rects[e.dst];
    const cap = edgeCaptions[k];
    const nodePorts = (i: number, incoming: boolean): Port[] =>
      ports(rects[i], incoming).filter((p) => {
        if (kinds[i] === 'bar') return rects[i].h === 1 ? p.dir % 2 === 0 : p.dir % 2 === 1;
        return !nodes[i].isGroup || c.charAt(...p.border) === undefined;
      });
    let starts = nodePorts(e.src, false),
      ends = nodePorts(e.dst, true);
    // A reciprocal return runs below the forward transition.
    if (
      b.x + b.w <= a.x &&
      !(a.y + a.h <= b.y || b.y + b.h <= a.y) &&
      kinds[e.src] !== 'bar' &&
      kinds[e.dst] !== 'bar' &&
      ge.some((other) => other.src === e.dst && other.dst === e.src)
    ) {
      starts = starts.filter((p) => p.dir === 2);
      ends = ends.filter((p) => p.dir === 0);
    }
    const ac: Point = [a.x + Math.floor(a.w / 2), a.y + Math.floor(a.h / 2)];
    const bc: Point = [b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2)];
    const vertical = a.y + a.h <= b.y || b.y + b.h <= a.y;
    const desiredA: Point =
      e.src === e.dst
        ? [a.x + a.w - 2, a.y]
        : vertical
          ? [ac[0], bc[1] > ac[1] ? a.y + a.h - 1 : a.y]
          : [bc[0] > ac[0] ? a.x + a.w - 1 : a.x, ac[1]];
    const desiredB: Point =
      e.src === e.dst
        ? [b.x + b.w - 1, b.y + Math.floor(b.h / 2)]
        : vertical
          ? [bc[0], bc[1] > ac[1] ? b.y : b.y + b.h - 1]
          : [bc[0] > ac[0] ? b.x : b.x + b.w - 1, bc[1]];
    const sort = (ps: Port[], near: Point): void => {
      ps.sort(
        (p, q) =>
          Math.abs(q.border[0] - near[0]) +
          Math.abs(q.border[1] - near[1]) -
          (Math.abs(p.border[0] - near[0]) + Math.abs(p.border[1] - near[1])),
      );
    };
    sort(starts, desiredA);
    sort(ends, desiredB);
    let pts: Point[];
    if (cap) {
      const { entry, exit, d } = passages[k]!;
      const first = connect(starts, [{ p: entry, border: entry, dir: d }], cap);
      if (first.length) drawEdgeLine(c, first);
      const second = connect([{ p: exit, border: exit, dir: d }], ends, cap);
      pts = first.length && second.length ? [...first, ...second] : [];
    } else pts = connect(starts, ends);
    if (!pts.length) throw new Error('Unable to arrange this state diagram.');
    // The target border is only used during routing; finishEdge expects the preceding cell.
    pts = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
    pts.pop();
    drawEdgeLine(c, pts);
    finishEdge(c, pts);
    if (cap) {
      c.clear(cap.rect.x, cap.rect.y, cap.rect.w, cap.rect.h);
      cap.text.lines.forEach((line, j) => c.textIn(cap.rect.x + 1, cap.rect.y + j, cap.rect.w - 2, line));
    }
  });
  return c;
}

export const state: AsciiDiagram<StateDb> = { type: 'state', render: renderState };

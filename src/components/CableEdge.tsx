import { useRef } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  useStore,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { useAppStore } from "../store";
import type { Cable, PortSide } from "../types";

export interface CableEdgeData extends Record<string, unknown> {
  color: string;
}

export type CableEdgeType = Edge<CableEdgeData, "cable">;

type Point = { x: number; y: number };
type Seg = { a: Point; b: Point; isH: boolean; isV: boolean };

function buildPolyline(points: Point[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

// Insert small SVG arc bumps where the path crosses other cables (=
// segments perpendicular to the current one). Bumps are drawn over the
// other cable so the current cable visually goes over it.
function buildPathWithBumps(
  points: Point[],
  bumpsPerSeg: Map<number, Point[]>,
  r = 9,
): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const segIdx = i - 1;
    const isH = Math.abs(a.y - b.y) < 1;
    const isV = Math.abs(a.x - b.x) < 1;
    const list = bumpsPerSeg.get(segIdx) ?? [];
    if (list.length === 0 || (!isH && !isV)) {
      d += ` L ${b.x} ${b.y}`;
      continue;
    }
    if (isH) {
      const dirX = a.x < b.x ? 1 : -1;
      const sorted = [...list].sort((p, q) => (p.x - q.x) * dirX);
      const valid = sorted.filter(
        (bump) =>
          Math.abs(bump.x - a.x) > r + 2 && Math.abs(bump.x - b.x) > r + 2,
      );
      const sweep = dirX > 0 ? 0 : 1; // bump UP
      for (const bump of valid) {
        d += ` L ${bump.x - dirX * r} ${a.y}`;
        d += ` A ${r} ${r} 0 0 ${sweep} ${bump.x + dirX * r} ${a.y}`;
      }
      d += ` L ${b.x} ${b.y}`;
    } else {
      const dirY = a.y < b.y ? 1 : -1;
      const sorted = [...list].sort((p, q) => (p.y - q.y) * dirY);
      const valid = sorted.filter(
        (bump) =>
          Math.abs(bump.y - a.y) > r + 2 && Math.abs(bump.y - b.y) > r + 2,
      );
      const sweep = dirY > 0 ? 0 : 1; // bump RIGHT
      for (const bump of valid) {
        d += ` L ${a.x} ${bump.y - dirY * r}`;
        d += ` A ${r} ${r} 0 0 ${sweep} ${a.x} ${bump.y + dirY * r}`;
      }
      d += ` L ${b.x} ${b.y}`;
    }
  }
  return d;
}

function intersect(s1: Seg, s2: Seg): Point | null {
  if (s1.isH && s2.isV) {
    const x = s2.a.x;
    const y = s1.a.y;
    if (
      x > Math.min(s1.a.x, s1.b.x) &&
      x < Math.max(s1.a.x, s1.b.x) &&
      y > Math.min(s2.a.y, s2.b.y) &&
      y < Math.max(s2.a.y, s2.b.y)
    )
      return { x, y };
  }
  if (s1.isV && s2.isH) {
    const x = s1.a.x;
    const y = s2.a.y;
    if (
      x > Math.min(s2.a.x, s2.b.x) &&
      x < Math.max(s2.a.x, s2.b.x) &&
      y > Math.min(s1.a.y, s1.b.y) &&
      y < Math.max(s1.a.y, s1.b.y)
    )
      return { x, y };
  }
  return null;
}

function getHandlePos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeLookup: Map<string, any>,
  nodeId: string,
  portId: string,
  side: PortSide,
): Point | null {
  const node = nodeLookup.get(nodeId);
  if (!node?.internals?.handleBounds) return null;
  const handleId = `${side}:${portId}`;
  const sources = node.internals.handleBounds.source ?? [];
  const targets = node.internals.handleBounds.target ?? [];
  const handle = [...sources, ...targets].find(
    (h: { id: string }) => h.id === handleId,
  );
  if (!handle) return null;
  const abs = node.internals.positionAbsolute;
  return {
    x: abs.x + handle.x + handle.width / 2,
    y: abs.y + handle.y + handle.height / 2,
  };
}

type Rect = { x: number; y: number; width: number; height: number };

function segmentCrossesRect(a: Point, b: Point, r: Rect): boolean {
  const padding = 8;
  const x1 = r.x - padding;
  const y1 = r.y - padding;
  const x2 = r.x + r.width + padding;
  const y2 = r.y + r.height + padding;
  if (Math.abs(a.y - b.y) < 1) {
    if (a.y < y1 || a.y > y2) return false;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    return hi > x1 && lo < x2;
  }
  if (Math.abs(a.x - b.x) < 1) {
    if (a.x < x1 || a.x > x2) return false;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    return hi > y1 && lo < y2;
  }
  return false;
}

function routeCollides(
  source: Point,
  target: Point,
  waypoints: Point[],
  obstacles: Rect[],
): boolean {
  const all = [source, ...waypoints, target];
  for (let i = 0; i < all.length - 1; i++) {
    for (const o of obstacles) {
      if (segmentCrossesRect(all[i], all[i + 1], o)) return true;
    }
  }
  return false;
}

// Snap stored waypoints so the rendered polyline only ever has H or V
// segments. The direction of the first segment is inferred from where the
// user has placed wp[0] - whichever axis is closer to source. The chain
// then alternates and the final segment is snapped to land on target.
function orthogonalize(
  source: Point,
  target: Point,
  stored: Point[],
  obstacles: Rect[] = [],
): Point[] {
  if (stored.length === 0) {
    if (Math.abs(source.y - target.y) < 1) return [];
    const midX = (source.x + target.x) / 2;
    const candidates: number[] = [midX];
    for (const o of obstacles) {
      candidates.push(o.x - 30);
      candidates.push(o.x + o.width + 30);
    }
    candidates.sort((a, b) => Math.abs(a - midX) - Math.abs(b - midX));
    for (const x of candidates) {
      const wps = [
        { x, y: source.y },
        { x, y: target.y },
      ];
      if (!routeCollides(source, target, wps, obstacles)) return wps;
    }
    return [
      { x: midX, y: source.y },
      { x: midX, y: target.y },
    ];
  }
  const wps = stored.map((p) => ({ x: p.x, y: p.y }));
  let dir: "H" | "V" =
    Math.abs(wps[0].x - source.x) < Math.abs(wps[0].y - source.y) ? "V" : "H";
  if (dir === "H") wps[0].y = source.y;
  else wps[0].x = source.x;
  for (let i = 1; i < wps.length; i++) {
    dir = dir === "H" ? "V" : "H";
    if (dir === "H") wps[i].y = wps[i - 1].y;
    else wps[i].x = wps[i - 1].x;
  }
  dir = dir === "H" ? "V" : "H";
  if (dir === "H") wps[wps.length - 1].y = target.y;
  else wps[wps.length - 1].x = target.x;
  return wps;
}

// Drop waypoints that no longer matter: zero-length steps and collinear
// corners (where prev/cur/next sit on the same H or V line, so cur is
// just a point on a longer straight segment). Iterates until stable.
function simplify(source: Point, target: Point, waypoints: Point[]): Point[] {
  const eq = (a: number, b: number) => Math.abs(a - b) < 0.5;
  let wps = waypoints;
  for (let pass = 0; pass < 10; pass++) {
    const next: Point[] = [];
    const all = [source, ...wps, target];
    for (let i = 1; i < all.length - 1; i++) {
      const prev = next.length > 0 ? next[next.length - 1] : source;
      const cur = all[i];
      const after = all[i + 1];
      // Same as previous -> degenerate, drop.
      if (eq(prev.x, cur.x) && eq(prev.y, cur.y)) continue;
      // Same as next -> degenerate, drop.
      if (eq(cur.x, after.x) && eq(cur.y, after.y)) continue;
      // prev/cur/after collinear -> cur is on a straight bar, drop.
      if (eq(prev.y, cur.y) && eq(cur.y, after.y)) continue;
      if (eq(prev.x, cur.x) && eq(cur.x, after.x)) continue;
      next.push(cur);
    }
    if (next.length === wps.length) return wps;
    wps = next;
  }
  return wps;
}

function effectiveWaypoints(
  source: Point,
  target: Point,
  stored: Point[],
  obstacles: Rect[] = [],
): Point[] {
  let wps = stored;
  for (let pass = 0; pass < 5; pass++) {
    const ortho = orthogonalize(source, target, wps, obstacles);
    const simple = simplify(source, target, ortho);
    if (simple.length === wps.length) return simple;
    wps = simple;
  }
  return wps;
}

export function CableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style,
  markerEnd,
  markerStart,
  selected,
}: EdgeProps<CableEdgeType>) {
  const cable = useAppStore((s) => s.cables.find((c) => c.id === id));
  const allCables = useAppStore((s) => s.cables);
  const updateCable = useAppStore((s) => s.updateCable);
  const reverseCable = useAppStore((s) => s.reverseCable);
  const allNodes = useAppStore((s) => s.nodes);
  const allProducts = useAppStore((s) => s.products);
  const zoom = useStore((s) => s.transform[2]);
  const nodeLookup = useStore((s) => s.nodeLookup);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const stored = cable?.waypoints ?? [];
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };

  const buildObstacles = (forCable: Cable | undefined): Rect[] => {
    const portOnRight = (s: PortSide | undefined) => s === "out" || s === "midR";
    return allNodes
      .map((n): Rect | null => {
        const p = allProducts.find((pr) => pr.id === n.productId);
        const rows = Math.max(p?.inputs.length ?? 0, p?.outputs.length ?? 0, 1);
        const middleCount = p?.middle?.length ?? 0;
        const fullW = 180;
        const fullH = 50 + rows * 16 + middleCount * 16;
        const isFrom = n.id === forCable?.fromNodeId;
        const isTo = n.id === forCable?.toNodeId;
        if (isFrom && isTo) return null;
        if (isFrom) {
          return portOnRight(forCable?.fromPortSide ?? "out")
            ? { x: n.position.x, y: n.position.y, width: fullW - 40, height: fullH }
            : { x: n.position.x + 40, y: n.position.y, width: fullW - 40, height: fullH };
        }
        if (isTo) {
          return portOnRight(forCable?.toPortSide ?? "in")
            ? { x: n.position.x, y: n.position.y, width: fullW - 40, height: fullH }
            : { x: n.position.x + 40, y: n.position.y, width: fullW - 40, height: fullH };
        }
        return { x: n.position.x, y: n.position.y, width: fullW, height: fullH };
      })
      .filter((o): o is Rect => o !== null);
  };

  // Step 1: compute earlier cables' segments first (we need them to (a)
  // avoid routing on top of them and (b) draw bumps where we cross).
  const cableIdx = allCables.findIndex((c) => c.id === id);
  const earlierSegs: Seg[] = [];
  for (let ci = 0; ci < cableIdx; ci++) {
    const ec = allCables[ci];
    const eFrom = getHandlePos(
      nodeLookup,
      ec.fromNodeId,
      ec.fromPortId,
      ec.fromPortSide ?? "out",
    );
    const eTo = getHandlePos(
      nodeLookup,
      ec.toNodeId,
      ec.toPortId,
      ec.toPortSide ?? "in",
    );
    if (!eFrom || !eTo) continue;
    const eObstacles = buildObstacles(ec);
    const ewps = effectiveWaypoints(eFrom, eTo, ec.waypoints ?? [], eObstacles);
    const ePts = [eFrom, ...ewps, eTo];
    for (let i = 0; i < ePts.length - 1; i++) {
      const a = ePts[i];
      const b = ePts[i + 1];
      earlierSegs.push({
        a,
        b,
        isH: Math.abs(a.y - b.y) < 1,
        isV: Math.abs(a.x - b.x) < 1,
      });
    }
  }

  // Step 2: turn earlier V segments into thin obstacles so our default Z
  // route picks a midX away from them. Skip H segments because they're
  // perpendicular to our own V segment and we want them to cross with a
  // bump rather than detour around.
  const cableObstacles: Rect[] = earlierSegs
    .filter((s) => s.isV)
    .map((s) => ({
      x: s.a.x - 1,
      y: Math.min(s.a.y, s.b.y),
      width: 2,
      height: Math.abs(s.b.y - s.a.y),
    }));

  const obstacles = [...buildObstacles(cable), ...cableObstacles];
  const waypoints = effectiveWaypoints(source, target, stored, obstacles);
  const allPoints: Point[] = [source, ...waypoints, target];

  // Step 3: my segments
  const segs: Seg[] = [];
  for (let i = 0; i < allPoints.length - 1; i++) {
    const a = allPoints[i];
    const b = allPoints[i + 1];
    segs.push({ a, b, isH: Math.abs(a.y - b.y) < 1, isV: Math.abs(a.x - b.x) < 1 });
  }

  // Step 4: bumps where my segments cross earlier segments perpendicularly.
  const bumpsPerSeg = new Map<number, Point[]>();
  if (earlierSegs.length > 0) {
    for (let i = 0; i < segs.length; i++) {
      const myseg = segs[i];
      const list: Point[] = [];
      for (const es of earlierSegs) {
        const pt = intersect(myseg, es);
        if (pt) list.push(pt);
      }
      if (list.length > 0) bumpsPerSeg.set(i, list);
    }
  }

  const path =
    bumpsPerSeg.size > 0
      ? buildPathWithBumps(allPoints, bumpsPerSeg)
      : buildPolyline(allPoints);
  const mid = Math.floor(allPoints.length / 2);
  const a = allPoints[mid - 1] ?? allPoints[0];
  const b = allPoints[mid] ?? allPoints[allPoints.length - 1];
  const labelX = (a.x + b.x) / 2;
  const labelY = (a.y + b.y) / 2;

  const color = data?.color ?? "#888";

  if (!cable) {
    return (
      <BaseEdge
        id={id}
        path={path}
        style={{ ...style, strokeWidth: 2 }}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
    );
  }

  const offsetX = cable.labelOffset?.x ?? 0;
  const offsetY = cable.labelOffset?.y ?? 0;

  const onLabelMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "BUTTON") return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offsetX,
      origY: offsetY,
      moved: false,
    };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const rawDx = ev.clientX - dragRef.current.startX;
      const rawDy = ev.clientY - dragRef.current.startY;
      if (!dragRef.current.moved && Math.hypot(rawDx, rawDy) < 4) return;
      dragRef.current.moved = true;
      updateCable(cable.id, {
        labelOffset: {
          x: dragRef.current.origX + rawDx / zoom,
          y: dragRef.current.origY + rawDy / zoom,
        },
      });
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const onWaypointMouseDown = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const orig = { ...waypoints[i] };
    const baseEffective = waypoints.map((p) => ({ ...p }));
    const start = { x: e.clientX, y: e.clientY };
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - start.x) / zoom;
      const dy = (ev.clientY - start.y) / zoom;
      const next = [...baseEffective];
      next[i] = { x: orig.x + dx, y: orig.y + dy };
      updateCable(cable.id, { waypoints: next });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const removeWaypoint = (i: number) => {
    const next = waypoints.filter((_, idx) => idx !== i);
    updateCable(cable.id, { waypoints: next });
  };

  // Build segments for drag: each pair of consecutive points in allPoints
  const segments = [];
  for (let i = 0; i < allPoints.length - 1; i++) {
    segments.push({ a: allPoints[i], b: allPoints[i + 1], indexA: i, indexB: i + 1 });
  }

  const onSegmentMouseDown = (
    seg: { a: Point; b: Point; indexA: number; indexB: number },
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const isH = Math.abs(dy) < 1;
    const isV = Math.abs(dx) < 1;
    const start = { x: e.clientX, y: e.clientY };
    // Use the orthogonalized (effective) waypoints as base so the indices in
    // seg.indexA/B match positions in this array. The store will be updated
    // with the new effective waypoints.
    const baseWaypoints = waypoints.map((p) => ({ ...p }));
    const baseLen = baseWaypoints.length;

    const onMove = (ev: MouseEvent) => {
      const rdx = (ev.clientX - start.x) / zoom;
      const rdy = (ev.clientY - start.y) / zoom;
      if (Math.hypot(rdx, rdy) < 4) return;

      let next = [...baseWaypoints];
      const isAReal = seg.indexA > 0 && seg.indexA <= baseLen;
      const isBReal = seg.indexB > 0 && seg.indexB <= baseLen;

      if (isH || isV) {
        const newPerp = isH ? seg.a.y + rdy : seg.a.x + rdx;
        if (isAReal && isBReal) {
          if (isH) {
            next[seg.indexA - 1] = { ...next[seg.indexA - 1], y: newPerp };
            next[seg.indexB - 1] = { ...next[seg.indexB - 1], y: newPerp };
          } else {
            next[seg.indexA - 1] = { ...next[seg.indexA - 1], x: newPerp };
            next[seg.indexB - 1] = { ...next[seg.indexB - 1], x: newPerp };
          }
        } else if (isAReal && !isBReal) {
          if (isH) {
            next[seg.indexA - 1] = { ...next[seg.indexA - 1], y: newPerp };
            next.splice(seg.indexB - 1, 0, { x: seg.b.x, y: newPerp });
          } else {
            next[seg.indexA - 1] = { ...next[seg.indexA - 1], x: newPerp };
            next.splice(seg.indexB - 1, 0, { x: newPerp, y: seg.b.y });
          }
        } else if (!isAReal && isBReal) {
          if (isH) {
            next.splice(0, 0, { x: seg.a.x, y: newPerp });
            next[seg.indexB] = { ...next[seg.indexB], y: newPerp };
          } else {
            next.splice(0, 0, { x: newPerp, y: seg.a.y });
            next[seg.indexB] = { ...next[seg.indexB], x: newPerp };
          }
        } else {
          if (isH) {
            next.push({ x: seg.a.x, y: newPerp }, { x: seg.b.x, y: newPerp });
          } else {
            next.push({ x: newPerp, y: seg.a.y }, { x: newPerp, y: seg.b.y });
          }
        }
      } else {
        const insertAt = seg.indexA;
        const wp = {
          x: (seg.a.x + seg.b.x) / 2 + rdx,
          y: (seg.a.y + seg.b.y) / 2 + rdy,
        };
        next.splice(insertAt, 0, wp);
      }
      updateCable(cable.id, { waypoints: next });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          ...style,
          strokeWidth: selected ? 5 : 3,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={20}
      />

      {/* Handles only when selected */}
      {selected && (
        <>
          {/* Invisible thick hit areas - any drag on a segment slides it */}
          {segments.map((seg, i) => {
            const dx = seg.b.x - seg.a.x;
            const dy = seg.b.y - seg.a.y;
            const isH = Math.abs(dy) < 1;
            const isV = Math.abs(dx) < 1;
            const cursor = isH ? "ns-resize" : isV ? "ew-resize" : "move";
            return (
              <line
                key={`hit-${i}`}
                x1={seg.a.x}
                y1={seg.a.y}
                x2={seg.b.x}
                y2={seg.b.y}
                stroke="transparent"
                strokeWidth={22}
                style={{ cursor, pointerEvents: "stroke" }}
                onMouseDown={(e) => onSegmentMouseDown(seg, e)}
              />
            );
          })}

          {/* Mid-segment grip pills - visual handle */}
          {segments.map((seg, i) => {
            const dx = seg.b.x - seg.a.x;
            const dy = seg.b.y - seg.a.y;
            const isH = Math.abs(dy) < 1;
            const isV = Math.abs(dx) < 1;
            const len = Math.hypot(dx, dy);
            if (len < 30) return null;
            const midX = (seg.a.x + seg.b.x) / 2;
            const midY = (seg.a.y + seg.b.y) / 2;
            const w = isV ? 22 : isH ? 8 : 18;
            const h = isV ? 8 : isH ? 22 : 8;
            const cursor = isH ? "ns-resize" : isV ? "ew-resize" : "move";
            return (
              <rect
                key={`grip-${i}`}
                x={midX - w / 2}
                y={midY - h / 2}
                width={w}
                height={h}
                rx={3}
                ry={3}
                fill={color}
                stroke="#fff"
                strokeWidth={2}
                style={{ cursor, pointerEvents: "all" }}
                onMouseDown={(e) => onSegmentMouseDown(seg, e)}
              />
            );
          })}

          {/* Creation dots - click+drag to create a new corner that follows the cursor */}
          {segments.map((seg, i) => {
            const dx = seg.b.x - seg.a.x;
            const dy = seg.b.y - seg.a.y;
            const len = Math.hypot(dx, dy);
            if (len < 60) return null;
            const ts = [1 / 3, 2 / 3];
            return ts.map((t, k) => {
              const x = seg.a.x + dx * t;
              const y = seg.a.y + dy * t;
              return (
                <circle
                  key={`add-${i}-${k}`}
                  cx={x}
                  cy={y}
                  r={4}
                  fill="#fff"
                  stroke={color}
                  strokeWidth={1.5}
                  style={{ cursor: "crosshair", pointerEvents: "all" }}
                  onMouseDown={(ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                    const segIdx = i;
                    const baseEffective = waypoints.map((p) => ({ ...p }));
                    const start = { x: ev.clientX, y: ev.clientY };
                    let inserted = false;
                    const onMove = (mev: MouseEvent) => {
                      const ddx = (mev.clientX - start.x) / zoom;
                      const ddy = (mev.clientY - start.y) / zoom;
                      if (!inserted && Math.hypot(ddx, ddy) < 4) return;
                      inserted = true;
                      const next = [...baseEffective];
                      next.splice(segIdx, 0, { x: x + ddx, y: y + ddy });
                      updateCable(cable.id, { waypoints: next });
                    };
                    const onUp = () => {
                      document.removeEventListener("mousemove", onMove);
                      document.removeEventListener("mouseup", onUp);
                    };
                    document.addEventListener("mousemove", onMove);
                    document.addEventListener("mouseup", onUp);
                  }}
                />
              );
            });
          })}

          {/* Existing waypoint corners - drag to move, right-click to delete */}
          {waypoints.map((wp, i) => (
            <circle
              key={`wp-${i}`}
              cx={wp.x}
              cy={wp.y}
              r={6}
              fill="#fff"
              stroke={color}
              strokeWidth={3}
              style={{ cursor: "move", pointerEvents: "all" }}
              onMouseDown={(e) => onWaypointMouseDown(i, e)}
              onContextMenu={(e) => {
                e.preventDefault();
                removeWaypoint(i);
              }}
            />
          ))}
        </>
      )}

      <EdgeLabelRenderer>
        <div
          className={"cable-edge-label" + (selected ? " selected" : "")}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX + offsetX}px, ${labelY + offsetY}px)`,
            color,
          }}
          onMouseDown={onLabelMouseDown}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="cable-edge-line1">
            <input
              className="cable-edge-type"
              value={cable.cableType}
              style={{ width: `${Math.max(cable.cableType.length, 1) + 0.3}ch` }}
              onChange={(e) => updateCable(cable.id, { cableType: e.target.value })}
            />
            <input
              className="cable-edge-len"
              type="number"
              min={0}
              step={0.5}
              value={cable.lengthMeters}
              style={{ width: `${String(cable.lengthMeters).length + 0.3}ch` }}
              onChange={(e) =>
                updateCable(cable.id, { lengthMeters: Number(e.target.value) })
              }
            />
            <span className="cable-edge-unit">M</span>
            {selected && (
              <button
                type="button"
                className="cable-edge-reverse"
                title="Inverser le sens de la flèche"
                onClick={(e) => {
                  e.stopPropagation();
                  reverseCable(cable.id);
                }}
              >
                ⇄
              </button>
            )}
          </div>
          <input
            className="cable-edge-label-text"
            value={cable.label ?? ""}
            style={{ width: `${Math.max((cable.label ?? "").length, 4) + 0.5}ch` }}
            placeholder=""
            onChange={(e) => updateCable(cable.id, { label: e.target.value })}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

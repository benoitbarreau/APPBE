import type { Cable, PlacedProduct, PortSide, Product } from "../types";

/** Routage orthogonal des câbles du synoptique (extrait de CableEdge.tsx, lot 5 de
 *  l'audit du 17/11/2026) : fonctions pures, testées, et tracés de base partagés. */

export type Point = { x: number; y: number };
export type Seg = { a: Point; b: Point; isH: boolean; isV: boolean };

export function getHandlePos(
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

export type Rect = { x: number; y: number; width: number; height: number };

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

export function effectiveWaypoints(
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

/** Obstacles d'un câble : tous les produits du synoptique, ses deux extrémités
 *  réduites du côté de leur port (pour qu'il puisse en sortir). */
export function obstaclesFor(
  nodes: PlacedProduct[],
  products: Map<string, Pick<Product, "inputs" | "outputs" | "middle">>,
  forCable: Cable | undefined,
): Rect[] {
  const portOnRight = (s: PortSide | undefined) => s === "out" || s === "midR";
  return nodes
    .map((n): Rect | null => {
      const p = products.get(n.productId);
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
}

/** Dernier calcul des tracés de base, partagé par les câbles d'un même rendu. */
let routeCache: {
  cables: Cable[];
  nodes: PlacedProduct[];
  products: unknown;
  lookup: unknown;
  routes: Map<string, Point[]>;
} | null = null;

/**
 * Tracé de base de chaque câble (extrémités et coudes, obstacles = produits),
 * sans tenir compte des autres câbles. Il ne dépend pas du câble qui le demande :
 * il est calculé une fois et partagé par tous les câbles du même rendu.
 * Le cache vaut tant que les mêmes objets sont passés, et il est vidé à la fin
 * de la tâche en cours : React Flow modifie `nodeLookup` sur place (tailles et
 * positions mesurées), un rendu suivant recalcule donc toujours.
 */
export function baseRoutesFor(
  cables: Cable[],
  nodes: PlacedProduct[],
  products: Map<string, Pick<Product, "inputs" | "outputs" | "middle">>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeLookup: Map<string, any>,
): Map<string, Point[]> {
  const c = routeCache;
  if (c && c.cables === cables && c.nodes === nodes && c.products === products && c.lookup === nodeLookup) {
    return c.routes;
  }
  const routes = new Map<string, Point[]>();
  for (const ec of cables) {
    const from = getHandlePos(nodeLookup, ec.fromNodeId, ec.fromPortId, ec.fromPortSide ?? "out");
    const to = getHandlePos(nodeLookup, ec.toNodeId, ec.toPortId, ec.toPortSide ?? "in");
    if (!from || !to) continue;
    const wps = effectiveWaypoints(from, to, ec.waypoints ?? [], obstaclesFor(nodes, products, ec));
    routes.set(ec.id, [from, ...wps, to]);
  }
  routeCache = { cables, nodes, products, lookup: nodeLookup, routes };
  queueMicrotask(() => {
    if (routeCache?.routes === routes) routeCache = null;
  });
  return routes;
}

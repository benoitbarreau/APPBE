import dagre from "@dagrejs/dagre";
import type { Cable, PlacedProduct, Product } from "./types";

const NODE_WIDTH = 240;
const ROW_HEIGHT = 22;
const NODE_HEADER_HEIGHT = 60;

export function layoutNodes(
  nodes: PlacedProduct[],
  cables: Cable[],
  products: Product[],
): Array<{ id: string; x: number; y: number }> {
  if (nodes.length === 0) return [];
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: 80,
    ranksep: 140,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    const product = products.find((p) => p.id === n.productId);
    const rows = Math.max(
      product?.inputs.length ?? 0,
      product?.outputs.length ?? 0,
      1,
    );
    g.setNode(n.id, {
      width: NODE_WIDTH,
      height: NODE_HEADER_HEIGHT + rows * ROW_HEIGHT,
    });
  }
  for (const c of cables) {
    if (g.hasNode(c.fromNodeId) && g.hasNode(c.toNodeId)) {
      g.setEdge(c.fromNodeId, c.toNodeId);
    }
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      x: pos.x - pos.width / 2,
      y: pos.y - pos.height / 2,
    };
  });
}

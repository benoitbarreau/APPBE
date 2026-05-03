import { useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useAppStore } from "../store";
import { type PortSide, type Product, type SignalType } from "../types";

function parseHandle(handleId: string | null): { side: PortSide; portId: string } | null {
  if (!handleId) return null;
  const m = handleId.match(/^(in|out|midL|midR):(.*)$/);
  if (!m) return null;
  return { side: m[1] as PortSide, portId: m[2] };
}

function findPort(product: Product | undefined, side: PortSide, portId: string) {
  if (!product) return undefined;
  const list =
    side === "in"
      ? product.inputs
      : side === "out"
        ? product.outputs
        : product.middle ?? [];
  return list.find((p) => p.id === portId);
}
import { ProductNode } from "./ProductNode";
import { PageNode } from "./PageNode";
import { CableEdge } from "./CableEdge";
import { PAGE_BOUNDS, PAGE_NODE_ID } from "../page";

const nodeTypes = { product: ProductNode, page: PageNode };
const edgeTypes = { cable: CableEdge };

export function DiagramCanvas({
  onEditInstance,
}: {
  onEditInstance?: (nodeId: string) => void;
}) {
  const nodes = useAppStore((s) => s.nodes);
  const cables = useAppStore((s) => s.cables);
  const products = useAppStore((s) => s.products);
  const signals = useAppStore((s) => s.signals);
  const updateNode = useAppStore((s) => s.updateNode);
  const removeNode = useAppStore((s) => s.removeNode);
  const removeCable = useAppStore((s) => s.removeCable);
  const addCable = useAppStore((s) => s.addCable);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const setSelectedCable = useAppStore((s) => s.setSelectedCable);
  const reverseCable = useAppStore((s) => s.reverseCable);
  const updateCable = useAppStore((s) => s.updateCable);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const selectedCableId = useAppStore((s) => s.selectedCableId);

  const rfNodes: Node[] = useMemo(() => {
    // Compute the grid of A3 pages large enough to cover the diagram.
    // Each page is PAGE_BOUNDS.width x PAGE_BOUNDS.height in flow units;
    // tile starting from (0, 0).
    const NODE_W = 240;
    const NODE_H = 220;
    let maxRight = PAGE_BOUNDS.width;
    let maxBottom = PAGE_BOUNDS.height;
    let minLeft = 0;
    let minTop = 0;
    for (const n of nodes) {
      if (n.position.x + NODE_W > maxRight) maxRight = n.position.x + NODE_W;
      if (n.position.y + NODE_H > maxBottom) maxBottom = n.position.y + NODE_H;
      if (n.position.x < minLeft) minLeft = n.position.x;
      if (n.position.y < minTop) minTop = n.position.y;
    }
    const colStart = Math.min(0, Math.floor(minLeft / PAGE_BOUNDS.width));
    const rowStart = Math.min(0, Math.floor(minTop / PAGE_BOUNDS.height));
    const colEnd = Math.max(1, Math.ceil(maxRight / PAGE_BOUNDS.width));
    const rowEnd = Math.max(1, Math.ceil(maxBottom / PAGE_BOUNDS.height));
    const pages: Node[] = [];
    let pageIdx = 1;
    for (let r = rowStart; r < rowEnd; r++) {
      for (let c = colStart; c < colEnd; c++) {
        pages.push({
          id: `${PAGE_NODE_ID}-${c}-${r}`,
          type: "page",
          position: { x: c * PAGE_BOUNDS.width, y: r * PAGE_BOUNDS.height },
          data: { label: `Page ${pageIdx}` },
          selectable: false,
          draggable: false,
          deletable: false,
          zIndex: -1,
        });
        pageIdx++;
      }
    }
    return [
      ...pages,
      ...nodes.map((n) => ({
        id: n.id,
        type: "product",
        position: n.position,
        data: { nodeId: n.id },
        selected: n.id === selectedNodeId,
      })),
    ];
  }, [nodes, selectedNodeId]);

  const rfEdges: Edge[] = useMemo(
    () =>
      cables.map((c) => {
        const color = signals[c.signal]?.color ?? "#888";
        const arrow = { type: MarkerType.ArrowClosed, color };
        const fromSide: PortSide = c.fromPortSide ?? "out";
        const toSide: PortSide = c.toPortSide ?? "in";
        return {
          id: c.id,
          type: "cable",
          source: c.fromNodeId,
          target: c.toNodeId,
          sourceHandle: `${fromSide}:${c.fromPortId}`,
          targetHandle: `${toSide}:${c.toPortId}`,
          data: { color },
          style: { stroke: color, strokeWidth: 2 },
          markerStart: c.reversed ? arrow : undefined,
          markerEnd: c.reversed ? undefined : arrow,
          selected: c.id === selectedCableId,
          zIndex: 1000,
        } satisfies Edge;
      }),
    [cables, signals, selectedCableId],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, rfNodes);
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          const updated = next.find((n) => n.id === change.id);
          if (updated) updateNode(updated.id, { position: updated.position });
        }
        if (change.type === "remove") removeNode(change.id);
        if (change.type === "select") setSelectedNode(change.selected ? change.id : null);
      }
    },
    [rfNodes, updateNode, removeNode, setSelectedNode],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      applyEdgeChanges(changes, rfEdges);
      for (const change of changes) {
        if (change.type === "remove") removeCable(change.id);
        if (change.type === "select") setSelectedCable(change.selected ? change.id : null);
      }
    },
    [rfEdges, removeCable, setSelectedCable],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      const from = parseHandle(conn.sourceHandle);
      const to = parseHandle(conn.targetHandle);
      if (!from || !to) return;
      const fromNode = nodes.find((n) => n.id === conn.source);
      const toNode = nodes.find((n) => n.id === conn.target);
      if (!fromNode || !toNode) return;
      const fromProduct = products.find((p) => p.id === fromNode.productId);
      const fromPort = findPort(fromProduct, from.side, from.portId);
      if (!fromPort) return;
      // No restriction: any port to any port. Cable signal/color is taken
      // from the source port (where the user started the drag).
      const signal: SignalType = fromPort.signal;
      addCable({
        fromNodeId: fromNode.id,
        fromPortId: from.portId,
        fromPortSide: from.side,
        toNodeId: toNode.id,
        toPortId: to.portId,
        toPortSide: to.side,
        signal,
        lengthMeters: 5,
      });
    },
    [nodes, products, addCable],
  );

  const onEdgeDoubleClick = useCallback(
    (_e: React.MouseEvent, edge: Edge) => {
      reverseCable(edge.id);
    },
    [reverseCable],
  );

  const onNodeDoubleClick = useCallback(
    (_e: React.MouseEvent, n: Node) => {
      onEditInstance?.(n.id);
    },
    [onEditInstance],
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!newConnection.source || !newConnection.target) return;
      const from = parseHandle(newConnection.sourceHandle);
      const to = parseHandle(newConnection.targetHandle);
      if (!from || !to) return;
      const fromNode = nodes.find((n) => n.id === newConnection.source);
      if (!fromNode) return;
      const fromProduct = products.find((p) => p.id === fromNode.productId);
      const fromPort = findPort(fromProduct, from.side, from.portId);
      if (!fromPort) return;
      updateCable(oldEdge.id, {
        fromNodeId: newConnection.source,
        fromPortId: from.portId,
        fromPortSide: from.side,
        toNodeId: newConnection.target,
        toPortId: to.portId,
        toPortSide: to.side,
        signal: fromPort.signal,
        waypoints: [],
      });
    },
    [nodes, products, updateCable],
  );

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onReconnect={onReconnect}
      onEdgeDoubleClick={onEdgeDoubleClick}
      onNodeDoubleClick={onNodeDoubleClick}
      reconnectRadius={20}
      connectionMode={ConnectionMode.Loose}
      deleteKeyCode={["Delete", "Backspace"]}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={{ type: "cable" }}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      <Controls />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}

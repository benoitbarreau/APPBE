import { useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
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
import { type SignalType } from "../types";
import { ProductNode } from "./ProductNode";
import { CableEdge } from "./CableEdge";

const nodeTypes = { product: ProductNode };
const edgeTypes = { cable: CableEdge };

export function DiagramCanvas() {
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
  const updateCable = useAppStore((s) => s.updateCable);
  const { screenToFlowPosition } = useReactFlow();

  const rfNodes: Node[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "product",
        position: n.position,
        data: { nodeId: n.id },
      })),
    [nodes],
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      cables.map((c) => {
        const color = signals[c.signal]?.color ?? "#888";
        const arrow = { type: MarkerType.ArrowClosed, color };
        return {
          id: c.id,
          type: "cable",
          source: c.fromNodeId,
          target: c.toNodeId,
          sourceHandle: `out:${c.fromPortId}`,
          targetHandle: `in:${c.toPortId}`,
          data: { color },
          style: { stroke: color, strokeWidth: 2 },
          markerStart: c.reversed ? arrow : undefined,
          markerEnd: c.reversed ? undefined : arrow,
        } satisfies Edge;
      }),
    [cables, signals],
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
      if (!conn.source || !conn.target || !conn.sourceHandle || !conn.targetHandle) return;
      const fromPortId = conn.sourceHandle.replace(/^out:/, "");
      const toPortId = conn.targetHandle.replace(/^in:/, "");
      const fromNode = nodes.find((n) => n.id === conn.source);
      const toNode = nodes.find((n) => n.id === conn.target);
      if (!fromNode || !toNode) return;
      const fromProduct = products.find((p) => p.id === fromNode.productId);
      const toProduct = products.find((p) => p.id === toNode.productId);
      const fromPort = fromProduct?.outputs.find((p) => p.id === fromPortId);
      const toPort = toProduct?.inputs.find((p) => p.id === toPortId);
      if (!fromPort || !toPort) return;
      if (fromPort.signal !== toPort.signal) {
        const ok = window.confirm(
          `Signal mismatch: ${fromPort.signal} -> ${toPort.signal}. Créer la liaison quand même ?`,
        );
        if (!ok) return;
      }
      const signal: SignalType = fromPort.signal;
      addCable({
        fromNodeId: fromNode.id,
        fromPortId,
        toNodeId: toNode.id,
        toPortId,
        signal,
        lengthMeters: 5,
      });
    },
    [nodes, products, addCable],
  );

  const onEdgeDoubleClick = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      const cable = useAppStore.getState().cables.find((c) => c.id === edge.id);
      if (!cable) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const waypoints = [...(cable.waypoints ?? []), pos];
      updateCable(cable.id, { waypoints });
    },
    [screenToFlowPosition, updateCable],
  );

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onEdgeDoubleClick={onEdgeDoubleClick}
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

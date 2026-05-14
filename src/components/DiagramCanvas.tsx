import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useAppStore, useEditorState } from "../store";
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
  // Correspondance exacte (cas normal) puis correspondance par préfixe pour
  // les handles positionnels des enceintes (_n / _e / _s / _w).
  return (
    list.find((p) => p.id === portId) ??
    list.find((p) => portId.startsWith(p.id + "_"))
  );
}
import { ProductNode } from "./ProductNode";
import { PageNode } from "./PageNode";
import { CableEdge } from "./CableEdge";
import { TextNodeComponent } from "./TextNode";
import { PAGE_BOUNDS, PAGE_NODE_ID } from "../page";

// ── Rendu des guides d'alignement (à l'intérieur du contexte ReactFlow) ──────
type Guide = { type: "v"; x: number } | { type: "h"; y: number };

function AlignGuides({ guides }: { guides: Guide[] }) {
  const { x: vpX, y: vpY, zoom } = useViewport();
  if (guides.length === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
        overflow: "hidden",
      }}
    >
      {guides.map((g, i) => {
        if (g.type === "v") {
          const sx = Math.round(g.x * zoom + vpX);
          return (
            <div
              key={`v-${i}`}
              style={{
                position: "absolute",
                left: sx,
                top: 0,
                bottom: 0,
                width: 0,
                borderLeft: "1.5px dashed #e63946",
                opacity: 0.85,
              }}
            />
          );
        }
        const sy = Math.round(g.y * zoom + vpY);
        return (
          <div
            key={`h-${i}`}
            style={{
              position: "absolute",
              top: sy,
              left: 0,
              right: 0,
              height: 0,
              borderTop: "1.5px dashed #e63946",
              opacity: 0.85,
            }}
          />
        );
      })}
    </div>
  );
}

const nodeTypes = { product: ProductNode, page: PageNode, text: TextNodeComponent };
const edgeTypes = { cable: CableEdge };

export function DiagramCanvas({
  onEditInstance,
}: {
  onEditInstance?: (nodeId: string) => void;
}) {
  const nodes = useAppStore((s) => s.nodes);
  const cables = useAppStore((s) => s.cables);
  const textNodes = useAppStore((s) => s.textNodes);
  const products = useAppStore((s) => s.products);
  const signals = useAppStore((s) => s.signals);
  const updateNode = useAppStore((s) => s.updateNode);
  const removeNode = useAppStore((s) => s.removeNode);
  const removeCable = useAppStore((s) => s.removeCable);
  const addCable = useAppStore((s) => s.addCable);
  const updateTextNode = useAppStore((s) => s.updateTextNode);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const setSelectedCable = useAppStore((s) => s.setSelectedCable);
  const reverseCable = useAppStore((s) => s.reverseCable);
  const updateCable = useAppStore((s) => s.updateCable);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const selectedCableId = useAppStore((s) => s.selectedCableId);
  const readOnly = useEditorState((s) => s.readOnly);

  // ── Guides d'alignement (smart guides style Visio) ───────────────────────
  const SNAP_THRESHOLD = 8; // pixels flow
  const [guides, setGuides] = useState<Guide[]>([]);
  const snapTargetRef = useRef<{ x?: number; y?: number } | null>(null);

  // ── Notification d'incompatibilité ────────────────────────────────────────
  const [compatError, setCompatError] = useState<string | null>(null);
  const compatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCompatError = useCallback((msg: string) => {
    if (compatTimerRef.current) clearTimeout(compatTimerRef.current);
    setCompatError(msg);
    compatTimerRef.current = setTimeout(() => setCompatError(null), 3500);
  }, []);

  useEffect(() => () => {
    if (compatTimerRef.current) clearTimeout(compatTimerRef.current);
  }, []);

  const SPEAKER_CATS = new Set(["Enceintes", "Caisson de basse"]);

  const rfNodes: Node[] = useMemo(() => {
    // Compute the grid of A3 pages large enough to cover the diagram.
    // Each page is PAGE_BOUNDS.width x PAGE_BOUNDS.height in flow units;
    // tile starting from (0, 0).
    // Largeur CSS fixe du bloc produit : 150px + ~10px de marge pour les handles
    const NODE_W = 160;
    // Hauteur estimée haute (varie selon le nb de ports) — valeur conservative
    const NODE_H = 200;
    const SPEAKER_SIZE = 60;
    let maxRight = PAGE_BOUNDS.width;
    let maxBottom = PAGE_BOUNDS.height;
    let minLeft = 0;
    let minTop = 0;
    for (const n of nodes) {
      const product = products.find((p) => p.id === n.productId);
      const isSpeaker = product && SPEAKER_CATS.has(product.category);
      const nw = isSpeaker ? SPEAKER_SIZE : NODE_W;
      const nh = isSpeaker ? SPEAKER_SIZE : NODE_H;
      if (n.position.x + nw > maxRight) maxRight = n.position.x + nw;
      if (n.position.y + nh > maxBottom) maxBottom = n.position.y + nh;
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
    const textRfNodes = textNodes.map((tn) => ({
      id: tn.id,
      type: "text" as const,
      position: tn.position,
      // data est casté car React Flow attend Record<string, unknown> mais le
      // custom node reçoit TextNodeData (typé plus précisément en interne).
      data: tn as unknown as Record<string, unknown>,
      selected: false,
      zIndex: 2000,
      style: { width: tn.width, height: tn.height },
    }));

    return [
      ...pages,
      ...nodes.map((n) => ({
        id: n.id,
        type: "product",
        position: n.position,
        data: { nodeId: n.id },
        selected: n.id === selectedNodeId,
      })),
      ...textRfNodes,
    ];
  }, [nodes, textNodes, selectedNodeId, products]);

  // Callbacks de drag — définis après rfNodes (dont ils dépendent)
  const onNodeDrag = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (readOnly) return;
      const dW = node.measured?.width ?? 150;
      const dH = node.measured?.height ?? 120;
      const dCX = node.position.x + dW / 2;
      const dCY = node.position.y + dH / 2;

      const newGuides: Guide[] = [];
      let snapX: number | undefined;
      let snapY: number | undefined;

      for (const other of rfNodes) {
        if (other.type !== "product" || other.id === node.id) continue;
        const oW = other.measured?.width ?? 150;
        const oH = other.measured?.height ?? 120;
        const oCX = other.position.x + oW / 2;
        const oCY = other.position.y + oH / 2;

        if (Math.abs(dCX - oCX) < SNAP_THRESHOLD) {
          newGuides.push({ type: "v", x: oCX });
          if (snapX === undefined) snapX = oCX - dW / 2;
        }
        if (Math.abs(dCY - oCY) < SNAP_THRESHOLD) {
          newGuides.push({ type: "h", y: oCY });
          if (snapY === undefined) snapY = oCY - dH / 2;
        }
      }

      setGuides(newGuides);
      snapTargetRef.current =
        snapX !== undefined || snapY !== undefined
          ? { x: snapX, y: snapY }
          : null;
    },
    [rfNodes, readOnly, SNAP_THRESHOLD],
  );

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const snap = snapTargetRef.current;
      if (snap) {
        updateNode(node.id, {
          position: {
            x: snap.x !== undefined ? snap.x : node.position.x,
            y: snap.y !== undefined ? snap.y : node.position.y,
          },
        });
      }
      setGuides([]);
      snapTargetRef.current = null;
    },
    [updateNode],
  );

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
          if (!updated) continue;
          // Text node ou product node ?
          if (textNodes.some((tn) => tn.id === change.id)) {
            updateTextNode(change.id, { position: updated.position });
          } else {
            updateNode(updated.id, { position: updated.position });
          }
        }
        if (change.type === "dimensions") {
          // NodeResizer envoie ce type quand les dimensions changent
          if (textNodes.some((tn) => tn.id === change.id) && change.dimensions) {
            updateTextNode(change.id, {
              width: Math.round(change.dimensions.width),
              height: Math.round(change.dimensions.height),
            });
          }
        }
        if (change.type === "remove") {
          if (textNodes.some((tn) => tn.id === change.id)) {
            // géré par le bouton ✕ dans TextNode — on ne supprime pas ici
          } else {
            removeNode(change.id);
          }
        }
        if (change.type === "select") setSelectedNode(change.selected ? change.id : null);
      }
    },
    [rfNodes, textNodes, updateNode, updateTextNode, removeNode, setSelectedNode],
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
      const toProduct   = products.find((p) => p.id === toNode.productId);
      const fromPort = findPort(fromProduct, from.side, from.portId);
      const toPort   = findPort(toProduct,   to.side,   to.portId);
      if (!fromPort) return;

      // ── Vérification de compatibilité par famille de signal ──────────────
      if (toPort && toPort.signal !== fromPort.signal) {
        const fromLabel = signals[fromPort.signal]?.label ?? fromPort.signal;
        const toLabel   = signals[toPort.signal]?.label   ?? toPort.signal;
        showCompatError(
          `Connexion impossible : port "${fromLabel}" ↔ port "${toLabel}"`,
        );
        return;
      }

      const signal: SignalType = fromPort.signal;
      addCable({
        fromNodeId: fromNode.id,
        fromPortId: from.portId,
        fromPortSide: from.side,
        toNodeId: toNode.id,
        toPortId: to.portId,
        toPortSide: to.side,
        signal,
      });
    },
    [nodes, products, signals, addCable, showCompatError],
  );

  const onEdgeDoubleClick = useCallback(
    (_e: React.MouseEvent, edge: Edge) => {
      reverseCable(edge.id);
    },
    [reverseCable],
  );

  const onNodeDoubleClick = useCallback(
    (_e: React.MouseEvent, n: Node) => {
      // Les blocs texte gèrent leur propre double-clic en interne
      if (n.type === "text") return;
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
      const toNode   = nodes.find((n) => n.id === newConnection.target);
      if (!fromNode || !toNode) return;
      const fromProduct = products.find((p) => p.id === fromNode.productId);
      const toProduct   = products.find((p) => p.id === toNode.productId);
      const fromPort = findPort(fromProduct, from.side, from.portId);
      const toPort   = findPort(toProduct,   to.side,   to.portId);
      if (!fromPort) return;

      // ── Vérification de compatibilité par famille de signal ──────────────
      if (toPort && toPort.signal !== fromPort.signal) {
        const fromLabel = signals[fromPort.signal]?.label ?? fromPort.signal;
        const toLabel   = signals[toPort.signal]?.label   ?? toPort.signal;
        showCompatError(
          `Reconnexion impossible : port "${fromLabel}" ↔ port "${toLabel}"`,
        );
        return;
      }

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
    [nodes, products, signals, updateCable, showCompatError],
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {compatError && (
        <div className="compat-error-toast">
          <span className="compat-error-icon">⚠</span>
          {compatError}
        </div>
      )}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        onReconnect={readOnly ? undefined : onReconnect}
        onEdgeDoubleClick={readOnly ? undefined : onEdgeDoubleClick}
        onNodeDoubleClick={readOnly ? undefined : onNodeDoubleClick}
        onNodeDrag={readOnly ? undefined : onNodeDrag}
        onNodeDragStop={readOnly ? undefined : onNodeDragStop}
        reconnectRadius={10}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: "cable" }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <AlignGuides guides={guides} />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

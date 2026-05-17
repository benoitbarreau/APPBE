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

/** Cherche un port dans toutes les sections du produit (inputs + outputs + middle),
 *  indépendamment du côté. Cela corrige le bug où un port déplacé via portOverrides
 *  se retrouvait dans la mauvaise liste (ex. output déplacé à gauche, cherché dans inputs). */
function findPort(product: Product | undefined, portId: string) {
  if (!product) return undefined;
  const all = [...product.inputs, ...product.outputs, ...(product.middle ?? [])];
  // Correspondance exacte (cas normal) puis correspondance par préfixe pour
  // les handles positionnels des enceintes (_n / _e / _s / _w).
  return (
    all.find((p) => p.id === portId) ??
    all.find((p) => portId.startsWith(p.id + "_"))
  );
}
import { ProductNode } from "./ProductNode";
import { PageNode } from "./PageNode";
import { CableEdge } from "./CableEdge";
import { TextNodeComponent } from "./TextNode";
import { ShapeNodeComponent } from "./ShapeNode";
import { ImageNodeComponent } from "./ImageNode";
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

const nodeTypes = { product: ProductNode, page: PageNode, text: TextNodeComponent, shape: ShapeNodeComponent, image: ImageNodeComponent };
const edgeTypes = { cable: CableEdge };

export function DiagramCanvas({
  onEditInstance,
}: {
  onEditInstance?: (nodeId: string) => void;
}) {
  const nodes = useAppStore((s) => s.nodes);
  const cables = useAppStore((s) => s.cables);
  const textNodes = useAppStore((s) => s.textNodes);
  const shapeNodes = useAppStore((s) => s.shapeNodes);
  const imageNodes = useAppStore((s) => s.imageNodes);
  const products = useAppStore((s) => s.products);
  const signals = useAppStore((s) => s.signals);
  const updateNode = useAppStore((s) => s.updateNode);
  const removeNode = useAppStore((s) => s.removeNode);
  const removeCable = useAppStore((s) => s.removeCable);
  const addCable = useAppStore((s) => s.addCable);
  const updateTextNode = useAppStore((s) => s.updateTextNode);
  const removeTextNode = useAppStore((s) => s.removeTextNode);
  const updateShapeNode = useAppStore((s) => s.updateShapeNode);
  const removeShapeNode = useAppStore((s) => s.removeShapeNode);
  const updateImageNode = useAppStore((s) => s.updateImageNode);
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

  // ── Sélection locale (blocs texte, forme et image) — non persistée dans le store ──
  // `selected: false` codé en dur empêchait le NodeResizer d'apparaître.
  // On track l'ID sélectionné ici pour le passer dans la prop `selected`.
  const [selectedTextNodeId,  setSelectedTextNodeId]  = useState<string | null>(null);
  const [selectedShapeNodeId, setSelectedShapeNodeId] = useState<string | null>(null);
  const [selectedImageNodeId, setSelectedImageNodeId] = useState<string | null>(null);

  // ── Dimensions réelles des blocs produit (mesurées par React Flow) ──────────
  // Permet de calculer la grille de pages avec les vraies hauteurs au lieu des
  // estimations statiques qui généraient des pages fantômes quand un bloc
  // s'approchait du bord d'une page sans réellement la dépasser.
  const measuredNodeSizes = useRef<Map<string, { width: number; height: number }>>(new Map());
  const [measuredVersion, setMeasuredVersion] = useState(0);

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
    //
    // Dimensions par défaut (fallback avant la 1ère mesure par React Flow) :
    // - NODE_W / NODE_H : estimation conservative pour les blocs produit normaux
    // - SPEAKER_SIZE    : blocs enceintes (forme carrée fixe)
    // Les vraies dimensions sont lues depuis measuredNodeSizes (mis à jour via
    // onNodesChange) pour éviter les pages fantômes générées par des estimations
    // trop grandes.
    const NODE_W = 160;
    const NODE_H = 160;   // réduit de 200 → 160 ; les vrais blocs mesurent en général 80-180px
    const SPEAKER_SIZE = 60;
    let maxRight = PAGE_BOUNDS.width;
    let maxBottom = PAGE_BOUNDS.height;
    let minLeft = 0;
    let minTop = 0;
    for (const n of nodes) {
      const product = products.find((p) => p.id === n.productId);
      const isSpeaker = product && SPEAKER_CATS.has(product.category);
      // Utilise la dimension mesurée par React Flow si disponible, sinon l'estimation
      const measured = measuredNodeSizes.current.get(n.id);
      const nw = measured?.width  ?? (isSpeaker ? SPEAKER_SIZE : NODE_W);
      const nh = measured?.height ?? (isSpeaker ? SPEAKER_SIZE : NODE_H);
      if (n.position.x + nw > maxRight)  maxRight  = n.position.x + nw;
      if (n.position.y + nh > maxBottom) maxBottom = n.position.y + nh;
      if (n.position.x < minLeft) minLeft = n.position.x;
      if (n.position.y < minTop)  minTop  = n.position.y;
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
          zIndex: -2000,   // En dessous de tout (formes à -1000+, produits à 0, textes à 2000)
        });
        pageIdx++;
      }
    }
    // Les blocs texte et produits utilisent le drag natif React Flow (clic gauche).
    // La sélection de texte dans les blocs en mode édition est protégée par la
    // classe `nodrag` sur le <textarea> (voir TextNode.tsx).
    const textRfNodes = textNodes.map((tn) => ({
      id: tn.id,
      type: "text" as const,
      position: tn.position,
      // data est casté car React Flow attend Record<string, unknown> mais le
      // custom node reçoit TextNodeData (typé plus précisément en interne).
      data: tn as unknown as Record<string, unknown>,
      selected: tn.id === selectedTextNodeId,
      zIndex: 2000,
      style: { width: tn.width, height: tn.height },
    }));

    // Blocs forme : zIndex négatif (en arrière-plan de tout sauf les pages).
    // zOrder 0 → zIndex -1000, zOrder 1 → zIndex -999, etc.
    const shapeRfNodes = (shapeNodes ?? []).map((sn) => ({
      id: sn.id,
      type: "shape" as const,
      position: sn.position,
      data: sn as unknown as Record<string, unknown>,
      selected: sn.id === selectedShapeNodeId,
      zIndex: sn.zOrder - 1000,
      style: { width: sn.width, height: sn.height },
    }));

    // Blocs image :
    // - layer "background" → zIndex négatif (-800 + zOrder) : derrière les produits, devant les formes
    // - layer "foreground" → zIndex positif (1500 + zOrder) : devant les produits, derrière les textes
    const imageRfNodes = (imageNodes ?? []).map((img) => ({
      id: img.id,
      type: "image" as const,
      position: img.position,
      data: img as unknown as Record<string, unknown>,
      selected: img.id === selectedImageNodeId,
      zIndex: img.layer === "background" ? img.zOrder - 800 : 1500 + img.zOrder,
      style: { width: img.width, height: img.height },
    }));

    const bgImages = imageRfNodes.filter((n) => (n.data as unknown as { layer: string }).layer === "background");
    const fgImages = imageRfNodes.filter((n) => (n.data as unknown as { layer: string }).layer === "foreground");

    return [
      ...pages,
      ...shapeRfNodes,   // formes en arrière-plan (zIndex -1000 à ~-971)
      ...bgImages,       // images arrière-plan (zIndex -800+)
      ...nodes.map((n) => ({
        id: n.id,
        type: "product",
        position: n.position,
        data: { nodeId: n.id },
        selected: n.id === selectedNodeId,
      })),
      ...fgImages,       // images premier plan (zIndex 1500+)
      ...textRfNodes,    // textes au premier plan (zIndex 2000)
    ];
  // measuredVersion : compteur incrémenté quand React Flow mesure un bloc produit
  // → force le recalcul des pages avec les vraies dimensions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, textNodes, shapeNodes, imageNodes, selectedNodeId, selectedTextNodeId, selectedShapeNodeId, selectedImageNodeId, products, measuredVersion]);

  // Helper : calcule guides d'alignement + cible de snap pour une position candidate.
  // Appelé depuis onNodeDrag (drag natif React Flow sur les blocs produit).
  const computeGuides = useCallback(
    (nodeId: string, position: { x: number; y: number }, dW: number, dH: number) => {
      const dCX = position.x + dW / 2;
      const dCY = position.y + dH / 2;
      const newGuides: Guide[] = [];
      let snapX: number | undefined;
      let snapY: number | undefined;
      for (const other of rfNodes) {
        if (other.type !== "product" || other.id === nodeId) continue;
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
      return {
        guides: newGuides,
        snap: (snapX !== undefined || snapY !== undefined) ? { x: snapX, y: snapY } : null,
      };
    },
    [rfNodes, SNAP_THRESHOLD],
  );

  // ── Drag natif React Flow : smart guides pendant le drag des blocs produit ─
  const onNodeDrag = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (node.type !== "product") return;
      const dW = node.measured?.width ?? 150;
      const dH = node.measured?.height ?? 120;
      const { guides: g, snap } = computeGuides(node.id, node.position, dW, dH);
      setGuides(g);
      snapTargetRef.current = snap;
    },
    [computeGuides],
  );

  // ── Fin de drag : applique le snap à la position finale ──────────────────
  const onNodeDragStop = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      const snap = snapTargetRef.current;
      if (snap && node.type === "product") {
        const finalPos = {
          x: snap.x !== undefined ? snap.x : node.position.x,
          y: snap.y !== undefined ? snap.y : node.position.y,
        };
        updateNode(node.id, { position: finalPos });
      }
      snapTargetRef.current = null;
      setGuides([]);
    },
    [updateNode],
  );

  const rfEdges: Edge[] = useMemo(() => {
    /**
     * Recalcule le côté effectif (PortSide) d'un port en tenant compte de ses
     * portOverrides actuels. Corrige le bug où un câble créé avant un déplacement
     * de port stockait l'ancien côté et devenait invisible après le déplacement.
     *
     * Priorité :
     *  1. Override explicite sur l'instance ("left"→"in", "right"→"out")
     *  2. Position par défaut dans le catalogue (inputs→"in", outputs→"out")
     *  3. Valeur stockée dans le câble (fallback, toujours correcte pour extraPorts)
     */
    const effectiveSide = (
      stored: PortSide | undefined,
      nodeId: string,
      portId: string,
    ): PortSide => {
      const s = stored ?? "out";
      if (s === "midL" || s === "midR") return s; // ports milieu : pas de déplacement gauche/droite
      const node = nodes.find((n) => n.id === nodeId);
      const product = products.find((p) => p.id === node?.productId);
      const override = node?.portOverrides?.[portId];
      if (override === "left") return "in";
      if (override === "right") return "out";
      if (product) {
        if (product.inputs.some((p) => p.id === portId)) return "in";
        if (product.outputs.some((p) => p.id === portId)) return "out";
      }
      return s;
    };

    return cables.map((c) => {
      const color = signals[c.signal]?.color ?? "#888";
      const arrow = { type: MarkerType.ArrowClosed, color };
      const fromSide = effectiveSide(c.fromPortSide, c.fromNodeId, c.fromPortId);
      const toSide   = effectiveSide(c.toPortSide,   c.toNodeId,   c.toPortId);
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
    });
  }, [cables, signals, selectedCableId, nodes, products]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, rfNodes);
      for (const change of changes) {
        // Identifie la nature du nœud ciblé par le changement.
        // On compare avec les arrays "live" du store ; ne JAMAIS appeler
        // removeNode pour un id qui n'est pas un produit (pages, text nodes…)
        // car cela invaliderait inutilement nodes/cables (référence array).
        const targetId  = "id" in change ? (change as { id: string }).id : null;
        const isTextNode  = !!targetId && textNodes.some((tn) => tn.id === targetId);
        const isShapeNode = !!targetId && (shapeNodes ?? []).some((sn) => sn.id === targetId);
        const isImageNode = !!targetId && (imageNodes ?? []).some((n) => n.id === targetId);
        const isProduct   = !!targetId && nodes.some((n) => n.id === targetId);

        if (change.type === "position" && change.position) {
          const updated = next.find((n) => n.id === change.id);
          if (!updated) continue;
          if (isTextNode) {
            updateTextNode(change.id, { position: updated.position });
          } else if (isShapeNode) {
            updateShapeNode(change.id, { position: updated.position });
          } else if (isImageNode) {
            updateImageNode(change.id, { position: updated.position });
          } else if (isProduct) {
            updateNode(updated.id, { position: updated.position });
          }
          // Sinon : page node (non-draggable) — ne rien faire
        }

        // Dimensions : deux cas à distinguer.
        if (change.type === "dimensions" && change.dimensions) {
          if (change.resizing) {
            // Redimensionnement explicite par l'utilisateur via NodeResizer →
            // persister la nouvelle taille dans le store.
            if (isTextNode) {
              updateTextNode(change.id, {
                width:  Math.round(change.dimensions.width),
                height: Math.round(change.dimensions.height),
              });
            } else if (isShapeNode) {
              updateShapeNode(change.id, {
                width:  Math.round(change.dimensions.width),
                height: Math.round(change.dimensions.height),
              });
            } else if (isImageNode) {
              updateImageNode(change.id, {
                width:  Math.round(change.dimensions.width),
                height: Math.round(change.dimensions.height),
              });
            }
          } else if (isProduct) {
            // Mesure automatique par React Flow (1ère render ou après un
            // changement de contenu). On stocke dans le ref pour affiner le
            // calcul de la grille de pages sans écraser nos valeurs persistées.
            const { width: newW, height: newH } = change.dimensions;
            if (newW > 0 && newH > 0) {
              const prev = measuredNodeSizes.current.get(change.id);
              if (!prev || Math.abs(prev.height - newH) > 4 || Math.abs(prev.width - newW) > 4) {
                measuredNodeSizes.current.set(change.id, { width: newW, height: newH });
                setMeasuredVersion((v) => v + 1);
              }
            }
          }
        }

        if (change.type === "remove") {
          if (isTextNode) {
            removeTextNode(change.id);
          } else if (isShapeNode) {
            removeShapeNode(change.id);
          } else if (isImageNode) {
            // Les images se suppriment depuis la toolbar (bouton ✕) — on ignore ici
          } else if (isProduct) {
            removeNode(change.id);
            // Nettoyer la dimension mesurée du nœud supprimé
            measuredNodeSizes.current.delete(change.id);
          }
          // Page node ou inconnu : ignorer
        }

        if (change.type === "select") {
          if (isTextNode) {
            // Pour les blocs texte, on met à jour l'état local de sélection
            // afin que la prop `selected` soit correctement transmise et que
            // le NodeResizer s'affiche.
            setSelectedTextNodeId(change.selected ? change.id : null);
          } else if (isShapeNode) {
            setSelectedShapeNodeId(change.selected ? change.id : null);
          } else if (isImageNode) {
            setSelectedImageNodeId(change.selected ? change.id : null);
          } else if (isProduct) {
            setSelectedNode(change.selected ? change.id : null);
          }
        }
      }
    },
    [rfNodes, nodes, textNodes, shapeNodes, imageNodes, updateNode, updateTextNode, updateShapeNode, updateImageNode, removeNode, removeTextNode, removeShapeNode, setSelectedNode],
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
      const fromPort = findPort(fromProduct, from.portId);
      const toPort   = findPort(toProduct,   to.portId);
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

  // Clic sur le fond du canvas (pane) → quitter le mode édition des blocs texte
  // et désélectionner. On dispatch un événement custom que TextNodeComponent écoute.
  const onPaneClick = useCallback(() => {
    window.dispatchEvent(new CustomEvent("exitTextEdit"));
    setSelectedTextNodeId(null);
    setSelectedShapeNodeId(null);
    setSelectedImageNodeId(null);
  }, []);

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
      const fromPort = findPort(fromProduct, from.portId);
      const toPort   = findPort(toProduct,   to.portId);
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
    <div
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
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
        onPaneClick={onPaneClick}
        onNodeDrag={readOnly ? undefined : onNodeDrag}
        onNodeDragStop={readOnly ? undefined : onNodeDragStop}
        reconnectRadius={10}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        // Clic gauche maintenu sur le fond = pan du canvas (défaut React Flow)
        panOnDrag={!readOnly}
        // Zoom au double-clic DÉSACTIVÉ — sinon double-clic sur un bloc ou
        // sur le fond zoome au lieu d'ouvrir l'éditeur d'instance/texte.
        zoomOnDoubleClick={false}
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

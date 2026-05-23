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
import { BLANK_PRODUCT, type PlacedProduct, type Port, type PortSide, type Product, type SignalType, type TextNodeData, type ShapeNodeData, type ImageNodeData } from "../types";

function parseHandle(handleId: string | null): { side: PortSide; portId: string } | null {
  if (!handleId) return null;
  const m = handleId.match(/^(in|out|midL|midR):(.*)$/);
  if (!m) return null;
  return { side: m[1] as PortSide, portId: m[2] };
}

/** Cherche un port dans toutes les sections du produit (inputs + outputs + middle),
 *  indépendamment du côté. Cela corrige le bug où un port déplacé via portOverrides
 *  se retrouvait dans la mauvaise liste (ex. output déplacé à gauche, cherché dans inputs). */
function findPort(product: Product | undefined, portId: string): Port | undefined {
  if (!product) return undefined;
  const all = [...product.inputs, ...product.outputs, ...(product.middle ?? [])];
  // Correspondance exacte (cas normal) puis correspondance par préfixe pour
  // les handles positionnels des enceintes (_n / _e / _s / _w).
  return (
    all.find((p) => p.id === portId) ??
    all.find((p) => portId.startsWith(p.id + "_"))
  );
}

/** Cherche un port dans le catalogue ET dans les extraPorts de l'instance.
 *  Gère les blocs vierges (dont tous les ports sont dans extraPorts) et les
 *  ports ajoutés manuellement via l'éditeur d'instance sur n'importe quel bloc. */
function findEffectivePort(
  product: Product | undefined,
  node: PlacedProduct | undefined,
  portId: string,
): Port | undefined {
  const catalogPort = findPort(product, portId);
  if (catalogPort) return catalogPort;
  const extras = node?.extraPorts ?? [];
  return (
    extras.find((p) => p.id === portId) ??
    extras.find((p) => portId.startsWith(p.id + "_"))
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
/** Guide d'alignement affiché pendant le drag.
 *  - v : trait vertical rouge pointillé entre y1 et y2 à x (bord gauche/droit/centre)
 *  - h : trait horizontal rouge pointillé entre x1 et x2 à y (bord haut/bas/centre) */
type Guide =
  | { type: "v"; x: number; y1: number; y2: number }
  | { type: "h"; y: number; x1: number; x2: number };

function AlignGuides({ guides }: { guides: Guide[] }) {
  const { x: vpX, y: vpY, zoom } = useViewport();
  if (guides.length === 0) return null;
  const fx = (v: number) => Math.round(v * zoom + vpX);
  const fy = (v: number) => Math.round(v * zoom + vpY);
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 9999, overflow: "visible" }}>
      {guides.map((g, i) => {
        if (g.type === "v") {
          const sx = fx(g.x);
          return <line key={`v-${i}`} x1={sx} y1={fy(g.y1)} x2={sx} y2={fy(g.y2)}
            stroke="#e63946" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.9} />;
        }
        if (g.type === "h") {
          const sy = fy(g.y);
          return <line key={`h-${i}`} x1={fx(g.x1)} y1={sy} x2={fx(g.x2)} y2={sy}
            stroke="#e63946" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.9} />;
        }
        return null;
      })}
    </svg>
  );
}

const nodeTypes = { product: ProductNode, page: PageNode, text: TextNodeComponent, shape: ShapeNodeComponent, image: ImageNodeComponent };
const edgeTypes = { cable: CableEdge };

/** Largeur d'un nœud ReactFlow : measured > style explicit > fallback 150 px. */
const nodeW = (n: Node) =>
  n.measured?.width ??
  (typeof n.style?.width  === "number" ? n.style.width  : undefined) ?? 150;
/** Hauteur d'un nœud ReactFlow : measured > style explicit > fallback 80 px. */
const nodeH = (n: Node) =>
  n.measured?.height ??
  (typeof n.style?.height === "number" ? n.style.height : undefined) ?? 80;

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
  const pasteNodes = useAppStore((s) => s.pasteNodes);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const setSelectedCable = useAppStore((s) => s.setSelectedCable);
  const reverseCable = useAppStore((s) => s.reverseCable);
  const updateCable = useAppStore((s) => s.updateCable);
  const groups = useAppStore((s) => s.groups);
  const groupNodes = useAppStore((s) => s.groupNodes);
  const ungroupNodes = useAppStore((s) => s.ungroupNodes);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const selectedCableId = useAppStore((s) => s.selectedCableId);
  const readOnly = useEditorState((s) => s.readOnly);

  // ── Guides d'alignement (smart guides style Visio) ───────────────────────
  const SNAP_THRESHOLD = 8; // pixels flow
  const [guides, setGuides] = useState<Guide[]>([]);
  const snapTargetRef = useRef<{ x?: number; y?: number } | null>(null);

  // ── Sélection unifiée (tous types de nœuds) — non persistée dans le store ──
  // Un seul Set<string> gère la sélection de tous les types (produit, texte, forme, image).
  // Cela permet la multi-sélection native ReactFlow (Ctrl+clic / drag-select).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Ref stable pour accéder à selectedIds dans les callbacks/effects sans deps
  const selectedIdsRef = useRef<Set<string>>(selectedIds);
  selectedIdsRef.current = selectedIds;

  // Vrai si au moins un nœud sélectionné appartient à un groupe
  const selectedHasGroup = useMemo(
    () => groups.some((g) => g.nodeIds.some((id) => selectedIds.has(id))),
    [selectedIds, groups],
  );

  // Presse-papier pour copier-coller (ref = pas de re-render)
  const clipboardRef = useRef<{
    nodes: PlacedProduct[];
    textNodes: TextNodeData[];
    shapeNodes: ShapeNodeData[];
    imageNodes: ImageNodeData[];
  } | null>(null);
  const pasteCountRef = useRef(0); // décalage cumulatif à chaque Ctrl+V

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
      selected: selectedIds.has(tn.id),
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
      selected: selectedIds.has(sn.id),
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
      selected: selectedIds.has(img.id),
      zIndex: img.layer === "background" ? img.zOrder - 800 : 1500 + img.zOrder,
      style: { width: img.width, height: img.height },
    }));

    const bgImages = imageRfNodes.filter((n) => (n.data as unknown as { layer: string }).layer === "background");
    const fgImages = imageRfNodes.filter((n) => (n.data as unknown as { layer: string }).layer === "foreground");

    return [
      ...pages,
      ...shapeRfNodes,   // formes en arrière-plan (zIndex -1000 à ~-971)
      ...bgImages,       // images arrière-plan (zIndex -800+)
      ...nodes.map((n) => {
        // Injecter les dimensions mesurées dans l'objet ReactFlow pour que
        // nodeW / nodeH retournent les vraies tailles dans computeGuides.
        const ms = measuredNodeSizes.current.get(n.id);
        return {
          id: n.id,
          type: "product",
          position: n.position,
          data: { nodeId: n.id },
          selected: selectedIds.has(n.id),
          ...(ms ? { measured: ms } : {}),
        };
      }),
      ...fgImages,       // images premier plan (zIndex 1500+)
      ...textRfNodes,    // textes au premier plan (zIndex 2000)
    ];
  // measuredVersion : compteur incrémenté quand React Flow mesure un bloc produit
  // → force le recalcul des pages avec les vraies dimensions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, textNodes, shapeNodes, imageNodes, selectedIds, selectedNodeId, products, measuredVersion]);

  /** Calcule les guides d'alignement + la cible de snap pour une position candidate.
   *  Style Visio : bords gauche/droit/haut/bas (rouge pointillé, bornés).
   *  - 1er bloc correspondant sur l'axe X fixe le snap ET crée le guide.
   *  - Blocs suivants avec même bord à même X étendent les bornes du guide.
   *  - Idem sur l'axe Y indépendamment → H + V guides simultanés possibles. */
  const computeGuides = useCallback(
    (nodeId: string, position: { x: number; y: number }, dW: number, dH: number) => {
      const dL = position.x;
      const dR = position.x + dW;
      const dT = position.y;
      const dB = position.y + dH;

      const rawGuides: Guide[] = [];
      let snapX: number | undefined;
      let snapY: number | undefined;

      // Nœuds fixes : ni page, ni en cours de déplacement (ni membres du groupe glissé)
      const fixed = rfNodes.filter(
        (n) => n.type !== "page" && !selectedIdsRef.current.has(n.id) && n.id !== nodeId,
      );

      const MARGIN = 25; // extension visuelle de la ligne au-delà des blocs (px flow)

      // Références mutables vers les guides actifs pour l'extension de bornes
      let vGuide: { type: "v"; x: number; y1: number; y2: number } | null = null;
      let hGuide: { type: "h"; y: number; x1: number; x2: number } | null = null;

      // ── Phase 1 : alignement par les bords ─────────────────────────────────
      for (const o of fixed) {
        const oW = nodeW(o);
        const oH = nodeH(o);
        const oL = o.position.x;
        const oR = oL + oW;
        const oT = o.position.y;
        const oB = oT + oH;

        // Bornes du guide : union des deux blocs ± marge
        const yMin = Math.min(dT, oT) - MARGIN;
        const yMax = Math.max(dB, oB) + MARGIN;
        const xMin = Math.min(dL, oL) - MARGIN;
        const xMax = Math.max(dR, oR) + MARGIN;

        // ── Axe X (guides verticaux) ──────────────────────────────────────
        if (snapX === undefined) {
          // 1ère correspondance : crée le guide et fixe le snap
          if (Math.abs(dL - oL) < SNAP_THRESHOLD) {
            snapX = oL;
            vGuide = { type: "v", x: oL, y1: yMin, y2: yMax };
            rawGuides.push(vGuide);
          } else if (Math.abs(dR - oR) < SNAP_THRESHOLD) {
            snapX = oR - dW;
            vGuide = { type: "v", x: oR, y1: yMin, y2: yMax };
            rawGuides.push(vGuide);
          } else if (Math.abs(dR - oL) < SNAP_THRESHOLD) {
            snapX = oL - dW;
            vGuide = { type: "v", x: oL, y1: yMin, y2: yMax };
            rawGuides.push(vGuide);
          } else if (Math.abs(dL - oR) < SNAP_THRESHOLD) {
            snapX = oR;
            vGuide = { type: "v", x: oR, y1: yMin, y2: yMax };
            rawGuides.push(vGuide);
          } else if (Math.abs((dL + dR) / 2 - (oL + oR) / 2) < SNAP_THRESHOLD) {
            // Centre↔Centre X (priorité basse)
            snapX = (oL + oR) / 2 - dW / 2;
            vGuide = { type: "v", x: (oL + oR) / 2, y1: yMin, y2: yMax };
            rawGuides.push(vGuide);
          }
        } else if (vGuide) {
          // Snap X déjà fixé : étendre le guide si ce bloc partage la même position X
          if (Math.abs(oL - vGuide.x) < 1 || Math.abs(oR - vGuide.x) < 1) {
            vGuide.y1 = Math.min(vGuide.y1, oT - MARGIN);
            vGuide.y2 = Math.max(vGuide.y2, oB + MARGIN);
          }
        }

        // ── Axe Y (guides horizontaux) — indépendant de l'axe X ──────────
        if (snapY === undefined) {
          if (Math.abs(dT - oT) < SNAP_THRESHOLD) {
            snapY = oT;
            hGuide = { type: "h", y: oT, x1: xMin, x2: xMax };
            rawGuides.push(hGuide);
          } else if (Math.abs(dB - oB) < SNAP_THRESHOLD) {
            snapY = oB - dH;
            hGuide = { type: "h", y: oB, x1: xMin, x2: xMax };
            rawGuides.push(hGuide);
          } else if (Math.abs(dB - oT) < SNAP_THRESHOLD) {
            snapY = oT - dH;
            hGuide = { type: "h", y: oT, x1: xMin, x2: xMax };
            rawGuides.push(hGuide);
          } else if (Math.abs(dT - oB) < SNAP_THRESHOLD) {
            snapY = oB;
            hGuide = { type: "h", y: oB, x1: xMin, x2: xMax };
            rawGuides.push(hGuide);
          } else if (Math.abs((dT + dB) / 2 - (oT + oB) / 2) < SNAP_THRESHOLD) {
            // Centre↔Centre Y (priorité basse)
            snapY = (oT + oB) / 2 - dH / 2;
            hGuide = { type: "h", y: (oT + oB) / 2, x1: xMin, x2: xMax };
            rawGuides.push(hGuide);
          }
        } else if (hGuide) {
          // Snap Y déjà fixé : étendre le guide si ce bloc partage la même position Y
          if (Math.abs(oT - hGuide.y) < 1 || Math.abs(oB - hGuide.y) < 1) {
            hGuide.x1 = Math.min(hGuide.x1, oL - MARGIN);
            hGuide.x2 = Math.max(hGuide.x2, oR + MARGIN);
          }
        }
      }

      return {
        guides: rawGuides,
        snap: snapX !== undefined || snapY !== undefined ? { x: snapX, y: snapY } : null,
      };
    },
    // nodeW / nodeH sont des fonctions module-level stables
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rfNodes, SNAP_THRESHOLD],
  );

  // ── Drag natif React Flow : smart guides sur tous les types de nœuds ────────
  const onNodeDrag = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (node.type === "page") return;
      // Suspendre l'historique pendant le drag pour ne pas enregistrer
      // chaque position intermédiaire (une seule entrée au drag-stop).
      useAppStore.temporal.getState().pause();
      const dW = nodeW(node);
      const dH = nodeH(node);
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
      if (snap && node.type !== "page") {
        const finalPos = {
          x: snap.x !== undefined ? snap.x : node.position.x,
          y: snap.y !== undefined ? snap.y : node.position.y,
        };
        if (node.type === "text")       updateTextNode(node.id, { position: finalPos });
        else if (node.type === "shape") updateShapeNode(node.id, { position: finalPos });
        else if (node.type === "image") updateImageNode(node.id, { position: finalPos });
        else                            updateNode(node.id, { position: finalPos }); // product
      }
      snapTargetRef.current = null;
      setGuides([]);
      // Reprendre l'historique : la position finale est enregistrée ici
      useAppStore.temporal.getState().resume();
    },
    [updateNode, updateTextNode, updateShapeNode, updateImageNode],
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
          // Mise à jour du Set unifié (tous types de nœuds).
          // Si le nœud sélectionné appartient à un groupe, on étend la sélection
          // à tous les membres du groupe pour que ReactFlow les déplace ensemble.
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (change.selected) {
              next.add(change.id);
              const grp = useAppStore.getState().groups.find((g) => g.nodeIds.includes(change.id));
              if (grp) {
                for (const id of grp.nodeIds) next.add(id);
              }
            } else {
              next.delete(change.id);
            }
            return next;
          });
          // Maintenir selectedNodeId dans le store pour les blocs produit
          // (utilisé par InstancePortsConfig et le zone-picker au double-clic)
          if (isProduct) {
            setSelectedNode(change.selected ? change.id : null);
          }
        }
      }
    },
    [rfNodes, nodes, textNodes, shapeNodes, imageNodes, updateNode, updateTextNode, updateShapeNode, updateImageNode, removeNode, removeTextNode, removeShapeNode, setSelectedNode, setSelectedIds],
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

      // ── Connexion impliquant un bloc forme ───────────────────────────────
      const isShapeSource = (shapeNodes ?? []).some((sn) => sn.id === conn.source);
      const isShapeTarget = (shapeNodes ?? []).some((sn) => sn.id === conn.target);
      if (isShapeSource || isShapeTarget) {
        // Récupère le signal depuis le port produit si l'autre extrémité en est un
        let signal: SignalType = "";
        if (!isShapeSource) {
          const fromNode = nodes.find((n) => n.id === conn.source);
          const fromProduct = fromNode?.isBlankBlock ? BLANK_PRODUCT : products.find((p) => p.id === fromNode?.productId);
          const fromPort = findEffectivePort(fromProduct, fromNode, from.portId);
          if (fromPort) signal = fromPort.signal;
        } else if (!isShapeTarget) {
          const toNode = nodes.find((n) => n.id === conn.target);
          const toProduct = toNode?.isBlankBlock ? BLANK_PRODUCT : products.find((p) => p.id === toNode?.productId);
          const toPort = findEffectivePort(toProduct, toNode, to.portId);
          if (toPort) signal = toPort.signal;
        }
        addCable({
          fromNodeId: conn.source,
          fromPortId: from.portId,
          fromPortSide: from.side,
          toNodeId: conn.target,
          toPortId: to.portId,
          toPortSide: to.side,
          signal,
        });
        return;
      }

      // ── Connexion normale entre produits ─────────────────────────────────
      const fromNode = nodes.find((n) => n.id === conn.source);
      const toNode = nodes.find((n) => n.id === conn.target);
      if (!fromNode || !toNode) return;
      const fromProduct = fromNode.isBlankBlock ? BLANK_PRODUCT : products.find((p) => p.id === fromNode.productId);
      const toProduct   = toNode.isBlankBlock   ? BLANK_PRODUCT : products.find((p) => p.id === toNode.productId);
      const fromPort = findEffectivePort(fromProduct, fromNode, from.portId);
      const toPort   = findEffectivePort(toProduct,   toNode,   to.portId);
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
    [nodes, products, signals, shapeNodes, addCable, showCompatError],
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
  // La sélection (selectedIds) est vidée via les events select:false de ReactFlow
  // qui transitent par onNodesChange → setSelectedIds.
  const onPaneClick = useCallback(() => {
    window.dispatchEvent(new CustomEvent("exitTextEdit"));
    setSelectedIds(new Set());
    setSelectedNode(null);
  }, [setSelectedNode]);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!newConnection.source || !newConnection.target) return;
      const from = parseHandle(newConnection.sourceHandle);
      const to = parseHandle(newConnection.targetHandle);
      if (!from || !to) return;

      // ── Reconnexion impliquant un bloc forme ─────────────────────────────
      const isShapeSource = (shapeNodes ?? []).some((sn) => sn.id === newConnection.source);
      const isShapeTarget = (shapeNodes ?? []).some((sn) => sn.id === newConnection.target);
      if (isShapeSource || isShapeTarget) {
        let signal: SignalType = "";
        if (!isShapeSource) {
          const fromNode = nodes.find((n) => n.id === newConnection.source);
          const fromProduct = fromNode?.isBlankBlock ? BLANK_PRODUCT : products.find((p) => p.id === fromNode?.productId);
          const fromPort = findEffectivePort(fromProduct, fromNode, from.portId);
          if (fromPort) signal = fromPort.signal;
        } else if (!isShapeTarget) {
          const toNode = nodes.find((n) => n.id === newConnection.target);
          const toProduct = toNode?.isBlankBlock ? BLANK_PRODUCT : products.find((p) => p.id === toNode?.productId);
          const toPort = findEffectivePort(toProduct, toNode, to.portId);
          if (toPort) signal = toPort.signal;
        }
        updateCable(oldEdge.id, {
          fromNodeId: newConnection.source,
          fromPortId: from.portId,
          fromPortSide: from.side,
          toNodeId: newConnection.target,
          toPortId: to.portId,
          toPortSide: to.side,
          signal,
          waypoints: [],
        });
        return;
      }

      // ── Reconnexion normale entre produits ───────────────────────────────
      const fromNode = nodes.find((n) => n.id === newConnection.source);
      const toNode   = nodes.find((n) => n.id === newConnection.target);
      if (!fromNode || !toNode) return;
      const fromProduct = fromNode.isBlankBlock ? BLANK_PRODUCT : products.find((p) => p.id === fromNode.productId);
      const toProduct   = toNode.isBlankBlock   ? BLANK_PRODUCT : products.find((p) => p.id === toNode.productId);
      const fromPort = findEffectivePort(fromProduct, fromNode, from.portId);
      const toPort   = findEffectivePort(toProduct,   toNode,   to.portId);
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
    [nodes, products, signals, shapeNodes, updateCable, showCompatError],
  );

  // ── Mise à jour de position par type de nœud ─────────────────────────────
  const updateNodeByType = useCallback(
    (id: string, type: string | undefined, pos: { x: number; y: number }) => {
      const position = { x: Math.round(pos.x), y: Math.round(pos.y) };
      if (type === "text")        updateTextNode(id, { position });
      else if (type === "shape")  updateShapeNode(id, { position });
      else if (type === "image")  updateImageNode(id, { position });
      else                        updateNode(id, { position });
    },
    [updateNode, updateTextNode, updateShapeNode, updateImageNode],
  );

  // ── Alignement multi-sélection ────────────────────────────────────────────
  const handleAlign = useCallback(
    (dir: "left" | "center-x" | "right" | "top" | "center-y" | "bottom" | "dist-x" | "dist-y") => {
      const ids = selectedIdsRef.current;
      if (ids.size < 2) return;

      const selected = rfNodes.filter((n) => ids.has(n.id) && n.type !== "page");
      if (selected.length < 2) return;

      const boxes = selected.map((n) => ({
        id: n.id,
        type: n.type,
        x: n.position.x,
        y: n.position.y,
        w: n.measured?.width  ?? 150,
        h: n.measured?.height ?? 80,
      }));

      const minX = Math.min(...boxes.map((b) => b.x));
      const maxX = Math.max(...boxes.map((b) => b.x + b.w));
      const minY = Math.min(...boxes.map((b) => b.y));
      const maxY = Math.max(...boxes.map((b) => b.y + b.h));

      if (dir === "dist-x" && boxes.length >= 2) {
        const sorted = [...boxes].sort((a, b) => a.x - b.x);
        const totalW = sorted.reduce((s, b) => s + b.w, 0);
        // gap ≥ 0 : on ne laisse jamais les blocs se chevaucher
        const gap = Math.max(8, (maxX - minX - totalW) / (sorted.length - 1));
        let curX = minX;
        for (const b of sorted) {
          updateNodeByType(b.id, b.type, { x: curX, y: b.y });
          curX += b.w + gap;
        }
        return;
      }
      if (dir === "dist-y" && boxes.length >= 2) {
        const sorted = [...boxes].sort((a, b) => a.y - b.y);
        const totalH = sorted.reduce((s, b) => s + b.h, 0);
        // gap ≥ 0 : on ne laisse jamais les blocs se chevaucher
        const gap = Math.max(0, (maxY - minY - totalH) / (sorted.length - 1));
        let curY = minY;
        for (const b of sorted) {
          updateNodeByType(b.id, b.type, { x: b.x, y: curY });
          curY += b.h + gap;
        }
        return;
      }

      for (const b of boxes) {
        let nx = b.x, ny = b.y;
        switch (dir) {
          case "left":     nx = minX; break;
          case "right":    nx = maxX - b.w; break;
          case "center-x": nx = (minX + maxX) / 2 - b.w / 2; break;
          case "top":      ny = minY; break;
          case "bottom":   ny = maxY - b.h; break;
          case "center-y": ny = (minY + maxY) / 2 - b.h / 2; break;
        }
        if (nx !== b.x || ny !== b.y) updateNodeByType(b.id, b.type, { x: nx, y: ny });
      }
    },
    [rfNodes, updateNodeByType],
  );

  // ── Copier / Coller ───────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.size === 0) return;
    const s = useAppStore.getState();
    clipboardRef.current = {
      nodes:      s.nodes.filter((n) => ids.has(n.id)),
      textNodes:  s.textNodes.filter((n) => ids.has(n.id)),
      shapeNodes: (s.shapeNodes ?? []).filter((n) => ids.has(n.id)),
      imageNodes: (s.imageNodes ?? []).filter((n) => ids.has(n.id)),
    };
    pasteCountRef.current = 0; // réinitialise le décalage
  }, []);

  const handlePaste = useCallback(() => {
    const cb = clipboardRef.current;
    if (!cb) return;
    const total = cb.nodes.length + cb.textNodes.length + cb.shapeNodes.length + cb.imageNodes.length;
    if (total === 0) return;
    pasteCountRef.current += 1;
    const offset = pasteCountRef.current * 30;
    pasteNodes({ ...cb, offsetX: offset, offsetY: offset });
  }, [pasteNodes]);

  // ── Grouper / Dégrouper ───────────────────────────────────────────────────
  const handleGroup = useCallback(() => {
    const ids = Array.from(selectedIdsRef.current);
    if (ids.length < 2) return;
    groupNodes(ids);
  }, [groupNodes]);

  const handleUngroup = useCallback(() => {
    const currentGroups = useAppStore.getState().groups;
    const groupIdsToRemove = new Set<string>();
    for (const id of selectedIdsRef.current) {
      const g = currentGroups.find((grp) => grp.nodeIds.includes(id));
      if (g) groupIdsToRemove.add(g.id);
    }
    for (const gId of groupIdsToRemove) {
      ungroupNodes(gId);
    }
  }, [ungroupNodes]);

  // ── Raccourcis clavier globaux ────────────────────────────────────────────
  // Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo, Ctrl+C = copier, Ctrl+V = coller
  // On utilise des refs pour éviter de recréer l'écouteur à chaque render.
  const readOnlyRef      = useRef(readOnly);
  const handleCopyRef    = useRef(handleCopy);
  const handlePasteRef   = useRef(handlePaste);
  const handleGroupRef   = useRef(handleGroup);
  const handleUngroupRef = useRef(handleUngroup);
  readOnlyRef.current      = readOnly;
  handleCopyRef.current    = handleCopy;
  handlePasteRef.current   = handlePaste;
  handleGroupRef.current   = handleGroup;
  handleUngroupRef.current = handleUngroup;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (readOnlyRef.current) return;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.ctrlKey && !e.shiftKey && e.key === "z") {
        if (isInput) return;
        e.preventDefault();
        useAppStore.temporal.getState().undo();
      } else if ((e.ctrlKey && e.key === "y") || (e.ctrlKey && e.shiftKey && e.key === "z")) {
        if (isInput) return;
        e.preventDefault();
        useAppStore.temporal.getState().redo();
      } else if (e.ctrlKey && !e.shiftKey && e.key === "c") {
        if (isInput) return;
        handleCopyRef.current();
      } else if (e.ctrlKey && !e.shiftKey && e.key === "v") {
        if (isInput) return;
        e.preventDefault();
        handlePasteRef.current();
      } else if (e.ctrlKey && !e.shiftKey && e.key === "g") {
        if (isInput) return;
        e.preventDefault();
        handleGroupRef.current();
      } else if (e.ctrlKey && e.shiftKey && (e.key === "g" || e.key === "G")) {
        if (isInput) return;
        e.preventDefault();
        handleUngroupRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // stable grâce aux refs

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

      {/* ── Barre d'outils multi-sélection ─────────────────────────────────── */}
      {!readOnly && selectedIds.size > 1 && (
        <div className="multiselect-toolbar">
          <span className="multiselect-count">{selectedIds.size} sélectionnés</span>
          <div className="multiselect-sep" />
          <button onClick={() => handleAlign("center-y")} title="Aligner horizontalement (même axe Y)">≡</button>
          <button onClick={() => handleAlign("center-x")} title="Aligner verticalement (même axe X)">⦀</button>
          <div className="multiselect-sep" />
          <button onClick={() => handleAlign("dist-x")} title="Espacer horizontalement (gaps égaux)">⇔</button>
          <button onClick={() => handleAlign("dist-y")} title="Espacer verticalement (gaps égaux)">⇕</button>
          <div className="multiselect-sep" />
          <button onClick={handleCopy}   title="Copier (Ctrl+C)">⧉</button>
          <div className="multiselect-sep" />
          <button onClick={handleGroup}  title="Grouper (Ctrl+G)">⊞ Grouper</button>
          {selectedHasGroup && (
            <button onClick={handleUngroup} title="Dégrouper (Ctrl+Shift+G)">⊟ Dégrouper</button>
          )}
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
        multiSelectionKeyCode={readOnly ? null : "Control"}
        selectionOnDrag={!readOnly}
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

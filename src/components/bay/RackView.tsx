import { useRef, useState } from "react";
import type { Rack, RackItem, Tab } from "../../types";
import { useAppStore } from "../../store";
import { getDragItem, clearDragItem } from "./BayProductLibrary";
import { placementProblem, uLabel as displayedU } from "../../lib/rackLayout";
import { notify } from "../dialogs/dialogStore";

const U_PX = 44;
const RACK_INNER_WIDTH_19 = 400;
const RACK_INNER_WIDTH_10 = 200;
const EAR_WIDTH = 28;
const U_LABEL_WIDTH = 32;


interface RackViewProps {
  tab: Tab;
  rack: Rack;
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  onRackClick: () => void;
  canDelete: boolean;
  onDeleteRack: () => void;
  /** Ouvre la modification de la baie (nom, format, hauteur, numérotation). */
  onEditRack?: () => void;
  isActive: boolean;
  readOnly?: boolean;
  /** Identifiants des nœuds encore présents dans les synoptiques (équipements orphelins). */
  synopticNodeIds?: Set<string>;
}

export function RackView({ tab, rack, selectedItemId, onSelectItem, onRackClick, canDelete, onDeleteRack, onEditRack, isActive, readOnly = false, synopticNodeIds }: RackViewProps) {
  const addRackItem = useAppStore((s) => s.addRackItem);
  const updateRackItem = useAppStore((s) => s.updateRackItem);
  const renameRack = useAppStore((s) => s.renameRack);
  const products = useAppStore((s) => s.products);
  const rackSizeOf = (productId?: string) => products.find((p) => p.id === productId)?.rackSize;

  const heightU = rack.heightU;
  const widthInch = rack.widthInch;
  const items = rack.items;
  const innerWidth = widthInch === 19 ? RACK_INNER_WIDTH_19 : RACK_INNER_WIDTH_10;
  const colWidth = innerWidth / 4;
  const rackH = heightU * U_PX;

  // ── Drag state (for moving items already in rack) ────────────────────────
  const [dragOverU, setDragOverU] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number>(0);
  // Aperçu de dépôt en rouge quand l'emplacement survolé est refusé.
  const [dragOverInvalid, setDragOverInvalid] = useState(false);
  // Ref synchrone + state pour draggingId (évite les stales closures dans dragover)
  const draggingIdRef = useRef<string | null>(null);
  const [draggingId, _setDraggingId] = useState<string | null>(null);
  const setDraggingId = (id: string | null) => {
    draggingIdRef.current = id;
    _setDraggingId(id);
  };
  const rackRef = useRef<HTMLDivElement>(null);

  /** Calcule uStart (compté depuis le bas, quelle que soit la numérotation affichée)
   *  et colStart depuis les coordonnées souris : le haut de l'équipement suit le pointeur. */
  const posFromEvent = (e: React.DragEvent, itemHeightU: number, itemWidthCols: number): { uStart: number; colStart: 0 | 1 | 2 | 3 } => {
    const rect = rackRef.current!.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const relX = e.clientX - rect.left - U_LABEL_WIDTH;

    // U from top (0-indexed)
    const uFromTop = Math.max(0, Math.min(heightU - itemHeightU, Math.floor(relY / U_PX)));
    // uStart from bottom
    const uStart = Math.max(1, heightU - uFromTop - itemHeightU + 1);

    // Column
    const rawCol = Math.floor(relX / colWidth);
    const clampedCol = Math.max(0, Math.min(4 - itemWidthCols, rawCol)) as 0 | 1 | 2 | 3;

    return { uStart, colStart: clampedCol };
  };

  // ── Drop from library ────────────────────────────────────────────────────
  // Aperçu et pose calculés par la même fonction (posFromEvent) : l'aperçu montre
  // exactement l'emplacement où l'équipement sera posé.
  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const dragItem = getDragItem();
    if (!dragItem || !rackRef.current) return;
    const { uStart, colStart } = posFromEvent(e, dragItem.heightU, dragItem.widthCols);
    setDragOverU(uStart);
    setDragOverCol(colStart);
    setDragOverInvalid(!!placementProblem(rack, { ...dragItem, uStart, colStart }, undefined, rackSizeOf(dragItem.productId)));
  };

  const handleDragLeave = () => {
    setDragOverU(null);
    setDragOverInvalid(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    setDragOverU(null);
    setDragOverInvalid(false);
    const dragItem = getDragItem();
    clearDragItem();
    if (!dragItem) return;

    const { uStart, colStart } = posFromEvent(e, dragItem.heightU, dragItem.widthCols);
    const candidate: Omit<RackItem, "id"> = { ...dragItem, uStart, colStart };
    const problem = placementProblem(rack, candidate, undefined, rackSizeOf(dragItem.productId));
    if (problem) { notify(problem, "error"); return; }
    addRackItem(tab.id, candidate, rack.id);
  };

  // ── Drag item within rack ────────────────────────────────────────────────
  const handleItemDragStart = (e: React.DragEvent, item: RackItem) => {
    if (readOnly || item.locked) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(item.id);
    // Provide drag data (ghost image handled by browser)
  };

  const handleItemDragEnd = () => {
    setDraggingId(null);
    setDragOverU(null);
    setDragOverCol(0);
    setDragOverInvalid(false);
  };

  const handleRackDragOver = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    const currentDragging = draggingIdRef.current;
    if (!currentDragging) { handleDragOver(e); return; }
    const item = items.find((it) => it.id === currentDragging);
    if (!item) return;
    const { uStart, colStart } = posFromEvent(e, item.heightU, item.widthCols);
    setDragOverU(uStart);
    setDragOverCol(colStart);
    setDragOverInvalid(!!placementProblem(rack, { ...item, uStart, colStart }, item.id, rackSizeOf(item.productId)));
  };

  const handleRackDrop = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    const currentDragging = draggingIdRef.current;
    if (!currentDragging) { handleDrop(e); return; }
    const item = items.find((it) => it.id === currentDragging);
    if (!item) { setDraggingId(null); return; }
    const { uStart, colStart } = posFromEvent(e, item.heightU, item.widthCols);

    const candidate: RackItem = { ...item, uStart, colStart };
    const problem = placementProblem(rack, candidate, item.id, rackSizeOf(item.productId));
    if (problem) notify(problem, "error");
    else updateRackItem(tab.id, currentDragging, { uStart, colStart });
    setDraggingId(null);
    setDragOverU(null);
    setDragOverInvalid(false);
  };

  /** Décalage CSS depuis le haut : uStart est toujours compté depuis le bas (U1 = U du
   *  bas) ; la numérotation choisie ne change que les numéros affichés. */
  const itemTop = (item: RackItem): number => (heightU - item.uStart - item.heightU + 1) * U_PX;

  const itemLeft = (item: RackItem): number => item.colStart * colWidth;
  const itemWidth = (item: RackItem): number => item.widthCols * colWidth;
  const itemHeight = (item: RackItem): number => item.heightU * U_PX;

  /** Numéro affiché sur le repère U de la ligne `slotIndex` (0 = ligne du haut). */
  const uLabel = (slotIndex: number): number => displayedU(rack, heightU - slotIndex);

  return (
    <div
      className={`bay-rack-wrapper${isActive ? " rack-active" : ""}`}
      onClick={onRackClick}
    >
      {/* Titre encadré aligné avec le cadre de la baie — nom éditable */}
      <div
        className="bay-rack-tab-name"
        style={{ marginLeft: U_LABEL_WIDTH, width: innerWidth + EAR_WIDTH * 2 }}
      >
        <input
          className="rack-name-input"
          value={rack.name}
          onChange={readOnly ? undefined : (e) => renameRack(tab.id, rack.id, e.target.value)}
          readOnly={readOnly}
          onClick={(e) => e.stopPropagation()}
          placeholder="Nom de la baie"
          title={readOnly ? rack.name : "Cliquer pour renommer la baie"}
          style={readOnly ? { cursor: "default", pointerEvents: "none" } : undefined}
        />
        {!readOnly && onEditRack && (
          <button
            className="rack-edit-btn"
            title="Modifier la baie (format, hauteur, numérotation)"
            aria-label="Modifier la baie"
            onClick={(e) => { e.stopPropagation(); onEditRack(); }}
          >⚙</button>
        )}
        {canDelete && (
          <button
            className="rack-delete-btn"
            title="Supprimer cette baie"
            aria-label="Supprimer cette baie"
            onClick={(e) => { e.stopPropagation(); onDeleteRack(); }}
          >×</button>
        )}
      </div>

      <div
        className="bay-rack-view"
        style={{ width: innerWidth + EAR_WIDTH * 2 + U_LABEL_WIDTH }}
      >
        {/* U number labels */}
        <div className="rack-u-labels" style={{ height: rackH, width: U_LABEL_WIDTH }}>
          {Array.from({ length: heightU }, (_, i) => (
            <div key={i} className="rack-u-label" style={{ height: U_PX }}>
              {uLabel(i)}
            </div>
          ))}
        </div>

        {/* Rack frame */}
        <div className="rack-frame" style={{ width: innerWidth + EAR_WIDTH * 2 }}>
          {/* Left ear */}
          <div className="rack-ear rack-ear-left" style={{ width: EAR_WIDTH, height: rackH }}>
            {Array.from({ length: heightU }, (_, i) => (
              <div key={i} className="rack-ear-hole" style={{ height: U_PX }} />
            ))}
          </div>

          {/* Inner rack (items area) */}
          <div
            ref={rackRef}
            className="rack-inner"
            style={{ width: innerWidth, height: rackH }}
            onDragOver={handleRackDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleRackDrop}
            onClick={() => onSelectItem(null)}
          >
            {/* U slot grid lines */}
            {Array.from({ length: heightU }, (_, i) => (
              <div
                key={i}
                className="rack-slot-line"
                style={{ top: i * U_PX, height: U_PX, width: innerWidth }}
              />
            ))}

            {/* Drop preview highlight */}
            {dragOverU !== null && (() => {
              const libItem = getDragItem();
              const rackItem = draggingIdRef.current
                ? items.find((it) => it.id === draggingIdRef.current)
                : null;
              const previewH = libItem?.heightU ?? rackItem?.heightU ?? 1;
              const previewW = libItem?.widthCols ?? rackItem?.widthCols ?? 4;
              return (
                <div
                  className={`rack-drop-preview${dragOverInvalid ? " invalid" : ""}`}
                  style={{
                    top: (heightU - dragOverU - previewH + 1) * U_PX,
                    left: dragOverCol * colWidth,
                    height: previewH * U_PX,
                    width: previewW * colWidth,
                  }}
                />
              );
            })()}

            {/* Items */}
            {items.map((item) => (
              <RackItemCard
                key={item.id}
                item={item}
                selected={item.id === selectedItemId}
                dragging={item.id === draggingId}
                top={itemTop(item)}
                left={itemLeft(item)}
                width={itemWidth(item)}
                height={itemHeight(item)}
                readOnly={readOnly}
                orphan={item.sourceType === "synoptic" && !!item.nodeId && !!synopticNodeIds && !synopticNodeIds.has(item.nodeId)}
                displayedUStart={displayedU(rack, item.uStart)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectItem(item.id === selectedItemId ? null : item.id);
                }}
                onDragStart={(e) => handleItemDragStart(e, item)}
                onDragEnd={handleItemDragEnd}
              />
            ))}
          </div>

          {/* Right ear */}
          <div className="rack-ear rack-ear-right" style={{ width: EAR_WIDTH, height: rackH }}>
            {Array.from({ length: heightU }, (_, i) => (
              <div key={i} className="rack-ear-hole" style={{ height: U_PX }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Item card ────────────────────────────────────────────────────────────────

interface RackItemCardProps {
  item: RackItem;
  selected: boolean;
  dragging: boolean;
  top: number;
  left: number;
  width: number;
  height: number;
  readOnly?: boolean;
  /** Équipement d'un synoptique dont le produit n'est plus sur aucun synoptique. */
  orphan?: boolean;
  /** Numéro du U du bas, selon la numérotation de la baie. */
  displayedUStart: number;
  onClick: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

function RackItemCard({ item, selected, dragging, top, left, width, height, readOnly = false, orphan = false, displayedUStart, onClick, onDragStart, onDragEnd }: RackItemCardProps) {
  const bg = item.color ?? "#3a3d44";
  const textColor = isLightHex(bg) ? "#1c1f24" : "#ffffff";

  const hasAnnotation =
    item.annotations &&
    Object.values(item.annotations).some((v) => v && v.trim() !== "");


  return (
    <div
      className={`rack-item${selected ? " selected" : ""}${dragging ? " dragging" : ""}${item.locked ? " locked" : ""}${orphan ? " orphan" : ""}`}
      style={{
        position: "absolute",
        top,
        left,
        width,
        height,
        background: bg,
        color: textColor,
        borderColor: selected ? "#4da6ff" : "rgba(255,255,255,0.15)",
      }}
      draggable={!readOnly && !item.locked}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={`${item.manufacturer ?? ""} ${item.reference ?? ""} — U${displayedUStart} (${item.heightU}U)${orphan ? " — absent des synoptiques" : ""}`}
    >
      {/* Logo en haut à droite */}
      {item.logoUrl && (
        <img
          src={item.logoUrl}
          alt=""
          className="rack-item-logo"
          draggable={false}
        />
      )}
      <div className="rack-item-inner">
        <div className="rack-item-name">
          {item.label || item.reference || "—"}
        </div>
        <div className="rack-item-sub">
          {[item.manufacturer, item.reference].filter(Boolean).join(" ")}
        </div>
        <div className="rack-item-badges">
          {item.locked && <span className="rack-badge" title="Verrouillé">🔒</span>}
          {orphan && <span className="rack-badge rack-badge-orphan" title="Ce produit n'est plus sur aucun synoptique">⚠ orphelin</span>}
          {hasAnnotation && <span className="rack-badge" title="Annoté">📋</span>}
        </div>
      </div>
      {/* Height label */}
      <div className="rack-item-u">{item.heightU}U</div>
    </div>
  );
}

function isLightHex(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return false;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}

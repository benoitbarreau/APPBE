import { useMemo, useRef, useState } from "react";
import type { RackItem, Tab } from "../../types";
import { isSynopticTab } from "../../types";
import { useAppStore } from "../../store";
import { getDragItem, clearDragItem } from "./BayProductLibrary";

const U_PX = 44;
const RACK_INNER_WIDTH_19 = 400;
const RACK_INNER_WIDTH_10 = 200;
const EAR_WIDTH = 28;
const U_LABEL_WIDTH = 32;

/** Détecte la collision entre deux items. */
function collides(a: RackItem, b: RackItem): boolean {
  const uOver = a.uStart < b.uStart + b.heightU && b.uStart < a.uStart + a.heightU;
  const cOver = a.colStart < b.colStart + b.widthCols && b.colStart < a.colStart + a.widthCols;
  return uOver && cOver;
}


interface RackViewProps {
  tab: Tab;
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
}

export function RackView({ tab, selectedItemId, onSelectItem }: RackViewProps) {
  const addRackItem = useAppStore((s) => s.addRackItem);
  const updateRackItem = useAppStore((s) => s.updateRackItem);

  const heightU = tab.bayHeightU ?? 42;
  const widthInch = tab.bayWidthInch ?? 19;
  const fromBottom = tab.bayNumberingFromBottom !== false;
  const items = tab.bayItems ?? [];
  const innerWidth = widthInch === 19 ? RACK_INNER_WIDTH_19 : RACK_INNER_WIDTH_10;
  const colWidth = innerWidth / 4;
  const rackH = heightU * U_PX;

  // ── Drag state (for moving items already in rack) ────────────────────────
  const [dragOverU, setDragOverU] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number>(0);
  // Ref synchrone + state pour draggingId (évite les stales closures dans dragover)
  const draggingIdRef = useRef<string | null>(null);
  const [draggingId, _setDraggingId] = useState<string | null>(null);
  const setDraggingId = (id: string | null) => {
    draggingIdRef.current = id;
    _setDraggingId(id);
  };
  const rackRef = useRef<HTMLDivElement>(null);

  /** Calcule uStart et colStart depuis les coordonnées souris relatives au rack. */
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
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const dragItem = getDragItem();
    if (!dragItem) return;
    const rect = rackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relY = e.clientY - rect.top;
    const uFromTop = Math.max(0, Math.min(heightU - 1, Math.floor(relY / U_PX)));
    const uStart = fromBottom ? heightU - uFromTop : uFromTop + 1;
    setDragOverU(uStart);
  };

  const handleDragLeave = () => {
    setDragOverU(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverU(null);
    const dragItem = getDragItem();
    clearDragItem();
    if (!dragItem) return;

    const { uStart, colStart } = posFromEvent(e, dragItem.heightU, dragItem.widthCols);
    const candidate: Omit<RackItem, "id"> = { ...dragItem, uStart, colStart };

    // Collision check
    const hasCollision = items.some((it) =>
      it.id !== draggingId && collides(candidate as RackItem, it),
    );
    if (hasCollision) return;

    addRackItem(tab.id, candidate);
  };

  // ── Drag item within rack ────────────────────────────────────────────────
  const handleItemDragStart = (e: React.DragEvent, item: RackItem) => {
    if (item.locked) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(item.id);
    // Provide drag data (ghost image handled by browser)
  };

  const handleItemDragEnd = () => {
    setDraggingId(null);
    setDragOverU(null);
    setDragOverCol(0);
  };

  const handleRackDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const currentDragging = draggingIdRef.current;
    if (!currentDragging) { handleDragOver(e); return; }
    const item = items.find((it) => it.id === currentDragging);
    if (!item) return;
    const { uStart, colStart } = posFromEvent(e, item.heightU, item.widthCols);
    setDragOverU(uStart);
    setDragOverCol(colStart);
  };

  const handleRackDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const currentDragging = draggingIdRef.current;
    if (!currentDragging) { handleDrop(e); return; }
    const item = items.find((it) => it.id === currentDragging);
    if (!item) { setDraggingId(null); return; }
    const { uStart, colStart } = posFromEvent(e, item.heightU, item.widthCols);

    const candidate: RackItem = { ...item, uStart, colStart };
    const hasCollision = items.some((it) => it.id !== currentDragging && collides(candidate, it));
    if (!hasCollision) {
      updateRackItem(tab.id, currentDragging, { uStart, colStart });
    }
    setDraggingId(null);
    setDragOverU(null);
  };

  /** Convertit uStart (1-indexed from bottom when fromBottom) to CSS top offset. */
  const itemTop = (item: RackItem): number => {
    if (fromBottom) {
      return (heightU - item.uStart - item.heightU + 1) * U_PX;
    }
    return (item.uStart - 1) * U_PX;
  };

  const itemLeft = (item: RackItem): number => item.colStart * colWidth;
  const itemWidth = (item: RackItem): number => item.widthCols * colWidth;
  const itemHeight = (item: RackItem): number => item.heightU * U_PX;

  /** Label affiché sur le repère U. */
  const uLabel = (slotIndex: number): number =>
    fromBottom ? heightU - slotIndex : slotIndex + 1;

  return (
    <div className="bay-rack-wrapper">
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
                  className="rack-drop-preview"
                  style={{
                    top: fromBottom
                      ? (heightU - dragOverU - previewH + 1) * U_PX
                      : (dragOverU - 1) * U_PX,
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
  onClick: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}

function RackItemCard({ item, selected, dragging, top, left, width, height, onClick, onDragStart, onDragEnd }: RackItemCardProps) {
  const bg = item.color ?? "#3a3d44";
  const textColor = isLightHex(bg) ? "#1c1f24" : "#ffffff";

  const hasAnnotation =
    item.annotations &&
    Object.values(item.annotations).some((v) => v && v.trim() !== "");

  // Nom de l'onglet synoptique source (pour items de type "synoptic")
  const tabs = useAppStore((s) => s.tabs);
  const synopticName = useMemo(() => {
    if (item.sourceType !== "synoptic" || !item.nodeId) return null;
    for (const t of tabs) {
      if (isSynopticTab(t) && t.nodes?.some((n) => n.id === item.nodeId)) return t.name;
    }
    return null;
  }, [tabs, item.sourceType, item.nodeId]);

  return (
    <div
      className={`rack-item${selected ? " selected" : ""}${dragging ? " dragging" : ""}${item.locked ? " locked" : ""}`}
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
      draggable={!item.locked}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={`${item.manufacturer ?? ""} ${item.reference ?? ""} — U${item.uStart} (${item.heightU}U)`}
    >
      <div className="rack-item-inner">
        <div className="rack-item-name">
          {item.label || item.reference || "—"}
        </div>
        {height >= U_PX * 2 && (
          <div className="rack-item-sub">
            {[item.manufacturer, item.reference].filter(Boolean).join(" ")}
            {synopticName && (
              <span className="rack-item-sub-syno"> — {synopticName}</span>
            )}
          </div>
        )}
        <div className="rack-item-badges">
          {item.locked && <span className="rack-badge" title="Verrouillé">🔒</span>}
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

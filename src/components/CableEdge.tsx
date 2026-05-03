import { useRef } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useStore,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { useAppStore } from "../store";

export interface CableEdgeData extends Record<string, unknown> {
  color: string;
}

export type CableEdgeType = Edge<CableEdgeData, "cable">;

export function CableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
  markerStart,
  selected,
}: EdgeProps<CableEdgeType>) {
  const cable = useAppStore((s) => s.cables.find((c) => c.id === id));
  const updateCable = useAppStore((s) => s.updateCable);
  const reverseCable = useAppStore((s) => s.reverseCable);
  const zoom = useStore((s) => s.transform[2]);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 6,
  });

  const color = data?.color ?? "#888";

  if (!cable) {
    return (
      <BaseEdge
        id={id}
        path={path}
        style={{ ...style, strokeWidth: selected ? 3 : 2 }}
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

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ ...style, strokeWidth: selected ? 3 : 2 }}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
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
              style={{ width: `${Math.max(cable.cableType.length, 1) + 0.7}ch` }}
              onChange={(e) => updateCable(cable.id, { cableType: e.target.value })}
            />
            <input
              className="cable-edge-len"
              type="number"
              min={0}
              step={0.5}
              value={cable.lengthMeters}
              style={{ width: `${String(cable.lengthMeters).length + 0.5}ch` }}
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

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

type Point = { x: number; y: number };

function buildOrthogonalPath(points: Point[]): { d: string; midX: number; midY: number } {
  if (points.length < 2) return { d: "", midX: 0, midY: 0 };
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev.x !== curr.x && prev.y !== curr.y) {
      d += ` L ${curr.x} ${prev.y}`;
    }
    d += ` L ${curr.x} ${curr.y}`;
  }
  const midIdx = Math.floor(points.length / 2);
  const a = points[midIdx - 1] ?? points[0];
  const b = points[midIdx] ?? points[points.length - 1];
  return { d, midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
}

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

  const waypoints = cable?.waypoints ?? [];

  let path: string;
  let labelX: number;
  let labelY: number;
  if (waypoints.length === 0) {
    [path, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 6,
    });
  } else {
    const all: Point[] = [
      { x: sourceX, y: sourceY },
      ...waypoints,
      { x: targetX, y: targetY },
    ];
    const r = buildOrthogonalPath(all);
    path = r.d;
    labelX = r.midX;
    labelY = r.midY;
  }

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

  const onWaypointMouseDown = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const list = cable.waypoints ?? [];
    const orig = { ...list[i] };
    const start = { x: e.clientX, y: e.clientY };
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - start.x) / zoom;
      const dy = (ev.clientY - start.y) / zoom;
      const next = [...(useAppStore.getState().cables.find((c) => c.id === cable.id)?.waypoints ?? [])];
      next[i] = { x: orig.x + dx, y: orig.y + dy };
      updateCable(cable.id, { waypoints: next });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const removeWaypoint = (i: number) => {
    const next = (cable.waypoints ?? []).filter((_, idx) => idx !== i);
    updateCable(cable.id, { waypoints: next });
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
      {selected &&
        waypoints.map((wp, i) => (
          <circle
            key={i}
            cx={wp.x}
            cy={wp.y}
            r={5}
            fill={color}
            stroke="#fff"
            strokeWidth={2}
            style={{ cursor: "move", pointerEvents: "all" }}
            onMouseDown={(e) => onWaypointMouseDown(i, e)}
            onContextMenu={(e) => {
              e.preventDefault();
              removeWaypoint(i);
            }}
          />
        ))}
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
              style={{ width: `${Math.max(cable.cableType.length, 1) + 0.3}ch` }}
              onChange={(e) => updateCable(cable.id, { cableType: e.target.value })}
            />
            <input
              className="cable-edge-len"
              type="number"
              min={0}
              step={0.5}
              value={cable.lengthMeters}
              style={{ width: `${String(cable.lengthMeters).length + 0.3}ch` }}
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

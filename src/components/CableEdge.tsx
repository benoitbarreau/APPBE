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

function buildPolyline(points: Point[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
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
  const allPoints: Point[] = [
    { x: sourceX, y: sourceY },
    ...waypoints,
    { x: targetX, y: targetY },
  ];

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
    path = buildPolyline(allPoints);
    const mid = Math.floor(allPoints.length / 2);
    const a = allPoints[mid - 1] ?? allPoints[0];
    const b = allPoints[mid] ?? allPoints[allPoints.length - 1];
    labelX = (a.x + b.x) / 2;
    labelY = (a.y + b.y) / 2;
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
      const next = [
        ...(useAppStore.getState().cables.find((c) => c.id === cable.id)
          ?.waypoints ?? []),
      ];
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

  // Build segments for drag: each pair of consecutive points in allPoints
  // indexA / indexB are positions in allPoints (0=source, 1..n=waypoints, n+1=target)
  const segments = [];
  for (let i = 0; i < allPoints.length - 1; i++) {
    segments.push({ a: allPoints[i], b: allPoints[i + 1], indexA: i, indexB: i + 1 });
  }

  const onSegmentMouseDown = (
    seg: { a: Point; b: Point; indexA: number; indexB: number },
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const isH = Math.abs(dy) < 1;
    const isV = Math.abs(dx) < 1;
    const start = { x: e.clientX, y: e.clientY };
    const baseWaypoints = [...(cable.waypoints ?? [])];
    const baseLen = baseWaypoints.length;

    const onMove = (ev: MouseEvent) => {
      const rdx = (ev.clientX - start.x) / zoom;
      const rdy = (ev.clientY - start.y) / zoom;
      if (Math.hypot(rdx, rdy) < 4) return;

      let next = [...baseWaypoints];
      const isAReal = seg.indexA > 0 && seg.indexA <= baseLen;
      const isBReal = seg.indexB > 0 && seg.indexB <= baseLen;

      if (isH || isV) {
        const newPerp = isH ? seg.a.y + rdy : seg.a.x + rdx;
        if (isAReal && isBReal) {
          if (isH) {
            next[seg.indexA - 1] = { ...next[seg.indexA - 1], y: newPerp };
            next[seg.indexB - 1] = { ...next[seg.indexB - 1], y: newPerp };
          } else {
            next[seg.indexA - 1] = { ...next[seg.indexA - 1], x: newPerp };
            next[seg.indexB - 1] = { ...next[seg.indexB - 1], x: newPerp };
          }
        } else if (isAReal && !isBReal) {
          if (isH) {
            next[seg.indexA - 1] = { ...next[seg.indexA - 1], y: newPerp };
            next.splice(seg.indexB - 1, 0, { x: seg.b.x, y: newPerp });
          } else {
            next[seg.indexA - 1] = { ...next[seg.indexA - 1], x: newPerp };
            next.splice(seg.indexB - 1, 0, { x: newPerp, y: seg.b.y });
          }
        } else if (!isAReal && isBReal) {
          if (isH) {
            next.splice(0, 0, { x: seg.a.x, y: newPerp });
            next[seg.indexB] = { ...next[seg.indexB], y: newPerp };
          } else {
            next.splice(0, 0, { x: newPerp, y: seg.a.y });
            next[seg.indexB] = { ...next[seg.indexB], x: newPerp };
          }
        } else {
          if (isH) {
            next.push({ x: seg.a.x, y: newPerp }, { x: seg.b.x, y: newPerp });
          } else {
            next.push({ x: newPerp, y: seg.a.y }, { x: newPerp, y: seg.b.y });
          }
        }
      } else {
        // Diagonal segment: insert one waypoint at the original click flow position
        // approximated by midpoint of the segment plus the cumulative drag.
        const insertAt = seg.indexA;
        const wp = {
          x: (seg.a.x + seg.b.x) / 2 + rdx,
          y: (seg.a.y + seg.b.y) / 2 + rdy,
        };
        next.splice(insertAt, 0, wp);
      }
      updateCable(cable.id, { waypoints: next });
    };
    const onUp = () => {
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
      {/* Invisible thick hit areas per segment - allow drag of any bar */}
      {segments.map((seg, i) => {
        const dx = seg.b.x - seg.a.x;
        const dy = seg.b.y - seg.a.y;
        const isH = Math.abs(dy) < 1;
        const isV = Math.abs(dx) < 1;
        const cursor = isH ? "ns-resize" : isV ? "ew-resize" : "move";
        return (
          <line
            key={i}
            x1={seg.a.x}
            y1={seg.a.y}
            x2={seg.b.x}
            y2={seg.b.y}
            stroke="transparent"
            strokeWidth={16}
            style={{ cursor, pointerEvents: "stroke" }}
            onMouseDown={(e) => onSegmentMouseDown(seg, e)}
          />
        );
      })}
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

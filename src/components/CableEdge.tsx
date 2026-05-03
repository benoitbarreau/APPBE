import { useRef } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
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

// Snap stored waypoints so the rendered polyline only ever has H or V
// segments. The direction of the first segment is inferred from where the
// user has placed wp[0] - whichever axis is closer to source. The chain
// then alternates and the final segment is snapped to land on target.
function orthogonalize(source: Point, target: Point, stored: Point[]): Point[] {
  if (stored.length === 0) {
    if (Math.abs(source.y - target.y) < 1) return [];
    const midX = (source.x + target.x) / 2;
    return [
      { x: midX, y: source.y },
      { x: midX, y: target.y },
    ];
  }
  const wps = stored.map((p) => ({ x: p.x, y: p.y }));
  let dir: "H" | "V" =
    Math.abs(wps[0].x - source.x) < Math.abs(wps[0].y - source.y) ? "V" : "H";
  if (dir === "H") wps[0].y = source.y;
  else wps[0].x = source.x;
  for (let i = 1; i < wps.length; i++) {
    dir = dir === "H" ? "V" : "H";
    if (dir === "H") wps[i].y = wps[i - 1].y;
    else wps[i].x = wps[i - 1].x;
  }
  dir = dir === "H" ? "V" : "H";
  if (dir === "H") wps[wps.length - 1].y = target.y;
  else wps[wps.length - 1].x = target.x;
  return wps;
}

export function CableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
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

  const stored = cable?.waypoints ?? [];
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const waypoints = orthogonalize(source, target, stored);
  const allPoints: Point[] = [source, ...waypoints, target];

  const path = buildPolyline(allPoints);
  const mid = Math.floor(allPoints.length / 2);
  const a = allPoints[mid - 1] ?? allPoints[0];
  const b = allPoints[mid] ?? allPoints[allPoints.length - 1];
  const labelX = (a.x + b.x) / 2;
  const labelY = (a.y + b.y) / 2;

  const color = data?.color ?? "#888";

  if (!cable) {
    return (
      <BaseEdge
        id={id}
        path={path}
        style={{ ...style, strokeWidth: 2 }}
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
    const orig = { ...waypoints[i] };
    const baseEffective = waypoints.map((p) => ({ ...p }));
    const start = { x: e.clientX, y: e.clientY };
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - start.x) / zoom;
      const dy = (ev.clientY - start.y) / zoom;
      const next = [...baseEffective];
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
    const next = waypoints.filter((_, idx) => idx !== i);
    updateCable(cable.id, { waypoints: next });
  };

  // Build segments for drag: each pair of consecutive points in allPoints
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
    // Use the orthogonalized (effective) waypoints as base so the indices in
    // seg.indexA/B match positions in this array. The store will be updated
    // with the new effective waypoints.
    const baseWaypoints = waypoints.map((p) => ({ ...p }));
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

  const addWaypointAt = (segIndex: number, wp: Point) => {
    const next = [...waypoints];
    next.splice(segIndex, 0, wp);
    updateCable(cable.id, { waypoints: next });
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          ...style,
          strokeWidth: selected ? 4 : 2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={20}
      />

      {/* Handles only when selected */}
      {selected && (
        <>
          {/* Invisible thick hit areas - any drag on a segment slides it */}
          {segments.map((seg, i) => {
            const dx = seg.b.x - seg.a.x;
            const dy = seg.b.y - seg.a.y;
            const isH = Math.abs(dy) < 1;
            const isV = Math.abs(dx) < 1;
            const cursor = isH ? "ns-resize" : isV ? "ew-resize" : "move";
            return (
              <line
                key={`hit-${i}`}
                x1={seg.a.x}
                y1={seg.a.y}
                x2={seg.b.x}
                y2={seg.b.y}
                stroke="transparent"
                strokeWidth={22}
                style={{ cursor, pointerEvents: "stroke" }}
                onMouseDown={(e) => onSegmentMouseDown(seg, e)}
              />
            );
          })}

          {/* Mid-segment grip pills - visual handle */}
          {segments.map((seg, i) => {
            const dx = seg.b.x - seg.a.x;
            const dy = seg.b.y - seg.a.y;
            const isH = Math.abs(dy) < 1;
            const isV = Math.abs(dx) < 1;
            const len = Math.hypot(dx, dy);
            if (len < 30) return null;
            const midX = (seg.a.x + seg.b.x) / 2;
            const midY = (seg.a.y + seg.b.y) / 2;
            const w = isV ? 22 : isH ? 8 : 18;
            const h = isV ? 8 : isH ? 22 : 8;
            const cursor = isH ? "ns-resize" : isV ? "ew-resize" : "move";
            return (
              <rect
                key={`grip-${i}`}
                x={midX - w / 2}
                y={midY - h / 2}
                width={w}
                height={h}
                rx={3}
                ry={3}
                fill={color}
                stroke="#fff"
                strokeWidth={2}
                style={{ cursor, pointerEvents: "all" }}
                onMouseDown={(e) => onSegmentMouseDown(seg, e)}
              />
            );
          })}

          {/* Creation dots - click to insert a new corner */}
          {segments.map((seg, i) => {
            const dx = seg.b.x - seg.a.x;
            const dy = seg.b.y - seg.a.y;
            const len = Math.hypot(dx, dy);
            if (len < 60) return null;
            const ts = [1 / 3, 2 / 3];
            return ts.map((t, k) => {
              const x = seg.a.x + dx * t;
              const y = seg.a.y + dy * t;
              return (
                <circle
                  key={`add-${i}-${k}`}
                  cx={x}
                  cy={y}
                  r={4}
                  fill="#fff"
                  stroke={color}
                  strokeWidth={1.5}
                  style={{ cursor: "pointer", pointerEvents: "all" }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    addWaypointAt(i, { x, y });
                  }}
                />
              );
            });
          })}

          {/* Existing waypoint corners - drag to move, right-click to delete */}
          {waypoints.map((wp, i) => (
            <circle
              key={`wp-${i}`}
              cx={wp.x}
              cy={wp.y}
              r={6}
              fill="#fff"
              stroke={color}
              strokeWidth={3}
              style={{ cursor: "move", pointerEvents: "all" }}
              onMouseDown={(e) => onWaypointMouseDown(i, e)}
              onContextMenu={(e) => {
                e.preventDefault();
                removeWaypoint(i);
              }}
            />
          ))}
        </>
      )}

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

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";

export interface CableEdgeData extends Record<string, unknown> {
  line1: string;
  line2: string;
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
  selected,
}: EdgeProps<CableEdgeType>) {
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

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ ...style, strokeWidth: selected ? 3 : 2 }}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        <div
          className={"cable-edge-label" + (selected ? " selected" : "")}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            color,
          }}
        >
          <div className="cable-edge-line1">{data?.line1}</div>
          {data?.line2 && <div className="cable-edge-line2">{data.line2}</div>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

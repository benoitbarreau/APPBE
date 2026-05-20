import { useCallback } from "react";
import { Handle, NodeResizer, NodeToolbar, Position } from "@xyflow/react";
import { useAppStore } from "../store";
import type { ShapeNodeData } from "../types";

export function ShapeNodeComponent({ id, data, selected }: {
  id: string;
  data: ShapeNodeData;
  selected?: boolean;
}) {
  const updateShapeNode  = useAppStore((s) => s.updateShapeNode);
  const removeShapeNode  = useAppStore((s) => s.removeShapeNode);
  const bringShapeForward = useAppStore((s) => s.bringShapeForward);
  const sendShapeBackward = useAppStore((s) => s.sendShapeBackward);

  const update = useCallback(
    (patch: Partial<ShapeNodeData>) => updateShapeNode(id, patch),
    [id, updateShapeNode],
  );

  const handleResize = useCallback(
    (_: unknown, params: { width: number; height: number }) => {
      update({ width: Math.round(params.width), height: Math.round(params.height) });
    },
    [update],
  );

  const borderRadius = data.borderRadius ?? 0;
  const borderWidth  = data.borderWidth  ?? 1;
  const isEllipse    = data.shape === "ellipse";
  const isCloud      = data.shape === "cloud";

  // ── Path SVG du nuage (viewBox 0 0 100 60) ──────────────────────────────
  // Symétrique : 3 bosses en haut, fond plat de x=15 à x=85.
  // vector-effect="non-scaling-stroke" → épaisseur de trait constante en px écran.
  const CLOUD_PATH =
    "M 15,52 " +
    "C 5,52 0,44 0,36 " +
    "C 0,26 8,19 18,21 " +
    "C 16,9 24,3 34,3 " +
    "C 40,0 48,2 50,8 " +
    "C 52,2 60,0 66,3 " +
    "C 76,3 84,9 82,21 " +
    "C 92,19 100,26 100,36 " +
    "C 100,44 95,52 85,52 " +
    "Z";

  const cloudStrokeDasharray =
    data.borderStyle === "dashed" ? "10 5" :
    data.borderStyle === "dotted" ? "2 5"  :
    undefined;

  const cloudElement = (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 60"
      preserveAspectRatio="none"
      style={{ display: "block", overflow: "visible" }}
    >
      <path
        d={CLOUD_PATH}
        fill={data.background === "transparent" ? "transparent" : data.background}
        stroke={data.borderStyle === "none" || borderWidth === 0 ? "none" : data.borderColor}
        strokeWidth={borderWidth}
        strokeDasharray={cloudStrokeDasharray}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );

  const boxStyle: React.CSSProperties = {
    width:        "100%",
    height:       "100%",
    background:   data.background === "transparent" ? "transparent" : data.background,
    border:       data.borderStyle === "none" || borderWidth === 0
                    ? "none"
                    : `${borderWidth}px ${data.borderStyle} ${data.borderColor}`,
    borderRadius: isEllipse ? "50%" : `${borderRadius}px`,
    boxSizing:    "border-box",
  };

  return (
    <>
      <NodeResizer
        isVisible={!!selected}
        minWidth={40}
        minHeight={40}
        onResize={handleResize}
        handleStyle={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: "#fff",
          border: "2px solid #2f6fed",
        }}
        lineStyle={{ borderColor: "#2f6fed", borderWidth: 1 }}
      />

      <NodeToolbar isVisible={!!selected} position={Position.Top} offset={8}>
        <div
          className="text-toolbar nopan"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => {
            e.stopPropagation();
            const tag = (e.target as HTMLElement).tagName;
            if (tag !== "INPUT" && tag !== "SELECT") e.preventDefault();
          }}
        >
          {/* ── Ligne 1 : OPTIONS FORME ─────────────────────────────── */}
          <div className="text-toolbar-row">
            <span className="text-toolbar-row-label">Forme</span>

            {/* Bascule Rectangle / Ellipse / Nuage */}
            <button
              className={`text-toolbar-btn${!isEllipse && !isCloud ? " active" : ""}`}
              onClick={() => update({ shape: "rectangle" })}
              title="Rectangle"
            >▭</button>
            <button
              className={`text-toolbar-btn${isEllipse ? " active" : ""}`}
              onClick={() => update({ shape: "ellipse" })}
              title="Ellipse"
            >⬭</button>
            <button
              className={`text-toolbar-btn${isCloud ? " active" : ""}`}
              onClick={() => update({ shape: "cloud" })}
              title="Nuage"
            >☁</button>

            <span className="text-toolbar-sep" />

            {/* Ordre d'empilement entre formes */}
            <button
              className="text-toolbar-btn"
              onClick={() => bringShapeForward(id)}
              title="Avancer (mettre devant les autres formes)"
            >▲</button>
            <button
              className="text-toolbar-btn"
              onClick={() => sendShapeBackward(id)}
              title="Reculer (mettre derrière les autres formes)"
            >▼</button>
          </div>

          {/* ── Ligne 2 : OPTIONS CADRE ──────────────────────────────── */}
          <div className="text-toolbar-row text-toolbar-row-frame">
            <span className="text-toolbar-row-label">Cadre</span>

            {/* Style de bordure */}
            <select
              className="text-toolbar-select"
              value={data.borderStyle}
              onChange={(e) => update({ borderStyle: e.target.value as ShapeNodeData["borderStyle"] })}
              title="Style de bordure"
            >
              <option value="none">Aucune</option>
              <option value="solid">Continue</option>
              <option value="dashed">Tirets</option>
              <option value="dotted">Points</option>
            </select>

            {/* Épaisseur de bordure */}
            {data.borderStyle !== "none" && (
              <input
                type="number"
                className="text-toolbar-borderwidth"
                min={0}
                max={10}
                step={1}
                value={borderWidth}
                onChange={(e) => update({ borderWidth: Math.max(0, Math.min(10, Number(e.target.value))) })}
                title="Épaisseur de bordure (px)"
              />
            )}

            {/* Couleur de bordure */}
            {data.borderStyle !== "none" && (
              <label className="text-toolbar-color-wrap" title="Couleur de bordure">
                <span
                  className="text-toolbar-color-label"
                  style={{
                    background: data.borderColor,
                    border: "1px solid #ccc",
                    borderRadius: 3,
                    width: 16,
                    height: 16,
                    display: "inline-block",
                  }}
                />
                <input
                  type="color"
                  className="text-toolbar-color-input"
                  value={data.borderColor}
                  onChange={(e) => update({ borderColor: e.target.value })}
                />
              </label>
            )}

            <span className="text-toolbar-sep" />

            {/* Couleur de fond */}
            <label className="text-toolbar-color-wrap" title="Couleur de fond">
              <span
                className="text-toolbar-color-label"
                style={{
                  background:
                    data.background === "transparent"
                      ? "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 8px 8px"
                      : data.background,
                  border: "1px solid #ccc",
                  borderRadius: 3,
                  width: 16,
                  height: 16,
                  display: "inline-block",
                }}
              />
              <input
                type="color"
                className="text-toolbar-color-input"
                value={data.background === "transparent" ? "#ffffff" : data.background}
                onChange={(e) => update({ background: e.target.value })}
              />
            </label>

            {/* Fond transparent */}
            <button
              className={`text-toolbar-btn${data.background === "transparent" ? " active" : ""}`}
              onClick={() =>
                update({
                  background: data.background === "transparent" ? "#dbeafe" : "transparent",
                })
              }
              title="Fond transparent"
              style={{ fontSize: 11 }}
            >⊘</button>

            {/* Coins arrondis — uniquement pour les rectangles */}
            {!isEllipse && !isCloud && (
              <>
                <span className="text-toolbar-sep" />
                <label className="text-toolbar-radius-wrap" title={`Coins arrondis : ${borderRadius}px`}>
                  <span className="text-toolbar-radius-icon">◻</span>
                  <input
                    type="range"
                    className="text-toolbar-slider"
                    min={0}
                    max={30}
                    step={1}
                    value={borderRadius}
                    onChange={(e) => update({ borderRadius: Number(e.target.value) })}
                  />
                  <span className="text-toolbar-radius-val">{borderRadius}px</span>
                </label>
              </>
            )}

            <span className="text-toolbar-sep" />

            {/* Supprimer */}
            <button
              className="text-toolbar-btn text-toolbar-delete"
              onClick={() => removeShapeNode(id)}
              title="Supprimer cette forme"
            >✕</button>
          </div>
        </div>
      </NodeToolbar>

      {isCloud ? cloudElement : <div style={boxStyle} />}

      {/* ── Handles de connexion (visibles au survol via CSS) ───────────── */}
      <Handle type="source" position={Position.Top}    id="out:shape-n" className="shape-handle" />
      <Handle type="source" position={Position.Right}  id="out:shape-e" className="shape-handle" />
      <Handle type="source" position={Position.Bottom} id="out:shape-s" className="shape-handle" />
      <Handle type="source" position={Position.Left}   id="out:shape-w" className="shape-handle" />
    </>
  );
}

import { useCallback } from "react";
import { NodeResizer, NodeToolbar, Position } from "@xyflow/react";
import { useAppStore } from "../store";
import type { ImageNodeData } from "../types";

export function ImageNodeComponent({ id, data, selected }: {
  id: string;
  data: ImageNodeData;
  selected?: boolean;
}) {
  const updateImageNode  = useAppStore((s) => s.updateImageNode);
  const removeImageNode  = useAppStore((s) => s.removeImageNode);
  const bringImageForward = useAppStore((s) => s.bringImageForward);
  const sendImageBackward = useAppStore((s) => s.sendImageBackward);

  const update = useCallback(
    (patch: Partial<ImageNodeData>) => updateImageNode(id, patch),
    [id, updateImageNode],
  );

  const handleResize = useCallback(
    (_: unknown, params: { width: number; height: number }) => {
      update({ width: Math.round(params.width), height: Math.round(params.height) });
    },
    [update],
  );

  const borderWidth  = data.borderWidth  ?? 0;
  const borderRadius = data.borderRadius ?? 0;
  const opacity      = data.opacity      ?? 1;

  const containerStyle: React.CSSProperties = {
    width:        "100%",
    height:       "100%",
    border:       data.borderStyle === "none" || borderWidth === 0
                    ? "none"
                    : `${borderWidth}px ${data.borderStyle} ${data.borderColor}`,
    borderRadius: `${borderRadius}px`,
    boxSizing:    "border-box",
    overflow:     "hidden",
    opacity,
  };

  const imgStyle: React.CSSProperties = {
    width:      "100%",
    height:     "100%",
    objectFit:  "contain",
    display:    "block",
  };

  return (
    <>
      <NodeResizer
        isVisible={!!selected}
        minWidth={20}
        minHeight={20}
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
          {/* ── Ligne 1 : CALQUE & Z-ORDER ────────────────────────────── */}
          <div className="text-toolbar-row">
            <span className="text-toolbar-row-label">Calque</span>

            <button
              className={`text-toolbar-btn${data.layer === "background" ? " active" : ""}`}
              onClick={() => update({ layer: "background" })}
              title="Arrière-plan (derrière les équipements)"
            >
              Arrière
            </button>
            <button
              className={`text-toolbar-btn${data.layer === "foreground" ? " active" : ""}`}
              onClick={() => update({ layer: "foreground" })}
              title="Premier plan (devant les équipements)"
            >
              Avant
            </button>

            <span className="text-toolbar-sep" />

            <button
              className="text-toolbar-btn"
              onClick={() => bringImageForward(id)}
              title="Avancer dans le calque"
            >▲</button>
            <button
              className="text-toolbar-btn"
              onClick={() => sendImageBackward(id)}
              title="Reculer dans le calque"
            >▼</button>
          </div>

          {/* ── Ligne 2 : BORDURE & OPACITÉ ──────────────────────────── */}
          <div className="text-toolbar-row text-toolbar-row-frame">
            <span className="text-toolbar-row-label">Cadre</span>

            {/* Style de bordure */}
            <select
              className="text-toolbar-select"
              value={data.borderStyle}
              onChange={(e) => update({ borderStyle: e.target.value as ImageNodeData["borderStyle"] })}
              title="Style de bordure"
            >
              <option value="none">Aucune</option>
              <option value="solid">Continue</option>
              <option value="dashed">Tirets</option>
              <option value="dotted">Points</option>
            </select>

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

            {/* Coins arrondis */}
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

            <span className="text-toolbar-sep" />

            {/* Opacité */}
            <label className="text-toolbar-radius-wrap" title={`Opacité : ${Math.round(opacity * 100)}%`}>
              <span className="text-toolbar-radius-icon" style={{ fontSize: 11 }}>α</span>
              <input
                type="range"
                className="text-toolbar-slider"
                min={0}
                max={100}
                step={1}
                value={Math.round(opacity * 100)}
                onChange={(e) => update({ opacity: Number(e.target.value) / 100 })}
              />
              <span className="text-toolbar-radius-val">{Math.round(opacity * 100)}%</span>
            </label>

            <span className="text-toolbar-sep" />

            {/* Supprimer */}
            <button
              className="text-toolbar-btn text-toolbar-delete"
              onClick={() => removeImageNode(id)}
              title="Supprimer cette image"
            >✕</button>
          </div>
        </div>
      </NodeToolbar>

      <div style={containerStyle}>
        {data.src ? (
          <img
            src={data.src}
            alt=""
            style={imgStyle}
            draggable={false}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f3f4f6",
              color: "#9ca3af",
              fontSize: 12,
            }}
          >
            Image manquante
          </div>
        )}
      </div>
    </>
  );
}

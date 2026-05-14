import { useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer, NodeToolbar, Position } from "@xyflow/react";
import { useAppStore } from "../store";
import type { TextNodeData } from "../types";

const FONTS = [
  { value: "Arial, sans-serif",            label: "Arial" },
  { value: "'Times New Roman', serif",     label: "Times New Roman" },
  { value: "'Courier New', monospace",     label: "Monospace" },
];

const FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

export function TextNodeComponent({ id, data, selected }: {
  id: string;
  data: TextNodeData;
  selected?: boolean;
}) {
  const updateTextNode = useAppStore((s) => s.updateTextNode);
  const removeTextNode  = useAppStore((s) => s.removeTextNode);

  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const update = useCallback(
    (patch: Partial<TextNodeData>) => updateTextNode(id, patch),
    [id, updateTextNode],
  );

  // Ouvrir le mode édition au double-clic
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
  };

  // Focus auto quand on entre en édition — curseur placé à la fin du texte
  // (PAS de select() qui sélectionnerait tout et ferait perdre le contenu
  // à la première frappe).
  useEffect(() => {
    if (editing) {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }
  }, [editing]);

  // Sortir du mode édition au blur ou Escape
  const handleBlur = () => setEditing(false);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setEditing(false);
    e.stopPropagation();
  };

  // Synchroniser la taille du nœud depuis NodeResizer
  const handleResize = useCallback(
    (_: unknown, params: { width: number; height: number }) => {
      update({ width: Math.round(params.width), height: Math.round(params.height) });
    },
    [update],
  );

  // Style de la boîte
  const boxStyle: React.CSSProperties = {
    width:  "100%",
    height: "100%",
    padding: "6px 8px",
    fontFamily:      data.fontFamily,
    fontSize:        data.fontSize,
    fontWeight:      data.bold      ? "bold"      : "normal",
    fontStyle:       data.italic    ? "italic"    : "normal",
    textDecoration:  data.underline ? "underline" : "none",
    textAlign:       data.textAlign,
    color:           data.color,
    background:      data.background === "transparent" ? "transparent" : data.background,
    border:          data.borderStyle === "none"
                       ? "none"
                       : `1px ${data.borderStyle} ${data.borderColor}`,
    cursor:          editing ? "text" : "default",
    overflow:        "hidden",
    whiteSpace:      "pre-wrap",
    wordBreak:       "break-word",
    userSelect:      editing ? "text" : "none",
    boxSizing:       "border-box",
  };

  return (
    <>
      {/* Poignées de redimensionnement */}
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={80}
        minHeight={30}
        onResize={handleResize}
      />

      {/* Barre de formatage flottante (Figma-style).
          - Visible quand le bloc est sélectionné OU en cours d'édition.
          - onMouseDown(preventDefault) sur le wrapper : empêche le textarea
            de perdre le focus quand on clique sur un bouton/select/color de
            la barre — sinon on sort de l'édition à chaque clic. */}
      <NodeToolbar isVisible={selected || editing} position={Position.Top} offset={6}>
        <div
          className="text-toolbar"
          onMouseDown={(e) => {
            // Ne préserve le focus que si on est en édition active.
            if (editing) e.preventDefault();
          }}
        >
          {/* Famille de police */}
          <select
            className="text-toolbar-select"
            value={data.fontFamily}
            onChange={(e) => update({ fontFamily: e.target.value })}
            title="Police"
          >
            {FONTS.map((f) => (
              <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Taille */}
          <select
            className="text-toolbar-select text-toolbar-size"
            value={data.fontSize}
            onChange={(e) => update({ fontSize: Number(e.target.value) })}
            title="Taille"
          >
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <span className="text-toolbar-sep" />

          {/* Gras */}
          <button
            className={`text-toolbar-btn${data.bold ? " active" : ""}`}
            onClick={() => update({ bold: !data.bold })}
            title="Gras"
          >
            <strong>B</strong>
          </button>
          {/* Italique */}
          <button
            className={`text-toolbar-btn${data.italic ? " active" : ""}`}
            onClick={() => update({ italic: !data.italic })}
            title="Italique"
          >
            <em>I</em>
          </button>
          {/* Souligné */}
          <button
            className={`text-toolbar-btn${data.underline ? " active" : ""}`}
            onClick={() => update({ underline: !data.underline })}
            title="Souligné"
          >
            <u>U</u>
          </button>

          <span className="text-toolbar-sep" />

          {/* Alignement */}
          <button
            className={`text-toolbar-btn${data.textAlign === "left" ? " active" : ""}`}
            onClick={() => update({ textAlign: "left" })}
            title="Aligner à gauche"
          >≡</button>
          <button
            className={`text-toolbar-btn${data.textAlign === "center" ? " active" : ""}`}
            onClick={() => update({ textAlign: "center" })}
            title="Centrer"
          >☰</button>
          <button
            className={`text-toolbar-btn${data.textAlign === "right" ? " active" : ""}`}
            onClick={() => update({ textAlign: "right" })}
            title="Aligner à droite"
          >≡</button>

          <span className="text-toolbar-sep" />

          {/* Couleur du texte */}
          <label className="text-toolbar-color-wrap" title="Couleur du texte">
            <span className="text-toolbar-color-label" style={{ color: data.color }}>A</span>
            <input
              type="color"
              className="text-toolbar-color-input"
              value={data.color}
              onChange={(e) => update({ color: e.target.value })}
            />
          </label>

          {/* Couleur de fond */}
          <label className="text-toolbar-color-wrap" title="Couleur de fond (double-clic pour transparence)">
            <span className="text-toolbar-color-label" style={{ background: data.background === "transparent" ? "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 8px 8px" : data.background, border: "1px solid #ccc", borderRadius: 3, width: 16, height: 16, display: "inline-block" }} />
            <input
              type="color"
              className="text-toolbar-color-input"
              value={data.background === "transparent" ? "#ffffff" : data.background}
              onChange={(e) => update({ background: e.target.value })}
            />
          </label>
          <button
            className={`text-toolbar-btn${data.background === "transparent" ? " active" : ""}`}
            onClick={() => update({ background: data.background === "transparent" ? "#ffffff" : "transparent" })}
            title="Fond transparent"
            style={{ fontSize: 10 }}
          >
            ⊘
          </button>

          <span className="text-toolbar-sep" />

          {/* Bordure */}
          <select
            className="text-toolbar-select"
            value={data.borderStyle}
            onChange={(e) => update({ borderStyle: e.target.value as TextNodeData["borderStyle"] })}
            title="Style de bordure"
          >
            <option value="none">Aucune</option>
            <option value="solid">Continue</option>
            <option value="dashed">Tirets</option>
            <option value="dotted">Points</option>
          </select>
          {data.borderStyle !== "none" && (
            <label className="text-toolbar-color-wrap" title="Couleur de bordure">
              <span className="text-toolbar-color-label" style={{ background: data.borderColor, border: "1px solid #ccc", borderRadius: 3, width: 16, height: 16, display: "inline-block" }} />
              <input
                type="color"
                className="text-toolbar-color-input"
                value={data.borderColor}
                onChange={(e) => update({ borderColor: e.target.value })}
              />
            </label>
          )}

          <span className="text-toolbar-sep" />

          {/* Supprimer */}
          <button
            className="text-toolbar-btn text-toolbar-delete"
            onClick={() => removeTextNode(id)}
            title="Supprimer ce bloc texte"
          >
            ✕
          </button>
        </div>
      </NodeToolbar>

      {/* Contenu */}
      <div style={boxStyle} onDoubleClick={handleDoubleClick}>
        {editing ? (
          <textarea
            ref={textareaRef}
            style={{
              width: "100%",
              height: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              fontFamily:     data.fontFamily,
              fontSize:       data.fontSize,
              fontWeight:     data.bold      ? "bold"      : "normal",
              fontStyle:      data.italic    ? "italic"    : "normal",
              textDecoration: data.underline ? "underline" : "none",
              textAlign:      data.textAlign,
              color:          data.color,
              padding: 0,
              margin: 0,
            }}
            value={data.content}
            onChange={(e) => update({ content: e.target.value })}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
        ) : (
          data.content || <span style={{ opacity: 0.35, fontStyle: "italic" }}>Double-clic pour éditer</span>
        )}
      </div>
    </>
  );
}

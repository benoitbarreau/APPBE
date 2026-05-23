import { useEffect, useRef, useState } from "react";

interface FormattingPanelProps {
  onCollapse: () => void;
  onAutoLayout: () => void;
  onAddTextNode: () => void;
  onAddShapeNode: (shape: "rectangle" | "ellipse" | "cloud") => void;
  onAddImageNode: () => void;
}

export function FormattingPanel({ onCollapse, onAutoLayout, onAddTextNode, onAddShapeNode, onAddImageNode }: FormattingPanelProps) {
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const shapeMenuWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shapeMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!shapeMenuWrapRef.current?.contains(e.target as Node)) {
        setShapeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shapeMenuOpen]);

  return (
    <div className="formatting-panel">
      <div className="formatting-panel-header">
        <span className="formatting-panel-title">Mises en forme</span>
        <button
          className="formatting-collapse-btn"
          onClick={onCollapse}
          title="Réduire le panneau"
        >
          ◀
        </button>
      </div>

      <div className="formatting-panel-content">

        {/* ── Section : Actions canvas ── */}
        <div className="fp-section-label">Canvas</div>
        <button
          className="formatting-panel-btn fp-btn--action"
          onClick={onAutoLayout}
          title="Replacer automatiquement les produits"
        >
          <span className="fp-btn-icon">⟳</span>
          Réorganiser
        </button>

        {/* ── Section : Ajouter un élément ── */}
        <div className="fp-section-label fp-section-label--gap">Ajouter</div>

        <button
          className="formatting-panel-btn fp-btn--text"
          onClick={onAddTextNode}
          title="Ajouter un bloc texte libre"
        >
          <span className="fp-btn-icon">T</span>
          Texte
        </button>

        {/* Forme avec sous-menu */}
        <div className="shape-menu-wrap" ref={shapeMenuWrapRef}>
          <button
            className="formatting-panel-btn fp-btn--shape shape-menu-toggle"
            onClick={() => setShapeMenuOpen((v) => !v)}
            title="Ajouter un bloc forme"
          >
            <span className="fp-btn-icon">▭</span>
            Forme
            <span className="fp-btn-chevron">{shapeMenuOpen ? "▴" : "▾"}</span>
          </button>
          {shapeMenuOpen && (
            <div className="shape-menu-dropdown">
              <button onClick={() => { setShapeMenuOpen(false); onAddShapeNode("rectangle"); }}>
                ▭ Rectangle
              </button>
              <button onClick={() => { setShapeMenuOpen(false); onAddShapeNode("ellipse"); }}>
                ⬭ Ellipse
              </button>
              <button onClick={() => { setShapeMenuOpen(false); onAddShapeNode("cloud"); }}>
                ☁ Nuage
              </button>
            </div>
          )}
        </div>

        <button
          className="formatting-panel-btn fp-btn--image"
          onClick={onAddImageNode}
          title="Importer une image (PNG, JPEG, SVG, GIF, WebP)"
        >
          <span className="fp-btn-icon">⊞</span>
          Image
        </button>

      </div>
    </div>
  );
}

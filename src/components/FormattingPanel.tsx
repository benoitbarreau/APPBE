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

  // Fermer le sous-menu si clic en dehors
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
        <span className="formatting-panel-title">Mises en formes</span>
        <button
          className="formatting-collapse-btn"
          onClick={onCollapse}
          title="Réduire le panneau"
        >
          ◀
        </button>
      </div>
      <div className="formatting-panel-content">
        <button
          className="formatting-panel-btn"
          onClick={onAutoLayout}
          title="Replacer automatiquement les produits"
        >
          ↻ Réorganiser
        </button>
        <button
          className="formatting-panel-btn"
          onClick={onAddTextNode}
          title="Ajouter un bloc texte libre"
        >
          T + Texte
        </button>

        {/* Bouton "Forme" avec sous-menu Rectangle / Ellipse */}
        <div className="shape-menu-wrap" ref={shapeMenuWrapRef}>
          <button
            className="formatting-panel-btn shape-menu-toggle"
            onClick={() => setShapeMenuOpen((v) => !v)}
            title="Ajouter un bloc forme (rectangle ou ellipse)"
          >
            ▭ + Forme {shapeMenuOpen ? "▴" : "▾"}
          </button>
          {shapeMenuOpen && (
            <div className="shape-menu-dropdown">
              <button
                onClick={() => { setShapeMenuOpen(false); onAddShapeNode("rectangle"); }}
              >
                ▭ Rectangle
              </button>
              <button
                onClick={() => { setShapeMenuOpen(false); onAddShapeNode("ellipse"); }}
              >
                ⬭ Ellipse
              </button>
              <button
                onClick={() => { setShapeMenuOpen(false); onAddShapeNode("cloud"); }}
              >
                ☁ Nuage
              </button>
            </div>
          )}
        </div>

        {/* Bouton "Image" */}
        <button
          className="formatting-panel-btn"
          onClick={onAddImageNode}
          title="Importer une image (PNG, JPEG, SVG, GIF, WebP)"
        >
          🖼 + Image
        </button>
      </div>
    </div>
  );
}

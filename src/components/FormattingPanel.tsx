interface FormattingPanelProps {
  onCollapse: () => void;
  onAutoLayout: () => void;
  onAddTextNode: () => void;
}

export function FormattingPanel({ onCollapse, onAutoLayout, onAddTextNode }: FormattingPanelProps) {
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
      </div>
    </div>
  );
}

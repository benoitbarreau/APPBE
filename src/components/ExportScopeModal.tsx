interface Tab {
  id: string;
  name: string;
  trade?: string;
}

interface Props {
  tabs: Tab[];
  activeTabName: string;
  action: "export" | "print";
  onCurrentTab: () => void;
  onAllTabs: () => void;
  onCancel: () => void;
}

export function ExportScopeModal({
  tabs,
  activeTabName,
  action,
  onCurrentTab,
  onAllTabs,
  onCancel,
}: Props) {
  const verb = action === "export" ? "Exporter" : "Imprimer";

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box scope-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{verb} — Choisir la portée</h2>
        <p className="scope-subtitle">
          Ce projet contient <strong>{tabs.length} synoptiques</strong>. Souhaitez-vous{" "}
          {verb.toLowerCase()} :
        </p>
        <div className="scope-options">
          <button className="scope-btn" onClick={onCurrentTab}>
            <span className="scope-icon">📄</span>
            <span className="scope-label">Synoptique actuel</span>
            <span className="scope-desc">{activeTabName}</span>
          </button>
          <button className="scope-btn" onClick={onAllTabs}>
            <span className="scope-icon">📚</span>
            <span className="scope-label">Tout le projet</span>
            <span className="scope-desc">{tabs.length} synoptiques</span>
          </button>
        </div>
        <button className="scope-cancel" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}

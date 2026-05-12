import { useState } from "react";

interface BayCreateModalProps {
  onConfirm: (opts: { name: string; widthInch: 10 | 19; heightU: number }) => void;
  onCancel: () => void;
  /** Titre de la modale (défaut : "Nouvelle Baie") */
  title?: string;
  /** Nom pré-rempli dans le champ nom */
  defaultName?: string;
}

const PRESET_HEIGHTS = [6, 12, 18, 24, 42, 48];

export function BayCreateModal({ onConfirm, onCancel, title = "Nouvelle Baie", defaultName = "" }: BayCreateModalProps) {
  const [name, setName] = useState(defaultName);
  const [widthInch, setWidthInch] = useState<10 | 19>(19);
  const [heightU, setHeightU] = useState<number>(42);
  const [customHeight, setCustomHeight] = useState("");
  const [useCustomHeight, setUseCustomHeight] = useState(false);

  const resolvedHeight = useCustomHeight ? (parseInt(customHeight) || 42) : heightU;

  const handleConfirm = () => {
    if (resolvedHeight < 1 || resolvedHeight > 100) return;
    onConfirm({ name: name.trim() || `Baie 19" ${resolvedHeight}U`, widthInch, heightU: resolvedHeight });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box bay-create-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>

        <div className="modal-field">
          <label>Nom de l'onglet</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Baie ${widthInch}" ${resolvedHeight}U`}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
          />
        </div>

        <div className="modal-field">
          <label>Format</label>
          <div className="bay-create-width-group">
            <button
              className={`bay-create-width-btn${widthInch === 19 ? " active" : ""}`}
              onClick={() => setWidthInch(19)}
              type="button"
            >
              19" (standard)
            </button>
            <button
              className={`bay-create-width-btn${widthInch === 10 ? " active" : ""}`}
              onClick={() => setWidthInch(10)}
              type="button"
            >
              10" (demi-rack)
            </button>
          </div>
        </div>

        <div className="modal-field">
          <label>Hauteur</label>
          <div className="bay-create-height-grid">
            {PRESET_HEIGHTS.map((h) => (
              <button
                key={h}
                className={`bay-create-height-btn${!useCustomHeight && heightU === h ? " active" : ""}`}
                onClick={() => { setUseCustomHeight(false); setHeightU(h); }}
                type="button"
              >
                {h}U
              </button>
            ))}
            <button
              className={`bay-create-height-btn${useCustomHeight ? " active" : ""}`}
              onClick={() => setUseCustomHeight(true)}
              type="button"
            >
              Autre…
            </button>
          </div>
          {useCustomHeight && (
            <input
              type="number"
              min={1}
              max={100}
              value={customHeight}
              onChange={(e) => setCustomHeight(e.target.value)}
              placeholder="Ex : 30"
              className="bay-create-custom-height"
            />
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onCancel} type="button">Annuler</button>
          <button
            onClick={handleConfirm}
            type="button"
            className="primary"
            disabled={useCustomHeight && (!customHeight || parseInt(customHeight) < 1)}
          >
            Créer la baie
          </button>
        </div>
      </div>
    </div>
  );
}

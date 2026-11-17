import { useState } from "react";

export interface BayFormValues {
  name: string;
  widthInch: 10 | 19;
  heightU: number;
  numberingFromBottom: boolean;
}

interface BayCreateModalProps {
  onConfirm: (opts: BayFormValues) => void;
  onCancel: () => void;
  /** Titre de la modale (défaut : "Nouvelle Baie") */
  title?: string;
  /** Nom pré-rempli dans le champ nom */
  defaultName?: string;
  /** Valeurs de départ (modification d'une baie existante). */
  initial?: Partial<BayFormValues>;
  /** Libellé du champ nom (défaut : « Nom de la baie »). */
  nameLabel?: string;
  /** Libellé du bouton de validation (défaut : « Créer la baie »). */
  confirmLabel?: string;
  /** Propose le choix de la numérotation des U. */
  showNumbering?: boolean;
  /** Motif d'un refus renvoyé par l'appelant (ex. équipements hors de la nouvelle hauteur). */
  error?: string | null;
}

const PRESET_HEIGHTS = [6, 12, 18, 24, 42, 48];
const MAX_HEIGHT = 100;

export function BayCreateModal({
  onConfirm, onCancel, title = "Nouvelle Baie", defaultName = "", initial,
  nameLabel = "Nom de la baie", confirmLabel = "Créer la baie", showNumbering = false, error = null,
}: BayCreateModalProps) {
  const initialHeight = initial?.heightU ?? 42;
  const initialIsPreset = PRESET_HEIGHTS.includes(initialHeight);
  const [name, setName] = useState(initial?.name ?? defaultName);
  const [widthInch, setWidthInch] = useState<10 | 19>(initial?.widthInch ?? 19);
  const [heightU, setHeightU] = useState<number>(initialIsPreset ? initialHeight : 42);
  const [customHeight, setCustomHeight] = useState(initialIsPreset ? "" : String(initialHeight));
  const [useCustomHeight, setUseCustomHeight] = useState(!initialIsPreset);
  const [numberingFromBottom, setNumberingFromBottom] = useState(initial?.numberingFromBottom ?? true);

  const parsedCustom = parseInt(customHeight);
  const resolvedHeight = useCustomHeight ? parsedCustom : heightU;
  const heightInvalid = !Number.isInteger(resolvedHeight) || resolvedHeight < 1 || resolvedHeight > MAX_HEIGHT;

  const handleConfirm = () => {
    if (heightInvalid) return;
    onConfirm({
      name: name.trim() || `Baie ${widthInch}" ${resolvedHeight}U`,
      widthInch,
      heightU: resolvedHeight,
      numberingFromBottom,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box bay-create-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>

        <div className="modal-field">
          <label>{nameLabel}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Baie ${widthInch}" ${Number.isInteger(resolvedHeight) ? resolvedHeight : "?"}U`}
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
              max={MAX_HEIGHT}
              value={customHeight}
              onChange={(e) => setCustomHeight(e.target.value)}
              placeholder="Ex : 30"
              className="bay-create-custom-height"
              aria-invalid={customHeight !== "" && heightInvalid}
            />
          )}
          {useCustomHeight && customHeight !== "" && heightInvalid && (
            <div className="bay-create-error" role="alert">La hauteur doit être comprise entre 1 et {MAX_HEIGHT} U.</div>
          )}
        </div>

        {showNumbering && (
          <div className="modal-field">
            <label>Numérotation des U</label>
            <div className="bay-create-width-group">
              <button
                className={`bay-create-width-btn${numberingFromBottom ? " active" : ""}`}
                onClick={() => setNumberingFromBottom(true)}
                type="button"
              >
                1 en bas
              </button>
              <button
                className={`bay-create-width-btn${!numberingFromBottom ? " active" : ""}`}
                onClick={() => setNumberingFromBottom(false)}
                type="button"
              >
                1 en haut
              </button>
            </div>
          </div>
        )}

        {error && <div className="bay-create-error" role="alert">{error}</div>}

        <div className="modal-actions">
          <button onClick={onCancel} type="button">Annuler</button>
          <button
            onClick={handleConfirm}
            type="button"
            className="primary"
            disabled={heightInvalid}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

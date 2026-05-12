import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { BayAccessory } from "./bay-accessories";

interface BayAccessoryEditorProps {
  initial?: BayAccessory;
  onSave: (data: Omit<BayAccessory, "id">) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

type FormData = Omit<BayAccessory, "id">;

export function BayAccessoryEditor({ initial, onSave, onCancel, onDelete }: BayAccessoryEditorProps) {
  const [form, setForm] = useState<FormData>({
    label: initial?.label ?? "",
    manufacturer: initial?.manufacturer ?? "Generic",
    reference: initial?.reference ?? "",
    category: initial?.category ?? "",
    heightU: initial?.heightU ?? 1,
    widthCols: initial?.widthCols ?? 4,
    color: initial?.color ?? "#3a3d44",
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const patch = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canSave = form.label.trim().length > 0;

  return createPortal(
    <div className="bay-prop-overlay" onMouseDown={onCancel}>
      <div className="bay-properties" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bay-props-header">
          <h3 className="bay-props-title">
            {initial ? "Modifier l'accessoire" : "Nouvel accessoire"}
          </h3>
          <button className="bay-props-close" onClick={onCancel} title="Fermer (Echap)">✕</button>
        </div>

        <div className="bay-prop-group">
          <label>Label *</label>
          <input
            type="text"
            value={form.label}
            autoFocus
            placeholder="Cache 1U"
            onChange={(e) => patch("label", e.target.value)}
          />
        </div>

        <div className="bay-prop-group">
          <label>Catégorie</label>
          <input
            type="text"
            value={form.category}
            placeholder="Cache"
            onChange={(e) => patch("category", e.target.value)}
          />
        </div>

        <div className="bay-prop-group">
          <label>Fabricant</label>
          <input
            type="text"
            value={form.manufacturer}
            onChange={(e) => patch("manufacturer", e.target.value)}
          />
        </div>

        <div className="bay-prop-group">
          <label>Référence</label>
          <input
            type="text"
            value={form.reference}
            onChange={(e) => patch("reference", e.target.value)}
          />
        </div>

        <div className="bay-prop-group bay-prop-row">
          <div>
            <label>Hauteur (U)</label>
            <input
              type="number"
              min={1}
              max={48}
              value={form.heightU}
              onChange={(e) => patch("heightU", Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          <div>
            <label>Largeur</label>
            <select
              value={form.widthCols}
              onChange={(e) => patch("widthCols", parseInt(e.target.value) as 1 | 2 | 4)}
            >
              <option value={4}>Pleine largeur</option>
              <option value={2}>Demi-largeur</option>
              <option value={1}>Quart</option>
            </select>
          </div>
        </div>

        <div className="bay-prop-group">
          <label>Couleur dans le rack</label>
          <input
            type="color"
            value={form.color ?? "#3a3d44"}
            onChange={(e) => patch("color", e.target.value)}
          />
        </div>

        <div className="bay-acc-editor-actions">
          <button
            className="bay-acc-save-btn"
            onClick={() => canSave && onSave(form)}
            disabled={!canSave}
          >
            Enregistrer
          </button>
          {onDelete && (
            <button className="bay-prop-delete bay-acc-delete-btn" onClick={onDelete}>
              🗑 Supprimer
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

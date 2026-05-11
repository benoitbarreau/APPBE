import { useAppStore } from "../../store";
import type { RackAnnotations, RackItem, Tab } from "../../types";

interface BayItemPropertiesProps {
  tab: Tab;
  selectedItemId: string | null;
  onDeselect: () => void;
}

const ANNOTATION_FIELDS: { key: keyof RackAnnotations; label: string }[] = [
  { key: "comment", label: "Commentaire" },
  { key: "powerA", label: "Alimentation A" },
  { key: "powerB", label: "Alimentation B" },
  { key: "outlet", label: "Prise secteur" },
  { key: "switchPort", label: "Port switch" },
  { key: "vlan", label: "VLAN" },
  { key: "ip", label: "Adresse IP" },
  { key: "location", label: "Emplacement" },
  { key: "note", label: "Note" },
];

export function BayItemProperties({ tab, selectedItemId, onDeselect }: BayItemPropertiesProps) {
  const updateBayConfig = useAppStore((s) => s.updateBayConfig);
  const updateRackItem = useAppStore((s) => s.updateRackItem);
  const removeRackItem = useAppStore((s) => s.removeRackItem);

  const item = (tab.bayItems ?? []).find((it) => it.id === selectedItemId);

  const patchItem = (patch: Partial<RackItem>) => {
    if (!item) return;
    updateRackItem(tab.id, item.id, patch);
  };

  const patchAnnotation = (key: keyof RackAnnotations, value: string) => {
    if (!item) return;
    updateRackItem(tab.id, item.id, {
      annotations: { ...(item.annotations ?? {}), [key]: value || undefined },
    });
  };

  // ── Panneau de config de la baie (rien de sélectionné) ─────────────────
  if (!item) {
    return (
      <div className="bay-properties">
        <h3 className="bay-props-title">Paramètres</h3>

        <div className="bay-prop-group">
          <label>Largeur</label>
          <div className="bay-create-width-group">
            <button
              className={`bay-create-width-btn${tab.bayWidthInch === 19 ? " active" : ""}`}
              onClick={() => updateBayConfig(tab.id, { bayWidthInch: 19 })}
            >
              19"
            </button>
            <button
              className={`bay-create-width-btn${tab.bayWidthInch === 10 ? " active" : ""}`}
              onClick={() => updateBayConfig(tab.id, { bayWidthInch: 10 })}
            >
              10"
            </button>
          </div>
        </div>

        <div className="bay-prop-group">
          <label>Hauteur (U)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={tab.bayHeightU ?? 42}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (v > 0 && v <= 100) updateBayConfig(tab.id, { bayHeightU: v });
            }}
          />
        </div>

        <div className="bay-prop-group">
          <label>Numérotation</label>
          <div className="bay-create-width-group">
            <button
              className={`bay-create-width-btn${tab.bayNumberingFromBottom !== false ? " active" : ""}`}
              onClick={() => updateBayConfig(tab.id, { bayNumberingFromBottom: true })}
            >
              Bas → Haut
            </button>
            <button
              className={`bay-create-width-btn${tab.bayNumberingFromBottom === false ? " active" : ""}`}
              onClick={() => updateBayConfig(tab.id, { bayNumberingFromBottom: false })}
            >
              Haut → Bas
            </button>
          </div>
        </div>

        <div className="bay-props-hint">
          Cliquez sur un équipement dans la baie pour éditer ses propriétés.
        </div>
      </div>
    );
  }

  // ── Propriétés de l'élément sélectionné ────────────────────────────────
  return (
    <div className="bay-properties">
      <div className="bay-props-header">
        <h3 className="bay-props-title">Propriétés</h3>
        <button className="bay-props-close" onClick={onDeselect} title="Fermer">✕</button>
      </div>

      <div className="bay-prop-group">
        <label>Label</label>
        <input
          type="text"
          value={item.label ?? ""}
          onChange={(e) => patchItem({ label: e.target.value || undefined })}
          placeholder={item.reference ?? "—"}
        />
      </div>

      <div className="bay-prop-group">
        <label>Fabricant</label>
        <div className="bay-prop-readonly">{item.manufacturer ?? "—"}</div>
      </div>

      <div className="bay-prop-group">
        <label>Référence</label>
        <div className="bay-prop-readonly">{item.reference ?? "—"}</div>
      </div>

      <div className="bay-prop-group bay-prop-row">
        <div>
          <label>Position (U)</label>
          <input
            type="number"
            min={1}
            max={tab.bayHeightU ?? 42}
            value={item.uStart}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (v >= 1 && v <= (tab.bayHeightU ?? 42)) patchItem({ uStart: v });
            }}
          />
        </div>
        <div>
          <label>Hauteur (U)</label>
          <input
            type="number"
            min={1}
            max={tab.bayHeightU ?? 42}
            value={item.heightU}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (v >= 1) patchItem({ heightU: v });
            }}
          />
        </div>
      </div>

      <div className="bay-prop-group bay-prop-row">
        <div>
          <label>Largeur</label>
          <select
            value={item.widthCols}
            onChange={(e) => patchItem({ widthCols: parseInt(e.target.value) as 1 | 2 | 4 })}
          >
            <option value={4}>Pleine largeur</option>
            <option value={2}>Demi-largeur</option>
            <option value={1}>Quart</option>
          </select>
        </div>
        <div>
          <label>Colonne</label>
          <select
            value={item.colStart}
            onChange={(e) => patchItem({ colStart: parseInt(e.target.value) as 0 | 1 | 2 | 3 })}
          >
            <option value={0}>0</option>
            {item.widthCols <= 2 && <option value={1}>1</option>}
            {item.widthCols <= 2 && <option value={2}>2</option>}
            {item.widthCols === 1 && <option value={3}>3</option>}
          </select>
        </div>
      </div>

      <div className="bay-prop-group bay-prop-row">
        <div>
          <label>Couleur</label>
          <input
            type="color"
            value={item.color ?? "#444444"}
            onChange={(e) => patchItem({ color: e.target.value })}
          />
        </div>
        <div className="bay-prop-lock">
          <label>
            <input
              type="checkbox"
              checked={item.locked ?? false}
              onChange={(e) => patchItem({ locked: e.target.checked })}
            />
            &nbsp;Verrouillé
          </label>
        </div>
      </div>

      {/* ── Annotations ────────────────────────────────────────────────── */}
      <div className="bay-prop-section-title">Annotations</div>
      {ANNOTATION_FIELDS.map(({ key, label }) => (
        <div key={key} className="bay-prop-group bay-prop-annotation">
          <label>{label}</label>
          <input
            type="text"
            value={item.annotations?.[key] ?? ""}
            onChange={(e) => patchAnnotation(key, e.target.value)}
            placeholder="—"
          />
        </div>
      ))}

      {/* ── Actions ────────────────────────────────────────────────────── */}
      <div className="bay-prop-actions">
        <button
          className="bay-prop-delete"
          onClick={() => {
            removeRackItem(tab.id, item.id);
            onDeselect();
          }}
        >
          🗑 Supprimer
        </button>
      </div>
    </div>
  );
}

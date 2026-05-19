import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAppStore, useEditorState } from "../../store";
import type { Rack, RackAnnotations, RackItem, Tab } from "../../types";
import { ensureRacks, isIPTableTab } from "../../types";

interface BayItemPropertiesProps {
  tab: Tab;
  rack: Rack | null;
  selectedItemId: string | null;
  onDeselect: () => void;
}

/** Champs annotation visibles dans la modal, dans l'ordre demandé. */
const ANNOTATION_FIELDS: { key: keyof RackAnnotations; label: string }[] = [
  { key: "comment",    label: "Commentaire" },
  { key: "ip",         label: "Adresse IP" },
  { key: "switchPort", label: "Port Switch" },
  { key: "vlan",       label: "VLAN" },
  { key: "serial",     label: "N° Série" },
];

export function BayItemProperties({ tab, rack, selectedItemId, onDeselect }: BayItemPropertiesProps) {
  const updateRackItem = useAppStore((s) => s.updateRackItem);
  const removeRackItem = useAppStore((s) => s.removeRackItem);
  const updateIPRow    = useAppStore((s) => s.updateIPRow);
  const allTabs        = useAppStore((s) => s.tabs);
  const readOnly       = useEditorState((s) => s.readOnly);

  // Cherche l'item dans la baie sélectionnée, ou dans toutes les baies de l'onglet
  const item = (rack?.items ?? ensureRacks(tab).flatMap((r) => r.items))
    .find((it) => it.id === selectedItemId) ?? null;
  const rackHeightU = rack?.heightU ?? tab.bayHeightU ?? 42;

  /**
   * Ligne du Tableau IP correspondant au produit synoptique (le cas échéant).
   * Utilisé pour lier directement les champs Adresse IP et N° Série à la source
   * de vérité, plutôt qu'à une annotation locale.
   */
  const ipLink = useMemo(() => {
    if (!item || item.sourceType !== "synoptic" || !item.nodeId) return null;
    for (const t of allTabs) {
      if (!isIPTableTab(t)) continue;
      const row = (t.rows ?? []).find((r) => r.productInstanceIds.includes(item.nodeId!));
      if (row) {
        return {
          tabId: t.id,
          rowId: row.id,
          ip: row.ip ?? "",
          serial: row.serialNumber ?? "",
        };
      }
    }
    return null;
  }, [allTabs, item]);

  const patchItem = (patch: Partial<RackItem>) => {
    if (!item || readOnly) return;
    updateRackItem(tab.id, item.id, patch);
  };

  const patchAnnotation = (key: keyof RackAnnotations, value: string) => {
    if (!item || readOnly) return;
    updateRackItem(tab.id, item.id, {
      annotations: { ...(item.annotations ?? {}), [key]: value || undefined },
    });
  };

  /**
   * Valeur affichée pour un champ annotation.
   * - IP et N° Série : préfère la valeur du Tableau IP si l'item est lié à
   *   un produit synoptique présent dans un Tableau IP. Sinon, fallback sur
   *   l'annotation locale.
   * - Autres champs : annotation locale.
   */
  const valueFor = (key: keyof RackAnnotations): string => {
    if (key === "ip" && ipLink)     return ipLink.ip;
    if (key === "serial" && ipLink) return ipLink.serial;
    return item?.annotations?.[key] ?? "";
  };

  /** Mise à jour d'un champ : route vers Tableau IP pour IP/Série quand lié. */
  const setFieldValue = (key: keyof RackAnnotations, value: string) => {
    if (readOnly) return;
    if (key === "ip" && ipLink) {
      updateIPRow(ipLink.tabId, ipLink.rowId, { ip: value });
      return;
    }
    if (key === "serial" && ipLink) {
      updateIPRow(ipLink.tabId, ipLink.rowId, { serialNumber: value });
      return;
    }
    patchAnnotation(key, value);
  };

  // Fermeture par touche Escape
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDeselect(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, onDeselect]);

  // Rien de sélectionné → pas de modal
  if (!item) return null;

  // ── Modal propriétés de l'élément sélectionné ──────────────────────────
  return createPortal(
    <div className="bay-prop-overlay" onMouseDown={onDeselect}>
    <div className="bay-properties" onMouseDown={(e) => e.stopPropagation()}>
      <div className="bay-props-header">
        <h3 className="bay-props-title">
          Propriétés{readOnly && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, opacity: 0.65 }}>👁 lecture seule</span>}
        </h3>
        <button className="bay-props-close" onClick={onDeselect} title="Fermer (Echap)">✕</button>
      </div>

      <div className="bay-prop-group">
        <label>Label</label>
        <input
          type="text"
          value={item.label ?? ""}
          onChange={(e) => patchItem({ label: e.target.value || undefined })}
          placeholder={item.reference ?? "—"}
          readOnly={readOnly}
          disabled={readOnly}
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
            max={rackHeightU}
            value={item.uStart}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (v >= 1 && v <= rackHeightU) patchItem({ uStart: v });
            }}
            readOnly={readOnly}
            disabled={readOnly}
          />
        </div>
        <div>
          <label>Hauteur (U)</label>
          <input
            type="number"
            min={1}
            max={rackHeightU}
            value={item.heightU}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (v >= 1) patchItem({ heightU: v });
            }}
            readOnly={readOnly}
            disabled={readOnly}
          />
        </div>
      </div>

      <div className="bay-prop-group bay-prop-row">
        <div>
          <label>Largeur</label>
          <select
            value={item.widthCols}
            onChange={(e) => patchItem({ widthCols: parseInt(e.target.value) as 1 | 2 | 4 })}
            disabled={readOnly}
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
            disabled={readOnly}
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
            disabled={readOnly}
          />
        </div>
        <div className="bay-prop-lock">
          <label>
            <input
              type="checkbox"
              checked={item.locked ?? false}
              onChange={(e) => patchItem({ locked: e.target.checked })}
              disabled={readOnly}
            />
            &nbsp;Verrouillé
          </label>
        </div>
      </div>

      {/* ── Annotations ────────────────────────────────────────────────── */}
      <div className="bay-prop-section-title">Annotations</div>

      {ANNOTATION_FIELDS.map(({ key, label }) => {
        const linked = ipLink && (key === "ip" || key === "serial");
        return (
          <div key={key} className="bay-prop-group bay-prop-annotation">
            <label>
              {label}
              {linked && (
                <span className="bay-prop-iplink-badge" title="Lié au Tableau IP">📋</span>
              )}
            </label>
            <input
              type="text"
              value={valueFor(key)}
              onChange={(e) => setFieldValue(key, e.target.value)}
              placeholder="—"
              readOnly={readOnly}
              disabled={readOnly}
            />
          </div>
        );
      })}

      {/* ── Actions — masquées en mode lecteur ─────────────────────────── */}
      {!readOnly && (
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
      )}
    </div>
    </div>,
    document.body,
  );
}

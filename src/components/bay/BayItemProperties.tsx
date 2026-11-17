import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore, useEditorState } from "../../store";
import type { Rack, RackAnnotations, RackItem, Tab } from "../../types";
import { ensureRacks, isIPTableTab } from "../../types";
import { fitColumn, placementProblem, productRackSize, uLabel, uStartFromLabel } from "../../lib/rackLayout";

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

  const products       = useAppStore((s) => s.products);
  // Message quand une position ou une taille demandée est refusée.
  const [placeError, setPlaceError] = useState<string | null>(null);
  useEffect(() => { setPlaceError(null); }, [selectedItemId]);

  // Cherche l'item dans la baie sélectionnée, ou dans toutes les baies de l'onglet
  const item = (rack?.items ?? ensureRacks(tab).flatMap((r) => r.items))
    .find((it) => it.id === selectedItemId) ?? null;
  // Baie qui contient réellement l'équipement (sert aux contrôles de placement).
  const ownerRack = item ? ensureRacks(tab).find((r) => r.items.some((it) => it.id === item.id)) ?? null : null;
  const rackHeightU = ownerRack?.heightU ?? rack?.heightU ?? tab.bayHeightU ?? 42;
  const locked = item?.locked ?? false;

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

  /** Position ou taille : même règle que le glisser-déposer (limites, chevauchement,
   *  format), avec le motif du refus affiché sous les champs. */
  const placeItem = (patch: Partial<Pick<RackItem, "uStart" | "heightU" | "widthCols" | "colStart">>) => {
    if (!item || !ownerRack || readOnly || locked) return;
    const next = { ...item, ...patch };
    // Changer de largeur garde l'équipement dans la baie (colonne recalée à gauche si besoin).
    if (patch.widthCols !== undefined) next.colStart = fitColumn(next.colStart, next.widthCols);
    const problem = placementProblem(ownerRack, next, item.id, productRackSize(products, item.productId));
    if (problem) { setPlaceError(problem); return; }
    setPlaceError(null);
    updateRackItem(tab.id, item.id, { uStart: next.uStart, heightU: next.heightU, widthCols: next.widthCols, colStart: next.colStart });
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
          <NumberDraft
            min={1}
            max={rackHeightU}
            value={ownerRack ? uLabel(ownerRack, item.uStart) : item.uStart}
            // Le numéro saisi suit la numérotation affichée ; la position stockée part du bas.
            onCommit={(v) => { if (ownerRack) placeItem({ uStart: uStartFromLabel(ownerRack, v) }); }}
            disabled={readOnly || locked}
            title="U du bas de l'équipement, selon la numérotation de la baie (validé en quittant le champ ou par Entrée)"
          />
        </div>
        <div>
          <label>Hauteur (U)</label>
          <NumberDraft
            min={1}
            max={rackHeightU}
            value={item.heightU}
            onCommit={(v) => placeItem({ heightU: v })}
            disabled={readOnly || locked}
            title="Validé en quittant le champ ou par Entrée"
          />
        </div>
      </div>

      <div className="bay-prop-group bay-prop-row">
        <div>
          <label>Largeur</label>
          <select
            value={item.widthCols}
            onChange={(e) => placeItem({ widthCols: parseInt(e.target.value) as 1 | 2 | 4 })}
            disabled={readOnly || locked}
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
            onChange={(e) => placeItem({ colStart: parseInt(e.target.value) as 0 | 1 | 2 | 3 })}
            disabled={readOnly || locked}
          >
            <option value={0}>0</option>
            {item.widthCols <= 2 && <option value={1}>1</option>}
            {item.widthCols <= 2 && <option value={2}>2</option>}
            {item.widthCols === 1 && <option value={3}>3</option>}
          </select>
        </div>
      </div>
      {placeError && <div className="bay-prop-error" role="alert">{placeError}</div>}
      {locked && !readOnly && (
        <div className="bay-prop-hint">🔒 Verrouillé : position, taille et suppression bloquées. Décochez « Verrouillé » pour les modifier.</div>
      )}

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
      {!readOnly && !locked && (
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

/** Champ numérique saisi librement puis validé en quittant le champ ou par Entrée :
 *  valider à chaque frappe rejetait les débuts de nombre (« 1 » pour « 12 ») quand
 *  l'emplacement intermédiaire était occupé, et empêchait de taper la valeur voulue. */
function NumberDraft({ value, onCommit, min, max, disabled, title }: {
  value: number;
  onCommit: (v: number) => void;
  min: number;
  max: number;
  disabled: boolean;
  title?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const v = parseInt(draft);
    if (Number.isNaN(v) || v === value) { setDraft(String(value)); return; }
    onCommit(v);
    // Refusé : le champ revient à la valeur réelle (le motif s'affiche sous les champs).
    setDraft(String(value));
  };
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setDraft(String(value)); }}
      readOnly={disabled}
      disabled={disabled}
      title={title}
    />
  );
}

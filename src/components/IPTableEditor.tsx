import { useMemo, useState } from "react";
import { useAppStore, useEditorState } from "../store";
import {
  applyRowFilters,
  applySort,
  dedupeRowsById,
  detectIPDuplicates,
  filterDuplicateIpRows,
  type IPColumn,
} from "../lib/ipTableSync";
import type { IPTableRow } from "../types";
import { isIPTableTab } from "../types";
import { IPTableExportModal } from "./IPTableExportModal";
import { IPTableImportModal } from "./IPTableImportModal";

type ColumnKey =
  | "product"
  | "label"
  | "deviceId"
  | "ip"
  | "ipDante"
  | "ipDanteSec"
  | "login"
  | "password"
  | "serialNumber"
  | "mac"
  | "macDante";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  width?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: "product", label: "PRODUIT", width: "180px" },
  { key: "label", label: "LABEL", width: "120px" },
  { key: "deviceId", label: "ID", width: "80px" },
  { key: "ip", label: "IP", width: "130px" },
  { key: "ipDante", label: "IP DANTE", width: "130px" },
  { key: "ipDanteSec", label: "IP DANTE SEC", width: "130px" },
  { key: "login", label: "LOGIN", width: "100px" },
  { key: "password", label: "MOT DE PASSE", width: "120px" },
  { key: "serialNumber", label: "N° SERIE", width: "120px" },
  { key: "mac", label: "MAC", width: "140px" },
  { key: "macDante", label: "MAC DANTE", width: "140px" },
];

interface NetworkField {
  key: keyof typeof NET_FIELDS;
  label: string;
}
const NET_FIELDS = {
  plageIp: "PLAGE IP",
  dhcp: "DHCP",
  dns: "DNS",
  passerelle: "PASSERELLE",
  ntp: "NTP",
} as const;
const NET_LIST: NetworkField[] = [
  { key: "plageIp", label: "PLAGE IP" },
  { key: "dhcp", label: "DHCP" },
  { key: "dns", label: "DNS" },
  { key: "passerelle", label: "PASSERELLE" },
  { key: "ntp", label: "NTP" },
];

type SortDir = "asc" | "desc";

export function IPTableEditor({ tabId }: { tabId: string }) {
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === tabId));
  const syncIPTable = useAppStore((s) => s.syncIPTable);
  const updateIPRow = useAppStore((s) => s.updateIPRow);
  const addIPRow = useAppStore((s) => s.addIPRow);
  const removeIPRow = useAppStore((s) => s.removeIPRow);
  const updateIPNetwork = useAppStore((s) => s.updateIPNetwork);
  const updateIPTitle = useAppStore((s) => s.updateIPTitle);
  const readOnly = useEditorState((s) => s.readOnly);

  const [filters, setFilters] = useState<Record<ColumnKey, string>>(
    () =>
      Object.fromEntries(COLUMNS.map((c) => [c.key, ""])) as Record<
        ColumnKey,
        string
      >,
  );
  const [sortKey, setSortKey] = useState<ColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  if (!tab || !isIPTableTab(tab)) {
    return (
      <div className="ip-table-empty">
        <p>Cet onglet n'est pas un Tableau IP.</p>
      </div>
    );
  }

  const rawRows = tab.rows ?? [];
  const network = tab.network ?? {
    plageIp: "",
    dhcp: "",
    dns: "",
    passerelle: "",
    ntp: "",
  };
  const documentTitle = tab.documentTitle ?? "";

  // ── Source unique : lignes du tableau, dédupliquées défensivement ───
  // Si pour une raison quelconque deux lignes partagent le même id (bug
  // d'import ou de migration), on n'en garde qu'une — sinon React
  // afficherait des doublons visuels et le tri pourrait sembler fautif.
  const rows = useMemo(() => dedupeRowsById(rawRows), [rawRows]);

  // ── Détection des doublons IP — pure, sans side-effect ──────────────
  const duplicateMap = useMemo(() => detectIPDuplicates(rows), [rows]);
  const hasDuplicates = duplicateMap.size > 0;

  // ── Vue dérivée : filtres → option doublons → tri ───────────────────
  // Toutes les étapes sont des fonctions pures qui retournent une nouvelle
  // référence ; `rows` (source) n'est JAMAIS muté. Cliquer sur un en-tête
  // pour trier change uniquement `sortKey` / `sortDir`, recalcule cette
  // useMemo, et n'invoque AUCUNE action du store.
  const columnKeys = useMemo(() => COLUMNS.map((c) => c.key), []);
  const visibleRows = useMemo<IPTableRow[]>(() => {
    let list: IPTableRow[] = rows;
    list = applyRowFilters(list, filters, columnKeys);
    if (onlyDuplicates) list = filterDuplicateIpRows(list, duplicateMap);
    list = applySort(list, sortKey, sortDir);
    return list;
  }, [rows, filters, columnKeys, onlyDuplicates, duplicateMap, sortKey, sortDir]);

  const onHeaderClick = (key: ColumnKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const clearAllFilters = () => {
    setFilters(
      Object.fromEntries(COLUMNS.map((c) => [c.key, ""])) as Record<
        ColumnKey,
        string
      >,
    );
    setOnlyDuplicates(false);
  };

  /** Suppression d'une ligne — bloquée si l'IP (et non-doublon) ou le N° de
   *  série est renseigné. L'utilisateur doit d'abord vider ces champs pour
   *  confirmer son intention. Les IP en doublon restent supprimables. */
  const handleRemoveRow = (row: IPTableRow) => {
    const ipValue = (row.ip ?? "").trim();
    const serialValue = (row.serialNumber ?? "").trim();
    const ipDup = duplicateMap.get(row.id)?.has("ip") ?? false;
    const ipBlocks = ipValue !== "" && !ipDup;
    const serialBlocks = serialValue !== "";

    if (ipBlocks || serialBlocks) {
      const filled: string[] = [];
      if (ipBlocks) filled.push(`   • IP : ${ipValue}`);
      if (serialBlocks) filled.push(`   • N° SERIE : ${serialValue}`);
      const fieldsLabel =
        ipBlocks && serialBlocks
          ? "les champs IP et N° SERIE"
          : ipBlocks
            ? "le champ IP"
            : "le champ N° SERIE";
      alert(
        `Suppression bloquée.\n\n` +
          `Cette ligne contient des données importantes :\n` +
          filled.join("\n") +
          `\n\nPour supprimer la ligne, videz d'abord ${fieldsLabel}.\n` +
          `Cette protection évite la perte accidentelle de données uniques.`,
      );
      return;
    }
    removeIPRow(tabId, row.id);
  };

  const hasActiveFilter =
    onlyDuplicates || COLUMNS.some((c) => filters[c.key].trim() !== "");

  return (
    <div className="ip-table-editor">
      {/* ── Barre d'actions ────────────────────────────────────── */}
      <div className="ip-table-toolbar">
        <input
          className="ip-table-title-input"
          value={documentTitle}
          onChange={(e) => !readOnly && updateIPTitle(tabId, e.target.value)}
          placeholder="Titre du document — Tableau IP"
          readOnly={readOnly}
        />
        <div className="ip-table-toolbar-actions">
          {!readOnly && (
            <>
              <button onClick={() => syncIPTable(tabId)} title="Recharger depuis les synoptiques">
                ⟳ Synchroniser
              </button>
              <button onClick={() => addIPRow(tabId)} title="Ajouter une ligne manuelle">
                + Ligne
              </button>
              <button onClick={() => setImportOpen(true)} title="Importer un fichier CSV / XLS">
                Importer…
              </button>
            </>
          )}
          <button
            onClick={() => setExportOpen(true)}
            disabled={rows.length === 0}
            title="Exporter / Imprimer le tableau"
            className="primary"
          >
            Exporter ▾
          </button>
        </div>
      </div>

      {/* ── Cartouche réseau ──────────────────────────────────── */}
      <div className="ip-network-block">
        <table className="ip-network-table">
          <thead>
            <tr>
              {NET_LIST.map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {NET_LIST.map((f) => (
                <td key={f.key}>
                  <input
                    value={network[f.key]}
                    placeholder="—"
                    readOnly={readOnly}
                    onChange={(e) =>
                      updateIPNetwork(tabId, { [f.key]: e.target.value })
                    }
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Bandeau de doublons / filtres ─────────────────────── */}
      <div className="ip-table-status-bar">
        <div>
          <strong>{visibleRows.length}</strong> ligne(s) affichée(s) sur{" "}
          {rows.length}
          {hasDuplicates && (
            <span className="ip-dup-badge" title="Au moins une IP est en doublon">
              ⚠ {duplicateMap.size} ligne(s) avec IP en doublon
            </span>
          )}
        </div>
        <div className="ip-table-status-actions">
          {hasDuplicates && (
            <label className="ip-only-dups">
              <input
                type="checkbox"
                checked={onlyDuplicates}
                onChange={(e) => setOnlyDuplicates(e.target.checked)}
              />
              Afficher uniquement les doublons
            </label>
          )}
          {hasActiveFilter && (
            <button onClick={clearAllFilters}>Effacer les filtres</button>
          )}
        </div>
      </div>

      {/* ── Tableau principal ─────────────────────────────────── */}
      <div className="ip-table-wrap">
        <table className="ip-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width, minWidth: c.width }}
                  className="sortable"
                  onClick={() => onHeaderClick(c.key)}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span className="sort-indicator">
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </th>
              ))}
              <th className="ip-col-actions">&nbsp;</th>
            </tr>
            {/* Ligne de filtres */}
            <tr className="ip-filter-row">
              {COLUMNS.map((c) => (
                <th key={c.key}>
                  <input
                    className="ip-filter-input"
                    value={filters[c.key]}
                    placeholder="🔍"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setFilters({ ...filters, [c.key]: e.target.value })
                    }
                  />
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <IPRow
                key={row.id}
                tabId={tabId}
                row={row}
                duplicates={duplicateMap.get(row.id) ?? new Set<IPColumn>()}
                readOnly={readOnly}
                onChange={(patch) => updateIPRow(tabId, row.id, patch)}
                onRemove={() => handleRemoveRow(row)}
              />
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="ip-table-empty-row">
                  {rows.length === 0
                    ? "Aucune ligne. Ajoutez-en avec « + Ligne » ou « ⟳ Synchroniser »."
                    : "Aucune ligne ne correspond aux filtres."}
                </td>
              </tr>
            )}
            {/* Pied de tableau : bouton « + Ligne » sous la dernière ligne, à gauche */}
            {!readOnly && (
              <tr className="ip-add-row-tr">
                <td colSpan={COLUMNS.length + 1} className="ip-add-row-cell">
                  <button
                    className="ip-add-row-btn"
                    onClick={() => addIPRow(tabId)}
                    title="Ajouter une ligne manuelle"
                  >
                    + Ligne
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {exportOpen && (
        <IPTableExportModal
          tabId={tabId}
          rows={rows}
          visibleRows={visibleRows}
          columns={COLUMNS}
          network={network}
          documentTitle={documentTitle}
          onClose={() => setExportOpen(false)}
        />
      )}
      {importOpen && (
        <IPTableImportModal
          tabId={tabId}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

/** Une ligne du tableau IP — extrait pour limiter les re-renders. */
function IPRow({
  row,
  duplicates,
  readOnly,
  onChange,
  onRemove,
}: {
  tabId: string;
  row: IPTableRow;
  duplicates: Set<IPColumn>;
  readOnly: boolean;
  onChange: (patch: Partial<IPTableRow>) => void;
  onRemove: () => void;
}) {
  return (
    <tr className={row.manual ? "ip-row-manual" : "ip-row-auto"}>
      {COLUMNS.map((col) => {
        const isDup =
          (col.key === "ip" || col.key === "ipDante" || col.key === "ipDanteSec") &&
          duplicates.has(col.key as IPColumn);
        return (
          <td
            key={col.key}
            className={isDup ? "ip-cell-dup" : undefined}
            title={isDup ? "Cette IP est en doublon avec une autre cellule." : undefined}
          >
            <input
              value={row[col.key] ?? ""}
              readOnly={readOnly}
              placeholder=""
              onChange={(e) => onChange({ [col.key]: e.target.value })}
            />
          </td>
        );
      })}
      <td className="ip-col-actions">
        {!readOnly && (() => {
          const ipFilled = (row.ip ?? "").trim() !== "";
          const ipDup = duplicates.has("ip");
          const ipBlocks = ipFilled && !ipDup;
          const serialBlocks = (row.serialNumber ?? "").trim() !== "";
          const blocked = ipBlocks || serialBlocks;
          const fields =
            ipBlocks && serialBlocks
              ? "les champs IP et N° SERIE"
              : ipBlocks
                ? "le champ IP"
                : "le champ N° SERIE";
          return (
            <button
              className={`danger ip-remove-btn${blocked ? " ip-remove-btn-blocked" : ""}`}
              onClick={onRemove}
              title={
                blocked
                  ? `Suppression bloquée — videz d'abord ${fields}`
                  : "Supprimer cette ligne"
              }
            >
              {blocked ? "🔒" : "✕"}
            </button>
          );
        })()}
      </td>
    </tr>
  );
}

export { COLUMNS as IP_TABLE_COLUMNS };
export type { ColumnKey as IPColumnKey, ColumnDef as IPColumnDef };

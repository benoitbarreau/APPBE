import { useRef, useMemo, useState } from "react";
import { useAppStore, useEditorState } from "../store";
import {
  applySort,
  dedupeRowsById,
  detectIPDuplicates,
  filterDuplicateIpRows,
  type IPColumn,
} from "../lib/ipTableSync";
import type { IPTableColumnConfig, IPTableRow } from "../types";
import { DEFAULT_IP_TABLE_COLUMNS, isIPTableTab } from "../types";
import { IPTableExportModal } from "./IPTableExportModal";
import { IPTableImportModal } from "./IPTableImportModal";

// ── Types ──────────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

// Colonnes fixes (ID = clé de IPTableRow)
const FIXED_IDS = new Set([
  "product", "label", "deviceId", "ip", "ipDante",
  "ipDanteSec", "login", "password", "serialNumber", "mac", "macDante",
]);

// Colonnes "doublon IP" (mise en évidence)
const IP_DUP_COLS = new Set(["ip", "ipDante", "ipDanteSec"]);

interface NetworkField { key: keyof typeof NET_FIELDS; label: string }
const NET_FIELDS = {
  plageIp: "PLAGE IP", dhcp: "DHCP", dns: "DNS",
  passerelle: "PASSERELLE", ntp: "NTP",
} as const;
const NET_LIST: NetworkField[] = [
  { key: "plageIp", label: "PLAGE IP" }, { key: "dhcp",      label: "DHCP" },
  { key: "dns",     label: "DNS" },      { key: "passerelle", label: "PASSERELLE" },
  { key: "ntp",     label: "NTP" },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function getCellValue(row: IPTableRow, colId: string): string {
  if (FIXED_IDS.has(colId)) return (row as unknown as Record<string, string>)[colId] ?? "";
  return row.customFields?.[colId] ?? "";
}

// ── Composant principal ────────────────────────────────────────────────────

export function IPTableEditor({ tabId }: { tabId: string }) {
  const tab        = useAppStore((s) => s.tabs.find((t) => t.id === tabId));
  const allTabs    = useAppStore((s) => s.tabs);
  const allZones   = useAppStore((s) => s.zones);
  const ipTableColumns   = useAppStore((s) => s.ipTableColumns);
  const setIPTableColumns = useAppStore((s) => s.setIPTableColumns);
  const addIPTableColumn  = useAppStore((s) => s.addIPTableColumn);
  const syncIPTable  = useAppStore((s) => s.syncIPTable);
  const updateIPRow  = useAppStore((s) => s.updateIPRow);
  const addIPRow     = useAppStore((s) => s.addIPRow);
  const removeIPRow  = useAppStore((s) => s.removeIPRow);
  const updateIPNetwork = useAppStore((s) => s.updateIPNetwork);
  const updateIPTitle   = useAppStore((s) => s.updateIPTitle);
  const readOnly = useEditorState((s) => s.readOnly);

  // ── UI état local ────────────────────────────────────────────────────────
  const visibleCols = useMemo(
    () => ipTableColumns.filter((c) => c.visible),
    [ipTableColumns],
  );
  const hiddenCols = useMemo(
    () => ipTableColumns.filter((c) => !c.visible),
    [ipTableColumns],
  );

  const [filters, setFilters] = useState<Record<string, string>>(() =>
    Object.fromEntries(ipTableColumns.map((c) => [c.id, ""])),
  );
  const [sortKey,  setSortKey]  = useState<string | null>(null);
  const [sortDir,  setSortDir]  = useState<SortDir>("asc");
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // ── Gestionnaire de colonnes ─────────────────────────────────────────────
  const [colMgrOpen, setColMgrOpen] = useState(false);
  const [addingCol,  setAddingCol]  = useState(false);
  const [newColLabel, setNewColLabel] = useState("");
  const newColInputRef = useRef<HTMLInputElement>(null);

  // ── Drag & drop colonnes ─────────────────────────────────────────────────
  const draggedColId  = useRef<string | null>(null);
  const [dragOverId,  setDragOverId]  = useState<string | null>(null);

  const onColDragStart = (e: React.DragEvent, id: string) => {
    draggedColId.current = id;
    e.dataTransfer.effectAllowed = "move";
  };
  const onColDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== draggedColId.current) setDragOverId(id);
  };
  const onColDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const srcId = draggedColId.current;
    if (!srcId || srcId === targetId) { setDragOverId(null); return; }
    const cols = [...ipTableColumns];
    const srcIdx = cols.findIndex((c) => c.id === srcId);
    const tgtIdx = cols.findIndex((c) => c.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) { setDragOverId(null); return; }
    const [moved] = cols.splice(srcIdx, 1);
    cols.splice(tgtIdx, 0, moved);
    setIPTableColumns(cols);
    setDragOverId(null);
    draggedColId.current = null;
  };
  const onColDragEnd = () => {
    draggedColId.current = null;
    setDragOverId(null);
  };

  // ── Masquer / afficher une colonne ───────────────────────────────────────
  const hideColumn = (id: string) =>
    setIPTableColumns(ipTableColumns.map((c) => c.id === id ? { ...c, visible: false } : c));
  const showColumn = (id: string) =>
    setIPTableColumns(ipTableColumns.map((c) => c.id === id ? { ...c, visible: true } : c));
  const deleteCustomColumn = (id: string) =>
    setIPTableColumns(ipTableColumns.filter((c) => c.id !== id));

  // ── Ajout d'une colonne ──────────────────────────────────────────────────
  const commitAddCol = () => {
    const lbl = newColLabel.trim();
    if (lbl) {
      addIPTableColumn(lbl);
      setFilters((f) => ({ ...f })); // on laissera le filtre vide par défaut
    }
    setNewColLabel("");
    setAddingCol(false);
  };

  // ── Réinitialiser les colonnes ───────────────────────────────────────────
  const resetColumns = () => {
    if (!confirm("Réinitialiser les colonnes à la structure par défaut ?\nLes colonnes personnalisées et leur contenu seront perdus.")) return;
    setIPTableColumns([...DEFAULT_IP_TABLE_COLUMNS]);
  };

  if (!tab || !isIPTableTab(tab)) {
    return (
      <div className="ip-table-empty">
        <p>Cet onglet n'est pas un Tableau IP.</p>
      </div>
    );
  }

  const rawRows = tab.rows ?? [];
  const network = tab.network ?? { plageIp: "", dhcp: "", dns: "", passerelle: "", ntp: "" };
  const documentTitle = tab.documentTitle ?? "";

  const rows = useMemo(() => dedupeRowsById(rawRows), [rawRows]);

  // Couleurs de zones
  const nodeIdToZoneId = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const t of allTabs) {
      if (isIPTableTab(t)) continue;
      for (const node of t.nodes ?? []) m.set(node.id, node.zoneId);
    }
    return m;
  }, [allTabs]);
  const zoneColorById = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of allZones) m.set(z.id, z.color);
    return m;
  }, [allZones]);
  const zoneColorForRow = (row: IPTableRow): string | undefined => {
    for (const iid of row.productInstanceIds) {
      const zid = nodeIdToZoneId.get(iid);
      if (zid) { const c = zoneColorById.get(zid); if (c) return c; }
    }
    return undefined;
  };

  const duplicateMap = useMemo(() => detectIPDuplicates(rows), [rows]);
  const hasDuplicates = duplicateMap.size > 0;

  const visibleRows = useMemo<IPTableRow[]>(() => {
    let list: IPTableRow[] = rows;
    // Filtrer uniquement sur les colonnes visibles
    for (const col of visibleCols) {
      const f = (filters[col.id] ?? "").trim().toLowerCase();
      if (!f) continue;
      list = list.filter((r) => getCellValue(r, col.id).toLowerCase().includes(f));
    }
    if (onlyDuplicates) list = filterDuplicateIpRows(list, duplicateMap);
    list = applySort(list, sortKey, sortDir);
    return list;
  }, [rows, filters, visibleCols, onlyDuplicates, duplicateMap, sortKey, sortDir]);

  const onHeaderClick = (id: string) => {
    if (sortKey === id) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(id); setSortDir("asc"); }
  };

  const clearAllFilters = () => {
    setFilters(Object.fromEntries(ipTableColumns.map((c) => [c.id, ""])));
    setOnlyDuplicates(false);
  };

  const handleRemoveRow = (row: IPTableRow) => {
    const ipValue    = (row.ip ?? "").trim();
    const serialValue = (row.serialNumber ?? "").trim();
    const ipDup  = duplicateMap.get(row.id)?.has("ip") ?? false;
    const ipBlocks  = ipValue !== "" && !ipDup;
    const serialBlocks = serialValue !== "";
    if (ipBlocks || serialBlocks) {
      const filled: string[] = [];
      if (ipBlocks)    filled.push(`   • IP : ${ipValue}`);
      if (serialBlocks) filled.push(`   • N° SERIE : ${serialValue}`);
      const fieldsLabel = ipBlocks && serialBlocks ? "les champs IP et N° SERIE"
        : ipBlocks ? "le champ IP" : "le champ N° SERIE";
      alert(
        `Suppression bloquée.\n\nCette ligne contient des données importantes :\n` +
        filled.join("\n") +
        `\n\nPour supprimer la ligne, videz d'abord ${fieldsLabel}.\n` +
        `Cette protection évite la perte accidentelle de données uniques.`,
      );
      return;
    }
    removeIPRow(tabId, row.id);
  };

  const hasActiveFilter =
    onlyDuplicates || visibleCols.some((c) => (filters[c.id] ?? "").trim() !== "");

  return (
    <div className="ip-table-editor">
      {/* ── Barre d'actions ─────────────────────────────────────────── */}
      <div className="ip-table-toolbar">
        <input
          className="ip-table-title-input"
          value={documentTitle}
          onChange={(e) => !readOnly && updateIPTitle(tabId, e.target.value)}
          placeholder="Titre du document — Tableau IP"
          readOnly={readOnly}
        />
        <div className="ip-table-toolbar-actions">
          {/* ── Gestionnaire de colonnes ───────────────────────────── */}
          <div className="ip-col-mgr-wrap">
            <button
              className={`ip-col-mgr-btn${colMgrOpen ? " active" : ""}`}
              onClick={() => setColMgrOpen((v) => !v)}
              title="Gérer les colonnes"
            >
              ⚙ Colonnes{hiddenCols.length > 0 && (
                <span className="ip-col-hidden-badge">{hiddenCols.length}</span>
              )}
            </button>
            {colMgrOpen && (
              <div className="ip-col-mgr-panel">
                <div className="ip-col-mgr-header">
                  <span>Colonnes du tableau</span>
                  <button className="ip-col-mgr-reset" onClick={resetColumns} title="Remettre les colonnes par défaut">↻</button>
                </div>
                <div className="ip-col-mgr-hint muted">
                  Glissez les en-têtes pour réorganiser. Cliquez ✕ pour masquer.
                </div>
                {/* Toutes les colonnes (visibles + masquées) */}
                {ipTableColumns.map((col) => (
                  <div key={col.id} className={`ip-col-mgr-row${col.visible ? "" : " hidden"}`}>
                    <label className="ip-col-mgr-label">
                      <input
                        type="checkbox"
                        checked={col.visible}
                        onChange={() => col.visible ? hideColumn(col.id) : showColumn(col.id)}
                      />
                      <span>{col.label}</span>
                      {col.custom && <span className="ip-col-custom-chip">perso</span>}
                    </label>
                    {col.custom && (
                      <button
                        className="ip-col-mgr-delete danger"
                        onClick={() => {
                          if (confirm(`Supprimer définitivement la colonne "${col.label}" ? Les données seront perdues.`))
                            deleteCustomColumn(col.id);
                        }}
                        title="Supprimer définitivement"
                      >✕</button>
                    )}
                  </div>
                ))}
                {/* Ajout d'une colonne */}
                {!readOnly && (
                  <div className="ip-col-mgr-add">
                    {addingCol ? (
                      <div className="ip-col-add-form">
                        <input
                          ref={newColInputRef}
                          value={newColLabel}
                          onChange={(e) => setNewColLabel(e.target.value)}
                          placeholder="Nom de la colonne"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitAddCol();
                            if (e.key === "Escape") { setAddingCol(false); setNewColLabel(""); }
                          }}
                        />
                        <button onClick={commitAddCol} className="primary">OK</button>
                        <button onClick={() => { setAddingCol(false); setNewColLabel(""); }}>Annuler</button>
                      </div>
                    ) : (
                      <button className="ip-col-add-btn" onClick={() => setAddingCol(true)}>
                        + Ajouter une colonne
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

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

      {/* ── Cartouche réseau ──────────────────────────────────────────── */}
      <div className="ip-network-block">
        <table className="ip-network-table">
          <thead><tr>{NET_LIST.map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
          <tbody>
            <tr>
              {NET_LIST.map((f) => (
                <td key={f.key}>
                  <input
                    value={network[f.key]} placeholder="—" readOnly={readOnly}
                    onChange={(e) => updateIPNetwork(tabId, { [f.key]: e.target.value })}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Bandeau de doublons / filtres ─────────────────────────────── */}
      <div className="ip-table-status-bar">
        <div>
          <strong>{visibleRows.length}</strong> ligne(s) affichée(s) sur {rows.length}
          {hasDuplicates && (
            <span className="ip-dup-badge" title="Au moins une IP est en doublon">
              ⚠ {duplicateMap.size} ligne(s) avec IP en doublon
            </span>
          )}
        </div>
        <div className="ip-table-status-actions">
          {hasDuplicates && (
            <label className="ip-only-dups">
              <input type="checkbox" checked={onlyDuplicates}
                onChange={(e) => setOnlyDuplicates(e.target.checked)} />
              Afficher uniquement les doublons
            </label>
          )}
          {hasActiveFilter && <button onClick={clearAllFilters}>Effacer les filtres</button>}
        </div>
      </div>

      {/* ── Tableau principal ──────────────────────────────────────────── */}
      <div className="ip-table-wrap">
        <table className="ip-table">
          <thead>
            {/* Ligne d'en-têtes (draggable) */}
            <tr>
              {visibleCols.map((col) => (
                <th
                  key={col.id}
                  style={{ width: col.width, minWidth: col.width }}
                  className={[
                    "sortable",
                    "ip-th-draggable",
                    dragOverId === col.id ? "ip-th-drag-over" : "",
                  ].filter(Boolean).join(" ")}
                  draggable={!readOnly}
                  onDragStart={(e) => !readOnly && onColDragStart(e, col.id)}
                  onDragOver={(e) => !readOnly && onColDragOver(e, col.id)}
                  onDrop={(e) => !readOnly && onColDrop(e, col.id)}
                  onDragEnd={onColDragEnd}
                  onClick={() => onHeaderClick(col.id)}
                >
                  <span className="ip-th-label">{col.label}</span>
                  {sortKey === col.id && (
                    <span className="sort-indicator">{sortDir === "asc" ? "▲" : "▼"}</span>
                  )}
                  {!readOnly && (
                    <button
                      className="ip-th-hide-btn"
                      title={`Masquer la colonne "${col.label}"`}
                      onClick={(e) => { e.stopPropagation(); hideColumn(col.id); }}
                    >✕</button>
                  )}
                </th>
              ))}
              <th className="ip-col-actions">&nbsp;</th>
            </tr>
            {/* Ligne de filtres */}
            <tr className="ip-filter-row">
              {visibleCols.map((col) => (
                <th key={col.id}>
                  <input
                    className="ip-filter-input"
                    value={filters[col.id] ?? ""}
                    placeholder="🔍"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setFilters({ ...filters, [col.id]: e.target.value })}
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
                columns={visibleCols}
                duplicates={duplicateMap.get(row.id) ?? new Set<IPColumn>()}
                zoneColor={zoneColorForRow(row)}
                readOnly={readOnly}
                onChange={(patch) => updateIPRow(tabId, row.id, patch)}
                onRemove={() => handleRemoveRow(row)}
              />
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length + 1} className="ip-table-empty-row">
                  {rows.length === 0
                    ? "Aucune ligne. Ajoutez-en avec « + Ligne » ou « ⟳ Synchroniser »."
                    : "Aucune ligne ne correspond aux filtres."}
                </td>
              </tr>
            )}
            {!readOnly && (
              <tr className="ip-add-row-tr">
                <td colSpan={visibleCols.length + 1} className="ip-add-row-cell">
                  <button className="ip-add-row-btn" onClick={() => addIPRow(tabId)}
                    title="Ajouter une ligne manuelle">+ Ligne</button>
                  <button className="ip-add-row-btn ip-sync-row-btn" onClick={() => syncIPTable(tabId)}
                    title="Recharger depuis les synoptiques">⟳ Synchroniser</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {exportOpen && (
        <IPTableExportModal
          tabId={tabId} rows={rows} visibleRows={visibleRows}
          columns={visibleCols}
          network={network} documentTitle={documentTitle}
          onClose={() => setExportOpen(false)}
        />
      )}
      {importOpen && (
        <IPTableImportModal tabId={tabId} onClose={() => setImportOpen(false)} />
      )}
    </div>
  );
}

// ── Conversion hex → rgba ──────────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "transparent";
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── IPRow ──────────────────────────────────────────────────────────────────
function IPRow({
  row, columns, duplicates, zoneColor, readOnly, onChange, onRemove,
}: {
  tabId: string;
  row: IPTableRow;
  columns: IPTableColumnConfig[];
  duplicates: Set<IPColumn>;
  zoneColor?: string;
  readOnly: boolean;
  onChange: (patch: Partial<IPTableRow>) => void;
  onRemove: () => void;
}) {
  const trStyle: React.CSSProperties | undefined = zoneColor
    ? ({
        "--row-zone-color": zoneColor,
        "--zone-bg": hexToRgba(zoneColor, 0.22),
        "--zone-bg-hover": hexToRgba(zoneColor, 0.40),
      } as React.CSSProperties)
    : undefined;
  const className =
    (row.manual ? "ip-row-manual" : "ip-row-auto") + (zoneColor ? " ip-row-zone" : "");

  return (
    <tr className={className} style={trStyle}>
      {columns.map((col) => {
        const isDup = IP_DUP_COLS.has(col.id) && duplicates.has(col.id as IPColumn);
        const value = getCellValue(row, col.id);

        const handleChange = (val: string) => {
          if (FIXED_IDS.has(col.id)) {
            onChange({ [col.id]: val });
          } else {
            // Colonne custom → met à jour customFields
            onChange({ customFields: { ...(row.customFields ?? {}), [col.id]: val } });
          }
        };

        return (
          <td
            key={col.id}
            className={isDup ? "ip-cell-dup" : undefined}
            title={isDup ? "Cette IP est en doublon avec une autre cellule." : undefined}
          >
            <input
              value={value} readOnly={readOnly} placeholder=""
              onChange={(e) => handleChange(e.target.value)}
            />
          </td>
        );
      })}
      <td className="ip-col-actions">
        {!readOnly && (() => {
          const ipFilled  = (row.ip ?? "").trim() !== "";
          const ipDup     = duplicates.has("ip");
          const ipBlocks  = ipFilled && !ipDup;
          const serialBlocks = (row.serialNumber ?? "").trim() !== "";
          const blocked   = ipBlocks || serialBlocks;
          const fields = ipBlocks && serialBlocks ? "les champs IP et N° SERIE"
            : ipBlocks ? "le champ IP" : "le champ N° SERIE";
          return (
            <button
              className={`danger ip-remove-btn${blocked ? " ip-remove-btn-blocked" : ""}`}
              onClick={onRemove}
              title={blocked ? `Suppression bloquée — videz d'abord ${fields}` : "Supprimer cette ligne"}
            >
              {blocked ? "🔒" : "✕"}
            </button>
          );
        })()}
      </td>
    </tr>
  );
}

// ── Exports rétrocompatibilité ─────────────────────────────────────────────
export { DEFAULT_IP_TABLE_COLUMNS as IP_TABLE_COLUMNS };
export type { IPTableColumnConfig as IPColumnDef };

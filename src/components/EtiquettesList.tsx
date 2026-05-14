import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore, useEditorState } from "../store";
import { isSynopticTab } from "../types";

type SortKey = "number" | "label" | "cableType" | "lengthMeters" | "tabName";
type SortDir = "asc" | "desc";

const COLUMNS_DETAIL: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "number",       label: "N°" },
  { key: "label",        label: "Etiquette câble" },
  { key: "tabName",      label: "Synoptique" },
  { key: "cableType",    label: "Type de câble" },
  { key: "lengthMeters", label: "Longueur (m)", align: "right" },
];

const COLUMNS_SIMPLE: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "number",    label: "N°" },
  { key: "tabName",   label: "Synoptique" },
  { key: "cableType", label: "Type de câble" },
];

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Cellule label éditable en double-clic */
function LabelCell({ id, label, readOnly }: { id: string; label: string; readOnly: boolean }) {
  const updateCable = useAppStore((s) => s.updateCable);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    if (readOnly) return;
    setDraft(label); setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };
  const commit = () => {
    setEditing(false);
    if (draft !== label) updateCable(id, { label: draft });
  };
  const cancel = () => { setEditing(false); setDraft(label); };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="etiquette-label-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
        autoFocus
      />
    );
  }
  return (
    <span
      className={`etiquette-label-cell${readOnly ? "" : " editable"}`}
      onDoubleClick={startEdit}
      title={readOnly ? undefined : "Double-clic pour modifier"}
    >
      {label || <span className="muted">—</span>}
    </span>
  );
}

/** Cellule longueur éditable en double-clic. */
function LengthCell({ id, length, readOnly }: { id: string; length: number | undefined; readOnly: boolean }) {
  const updateCable = useAppStore((s) => s.updateCable);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(length === undefined ? "" : String(length));
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    if (readOnly) return;
    setDraft(length === undefined ? "" : String(length));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };
  const commit = () => {
    setEditing(false);
    const next = draft.trim() === "" ? undefined : Number(draft.replace(",", "."));
    if (next !== undefined && Number.isNaN(next)) return;
    if (next !== length) updateCable(id, { lengthMeters: next });
  };
  const cancel = () => { setEditing(false); setDraft(length === undefined ? "" : String(length)); };

  if (editing) {
    return (
      <input
        ref={inputRef} type="number" min={0} step={0.5}
        className="etiquette-label-input etiquette-len-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
        autoFocus
      />
    );
  }
  return (
    <span
      className={`etiquette-label-cell${readOnly ? "" : " editable"}`}
      onDoubleClick={startEdit}
      title={readOnly ? undefined : "Double-clic pour modifier"}
    >
      {length === undefined ? <span className="muted">—</span> : length}
    </span>
  );
}

export function EtiquettesList() {
  const tabs         = useAppStore((s) => s.tabs);
  const activeTabId  = useAppStore((s) => s.activeTabId);
  const activeCables = useAppStore((s) => s.cables);
  const readOnly             = useEditorState((s) => s.readOnly);
  const cableView            = useEditorState((s) => s.cableView);
  const setCableView         = useEditorState((s) => s.setCableView);
  const cableLabelsHidden    = useEditorState((s) => s.cableLabelsHidden);
  const setCableLabelsHidden = useEditorState((s) => s.setCableLabelsHidden);
  const detailed             = cableView === "detailed";
  const [sortKey, setSortKey] = useState<SortKey>("number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Fermeture du menu Export au clic extérieur
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [exportMenuOpen]);

  const COLUMNS = detailed ? COLUMNS_DETAIL : COLUMNS_SIMPLE;

  /** Agrégation depuis tous les synoptiques. */
  const rows = useMemo(() => {
    const list: {
      id: string; number: string; label: string;
      cableType: string; lengthMeters: number | undefined;
      tabId: string; tabName: string; editable: boolean;
    }[] = [];

    for (const t of tabs) {
      if (!isSynopticTab(t)) continue;
      const isActive = t.id === activeTabId;
      const cables   = isActive ? activeCables : (t.cables ?? []);

      for (const c of cables) {
        list.push({
          id: c.id,
          number:      c.number ?? "",
          label:       c.label  ?? "",
          cableType:   c.cableType,
          lengthMeters: c.lengthMeters,
          tabId:   t.id,
          tabName: t.name,
          editable: isActive,
        });
      }
    }

    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const aEmpty = av === undefined || av === "";
      const bEmpty = bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), "fr", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [tabs, activeTabId, activeCables, sortKey, sortDir]);

  const onHeaderClick = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const cellValue = (r: (typeof rows)[number], key: SortKey): string => {
    const v = r[key as keyof typeof r];
    return v === undefined || v === null ? "" : String(v);
  };

  const exportCsv = () => {
    const header = COLUMNS.map((c) => c.label).join(";");
    const lines  = rows.map((r) =>
      COLUMNS.map((c) => `"${cellValue(r, c.key).replace(/"/g, '""')}"`).join(";"),
    );
    downloadFile("etiquettes-cables.csv", "﻿" + [header, ...lines].join("\n"), "text/csv;charset=utf-8");
  };

  const exportXls = () => {
    const escape = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const headerRow = COLUMNS.map((c) => `<th>${escape(c.label)}</th>`).join("");
    const bodyRows  = rows.map((r) =>
      "<tr>" + COLUMNS.map((c) => `<td>${escape(cellValue(r, c.key))}</td>`).join("") + "</tr>",
    ).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" /></head>
<body><table border="1"><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
    downloadFile("etiquettes-cables.xls", html, "application/vnd.ms-excel");
  };

  const handleExportCsv = () => { setExportMenuOpen(false); exportCsv(); };
  const handleExportXls = () => { setExportMenuOpen(false); exportXls(); };

  return (
    <div className="etiquettes-list">
      <div className="etiquettes-header">
        <h3>Etiquettes câbles ({rows.length})</h3>
        <div className="etiquettes-actions">
          <button
            className={`etiquettes-hide-toggle${cableLabelsHidden ? " active" : ""}`}
            onClick={() => setCableLabelsHidden(!cableLabelsHidden)}
            title={cableLabelsHidden
              ? "Afficher les blocs textes sur les câbles dans les synoptiques"
              : "Masquer les blocs textes sur les câbles dans les synoptiques"}
          >
            {cableLabelsHidden ? "Affiché" : "Masquer"}
          </button>
          <button
            className={`etiquettes-view-toggle${detailed ? " active" : ""}`}
            onClick={() => setCableView(detailed ? "simple" : "detailed")}
            title={detailed ? "Passer en vue simple" : "Passer en vue détaillée"}
          >
            {detailed ? "Vue simple" : "Vue détaillée"}
          </button>
          <div className="etiquettes-export-menu" ref={exportMenuRef}>
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={!rows.length}
              title="Exporter la liste des étiquettes"
            >
              Export ▾
            </button>
            {exportMenuOpen && (
              <div className="etiquettes-export-dropdown">
                <button onClick={handleExportCsv}>CSV</button>
                <button onClick={handleExportXls}>XLS (Excel)</button>
              </div>
            )}
          </div>
        </div>
      </div>
      {!readOnly && detailed && (
        <p className="etiquettes-hint">
          Double-clic sur une étiquette ou une longueur pour la modifier (synoptique actif uniquement).
        </p>
      )}
      <div className="etiquettes-table-wrap">
        <table className="etiquettes-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => onHeaderClick(c.key)}
                  className={c.align === "right" ? "right" : ""}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span className="sort-indicator">{sortDir === "asc" ? "▲" : "▼"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cellReadOnly = readOnly || !r.editable;
              return (
                <tr key={r.id} className={!r.editable ? "etiquette-row-other-tab" : ""}>
                  <td>{r.number}</td>
                  {detailed && (
                    <td className="etiquette-label-td">
                      <LabelCell id={r.id} label={r.label} readOnly={cellReadOnly} />
                    </td>
                  )}
                  <td>
                    <span
                      className={`etiquette-tab-chip${r.editable ? " active" : ""}`}
                      title={r.tabName}
                    >
                      {r.tabName}
                    </span>
                  </td>
                  <td>{r.cableType}</td>
                  {detailed && (
                    <td className="right etiquette-len-td">
                      <LengthCell id={r.id} length={r.lengthMeters} readOnly={cellReadOnly} />
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="muted center">
                  Aucun câble. Tracez une liaison sur le synoptique.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

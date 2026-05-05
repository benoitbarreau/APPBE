import { useMemo, useRef, useState } from "react";
import { useAppStore } from "../store";
import { useEditorState } from "../store";

type SortKey = "number" | "label" | "cableType" | "lengthMeters";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "number", label: "N°" },
  { key: "label", label: "Etiquette câble" },
  { key: "cableType", label: "Type de câble" },
  { key: "lengthMeters", label: "Longueur (m)", align: "right" },
];

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Cellule label éditable en double-clic */
function LabelCell({ id, label, readOnly }: { id: string; label: string; readOnly: boolean }) {
  const updateCable = useAppStore((s) => s.updateCable);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    if (readOnly) return;
    setDraft(label);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== label) updateCable(id, { label: draft });
  };

  const cancel = () => {
    setEditing(false);
    setDraft(label);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="etiquette-label-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
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

export function EtiquettesList() {
  const cables = useAppStore((s) => s.cables);
  const readOnly = useEditorState((s) => s.readOnly);
  const [sortKey, setSortKey] = useState<SortKey>("number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const rows = useMemo(() => {
    const list = cables.map((c) => ({
      id: c.id,
      number: c.number ?? "",
      label: c.label ?? "",
      cableType: c.cableType,
      lengthMeters: c.lengthMeters,
    }));
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), "fr", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [cables, sortKey, sortDir]);

  const onHeaderClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const exportCsv = () => {
    const header = COLUMNS.map((c) => c.label).join(";");
    const lines = rows.map((r) =>
      COLUMNS.map((c) => {
        const v = String(r[c.key as keyof typeof r]).replace(/"/g, '""');
        return `"${v}"`;
      }).join(";"),
    );
    downloadFile(
      "etiquettes-cables.csv",
      "﻿" + [header, ...lines].join("\n"),
      "text/csv;charset=utf-8",
    );
  };

  const exportXls = () => {
    const escape = (v: unknown) =>
      String(v)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const headerRow = COLUMNS.map((c) => `<th>${escape(c.label)}</th>`).join("");
    const bodyRows = rows
      .map(
        (r) =>
          "<tr>" +
          COLUMNS.map((c) => `<td>${escape(r[c.key as keyof typeof r])}</td>`).join("") +
          "</tr>",
      )
      .join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" /></head>
<body><table border="1"><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table></body>
</html>`;
    downloadFile("etiquettes-cables.xls", html, "application/vnd.ms-excel");
  };

  return (
    <div className="etiquettes-list">
      <div className="etiquettes-header">
        <h3>Etiquettes câbles ({rows.length})</h3>
        <div className="etiquettes-actions">
          <button onClick={exportCsv} disabled={!rows.length}>
            CSV
          </button>
          <button onClick={exportXls} disabled={!rows.length}>
            XLS
          </button>
        </div>
      </div>
      {!readOnly && (
        <p className="etiquettes-hint">
          Double-clic sur une étiquette pour la modifier.
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
                    <span className="sort-indicator">
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.number}</td>
                <td className="etiquette-label-td">
                  <LabelCell id={r.id} label={r.label} readOnly={readOnly} />
                </td>
                <td>{r.cableType}</td>
                <td className="right">{r.lengthMeters}</td>
              </tr>
            ))}
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

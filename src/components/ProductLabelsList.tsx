import { useEffect, useMemo, useState } from "react";
import { useAppStore, useEditorState } from "../store";
import { isSynopticTab } from "../types";

type SortKey = "label" | "reference" | "zone" | "tabName" | "manual";
type SortDir = "asc" | "desc";

const COLUMNS: { key: Exclude<SortKey, "manual">; label: string }[] = [
  { key: "label",     label: "Label" },
  { key: "reference", label: "Référence produit" },
  { key: "zone",      label: "Zone" },
  { key: "tabName",   label: "Synoptique" },
];

interface Row {
  id: string;
  label: string;
  reference: string;
  zoneId: string;
  zoneLabel: string;
  tabId: string;
  tabName: string;
  editable: boolean;
  /** Index dans le tableau nodes du synoptique actif — drag & drop uniquement */
  originalIndex: number;
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Cellule label éditable (clic simple). */
function LabelCell({
  id,
  label,
  readOnly,
}: {
  id: string;
  label: string;
  readOnly: boolean;
}) {
  const updateNode = useAppStore((s) => s.updateNode);
  const [draft, setDraft] = useState(label);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(label);
  }, [label, focused]);

  const commit = () => {
    setFocused(false);
    if (draft !== label) updateNode(id, { label: draft });
  };

  return (
    <input
      className="product-label-input"
      value={draft}
      placeholder="—"
      readOnly={readOnly}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(label);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** Sélecteur de zone éditable. */
function ZoneCell({ id, zoneId, readOnly }: { id: string; zoneId: string; readOnly: boolean }) {
  const zones = useAppStore((s) => s.zones);
  const setNodeZone = useAppStore((s) => s.setNodeZone);

  return (
    <select
      className="product-zone-select"
      value={zoneId}
      disabled={readOnly}
      onChange={(e) => setNodeZone(id, e.target.value || undefined)}
    >
      <option value="">— Aucune —</option>
      {zones.map((z) => (
        <option key={z.id} value={z.id}>
          {z.label}
        </option>
      ))}
    </select>
  );
}

export function ProductLabelsList() {
  const tabs         = useAppStore((s) => s.tabs);
  const activeTabId  = useAppStore((s) => s.activeTabId);
  const activeNodes  = useAppStore((s) => s.nodes);
  const products     = useAppStore((s) => s.products);
  const zones        = useAppStore((s) => s.zones);
  const reorderNodes = useAppStore((s) => s.reorderNodes);
  const readOnly     = useEditorState((s) => s.readOnly);

  const [sortKey, setSortKey] = useState<SortKey>("manual");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [dragSrc,    setDragSrc]    = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  /** Agrégation depuis tous les synoptiques. */
  const baseRows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    for (const t of tabs) {
      if (!isSynopticTab(t)) continue;
      const isActive = t.id === activeTabId;
      const nodes    = isActive ? activeNodes : (t.nodes ?? []);
      nodes.forEach((n, idx) => {
        const p = products.find((pr) => pr.id === n.productId);
        const reference = p ? `${p.manufacturer} ${p.reference}` : n.name;
        const zone = zones.find((z) => z.id === n.zoneId);
        list.push({
          id: n.id,
          label:      n.label ?? "",
          reference,
          zoneId:     n.zoneId ?? "",
          zoneLabel:  zone?.label ?? "",
          tabId:      t.id,
          tabName:    t.name,
          editable:   isActive,
          originalIndex: isActive ? idx : -1,
        });
      });
    }
    return list;
  }, [tabs, activeTabId, activeNodes, products, zones]);

  const rows = useMemo<Row[]>(() => {
    if (sortKey === "manual") return baseRows;
    const sorted = [...baseRows];
    sorted.sort((a, b) => {
      const av =
        sortKey === "label"     ? a.label     :
        sortKey === "reference" ? a.reference :
        sortKey === "zone"      ? a.zoneLabel :
        a.tabName;
      const bv =
        sortKey === "label"     ? b.label     :
        sortKey === "reference" ? b.reference :
        sortKey === "zone"      ? b.zoneLabel :
        b.tabName;
      const cmp = String(av).localeCompare(String(bv), "fr", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [baseRows, sortKey, sortDir]);

  const onHeaderClick = (key: Exclude<SortKey, "manual">) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const resetManualOrder = () => { setSortKey("manual"); setSortDir("asc"); };

  // ── Drag & drop (uniquement sur le synoptique actif) ─────────────────
  const onDragStart = (e: React.DragEvent, idx: number) => {
    if (readOnly) return;
    setDragSrc(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };

  const onDragOver = (e: React.DragEvent, idx: number) => {
    if (readOnly || dragSrc === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== idx) setDropTarget(idx);
  };

  const onDrop = (e: React.DragEvent, idx: number) => {
    if (readOnly || dragSrc === null) return;
    e.preventDefault();
    if (dragSrc !== idx) {
      if (sortKey !== "manual") resetManualOrder();
      reorderNodes(dragSrc, idx);
    }
    setDragSrc(null);
    setDropTarget(null);
  };

  const onDragEnd = () => { setDragSrc(null); setDropTarget(null); };

  // ── Exports ───────────────────────────────────────────────────────────
  const exportCsv = () => {
    const header = ["Label", "Référence produit", "Zone", "Synoptique"].join(";");
    const lines = rows.map((r) =>
      [r.label, r.reference, r.zoneLabel, r.tabName]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    downloadFile("labels-produits.csv", "﻿" + [header, ...lines].join("\n"), "text/csv;charset=utf-8");
  };

  const exportXls = () => {
    const escape = (v: unknown) =>
      String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const headerRow =
      "<tr>" + ["Label", "Référence produit", "Zone", "Synoptique"].map((h) => `<th>${escape(h)}</th>`).join("") + "</tr>";
    const bodyRows = rows
      .map((r) =>
        "<tr>" + [r.label, r.reference, r.zoneLabel, r.tabName].map((v) => `<td>${escape(v)}</td>`).join("") + "</tr>",
      )
      .join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" /></head>
<body><table border="1"><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table></body>
</html>`;
    downloadFile("labels-produits.xls", html, "application/vnd.ms-excel");
  };

  const sortActive = sortKey !== "manual";
  const totalRows  = rows.length;

  return (
    <div className="etiquettes-list product-labels-list">
      <div className="etiquettes-header">
        <h3>Labels produits ({totalRows})</h3>
        <div className="etiquettes-actions">
          {sortActive && (
            <button onClick={resetManualOrder} title="Revenir à l'ordre manuel (drag & drop)">
              Ordre manuel
            </button>
          )}
          <button onClick={exportCsv} disabled={!totalRows}>CSV</button>
          <button onClick={exportXls} disabled={!totalRows}>XLS</button>
        </div>
      </div>
      {!readOnly && (
        <p className="etiquettes-hint">
          Cliquer dans une cellule pour modifier. Glisser une ligne par sa poignée{" "}
          <span className="drag-handle-inline">⋮⋮</span> pour réorganiser (synoptique actif uniquement).
          {sortActive && " (Le tri remplace temporairement l'ordre manuel.)"}
        </p>
      )}
      <div className="etiquettes-table-wrap">
        <table className="etiquettes-table product-labels-table">
          <thead>
            <tr>
              <th className="drag-col" title="Glisser pour réordonner"></th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => onHeaderClick(c.key)}
                  className="sortable"
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
              const canDrag      = !readOnly && r.editable && sortKey === "manual";
              const isDragging   = dragSrc === r.originalIndex && r.editable;
              const isDropTarget = dropTarget === r.originalIndex && dragSrc !== r.originalIndex && r.editable;
              return (
                <tr
                  key={r.id}
                  draggable={canDrag}
                  onDragStart={canDrag ? (e) => onDragStart(e, r.originalIndex) : undefined}
                  onDragOver={canDrag ? (e) => onDragOver(e, r.originalIndex) : undefined}
                  onDrop={canDrag ? (e) => onDrop(e, r.originalIndex) : undefined}
                  onDragEnd={canDrag ? onDragEnd : undefined}
                  className={
                    (!r.editable ? "etiquette-row-other-tab " : "") +
                    (isDragging   ? "dragging "    : "") +
                    (isDropTarget ? "drop-target"  : "")
                  }
                >
                  <td className="drag-col">
                    {r.editable ? (
                      <span className="drag-handle" title="Glisser pour réordonner">⋮⋮</span>
                    ) : null}
                  </td>
                  <td>
                    <LabelCell id={r.id} label={r.label} readOnly={cellReadOnly} />
                  </td>
                  <td className="muted-cell" title={r.reference}>{r.reference}</td>
                  <td>
                    <ZoneCell id={r.id} zoneId={r.zoneId} readOnly={cellReadOnly} />
                  </td>
                  <td>
                    <span
                      className={`etiquette-tab-chip${r.editable ? " active" : ""}`}
                      title={r.tabName}
                    >
                      {r.tabName}
                    </span>
                  </td>
                </tr>
              );
            })}
            {totalRows === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="muted center">
                  Aucun produit placé sur les synoptiques.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

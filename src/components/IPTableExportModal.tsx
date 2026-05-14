import { useState } from "react";
import {
  exportIPTablePdf,
  exportIPTableXls,
  printIPTable,
  type IPExportColumn,
} from "../lib/ipTableExport";
import type { IPNetworkInfo, IPTableColumnConfig, IPTableRow } from "../types";

const logoUrl = `${import.meta.env.BASE_URL}company-logo.png`;

type Format = "pdf" | "xlsx" | "print";
type Scope  = "all" | "filtered";

// Modèles prédéfinis (colonnes fixes uniquement)
const TEMPLATES: { id: string; label: string; columns: string[] }[] = [
  {
    id: "complet",
    label: "Modèle complet",
    columns: ["product","label","deviceId","ip","ipDante","ipDanteSec","login","password","serialNumber","mac","macDante"],
  },
  {
    id: "reseau",
    label: "Modèle réseau",
    columns: ["product","label","deviceId","ip","ipDante","ipDanteSec","mac","macDante"],
  },
  {
    id: "client",
    label: "Modèle client",
    columns: ["product","label","ip","login","password"],
  },
  {
    id: "maintenance",
    label: "Modèle maintenance",
    columns: ["product","label","deviceId","ip","login","password","serialNumber","mac","macDante"],
  },
];

export function IPTableExportModal({
  rows,
  visibleRows,
  columns,
  network,
  documentTitle,
  onClose,
}: {
  tabId: string;
  rows: IPTableRow[];
  visibleRows: IPTableRow[];
  columns: IPTableColumnConfig[];
  network: IPNetworkInfo;
  documentTitle: string;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>("pdf");
  const [scope,  setScope]  = useState<Scope>(
    visibleRows.length === rows.length ? "all" : "filtered",
  );
  const [title, setTitle] = useState(documentTitle || "Tableau IP");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("complet");
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    () => new Set(TEMPLATES[0].columns),
  );

  const applyTemplate = (id: string) => {
    setSelectedTemplate(id);
    const tmpl = TEMPLATES.find((t) => t.id === id);
    if (tmpl) setSelectedColumns(new Set(tmpl.columns));
  };

  const toggleColumn = (id: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setSelectedTemplate("custom");
  };

  const handleExport = async () => {
    // Préserver l'ordre du tableau principal
    const cols: IPExportColumn[] = columns
      .filter((c) => selectedColumns.has(c.id))
      .map((c)  => ({ key: c.id, label: c.label }));

    if (cols.length === 0) { alert("Sélectionnez au moins une colonne."); return; }

    const exportRows = scope === "all" ? rows : visibleRows;
    const payload = { title, columns: cols, rows: exportRows, network };

    try {
      if      (format === "pdf")   await exportIPTablePdf(payload, logoUrl);
      else if (format === "xlsx")  exportIPTableXls(payload, logoUrl);
      else                         printIPTable(payload, logoUrl);
      onClose();
    } catch (e) {
      alert("Échec de l'export : " + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ip-export-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h2>Exporter le Tableau IP</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Format */}
          <div className="form-row">
            <label>Format</label>
            <div style={{ display: "flex", gap: 6 }}>
              <button className={format === "pdf"   ? "primary" : ""} onClick={() => setFormat("pdf")}>PDF</button>
              <button className={format === "xlsx"  ? "primary" : ""} onClick={() => setFormat("xlsx")}>Excel (.xls)</button>
              <button className={format === "print" ? "primary" : ""} onClick={() => setFormat("print")}>🖨 Imprimer</button>
            </div>
          </div>

          {/* Titre */}
          <div className="form-row">
            <label>Titre du document</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tableau IP" />
          </div>

          {/* Modèle */}
          <div className="form-row">
            <label>Modèle</label>
            <select value={selectedTemplate} onChange={(e) => applyTemplate(e.target.value)}>
              {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              {selectedTemplate === "custom" && <option value="custom">Personnalisé</option>}
            </select>
          </div>

          {/* Colonnes */}
          <div className="form-row" style={{ alignItems: "flex-start" }}>
            <label>Colonnes</label>
            <div className="ip-export-columns">
              {columns.map((c) => (
                <label key={c.id} className="ip-export-col-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedColumns.has(c.id)}
                    onChange={() => toggleColumn(c.id)}
                  />
                  {c.label}
                  {c.custom && <span className="ip-col-custom-chip" style={{ marginLeft: 4 }}>perso</span>}
                </label>
              ))}
            </div>
          </div>

          {/* Lignes */}
          <div className="form-row">
            <label>Lignes</label>
            <div style={{ display: "flex", gap: 12 }}>
              <label>
                <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} />
                {" "}Toutes ({rows.length})
              </label>
              <label>
                <input type="radio" checked={scope === "filtered"} onChange={() => setScope("filtered")}
                  disabled={visibleRows.length === rows.length} />
                {" "}Visibles avec filtres ({visibleRows.length})
              </label>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Annuler</button>
          <button className="primary" onClick={() => void handleExport()}>
            {format === "pdf" ? "Exporter en PDF" : format === "xlsx" ? "Exporter en Excel" : "Ouvrir l'aperçu d'impression"}
          </button>
        </div>
      </div>
    </div>
  );
}

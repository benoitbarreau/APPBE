import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { jsPDF } from "jspdf";
import { useAppStore } from "../store";
import { isSynopticTab, type Cable } from "../types";

export function CableList() {
  const tabs        = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const activeCables = useAppStore((s) => s.cables);
  const activeNodes  = useAppStore((s) => s.nodes);
  const products     = useAppStore((s) => s.products);
  const updateCable  = useAppStore((s) => s.updateCable);
  const removeCable  = useAppStore((s) => s.removeCable);
  const reverseCable = useAppStore((s) => s.reverseCable);
  const selectedCableId  = useAppStore((s) => s.selectedCableId);
  const setSelectedCable = useAppStore((s) => s.setSelectedCable);
  const reactFlow = useReactFlow();

  /** Câbles de tous les synoptiques, groupés par onglet. */
  const groups = useMemo(() => {
    return tabs
      .filter(isSynopticTab)
      .map((t) => {
        const isActive = t.id === activeTabId;
        const cables = isActive ? activeCables : (t.cables ?? []);
        const nodes  = isActive ? activeNodes  : (t.nodes  ?? []);

        const rows = cables.map((c) => {
          const fromNode    = nodes.find((n) => n.id === c.fromNodeId);
          const toNode      = nodes.find((n) => n.id === c.toNodeId);
          const fromProduct = products.find((p) => p.id === fromNode?.productId);
          const toProduct   = products.find((p) => p.id === toNode?.productId);
          const allFromPorts = [
            ...(fromProduct?.outputs ?? []),
            ...(fromProduct?.middle  ?? []),
          ];
          const allToPorts = [
            ...(toProduct?.inputs  ?? []),
            ...(toProduct?.middle  ?? []),
          ];
          const fromPort = allFromPorts.find((p) => p.id === c.fromPortId);
          const toPort   = allToPorts.find((p) => p.id === c.toPortId);
          return {
            cable: c,
            from: `${fromNode?.name ?? "?"} • ${fromPort?.label ?? "?"}`,
            to:   `${toNode?.name   ?? "?"} • ${toPort?.label   ?? "?"}`,
          };
        });

        return { tabId: t.id, tabName: t.name, editable: isActive, rows };
      })
      .filter((g) => g.rows.length > 0);
  }, [tabs, activeTabId, activeCables, activeNodes, products]);

  /** Récapitulatif global (tous synoptiques). */
  const summary = useMemo(() => {
    const map = new Map<string, { count: number; meters: number }>();
    for (const g of groups) {
      for (const { cable: c } of g.rows) {
        const key = c.cableType;
        const cur = map.get(key) ?? { count: 0, meters: 0 };
        cur.count  += 1;
        cur.meters += Number(c.lengthMeters || 0);
        map.set(key, cur);
      }
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [groups]);

  const totalCables = groups.reduce((n, g) => n + g.rows.length, 0);

  // ── Récapitulatif plié par défaut ─────────────────────────────────────────
  const [summaryOpen, setSummaryOpen] = useState(false);

  // ── Menu Export ───────────────────────────────────────────────────────────
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node))
        setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [exportMenuOpen]);

  // ── Scroll automatique vers le câble sélectionné ──────────────────────────
  const rowsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedCableId || !rowsRef.current) return;
    const el = rowsRef.current.querySelector<HTMLElement>(
      `[data-cable-id="${selectedCableId}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedCableId]);

  const exportCsv = () => {
    const header = ["N°", "Synoptique", "Type de câble", "Signal", "De", "Vers", "Longueur (m)", "Libellé"].join(";");
    const lines: string[] = [];
    for (const g of groups) {
      for (const { cable: c, from, to } of g.rows) {
        lines.push(
          [c.number, g.tabName, c.cableType, c.signal, from, to, c.lengthMeters ?? "", c.label ?? ""]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(";"),
        );
      }
    }
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "liste-cables.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportXls = () => {
    const cols = ["N°", "Synoptique", "Type de câble", "Signal", "De", "Vers", "Longueur (m)", "Libellé"];
    const esc  = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const headerRow = cols.map((c) => `<th style="background:#333;color:#fff;border:1px solid #000;padding:4px 8px;">${esc(c)}</th>`).join("");
    const bodyRows: string[] = [];
    for (const g of groups) {
      for (const { cable: c, from, to } of g.rows) {
        const vals = [c.number ?? "", g.tabName, c.cableType, c.signal, from, to, c.lengthMeters ?? "", c.label ?? ""];
        bodyRows.push("<tr>" + vals.map((v) => `<td style="border:1px solid #000;padding:4px 8px;">${esc(v)}</td>`).join("") + "</tr>");
      }
    }
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"/><style>body{font-family:sans-serif;}</style></head><body><table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows.join("")}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "liste-cables.xls"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const COLS  = ["N°", "Syno", "Type", "Signal", "De", "Vers", "Long.", "Libellé"];
    const HINTS = [8, 18, 16, 12, 40, 40, 10, 30];
    const total = HINTS.reduce((s, v) => s + v, 0);
    const pdf   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const tableW = pageW - margin * 2;
    const colW   = HINTS.map((h) => (h / total) * tableW);
    let y = margin;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text("Liste des câbles", margin, y + 6);
    y += 14;

    const headerH = 7;
    const rowH    = 6;

    const drawHeader = () => {
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setFillColor(51, 51, 51);
      pdf.setTextColor(255);
      let x = margin;
      for (let i = 0; i < COLS.length; i++) {
        pdf.rect(x, y, colW[i], headerH, "FD");
        pdf.text(COLS[i], x + 1.5, y + 5);
        x += colW[i];
      }
      y += headerH;
      pdf.setTextColor(0);
      pdf.setFont("helvetica", "normal");
    };

    drawHeader();

    for (const g of groups) {
      for (const { cable: c, from, to } of g.rows) {
        if (y + rowH > pageH - margin) { pdf.addPage(); y = margin; drawHeader(); }
        const vals = [c.number ?? "", g.tabName, c.cableType, c.signal, from, to, c.lengthMeters !== undefined ? String(c.lengthMeters) : "", c.label ?? ""];
        let x = margin;
        pdf.setFontSize(7);
        for (let i = 0; i < COLS.length; i++) {
          pdf.rect(x, y, colW[i], rowH, "S");
          const text = pdf.splitTextToSize(vals[i], colW[i] - 2)[0] ?? "";
          pdf.text(text, x + 1.5, y + 4);
          x += colW[i];
        }
        y += rowH;
      }
    }
    pdf.save("liste-cables.pdf");
  };

  const handleExport = (fn: () => void) => { setExportMenuOpen(false); fn(); };

  /** Clic sur une ligne câble → sélectionne + centre le canvas (onglet actif uniquement). */
  const handleRowClick = useCallback((cable: Cable, isActive: boolean) => {
    setSelectedCable(cable.id);
    if (!isActive) return;
    const ids = [cable.fromNodeId, cable.toNodeId].filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    try {
      reactFlow.fitView({ nodes: ids.map((id) => ({ id })), duration: 400, padding: 0.4 });
    } catch {
      // fitView peut échouer si les nœuds ne sont pas encore rendus
    }
  }, [setSelectedCable, reactFlow]);

  return (
    <div className="cable-list">
      <div className="cable-list-header">
        <h3>Liste des câbles ({totalCables})</h3>
        <div className="etiquettes-export-menu" ref={exportMenuRef}>
          <button
            onClick={() => setExportMenuOpen((v) => !v)}
            disabled={!totalCables}
            title="Exporter la liste des câbles"
          >
            Export ▾
          </button>
          {exportMenuOpen && (
            <div className="etiquettes-export-dropdown">
              <button onClick={() => handleExport(exportCsv)}>CSV</button>
              <button onClick={() => handleExport(exportXls)}>XLS (Excel)</button>
              <button onClick={() => handleExport(exportPdf)}>PDF</button>
            </div>
          )}
        </div>
      </div>

      {summary.length > 0 && (
        <div className="cable-summary">
          <button
            className="cable-summary-toggle"
            onClick={() => setSummaryOpen((v) => !v)}
          >
            <span className="cable-summary-arrow">{summaryOpen ? "▼" : "▶"}</span>
            Récapitulatif
          </button>
          {summaryOpen && (
            <table>
              <thead>
                <tr><th>Type</th><th>Quantité</th><th>Longueur totale</th></tr>
              </thead>
              <tbody>
                {summary.map(([type, s]) => (
                  <tr key={type}>
                    <td>{type}</td>
                    <td>{s.count}</td>
                    <td>{s.meters} m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="cable-rows" ref={rowsRef}>
        {groups.map((g) => (
          <div key={g.tabId}>
            {/* En-tête de section par synoptique */}
            <div className="cable-tab-section">
              <span className={`cable-tab-badge${g.editable ? " active" : ""}`}>
                {g.tabName}
              </span>
              {!g.editable && (
                <span className="cable-tab-hint">Basculer sur cet onglet pour modifier</span>
              )}
            </div>

            {g.rows.map(({ cable, from, to }) => (
              <CableRow
                key={cable.id}
                cable={cable}
                from={from}
                to={to}
                selected={cable.id === selectedCableId}
                editable={g.editable}
                onChange={(patch) => updateCable(cable.id, patch)}
                onRemove={() => removeCable(cable.id)}
                onReverse={() => reverseCable(cable.id)}
                onClick={() => handleRowClick(cable, g.editable)}
              />
            ))}
          </div>
        ))}

        {totalCables === 0 && (
          <div className="muted">Tracez une liaison entre deux ports sur le synoptique.</div>
        )}
      </div>
    </div>
  );
}

function CableRow({
  cable, from, to, selected, editable, onChange, onRemove, onReverse, onClick,
}: {
  cable: Cable;
  from: string;
  to: string;
  selected: boolean;
  editable: boolean;
  onChange: (patch: Partial<Cable>) => void;
  onRemove: () => void;
  onReverse: () => void;
  onClick?: () => void;
}) {
  const color = useAppStore((s) => s.signals[cable.signal]?.color) ?? "#888";

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.tagName === "INPUT") return;
    onClick?.();
  };

  return (
    <div
      data-cable-id={cable.id}
      className={`cable-row${selected ? " selected" : ""}${!editable ? " cable-row-readonly" : ""}`}
      onClick={handleClick}
      style={{ cursor: "pointer" }}
    >
      <div className="cable-row-top">
        <span className="cable-number" style={{ background: color, color: "#fff" }} title="Numérotation auto">
          {cable.number}
        </span>
        {editable ? (
          <input
            className="cable-type"
            value={cable.cableType}
            onChange={(e) => onChange({ cableType: e.target.value })}
          />
        ) : (
          <span className="cable-type cable-ro">{cable.cableType}</span>
        )}
        {editable ? (
          <input
            type="number" min={0} step={0.5} className="cable-length"
            value={cable.lengthMeters ?? ""} placeholder="—"
            onChange={(e) => {
              const v = e.target.value;
              onChange({ lengthMeters: v === "" ? undefined : Number(v) });
            }}
          />
        ) : (
          <span className="cable-length cable-ro">{cable.lengthMeters ?? "—"}</span>
        )}
        <span className="muted">m</span>
        {editable && <button onClick={onRemove} title="Supprimer">✕</button>}
      </div>
      <div className="cable-row-bottom">
        <span>{cable.reversed ? to : from}</span>
        <button
          className="cable-row-reverse"
          onClick={editable ? onReverse : undefined}
          title={editable ? "Inverser le sens de la flèche" : undefined}
          disabled={!editable}
        >
          {cable.reversed ? "←" : "→"}
        </button>
        <span>{cable.reversed ? from : to}</span>
      </div>
      {editable ? (
        <input
          className="cable-label"
          placeholder="Etiquette cable (ex. IP1 - VIGNETTAGE)"
          value={cable.label ?? ""}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      ) : (
        cable.label && <div className="cable-label cable-ro">{cable.label}</div>
      )}
    </div>
  );
}

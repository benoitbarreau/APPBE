import { useState, useRef, useEffect } from "react";
import type { Rack } from "../../types";
import type { CartoucheData } from "../../export";
import {
  exportBayToPDF,
  exportBayToJPEG,
  exportBayToCSV,
  exportBayToXLS,
  printBay,
} from "../../lib/bayExport";

type ExportFmt = "pdf" | "jpeg" | "csv" | "xls" | "print";

interface BayExportMenuProps {
  racks: Rack[];
  cartouche: CartoucheData;
  tabName: string;
}

export function BayExportMenu({ racks, cartouche, tabName }: BayExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFmt | null>(null);
  const [err,  setErr]  = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fermer le dropdown en dehors du composant
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const runExport = async (fmt: ExportFmt) => {
    setBusy(fmt);
    setErr(null);
    try {
      switch (fmt) {
        case "pdf":   await exportBayToPDF(racks, cartouche, tabName); break;
        case "jpeg":  await exportBayToJPEG(racks, cartouche, tabName); break;
        case "print": await printBay(racks, cartouche); break;
        case "csv":   exportBayToCSV(racks, tabName); break;
        case "xls":   exportBayToXLS(racks, tabName); break;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur d'export");
    } finally {
      setBusy(null);
    }
  };

  const handleFmt = (fmt: ExportFmt) => {
    setOpen(false);
    void runExport(fmt);
  };

  const isWorking = busy !== null;

  return (
    <div className="bay-export-wrap" ref={wrapRef}>
      {/* ── Boutons ─────────────────────────────────────────────────────── */}
      <div className="bay-export-group">
        <button
          className="bay-export-btn"
          disabled={isWorking}
          onClick={() => setOpen((o) => !o)}
          title="Exporter la baie (PDF, JPEG, CSV, XLS)"
        >
          {busy && busy !== "print" ? `⏳ ${busy.toUpperCase()}…` : "⬇ Exporter ▾"}
        </button>
        <button
          className="bay-export-btn bay-print-btn"
          disabled={isWorking}
          onClick={() => handleFmt("print")}
          title="Imprimer la baie"
        >
          {busy === "print" ? "⏳ Impression…" : "🖨 Imprimer"}
        </button>
      </div>

      {/* ── Menu déroulant ──────────────────────────────────────────────── */}
      {open && (
        <div className="bay-export-dropdown">
          <button onClick={() => handleFmt("pdf")}>📄 Exporter en PDF</button>
          <button onClick={() => handleFmt("jpeg")}>🖼 Exporter en JPEG</button>
          <div className="bay-export-divider" />
          <button onClick={() => handleFmt("csv")}>📊 Exporter en CSV</button>
          <button onClick={() => handleFmt("xls")}>📗 Exporter en XLS</button>
        </div>
      )}

      {/* ── Erreur ──────────────────────────────────────────────────────── */}
      {err && (
        <div className="bay-export-error" title={err}>
          ⚠ {err.length > 60 ? err.slice(0, 60) + "…" : err}
        </div>
      )}
    </div>
  );
}

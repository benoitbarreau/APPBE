import { useState, useRef, useEffect } from "react";
import type { Rack } from "../../types";
import type { CartoucheData } from "../../export";
import {
  getLogoSrc,
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
  const [open, setOpen]       = useState(false);
  const [busy, setBusy]       = useState<ExportFmt | null>(null);
  const [err,  setErr]        = useState<string | null>(null);

  // ── Logo picker ────────────────────────────────────────────────────────
  const [logoModal,   setLogoModal]   = useState(false);
  const [pending,     setPending]     = useState<ExportFmt | null>(null);
  const [logoUrl,     setLogoUrl]     = useState("");
  const [logoData,    setLogoData]    = useState(""); // base64 depuis fichier
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Dropdown close on outside click ────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Exécution de l'export ───────────────────────────────────────────────
  const runExport = async (fmt: ExportFmt, logoSrc: string | null) => {
    setBusy(fmt);
    setErr(null);
    try {
      switch (fmt) {
        case "pdf":   await exportBayToPDF(racks, cartouche, logoSrc, tabName); break;
        case "jpeg":  await exportBayToJPEG(racks, cartouche, logoSrc, tabName); break;
        case "print": await printBay(racks, cartouche, logoSrc); break;
        case "csv":   exportBayToCSV(racks, tabName); break;
        case "xls":   exportBayToXLS(racks, tabName); break;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur d'export");
    } finally {
      setBusy(null);
    }
  };

  // ── Clic sur un format ──────────────────────────────────────────────────
  const handleFmt = async (fmt: ExportFmt) => {
    setOpen(false);
    setErr(null);

    // CSV / XLS → pas de logo, export direct
    if (fmt === "csv" || fmt === "xls") {
      await runExport(fmt, null);
      return;
    }

    // PDF / JPEG / Impression → chercher logo dans le DOM
    const domLogo = getLogoSrc();
    if (domLogo) {
      await runExport(fmt, domLogo);
      return;
    }

    // Pas de logo → proposer d'en ajouter un
    setPending(fmt);
    setLogoModal(true);
  };

  // ── Confirmation du logo ────────────────────────────────────────────────
  const confirmLogo = async () => {
    const src = logoData || logoUrl.trim() || null;
    setLogoModal(false);
    setLogoUrl("");
    setLogoData("");
    if (fileRef.current) fileRef.current.value = "";
    if (pending) { await runExport(pending, src); setPending(null); }
  };

  const skipLogo = async () => {
    setLogoModal(false);
    setLogoUrl("");
    setLogoData("");
    if (fileRef.current) fileRef.current.value = "";
    if (pending) { await runExport(pending, null); setPending(null); }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setLogoData(ev.target?.result as string ?? ""); setLogoUrl(""); };
    reader.readAsDataURL(file);
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
          onClick={() => void handleFmt("print")}
          title="Imprimer la baie"
        >
          {busy === "print" ? "⏳ Impression…" : "🖨 Imprimer"}
        </button>
      </div>

      {/* ── Menu déroulant ──────────────────────────────────────────────── */}
      {open && (
        <div className="bay-export-dropdown">
          <button onClick={() => void handleFmt("pdf")}>📄 Exporter en PDF</button>
          <button onClick={() => void handleFmt("jpeg")}>🖼 Exporter en JPEG</button>
          <div className="bay-export-divider" />
          <button onClick={() => void handleFmt("csv")}>📊 Exporter en CSV</button>
          <button onClick={() => void handleFmt("xls")}>📗 Exporter en XLS</button>
        </div>
      )}

      {/* ── Erreur ──────────────────────────────────────────────────────── */}
      {err && (
        <div className="bay-export-error" title={err}>
          ⚠ {err.length > 60 ? err.slice(0, 60) + "…" : err}
        </div>
      )}

      {/* ── Modal logo ──────────────────────────────────────────────────── */}
      {logoModal && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) { void skipLogo(); } }}
        >
          <div className="bay-logo-modal">
            <div className="bay-logo-modal-header">
              <span>🖼 Logo du document</span>
              <button className="modal-close-btn" onClick={() => void skipLogo()}>✕</button>
            </div>

            <p className="bay-logo-modal-hint">
              Aucun logo n'est défini dans le cartouche du projet.<br />
              Vous pouvez en ajouter un ci-dessous ou continuer sans logo.
            </p>

            {logoData ? (
              <div className="bay-logo-preview-wrap">
                <img src={logoData} alt="Logo" className="bay-logo-preview-img" />
                <button
                  className="bay-logo-clear-btn"
                  onClick={() => { setLogoData(""); if (fileRef.current) fileRef.current.value = ""; }}
                >
                  ✕ Supprimer
                </button>
              </div>
            ) : (
              <>
                <div className="bay-logo-row">
                  <label className="bay-logo-label">Fichier image :</label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFile}
                    className="bay-logo-file-input"
                  />
                </div>
                <div className="bay-logo-or">— ou —</div>
                <div className="bay-logo-row">
                  <label className="bay-logo-label">URL :</label>
                  <input
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://…/logo.png"
                    className="bay-logo-url-input"
                  />
                </div>
                {logoUrl.trim() && (
                  <div className="bay-logo-preview-wrap">
                    <img
                      src={logoUrl.trim()}
                      alt="Aperçu"
                      className="bay-logo-preview-img"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      onLoad={(e) => { (e.target as HTMLImageElement).style.display = ""; }}
                    />
                  </div>
                )}
              </>
            )}

            <div className="bay-logo-modal-actions">
              <button onClick={() => void skipLogo()}>Continuer sans logo</button>
              <button
                className="primary"
                onClick={() => void confirmLogo()}
              >
                {logoData || logoUrl.trim() ? "Utiliser ce logo" : "Continuer sans logo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

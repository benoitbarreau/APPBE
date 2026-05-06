import { useState } from "react";
import { searchVendorCatalog, type ImportSearchResult } from "../catalog";
import { useAppStore } from "../store";
import type { Product } from "../types";
import { parseProductsCsv } from "../lib/productImportExport";

const VENDORS = ["All", "Extron", "Viewsonic", "Lindy", "Panasonic"] as const;

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const addProduct = useAppStore((s) => s.addProduct);
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState<(typeof VENDORS)[number]>("All");
  const [results, setResults] = useState<ImportSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const runSearch = async () => {
    setBusy(true);
    setInfo(null);
    try {
      const r = await searchVendorCatalog(query, vendor);
      setResults(r);
      if (r.length === 0) setInfo("Aucun résultat dans le catalogue local. Brancher l'API constructeur pour étendre la recherche.");
    } finally {
      setBusy(false);
    }
  };

  const importOne = (r: ImportSearchResult) => {
    const id = `imported-${r.manufacturer}-${r.reference}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const product: Product = {
      id,
      reference: r.reference,
      manufacturer: r.manufacturer,
      category: r.category,
      inputs: [],
      outputs: [],
    };
    addProduct(product);
    setInfo(`Importé : ${r.manufacturer} ${r.reference}. Pensez à éditer ses entrées/sorties.`);
  };

  const importJsonFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Product[] | Product;
      const arr = Array.isArray(data) ? data : [data];
      for (const p of arr) addProduct(p);
      setInfo(`${arr.length} produit(s) importé(s) depuis ${file.name}.`);
    } catch {
      setInfo("Fichier JSON invalide.");
    }
  };

  /** Lit un fichier CSV/XLS exporté par SynoX et importe les produits. */
  const importCsvFile = async (file: File) => {
    try {
      const text = await file.text();
      const result = parseProductsCsv(text);
      for (const p of result.products) addProduct(p);
      const parts: string[] = [];
      parts.push(`${result.products.length} produit(s) importé(s) depuis ${file.name}.`);
      if (result.ignored > 0) parts.push(`${result.ignored} ligne(s) ignorée(s).`);
      if (result.errors.length > 0) {
        parts.push(result.errors.slice(0, 3).join(" "));
        if (result.errors.length > 3) parts.push(`(+${result.errors.length - 3} autres erreurs)`);
      }
      setInfo(parts.join(" "));
    } catch (e) {
      setInfo("Lecture impossible : " + (e instanceof Error ? e.message : "fichier invalide."));
    }
  };

  /**
   * Dispatcher : choisit le bon parser selon l'extension. Les .xls exportés
   * par SynoX sont en fait du HTML, donc on essaie d'abord CSV, sinon HTML.
   */
  const importFile = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".json")) {
      void importJsonFile(file);
      return;
    }
    if (lower.endsWith(".csv")) {
      void importCsvFile(file);
      return;
    }
    if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) {
      // Tenter une lecture HTML (XLS-as-HTML produit par SynoX). On extrait
      // le contenu des cellules, on le re-sérialise en CSV puis on parse.
      try {
        const text = await file.text();
        if (lower.endsWith(".xls") && text.includes("<table")) {
          const dom = new DOMParser().parseFromString(text, "text/html");
          const rows = Array.from(dom.querySelectorAll("tr"));
          const csv = rows
            .map((tr) =>
              Array.from(tr.querySelectorAll("th,td"))
                .map((td) => `"${(td.textContent ?? "").replace(/"/g, '""')}"`)
                .join(";"),
            )
            .join("\n");
          const result = parseProductsCsv(csv);
          for (const p of result.products) addProduct(p);
          setInfo(
            `${result.products.length} produit(s) importé(s) depuis ${file.name}.` +
              (result.ignored ? ` ${result.ignored} ligne(s) ignorée(s).` : ""),
          );
          return;
        }
        setInfo(
          "Format XLSX binaire non supporté. Réenregistrez en CSV depuis Excel " +
            "(Fichier → Enregistrer sous → CSV UTF-8).",
        );
      } catch (e) {
        setInfo("Lecture impossible : " + (e instanceof Error ? e.message : "fichier invalide."));
      }
      return;
    }
    setInfo("Format non reconnu. Acceptés : .json, .csv, .xls.");
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Importer des produits</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="muted">
            Recherche dans le catalogue local. Pour brancher une vraie base
            constructeur (Extron, Viewsonic, Crestron…), implémentez{" "}
            <code>searchVendorCatalog</code> dans <code>src/catalog.ts</code>.
          </p>
          <div className="form-row">
            <label>Constructeur</label>
            <select value={vendor} onChange={(e) => setVendor(e.target.value as typeof vendor)}>
              {VENDORS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Recherche</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="ex. DTP CrossPoint, DMP, IFP75…"
            />
            <button onClick={runSearch} disabled={busy}>
              {busy ? "…" : "Rechercher"}
            </button>
          </div>

          <div className="form-row">
            <label>Importer un fichier</label>
            <input
              type="file"
              accept=".json,.csv,.xls,application/json,text/csv,application/vnd.ms-excel"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                // reset pour pouvoir importer 2x le même fichier
                e.target.value = "";
              }}
            />
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: -8 }}>
            Formats acceptés : <code>.json</code>, <code>.csv</code> (séparateur ;
            ou ,), <code>.xls</code> exporté depuis SynoX. Pour un fichier Excel
            natif, enregistrez-le d'abord en CSV UTF-8.
          </p>

          {info && <div className="info-banner">{info}</div>}

          <div className="results">
            {results.map((r, i) => (
              <div key={i} className="result-row">
                <div>
                  <div>
                    <strong>{r.manufacturer}</strong> {r.reference}
                  </div>
                  <div className="muted">{r.category}</div>
                </div>
                <button onClick={() => importOne(r)}>Importer</button>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { searchVendorCatalog, type ImportSearchResult } from "../catalog";
import { useAppStore } from "../store";
import type { Product } from "../types";

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
    } catch (e) {
      setInfo("Fichier JSON invalide.");
    }
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
            <label>Ou JSON</label>
            <input
              type="file"
              accept="application/json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJsonFile(f);
              }}
            />
          </div>

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

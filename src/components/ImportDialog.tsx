import { useState } from "react";
import { searchVendorCatalog, type ImportSearchResult } from "../catalog";
import { useAppStore } from "../store";
import type { Product } from "../types";
import { parseProductsCsv } from "../lib/productImportExport";

const VENDORS = ["All", "Extron", "Viewsonic", "Lindy", "Panasonic"] as const;

/** Stratégie globale appliquée aux doublons quand l'utilisateur a coché "Tout …". */
type BulkChoice = "ask" | "overwrite-all" | "skip-all";

interface Counters {
  added: number;
  overwritten: number;
  skipped: number;
}

interface Conflict {
  incoming: Product;
  existing: Product;
}

/** Trouve un produit déjà présent qui ferait doublon (même id ou même marque+ref). */
function findExisting(p: Product, all: Product[]): Product | undefined {
  const direct = all.find((x) => x.id === p.id);
  if (direct) return direct;
  const ref = p.reference.trim().toLowerCase();
  const man = p.manufacturer.trim().toLowerCase();
  return all.find(
    (x) =>
      x.reference.trim().toLowerCase() === ref &&
      x.manufacturer.trim().toLowerCase() === man,
  );
}

/** Remplacement complet d'un produit (préserve l'id existant pour ne pas casser les blocs placés). */
function overwriteProduct(existingId: string, incoming: Product) {
  useAppStore.setState((s) => ({
    products: s.products.map((p) =>
      p.id === existingId ? { ...incoming, id: existingId } : p,
    ),
  }));
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const addProduct = useAppStore((s) => s.addProduct);
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState<(typeof VENDORS)[number]>("All");
  const [results, setResults] = useState<ImportSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  // ── État du flux de résolution de conflits ─────────────────────────
  // (mutable refs auraient suffi mais useState aide pour rerender la UI)
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [pending, setPending] = useState<Product[]>([]);
  const [bulkChoice, setBulkChoice] = useState<BulkChoice>("ask");
  const [counters, setCounters] = useState<Counters>({
    added: 0,
    overwritten: 0,
    skipped: 0,
  });
  const [sourceFile, setSourceFile] = useState<string>("");

  // ── Recherche catalogue ────────────────────────────────────────────
  const runSearch = async () => {
    setBusy(true);
    setInfo(null);
    try {
      const r = await searchVendorCatalog(query, vendor);
      setResults(r);
      if (r.length === 0)
        setInfo("Aucun résultat dans le catalogue local. Brancher l'API constructeur pour étendre la recherche.");
    } finally {
      setBusy(false);
    }
  };

  /** Import simple depuis la liste de résultats — passe quand même par le flux conflit. */
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
    startImport([product], `recherche ${r.manufacturer}`);
  };

  // ── Pipeline d'import : démarre / continue jusqu'au prochain conflit ──
  const buildSummary = (c: Counters): string => {
    const parts: string[] = [];
    if (c.added) parts.push(`${c.added} ajouté(s)`);
    if (c.overwritten) parts.push(`${c.overwritten} écrasé(s)`);
    if (c.skipped) parts.push(`${c.skipped} ignoré(s)`);
    if (!parts.length) parts.push("aucun produit traité");
    return `Import terminé — ${parts.join(", ")}.`;
  };

  /** Lance le moteur sur une queue donnée. */
  const startImport = (products: Product[], source: string) => {
    if (products.length === 0) {
      setInfo(`Aucun produit valide à importer depuis ${source}.`);
      return;
    }
    setSourceFile(source);
    setBulkChoice("ask");
    setCounters({ added: 0, overwritten: 0, skipped: 0 });
    setInfo(null);
    runQueue(products, "ask", { added: 0, overwritten: 0, skipped: 0 });
  };

  /**
   * Fait avancer la queue jusqu'au prochain conflit interactif (ou la fin).
   * Tous les arguments sont passés explicitement pour éviter les batch
   * setState asynchrones de React.
   */
  const runQueue = (queue: Product[], choice: BulkChoice, counts: Counters) => {
    const remaining = [...queue];
    const c = { ...counts };
    while (remaining.length > 0) {
      const next = remaining.shift()!;
      const existing = findExisting(next, useAppStore.getState().products);
      if (!existing) {
        addProduct(next);
        c.added++;
        continue;
      }
      if (choice === "overwrite-all") {
        overwriteProduct(existing.id, next);
        c.overwritten++;
        continue;
      }
      if (choice === "skip-all") {
        c.skipped++;
        continue;
      }
      // choice === "ask" : on s'arrête sur ce conflit et on attend l'utilisateur
      setConflict({ incoming: next, existing });
      setPending(remaining);
      setCounters(c);
      return;
    }
    // Queue vidée
    setConflict(null);
    setPending([]);
    setCounters(c);
    setInfo(buildSummary(c));
  };

  // ── Réponses utilisateur sur un conflit ────────────────────────────

  const resolveConflict = (action: "overwrite" | "skip" | "all-overwrite" | "all-skip") => {
    if (!conflict) return;
    const c = { ...counters };
    let next: BulkChoice = bulkChoice;

    if (action === "overwrite" || action === "all-overwrite") {
      overwriteProduct(conflict.existing.id, conflict.incoming);
      c.overwritten++;
      if (action === "all-overwrite") next = "overwrite-all";
    } else {
      c.skipped++;
      if (action === "all-skip") next = "skip-all";
    }

    setBulkChoice(next);
    runQueue(pending, next, c);
  };

  const cancelImport = () => {
    setConflict(null);
    setPending([]);
    setInfo(buildSummary(counters) + " (interrompu)");
  };

  // ── Lecteurs de fichier ────────────────────────────────────────────

  const importJsonFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Product[] | Product;
      const arr = Array.isArray(data) ? data : [data];
      startImport(arr, file.name);
    } catch {
      setInfo("Fichier JSON invalide.");
    }
  };

  const importCsvText = (text: string, label: string) => {
    const result = parseProductsCsv(text);
    if (result.errors.length > 0 && result.products.length === 0) {
      setInfo(result.errors[0]);
      return;
    }
    startImport(result.products, label);
    if (result.ignored > 0) {
      // Ajoute l'info des lignes ignorées au démarrage (avant le résultat final)
      setInfo(
        `${result.products.length} produit(s) à traiter. ${result.ignored} ligne(s) ignorée(s) au parsing.`,
      );
    }
  };

  const importCsvFile = async (file: File) => {
    try {
      const text = await file.text();
      importCsvText(text, file.name);
    } catch (e) {
      setInfo("Lecture impossible : " + (e instanceof Error ? e.message : "fichier invalide."));
    }
  };

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
      try {
        const text = await file.text();

        // Cas 1 : .xlsx ou .xls binaire → on ne sait pas lire, redirection CSV
        const isBinaryXlsx =
          lower.endsWith(".xlsx") ||
          (text.length > 0 && text.charCodeAt(0) === 0x50 /* "P" début zip */);
        if (isBinaryXlsx) {
          setInfo(
            "Format XLSX binaire non supporté. Réenregistrez en CSV depuis Excel " +
              "(Fichier → Enregistrer sous → CSV UTF-8).",
          );
          return;
        }

        // Cas 2 : frameset Excel multi-fichiers (Excel a réenregistré le fichier
        // SynoX). Les données sont dans un fichier _fichiers/sheet001.htm
        // séparé qui n'est pas accessible.
        const isExcelFrameset =
          /Excel\s+Workbook\s+Frameset/i.test(text) ||
          /_fichiers\//.test(text) ||
          /content=Excel\.Sheet/i.test(text);
        if (isExcelFrameset) {
          setInfo(
            "Ce fichier .xls a été réenregistré par Excel en mode multi-fichiers : " +
              "les données sont dans un fichier annexe _fichiers/sheet001.htm que SynoX " +
              "ne peut pas lire seul. Solution : depuis Excel, faites « Enregistrer sous » → " +
              "CSV UTF-8, puis importez le .csv ici.",
          );
          return;
        }

        // Cas 3 : .xls SynoX (HTML simple) — parser la première table.
        if (text.includes("<table")) {
          const dom = new DOMParser().parseFromString(text, "text/html");
          const tables = Array.from(dom.querySelectorAll("table"));
          // Choisir la table qui contient le plus de lignes (les <table>
          // de navigation Excel ont peu de lignes).
          const dataTable = tables.reduce<HTMLTableElement | null>((best, t) => {
            const rowCount = t.querySelectorAll("tr").length;
            const bestRows = best?.querySelectorAll("tr").length ?? 0;
            return rowCount > bestRows ? (t as HTMLTableElement) : best;
          }, null);
          if (!dataTable) {
            setInfo("Aucune table de données trouvée dans ce fichier .xls.");
            return;
          }
          const rows = Array.from(dataTable.querySelectorAll("tr"));
          const csv = rows
            .map((tr) =>
              Array.from(tr.querySelectorAll("th,td"))
                .map((td) => `"${(td.textContent ?? "").replace(/"/g, '""')}"`)
                .join(";"),
            )
            .join("\n");
          importCsvText(csv, file.name);
          return;
        }

        setInfo(
          "Fichier .xls non reconnu. Réenregistrez-le en CSV UTF-8 depuis Excel.",
        );
      } catch (e) {
        setInfo("Lecture impossible : " + (e instanceof Error ? e.message : "fichier invalide."));
      }
      return;
    }
    setInfo("Format non reconnu. Acceptés : .json, .csv, .xls.");
  };

  // ── UI ─────────────────────────────────────────────────────────────

  // Quand un conflit est en cours : on remplace tout le corps de la modale
  // par la vue de résolution, plus claire et focalisée.
  if (conflict) {
    const totalLeft = pending.length + 1;
    return (
      <div className="modal-backdrop">
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Doublon détecté</h2>
            <button onClick={cancelImport} title="Annuler l'import">✕</button>
          </div>
          <div className="modal-body">
            <p>
              Le produit <strong>{conflict.incoming.manufacturer} {conflict.incoming.reference}</strong>{" "}
              existe déjà dans votre catalogue. Que faire ?
            </p>

            <div className="conflict-compare">
              <div className="conflict-card">
                <div className="conflict-card-title">Produit existant</div>
                <ProductSummary product={conflict.existing} />
              </div>
              <div className="conflict-vs">→</div>
              <div className="conflict-card incoming">
                <div className="conflict-card-title">À importer</div>
                <ProductSummary product={conflict.incoming} />
              </div>
            </div>

            <div className="conflict-progress muted">
              {totalLeft > 1
                ? `${totalLeft} produit(s) restant(s) à traiter`
                : "Dernier produit"}
            </div>

            <div className="conflict-actions">
              <button onClick={() => resolveConflict("overwrite")} className="primary">
                ⟳ Écraser celui-ci
              </button>
              <button onClick={() => resolveConflict("skip")}>
                ⏭ Ignorer celui-ci
              </button>
              {totalLeft > 1 && (
                <>
                  <button onClick={() => resolveConflict("all-overwrite")}>
                    Tout écraser
                  </button>
                  <button onClick={() => resolveConflict("all-skip")}>
                    Tout ignorer
                  </button>
                </>
              )}
            </div>

            <div className="conflict-counters">
              <span><strong>{counters.added}</strong> ajouté(s)</span>
              <span>· <strong>{counters.overwritten}</strong> écrasé(s)</span>
              <span>· <strong>{counters.skipped}</strong> ignoré(s)</span>
            </div>
          </div>
          <div className="modal-footer">
            <button onClick={cancelImport} className="danger">Annuler l'import</button>
          </div>
        </div>
      </div>
    );
  }

  // Vue normale d'import
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
                e.target.value = "";
              }}
            />
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: -8 }}>
            Formats : <code>.json</code>, <code>.csv</code>, <code>.xls</code>.
            Pour importer <strong>un seul produit</strong>, créez un CSV/JSON avec
            une seule entrée. En cas de doublon (même ID ou même marque+référence),
            vous pourrez choisir d'écraser ou d'ignorer pour chaque conflit.
          </p>
          <p className="muted" style={{ fontSize: 11, marginTop: -4, color: "#b06800" }}>
            ⚠ Si vous avez ouvert un .xls SynoX dans Excel et l'avez
            réenregistré, Excel le transforme en multi-fichiers et SynoX ne peut
            plus le relire. Préférez l'export <strong>CSV</strong> pour les
            allers-retours avec Excel.
          </p>

          {info && <div className="info-banner">{info} {sourceFile && `(${sourceFile})`}</div>}

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

/** Carte récapitulative d'un produit pour la vue de comparaison de conflit. */
function ProductSummary({ product }: { product: Product }) {
  return (
    <ul className="product-summary">
      <li><span>ID</span><code>{product.id}</code></li>
      <li><span>Marque</span><strong>{product.manufacturer}</strong></li>
      <li><span>Référence</span><strong>{product.reference}</strong></li>
      <li><span>Catégorie</span>{product.category}</li>
      <li><span>Entrées</span>{product.inputs.length}</li>
      <li><span>Sorties</span>{product.outputs.length}</li>
      {product.middle && product.middle.length > 0 && (
        <li><span>Ports milieu</span>{product.middle.length}</li>
      )}
      {product.articleCode && <li><span>Code article</span>{product.articleCode}</li>}
    </ul>
  );
}

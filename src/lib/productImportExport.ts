import type { Port, PortDirection, Product, RackSize, RackWidth } from "../types";

/**
 * Import / Export du catalogue produits en CSV et XLS.
 *
 * Format des colonnes (séparateur ; — convention française) :
 *   id, reference, manufacturer, category, articleCode, productUrl,
 *   rackHeightU, rackSize, rackWidth, inputs, outputs, middle
 *
 * Les colonnes inputs / outputs / middle contiennent un tableau JSON
 * encodé (entre guillemets, avec doublement des guillemets internes
 * selon la convention CSV). Format de chaque port :
 *   {"id":"in1","label":"IN 1","signal":"AUDIO","direction":"in"}
 *
 * Les images (imageFront / imageBack) ne sont PAS exportées en CSV/XLS
 * pour éviter des fichiers énormes — utilisez l'export JSON pour cela.
 */

const COLUMNS = [
  "id",
  "reference",
  "manufacturer",
  "category",
  "articleCode",
  "productUrl",
  "rackHeightU",
  "rackSize",
  "rackWidth",
  "inputs",
  "outputs",
  "middle",
] as const;

type ColumnKey = (typeof COLUMNS)[number];

const HEADERS_FR: Record<ColumnKey, string> = {
  id: "ID",
  reference: "Référence",
  manufacturer: "Marque",
  category: "Catégorie",
  articleCode: "Code article",
  productUrl: "URL produit",
  rackHeightU: "Hauteur (U)",
  rackSize: "Format rack",
  rackWidth: "Largeur rack",
  inputs: "Entrées (JSON)",
  outputs: "Sorties (JSON)",
  middle: "Ports milieu (JSON)",
};

// ─────────────────────────────────────────────────────────────────────
// Helpers communs
// ─────────────────────────────────────────────────────────────────────

const cellFor = (p: Product, key: ColumnKey): string => {
  switch (key) {
    case "id":
      return p.id;
    case "reference":
      return p.reference;
    case "manufacturer":
      return p.manufacturer;
    case "category":
      return p.category;
    case "articleCode":
      return p.articleCode ?? "";
    case "productUrl":
      return p.productUrl ?? "";
    case "rackHeightU":
      return p.rackHeightU !== undefined ? String(p.rackHeightU) : "";
    case "rackSize":
      return p.rackSize ?? "";
    case "rackWidth":
      return p.rackWidth ?? "";
    case "inputs":
      return JSON.stringify(p.inputs);
    case "outputs":
      return JSON.stringify(p.outputs);
    case "middle":
      return JSON.stringify(p.middle ?? []);
  }
};

function downloadFile(filename: string, content: string | Blob, mime: string) {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────
// EXPORT CSV
// ─────────────────────────────────────────────────────────────────────

/** Échappe une cellule pour CSV (guillemets doublés, encadrés). */
const escapeCsv = (v: string): string => `"${v.replace(/"/g, '""')}"`;

export function exportProductsCsv(products: Product[]): void {
  const header = COLUMNS.map((k) => escapeCsv(HEADERS_FR[k])).join(";");
  const rows = products.map((p) =>
    COLUMNS.map((k) => escapeCsv(cellFor(p, k))).join(";"),
  );
  // BOM UTF-8 pour qu'Excel reconnaisse l'encodage
  const csv = "﻿" + [header, ...rows].join("\r\n");
  downloadFile("catalogue-produits.csv", csv, "text/csv;charset=utf-8");
}

// ─────────────────────────────────────────────────────────────────────
// EXPORT XLS (HTML table reconnue par Excel)
// ─────────────────────────────────────────────────────────────────────

const escapeHtml = (v: string): string =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function exportProductsXls(products: Product[]): void {
  const headerRow =
    "<tr>" +
    COLUMNS.map((k) => `<th>${escapeHtml(HEADERS_FR[k])}</th>`).join("") +
    "</tr>";
  const bodyRows = products
    .map(
      (p) =>
        "<tr>" +
        COLUMNS.map((k) => `<td>${escapeHtml(cellFor(p, k))}</td>`).join("") +
        "</tr>",
    )
    .join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" /></head>
<body><table border="1"><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table></body>
</html>`;
  downloadFile(
    "catalogue-produits.xls",
    html,
    "application/vnd.ms-excel;charset=utf-8",
  );
}

// ─────────────────────────────────────────────────────────────────────
// IMPORT CSV
// ─────────────────────────────────────────────────────────────────────

/**
 * Parser CSV minimaliste qui gère les guillemets, les doubles-guillemets
 * échappés (""), et les sauts de ligne dans les cellules entre guillemets.
 * Détecte automatiquement le séparateur (";" si présent, sinon ",").
 */
function parseCsv(text: string): string[][] {
  // Retirer un éventuel BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  // Détection du séparateur sur la première ligne
  const firstLineEnd = text.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const sep = firstLine.includes(";") ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === sep) {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      // Skip \r\n
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      // Ignorer les lignes complètement vides
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  // Dernière cellule / ligne
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

/** Convertit un nom d'en-tête vers la clé de colonne, robuste à la casse / accents. */
function normalizeHeader(h: string): ColumnKey | null {
  const norm = h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  const map: Record<string, ColumnKey> = {
    id: "id",
    reference: "reference",
    référence: "reference",
    marque: "manufacturer",
    manufacturer: "manufacturer",
    fabricant: "manufacturer",
    categorie: "category",
    catégorie: "category",
    category: "category",
    "code article": "articleCode",
    articlecode: "articleCode",
    "url produit": "productUrl",
    producturl: "productUrl",
    "hauteur (u)": "rackHeightU",
    "hauteur u": "rackHeightU",
    rackheightu: "rackHeightU",
    "format rack": "rackSize",
    racksize: "rackSize",
    "largeur rack": "rackWidth",
    rackwidth: "rackWidth",
    "entrees (json)": "inputs",
    "entrées (json)": "inputs",
    inputs: "inputs",
    entrees: "inputs",
    entrées: "inputs",
    "sorties (json)": "outputs",
    outputs: "outputs",
    sorties: "outputs",
    "ports milieu (json)": "middle",
    middle: "middle",
    "ports milieu": "middle",
  };
  return map[norm] ?? null;
}

/**
 * Parse un texte CSV et retourne la liste des produits valides.
 * Les lignes invalides sont ignorées (mais comptabilisées dans le retour).
 */
export interface ImportResult {
  products: Product[];
  ignored: number;
  errors: string[];
}

function safeJsonArray<T>(raw: string, fallback: T[]): T[] {
  if (!raw || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as T[];
    return fallback;
  } catch {
    return fallback;
  }
}

const VALID_DIRECTIONS: PortDirection[] = ["in", "out", "bi"];

function sanitizePort(p: unknown, defaultDir: PortDirection): Port | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  if (typeof o.label !== "string") return null;
  const id = typeof o.id === "string" && o.id ? o.id : `port-${Math.random().toString(36).slice(2, 8)}`;
  const signal = typeof o.signal === "string" ? o.signal : "AUDIO";
  const direction =
    typeof o.direction === "string" && (VALID_DIRECTIONS as string[]).includes(o.direction)
      ? (o.direction as PortDirection)
      : defaultDir;
  // Préserve l'éventuel `kind` pour les éléments décoratifs (espace / séparateur)
  const kind =
    o.kind === "spacer" || o.kind === "separator"
      ? (o.kind as "spacer" | "separator")
      : undefined;
  return kind ? { id, label: o.label, signal, direction, kind } : { id, label: o.label, signal, direction };
}

export function parseProductsCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { products: [], ignored: 0, errors: ["Fichier vide ou sans en-tête."] };
  }

  const headerRow = rows[0];
  const headerKeys = headerRow.map(normalizeHeader);

  // Vérifier qu'on a au moins reference + manufacturer + category
  const required: ColumnKey[] = ["reference", "manufacturer", "category"];
  for (const r of required) {
    if (!headerKeys.includes(r)) {
      return {
        products: [],
        ignored: 0,
        errors: [
          `Colonne obligatoire manquante : « ${HEADERS_FR[r]} ». ` +
            `Colonnes attendues : ${COLUMNS.map((c) => HEADERS_FR[c]).join(", ")}.`,
        ],
      };
    }
  }

  const products: Product[] = [];
  const errors: string[] = [];
  let ignored = 0;

  for (let lineNum = 1; lineNum < rows.length; lineNum++) {
    const cells = rows[lineNum];
    if (cells.every((c) => c.trim() === "")) {
      // Ligne vide : ignorer silencieusement
      continue;
    }
    const get = (k: ColumnKey): string => {
      const idx = headerKeys.indexOf(k);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };

    const reference = get("reference");
    const manufacturer = get("manufacturer");
    const category = get("category");

    if (!reference || !manufacturer || !category) {
      ignored++;
      errors.push(`Ligne ${lineNum + 1} ignorée (référence, marque ou catégorie vide).`);
      continue;
    }

    let id = get("id");
    if (!id) {
      id = `${manufacturer}-${reference}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    const rawInputs = safeJsonArray(get("inputs"), []);
    const rawOutputs = safeJsonArray(get("outputs"), []);
    const rawMiddle = safeJsonArray(get("middle"), []);

    const inputs = rawInputs.map((p) => sanitizePort(p, "in")).filter((p): p is Port => !!p);
    const outputs = rawOutputs
      .map((p) => sanitizePort(p, "out"))
      .filter((p): p is Port => !!p);
    const middle = rawMiddle
      .map((p) => sanitizePort(p, "bi"))
      .filter((p): p is Port => !!p);

    const rackSizeRaw = get("rackSize");
    const rackSize: RackSize | undefined =
      rackSizeRaw === "19" || rackSizeRaw === "10" ? rackSizeRaw : undefined;
    const rackWidthRaw = get("rackWidth");
    const rackWidth: RackWidth | undefined =
      rackWidthRaw === "full" || rackWidthRaw === "half" || rackWidthRaw === "quarter"
        ? rackWidthRaw
        : undefined;
    const rackHeightRaw = get("rackHeightU");
    const rackHeightU = rackHeightRaw ? Number(rackHeightRaw) : undefined;

    const product: Product = {
      id,
      reference,
      manufacturer,
      category,
      inputs,
      outputs,
    };
    if (middle.length) product.middle = middle;
    const articleCode = get("articleCode");
    if (articleCode) product.articleCode = articleCode;
    const productUrl = get("productUrl");
    if (productUrl) product.productUrl = productUrl;
    if (rackHeightU !== undefined && !Number.isNaN(rackHeightU)) product.rackHeightU = rackHeightU;
    if (rackSize) product.rackSize = rackSize;
    if (rackWidth) product.rackWidth = rackWidth;

    products.push(product);
  }

  return { products, ignored, errors };
}

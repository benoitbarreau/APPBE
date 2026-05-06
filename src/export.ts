import { toPng, toJpeg, toSvg } from "html-to-image";
import jsPDF from "jspdf";
import { getViewportForBounds } from "@xyflow/react";
import { PAGE_BOUNDS, PAGE_NODE_ID } from "./page";

type ExportFormat = "png" | "jpeg" | "svg" | "pdf";

export interface CartoucheData {
  client: string;
  lieu: string;
  campus: string;       // nom du projet / salle
  tabName: string;      // nom du synoptique / onglet (trade ou name)
  date: string;
  authorName: string;
  version: string;
}

interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  background?: string;
  cartouche?: CartoucheData;
  startPageNum?: number;   // numéro de la 1ère page (défaut 1)
  totalPages?: number;     // nombre total de pages (pour numérotation)
}

interface PrintOptions {
  background?: string;
  cartouche?: CartoucheData;
}

interface ReactFlowAccess {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getNodes: () => any[];
}

// A3 landscape at ~300 dpi (pixelRatio 2 × RASTER)
const A3_W_MM = 420;
const A3_H_MM = 297;
const RASTER_W = 2480;   // 1x width
const RASTER_H = 1754;   // 1x height
const PIX = 2;           // pixelRatio

// Bande inférieure : cartouche + mention légale (≈ 26mm sur A3)
const BOTTOM_H = 160;
const DIAGRAM_H = RASTER_H - BOTTOM_H;  // 1594px

const NODE_W = 240;
const NODE_H = 220;

const CONFIDENTIALITY_NOTICE =
  "Mention légale – Confidentialité : Ce document technique est strictement confidentiel. " +
  "Toute reproduction, diffusion, transmission, ou partage, intégral ou partiel, est formellement " +
  "interdit sans autorisation préalable écrite de Vidéo Synergie.";

export interface PageRect {
  x: number; y: number; width: number; height: number; index: number;
}

// ── Utilitaires téléchargement ────────────────────────────────────────────

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function downloadFile(dataUrl: string, filename: string, format: string): void {
  if (format === "svg") {
    const svgText = decodeURIComponent(dataUrl.split(",")[1] ?? "");
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    downloadDataUrl(dataUrl, filename);
  }
}

// ── Calcul des pages ─────────────────────────────────────────────────────

export function computePageRects(nodes: unknown[]): PageRect[] {
  let maxRight = PAGE_BOUNDS.width, maxBottom = PAGE_BOUNDS.height;
  let minLeft = 0, minTop = 0;
  for (const n of nodes as { id?: string; position?: { x: number; y: number } }[]) {
    if (typeof n.id === "string" && n.id.startsWith(PAGE_NODE_ID)) continue;
    const x = n.position?.x ?? 0;
    const y = n.position?.y ?? 0;
    if (x + NODE_W > maxRight) maxRight = x + NODE_W;
    if (y + NODE_H > maxBottom) maxBottom = y + NODE_H;
    if (x < minLeft) minLeft = x;
    if (y < minTop) minTop = y;
  }
  const colStart = Math.min(0, Math.floor(minLeft / PAGE_BOUNDS.width));
  const rowStart = Math.min(0, Math.floor(minTop / PAGE_BOUNDS.height));
  const colEnd = Math.max(1, Math.ceil(maxRight / PAGE_BOUNDS.width));
  const rowEnd = Math.max(1, Math.ceil(maxBottom / PAGE_BOUNDS.height));
  const result: PageRect[] = [];
  let idx = 1;
  for (let r = rowStart; r < rowEnd; r++)
    for (let c = colStart; c < colEnd; c++)
      result.push({
        x: c * PAGE_BOUNDS.width, y: r * PAGE_BOUNDS.height,
        width: PAGE_BOUNDS.width, height: PAGE_BOUNDS.height, index: idx++,
      });
  return result;
}

// Alias interne
function computePages(nodes: unknown[]): PageRect[] {
  return computePageRects(nodes);
}

// ── DOM helpers ───────────────────────────────────────────────────────────

function getViewportElement(): HTMLElement | null {
  return document.querySelector(".react-flow__viewport") as HTMLElement | null;
}

/** Fixe les largeurs des inputs câble avant capture (field-sizing non supporté par html-to-image).
 *
 * Problème : `field-sizing: content` ignore la propriété `width` — régler inp.style.width
 * n'a aucun effet tant que field-sizing est actif. html-to-image clone le DOM sans ce support,
 * ce qui fait rétrécir les inputs et tronque la valeur affichée.
 *
 * ⚠️  getBoundingClientRect() est FAUX ici : il retourne des px viewport (multipliés par le
 *     zoom React Flow). Si le canvas est à 80%, tous les inputs seraient trop étroits.
 *     offsetWidth retourne des px CSS (layout), indépendant des CSS transforms parents.
 *
 * Solution :
 *  1. Mesurer offsetWidth (px CSS, zoom-agnostique) — field-sizing: content encore actif.
 *  2. Désactiver field-sizing via setProperty("field-sizing","normal").
 *  3. Appliquer la largeur mesurée + 2px de marge de sécurité.
 *  4. Restaurer les deux propriétés après la capture.
 */
function fixCableLabelWidths(): () => void {
  const inputs = document.querySelectorAll<HTMLInputElement>(".cable-edge-type, .cable-edge-len");
  const restores: Array<() => void> = [];
  inputs.forEach((inp) => {
    const prevWidth = inp.style.width;
    const prevFieldSizing = inp.style.getPropertyValue("field-sizing");
    // offsetWidth = px CSS layout, non affecté par les transforms (zoom React Flow)
    const w = inp.offsetWidth;
    // Désactiver field-sizing (sinon il ignore width)
    inp.style.setProperty("field-sizing", "normal");
    // +2px de marge pour éviter toute troncature due aux arrondis
    inp.style.width = `${Math.max(w + 2, 8)}px`;
    restores.push(() => {
      inp.style.width = prevWidth;
      if (prevFieldSizing) {
        inp.style.setProperty("field-sizing", prevFieldSizing);
      } else {
        inp.style.removeProperty("field-sizing");
      }
    });
  });
  return () => restores.forEach((r) => r());
}

/** Masque les repères de page (pointillés rouges) avant la capture. */
function hidePageBoundaries(): () => void {
  const els = Array.from(
    document.querySelectorAll<HTMLElement>(".page-boundary, .page-boundary-label"),
  );
  els.forEach((el) => { el.style.visibility = "hidden"; });
  return () => els.forEach((el) => { el.style.visibility = ""; });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Récupère le src du logo depuis le DOM (cartouche déjà monté). */
function getLogoSrc(): string | null {
  return document.querySelector<HTMLImageElement>(".cartouche-logo-img")?.src ?? null;
}

// ── Utilitaires texte canvas ──────────────────────────────────────────────

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function clipText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 0 && ctx.measureText(clipped + "…").width > maxWidth)
    clipped = clipped.slice(0, -1);
  return clipped + "…";
}

// ── Dessin du cartouche ───────────────────────────────────────────────────

async function drawCartouche(
  ctx: CanvasRenderingContext2D,
  data: CartoucheData,
  cx: number, cy: number, cw: number, ch: number,
  sc: number,
): Promise<void> {
  const bw = 1.5 * sc;
  const pad = 8 * sc;

  // ── Helper : texte centré dans une cellule ────────────────────────────
  const cell = (
    text: string,
    x: number, y: number, w: number, h: number,
    font: string, color: string,
  ) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(clipText(ctx, text, w - pad * 2), x + w / 2, y + h / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  };

  // ── Helper : ligne horizontale ────────────────────────────────────────
  const hline = (y: number, x1 = cx, x2 = cx + cw) => {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = bw;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
  };

  // ── Helper : ligne verticale ──────────────────────────────────────────
  const vline = (x: number, y1: number, y2: number) => {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = bw;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
  };

  // Fond blanc + bordure extérieure
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cx, cy, cw, ch);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = bw;
  ctx.strokeRect(cx + bw / 2, cy + bw / 2, cw - bw, ch - bw);

  // ── Hauteurs des lignes ───────────────────────────────────────────────
  // 5 lignes : CLIENT | LIEU | campus/BE | tabName/author | date/version
  const row1H = Math.round(ch * 0.22);          // CLIENT
  const row2H = Math.round(ch * 0.19);          // LIEU
  const bodyH = ch - row1H - row2H;             // 3 lignes restantes
  const rowH  = Math.round(bodyH / 3);          // hauteur de chaque ligne corps
  // Ajustement pour combler arrondi
  const row5H = bodyH - rowH * 2;

  const y2 = cy + row1H;
  const y3 = y2 + row2H;
  const y4 = y3 + rowH;
  const y5 = y4 + rowH;

  // ── Colonnes ──────────────────────────────────────────────────────────
  // Logo : droite 25 % | corps gauche : col1 51 % + col2 49 %
  const col3W = Math.round(cw * 0.25);
  const bodyW  = cw - col3W;
  const col1W  = Math.round(bodyW * 0.51);
  const col2W  = bodyW - col1W;
  const x2col  = cx + col1W;          // séparateur col1/col2
  const x3col  = cx + col1W + col2W;  // séparateur corps/logo

  // ── ROW 1 : CLIENT (pleine largeur, centré, gras) ─────────────────────
  cell(
    `CLIENT : ${data.client || "—"}`,
    cx, cy, cw, row1H,
    `bold ${13 * sc}px Arial, sans-serif`, "#000000",
  );
  hline(y2);

  // ── ROW 2 : LIEU (corps 75 %, centré, gras) ─────────────────────────
  cell(
    `LIEU : ${data.lieu || "—"}`,
    cx, y2, bodyW, row2H,
    `bold ${11 * sc}px Arial, sans-serif`, "#000000",
  );
  // séparateur vertical logo (démarre ici)
  vline(x3col, y2, cy + ch);
  hline(y3, cx, x3col);

  // ── séparateur vertical col1/col2 (du bas de LIEU au bas du cartouche)
  vline(x2col, y3, cy + ch);

  // ── ROW 3 : campus | "Bureau d'étude" ────────────────────────────────
  cell(
    data.campus || "—",
    cx, y3, col1W, rowH,
    `bold ${11 * sc}px Arial, sans-serif`, "#000000",
  );
  cell(
    "BUREAU D'ÉTUDE",
    x2col, y3, col2W, rowH,
    `bold ${11 * sc}px Arial, sans-serif`, "#000000",
  );
  hline(y4, cx, x3col);

  // ── ROW 4 : tabName (lot — rouge gras) | authorName ──────────────────
  cell(
    data.tabName || "",
    cx, y4, col1W, rowH,
    `bold ${11 * sc}px Arial, sans-serif`, "#cc0000",
  );
  cell(
    data.authorName || "—",
    x2col, y4, col2W, rowH,
    `bold ${11 * sc}px Arial, sans-serif`, "#000000",
  );
  hline(y5, cx, x3col);

  // ── ROW 5 : date | version ────────────────────────────────────────────
  cell(
    data.date || "",
    cx, y5, col1W, row5H,
    `${11 * sc}px Arial, sans-serif`, "#000000",
  );
  cell(
    `Version : ${data.version || "V1.0"}`,
    x2col, y5, col2W, row5H,
    `${11 * sc}px Arial, sans-serif`, "#000000",
  );

  // ── Logo : col3, lignes 2-5 ───────────────────────────────────────────
  const logoSrc = getLogoSrc();
  if (logoSrc) {
    try {
      const logo = await loadImage(logoSrc);
      const logoAreaH = cy + ch - y2;
      const maxLW = col3W - pad * 2;
      const maxLH = logoAreaH - pad * 2;
      const ratio = logo.naturalWidth / logo.naturalHeight;
      let imgW = maxLW, imgH = imgW / ratio;
      if (imgH > maxLH) { imgH = maxLH; imgW = imgH * ratio; }
      const imgX = x3col + (col3W - imgW) / 2;
      const imgY = y2 + (logoAreaH - imgH) / 2;
      ctx.drawImage(logo, imgX, imgY, imgW, imgH);
    } catch { /* logo absent — silencieux */ }
  }
}

// ── Dessin de la mention légale ───────────────────────────────────────────

function drawConfidentialityNotice(
  ctx: CanvasRenderingContext2D,
  botY: number,
  botH: number,
  availW: number,  // largeur disponible (jusqu'au cartouche)
  sc: number,
): void {
  const fontSize = 7 * sc;
  ctx.font = `italic ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = "#9ca3af";
  ctx.textBaseline = "bottom";
  ctx.textAlign = "center";

  const maxW = availW - 40 * sc;
  const lines = wrapText(ctx, CONFIDENTIALITY_NOTICE, maxW);
  const lineH = fontSize * 1.5;

  lines.forEach((line, i) => {
    ctx.fillText(
      line,
      availW / 2,
      botY + botH - 6 * sc - (lines.length - 1 - i) * lineH,
    );
  });

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// ── Dessin du numéro de page ──────────────────────────────────────────────

function drawPageNumber(
  ctx: CanvasRenderingContext2D,
  pageNum: number,
  totalPages: number,
  botY: number,
  botH: number,
  sc: number,
): void {
  if (totalPages <= 1) return;
  ctx.font = `bold ${10 * sc}px Arial, sans-serif`;
  ctx.fillStyle = "#374151";
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  // Bas à gauche
  ctx.fillText(`PAGE ${pageNum}`, 18 * sc, botY + botH - 8 * sc);
  ctx.textBaseline = "alphabetic";
}

// ── Composition d'une page A3 ─────────────────────────────────────────────

async function composePage(
  diagramDataUrl: string,
  cartouche: CartoucheData | undefined,
  pageNum: number,
  totalPages: number,
): Promise<string> {
  const diagImg = await loadImage(diagramDataUrl);
  const sc = PIX;
  const W = RASTER_W * sc;    // 4960
  const H = RASTER_H * sc;    // 3508
  const botH = BOTTOM_H * sc; // 400
  const botY = H - botH;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Fond blanc
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Synoptique (partie haute)
  ctx.drawImage(diagImg, 0, 0, W, botY);

  // Cartouche (droite, 25 % de la largeur)
  const carW = Math.round(W * 0.25);
  const carX = W - carW;

  if (cartouche) {
    await drawCartouche(ctx, cartouche, carX, botY, carW, botH, sc);
  }

  // Mention légale (centré dans la zone gauche)
  drawConfidentialityNotice(ctx, botY, botH, carX, sc);

  // Numéro de page (si plusieurs pages) — bas à gauche
  drawPageNumber(ctx, pageNum, totalPages, botY, botH, sc);

  return canvas.toDataURL("image/png");
}

// ── Captures viewport ─────────────────────────────────────────────────────

async function snapshotDiagram(
  format: "png" | "jpeg" | "svg",
  bounds: { x: number; y: number; width: number; height: number },
  background: string,
): Promise<string> {
  const viewport = getViewportElement();
  if (!viewport) throw new Error("React Flow viewport introuvable");
  const restoreWidths = fixCableLabelWidths();
  const restoreBounds = hidePageBoundaries();
  const tx = getViewportForBounds(bounds, RASTER_W, DIAGRAM_H, 0.5, 4, 0);
  const opts = {
    backgroundColor: background,
    width: RASTER_W,
    height: DIAGRAM_H,
    pixelRatio: PIX,
    style: {
      width: `${RASTER_W}px`,
      height: `${DIAGRAM_H}px`,
      transform: `translate(${tx.x}px, ${tx.y}px) scale(${tx.zoom})`,
    },
    cacheBust: true,
    skipFonts: true,
  };
  try {
    if (format === "png") return await toPng(viewport, opts);
    if (format === "jpeg") return await toJpeg(viewport, { ...opts, quality: 0.95 });
    return await toSvg(viewport, opts);
  } finally {
    restoreWidths();
    restoreBounds();
  }
}

async function snapshotFull(
  format: "png" | "jpeg" | "svg",
  bounds: { x: number; y: number; width: number; height: number },
  background: string,
): Promise<string> {
  const viewport = getViewportElement();
  if (!viewport) throw new Error("React Flow viewport introuvable");
  const restoreWidths = fixCableLabelWidths();
  const restoreBounds = hidePageBoundaries();
  const tx = getViewportForBounds(bounds, RASTER_W, RASTER_H, 0.5, 4, 0);
  const opts = {
    backgroundColor: background,
    width: RASTER_W,
    height: RASTER_H,
    pixelRatio: PIX,
    style: {
      width: `${RASTER_W}px`,
      height: `${RASTER_H}px`,
      transform: `translate(${tx.x}px, ${tx.y}px) scale(${tx.zoom})`,
    },
    cacheBust: true,
    skipFonts: true,
  };
  try {
    if (format === "png") return await toPng(viewport, opts);
    if (format === "jpeg") return await toJpeg(viewport, { ...opts, quality: 0.95 });
    return await toSvg(viewport, opts);
  } finally {
    restoreWidths();
    restoreBounds();
  }
}

// ── API publique ──────────────────────────────────────────────────────────

/**
 * Capture la page courante et compose le rendu final.
 * Utilisable depuis App.tsx pour l'export multi-onglets.
 */
export async function captureAndComposePage(
  _rf: ReactFlowAccess,
  page: PageRect,
  opts: {
    background?: string;
    cartouche?: CartoucheData;
    pageNum: number;
    totalPages: number;
    format?: "png" | "jpeg" | "svg";
  },
): Promise<string> {
  const { background = "#ffffff", cartouche, pageNum, totalPages, format = "png" } = opts;
  if (format === "svg") return snapshotFull("svg", page, background);
  const diag = await snapshotDiagram("png", page, background);
  return composePage(diag, cartouche, pageNum, totalPages);
}

/**
 * Construit et enregistre un PDF à partir de pages déjà rendues (data URLs PNG).
 */
export async function buildAndSavePDF(pages: string[], filename: string): Promise<void> {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage("a3", "landscape");
    pdf.addImage(pages[i], "PNG", 0, 0, A3_W_MM, A3_H_MM, undefined, "FAST");
  }
  pdf.save(filename);
}

function suffixedFilename(filename: string, suffix: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return `${filename}${suffix}`;
  return `${filename.slice(0, dot)}${suffix}${filename.slice(dot)}`;
}

/**
 * Export de l'onglet courant (RF doit afficher le bon onglet).
 */
export async function exportDiagram(
  rf: ReactFlowAccess,
  opts: ExportOptions,
): Promise<void> {
  const {
    format,
    filename = `synoptique.${format}`,
    background = "#ffffff",
    cartouche,
    startPageNum = 1,
    totalPages,
  } = opts;

  const allNodes = rf.getNodes();
  const productNodes = allNodes.filter(
    (n) => typeof (n as { id?: string }).id === "string" &&
           !(n as { id: string }).id.startsWith(PAGE_NODE_ID),
  );
  if (productNodes.length === 0) throw new Error("Aucun produit sur le synoptique");

  const pages = computePages(allNodes);
  const effectiveTotalPages = totalPages ?? pages.length;

  const buildPage = async (p: PageRect, localIdx: number): Promise<string> => {
    const pageNum = startPageNum + localIdx;
    if (format === "svg") return snapshotFull("svg", p, background);
    const diag = await snapshotDiagram("png", p, background);
    return composePage(diag, cartouche, pageNum, effectiveTotalPages);
  };

  if (format === "pdf") {
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
    let first = true;
    for (let i = 0; i < pages.length; i++) {
      const dataUrl = await buildPage(pages[i], i);
      if (!first) pdf.addPage("a3", "landscape");
      first = false;
      pdf.addImage(dataUrl, "PNG", 0, 0, A3_W_MM, A3_H_MM, undefined, "FAST");
    }
    pdf.save(filename);
    return;
  }

  if (pages.length === 1) {
    const dataUrl = await buildPage(pages[0], 0);
    downloadFile(dataUrl, filename, format);
    return;
  }

  for (let i = 0; i < pages.length; i++) {
    const dataUrl = await buildPage(pages[i], i);
    downloadFile(dataUrl, suffixedFilename(filename, `-page${pages[i].index}`), format);
  }
}

/**
 * Ouvre une fenêtre de prévisualisation impression.
 * dataUrls = pages déjà rendues (PNG) ou vide pour capturer l'onglet courant.
 */
export async function openPrintPreview(
  dataUrls: string[],
  totalPages: number,
): Promise<void> {
  const win = window.open("", "_blank", "width=1200,height=850");
  if (!win)
    throw new Error(
      "La fenêtre de prévisualisation a été bloquée par le navigateur.\nAutorisez les popups pour ce site.",
    );

  const pagesHtml = dataUrls
    .map(
      (url, i) =>
        `<div class="page">
          ${totalPages > 1 ? `<div class="page-label">PAGE ${i + 1} / ${totalPages}</div>` : ""}
          <img src="${url}" alt="Page ${i + 1}" />
        </div>`,
    )
    .join("\n");

  win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Impression — SynoX</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    .toolbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      display: flex; align-items: center; gap: 12px; padding: 10px 20px;
      background: #1c1f24; color: #fff;
      font-family: -apple-system, Arial, sans-serif; font-size: 14px;
    }
    .toolbar h1 { font-size: 15px; font-weight: 600; flex: 1; }
    .toolbar button {
      padding: 7px 18px; border: none; border-radius: 6px;
      cursor: pointer; font-size: 13px; font-weight: 600;
    }
    .btn-print { background: #2563eb; color: #fff; }
    .btn-print:hover { background: #1d4ed8; }
    .btn-close { background: #374151; color: #fff; }
    .btn-close:hover { background: #4b5563; }
    .page-count { font-size: 13px; color: #9ca3af; }
    body { background: #e5e7eb; padding: 70px 20px 30px; }
    .page {
      position: relative; margin: 0 auto 28px; background: #fff;
      box-shadow: 0 4px 20px rgba(0,0,0,.25);
      width: min(100%, calc((100vh - 100px) * 420 / 297));
    }
    .page-label {
      position: absolute; top: 6px; right: 10px;
      font-family: -apple-system, Arial, sans-serif;
      font-size: 11px; color: #6b7280;
      background: rgba(255,255,255,.8); padding: 2px 6px; border-radius: 3px;
    }
    .page img { display: block; width: 100%; height: auto; }
    @media print {
      .toolbar, .page-label { display: none !important; }
      html { margin: 0; padding: 0; }
      body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      .page {
        margin: 0 !important; padding: 0 !important; box-shadow: none !important;
        width: 420mm; height: 297mm; overflow: hidden; display: block;
      }
      .page + .page { page-break-before: always; break-before: page; }
      .page img { display: block; width: 420mm; height: 297mm; }
      @page { size: A3 landscape; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <h1>🖨 Prévisualisation impression — SynoX</h1>
    <span class="page-count">${totalPages} page${totalPages > 1 ? "s" : ""} · Format A3 paysage</span>
    <button class="btn-print" onclick="window.print()">Imprimer</button>
    <button class="btn-close" onclick="window.close()">Fermer</button>
  </div>
  ${pagesHtml}
</body>
</html>`);
  win.document.close();
}

/**
 * Impression de l'onglet courant (compat ascendante).
 */
export async function printDiagram(
  rf: ReactFlowAccess,
  opts: PrintOptions = {},
): Promise<void> {
  const { background = "#ffffff", cartouche } = opts;

  const allNodes = rf.getNodes();
  const productNodes = allNodes.filter(
    (n) => typeof (n as { id?: string }).id === "string" &&
           !(n as { id: string }).id.startsWith(PAGE_NODE_ID),
  );
  if (productNodes.length === 0) throw new Error("Aucun produit sur le synoptique");

  const pages = computePages(allNodes);
  const totalPages = pages.length;

  const dataUrls: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const diag = await snapshotDiagram("png", pages[i], background);
    dataUrls.push(await composePage(diag, cartouche, i + 1, totalPages));
  }

  await openPrintPreview(dataUrls, totalPages);
}

import { toPng, toJpeg, toSvg } from "html-to-image";
import jsPDF from "jspdf";
import { getViewportForBounds } from "@xyflow/react";
import { PAGE_BOUNDS, PAGE_NODE_ID } from "./page";
import type { SignalDef, Zone } from "./types";

type ExportFormat = "png" | "jpeg" | "svg" | "pdf";

export interface LegendData {
  signals: Record<string, SignalDef>;
  zones: Zone[];
}

interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  background?: string;
  legend?: LegendData;
}

interface ReactFlowAccess {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getNodes: () => any[];
}

// A3 landscape at ~300 dpi (pixelRatio 2 × RASTER)
const A3_W_MM = 420;
const A3_H_MM = 297;
const RASTER_W = 2480;   // 1x width  (× 2 = 4960px ≈ 300dpi A3 width)
const RASTER_H = 1754;   // 1x height (× 2 = 3508px ≈ 300dpi A3 height)
const PIX = 2;           // pixelRatio

// Hauteur réservée pour la bande légende (en px 1x ≈ 35mm sur A3)
const LEGEND_H = 206;
// Hauteur disponible pour le synoptique
const DIAGRAM_H = RASTER_H - LEGEND_H;

const NODE_W = 240;
const NODE_H = 220;

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getViewportElement(): HTMLElement | null {
  return document.querySelector(".react-flow__viewport") as HTMLElement | null;
}

interface PageRect {
  x: number; y: number; width: number; height: number; index: number;
}

function computePages(nodes: unknown[]): PageRect[] {
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
      result.push({ x: c * PAGE_BOUNDS.width, y: r * PAGE_BOUNDS.height,
                     width: PAGE_BOUNDS.width, height: PAGE_BOUNDS.height, index: idx++ });
  return result;
}

/** Fixe les largeurs des inputs câble avant capture (field-sizing non supporté par html-to-image). */
function fixCableLabelWidths(): () => void {
  const inputs = document.querySelectorAll<HTMLInputElement>(".cable-edge-type, .cable-edge-len");
  const restores: Array<() => void> = [];
  inputs.forEach((inp) => {
    const prev = inp.style.width;
    inp.style.width = `${Math.max(inp.scrollWidth, 8)}px`;
    restores.push(() => { inp.style.width = prev; });
  });
  return () => restores.forEach((r) => r());
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Capture le synoptique sur une hauteur réduite (DIAGRAM_H) pour laisser
 * la place à la bande légende en bas, dans les limites A3.
 */
async function snapshotDiagram(
  format: "png" | "jpeg" | "svg",
  bounds: { x: number; y: number; width: number; height: number },
  background: string,
): Promise<string> {
  const viewport = getViewportElement();
  if (!viewport) throw new Error("React Flow viewport introuvable");
  const restoreWidths = fixCableLabelWidths();
  // On mappe les bounds sur DIAGRAM_H (pas RASTER_H) pour réserver la bande légende
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
  }
}

/**
 * Capture le snoptique pleine hauteur A3 (sans bande légende) pour le SVG.
 */
async function snapshotFull(
  format: "png" | "jpeg" | "svg",
  bounds: { x: number; y: number; width: number; height: number },
  background: string,
): Promise<string> {
  const viewport = getViewportElement();
  if (!viewport) throw new Error("React Flow viewport introuvable");
  const restoreWidths = fixCableLabelWidths();
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
  }
}

/**
 * Compose le synoptique (hauteur réduite) + bande légende en bas.
 * Résultat = A3 exact (RASTER_W × RASTER_H × PIX).
 *
 * Bande du bas :
 *   • Gauche   : types de câbles (pastilles + libellés, 2 colonnes)
 *   • Milieu   : zones (rectangles colorés + libellés)
 *   • Droite   : cartouche capturé depuis le DOM
 */
async function composeWithLegend(
  diagramDataUrl: string,
  ld: LegendData,
): Promise<string> {
  const diagImg = await loadImage(diagramDataUrl);
  const sc = PIX;
  const W = RASTER_W * sc;         // 4960
  const H = RASTER_H * sc;         // 3508 = A3 total
  const stripH = LEGEND_H * sc;    // 412  = bande légende
  const stripY = H - stripH;       // y de début de la bande

  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Fond blanc
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Synoptique (occupe les 2/3 supérieurs de l'A3)
  ctx.drawImage(diagImg, 0, 0, W, stripY);

  // Séparateur haut de bande
  ctx.strokeStyle = "#b0b8c4";
  ctx.lineWidth = sc;
  ctx.beginPath(); ctx.moveTo(0, stripY); ctx.lineTo(W, stripY); ctx.stroke();

  const pad = 18 * sc;
  const rowH = 22 * sc;
  const font    = `${11 * sc}px -apple-system, Arial, sans-serif`;
  const fontB   = `bold ${11 * sc}px -apple-system, Arial, sans-serif`;
  const fontTit = `bold ${12 * sc}px -apple-system, Arial, sans-serif`;
  const dotR = 6 * sc;

  // ── Cartouche (droite, 45% de la largeur) ─────────────────────────────
  const carW = Math.round(W * 0.45);
  const carX = W - carW;

  // Capture du composant Cartouche depuis le DOM
  const cartoucheEl = document.querySelector(".cartouche") as HTMLElement | null;
  if (cartoucheEl) {
    try {
      const carDataUrl = await toPng(cartoucheEl, {
        pixelRatio: sc,
        backgroundColor: "#ffffff",
        skipFonts: true,
      });
      const carImg = await loadImage(carDataUrl);
      // Ajuster la hauteur en conservant le ratio
      const ratio = carImg.naturalWidth / carImg.naturalHeight;
      const carH = Math.min(stripH - pad / 2, Math.round(carW / ratio));
      const carY = stripY + (stripH - carH) / 2;
      ctx.drawImage(carImg, carX, carY, carW, carH);
    } catch {
      // Fallback si la capture échoue : rien
    }
  }

  // Séparateur vertical gauche du cartouche
  ctx.strokeStyle = "#d8dde4";
  ctx.lineWidth = sc;
  ctx.beginPath(); ctx.moveTo(carX, stripY + pad / 2); ctx.lineTo(carX, H - pad / 2); ctx.stroke();

  // Zone disponible pour légende câbles + zones
  const legendW = carX;
  const midX = Math.round(legendW * 0.50); // séparation câbles | zones

  // ── Types de câbles (gauche, 0 → midX) ───────────────────────────────
  const signalList = Object.values(ld.signals).filter((s) => s.label);
  let lx = pad;
  let ly = stripY + pad;
  ctx.font = fontTit; ctx.fillStyle = "#1c1f24";
  ctx.fillText("Types de câbles", lx, ly + 12 * sc);
  ly += 20 * sc;

  const cols = 2;
  const colW = (midX - pad * 2) / cols;
  let col = 0, colY = ly;
  for (const sig of signalList) {
    const cx = lx + col * colW;
    ctx.beginPath();
    ctx.arc(cx + dotR, colY + dotR, dotR, 0, Math.PI * 2);
    ctx.fillStyle = sig.color;
    ctx.fill();
    ctx.font = font; ctx.fillStyle = "#1c1f24";
    ctx.fillText(sig.label, cx + dotR * 2 + 4 * sc, colY + dotR + 4 * sc);
    col++;
    if (col >= cols) { col = 0; colY += rowH; }
    if (colY + rowH > H - pad / 2) break;
  }

  // Séparateur vertical milieu
  ctx.strokeStyle = "#d8dde4";
  ctx.lineWidth = sc;
  ctx.beginPath(); ctx.moveTo(midX, stripY + pad / 2); ctx.lineTo(midX, H - pad / 2); ctx.stroke();

  // ── Zones (droite de la zone gauche, midX → carX) ────────────────────
  const zoneX = midX + pad;
  let zy = stripY + pad;
  ctx.font = fontTit; ctx.fillStyle = "#1c1f24";
  ctx.fillText("Zones", zoneX, zy + 12 * sc);
  zy += 20 * sc;

  for (const zone of ld.zones) {
    const rW = 20 * sc, rH = 14 * sc;
    ctx.fillStyle = zone.color;
    ctx.fillRect(zoneX, zy, rW, rH);
    ctx.strokeStyle = "#aaa"; ctx.lineWidth = 0.5 * sc;
    ctx.strokeRect(zoneX, zy, rW, rH);
    ctx.font = fontB; ctx.fillStyle = "#1c1f24";
    ctx.fillText(zone.label, zoneX + rW + 6 * sc, zy + 11 * sc);
    zy += rowH;
    if (zy + rowH > H - pad / 2) break;
  }

  return canvas.toDataURL("image/png");
}

function suffixedFilename(filename: string, suffix: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return `${filename}${suffix}`;
  return `${filename.slice(0, dot)}${suffix}${filename.slice(dot)}`;
}

interface PrintOptions {
  background?: string;
  legend?: LegendData;
}

/**
 * Génère les pages A3 en PNG, ouvre une fenêtre de prévisualisation
 * et déclenche l'impression native du navigateur.
 */
export async function printDiagram(
  rf: ReactFlowAccess,
  opts: PrintOptions = {},
): Promise<void> {
  const { background = "#ffffff", legend } = opts;

  const allNodes = rf.getNodes();
  const productNodes = allNodes.filter(
    (n) => typeof (n as { id?: string }).id === "string" &&
           !(n as { id: string }).id.startsWith(PAGE_NODE_ID),
  );
  if (productNodes.length === 0) throw new Error("Aucun produit sur le synoptique");

  const pages = computePages(allNodes);

  // Génère toutes les pages
  const dataUrls: string[] = [];
  for (const p of pages) {
    if (legend) {
      const diag = await snapshotDiagram("png", p, background);
      dataUrls.push(await composeWithLegend(diag, legend));
    } else {
      dataUrls.push(await snapshotFull("png", p, background));
    }
  }

  // Ouvre une nouvelle fenêtre de prévisualisation
  const win = window.open("", "_blank", "width=1200,height=850");
  if (!win) throw new Error("La fenêtre de prévisualisation a été bloquée par le navigateur.\nAutorisez les popups pour ce site.");

  const pagesHtml = dataUrls
    .map(
      (url, i) => `
      <div class="page">
        <div class="page-header">Page ${i + 1} / ${dataUrls.length}</div>
        <img src="${url}" alt="Synoptique page ${i + 1}" />
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

    /* ── Barre d'outils (masquée à l'impression) ── */
    .toolbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      display: flex; align-items: center; gap: 12px;
      padding: 10px 20px;
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

    /* ── Corps prévisualisation ── */
    body { background: #e5e7eb; padding: 70px 20px 30px; }
    .page {
      position: relative;
      margin: 0 auto 28px;
      background: #fff;
      box-shadow: 0 4px 20px rgba(0,0,0,.25);
      /* Ratio A3 paysage */
      width: min(100%, calc(100vh * 420 / 297));
    }
    .page-header {
      position: absolute; top: 6px; right: 10px;
      font-family: -apple-system, Arial, sans-serif;
      font-size: 11px; color: #6b7280;
    }
    .page img { display: block; width: 100%; height: auto; }

    /* ── Impression ── */
    @media print {
      .toolbar, .page-header { display: none !important; }
      body { background: #fff; padding: 0; }
      .page {
        margin: 0; box-shadow: none;
        width: 100%; page-break-after: always;
      }
      .page:last-child { page-break-after: avoid; }
      @page { size: A3 landscape; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <h1>🖨 Prévisualisation impression — SynoX</h1>
    <span class="page-count">${dataUrls.length} page${dataUrls.length > 1 ? "s" : ""} · Format A3 paysage</span>
    <button class="btn-print" onclick="window.print()">Imprimer</button>
    <button class="btn-close" onclick="window.close()">Fermer</button>
  </div>
  ${pagesHtml}
</body>
</html>`);
  win.document.close();
}

export async function exportDiagram(
  rf: ReactFlowAccess,
  opts: ExportOptions,
): Promise<void> {
  const { format, filename = `synoptique.${format}`, background = "#ffffff", legend } = opts;

  const allNodes = rf.getNodes();
  const productNodes = allNodes.filter(
    (n) => typeof (n as { id?: string }).id === "string" &&
           !(n as { id: string }).id.startsWith(PAGE_NODE_ID),
  );
  if (productNodes.length === 0) throw new Error("Aucun produit sur le synoptique");

  const pages = computePages(allNodes);

  /** Prend le snapshot puis applique le compositing si legend fournie */
  const buildPage = async (p: PageRect): Promise<string> => {
    if (!legend || format === "svg") {
      return snapshotFull(format === "svg" ? "svg" : "png", p, background);
    }
    const diag = await snapshotDiagram("png", p, background);
    return composeWithLegend(diag, legend);
  };

  if (format === "pdf") {
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
    let first = true;
    for (const p of pages) {
      const dataUrl = await buildPage(p);
      if (!first) pdf.addPage("a3", "landscape");
      first = false;
      // L'image composée est exactement A3 (RASTER_W × RASTER_H × PIX)
      pdf.addImage(dataUrl, "PNG", 0, 0, A3_W_MM, A3_H_MM, undefined, "FAST");
    }
    pdf.save(filename);
    return;
  }

  if (format === "png" || format === "jpeg" || format === "svg") {
    if (pages.length === 1) {
      const dataUrl = await buildPage(pages[0]);
      if (format === "svg") {
        const svgText = decodeURIComponent(dataUrl.split(",")[1] ?? "");
        downloadBlob(new Blob([svgText], { type: "image/svg+xml" }), filename);
      } else {
        downloadDataUrl(dataUrl, filename);
      }
      return;
    }
    for (const p of pages) {
      const fname = suffixedFilename(filename, `-page${p.index}`);
      const dataUrl = await buildPage(p);
      if (format === "svg") {
        const svgText = decodeURIComponent(dataUrl.split(",")[1] ?? "");
        downloadBlob(new Blob([svgText], { type: "image/svg+xml" }), fname);
      } else {
        downloadDataUrl(dataUrl, fname);
      }
    }
  }
}

import { toPng, toJpeg, toSvg } from "html-to-image";
import jsPDF from "jspdf";
import { getViewportForBounds } from "@xyflow/react";
import { PAGE_BOUNDS, PAGE_NODE_ID } from "./page";
import type { SignalDef, Zone, ProjectMeta } from "./types";

type ExportFormat = "png" | "jpeg" | "svg" | "pdf";

export interface LegendData {
  signals: Record<string, SignalDef>;
  zones: Zone[];
  meta: ProjectMeta;
  trade: string; // Lot de l'onglet actif
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

// A3 landscape print dimensions
const A3_W_MM = 420;
const A3_H_MM = 297;
// Working raster for the snapshot. Width/height match A3 aspect ratio
// (420/297 = 1.414). pixelRatio 2 doubles the actual canvas, giving
// effective ~300dpi A3 output.
const RASTER_W = 2480;
const RASTER_H = 1754;
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
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
}

function computePages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: any[],
): PageRect[] {
  let maxRight = PAGE_BOUNDS.width;
  let maxBottom = PAGE_BOUNDS.height;
  let minLeft = 0;
  let minTop = 0;
  for (const n of nodes) {
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
  for (let r = rowStart; r < rowEnd; r++) {
    for (let c = colStart; c < colEnd; c++) {
      result.push({
        x: c * PAGE_BOUNDS.width,
        y: r * PAGE_BOUNDS.height,
        width: PAGE_BOUNDS.width,
        height: PAGE_BOUNDS.height,
        index: idx++,
      });
    }
  }
  return result;
}

/**
 * field-sizing:content n'est pas supporté par html-to-image (canvas).
 * Avant la capture, on fixe une largeur explicite sur chaque input de
 * label câble, puis on restaure après.
 */
function fixCableLabelWidths(): () => void {
  const inputs = document.querySelectorAll<HTMLInputElement>(
    ".cable-edge-type, .cable-edge-len",
  );
  const restores: Array<() => void> = [];
  inputs.forEach((inp) => {
    const prev = inp.style.width;
    const w = Math.max(inp.scrollWidth, 8);
    inp.style.width = `${w}px`;
    restores.push(() => { inp.style.width = prev; });
  });
  return () => restores.forEach((r) => r());
}

async function snapshotToDataUrl(
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
    pixelRatio: 2,
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

// ── Cartouche + légende canvas ───────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Compose le snapshot du synoptique avec une bande en bas :
 *   • bas-gauche  : légende types de câbles
 *   • au-dessus   : zones
 *   • bas-droite  : cartouche
 * Retourne un data-url PNG.
 */
async function composeWithLegend(diagramDataUrl: string, ld: LegendData): Promise<string> {
  const img = await loadImage(diagramDataUrl);
  const imgW = img.naturalWidth;   // RASTER_W * pixelRatio = 4960
  const imgH = img.naturalHeight;  // RASTER_H * pixelRatio = 3508
  const sc = imgW / RASTER_W;      // scale factor (= pixelRatio = 2)

  // Hauteur de la bande légende (proportionnelle à A3)
  const stripH = Math.round(260 * sc);
  const pad = Math.round(16 * sc);
  const font = `${Math.round(11 * sc)}px -apple-system, Arial, sans-serif`;
  const fontBold = `bold ${Math.round(11 * sc)}px -apple-system, Arial, sans-serif`;
  const fontTitle = `bold ${Math.round(12 * sc)}px -apple-system, Arial, sans-serif`;
  const lineH = Math.round(20 * sc);
  const rowH  = Math.round(22 * sc);
  const dotR  = Math.round(6 * sc);

  const canvas = document.createElement("canvas");
  canvas.width  = imgW;
  canvas.height = imgH + stripH;
  const ctx = canvas.getContext("2d")!;

  // Fond blanc
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Synoptique
  ctx.drawImage(img, 0, 0);

  // Séparateur
  ctx.strokeStyle = "#b0b8c4";
  ctx.lineWidth = Math.round(1.5 * sc);
  ctx.beginPath();
  ctx.moveTo(0, imgH);
  ctx.lineTo(imgW, imgH);
  ctx.stroke();

  const stripY = imgH;

  // ── Cartouche (bas-droite, 30% de la largeur) ────────────────────────────
  const carW = Math.round(imgW * 0.30);
  const carX = imgW - carW;

  // Bordure cartouche
  ctx.strokeStyle = "#d8dde4";
  ctx.lineWidth = Math.round(sc);
  ctx.strokeRect(carX + pad / 2, stripY + pad / 2, carW - pad, stripH - pad);

  // Séparateur vertical gauche cartouche
  ctx.beginPath();
  ctx.moveTo(carX, stripY);
  ctx.lineTo(carX, stripY + stripH);
  ctx.stroke();

  const fields: { label: string; value: string }[] = [
    { label: "Campus / Site", value: ld.meta.campus },
    { label: "Lot",           value: ld.trade },
    { label: "Date",          value: ld.meta.date },
    { label: "Client",        value: ld.meta.client },
    { label: "Lieu",          value: ld.meta.lieu },
    { label: "Bureau d'étude",value: ld.meta.bureauEtude },
    { label: "Auteur",        value: ld.meta.authorName },
    { label: "Version",       value: ld.meta.version },
  ];

  // 2 colonnes dans le cartouche
  const carColW = (carW - pad * 2) / 2;
  let carCol = 0;
  let carY = stripY + pad * 1.5;
  for (const f of fields) {
    const fx = carX + pad + carCol * carColW;
    ctx.font = `bold ${Math.round(9 * sc)}px -apple-system, Arial, sans-serif`;
    ctx.fillStyle = "#6c7480";
    ctx.fillText(f.label.toUpperCase(), fx, carY);
    ctx.font = `${Math.round(11 * sc)}px -apple-system, Arial, sans-serif`;
    ctx.fillStyle = "#1c1f24";
    ctx.fillText(f.value || "—", fx, carY + Math.round(14 * sc));
    carCol++;
    if (carCol >= 2) { carCol = 0; carY += lineH * 1.6; }
    if (carY > stripY + stripH - pad) break;
  }

  // ── Zone gauche (types de câbles + zones) ───────────────────────────────
  const leftW = imgW - carW;
  const midX  = Math.round(leftW * 0.42); // séparation zones | câbles

  // ── Légende types de câbles (bas-gauche, 42% largeur) ──────────────────
  const signalList = Object.values(ld.signals).filter((s) => s.label);
  let lx = pad;
  let ly = stripY + pad;
  ctx.font = fontTitle;
  ctx.fillStyle = "#1c1f24";
  ctx.fillText("Types de câbles", lx, ly + Math.round(12 * sc));
  ly += lineH * 1.4;

  const cols = 2;
  const colW = (midX - pad * 2) / cols;
  let col = 0;
  let colY = ly;
  for (const sig of signalList) {
    const cx = lx + col * colW;
    ctx.beginPath();
    ctx.arc(cx + dotR, colY + dotR, dotR, 0, Math.PI * 2);
    ctx.fillStyle = sig.color;
    ctx.fill();
    ctx.font = font;
    ctx.fillStyle = "#1c1f24";
    ctx.fillText(sig.label, cx + dotR * 2 + Math.round(4 * sc), colY + dotR + Math.round(4 * sc));
    col++;
    if (col >= cols) { col = 0; colY += rowH; }
    if (colY + rowH > stripY + stripH - pad / 2) break;
  }

  // ── Zones (au-dessus légende câbles = même colonne gauche, haut) ────────
  // On inverse : zones en premier (haut de la bande), câbles en dessous
  // → Re-calculer positions de façon inversée
  // On va dessiner : zones d'abord, puis câbles en dessous, tout dans la colonne gauche

  // Séparateur vertical milieu
  ctx.strokeStyle = "#d8dde4";
  ctx.lineWidth = Math.round(sc);
  ctx.beginPath();
  ctx.moveTo(midX, stripY + pad / 2);
  ctx.lineTo(midX, stripY + stripH - pad / 2);
  ctx.stroke();

  // ── Zones (moitié droite de la zone gauche) ──────────────────────────────
  const zoneX = midX + pad;
  let zy = stripY + pad;
  ctx.font = fontTitle;
  ctx.fillStyle = "#1c1f24";
  ctx.fillText("Zones", zoneX, zy + Math.round(12 * sc));
  zy += lineH * 1.4;

  for (const zone of ld.zones) {
    const rectW = Math.round(20 * sc);
    const rectH = Math.round(14 * sc);
    ctx.fillStyle = zone.color;
    ctx.fillRect(zoneX, zy, rectW, rectH);
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = Math.round(0.5 * sc);
    ctx.strokeRect(zoneX, zy, rectW, rectH);
    ctx.font = fontBold;
    ctx.fillStyle = "#1c1f24";
    ctx.fillText(zone.label, zoneX + rectW + Math.round(6 * sc), zy + Math.round(11 * sc));
    zy += rowH;
    if (zy + rowH > stripY + stripH - pad / 2) break;
  }

  return canvas.toDataURL("image/png");
}

function suffixedFilename(filename: string, suffix: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return `${filename}${suffix}`;
  return `${filename.slice(0, dot)}${suffix}${filename.slice(dot)}`;
}

export async function exportDiagram(
  rf: ReactFlowAccess,
  opts: ExportOptions,
): Promise<void> {
  const {
    format,
    filename = `synoptique.${format}`,
    background = "#ffffff",
    legend,
  } = opts;

  const allNodes = rf.getNodes();
  const productNodes = allNodes.filter(
    (n) => typeof n.id === "string" && !n.id.startsWith(PAGE_NODE_ID),
  );
  if (productNodes.length === 0)
    throw new Error("Aucun produit sur le synoptique");

  const pages = computePages(allNodes);

  /** Applique le compositing légende si les données sont disponibles */
  const withLegend = async (dataUrl: string): Promise<string> =>
    legend ? composeWithLegend(dataUrl, legend) : dataUrl;

  if (format === "pdf") {
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a3",
      compress: true,
    });
    let first = true;
    for (const p of pages) {
      let dataUrl = await snapshotToDataUrl("png", p, background);
      dataUrl = await withLegend(dataUrl);
      if (!first) pdf.addPage("a3", "landscape");
      first = false;
      // La bande légende allonge l'image, ajuster la hauteur mm en proportion
      const ratio = legend ? (RASTER_H * 2 + 260 * 2) / (RASTER_H * 2) : 1;
      const h = A3_H_MM * ratio;
      pdf.addImage(dataUrl, "PNG", 0, 0, A3_W_MM, h, undefined, "FAST");
    }
    pdf.save(filename);
    return;
  }

  if (format === "png" || format === "jpeg" || format === "svg") {
    if (pages.length === 1) {
      let dataUrl = await snapshotToDataUrl(format === "svg" ? "svg" : format, pages[0], background);
      if (format !== "svg") dataUrl = await withLegend(dataUrl);
      if (format === "svg") {
        const svgText = decodeURIComponent(dataUrl.split(",")[1] ?? "");
        const blob = new Blob([svgText], { type: "image/svg+xml" });
        downloadBlob(blob, filename);
      } else {
        downloadDataUrl(dataUrl, filename);
      }
      return;
    }
    for (const p of pages) {
      const fname = suffixedFilename(filename, `-page${p.index}`);
      let dataUrl = await snapshotToDataUrl(format === "svg" ? "svg" : format, p, background);
      if (format !== "svg") dataUrl = await withLegend(dataUrl);
      if (format === "svg") {
        const svgText = decodeURIComponent(dataUrl.split(",")[1] ?? "");
        const blob = new Blob([svgText], { type: "image/svg+xml" });
        downloadBlob(blob, fname);
      } else {
        downloadDataUrl(dataUrl, fname);
      }
    }
    return;
  }
}

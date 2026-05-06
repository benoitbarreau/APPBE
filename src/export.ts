import { toPng, toJpeg, toSvg } from "html-to-image";
import jsPDF from "jspdf";
import { getViewportForBounds } from "@xyflow/react";
import { PAGE_BOUNDS, PAGE_NODE_ID } from "./page";

type ExportFormat = "png" | "jpeg" | "svg" | "pdf";

interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  background?: string;
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

// Compute the grid of A3 pages needed to cover all placed products,
// matching the on-canvas page frames computed in DiagramCanvas.
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
    // scrollWidth reflète la largeur du contenu rendu
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
  // Fixer les largeurs des inputs câble avant capture (field-sizing non supporté)
  const restoreWidths = fixCableLabelWidths();
  // 0 padding: the bounds rectangle should fill the raster exactly.
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
  } = opts;

  const allNodes = rf.getNodes();
  const productNodes = allNodes.filter(
    (n) => typeof n.id === "string" && !n.id.startsWith(PAGE_NODE_ID),
  );
  if (productNodes.length === 0)
    throw new Error("Aucun produit sur le synoptique");

  const pages = computePages(allNodes);

  if (format === "pdf") {
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a3",
      compress: true,
    });
    let first = true;
    for (const p of pages) {
      const dataUrl = await snapshotToDataUrl("png", p, background);
      if (!first) pdf.addPage("a3", "landscape");
      first = false;
      pdf.addImage(dataUrl, "PNG", 0, 0, A3_W_MM, A3_H_MM, undefined, "FAST");
    }
    pdf.save(filename);
    return;
  }

  if (format === "png" || format === "jpeg" || format === "svg") {
    if (pages.length === 1) {
      const dataUrl = await snapshotToDataUrl(format, pages[0], background);
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
      const dataUrl = await snapshotToDataUrl(format, p, background);
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

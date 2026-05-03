import { toPng, toJpeg, toSvg } from "html-to-image";
import jsPDF from "jspdf";
import { getViewportForBounds } from "@xyflow/react";
import { PAGE_BOUNDS } from "./page";

type ExportFormat = "png" | "jpeg" | "svg" | "pdf";

interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  // Region in flow coordinates to export. Defaults to the A3 page bounds.
  bounds?: { x: number; y: number; width: number; height: number };
  // Background color
  background?: string;
}

interface ReactFlowAccess {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getNodes: () => any[];
}

// A3 landscape print dimensions
const A3_W_MM = 420;
const A3_H_MM = 297;
// Working raster for the snapshot. 2x pixelRatio gives ~300dpi-equivalent
// crispness while keeping the canvas size sensible.
const RASTER_W = 2480; // ~150 DPI x 2 ratio = 300 DPI A3 landscape
const RASTER_H = 1754;

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

export async function exportDiagram(
  rf: ReactFlowAccess,
  opts: ExportOptions,
): Promise<void> {
  const {
    format,
    filename = `synoptique.${format}`,
    bounds = PAGE_BOUNDS,
    background = "#ffffff",
  } = opts;

  const viewport = getViewportElement();
  if (!viewport) throw new Error("React Flow viewport introuvable");

  if (rf.getNodes().filter((n) => n.id !== "__page__").length === 0) {
    throw new Error("Aucun produit sur le synoptique");
  }

  // Frame the chosen bounds into the export canvas with a small margin.
  const tx = getViewportForBounds(
    bounds,
    RASTER_W,
    RASTER_H,
    0.5,
    2,
    20,
  );

  const commonOpts = {
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

  if (format === "png") {
    const dataUrl = await toPng(viewport, commonOpts);
    downloadDataUrl(dataUrl, filename);
    return;
  }
  if (format === "jpeg") {
    const dataUrl = await toJpeg(viewport, { ...commonOpts, quality: 0.95 });
    downloadDataUrl(dataUrl, filename);
    return;
  }
  if (format === "svg") {
    const dataUrl = await toSvg(viewport, commonOpts);
    const svgText = decodeURIComponent(dataUrl.split(",")[1] ?? "");
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    downloadBlob(blob, filename);
    return;
  }
  if (format === "pdf") {
    const dataUrl = await toPng(viewport, commonOpts);
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a3",
      compress: true,
    });
    pdf.addImage(dataUrl, "PNG", 0, 0, A3_W_MM, A3_H_MM, undefined, "FAST");
    pdf.save(filename);
    return;
  }
}

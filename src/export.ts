import { toPng, toJpeg, toSvg } from "html-to-image";
import jsPDF from "jspdf";
import { getNodesBounds, getViewportForBounds } from "@xyflow/react";

type ExportFormat = "png" | "jpeg" | "svg" | "pdf";

interface ExportOptions {
  format: ExportFormat;
  filename?: string;
  // Padding around the diagram bounds (in flow coords)
  padding?: number;
  // Pixel width of the rendered image
  pixelWidth?: number;
  // Pixel height of the rendered image
  pixelHeight?: number;
  // Background color
  background?: string;
}

interface ReactFlowAccess {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getNodes: () => any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getViewport: () => any;
}

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
    padding = 40,
    pixelWidth = 1920,
    pixelHeight = 1200,
    background = "#ffffff",
  } = opts;

  const viewport = getViewportElement();
  if (!viewport) throw new Error("React Flow viewport introuvable");

  // Compute the bounds of all nodes and a viewport that fits them
  const nodes = rf.getNodes();
  if (nodes.length === 0) throw new Error("Aucun produit sur le synoptique");
  const bounds = getNodesBounds(nodes);
  const tx = getViewportForBounds(
    bounds,
    pixelWidth,
    pixelHeight,
    0.5,
    2,
    padding,
  );

  // Fonts may include OFL/ subset CSS that's not embedded in DOM clones,
  // so disable font fetching to avoid CORS errors during the snapshot.
  const commonOpts = {
    backgroundColor: background,
    width: pixelWidth,
    height: pixelHeight,
    style: {
      width: `${pixelWidth}px`,
      height: `${pixelHeight}px`,
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
    // toSvg returns a data URL with the SVG embedded; convert to a Blob
    const svgText = decodeURIComponent(dataUrl.split(",")[1] ?? "");
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    downloadBlob(blob, filename);
    return;
  }
  if (format === "pdf") {
    const dataUrl = await toPng(viewport, commonOpts);
    const orientation = pixelWidth >= pixelHeight ? "landscape" : "portrait";
    const pdf = new jsPDF({ orientation, unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / pixelWidth, pageH / pixelHeight);
    const w = pixelWidth * ratio;
    const h = pixelHeight * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(dataUrl, "PNG", x, y, w, h);
    pdf.save(filename);
    return;
  }
}

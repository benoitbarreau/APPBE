/**
 * bayExport.ts
 * Export des onglets Baie : PDF, JPEG, CSV, XLS, Impression.
 *
 * Mise en page A3 paysage — identique aux synoptiques :
 *  - Zone principale : visuel de la baie centré et agrandi au maximum
 *  - Bande inférieure (BOTTOM_H) : mention légale (gauche) + cartouche (droite 25 %)
 *  Le cartouche est dessiné avec la même fonction que les synoptiques (drawCartouche).
 */

import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import type { Rack } from "../types";
import {
  type CartoucheData,
  loadImage,
  drawCartouche,
  drawConfidentialityNotice,
} from "../export";

// ── Constantes identiques à export.ts ────────────────────────────────────────

const A3_W_MM  = 420;
const A3_H_MM  = 297;
const PIX      = 2;      // pixel ratio
const RASTER_W = 2480;   // largeur logique (1×)
const RASTER_H = 1754;   // hauteur logique (1×)
const BOTTOM_H = 160;    // hauteur de la bande inférieure (1×) — identique synoptique

// ── Utilitaires ───────────────────────────────────────────────────────────────

function dlUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
}

function safeFilename(tabName: string): string {
  return tabName.replace(/[^a-z0-9À-ɏ_-]/gi, "_").slice(0, 60);
}

// ── Données CSV / XLS ─────────────────────────────────────────────────────────

interface TRow { posU: string; hU: string; mfr: string; ref: string; label: string; ip: string; swPort: string; vlan: string; serial: string }

function buildRows(racks: Rack[]): TRow[] {
  const multi = racks.length > 1;
  const rows: TRow[] = [];
  for (const rack of racks) {
    const sorted = [...rack.items].sort((a, b) => b.uStart - a.uStart);
    for (const item of sorted) {
      rows.push({
        posU:   multi ? `${rack.name} U${item.uStart}` : `U${item.uStart}`,
        hU:     `${item.heightU}U`,
        mfr:    item.manufacturer ?? "",
        ref:    item.reference ?? "",
        label:  item.label ?? "",
        ip:     item.annotations?.ip ?? "",
        swPort: item.annotations?.switchPort ?? "",
        vlan:   item.annotations?.vlan ?? "",
        serial: item.annotations?.serial ?? "",
      });
    }
  }
  return rows;
}

// ── Composition de la page ────────────────────────────────────────────────────

/** Masque temporairement le bouton "+ Ajouter une baie" pendant la capture. */
function hideAddRackButton(): () => void {
  const els = Array.from(document.querySelectorAll<HTMLElement>(".bay-add-rack-col"));
  els.forEach((el) => { el.style.visibility = "hidden"; });
  return () => els.forEach((el) => { el.style.visibility = ""; });
}

async function composeBayPage(
  cartouche: CartoucheData,
): Promise<string> {
  const sc  = PIX;
  const W   = RASTER_W * sc;      // 4960 px réels
  const H   = RASTER_H * sc;      // 3508 px réels
  const botH = BOTTOM_H * sc;     // 320 px réels
  const botY = H - botH;          // 3188

  // 1. Capture du visuel rack depuis le DOM
  const rackEl = document.querySelector<HTMLElement>(".bay-racks-row");
  if (!rackEl) throw new Error("Visuel de la baie introuvable. Assurez-vous d'être sur l'onglet Baie.");

  const restoreBtn = hideAddRackButton();
  let rackPng: string;
  try {
    rackPng = await toPng(rackEl, {
      backgroundColor: "#ffffff",   // fond blanc
      pixelRatio: PIX,
      cacheBust: true,
      skipFonts: true,
    });
  } finally {
    restoreBtn();
  }

  // 2. Canvas A3 identique aux synoptiques
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // 3. Rack visual : centré et agrandi au maximum dans la zone de dessin (W × botY)
  const PAD = 24 * sc;
  const areaW = W - PAD * 2;
  const areaH = botY - PAD * 2;
  const rackImg = await loadImage(rackPng);
  const rW = rackImg.naturalWidth, rH = rackImg.naturalHeight;
  const scale = Math.min(areaW / rW, areaH / rH);
  const dW = rW * scale, dH = rH * scale;
  const dX = (W - dW) / 2;
  const dY = PAD + (areaH - dH) / 2;
  ctx.drawImage(rackImg, dX, dY, dW, dH);

  // 4. Cartouche (droite 25 % × bande inférieure) — même fonction que synoptiques
  const carW = Math.round(W * 0.25);   // 1240 px
  const carX = W - carW;               // 3720 px
  await drawCartouche(ctx, cartouche, carX, botY, carW, botH, sc);

  // 5. Mention légale (gauche de la bande inférieure) — même fonction
  drawConfidentialityNotice(ctx, botY, botH, carX, sc);

  return canvas.toDataURL("image/png");
}

// ── API publique ──────────────────────────────────────────────────────────────

export async function exportBayToPDF(
  _racks: Rack[],
  cartouche: CartoucheData,
  tabName: string,
): Promise<void> {
  const dataUrl = await composeBayPage(cartouche);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
  pdf.addImage(dataUrl, "PNG", 0, 0, A3_W_MM, A3_H_MM, undefined, "FAST");
  pdf.save(`${safeFilename(tabName)}_baie.pdf`);
}

export async function exportBayToJPEG(
  _racks: Rack[],
  cartouche: CartoucheData,
  tabName: string,
): Promise<void> {
  const pngUrl = await composeBayPage(cartouche);
  const img = await loadImage(pngUrl);
  const c2 = document.createElement("canvas");
  c2.width = img.naturalWidth; c2.height = img.naturalHeight;
  const ctx2 = c2.getContext("2d")!;
  ctx2.fillStyle = "#ffffff";
  ctx2.fillRect(0, 0, c2.width, c2.height);
  ctx2.drawImage(img, 0, 0);
  dlUrl(c2.toDataURL("image/jpeg", 0.92), `${safeFilename(tabName)}_baie.jpg`);
}

export async function printBay(
  _racks: Rack[],
  cartouche: CartoucheData,
): Promise<void> {
  const dataUrl = await composeBayPage(cartouche);
  const win = window.open("", "_blank", "width=1200,height=850");
  if (!win) throw new Error("La fenêtre d'impression a été bloquée. Autorisez les popups pour ce site.");

  win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>Impression — Baie</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    .toolbar{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;
      gap:12px;padding:10px 20px;background:#1c1f24;color:#fff;
      font-family:-apple-system,Arial,sans-serif;font-size:14px}
    .toolbar h1{font-size:15px;font-weight:600;flex:1}
    .toolbar button{padding:7px 18px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600}
    .btn-print{background:#2563eb;color:#fff}
    .btn-close{background:#374151;color:#fff}
    body{background:#e5e7eb;padding:70px 20px 30px}
    .page{margin:0 auto;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.25);
      width:min(100%,calc((100vh - 100px)*420/297))}
    .page img{display:block;width:100%;height:auto}
    @media print{
      .toolbar{display:none!important}
      html,body{margin:0!important;padding:0!important;background:#fff!important}
      .page{margin:0!important;box-shadow:none!important;width:420mm;height:297mm;overflow:hidden}
      .page img{width:420mm;height:297mm}
      @page{size:A3 landscape;margin:0}
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <h1>🖨 Impression — Baie</h1>
    <button class="btn-print" onclick="window.print()">Imprimer</button>
    <button class="btn-close" onclick="window.close()">Fermer</button>
  </div>
  <div class="page"><img src="${dataUrl}" alt="Baie"/></div>
</body>
</html>`);
  win.document.close();
}

// ── CSV ───────────────────────────────────────────────────────────────────────

export function exportBayToCSV(racks: Rack[], tabName: string): void {
  const rows = buildRows(racks);
  const headers = ["Position U","Hauteur U","Fabricant","Référence","Label","IP","Port switch","VLAN","N° série"];
  const keys = ["posU","hU","mfr","ref","label","ip","swPort","vlan","serial"] as const;
  const lines = [
    headers.join(";"),
    ...rows.map((r) => keys.map((k) => `"${(r[k] ?? "").replace(/"/g, '""')}"`).join(";")),
  ];
  const csv = "﻿" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  dlUrl(url, `${safeFilename(tabName)}_baie.csv`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── XLS (SpreadsheetML) ───────────────────────────────────────────────────────

export function exportBayToXLS(racks: Rack[], tabName: string): void {
  const rows = buildRows(racks);
  const headers = ["Position U","Hauteur U","Fabricant","Référence","Label","IP","Port switch","VLAN","N° série"];
  const keys = ["posU","hU","mfr","ref","label","ip","swPort","vlan","serial"] as const;
  const esc = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const sheetName = esc(tabName.slice(0, 31));
  const hdrCells = headers.map((h) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("");
  const dataRows = rows.map((r) => `<Row>${keys.map((k) => `<Cell><Data ss:Type="String">${esc(r[k] ?? "")}</Data></Cell>`).join("")}</Row>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:o="urn:schemas-microsoft-com:office:office">
  <Styles>
    <Style ss:ID="hdr">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1C2A4A" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="${sheetName}">
    <Table>
      <Row>${hdrCells}</Row>
      ${dataRows}
    </Table>
  </Worksheet>
</Workbook>`;
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  dlUrl(url, `${safeFilename(tabName)}_baie.xls`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

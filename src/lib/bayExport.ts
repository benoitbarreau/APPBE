/**
 * bayExport.ts
 * Export des onglets Baie : PDF, JPEG, CSV, XLS, Impression.
 *
 * Mise en page A3 paysage :
 *  - Gauche (~48 %) : visuel de la baie capturé depuis le DOM
 *  - Droite (~52 %) : tableau des équipements
 *  - Bas droit : cartouche (champ "lot" = nom de l'onglet Baie)
 *  - Bas gauche : mention légale de confidentialité
 */

import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import type { Rack } from "../types";
import type { CartoucheData } from "../export";

// ── Constantes ────────────────────────────────────────────────────────────────

const A3_W_MM = 420;
const A3_H_MM = 297;
const PIX = 2;            // pixel ratio de capture / canvas
const LOGICAL_W = 2480;   // largeur logique (1×) → A3 paysage ≈ 300 dpi / 2
const LOGICAL_H = 1754;   // hauteur logique (1×)

const CONFIDENTIALITY_NOTICE =
  "Mention légale – Confidentialité : Ce document technique est strictement confidentiel. " +
  "Toute reproduction, diffusion, transmission, ou partage, intégral ou partiel, est formellement " +
  "interdit sans autorisation préalable écrite de Vidéo Synergie.";

// ── Utilitaires image ─────────────────────────────────────────────────────────

async function loadImage(src: string): Promise<HTMLImageElement> {
  try {
    const resp = await fetch(src, { mode: "cors", cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(blobUrl); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("img load")); };
      img.src = blobUrl;
    });
  } catch {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Impossible de charger : ${src}`));
      img.src = src;
    });
  }
}

/** Récupère le src du logo depuis le cartouche monté dans le DOM. */
export function getLogoSrc(): string | null {
  return document.querySelector<HTMLImageElement>(".cartouche-logo-img")?.src ?? null;
}

// ── Utilitaires texte canvas ──────────────────────────────────────────────────

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
    else { line = test; }
  }
  if (line) lines.push(line);
  return lines;
}

function clipText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (!text) return "";
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 0 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}

// ── Cartouche ─────────────────────────────────────────────────────────────────

async function drawBayCartouche(
  ctx: CanvasRenderingContext2D,
  data: CartoucheData,
  cx: number, cy: number, cw: number, ch: number,
  sc: number,
  logoSrc: string | null,
): Promise<void> {
  const bw = 1.5 * sc;
  const pad = 8 * sc;

  const cell = (text: string, x: number, y: number, w: number, h: number, font: string, color: string) => {
    ctx.font = font; ctx.fillStyle = color;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(clipText(ctx, text, w - pad * 2), x + w / 2, y + h / 2);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  };
  const hline = (y: number, x1 = cx, x2 = cx + cw) => {
    ctx.strokeStyle = "#000"; ctx.lineWidth = bw;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
  };
  const vline = (x: number, y1: number, y2: number) => {
    ctx.strokeStyle = "#000"; ctx.lineWidth = bw;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
  };

  // Fond blanc + bordure
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(cx, cy, cw, ch);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = bw;
  ctx.strokeRect(cx + bw / 2, cy + bw / 2, cw - bw, ch - bw);

  // Hauteurs des lignes
  const r1H = Math.round(ch * 0.22);
  const r2H = Math.round(ch * 0.19);
  const bH = ch - r1H - r2H;
  const rH = Math.round(bH / 3);
  const r5H = bH - rH * 2;
  const y2 = cy + r1H, y3 = y2 + r2H, y4 = y3 + rH, y5 = y4 + rH;

  // Colonnes
  const c3W = Math.round(cw * 0.25);
  const bW = cw - c3W;
  const c1W = Math.round(bW * 0.51);
  const c2W = bW - c1W;
  const x2c = cx + c1W, x3c = cx + c1W + c2W;

  // Ligne 1 : CLIENT (pleine largeur)
  cell(`CLIENT : ${data.client || "—"}`, cx, cy, cw, r1H, `bold ${13 * sc}px Arial,sans-serif`, "#000"); hline(y2);
  // Ligne 2 : LIEU (corps 75 %)
  cell(`LIEU : ${data.lieu || "—"}`, cx, y2, bW, r2H, `bold ${11 * sc}px Arial,sans-serif`, "#000");
  vline(x3c, y2, cy + ch); hline(y3, cx, x3c);
  vline(x2c, y3, cy + ch);
  // Ligne 3 : campus | BUREAU D'ÉTUDE
  cell(data.campus || "—", cx, y3, c1W, rH, `bold ${11 * sc}px Arial,sans-serif`, "#000");
  cell("BUREAU D'ÉTUDE", x2c, y3, c2W, rH, `bold ${11 * sc}px Arial,sans-serif`, "#000"); hline(y4, cx, x3c);
  // Ligne 4 : tabName (lot — rouge) | authorName
  cell(data.tabName || "—", cx, y4, c1W, rH, `bold ${11 * sc}px Arial,sans-serif`, "#cc0000");
  cell(data.authorName || "—", x2c, y4, c2W, rH, `bold ${11 * sc}px Arial,sans-serif`, "#000"); hline(y5, cx, x3c);
  // Ligne 5 : date | version
  cell(data.date || "", cx, y5, c1W, r5H, `${11 * sc}px Arial,sans-serif`, "#000");
  cell(`Version : ${data.version || "V1.0"}`, x2c, y5, c2W, r5H, `${11 * sc}px Arial,sans-serif`, "#000");

  // Logo (col 3, lignes 2–5)
  if (logoSrc) {
    try {
      const logo = await loadImage(logoSrc);
      const lAH = cy + ch - y2;
      const mLW = c3W - pad * 2, mLH = lAH - pad * 2;
      const ratio = logo.naturalWidth / logo.naturalHeight;
      let iW = mLW, iH = iW / ratio;
      if (iH > mLH) { iH = mLH; iW = iH * ratio; }
      ctx.drawImage(logo, x3c + (c3W - iW) / 2, y2 + (lAH - iH) / 2, iW, iH);
    } catch { /* logo absent */ }
  }
}

// ── Tableau des équipements ───────────────────────────────────────────────────

interface TCol { key: string; label: string; w: number }

const TABLE_COLS: TCol[] = [
  { key: "posU",   label: "Position U",  w: 0.10 },
  { key: "hU",     label: "Hauteur U",   w: 0.09 },
  { key: "mfr",    label: "Fabricant",   w: 0.14 },
  { key: "ref",    label: "Référence",   w: 0.14 },
  { key: "label",  label: "Label",       w: 0.16 },
  { key: "ip",     label: "IP",          w: 0.13 },
  { key: "swPort", label: "Port switch", w: 0.11 },
  { key: "vlan",   label: "VLAN",        w: 0.07 },
  { key: "serial", label: "N° série",    w: 0.06 },
];

type TRow = Record<string, string>;

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

function drawTable(
  ctx: CanvasRenderingContext2D,
  racks: Rack[],
  tx: number, ty: number, tw: number, maxH: number,
  sc: number,
): void {
  const rows = buildRows(racks);
  const HDR_H = 26 * sc;
  const ROW_H = 20 * sc;
  const FONT = 9 * sc;
  const pad = 5 * sc;
  const bw = 1 * sc;

  // Largeurs des colonnes
  const sum = TABLE_COLS.reduce((a, c) => a + c.w, 0);
  const colW = TABLE_COLS.map((c) => Math.round((c.w / sum) * tw));
  colW[colW.length - 1] += tw - colW.reduce((a, b) => a + b, 0); // ajustement

  // Titre
  ctx.font = `bold ${11 * sc}px Arial,sans-serif`;
  ctx.fillStyle = "#000";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("LISTE DES ÉQUIPEMENTS", tx, ty - 10 * sc);

  // En-tête
  ctx.fillStyle = "#1c2a4a";
  ctx.fillRect(tx, ty, tw, HDR_H);
  let cx = tx;
  for (let i = 0; i < TABLE_COLS.length; i++) {
    ctx.font = `bold ${FONT}px Arial,sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(clipText(ctx, TABLE_COLS[i].label, colW[i] - pad), cx + colW[i] / 2, ty + HDR_H / 2);
    cx += colW[i];
  }

  // Lignes de données
  const availRows = Math.max(0, Math.floor((maxH - HDR_H - 16 * sc) / ROW_H));
  const visible = rows.slice(0, availRows);
  for (let r = 0; r < visible.length; r++) {
    const ry = ty + HDR_H + r * ROW_H;
    ctx.fillStyle = r % 2 === 0 ? "#f8fafc" : "#fff";
    ctx.fillRect(tx, ry, tw, ROW_H);
    cx = tx;
    for (let i = 0; i < TABLE_COLS.length; i++) {
      const v = visible[r][TABLE_COLS[i].key] ?? "";
      ctx.font = `${FONT}px Arial,sans-serif`;
      ctx.fillStyle = "#1c1f24";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(clipText(ctx, v, colW[i] - pad * 2), cx + pad, ry + ROW_H / 2);
      cx += colW[i];
    }
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = bw;
    ctx.beginPath(); ctx.moveTo(tx, ry + ROW_H); ctx.lineTo(tx + tw, ry + ROW_H); ctx.stroke();
  }

  const tableH = HDR_H + visible.length * ROW_H;

  // Bordure extérieure
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = bw * 1.5;
  ctx.strokeRect(tx, ty, tw, tableH);

  // Séparateurs verticaux
  cx = tx;
  ctx.strokeStyle = "#c8cdd4";
  ctx.lineWidth = bw;
  for (let i = 0; i < TABLE_COLS.length - 1; i++) {
    cx += colW[i];
    ctx.beginPath(); ctx.moveTo(cx, ty); ctx.lineTo(cx, ty + tableH); ctx.stroke();
  }

  // Débordement
  if (rows.length > availRows) {
    ctx.font = `italic ${8 * sc}px Arial,sans-serif`;
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(
      `… et ${rows.length - availRows} équipement(s) non affiché(s) — voir CSV / XLS pour la liste complète`,
      tx, ty + tableH + 13 * sc,
    );
  }
}

// ── Mention légale ────────────────────────────────────────────────────────────

function drawNotice(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, sc: number,
): void {
  const fs = 7 * sc;
  ctx.font = `italic ${fs}px Arial,sans-serif`;
  ctx.fillStyle = "#9ca3af";
  ctx.textBaseline = "bottom";
  ctx.textAlign = "center";
  const lines = wrapText(ctx, CONFIDENTIALITY_NOTICE, w - 30 * sc);
  const lh = fs * 1.5;
  lines.forEach((line, i) => {
    ctx.fillText(line, x + w / 2, y + h - 6 * sc - (lines.length - 1 - i) * lh);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// ── Composition de la page A3 ─────────────────────────────────────────────────

async function composeBayPage(
  racks: Rack[],
  cartouche: CartoucheData,
  logoSrc: string | null,
): Promise<string> {
  const sc = PIX;
  const W = LOGICAL_W * sc;   // 4960 px
  const H = LOGICAL_H * sc;   // 3508 px

  // 1. Capture du visuel rack
  const rackRowEl = document.querySelector<HTMLElement>(".bay-racks-row");
  if (!rackRowEl) throw new Error("Visuel de la baie introuvable. Assurez-vous d'être sur l'onglet Baie.");

  const rackPng = await toPng(rackRowEl, {
    backgroundColor: "#f5f6f8",
    pixelRatio: PIX,
    cacheBust: true,
    skipFonts: true,
  });

  // 2. Création du canvas
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // ── Mise en page ─────────────────────────────────────────────────────────
  const PAD = 32 * sc;          // 64 px
  const CONTENT_W = W - PAD * 2; // 4832 px

  // Cartouche : bas droit, 28 % de la largeur × 17 % de la hauteur
  const CART_W = Math.round(CONTENT_W * 0.28);  // ~1353 px
  const CART_H = Math.round(H * 0.17);           // ~596 px
  const CART_X = W - PAD - CART_W;               // 3543
  const CART_Y = H - PAD - CART_H;               // 2848

  // Zone rack : gauche, ~48 % de la largeur, ~58 % de la hauteur
  const RACK_W = Math.round(CONTENT_W * 0.48);   // ~2319 px
  const RACK_H = Math.round(H * 0.58);            // ~2035 px
  const RACK_X = PAD;
  const RACK_Y = PAD;

  // Zone tableau : droite du rack, du haut jusqu'au dessus du cartouche
  const TABLE_X = PAD + RACK_W + PAD;                  // 2447 px
  const TABLE_Y = PAD + 20 * sc;                        // 104 px
  const TABLE_W = W - PAD - TABLE_X;                    // ~2449 px
  const TABLE_H = CART_Y - TABLE_Y - 20 * sc;           // ~2704 px

  // 3. Image rack
  const rackImg = await loadImage(rackPng);
  const rW = rackImg.naturalWidth, rH = rackImg.naturalHeight;
  const rScale = Math.min(RACK_W / rW, RACK_H / rH);
  const rDW = rW * rScale, rDH = rH * rScale;
  const rDX = RACK_X + (RACK_W - rDW) / 2;  // centré horizontalement
  ctx.drawImage(rackImg, rDX, RACK_Y, rDW, rDH);

  // 4. Tableau des équipements
  if (TABLE_H > 80 * sc) {
    drawTable(ctx, racks, TABLE_X, TABLE_Y, TABLE_W, TABLE_H, sc);
  }

  // 5. Cartouche (bas droit)
  await drawBayCartouche(ctx, cartouche, CART_X, CART_Y, CART_W, CART_H, sc, logoSrc);

  // 6. Mention légale (bas gauche, jusqu'au cartouche)
  drawNotice(ctx, PAD, CART_Y, CART_X - PAD, CART_H, sc);

  return canvas.toDataURL("image/png");
}

// ── Téléchargement ────────────────────────────────────────────────────────────

function dlUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

function safeFilename(tabName: string): string {
  return tabName.replace(/[^a-z0-9À-ɏ_-]/gi, "_").slice(0, 60);
}

// ── API publique ──────────────────────────────────────────────────────────────

export async function exportBayToPDF(
  racks: Rack[],
  cartouche: CartoucheData,
  logoSrc: string | null,
  tabName: string,
): Promise<void> {
  const dataUrl = await composeBayPage(racks, cartouche, logoSrc);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
  pdf.addImage(dataUrl, "PNG", 0, 0, A3_W_MM, A3_H_MM, undefined, "FAST");
  pdf.save(`${safeFilename(tabName)}_baie.pdf`);
}

export async function exportBayToJPEG(
  racks: Rack[],
  cartouche: CartoucheData,
  logoSrc: string | null,
  tabName: string,
): Promise<void> {
  const pngUrl = await composeBayPage(racks, cartouche, logoSrc);
  // Conversion PNG → JPEG via canvas intermédiaire
  const img = await loadImage(pngUrl);
  const c2 = document.createElement("canvas");
  c2.width = img.naturalWidth;
  c2.height = img.naturalHeight;
  const ctx2 = c2.getContext("2d")!;
  ctx2.fillStyle = "#ffffff";
  ctx2.fillRect(0, 0, c2.width, c2.height);
  ctx2.drawImage(img, 0, 0);
  dlUrl(c2.toDataURL("image/jpeg", 0.92), `${safeFilename(tabName)}_baie.jpg`);
}

export async function printBay(
  racks: Rack[],
  cartouche: CartoucheData,
  logoSrc: string | null,
): Promise<void> {
  const dataUrl = await composeBayPage(racks, cartouche, logoSrc);
  const win = window.open("", "_blank", "width=1200,height=850");
  if (!win)
    throw new Error("La fenêtre d'impression a été bloquée. Autorisez les popups pour ce site.");

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
  const headers = [
    "Position U", "Hauteur U", "Fabricant", "Référence", "Label",
    "IP", "Port switch", "VLAN", "N° série",
  ];
  const keys = ["posU", "hU", "mfr", "ref", "label", "ip", "swPort", "vlan", "serial"] as const;

  const lines = [
    headers.join(";"),
    ...rows.map((r) => keys.map((k) => `"${(r[k] ?? "").replace(/"/g, '""')}"`).join(";")),
  ];
  const csv = "﻿" + lines.join("\r\n"); // BOM UTF-8 pour Excel
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  dlUrl(url, `${safeFilename(tabName)}_baie.csv`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── XLS (SpreadsheetML) ───────────────────────────────────────────────────────

export function exportBayToXLS(racks: Rack[], tabName: string): void {
  const rows = buildRows(racks);
  const headers = [
    "Position U", "Hauteur U", "Fabricant", "Référence", "Label",
    "IP", "Port switch", "VLAN", "N° série",
  ];
  const keys = ["posU", "hU", "mfr", "ref", "label", "ip", "swPort", "vlan", "serial"] as const;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const sheetName = esc(tabName.slice(0, 31));

  const hdrCells = headers.map((h) =>
    `<Cell ss:StyleID="hdr"><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("");
  const dataRowsXml = rows.map((r) =>
    `<Row>${keys.map((k) => `<Cell><Data ss:Type="String">${esc(r[k] ?? "")}</Data></Cell>`).join("")}</Row>`
  ).join("\n");

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
      ${dataRowsXml}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  dlUrl(url, `${safeFilename(tabName)}_baie.xls`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

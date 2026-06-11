import { jsPDF } from "jspdf";
import type { IPNetworkInfo, IPTableRow } from "../types";
import { notify } from "../components/dialogs/dialogStore";

// ─────────────────────────────────────────────────────────────────────
// Types partagés
// ─────────────────────────────────────────────────────────────────────

export interface IPExportColumn {
  /** Clé de IPTableRow (colonnes fixes) ou ID de colonne custom (customFields). */
  key: string;
  label: string;
}

export interface IPExportPayload {
  title: string;
  columns: IPExportColumn[];
  rows: IPTableRow[];
  network: IPNetworkInfo;
}

const NET_LABELS: { key: keyof IPNetworkInfo; label: string }[] = [
  { key: "plageIp", label: "PLAGE IP" },
  { key: "dhcp", label: "DHCP" },
  { key: "dns", label: "DNS" },
  { key: "passerelle", label: "PASSERELLE" },
  { key: "ntp", label: "NTP" },
];

const escapeHtml = (v: string): string =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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

const slugify = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "tableau-ip";

// ─────────────────────────────────────────────────────────────────────
// Export Excel (HTML table reconnue par Excel)
// ─────────────────────────────────────────────────────────────────────

export function exportIPTableXls(payload: IPExportPayload, logoUrl?: string) {
  const { title, columns, rows, network } = payload;
  const slug = slugify(title);

  const networkRow =
    "<tr>" +
    NET_LABELS.map(
      (f) =>
        `<th style="background:#333;color:#fff;border:1px solid #000;padding:4px 8px;">${escapeHtml(f.label)}</th>`,
    ).join("") +
    "</tr><tr>" +
    NET_LABELS.map(
      (f) =>
        `<td style="border:1px solid #000;padding:4px 8px;">${escapeHtml(network[f.key] ?? "")}</td>`,
    ).join("") +
    "</tr>";

  const headerRow =
    "<tr>" +
    columns
      .map(
        (c) =>
          `<th style="background:#333;color:#fff;border:1px solid #000;padding:4px 8px;">${escapeHtml(c.label)}</th>`,
      )
      .join("") +
    "</tr>";

  const bodyRows = rows
    .map(
      (r) =>
        "<tr>" +
        columns
          .map(
            (c) => {
              const val = c.key.startsWith("custom_")
                ? (r.customFields?.[c.key] ?? "")
                : String((r as unknown as Record<string, unknown>)[c.key] ?? "");
              return `<td style="border:1px solid #000;padding:4px 8px;">${escapeHtml(val)}</td>`;
            },
          )
          .join("") +
        "</tr>",
    )
    .join("");

  const titleHtml = `<h1 style="font-family:sans-serif;margin:0 0 12px;">${escapeHtml(title)}</h1>`;
  const logoHtml = logoUrl
    ? `<div style="margin-bottom:12px;"><img src="${logoUrl}" alt="Logo" style="height:40px;" /></div>`
    : "";

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" />
<style>body{font-family:sans-serif;}</style>
</head>
<body>
${logoHtml}
${titleHtml}
<h3 style="margin:8px 0 4px;">Cartouche réseau</h3>
<table>${networkRow}</table>
<h3 style="margin:18px 0 4px;">Équipements</h3>
<table>${headerRow}${bodyRows}</table>
</body></html>`;

  downloadFile(
    `${slug}.xls`,
    html,
    "application/vnd.ms-excel;charset=utf-8",
  );
}

// ─────────────────────────────────────────────────────────────────────
// Export PDF avec jsPDF (paysage A3 ou A4 selon nombre de colonnes)
// ─────────────────────────────────────────────────────────────────────

/**
 * Charge une image et retourne sa data URL base64. Sans crash si l'URL n'est
 * pas accessible — retourne null.
 */
async function imageToDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportIPTablePdf(
  payload: IPExportPayload,
  logoUrl?: string,
) {
  const { title, columns, rows, network } = payload;
  const slug = slugify(title);

  // Choix du format : A4 paysage si peu de colonnes, A3 paysage sinon
  const format: "a3" | "a4" = columns.length <= 6 ? "a4" : "a3";
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format });

  // Dimensions en mm (paysage)
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  let y = margin;

  // Logo
  if (logoUrl) {
    const dataUrl = await imageToDataUrl(logoUrl);
    if (dataUrl) {
      try {
        pdf.addImage(dataUrl, "PNG", margin, y, 30, 12);
      } catch {
        // Si l'image n'est pas un PNG, jsPDF peut crash → on ignore
      }
    }
  }

  // Titre
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(title || "Tableau IP", margin + 35, y + 8);
  y += 18;

  // Cartouche réseau (table 5 colonnes)
  pdf.setFontSize(9);
  const netCols = NET_LABELS.length;
  const netW = pageW - margin * 2;
  const netColW = netW / netCols;
  const netRowH = 7;
  // Header row
  pdf.setFillColor(51, 51, 51);
  pdf.setTextColor(255);
  for (let i = 0; i < netCols; i++) {
    pdf.rect(margin + i * netColW, y, netColW, netRowH, "FD");
    pdf.text(NET_LABELS[i].label, margin + i * netColW + 2, y + 5);
  }
  y += netRowH;
  // Data row
  pdf.setFillColor(255, 255, 255);
  pdf.setTextColor(0, 0, 0);
  for (let i = 0; i < netCols; i++) {
    pdf.rect(margin + i * netColW, y, netColW, netRowH, "FD");
    const v = network[NET_LABELS[i].key] ?? "";
    pdf.text(v, margin + i * netColW + 2, y + 5);
  }
  y += netRowH + 6;

  // Tableau principal
  const cols = columns;
  const tableW = pageW - margin * 2;
  // Largeur proportionnelle, minimum garanti
  const baseWidths = cols.map((c) => widthHintFor(c.key));
  const totalHints = baseWidths.reduce((a, b) => a + b, 0);
  const colWidths = baseWidths.map((w) => (w / totalHints) * tableW);

  const headerH = 8;
  const rowH = 6;

  const drawHeader = () => {
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setFillColor(51, 51, 51);
    pdf.setTextColor(255);
    let x = margin;
    for (let i = 0; i < cols.length; i++) {
      pdf.rect(x, y, colWidths[i], headerH, "FD");
      pdf.text(cols[i].label, x + 2, y + 5.5);
      x += colWidths[i];
    }
    y += headerH;
    pdf.setTextColor(0);
    pdf.setFont("helvetica", "normal");
  };

  drawHeader();

  for (const row of rows) {
    if (y + rowH > pageH - margin) {
      pdf.addPage();
      y = margin;
      drawHeader();
    }
    let x = margin;
    pdf.setFontSize(8);
    for (let i = 0; i < cols.length; i++) {
      pdf.rect(x, y, colWidths[i], rowH, "S");
      const colKey = cols[i].key;
      const raw = colKey.startsWith("custom_")
        ? (row.customFields?.[colKey] ?? "")
        : String((row as unknown as Record<string, unknown>)[colKey] ?? "");
      const text = pdf.splitTextToSize(raw, colWidths[i] - 2)[0] ?? "";
      pdf.text(text, x + 1.5, y + 4);
      x += colWidths[i];
    }
    y += rowH;
  }

  pdf.save(`${slug}.pdf`);
}

/** Largeur indicative en "unités" pour répartir l'espace sur la page. */
function widthHintFor(key: string): number {
  switch (key) {
    case "product":
      return 28;
    case "label":
      return 16;
    case "deviceId":
      return 10;
    case "ip":
    case "ipDante":
    case "ipDanteSec":
      return 18;
    case "login":
      return 14;
    case "password":
      return 14;
    case "serialNumber":
      return 16;
    case "mac":
    case "macDante":
      return 18;
    default:
      return 14;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Impression : ouvre une nouvelle fenêtre avec un rendu HTML imprimable
// ─────────────────────────────────────────────────────────────────────

export function printIPTable(payload: IPExportPayload, logoUrl?: string) {
  const { title, columns, rows, network } = payload;

  const networkHtml =
    "<table class='net'>" +
    "<tr>" +
    NET_LABELS.map((f) => `<th>${escapeHtml(f.label)}</th>`).join("") +
    "</tr><tr>" +
    NET_LABELS.map((f) => `<td>${escapeHtml(network[f.key] ?? "")}</td>`).join("") +
    "</tr></table>";

  const headerHtml =
    "<tr>" +
    columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("") +
    "</tr>";

  const bodyHtml = rows
    .map(
      (r) =>
        "<tr>" +
        columns
          .map((c) => {
            const val = c.key.startsWith("custom_")
              ? (r.customFields?.[c.key] ?? "")
              : String((r as unknown as Record<string, unknown>)[c.key] ?? "");
            return `<td>${escapeHtml(val)}</td>`;
          })
          .join("") +
        "</tr>",
    )
    .join("");

  const wide = columns.length > 6;
  const html = `<!doctype html><html><head><meta charset="utf-8" />
<title>${escapeHtml(title || "Tableau IP")}</title>
<style>
  @page { size: ${wide ? "A3" : "A4"} landscape; margin: 14mm; }
  body { font-family: -apple-system, Segoe UI, sans-serif; font-size: 10pt; color: #1c1f24; margin: 0; }
  header { display: flex; align-items: center; gap: 18px; margin-bottom: 14px; }
  header img { height: 40px; }
  h1 { margin: 0; font-size: 18pt; }
  h2 { font-size: 11pt; margin: 14px 0 4px; color: #555; text-transform: uppercase; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #333; color: #fff; font-weight: 700; }
  table.net th, table.net td { font-size: 9pt; }
  table.data th { font-size: 9pt; }
  table.data td { font-size: 8.5pt; word-break: break-all; }
  .toolbar { padding: 8px 12px; background: #2f6fed; color: #fff; }
  .toolbar button { background: #fff; color: #2f6fed; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: 700; }
  @media print { .toolbar { display: none; } }
</style>
</head><body>
<div class="toolbar"><button onclick="window.print()">🖨 Imprimer</button> &nbsp; Fermez cette fenêtre après impression.</div>
<div style="padding: 14px 18px;">
<header>
  ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" />` : ""}
  <h1>${escapeHtml(title || "Tableau IP")}</h1>
</header>
<h2>Cartouche réseau</h2>
${networkHtml}
<h2>Équipements (${rows.length})</h2>
<table class="data">${headerHtml}${bodyHtml}</table>
</div>
</body></html>`;

  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) {
    notify("Impossible d'ouvrir la fenêtre d'impression. Autorisez les pop-ups pour ce site.", "error");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

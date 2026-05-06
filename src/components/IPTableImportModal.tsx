import { useState } from "react";
import { useAppStore } from "../store";
import { makeEmptyRow } from "../lib/ipTableSync";
import type { IPTableRow } from "../types";

/**
 * Mapping des en-têtes connus (toutes formes) vers la clé interne.
 * On accepte FR / EN / variantes accentuées.
 */
const HEADER_MAP: Record<string, keyof IPTableRow> = {
  produit: "product",
  product: "product",
  modele: "product",
  "modèle": "product",
  reference: "product",
  "référence": "product",
  label: "label",
  etiquette: "label",
  "étiquette": "label",
  id: "deviceId",
  identifiant: "deviceId",
  ip: "ip",
  "adresse ip": "ip",
  "ip dante": "ipDante",
  "ip dante sec": "ipDanteSec",
  "ip dante sécondaire": "ipDanteSec",
  login: "login",
  utilisateur: "login",
  "nom d'utilisateur": "login",
  "mot de passe": "password",
  password: "password",
  motdepasse: "password",
  "n° serie": "serialNumber",
  "n° série": "serialNumber",
  "numero serie": "serialNumber",
  "numéro de série": "serialNumber",
  serial: "serialNumber",
  serialnumber: "serialNumber",
  mac: "mac",
  "adresse mac": "mac",
  "mac dante": "macDante",
};

function normalize(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, (m) => m) // garder accents — on map en deux temps
    .toLowerCase()
    .trim();
}

function normalizeStrict(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function mapHeader(h: string): keyof IPTableRow | null {
  const n1 = normalize(h);
  if (HEADER_MAP[n1]) return HEADER_MAP[n1];
  const n2 = normalizeStrict(h);
  if (HEADER_MAP[n2]) return HEADER_MAP[n2];
  return null;
}

/** Parser CSV simple (réutilise la logique éprouvée). */
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
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
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

export function IPTableImportModal({
  tabId,
  onClose,
}: {
  tabId: string;
  onClose: () => void;
}) {
  const addIPRows = useAppStore((s) => s.addIPRows);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const importText = (text: string, label: string) => {
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setInfo("Fichier vide ou sans en-tête.");
      return;
    }
    const headers = rows[0].map((h) => mapHeader(h));
    const newRows: IPTableRow[] = [];
    let ignored = 0;

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      if (cells.every((c) => c.trim() === "")) continue;
      const r = makeEmptyRow(true);
      let hasContent = false;
      for (let j = 0; j < headers.length; j++) {
        const k = headers[j];
        if (!k || k === "id") continue;
        const v = (cells[j] ?? "").trim();
        if (v) hasContent = true;
        // r[k] doit être un string (IPTableRow contient des strings éditables)
        // sauf id (skipped) et productInstanceIds / manual (non importables)
        if (
          k === "product" ||
          k === "label" ||
          k === "deviceId" ||
          k === "ip" ||
          k === "ipDante" ||
          k === "ipDanteSec" ||
          k === "login" ||
          k === "password" ||
          k === "serialNumber" ||
          k === "mac" ||
          k === "macDante"
        ) {
          r[k] = v;
        }
      }
      if (hasContent) newRows.push(r);
      else ignored++;
    }

    if (newRows.length === 0) {
      setInfo(
        "Aucune ligne valide trouvée. Vérifiez les en-têtes : PRODUIT, LABEL, ID, IP, IP DANTE, IP DANTE SEC, LOGIN, MOT DE PASSE, N° SERIE, MAC, MAC DANTE.",
      );
      return;
    }

    addIPRows(tabId, newRows);
    setInfo(
      `${newRows.length} ligne(s) ajoutée(s) depuis ${label}.${ignored ? ` ${ignored} ligne(s) vide(s) ignorée(s).` : ""}`,
    );
  };

  const importFile = async (file: File) => {
    setBusy(true);
    setInfo(null);
    try {
      const lower = file.name.toLowerCase();
      const text = await file.text();
      if (lower.endsWith(".csv")) {
        importText(text, file.name);
        return;
      }
      if (lower.endsWith(".xls")) {
        // Tenter de parser comme HTML → CSV
        if (text.includes("<table")) {
          const dom = new DOMParser().parseFromString(text, "text/html");
          const tables = Array.from(dom.querySelectorAll("table"));
          const dataTable = tables.reduce<HTMLTableElement | null>(
            (best, t) => {
              const rc = t.querySelectorAll("tr").length;
              const bestRows = best?.querySelectorAll("tr").length ?? 0;
              return rc > bestRows ? (t as HTMLTableElement) : best;
            },
            null,
          );
          if (!dataTable) {
            setInfo("Aucune table trouvée dans le fichier .xls.");
            return;
          }
          const csv = Array.from(dataTable.querySelectorAll("tr"))
            .map((tr) =>
              Array.from(tr.querySelectorAll("th,td"))
                .map(
                  (td) =>
                    `"${(td.textContent ?? "").replace(/"/g, '""')}"`,
                )
                .join(";"),
            )
            .join("\n");
          importText(csv, file.name);
          return;
        }
        setInfo(
          "Fichier .xls non reconnu. Réenregistrez-le en CSV UTF-8 depuis Excel.",
        );
        return;
      }
      if (lower.endsWith(".xlsx")) {
        setInfo(
          "Format XLSX binaire non supporté. Réenregistrez en CSV depuis Excel (Fichier → Enregistrer sous → CSV UTF-8).",
        );
        return;
      }
      setInfo("Format non reconnu. Acceptés : .csv, .xls.");
    } catch (e) {
      setInfo(
        "Lecture impossible : " +
          (e instanceof Error ? e.message : String(e)),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560 }}
      >
        <div className="modal-header">
          <h2>Importer dans le Tableau IP</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="muted" style={{ fontSize: 12 }}>
            Importez une liste de matériel CSV ou XLS. Les colonnes reconnues sont
            associées automatiquement (PRODUIT, LABEL, ID, IP, IP DANTE, IP DANTE
            SEC, LOGIN, MOT DE PASSE, N° SERIE, MAC, MAC DANTE). Les colonnes
            inconnues sont ignorées. Le LABEL peut rester vide et être complété
            ensuite directement dans le tableau.
          </p>

          <div className="form-row">
            <label>Fichier</label>
            <input
              type="file"
              accept=".csv,.xls,text/csv,application/vnd.ms-excel"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {info && <div className="info-banner">{info}</div>}
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

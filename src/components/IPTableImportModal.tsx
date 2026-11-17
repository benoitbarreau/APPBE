import { useMemo, useState } from "react";
import { useAppStore } from "../store";
import {
  checkImportFile,
  decodeImportBytes,
  parseDelimited,
  pickDataTable,
  planIPImport,
  readImportedRows,
  type ImportedRow,
} from "../lib/ipImport";
import { isIPTableTab } from "../types";
import type { IPTableRow } from "../types";

/** Fichier lu, en attente de validation. */
interface PendingImport {
  fileName: string;
  rows: ImportedRow[];
  ignored: number;
}

const HEADERS_HELP =
  "PRODUIT, LABEL, ID, IP, IP DANTE, IP DANTE SEC (ou SECONDAIRE), LOGIN, MOT DE PASSE, N° SERIE, MAC, MAC DANTE";

/** Matrices de cellules des tableaux d'un .xls HTML. */
function htmlTables(text: string): string[][][] {
  const dom = new DOMParser().parseFromString(text, "text/html");
  return Array.from(dom.querySelectorAll("table")).map((t) =>
    Array.from(t.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.querySelectorAll("th,td")).map((td) => td.textContent ?? ""),
    ),
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function IPTableImportModal({
  tabId,
  onClose,
}: {
  tabId: string;
  onClose: () => void;
}) {
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === tabId));
  const ipTableColumns = useAppStore((s) => s.ipTableColumns);
  const applyIPImport = useAppStore((s) => s.applyIPImport);

  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [updateByLabel, setUpdateByLabel] = useState(true);
  const [pending, setPending] = useState<PendingImport | null>(null);

  const existingRows: IPTableRow[] = useMemo(
    () => (tab && isIPTableTab(tab) ? tab.rows ?? [] : []),
    [tab],
  );
  const plan = useMemo(
    () => (pending ? planIPImport(existingRows, pending.rows, updateByLabel) : null),
    [pending, existingRows, updateByLabel],
  );

  const readFile = async (file: File) => {
    setInfo(null);
    setError(null);
    setPending(null);
    const check = checkImportFile(file);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setBusy(true);
    try {
      const { text } = decodeImportBytes(new Uint8Array(await file.arrayBuffer()));
      let matrix: string[][];
      if (check.kind === "xls") {
        if (!text.includes("<table")) {
          setError("Fichier .xls non reconnu (classeur Excel binaire). Réenregistrez-le en CSV depuis Excel.");
          return;
        }
        const tables = htmlTables(text);
        const index = pickDataTable(tables, ipTableColumns);
        if (index < 0) {
          setError(`Aucun tableau avec des colonnes reconnues dans ce fichier. En-têtes attendus : ${HEADERS_HELP}.`);
          return;
        }
        matrix = tables[index];
      } else {
        matrix = parseDelimited(text);
      }
      if (matrix.length < 2) {
        setError("Fichier vide ou sans en-tête.");
        return;
      }
      const { rows, ignored, recognized } = readImportedRows(matrix, ipTableColumns);
      if (recognized === 0 || rows.length === 0) {
        setError(`Aucune ligne valide trouvée. Vérifiez les en-têtes : ${HEADERS_HELP}.`);
        return;
      }
      setPending({ fileName: file.name, rows, ignored });
    } catch (e) {
      setError("Lecture impossible : " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const applyImport = () => {
    if (!pending || !plan) return;
    // Une seule mise à jour du store (et une seule écriture locale) pour tout l'import.
    applyIPImport(tabId, plan.updates, plan.additions);
    setInfo(
      `${plural(plan.updates.length, "ligne mise à jour", "lignes mises à jour")}, ` +
        `${plural(plan.additions.length, "ajoutée", "ajoutées")} depuis ${pending.fileName}.`,
    );
    setPending(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (busy) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) {
      setInfo(null);
      setPending(null);
      setError("Aucun fichier déposé. Glissez un fichier .csv, .tsv, .txt ou .xls.");
      return;
    }
    void readFile(files[0]).then(() => {
      if (files.length > 1) setInfo(`Un seul fichier à la fois : seul « ${files[0].name} » est lu.`);
    });
  };

  const nothingToDo = !plan || (plan.updates.length === 0 && plan.additions.length === 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        // Un fichier lâché hors de la zone ne doit pas être ouvert par le navigateur.
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        style={{ maxWidth: 560 }}
      >
        <div className="modal-header">
          <h2>Importer dans le Tableau IP</h2>
          <button onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="modal-body">
          <p className="muted" style={{ fontSize: 12 }}>
            Importez une liste de matériel CSV, TSV ou XLS (fichier exporté par
            SynoX). Les colonnes reconnues sont associées automatiquement
            ({HEADERS_HELP}), ainsi que les colonnes personnalisées de même
            libellé. Les colonnes inconnues sont ignorées. Les fichiers
            enregistrés par Excel en Windows-1252 sont acceptés.
          </p>

          <div
            className={`ip-import-drop${dragOver ? " is-over" : ""}${busy ? " is-busy" : ""}`}
            role="group"
            aria-label="Zone d'import : glissez un fichier ou choisissez-le"
            onDragEnter={(e) => {
              e.preventDefault();
              if (!busy) setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = busy ? "none" : "copy";
              if (!busy && !dragOver) setDragOver(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
            }}
            onDrop={onDrop}
          >
            <p className="ip-import-drop-text">
              {dragOver ? "Déposez le fichier pour le lire" : "Glissez-déposez un fichier ici, ou"}
            </p>
            <label className="ip-import-drop-button" htmlFor="ip-import-file">
              Choisir un fichier…
            </label>
            <input
              id="ip-import-file"
              className="ip-import-file-input"
              type="file"
              accept=".csv,.tsv,.txt,.xls,text/csv,text/tab-separated-values,application/vnd.ms-excel"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readFile(f);
                e.target.value = "";
              }}
            />
            <p className="ip-import-drop-hint muted">.csv, .tsv, .txt ou .xls</p>
          </div>

          <label className="ip-import-option">
            <input
              type="checkbox"
              checked={updateByLabel}
              onChange={(e) => setUpdateByLabel(e.target.checked)}
            />
            Mettre à jour les lignes existantes de même label
          </label>
          <p className="muted ip-import-option-help">
            Une ligne du fichier dont le LABEL existe déjà dans le tableau (sans
            tenir compte de la casse) y remplit ses colonnes non vides, sans
            créer de doublon. Les autres lignes sont ajoutées comme lignes
            manuelles.
          </p>

          {error && <div className="info-banner ip-import-error" role="alert">{error}</div>}

          {pending && plan && (
            <div className="ip-import-preview" role="status">
              <strong>{pending.fileName}</strong> :{" "}
              {plural(plan.updates.length, "ligne mise à jour", "lignes mises à jour")},{" "}
              {plural(plan.additions.length, "ajoutée", "ajoutées")}
              {plan.unchanged > 0 && `, ${plural(plan.unchanged, "déjà identique", "déjà identiques")}`}
              {pending.ignored > 0 && `, ${plural(pending.ignored, "ligne ignorée", "lignes ignorées")} (aucune colonne reconnue remplie)`}
              .
            </div>
          )}

          {info && <div className="info-banner" role="status">{info}</div>}
        </div>
        <div className="modal-footer">
          {pending && (
            <button className="primary" onClick={applyImport} disabled={nothingToDo}>
              Importer
            </button>
          )}
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

import { useState, type ClipboardEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { pdfFileName } from '../../lib/pdfFileName'
import { notify } from '../../components/dialogs/dialogStore'

// ── Pré-importation de fiches produit (tableau de coquilles à compléter) ─────
// L'utilisateur saisit Marque / Référence / Catégorie pour plusieurs produits
// (saisie manuelle ou collage depuis Excel) et dépose éventuellement un PDF par
// ligne. À la création, chaque ligne devient une fiche « À traiter ».

export interface PreImportRow {
  id: string
  manufacturer: string
  reference: string
  category: string
  datasheetUrls: string[]
  uploading: boolean
}

let rowSeq = 0
function makeRow(manufacturer = '', reference = '', category = ''): PreImportRow {
  rowSeq += 1
  return {
    id: `custom-${Date.now()}-${rowSeq}`,
    manufacturer,
    reference,
    category,
    datasheetUrls: [],
    uploading: false,
  }
}

const isRowEmpty = (r: PreImportRow) =>
  !r.manufacturer.trim() && !r.reference.trim() && !r.category.trim() && r.datasheetUrls.length === 0

export function PreImportDialog({
  brandNames,
  categoryNames,
  onClose,
  onCreate,
}: {
  brandNames: string[]
  categoryNames: string[]
  onClose: () => void
  onCreate: (rows: PreImportRow[]) => void
}) {
  const [rows, setRows] = useState<PreImportRow[]>(() => [makeRow(), makeRow(), makeRow()])

  const patchRow = (id: string, patch: Partial<PreImportRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const addRow = () => setRows((rs) => [...rs, makeRow()])
  const removeRow = (id: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs))

  // ── Collage depuis Excel : colonnes séparées par des tabulations ──────────
  const handlePaste = (e: ClipboardEvent) => {
    const text = e.clipboardData.getData('text')
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return // collage normal dans un champ
    e.preventDefault()
    const pasted = text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+$/, ''))
      .filter((l) => l.trim().length > 0)
      .map((line) => {
        const cols = line.split('\t')
        return makeRow((cols[0] ?? '').trim(), (cols[1] ?? '').trim(), (cols[2] ?? '').trim())
      })
    if (pasted.length === 0) return
    // Remplace les lignes vides en fin de tableau, puis ajoute les nouvelles.
    setRows((rs) => {
      const kept = rs.filter((r) => !isRowEmpty(r))
      return [...kept, ...pasted]
    })
    notify(`${pasted.length} ligne(s) collée(s).`, 'success')
  }

  // ── Upload des PDF d'une ligne ────────────────────────────────────────────
  const uploadPdfs = async (row: PreImportRow, files: File[]) => {
    const pdfs = files.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    )
    if (pdfs.length === 0) return
    patchRow(row.id, { uploading: true })
    const newUrls: string[] = []
    for (const file of pdfs) {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._\-() ]/g, '_')
        const path = `${row.id}/${safeName}`
        const { error } = await supabase.storage
          .from('product-datasheets')
          .upload(path, file, { upsert: true, contentType: 'application/pdf' })
        if (error) throw error
        const { data } = supabase.storage.from('product-datasheets').getPublicUrl(path)
        newUrls.push(data.publicUrl)
      } catch (ex) {
        notify(`Échec de l'upload de ${file.name} : ${ex instanceof Error ? ex.message : 'erreur'}`, 'error')
      }
    }
    setRows((rs) =>
      rs.map((r) =>
        r.id === row.id ? { ...r, uploading: false, datasheetUrls: [...r.datasheetUrls, ...newUrls] } : r,
      ),
    )
  }

  const removePdf = (row: PreImportRow, url: string) => {
    patchRow(row.id, { datasheetUrls: row.datasheetUrls.filter((u) => u !== url) })
    const parts = url.split('/product-datasheets/')
    if (parts.length > 1) {
      const path = decodeURIComponent(parts[1].split('?')[0])
      supabase.storage.from('product-datasheets').remove([path]).catch(() => {})
    }
  }

  // ── Validation : une ligne est complète si Marque + Réf + Catégorie sont remplies ──
  const validRows = rows.filter(
    (r) => r.manufacturer.trim() && r.reference.trim() && r.category.trim(),
  )
  const anyUploading = rows.some((r) => r.uploading)

  const handleCreate = () => {
    if (validRows.length === 0) {
      notify('Renseigne au moins une ligne avec Marque, Référence et Catégorie.', 'error')
      return
    }
    onCreate(validRows)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="preimport-dialog" onClick={(e) => e.stopPropagation()} onPaste={handlePaste}>
        <div className="preimport-header">
          <h3>📥 Pré-importer des fiches</h3>
          <button className="preimport-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <div className="preimport-hint">
          Remplis une ligne par produit, ou <strong>colle directement depuis Excel</strong> (3 colonnes :
          Marque, Référence, Catégorie — Ctrl+V n'importe où dans le tableau). Le PDF est optionnel.
        </div>

        <datalist id="preimport-brands">
          {brandNames.map((b) => <option key={b} value={b} />)}
        </datalist>
        <datalist id="preimport-categories">
          {categoryNames.map((c) => <option key={c} value={c} />)}
        </datalist>

        <div className="preimport-table-wrap">
          <table className="preimport-table">
            <thead>
              <tr>
                <th className="preimport-col-num">#</th>
                <th>Marque *</th>
                <th>Référence *</th>
                <th>Catégorie *</th>
                <th>Fiche technique PDF</th>
                <th className="preimport-col-del"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className={isRowEmpty(row) ? 'preimport-row-empty' : ''}>
                  <td className="preimport-col-num">{i + 1}</td>
                  <td>
                    <input
                      list="preimport-brands"
                      value={row.manufacturer}
                      onChange={(e) => patchRow(row.id, { manufacturer: e.target.value })}
                      placeholder="Extron"
                    />
                  </td>
                  <td>
                    <input
                      value={row.reference}
                      onChange={(e) => patchRow(row.id, { reference: e.target.value })}
                      placeholder="DTP CrossPoint 84"
                    />
                  </td>
                  <td>
                    <input
                      list="preimport-categories"
                      value={row.category}
                      onChange={(e) => patchRow(row.id, { category: e.target.value })}
                      placeholder="Matrice vidéo"
                    />
                  </td>
                  <td>
                    <PdfCell row={row} onFiles={(files) => uploadPdfs(row, files)} onRemove={(u) => removePdf(row, u)} />
                  </td>
                  <td className="preimport-col-del">
                    <button
                      className="preimport-row-del"
                      onClick={() => removeRow(row.id)}
                      title="Supprimer la ligne"
                      disabled={rows.length === 1}
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button className="preimport-add-row" onClick={addRow}>+ Ajouter une ligne</button>

        <div className="preimport-footer">
          <span className="preimport-count">
            {validRows.length} fiche{validRows.length > 1 ? 's' : ''} prête{validRows.length > 1 ? 's' : ''}
          </span>
          <div className="preimport-footer-actions">
            <button className="preimport-cancel" onClick={onClose}>Annuler</button>
            <button
              className="preimport-create"
              onClick={handleCreate}
              disabled={validRows.length === 0 || anyUploading}
            >
              {anyUploading ? '⏳ Upload en cours…' : `Créer ${validRows.length || ''} fiche${validRows.length > 1 ? 's' : ''}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Cellule PDF : mini zone de dépôt par ligne ──────────────────────────────
function PdfCell({
  row,
  onFiles,
  onRemove,
}: {
  row: PreImportRow
  onFiles: (files: File[]) => void
  onRemove: (url: string) => void
}) {
  const [over, setOver] = useState(false)
  return (
    <div className="preimport-pdf-cell">
      {row.datasheetUrls.map((url) => (
        <span key={url} className="preimport-pdf-chip" title={pdfFileName(url)}>
          📄 {pdfFileName(url)}
          <button className="preimport-pdf-remove" onClick={() => onRemove(url)} title="Retirer">✕</button>
        </span>
      ))}
      <label
        className={`preimport-pdf-drop${over ? ' over' : ''}${row.uploading ? ' busy' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(Array.from(e.dataTransfer.files)) }}
      >
        {row.uploading ? '⏳…' : '📎 PDF'}
        <input
          type="file"
          accept=".pdf,application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; onFiles(f) }}
        />
      </label>
    </div>
  )
}

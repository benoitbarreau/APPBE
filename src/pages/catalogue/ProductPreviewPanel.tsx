import type { Product } from '../../types'
import type { UserProductMeta } from '../../lib/userProductsApi'

// ── Utilitaire : nom de fichier depuis une URL de fiche technique ───────────
function pdfFileName(url: string): string {
  try {
    const decoded = decodeURIComponent(url.split('/product-datasheets/')[1] ?? url)
    return decoded.split('?')[0].split('/').pop() ?? url
  } catch { return url }
}

// ── Aperçu rapide d'un produit (panneau latéral droit) ──────────────────────
export function ProductPreviewPanel({
  product, meta, isBuiltin, catColor, onClose, onEdit,
}: {
  product: Product; meta: UserProductMeta | undefined; isBuiltin: boolean
  catColor: string; onClose: () => void; onEdit: () => void
}) {
  const status  = isBuiltin ? 'builtin' : (meta?.status ?? 'unknown')
  const portIn  = product.inputs.length
  const portOut = product.outputs.length
  const portMid = (product.middle ?? []).length

  return (
    <div className="cat-preview-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <aside className="cat-preview-panel" onClick={e => e.stopPropagation()}>
        <div className="cat-preview-header" style={{ background: catColor }}>
          <span className="cat-preview-cat-label">{product.category || 'Sans catégorie'}</span>
          <button className="cat-preview-close" onClick={onClose}>✕</button>
        </div>
        <div className="cat-preview-body">
          {product.imageFront ? (
            <div className="cat-preview-img-wrap">
              <img src={product.imageFront} alt={product.reference} className="cat-preview-img" />
            </div>
          ) : (
            <div className="cat-preview-img-placeholder"><span>Pas d'image disponible</span></div>
          )}
          <div className="cat-preview-title-row">
            <div className="cat-preview-names">
              <div className="cat-preview-ref">{product.reference}</div>
              <div className="cat-preview-brand">{product.manufacturer}</div>
            </div>
            <span className={`cat-card-badge cat-card-badge--${status}`}>
              {isBuiltin ? 'Intégré' : status === 'approved' ? 'Commun' : status === 'pending' ? 'En attente' : '—'}
            </span>
          </div>
          <div className="cat-preview-specs">
            {product.articleCode && (
              <div className="cat-preview-spec"><span className="cat-preview-spec-label">Code article</span><strong className="cat-preview-spec-val">{product.articleCode}</strong></div>
            )}
            {(product.rackHeightU || product.rackSize) && (
              <div className="cat-preview-spec">
                <span className="cat-preview-spec-label">Rack</span>
                <strong className="cat-preview-spec-val">{[product.rackHeightU && `${product.rackHeightU}U`, product.rackSize && `${product.rackSize}"`].filter(Boolean).join(' · ')}</strong>
              </div>
            )}
            {product.widthCm && <div className="cat-preview-spec"><span className="cat-preview-spec-label">Largeur</span><strong className="cat-preview-spec-val">{product.widthCm} cm</strong></div>}
            {product.depthCm && <div className="cat-preview-spec"><span className="cat-preview-spec-label">Profondeur</span><strong className="cat-preview-spec-val">{product.depthCm} cm</strong></div>}
            {product.heightCm && <div className="cat-preview-spec"><span className="cat-preview-spec-label">Hauteur</span><strong className="cat-preview-spec-val">{product.heightCm} cm</strong></div>}
            {product.weightKg && <div className="cat-preview-spec"><span className="cat-preview-spec-label">Poids</span><strong className="cat-preview-spec-val">{product.weightKg} kg</strong></div>}
            {product.powerStandbyW && <div className="cat-preview-spec"><span className="cat-preview-spec-label">Puissance veille</span><strong className="cat-preview-spec-val">{product.powerStandbyW} W</strong></div>}
            {product.powerOperatingW && <div className="cat-preview-spec"><span className="cat-preview-spec-label">Puissance marche</span><strong className="cat-preview-spec-val">{product.powerOperatingW} W</strong></div>}
            {product.thermalBtuH && <div className="cat-preview-spec"><span className="cat-preview-spec-label">Thermique</span><strong className="cat-preview-spec-val">{product.thermalBtuH} BTU/h</strong></div>}
            {(portIn + portOut + portMid) > 0 && (
              <div className="cat-preview-spec">
                <span className="cat-preview-spec-label">Ports</span>
                <strong className="cat-preview-spec-val">
                  {[portIn > 0 && `↙ ${portIn} entrée${portIn > 1 ? 's' : ''}`, portOut > 0 && `↗ ${portOut} sortie${portOut > 1 ? 's' : ''}`, portMid > 0 && `⇄ ${portMid} middle`].filter(Boolean).join('  ·  ')}
                </strong>
              </div>
            )}
          </div>
          {(product.datasheetUrls?.length ?? 0) > 0 && (
            <div className="cat-preview-pdfs">
              <div className="cat-preview-section-label">Fiches techniques</div>
              {product.datasheetUrls!.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="cat-preview-pdf-link">📄 {pdfFileName(url)}</a>
              ))}
            </div>
          )}
          <div className="cat-preview-actions">
            <button className="primary" onClick={onEdit}>✏️ Modifier la fiche</button>
            {product.productUrl && (
              <a href={product.productUrl} target="_blank" rel="noreferrer" className="cat-preview-ext-link">🔗 Page produit</a>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

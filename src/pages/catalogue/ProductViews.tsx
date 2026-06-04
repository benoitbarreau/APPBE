import { useMemo } from 'react'
import type { Product } from '../../types'
import type { UserProductMeta } from '../../lib/userProductsApi'
import { BUILTIN_IDS } from './constants'
import type { ListSortKey } from './types'

// ── Carte produit (grille) ─────────────────────────────────────────────────
export function ProductCard({
  product, meta, isBuiltin, categoryColor, isSelected, onSelect, onClick,
}: {
  product: Product; meta: UserProductMeta | undefined; isBuiltin: boolean
  categoryColor: string; isSelected: boolean; onSelect: () => void; onClick: () => void
}) {
  const status  = isBuiltin ? 'builtin' : (meta?.status ?? 'unknown')
  const portIn  = product.inputs.length
  const portOut = product.outputs.length
  const portMid = (product.middle ?? []).length
  const hasFront = !!product.imageFront

  return (
    <button className={`cat-card${isSelected ? ' cat-card--selected' : ''}`} onClick={onClick}>
      <div className={`cat-card-checkbox${isSelected ? ' cat-card-checkbox--checked' : ''}`}
        onClick={e => { e.stopPropagation(); onSelect() }} role="checkbox" aria-checked={isSelected}>
        {isSelected && '✓'}
      </div>
      <div className="cat-card-top-band" style={{ background: categoryColor }} aria-hidden="true" />
      <div className={`cat-card-body${hasFront ? ' cat-card-body--has-thumb' : ''}`}>
        <div className="cat-card-category-label">{product.category || 'Sans catégorie'}</div>
        <div className="cat-card-head-row">
          <span className="cat-card-ref">{product.reference}</span>
          <span className={`cat-card-badge cat-card-badge--${status}`}>
            {isBuiltin ? 'Intégré' : status === 'approved' ? 'Commun' : status === 'pending' ? 'En attente' : '—'}
          </span>
        </div>
        <div className="cat-card-brand">{product.manufacturer}</div>
        <div className="cat-card-meta">
          {(product.rackHeightU || product.rackSize) && (
            <span className="cat-card-chip">
              {product.rackHeightU ? `${product.rackHeightU}U` : ''}{product.rackSize ? ` · ${product.rackSize}"` : ''}
            </span>
          )}
          {(portIn + portOut + portMid) > 0 && (
            <span className="cat-card-chip">
              {portIn > 0 && `↙${portIn}`}{portIn > 0 && portOut > 0 && ' '}{portOut > 0 && `↗${portOut}`}{portMid > 0 && ` ⇄${portMid}`}
            </span>
          )}
          {(product.datasheetUrls?.length ?? 0) > 0 && (
            <a className="cat-card-pdf-link" href={product.datasheetUrls![0]} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}>
              📄{product.datasheetUrls!.length > 1 && <span style={{ fontSize: 9, marginLeft: 1 }}>{product.datasheetUrls!.length}</span>}
            </a>
          )}
        </div>
        {hasFront && (
          <div className="cat-card-thumb" aria-hidden="true">
            <img src={product.imageFront} alt="" className="cat-card-thumb-img" />
          </div>
        )}
      </div>
    </button>
  )
}

// ── Ligne produit (liste) ──────────────────────────────────────────────────
export function ProductListRow({
  product, meta, isBuiltin, categoryColor, isSelected, onSelect, onClick,
}: {
  product: Product; meta: UserProductMeta | undefined; isBuiltin: boolean
  categoryColor: string; isSelected: boolean; onSelect: () => void; onClick: () => void
}) {
  const status  = isBuiltin ? 'builtin' : (meta?.status ?? 'unknown')
  const portIn  = product.inputs.length
  const portOut = product.outputs.length
  const rackStr = [product.rackHeightU ? `${product.rackHeightU}U` : '', product.rackSize ? `${product.rackSize}"` : ''].filter(Boolean).join(' ') || '—'

  return (
    <button className={`cat-list-row${isSelected ? ' cat-list-row--selected' : ''}`} onClick={onClick}>
      <div className={`cat-list-checkbox cat-list-col-cb${isSelected ? ' cat-list-checkbox--checked' : ''}`}
        onClick={e => { e.stopPropagation(); onSelect() }} role="checkbox" aria-checked={isSelected}>
        {isSelected && '✓'}
      </div>
      <div className="cat-list-color-dot cat-list-col-dot" style={{ background: categoryColor }} />
      {product.imageFront
        ? <img src={product.imageFront} className="cat-list-thumb cat-list-col-img" alt="" />
        : <div className="cat-list-thumb-placeholder cat-list-col-img" />
      }
      <span className="cat-list-ref cat-list-col-ref">{product.reference}</span>
      <span className="cat-list-brand cat-list-col-brand">{product.manufacturer}</span>
      <span className="cat-list-cat cat-list-col-cat">{product.category || <em className="cat-card-na">—</em>}</span>
      <span className="cat-list-rack cat-list-col-rack">{rackStr}</span>
      <span className="cat-list-ports cat-list-col-ports">{portIn + portOut > 0 ? `↙${portIn} ↗${portOut}` : '—'}</span>
      <span className={`cat-card-badge cat-card-badge--${status} cat-list-col-status`}>
        {isBuiltin ? 'Intégré' : status === 'approved' ? 'Commun' : status === 'pending' ? 'En attente' : '—'}
      </span>
    </button>
  )
}

// ── Grille produits (réutilisable) ─────────────────────────────────────────
export function ProductGrid({
  products, productMeta, catColorMap, selectedIds, onToggleSelect, onPreview,
}: {
  products: Product[]; productMeta: Record<string, UserProductMeta>
  catColorMap: Record<string, string>; selectedIds: Set<string>
  onToggleSelect: (id: string) => void; onPreview: (id: string) => void
}) {
  return (
    <div className="catalogue-grid">
      {products.map(p => (
        <ProductCard key={p.id} product={p} meta={productMeta[p.id]}
          isBuiltin={BUILTIN_IDS.has(p.id)} categoryColor={catColorMap[p.category] ?? '#9ca3af'}
          isSelected={selectedIds.has(p.id)} onSelect={() => onToggleSelect(p.id)} onClick={() => onPreview(p.id)} />
      ))}
    </div>
  )
}

// ── Vue liste produits (réutilisable) ──────────────────────────────────────
export function ProductListView({
  products, productMeta, catColorMap, selectedIds, onToggleSelect, onPreview,
  listSortKey, listSortDir, onSort,
}: {
  products: Product[]; productMeta: Record<string, UserProductMeta>
  catColorMap: Record<string, string>; selectedIds: Set<string>
  onToggleSelect: (id: string) => void; onPreview: (id: string) => void
  listSortKey: ListSortKey; listSortDir: 'asc' | 'desc'
  onSort: (k: ListSortKey) => void
}) {
  const arrow = (k: ListSortKey) => listSortKey === k ? (listSortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
  const sorted = useMemo(() => {
    const list = [...products]
    list.sort((a, b) => {
      let cmp = 0
      switch (listSortKey) {
        case 'reference':    cmp = a.reference.localeCompare(b.reference, 'fr'); break
        case 'manufacturer': cmp = (a.manufacturer || '').localeCompare(b.manufacturer || '', 'fr'); break
        case 'category':     cmp = (a.category || '').localeCompare(b.category || '', 'fr'); break
        case 'rack':         cmp = (a.rackHeightU ?? 0) - (b.rackHeightU ?? 0); break
      }
      return listSortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [products, listSortKey, listSortDir])

  return (
    <div className="catalogue-list">
      <div className="cat-list-header">
        <span className="cat-list-col-cb" />
        <span className="cat-list-col-dot" />
        <span className="cat-list-col-img" />
        <button className={`cat-list-sort-btn cat-list-col-ref${listSortKey === 'reference' ? ' active' : ''}`} onClick={() => onSort('reference')}>Référence<span className="cat-list-sort-arrow">{arrow('reference')}</span></button>
        <button className={`cat-list-sort-btn cat-list-col-brand${listSortKey === 'manufacturer' ? ' active' : ''}`} onClick={() => onSort('manufacturer')}>Marque<span className="cat-list-sort-arrow">{arrow('manufacturer')}</span></button>
        <button className={`cat-list-sort-btn cat-list-col-cat${listSortKey === 'category' ? ' active' : ''}`} onClick={() => onSort('category')}>Catégorie<span className="cat-list-sort-arrow">{arrow('category')}</span></button>
        <button className={`cat-list-sort-btn cat-list-col-rack${listSortKey === 'rack' ? ' active' : ''}`} onClick={() => onSort('rack')}>Rack<span className="cat-list-sort-arrow">{arrow('rack')}</span></button>
        <span className="cat-list-col-ports">Ports</span>
        <span className="cat-list-col-status">Statut</span>
      </div>
      {sorted.map(p => (
        <ProductListRow key={p.id} product={p} meta={productMeta[p.id]}
          isBuiltin={BUILTIN_IDS.has(p.id)} categoryColor={catColorMap[p.category] ?? '#9ca3af'}
          isSelected={selectedIds.has(p.id)} onSelect={() => onToggleSelect(p.id)} onClick={() => onPreview(p.id)} />
      ))}
    </div>
  )
}

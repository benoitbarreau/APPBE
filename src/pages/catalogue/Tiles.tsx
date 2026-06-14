// ── Tuiles d'accueil : Marque et Catégorie ──────────────────────────────────
import type { ReactNode } from 'react'

// ── Tuile marque ───────────────────────────────────────────────────────────
export function BrandTile({
  brandName, count, logo, brandId, isAdmin, onOpen, onEditLogo,
}: {
  brandName: string; count: number; logo?: string; brandId?: string
  isAdmin: boolean; onOpen: () => void; onEditLogo: () => void
}) {
  return (
    <div className="brand-tile">
      {isAdmin && brandId && (
        <button
          className="brand-tile-edit-btn"
          onClick={e => { e.stopPropagation(); onEditLogo() }}
          title={`Modifier le logo de ${brandName}`}
        >✏️</button>
      )}
      <button className="brand-tile-inner" onClick={onOpen}>
        <div className="brand-tile-logo-area">
          {logo
            ? <img src={logo} alt={brandName} className="brand-tile-logo-img" />
            : <div className="brand-tile-logo-placeholder">{(brandName[0] ?? '?').toUpperCase()}</div>
          }
        </div>
        <div className="brand-tile-name">{brandName}</div>
        <div className="brand-tile-count">{count} produit{count > 1 ? 's' : ''}</div>
      </button>
    </div>
  )
}

// ── Ligne catégorie (accordéon « en ligne ») ────────────────────────────────
export function CategoryRow({
  catName, count, color, logo, catId, isAdmin, isOpen, onToggle, onEditLogo, children,
}: {
  catName: string; count: number; color: string; logo?: string; catId?: string
  isAdmin: boolean; isOpen: boolean; onToggle: () => void; onEditLogo: () => void
  children?: ReactNode
}) {
  return (
    <div className={`category-row${isOpen ? ' open' : ''}`} style={{ borderLeftColor: color }}>
      <button className="category-row-inner" onClick={onToggle} aria-expanded={isOpen}>
        <span className="category-row-arrow" aria-hidden>{isOpen ? '▾' : '▸'}</span>
        <span className="category-row-logo-area" style={!logo ? { background: color + '22' } : undefined}>
          {logo
            ? <img src={logo} alt={catName} className="category-row-logo-img" />
            : <span className="category-row-logo-placeholder" style={{ background: color, color: '#fff' }}>
                {(catName[0] ?? '?').toUpperCase()}
              </span>
          }
        </span>
        <span className="category-row-name">{catName}</span>
        <span className="category-row-count">{count} produit{count > 1 ? 's' : ''}</span>
        {isAdmin && catId && (
          <span
            role="button"
            tabIndex={0}
            className="category-row-edit-btn"
            onClick={e => { e.stopPropagation(); onEditLogo() }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onEditLogo() } }}
            title={`Modifier le logo de ${catName}`}
          >✏️</span>
        )}
      </button>
      {isOpen && <div className="category-row-content">{children}</div>}
    </div>
  )
}


import { useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useAppStore, useCatalogMeta } from '../store'
import { ProductEditor } from '../components/ProductEditor'
import { AdminSettings } from '../components/AdminSettings'
import type { Panel } from '../components/AdminSettings'
import type { Product } from '../types'
import type { UserProductMeta } from '../lib/userProductsApi'
import { upsertUserProduct } from '../lib/userProductsApi'
import { BUILTIN_CATALOG } from '../catalog'
import { exportToCsv, importFromCsv } from '../lib/catalogueApi'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

// ── Constantes ─────────────────────────────────────────────────────────────

const BUILTIN_IDS = new Set(BUILTIN_CATALOG.map(p => p.id))

type FilterMode = 'all' | 'builtin' | 'approved' | 'mine' | 'pending'
type SortKey   = 'manufacturer' | 'reference' | 'category'
type ViewMode  = 'grid' | 'list' | 'byBrand' | 'byCategory'

const PILL_DEFS: { mode: FilterMode; label: string; alert?: boolean }[] = [
  { mode: 'all',      label: 'Tous' },
  { mode: 'builtin',  label: 'Intégrés' },
  { mode: 'approved', label: 'Commun' },
  { mode: 'mine',     label: 'Mes fiches' },
  { mode: 'pending',  label: 'En attente', alert: true },
]

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onGoHome: () => void
  onOpenProjects?: () => void
  onOpenReferentiel?: () => void
  onOpenAdminDashboard?: () => void
}

// ── Carte produit (vue grille) ─────────────────────────────────────────────

function ProductCard({
  product,
  meta,
  isBuiltin,
  categoryColor,
  onClick,
}: {
  product: Product
  meta: UserProductMeta | undefined
  isBuiltin: boolean
  categoryColor: string
  onClick: () => void
}) {
  const status  = isBuiltin ? 'builtin' : (meta?.status ?? 'unknown')
  const portIn  = product.inputs.length
  const portOut = product.outputs.length
  const portMid = (product.middle ?? []).length
  const hasFront = !!product.imageFront

  return (
    <button
      className="cat-card"
      onClick={onClick}
      title={`Ouvrir la fiche : ${product.manufacturer} ${product.reference}`}
    >
      {/* Bandeau coloré catégorie */}
      <div className="cat-card-top-band" style={{ background: categoryColor }}>
        <span className="cat-card-cat-label">
          {product.category || 'Sans catégorie'}
        </span>
      </div>

      {/* Corps */}
      <div className={`cat-card-body${hasFront ? ' cat-card-body--has-thumb' : ''}`}>
        <div className="cat-card-head-row">
          <span className="cat-card-ref">{product.reference}</span>
          <span className={`cat-card-badge cat-card-badge--${status}`}>
            {isBuiltin ? 'Intégré'
              : status === 'approved' ? 'Commun'
              : status === 'pending'  ? 'En attente'
              : '—'}
          </span>
        </div>

        <div className="cat-card-brand">{product.manufacturer}</div>

        <div className="cat-card-meta">
          {(product.rackHeightU || product.rackSize) && (
            <span className="cat-card-chip">
              {product.rackHeightU ? `${product.rackHeightU}U` : ''}
              {product.rackSize ? ` · ${product.rackSize}"` : ''}
            </span>
          )}
          {(portIn + portOut + portMid) > 0 && (
            <span className="cat-card-chip">
              {portIn  > 0 && `↙${portIn}`}
              {portIn  > 0 && portOut > 0 && ' '}
              {portOut > 0 && `↗${portOut}`}
              {portMid > 0 && ` ⇄${portMid}`}
            </span>
          )}
          {(product.datasheetUrls?.length ?? 0) > 0 && (
            <a
              className="cat-card-pdf-link"
              href={product.datasheetUrls![0]}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              title={product.datasheetUrls!.length > 1
                ? `${product.datasheetUrls!.length} fiches techniques PDF`
                : 'Voir la fiche technique PDF'}
            >
              📄{product.datasheetUrls!.length > 1 && (
                <span style={{ fontSize: 9, marginLeft: 1 }}>{product.datasheetUrls!.length}</span>
              )}
            </a>
          )}
        </div>

        {/* Miniature image de face */}
        {hasFront && (
          <div className="cat-card-thumb" aria-hidden="true">
            <img src={product.imageFront} alt="" className="cat-card-thumb-img" />
          </div>
        )}
      </div>
    </button>
  )
}

// ── Ligne produit (vue liste) ──────────────────────────────────────────────

function ProductListRow({
  product,
  meta,
  isBuiltin,
  categoryColor,
  onClick,
}: {
  product: Product
  meta: UserProductMeta | undefined
  isBuiltin: boolean
  categoryColor: string
  onClick: () => void
}) {
  const status  = isBuiltin ? 'builtin' : (meta?.status ?? 'unknown')
  const portIn  = product.inputs.length
  const portOut = product.outputs.length

  const rackStr = [
    product.rackHeightU ? `${product.rackHeightU}U` : '',
    product.rackSize    ? `${product.rackSize}"` : '',
  ].filter(Boolean).join(' ') || '—'

  return (
    <button className="cat-list-row" onClick={onClick}>
      <div className="cat-list-color-dot" style={{ background: categoryColor }} />
      {product.imageFront
        ? <img src={product.imageFront} className="cat-list-thumb" alt="" />
        : <div className="cat-list-thumb-placeholder" />
      }
      <span className="cat-list-ref">{product.reference}</span>
      <span className="cat-list-brand">{product.manufacturer}</span>
      <span className="cat-list-cat">{product.category || <em className="cat-card-na">—</em>}</span>
      <span className="cat-list-rack">{rackStr}</span>
      <span className="cat-list-ports">
        {portIn + portOut > 0 ? `↙${portIn} ↗${portOut}` : '—'}
      </span>
      <span className={`cat-card-badge cat-card-badge--${status} cat-list-status`}>
        {isBuiltin ? 'Intégré'
          : status === 'approved' ? 'Commun'
          : status === 'pending'  ? 'En attente'
          : '—'}
      </span>
    </button>
  )
}

// ── Composant grille (réutilisé pour grouped views) ────────────────────────

function ProductGrid({
  products,
  productMeta,
  catColorMap,
  onEdit,
}: {
  products: Product[]
  productMeta: Record<string, UserProductMeta>
  catColorMap: Record<string, string>
  onEdit: (id: string) => void
}) {
  return (
    <div className="catalogue-grid">
      {products.map(p => (
        <ProductCard
          key={p.id}
          product={p}
          meta={productMeta[p.id]}
          isBuiltin={BUILTIN_IDS.has(p.id)}
          categoryColor={catColorMap[p.category] ?? '#9ca3af'}
          onClick={() => onEdit(p.id)}
        />
      ))}
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────

export function CataloguePage({ onGoHome, onOpenProjects, onOpenReferentiel, onOpenAdminDashboard }: Props) {
  const { profile, signOut } = useAuth()
  const products       = useAppStore(s => s.products)
  const productMeta    = useAppStore(s => s.productMeta)
  const addProduct     = useAppStore(s => s.addProduct)
  const setProductMeta = useAppStore(s => s.setProductMeta)
  const catalogCategories = useCatalogMeta(s => s.catalogCategories)
  const isAdmin = profile?.role === 'admin'

  // ── UI state ──
  const [search,          setSearch]          = useState('')
  const [filterMode,      setFilterMode]      = useState<FilterMode>('all')
  const [filterCategory,  setFilterCategory]  = useState('')
  const [filterBrand,     setFilterBrand]     = useState('')
  const [sortKey,         setSortKey]         = useState<SortKey>('manufacturer')
  const [viewMode,        setViewMode]        = useState<ViewMode>('grid')
  const [editingProductId, setEditingProductId] = useState<string | 'new' | null>(null)
  const [accountOpen,     setAccountOpen]     = useState(false)
  const [accountInitialPanel, setAccountInitialPanel] = useState<Panel>('info')
  const [importError,     setImportError]     = useState<string | null>(null)
  const [importSuccess,   setImportSuccess]   = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  // ── Couleurs des catégories ──
  const catColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    catalogCategories.forEach(c => { m[c.name] = c.color })
    return m
  }, [catalogCategories])

  // ── Listes pour les selects ──
  const allCategories = useMemo(() =>
    [...new Set(products.map(p => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [products],
  )
  const allBrands = useMemo(() =>
    [...new Set(products.map(p => p.manufacturer).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [products],
  )

  // ── Statistiques ──
  const stats = useMemo(() => ({
    all:      products.length,
    builtin:  products.filter(p => BUILTIN_IDS.has(p.id)).length,
    approved: products.filter(p => productMeta[p.id]?.status === 'approved').length,
    mine:     products.filter(p => productMeta[p.id]?.creatorId === profile?.id).length,
    pending:  products.filter(p => productMeta[p.id]?.status === 'pending').length,
  }), [products, productMeta, profile?.id])

  // ── Filtrage + tri ──
  const filtered = useMemo(() => {
    let list = [...products]
    if (filterMode === 'builtin')  list = list.filter(p => BUILTIN_IDS.has(p.id))
    else if (filterMode === 'approved') list = list.filter(p => productMeta[p.id]?.status === 'approved')
    else if (filterMode === 'mine')     list = list.filter(p => productMeta[p.id]?.creatorId === profile?.id)
    else if (filterMode === 'pending')  list = list.filter(p => productMeta[p.id]?.status === 'pending')
    if (filterCategory) list = list.filter(p => p.category === filterCategory)
    if (filterBrand)    list = list.filter(p => p.manufacturer === filterBrand)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.reference.toLowerCase().includes(q)    ||
        p.manufacturer.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)     ||
        (p.articleCode ?? '').toLowerCase().includes(q),
      )
    }
    list.sort((a, b) => {
      if (sortKey === 'reference') return a.reference.localeCompare(b.reference, 'fr')
      if (sortKey === 'category')  return a.category.localeCompare(b.category, 'fr') || a.manufacturer.localeCompare(b.manufacturer, 'fr')
      return a.manufacturer.localeCompare(b.manufacturer, 'fr') || a.reference.localeCompare(b.reference, 'fr')
    })
    return list
  }, [products, productMeta, filterMode, filterCategory, filterBrand, search, sortKey, profile?.id])

  // ── Groupements ──
  const groupedByBrand = useMemo(() => {
    const groups = new Map<string, Product[]>()
    filtered.forEach(p => {
      const k = p.manufacturer || '(Sans marque)'
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(p)
    })
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [filtered])

  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, Product[]>()
    filtered.forEach(p => {
      const k = p.category || '(Sans catégorie)'
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(p)
    })
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [filtered])

  // ── Import CSV ──
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError(null)
    setImportSuccess(null)
    try {
      const text = await file.text()
      const { products: imported, errors } = importFromCsv(text)
      if (imported.length === 0) {
        setImportError(errors.join(' | ') || 'Aucun produit importé')
        return
      }
      const initialStatus = isAdmin ? 'approved' : 'pending'
      for (const p of imported) {
        addProduct(p)
        if (profile?.id) {
          setProductMeta(p.id, {
            productId: p.id,
            status: initialStatus,
            creatorId: profile.id,
            creatorName: profile.full_name?.trim() || profile.email,
          })
        }
        upsertUserProduct(p, { initialStatus }).catch(() => {})
      }
      setImportSuccess(
        `${imported.length} produit${imported.length > 1 ? 's' : ''} importé${imported.length > 1 ? 's' : ''} avec succès.`
        + (errors.length > 0 ? ` (${errors.length} ligne${errors.length > 1 ? 's' : ''} ignorée${errors.length > 1 ? 's' : ''})` : ''),
      )
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erreur de lecture du fichier')
    }
  }

  const handleExport = () =>
    exportToCsv(filtered, productMeta, `catalogue-synox-${new Date().toISOString().slice(0, 10)}.csv`)

  const hasActiveFilter = filterMode !== 'all' || filterCategory || filterBrand || search
  const clearFilters = () => { setFilterMode('all'); setFilterCategory(''); setFilterBrand(''); setSearch('') }

  return (
    <div className="catalogue-page">

      {/* ── Header unifié (même navbar que Projets / Référentiel) ── */}
      <header className="projects-page-header">
        <div className="projects-page-brand">
          <img src={logoUrl} alt="SynoX" className="projects-page-logo" />
        </div>

        <nav className="ref-main-nav">
          {onGoHome && (
            <button className="ref-nav-btn" onClick={onGoHome}>← Accueil</button>
          )}
          {onOpenProjects && (
            <button className="ref-nav-btn" onClick={onOpenProjects}>Projets en cours</button>
          )}
          {onOpenReferentiel && (
            <button className="ref-nav-btn" onClick={onOpenReferentiel}>Référentiel</button>
          )}
          <button className="ref-nav-btn ref-nav-btn-active">Catalogue</button>
        </nav>

        <div className="projects-page-user">
          <button onClick={() => void signOut()} className="btn-signout" title="Se déconnecter">
            Se déconnecter
          </button>
          {isAdmin && onOpenAdminDashboard && (
            <button onClick={onOpenAdminDashboard} title="Tableau de bord administrateur">
              Tableau de bord
            </button>
          )}
          <button
            className="btn-account"
            onClick={() => { setAccountInitialPanel('info'); setAccountOpen(true) }}
            title="Gérer mon compte"
          >
            <span className="btn-account-avatar">
              {(profile?.full_name ?? profile?.email ?? '?')[0].toUpperCase()}
            </span>
            <span className="btn-account-name">{profile?.full_name ?? profile?.email ?? ''}</span>
          </button>
        </div>
      </header>

      {/* ── Toolbar compacte (stats + filtres fusionnés) ── */}
      <div className="catalogue-toolbar">

        {/* Ligne 1 : recherche + pills de statut */}
        <div className="catalogue-toolbar-top">
          <input
            className="catalogue-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍  Référence, marque, catégorie, code article…"
          />
          <div className="catalogue-pills">
            {PILL_DEFS.map(({ mode, label, alert }) => {
              const count = stats[mode]
              if (mode === 'pending' && count === 0) return null
              return (
                <button
                  key={mode}
                  className={`cat-pill${filterMode === mode ? ' active' : ''}${alert ? ' alert' : ''}`}
                  onClick={() => setFilterMode(f => f === mode ? 'all' : mode)}
                  title={`Filtrer : ${label}`}
                >
                  {label}
                  <span className="cat-pill-count">{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Ligne 2 : selects + vue + actions */}
        <div className="catalogue-toolbar-bottom">
          <select
            className="catalogue-filter-select"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="">Toutes les catégories</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            className="catalogue-filter-select"
            value={filterBrand}
            onChange={e => setFilterBrand(e.target.value)}
          >
            <option value="">Toutes les marques</option>
            {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select
            className="catalogue-filter-select"
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
          >
            <option value="manufacturer">Trier : Marque</option>
            <option value="reference">Trier : Référence</option>
            <option value="category">Trier : Catégorie</option>
          </select>

          <div className="catalogue-toolbar-sep" />

          {/* Toggle vue */}
          <div className="catalogue-view-toggle" role="group" aria-label="Mode de vue">
            <button
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
              title="Vue grille"
            >⊞</button>
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
              title="Vue liste"
            >☰</button>
            <button
              className={viewMode === 'byBrand' ? 'active' : ''}
              onClick={() => setViewMode('byBrand')}
              title="Par marque"
            >🏷</button>
            <button
              className={viewMode === 'byCategory' ? 'active' : ''}
              onClick={() => setViewMode('byCategory')}
              title="Par catégorie"
            >📂</button>
          </div>

          <div className="catalogue-toolbar-sep" />

          <button className="catalogue-action-btn" onClick={handleExport} title="Exporter la vue en CSV">
            ↓ CSV
          </button>
          <button
            className="catalogue-action-btn"
            onClick={() => importRef.current?.click()}
            title="Importer depuis un fichier CSV"
          >
            ↑ Import
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />

          {hasActiveFilter && (
            <button className="catalogue-reset-filters" onClick={clearFilters}>
              × Effacer les filtres
            </button>
          )}
        </div>
      </div>

      {/* Messages import */}
      {importSuccess && (
        <div className="catalogue-import-msg catalogue-import-msg--ok">
          ✓ {importSuccess}
          <button onClick={() => setImportSuccess(null)}>✕</button>
        </div>
      )}
      {importError && (
        <div className="catalogue-import-msg catalogue-import-msg--err">
          ⚠ {importError}
          <button onClick={() => setImportError(null)}>✕</button>
        </div>
      )}

      {/* ── Contenu principal ── */}
      <div className="catalogue-content">
        <div className="catalogue-results-count">
          <strong>{filtered.length}</strong> produit{filtered.length > 1 ? 's' : ''}
          {hasActiveFilter && (
            <span className="catalogue-results-filter-hint">filtrés sur {products.length}</span>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="catalogue-empty">
            <p>Aucun produit trouvé.</p>
            <button className="primary" onClick={() => setEditingProductId('new')}>
              + Créer une fiche produit
            </button>
            {hasActiveFilter && (
              <button onClick={clearFilters}>Effacer les filtres</button>
            )}
          </div>

        ) : viewMode === 'list' ? (
          /* ── Vue liste ── */
          <div className="catalogue-list">
            <div className="cat-list-header">
              <span className="cat-list-col-dot" />
              <span className="cat-list-col-img" />
              <span className="cat-list-col-ref">Référence</span>
              <span className="cat-list-col-brand">Marque</span>
              <span className="cat-list-col-cat">Catégorie</span>
              <span className="cat-list-col-rack">Rack</span>
              <span className="cat-list-col-ports">Ports</span>
              <span className="cat-list-col-status">Statut</span>
            </div>
            {filtered.map(p => (
              <ProductListRow
                key={p.id}
                product={p}
                meta={productMeta[p.id]}
                isBuiltin={BUILTIN_IDS.has(p.id)}
                categoryColor={catColorMap[p.category] ?? '#9ca3af'}
                onClick={() => setEditingProductId(p.id)}
              />
            ))}
          </div>

        ) : viewMode === 'byBrand' ? (
          /* ── Vue par marque ── */
          <>
            {groupedByBrand.map(([brand, prods]) => (
              <div key={brand} className="catalogue-group">
                <div className="catalogue-group-header">
                  <span className="catalogue-group-icon">🏷</span>
                  <span className="catalogue-group-title">{brand}</span>
                  <span className="catalogue-group-count">{prods.length}</span>
                </div>
                <ProductGrid
                  products={prods}
                  productMeta={productMeta}
                  catColorMap={catColorMap}
                  onEdit={id => setEditingProductId(id)}
                />
              </div>
            ))}
          </>

        ) : viewMode === 'byCategory' ? (
          /* ── Vue par catégorie ── */
          <>
            {groupedByCategory.map(([cat, prods]) => (
              <div key={cat} className="catalogue-group">
                <div
                  className="catalogue-group-header"
                  style={{ borderLeftColor: catColorMap[cat] ?? '#9ca3af' }}
                >
                  <span className="catalogue-group-icon">📂</span>
                  <span className="catalogue-group-title">{cat}</span>
                  <span className="catalogue-group-count">{prods.length}</span>
                </div>
                <ProductGrid
                  products={prods}
                  productMeta={productMeta}
                  catColorMap={catColorMap}
                  onEdit={id => setEditingProductId(id)}
                />
              </div>
            ))}
          </>

        ) : (
          /* ── Vue grille (défaut) ── */
          <ProductGrid
            products={filtered}
            productMeta={productMeta}
            catColorMap={catColorMap}
            onEdit={id => setEditingProductId(id)}
          />
        )}
      </div>

      {/* ── FAB : nouveau produit ── */}
      <button
        className="catalogue-fab"
        onClick={() => setEditingProductId('new')}
        title="Créer une nouvelle fiche produit"
      >
        + Nouveau produit
      </button>

      {/* ── Éditeur de fiche ── */}
      {editingProductId !== null && (
        <ProductEditor
          productId={editingProductId}
          onClose={() => setEditingProductId(null)}
          onSwitchTo={id => setEditingProductId(id)}
        />
      )}

      {/* ── Mon compte ── */}
      {accountOpen && (
        <AdminSettings
          initialPanel={accountInitialPanel}
          onClose={() => setAccountOpen(false)}
        />
      )}
    </div>
  )
}

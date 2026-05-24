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
type SortKey = 'manufacturer' | 'reference' | 'category'

const FILTER_LABELS: Record<FilterMode, string> = {
  all:      'Tous',
  builtin:  'Intégrés',
  approved: 'Catalogue commun',
  mine:     'Mes fiches',
  pending:  'En attente',
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onGoHome: () => void
  onOpenAdminDashboard?: () => void
}

// ── Carte produit ──────────────────────────────────────────────────────────

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
  const status = isBuiltin ? 'builtin' : (meta?.status ?? 'unknown')
  const portIn  = product.inputs.length
  const portOut = product.outputs.length
  const portMid = (product.middle ?? []).length

  return (
    <button className="cat-card" onClick={onClick} title={`Ouvrir la fiche : ${product.manufacturer} ${product.reference}`}>
      <div className="cat-card-stripe" style={{ background: categoryColor }} />
      <div className="cat-card-body">
        <div className="cat-card-top">
          <span className="cat-card-ref">{product.reference}</span>
          <span className={`cat-card-badge cat-card-badge--${status}`}>
            {isBuiltin ? 'Intégré' : status === 'approved' ? 'Commun' : status === 'pending' ? 'En attente' : '—'}
          </span>
        </div>
        <div className="cat-card-brand">{product.manufacturer}</div>
        <div className="cat-card-category">{product.category || <span className="cat-card-na">Sans catégorie</span>}</div>

        <div className="cat-card-meta">
          {(product.rackHeightU || product.rackSize) && (
            <span className="cat-card-chip">
              {product.rackHeightU ? `${product.rackHeightU}U` : ''}
              {product.rackSize ? ` · ${product.rackSize}"` : ''}
            </span>
          )}
          {(portIn + portOut + portMid) > 0 && (
            <span className="cat-card-chip">
              {portIn > 0 && `↙${portIn}`}
              {portIn > 0 && portOut > 0 && ' '}
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
      </div>
    </button>
  )
}

// ── Page principale ────────────────────────────────────────────────────────

export function CataloguePage({ onGoHome, onOpenAdminDashboard }: Props) {
  const { profile, signOut } = useAuth()
  const products    = useAppStore(s => s.products)
  const productMeta = useAppStore(s => s.productMeta)
  const addProduct  = useAppStore(s => s.addProduct)
  const setProductMeta = useAppStore(s => s.setProductMeta)
  const catalogCategories = useCatalogMeta(s => s.catalogCategories)
  const isAdmin = profile?.role === 'admin'

  // ── UI state ──
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('manufacturer')
  const [editingProductId, setEditingProductId] = useState<string | 'new' | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountInitialPanel, setAccountInitialPanel] = useState<Panel>('info')
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  // ── Couleurs des catégories ──
  const catColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    catalogCategories.forEach(c => { m[c.name] = c.color })
    return m
  }, [catalogCategories])

  // ── Dérivations ──
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
    total:    products.length,
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
        p.reference.toLowerCase().includes(q)     ||
        p.manufacturer.toLowerCase().includes(q)  ||
        p.category.toLowerCase().includes(q)      ||
        (p.articleCode ?? '').toLowerCase().includes(q),
      )
    }

    list.sort((a, b) => {
      if (sortKey === 'reference')   return a.reference.localeCompare(b.reference, 'fr')
      if (sortKey === 'category')    return a.category.localeCompare(b.category, 'fr') || a.manufacturer.localeCompare(b.manufacturer, 'fr')
      return a.manufacturer.localeCompare(b.manufacturer, 'fr') || a.reference.localeCompare(b.reference, 'fr')
    })

    return list
  }, [products, productMeta, filterMode, filterCategory, filterBrand, search, sortKey, profile?.id])

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
        upsertUserProduct(p, { initialStatus }).catch(() => { /* silencieux */ })
      }
      setImportSuccess(`${imported.length} produit${imported.length > 1 ? 's' : ''} importé${imported.length > 1 ? 's' : ''} avec succès.${errors.length > 0 ? ` (${errors.length} ligne${errors.length > 1 ? 's' : ''} ignorée${errors.length > 1 ? 's' : ''})` : ''}`)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erreur de lecture du fichier')
    }
  }

  // ── Export CSV ──
  const handleExport = () => {
    exportToCsv(filtered, productMeta, `catalogue-synox-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div className="catalogue-page">

      {/* ── Header ── */}
      <header className="catalogue-header">
        <div className="catalogue-header-left">
          <button className="catalogue-back-btn" onClick={onGoHome} title="Retour à l'accueil">
            ← Accueil
          </button>
          <img src={logoUrl} alt="SynoX" className="catalogue-header-logo" />
          <h1 className="catalogue-header-title">Catalogue produits</h1>
        </div>
        <div className="catalogue-header-center">
          <input
            className="catalogue-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍  Référence, marque, catégorie, code article…"
          />
        </div>
        <div className="catalogue-header-right">
          {isAdmin && onOpenAdminDashboard && (
            <button className="home-header-action-btn" onClick={onOpenAdminDashboard} title="Tableau de bord administrateur">
              ⚙️ Tableau de bord
            </button>
          )}
          <button
            className="home-header-user-chip"
            onClick={() => { setAccountInitialPanel('info'); setAccountOpen(true) }}
          >
            <span className="home-header-avatar">
              {(profile?.full_name ?? profile?.email ?? '?')[0].toUpperCase()}
            </span>
            <span className="home-header-username">{profile?.full_name ?? profile?.email ?? ''}</span>
          </button>
          <button className="home-header-action-btn home-header-signout" onClick={() => void signOut()}>
            Déconnexion
          </button>
        </div>
      </header>

      {/* ── Barre de stats ── */}
      <div className="catalogue-stats-bar">
        {([
          ['all',      stats.total,    'Produits au total'],
          ['builtin',  stats.builtin,  'Intégrés'],
          ['approved', stats.approved, 'Catalogue commun'],
          ['mine',     stats.mine,     'Mes fiches'],
          ...(stats.pending > 0 ? [['pending', stats.pending, 'En attente'] as const] : []),
        ] as [FilterMode, number, string][]).map(([mode, count, label]) => (
          <button
            key={mode}
            className={`catalogue-stat-card${filterMode === mode ? ' catalogue-stat-card--active' : ''}${mode === 'pending' ? ' catalogue-stat-card--alert' : ''}`}
            onClick={() => setFilterMode(f => f === mode ? 'all' : mode)}
            title={`Filtrer : ${label}`}
          >
            <span className="catalogue-stat-value">{count}</span>
            <span className="catalogue-stat-label">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Barre de filtres ── */}
      <div className="catalogue-filter-bar">
        <div className="catalogue-filter-left">
          {(Object.keys(FILTER_LABELS) as FilterMode[]).map(m => (
            <button
              key={m}
              className={`catalogue-filter-btn${filterMode === m ? ' active' : ''}`}
              onClick={() => setFilterMode(m)}
            >
              {FILTER_LABELS[m]}
              {m === 'pending' && stats.pending > 0 && (
                <span className="catalogue-filter-badge">{stats.pending}</span>
              )}
            </button>
          ))}
        </div>
        <div className="catalogue-filter-right">
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
          <button className="catalogue-action-btn" onClick={handleExport} title="Exporter la vue courante en CSV">
            ↓ CSV
          </button>
          <button
            className="catalogue-action-btn"
            onClick={() => importRef.current?.click()}
            title="Importer des produits depuis un fichier CSV"
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

      {/* ── Résultats + grille ── */}
      <div className="catalogue-content">
        <div className="catalogue-results-count">
          {filtered.length} produit{filtered.length > 1 ? 's' : ''}
          {(filterMode !== 'all' || filterCategory || filterBrand || search) && (
            <button
              className="catalogue-reset-filters"
              onClick={() => { setFilterMode('all'); setFilterCategory(''); setFilterBrand(''); setSearch('') }}
            >
              × Effacer les filtres
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="catalogue-empty">
            <p>Aucun produit trouvé.</p>
            <button className="primary" onClick={() => setEditingProductId('new')}>
              + Créer une fiche produit
            </button>
          </div>
        ) : (
          <div className="catalogue-grid">
            {filtered.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                meta={productMeta[p.id]}
                isBuiltin={BUILTIN_IDS.has(p.id)}
                categoryColor={catColorMap[p.category] ?? '#9ca3af'}
                onClick={() => setEditingProductId(p.id)}
              />
            ))}
          </div>
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

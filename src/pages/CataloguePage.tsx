import { useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useAppStore, useCatalogMeta } from '../store'
import { ProductEditor } from '../components/ProductEditor'
import { AdminSettings } from '../components/AdminSettings'
import type { Panel } from '../components/AdminSettings'
import type { Product } from '../types'
import { upsertUserProduct, validateUserProduct } from '../lib/userProductsApi'
import { exportToCsv, importFromCsv } from '../lib/catalogueApi'
import { updateBrandLogo, updateCategoryLogo } from '../lib/catalogMetaApi'
import type { FilterMode, ViewMode, DetailView, ListSortKey } from './catalogue/types'
import { BUILTIN_IDS, PILL_DEFS } from './catalogue/constants'
import { ActionsMenu } from './catalogue/ActionsMenu'
import { BrandLogoEditor } from './catalogue/BrandLogoEditor'
import { BrandTile, CategoryRow } from './catalogue/Tiles'
import { ProductQuickPreview } from './catalogue/ProductQuickPreview'
import { ProductGrid, ProductListView } from './catalogue/ProductViews'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onGoHome: () => void
  onOpenProjects?: () => void
  onOpenReferentiel?: () => void
  onOpenAdminDashboard?: () => void
}

// ── Page principale ────────────────────────────────────────────────────────

export function CataloguePage({ onGoHome, onOpenProjects, onOpenReferentiel, onOpenAdminDashboard }: Props) {
  const { profile, signOut } = useAuth()
  const products          = useAppStore(s => s.products)
  const productMeta       = useAppStore(s => s.productMeta)
  const addProduct        = useAppStore(s => s.addProduct)
  const setProductMeta    = useAppStore(s => s.setProductMeta)
  const catalogCategories = useCatalogMeta(s => s.catalogCategories)
  const catalogBrands     = useCatalogMeta(s => s.catalogBrands)
  const setCatalogMeta    = useCatalogMeta(s => s.setCatalogMeta)
  const isAdmin = profile?.role === 'admin'

  // ── Navigation principale ──
  const [viewMode,   setViewMode]   = useState<ViewMode>('byBrand')
  const [brandView,  setBrandView]  = useState<string | null>(null)
  const [catView,    setCatView]    = useState<string | null>(null)
  const [detailView, setDetailView] = useState<DetailView>('grid')

  // ── Marques : logo editor ──
  const [editingLogoForBrand,    setEditingLogoForBrand]    = useState<string | null>(null)
  // ── Catégories : logo editor ──
  const [editingLogoForCategory, setEditingLogoForCategory] = useState<string | null>(null)

  // ── Catégories : repliables ──
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())

  // ── Aperçu rapide ──
  const [previewId, setPreviewId] = useState<string | null>(null)

  // ── Filtres (visibles uniquement dans les sous-vues) ──
  const [search,         setSearch]         = useState('')
  const [filterMode,     setFilterMode]     = useState<FilterMode>('all')
  const [showAdvFilters, setShowAdvFilters] = useState(false)
  const [advRackUs,      setAdvRackUs]      = useState<string[]>([])
  const [advWithImage,   setAdvWithImage]   = useState(false)
  const [advWithPdf,     setAdvWithPdf]     = useState(false)

  // ── Sélection multiple ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── Tri colonne liste ──
  const [listSortKey, setListSortKey] = useState<ListSortKey>('manufacturer')
  const [listSortDir, setListSortDir] = useState<'asc' | 'desc'>('asc')

  // ── Import / compte ──
  const [editingProductId,    setEditingProductId]    = useState<string | 'new' | null>(null)
  const [accountOpen,         setAccountOpen]         = useState(false)
  const [accountInitialPanel, setAccountInitialPanel] = useState<Panel>('info')
  const [importError,         setImportError]         = useState<string | null>(null)
  const [importSuccess,       setImportSuccess]       = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  // ── On est dans une sous-vue quand brandView ou catView est défini ──
  const inSubView = !!(brandView || catView)

  // ── Helpers navigation ──
  const openBrand = (brand: string) => {
    setBrandView(brand); setCatView(null)
    setOpenCategories(new Set()); setSearch(''); setFilterMode('all')
    setAdvRackUs([]); setAdvWithImage(false); setAdvWithPdf(false)
  }
  const openCategory = (cat: string) => {
    setCatView(cat); setBrandView(null)
    setSearch(''); setFilterMode('all')
    setAdvRackUs([]); setAdvWithImage(false); setAdvWithPdf(false)
  }
  const switchTab = (mode: ViewMode) => {
    setViewMode(mode); setBrandView(null); setCatView(null)
    setSearch(''); setFilterMode('all')
    setAdvRackUs([]); setAdvWithImage(false); setAdvWithPdf(false)
    setSelectedIds(new Set())
  }

  // ── Maps catégories / marques ──
  const catColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    catalogCategories.forEach(c => { m[c.name] = c.color })
    return m
  }, [catalogCategories])

  const brandLogoMap = useMemo(() => {
    const m: Record<string, string> = {}
    catalogBrands.forEach(b => { if (b.logo) m[b.name] = b.logo })
    return m
  }, [catalogBrands])

  const brandIdMap = useMemo(() => {
    const m: Record<string, string> = {}
    catalogBrands.forEach(b => { m[b.name] = b.id })
    return m
  }, [catalogBrands])

  const categoryLogoMap = useMemo(() => {
    const m: Record<string, string> = {}
    catalogCategories.forEach(c => { if (c.logo) m[c.name] = c.logo })
    return m
  }, [catalogCategories])

  const categoryIdMap = useMemo(() => {
    const m: Record<string, string> = {}
    catalogCategories.forEach(c => { m[c.name] = c.id })
    return m
  }, [catalogCategories])

  // ── Statistiques ──
  const stats = useMemo(() => ({
    all:      products.length,
    builtin:  products.filter(p => BUILTIN_IDS.has(p.id)).length,
    approved: products.filter(p => productMeta[p.id]?.status === 'approved').length,
    mine:     products.filter(p => productMeta[p.id]?.creatorId === profile?.id).length,
    pending:  products.filter(p => productMeta[p.id]?.status === 'pending').length,
  }), [products, productMeta, profile?.id])

  // ── Filtrage (appliqué dans les sous-vues) ──
  const filtered = useMemo(() => {
    let list = [...products]
    if (filterMode === 'builtin')       list = list.filter(p => BUILTIN_IDS.has(p.id))
    else if (filterMode === 'approved') list = list.filter(p => productMeta[p.id]?.status === 'approved')
    else if (filterMode === 'mine')     list = list.filter(p => productMeta[p.id]?.creatorId === profile?.id)
    else if (filterMode === 'pending')  list = list.filter(p => productMeta[p.id]?.status === 'pending')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.reference.toLowerCase().includes(q) || p.manufacturer.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)  || (p.articleCode ?? '').toLowerCase().includes(q),
      )
    }
    if (advRackUs.length > 0)
      list = list.filter(p => { const u = p.rackHeightU ?? 0; return advRackUs.some(r => r === '4+' ? u >= 4 : u === parseInt(r, 10)) })
    if (advWithImage) list = list.filter(p => !!p.imageFront)
    if (advWithPdf)   list = list.filter(p => (p.datasheetUrls?.length ?? 0) > 0)
    return list
  }, [products, productMeta, filterMode, search, profile?.id, advRackUs, advWithImage, advWithPdf])

  // ── Groupements (toujours calculés sur tous les produits, pas filtrés — pour les tuiles) ──
  const groupedByBrand = useMemo(() => {
    const groups = new Map<string, Product[]>()
    products.forEach(p => {
      const k = p.manufacturer || '(Sans marque)'
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(p)
    })
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [products])

  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, Product[]>()
    products.forEach(p => {
      const k = p.category || '(Sans catégorie)'
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(p)
    })
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [products])

  // ── Produits de la sous-vue active ──
  const brandDetailGroups = useMemo(() => {
    if (!brandView) return []
    const groups = new Map<string, Product[]>()
    filtered.filter(p => p.manufacturer === brandView).forEach(p => {
      const k = p.category || '(Sans catégorie)'
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(p)
    })
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [filtered, brandView])

  const catDetailProducts = useMemo(() =>
    catView ? filtered.filter(p => p.category === catView) : [],
    [filtered, catView],
  )

  // ── Aperçu rapide ──
  const previewProduct = previewId ? (products.find(p => p.id === previewId) ?? null) : null

  // ── Sélection ──
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next
  })

  const handleBulkApprove = async () => {
    const ids = [...selectedIds].filter(id => !BUILTIN_IDS.has(id) && productMeta[id])
    for (const id of ids) {
      setProductMeta(id, { ...productMeta[id], status: 'approved' })
    }
    setSelectedIds(new Set())
    // Synchronisation cloud — on attend le résultat pour détecter les échecs
    const results = await Promise.allSettled(ids.map(id => validateUserProduct(id)))
    const failedRefs = results
      .map((r, i) => (r.status === 'rejected' ? (products.find(p => p.id === ids[i])?.reference ?? ids[i]) : null))
      .filter((ref): ref is string => ref !== null)
    if (failedRefs.length > 0) {
      setImportError(`⚠ ${failedRefs.length} approbation${failedRefs.length > 1 ? 's' : ''} non enregistrée${failedRefs.length > 1 ? 's' : ''} dans le cloud`
        + ` (${failedRefs.slice(0, 5).join(', ')}${failedRefs.length > 5 ? '…' : ''}). Réessayez.`)
    }
  }

  const handleBulkExport = () =>
    exportToCsv(products.filter(p => selectedIds.has(p.id)), productMeta, `selection-${new Date().toISOString().slice(0, 10)}.csv`)

  // ── Logo marque ──
  const handleSaveBrandLogo = (logo: string | null) => {
    if (!editingLogoForBrand) return
    const brandName = editingLogoForBrand
    const brandId = brandIdMap[brandName]
    if (!brandId) return
    setCatalogMeta(catalogBrands.map(b => b.id === brandId ? { ...b, logo: logo ?? undefined } : b), catalogCategories)
    updateBrandLogo(brandId, logo).catch(e => {
      console.error('Échec sauvegarde logo marque :', e)
      setImportError(`⚠ Le logo de « ${brandName} » n'a pas pu être sauvegardé dans le cloud. Réessayez.`)
    })
    setEditingLogoForBrand(null)
  }

  // ── Logo catégorie ──
  const handleSaveCategoryLogo = (logo: string | null) => {
    if (!editingLogoForCategory) return
    const catName = editingLogoForCategory
    const catId = categoryIdMap[catName]
    if (!catId) return
    setCatalogMeta(catalogBrands, catalogCategories.map(c => c.id === catId ? { ...c, logo: logo ?? undefined } : c))
    updateCategoryLogo(catId, logo).catch(e => {
      console.error('Échec sauvegarde logo catégorie :', e)
      setImportError(`⚠ Le logo de « ${catName} » n'a pas pu être sauvegardé dans le cloud. Réessayez.`)
    })
    setEditingLogoForCategory(null)
  }

  // ── Tri colonne ──
  const toggleListSort = (key: ListSortKey) => {
    if (key === listSortKey) setListSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setListSortKey(key); setListSortDir('asc') }
  }

  // ── Import / Export ──
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setImportError(null); setImportSuccess(null)
    try {
      const { products: imported, errors } = importFromCsv(await file.text())
      if (imported.length === 0) { setImportError(errors.join(' | ') || 'Aucun produit importé'); return }
      const initialStatus = isAdmin ? 'approved' : 'pending'
      for (const p of imported) {
        addProduct(p)
        if (profile?.id) setProductMeta(p.id, { productId: p.id, status: initialStatus, creatorId: profile.id, creatorName: profile.full_name?.trim() || profile.email })
      }
      // Synchronisation cloud — on attend chaque sauvegarde pour détecter les échecs
      // (sinon les produits semblent importés mais disparaissent à la prochaine connexion)
      const results = await Promise.allSettled(imported.map(p => upsertUserProduct(p, { initialStatus })))
      const failedRefs = results
        .map((r, i) => (r.status === 'rejected' ? imported[i].reference : null))
        .filter((ref): ref is string => ref !== null)
      const okCount = imported.length - failedRefs.length
      if (failedRefs.length > 0) {
        setImportError(`⚠ ${failedRefs.length} produit${failedRefs.length > 1 ? 's' : ''} non sauvegardé${failedRefs.length > 1 ? 's' : ''} dans le cloud`
          + ` (${failedRefs.slice(0, 5).join(', ')}${failedRefs.length > 5 ? '…' : ''}).`
          + ' Vérifiez votre connexion puis réimportez le fichier.')
      }
      if (okCount > 0) {
        setImportSuccess(`${okCount} produit${okCount > 1 ? 's' : ''} importé${okCount > 1 ? 's' : ''} avec succès.`
          + (errors.length > 0 ? ` (${errors.length} ligne${errors.length > 1 ? 's' : ''} ignorée${errors.length > 1 ? 's' : ''})` : ''))
      }
    } catch (err) { setImportError(err instanceof Error ? err.message : 'Erreur de lecture du fichier') }
  }

  const handleExport = () => {
    const base = inSubView
      ? (brandView ? filtered.filter(p => p.manufacturer === brandView) : catDetailProducts)
      : products
    exportToCsv(base, productMeta, `catalogue-synox-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  // ── Filtres avancés ──
  const hasAdvFilter = advRackUs.length > 0 || advWithImage || advWithPdf
  const advFilterCount = advRackUs.length + (advWithImage ? 1 : 0) + (advWithPdf ? 1 : 0)
  const hasActiveFilter = filterMode !== 'all' || search || hasAdvFilter
  const clearFilters = () => {
    setFilterMode('all'); setSearch('')
    setAdvRackUs([]); setAdvWithImage(false); setAdvWithPdf(false)
  }

  // ── Catégorie repliable ──
  const toggleCategory = (cat: string) => setOpenCategories(prev => {
    const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next
  })

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="catalogue-page">

      {/* ── Header ── */}
      <header className="projects-page-header">
        <div className="projects-page-brand">
          <img src={logoUrl} alt="SynoX" className="projects-page-logo" />
        </div>
        <nav className="ref-main-nav">
          {onGoHome        && <button className="ref-nav-btn" onClick={onGoHome}>← Accueil</button>}
          {onOpenProjects  && <button className="ref-nav-btn" onClick={onOpenProjects}>Projets en cours</button>}
          {onOpenReferentiel && <button className="ref-nav-btn" onClick={onOpenReferentiel}>Référentiel</button>}
          <button className="ref-nav-btn ref-nav-btn-active">Catalogue</button>
        </nav>
        <div className="projects-page-user">
          <button onClick={() => void signOut()} className="btn-signout">Se déconnecter</button>
          {isAdmin && onOpenAdminDashboard && (
            <button onClick={onOpenAdminDashboard}>Tableau de bord</button>
          )}
          <button className="btn-account" onClick={() => { setAccountInitialPanel('info'); setAccountOpen(true) }}>
            <span className="btn-account-avatar">{(profile?.full_name ?? profile?.email ?? '?')[0].toUpperCase()}</span>
            <span className="btn-account-name">{profile?.full_name ?? profile?.email ?? ''}</span>
          </button>
        </div>
      </header>

      {/* ── Toolbar ── */}
      <div className="catalogue-toolbar">

        {/* Ligne 1 : onglets principaux + menu ••• */}
        <div className="catalogue-toolbar-tabs">
          <div className="catalogue-main-tabs">
            <button
              className={`catalogue-main-tab${viewMode === 'byBrand' ? ' active' : ''}`}
              onClick={() => switchTab('byBrand')}
            >
              🏷 Marques
            </button>
            <button
              className={`catalogue-main-tab${viewMode === 'byCategory' ? ' active' : ''}`}
              onClick={() => switchTab('byCategory')}
            >
              📂 Catégories
            </button>
          </div>

          {/* Bouton + Nouveau (toujours visible) */}
          <button className="catalogue-new-btn" onClick={() => setEditingProductId('new')}>
            + Nouveau
          </button>

          <ActionsMenu onExport={handleExport} onImportClick={() => importRef.current?.click()} />
          <input ref={importRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleImportFile} />
        </div>

        {/* Ligne 2 : navigation + filtres — uniquement dans les sous-vues */}
        {inSubView && (
          <div className="catalogue-subnav-row">
            {/* Breadcrumb */}
            <div className="catalogue-subnav-breadcrumb">
              <button
                className="catalogue-brand-back"
                onClick={() => { setBrandView(null); setCatView(null) }}
              >
                ← {viewMode === 'byBrand' ? 'Marques' : 'Catégories'}
              </button>
              <span className="catalogue-brand-nav-sep">›</span>
              {brandView && (
                brandLogoMap[brandView]
                  ? <img src={brandLogoMap[brandView]} alt={brandView} className="brand-nav-logo-lg" />
                  : <div className="brand-nav-initial">{(brandView[0] ?? '?').toUpperCase()}</div>
              )}
              {catView && (
                <div className="catalogue-subnav-cat-dot" style={{ background: catColorMap[catView] ?? '#9ca3af' }} />
              )}
              <span className="catalogue-brand-nav-name">{brandView ?? catView}</span>
              <span className="catalogue-brand-nav-count">
                ({(brandView ? brandDetailGroups.reduce((s, [, p]) => s + p.length, 0) : catDetailProducts.length)} produits)
              </span>
            </div>

            {/* Toggle grille / liste */}
            <div className="catalogue-detail-view-toggle">
              <button className={detailView === 'grid' ? 'active' : ''} onClick={() => setDetailView('grid')} title="Grille">⊞</button>
              <button className={detailView === 'list' ? 'active' : ''} onClick={() => setDetailView('list')} title="Liste">☰</button>
            </div>
          </div>
        )}

        {/* Ligne 3 : recherche + pills — uniquement dans les sous-vues */}
        {inSubView && (
          <div className="catalogue-subfilters">
            <input
              className="catalogue-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍  Référence, code article…"
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
                  >
                    {label}<span className="cat-pill-count">{count}</span>
                  </button>
                )
              })}
            </div>

            {/* Filtres avancés */}
            <button
              className={`catalogue-adv-filter-btn${hasAdvFilter ? ' active' : ''}`}
              onClick={() => setShowAdvFilters(v => !v)}
            >
              ⚙{advFilterCount > 0 ? ` (${advFilterCount})` : ''}
              <span style={{ fontSize: 10, marginLeft: 3 }}>{showAdvFilters ? '▲' : '▼'}</span>
            </button>

            {hasActiveFilter && (
              <button className="catalogue-reset-filters" onClick={clearFilters}>× Effacer</button>
            )}
          </div>
        )}

        {/* Filtres avancés (collapsible) */}
        {inSubView && showAdvFilters && (
          <div className="catalogue-adv-filters">
            <div className="catalogue-adv-filter-group">
              <span className="catalogue-adv-filter-label">Hauteur rack :</span>
              {['1', '2', '3', '4+'].map(r => (
                <label key={r} className="catalogue-adv-filter-check">
                  <input type="checkbox" checked={advRackUs.includes(r)}
                    onChange={() => setAdvRackUs(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])} />
                  {r}{r !== '4+' ? 'U' : ''}
                </label>
              ))}
            </div>
            <div className="catalogue-adv-filter-sep" />
            <div className="catalogue-adv-filter-group">
              <label className="catalogue-adv-filter-check">
                <input type="checkbox" checked={advWithImage} onChange={e => setAdvWithImage(e.target.checked)} />Avec image
              </label>
              <label className="catalogue-adv-filter-check">
                <input type="checkbox" checked={advWithPdf} onChange={e => setAdvWithPdf(e.target.checked)} />Avec PDF
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Messages import */}
      {importSuccess && (
        <div className="catalogue-import-msg catalogue-import-msg--ok">✓ {importSuccess}<button onClick={() => setImportSuccess(null)}>✕</button></div>
      )}
      {importError && (
        <div className="catalogue-import-msg catalogue-import-msg--err">⚠ {importError}<button onClick={() => setImportError(null)}>✕</button></div>
      )}

      {/* ── Contenu ── */}
      <div className={`catalogue-content${viewMode === 'byBrand' && !!brandView ? ' catalogue-content--brand-detail' : ''}`}>

        {/* ── Vue Marques : tuiles ── */}
        {viewMode === 'byBrand' && !brandView && (
          <div className="brand-tiles-grid">
            {groupedByBrand.map(([brand, prods]) => (
              <BrandTile key={brand} brandName={brand} count={prods.length}
                logo={brandLogoMap[brand]} brandId={brandIdMap[brand]}
                isAdmin={isAdmin} onOpen={() => openBrand(brand)}
                onEditLogo={() => setEditingLogoForBrand(brand)} />
            ))}
          </div>
        )}

        {/* ── Détail marque : sidebar + catégories repliables ── */}
        {viewMode === 'byBrand' && brandView && (
          <div className="brand-detail-layout">

            {/* Bandeau gauche — toutes les marques */}
            <nav className="brand-sidebar" aria-label="Navigation marques">
              {groupedByBrand.map(([brand]) => (
                <button
                  key={brand}
                  className={`brand-sidebar-item${brand === brandView ? ' active' : ''}`}
                  onClick={() => openBrand(brand)}
                  title={brand}
                  aria-label={brand}
                >
                  {brandLogoMap[brand]
                    ? <img src={brandLogoMap[brand]} alt={brand} className="brand-sidebar-logo" />
                    : <div className="brand-sidebar-initial">{(brand[0] ?? '?').toUpperCase()}</div>
                  }
                </button>
              ))}
            </nav>

            {/* Contenu principal */}
            <div className="brand-detail-main">
              {detailView === 'grid' && (
                brandDetailGroups.length === 0
                  ? <div className="catalogue-empty"><p>Aucun résultat.{hasActiveFilter && ' '}</p>{hasActiveFilter && <button onClick={clearFilters}>Effacer les filtres</button>}</div>
                  : brandDetailGroups.map(([cat, prods]) => {
                    const isOpen = openCategories.has(cat)
                    return (
                      <div key={cat} className="catalogue-group">
                        <button
                          className={`catalogue-group-header catalogue-group-header--collapsible${isOpen ? ' open' : ''}`}
                          style={{ borderLeftColor: catColorMap[cat] ?? '#9ca3af' }}
                          onClick={() => toggleCategory(cat)}
                        >
                          <span className="catalogue-group-collapse-arrow">{isOpen ? '▼' : '▶'}</span>
                          <span className="catalogue-group-title">{cat}</span>
                          <span className="catalogue-group-count">{prods.length}</span>
                        </button>
                        {isOpen && (
                          <div className="catalogue-group-content">
                            <ProductGrid products={prods} productMeta={productMeta} catColorMap={catColorMap}
                              selectedIds={selectedIds} onToggleSelect={toggleSelect} onPreview={id => setPreviewId(id)} />
                          </div>
                        )}
                      </div>
                    )
                  })
              )}
              {detailView === 'list' && (
                brandDetailGroups.length === 0
                  ? <div className="catalogue-empty"><p>Aucun résultat.</p>{hasActiveFilter && <button onClick={clearFilters}>Effacer les filtres</button>}</div>
                  : <ProductListView
                      products={brandDetailGroups.flatMap(([, p]) => p)}
                      productMeta={productMeta} catColorMap={catColorMap}
                      selectedIds={selectedIds} onToggleSelect={toggleSelect} onPreview={id => setPreviewId(id)}
                      listSortKey={listSortKey} listSortDir={listSortDir} onSort={toggleListSort} />
              )}
            </div>
          </div>
        )}

        {/* ── Vue Catégories : lignes ── */}
        {viewMode === 'byCategory' && !catView && (
          <div className="category-rows">
            {groupedByCategory.map(([cat, prods]) => (
              <CategoryRow key={cat} catName={cat} count={prods.length}
                color={catColorMap[cat] ?? '#9ca3af'}
                logo={categoryLogoMap[cat]}
                catId={categoryIdMap[cat]}
                isAdmin={isAdmin}
                onOpen={() => openCategory(cat)}
                onEditLogo={() => setEditingLogoForCategory(cat)} />
            ))}
          </div>
        )}

        {/* ── Détail catégorie ── */}
        {viewMode === 'byCategory' && catView && (
          catDetailProducts.length === 0
            ? <div className="catalogue-empty"><p>Aucun résultat.</p>{hasActiveFilter && <button onClick={clearFilters}>Effacer les filtres</button>}</div>
            : detailView === 'grid'
              ? <ProductGrid products={catDetailProducts} productMeta={productMeta} catColorMap={catColorMap}
                  selectedIds={selectedIds} onToggleSelect={toggleSelect} onPreview={id => setPreviewId(id)} />
              : <ProductListView products={catDetailProducts} productMeta={productMeta} catColorMap={catColorMap}
                  selectedIds={selectedIds} onToggleSelect={toggleSelect} onPreview={id => setPreviewId(id)}
                  listSortKey={listSortKey} listSortDir={listSortDir} onSort={toggleListSort} />
        )}
      </div>

      {/* ── FAB ── */}
      <button className="catalogue-fab" onClick={() => setEditingProductId('new')}>+ Nouveau produit</button>

      {/* ── Barre de sélection ── */}
      {selectedIds.size > 0 && (
        <div className="cat-selection-bar">
          <span className="cat-selection-count">{selectedIds.size} fiche{selectedIds.size > 1 ? 's' : ''} sélectionnée{selectedIds.size > 1 ? 's' : ''}</span>
          <div className="cat-selection-actions">
            {isAdmin && <button className="cat-selection-btn cat-selection-btn--approve" onClick={handleBulkApprove}>✓ Approuver</button>}
            <button className="cat-selection-btn" onClick={handleBulkExport}>↓ Exporter CSV</button>
            <button className="cat-selection-btn cat-selection-btn--clear" onClick={() => setSelectedIds(new Set())}>× Tout désélectionner</button>
          </div>
        </div>
      )}

      {/* ── Aperçu rapide ── */}
      {previewProduct && (
        <ProductQuickPreview product={previewProduct} meta={productMeta[previewProduct.id]}
          isBuiltin={BUILTIN_IDS.has(previewProduct.id)} catColor={catColorMap[previewProduct.category] ?? '#9ca3af'}
          onClose={() => setPreviewId(null)} onEdit={() => { setPreviewId(null); setEditingProductId(previewProduct.id) }} />
      )}

      {/* ── Éditeur fiche ── */}
      {editingProductId !== null && (
        <ProductEditor productId={editingProductId} onClose={() => setEditingProductId(null)} onSwitchTo={id => setEditingProductId(id)} />
      )}

      {/* ── Mon compte ── */}
      {accountOpen && <AdminSettings initialPanel={accountInitialPanel} onClose={() => setAccountOpen(false)} />}

      {/* ── Éditeur logo marque ── */}
      {editingLogoForBrand && (
        <BrandLogoEditor brandName={editingLogoForBrand} currentLogo={brandLogoMap[editingLogoForBrand]}
          onSave={handleSaveBrandLogo} onClose={() => setEditingLogoForBrand(null)} />
      )}

      {/* ── Éditeur logo catégorie ── */}
      {editingLogoForCategory && (
        <BrandLogoEditor brandName={editingLogoForCategory} currentLogo={categoryLogoMap[editingLogoForCategory]}
          onSave={handleSaveCategoryLogo} onClose={() => setEditingLogoForCategory(null)} />
      )}
    </div>
  )
}

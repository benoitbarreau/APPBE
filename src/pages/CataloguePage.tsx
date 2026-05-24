import { useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { useAppStore, useCatalogMeta } from '../store'
import { ProductEditor } from '../components/ProductEditor'
import { AdminSettings } from '../components/AdminSettings'
import type { Panel } from '../components/AdminSettings'
import type { Product } from '../types'
import type { UserProductMeta } from '../lib/userProductsApi'
import { upsertUserProduct, validateUserProduct } from '../lib/userProductsApi'
import { BUILTIN_CATALOG } from '../catalog'
import { exportToCsv, importFromCsv } from '../lib/catalogueApi'
import { updateBrandLogo } from '../lib/catalogMetaApi'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

// ── Constantes ─────────────────────────────────────────────────────────────

const BUILTIN_IDS = new Set(BUILTIN_CATALOG.map(p => p.id))

type FilterMode  = 'all' | 'builtin' | 'approved' | 'mine' | 'pending'
type SortKey     = 'manufacturer' | 'reference' | 'category'
type ViewMode    = 'grid' | 'list' | 'byBrand' | 'byCategory'
type ListSortKey = 'reference' | 'manufacturer' | 'category' | 'rack'

const PILL_DEFS: { mode: FilterMode; label: string; alert?: boolean }[] = [
  { mode: 'all',      label: 'Tous' },
  { mode: 'builtin',  label: 'Intégrés' },
  { mode: 'approved', label: 'Commun' },
  { mode: 'mine',     label: 'Mes fiches' },
  { mode: 'pending',  label: 'En attente', alert: true },
]

// ── Utilitaire PDF ─────────────────────────────────────────────────────────

function pdfFileName(url: string): string {
  try {
    const decoded = decodeURIComponent(url.split('/product-datasheets/')[1] ?? url)
    return decoded.split('?')[0].split('/').pop() ?? url
  } catch { return url }
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  onGoHome: () => void
  onOpenProjects?: () => void
  onOpenReferentiel?: () => void
  onOpenAdminDashboard?: () => void
}

// ── A : Aperçu rapide (slide panel) ───────────────────────────────────────

function ProductPreviewPanel({
  product,
  meta,
  isBuiltin,
  catColor,
  onClose,
  onEdit,
}: {
  product: Product
  meta: UserProductMeta | undefined
  isBuiltin: boolean
  catColor: string
  onClose: () => void
  onEdit: () => void
}) {
  const status  = isBuiltin ? 'builtin' : (meta?.status ?? 'unknown')
  const portIn  = product.inputs.length
  const portOut = product.outputs.length
  const portMid = (product.middle ?? []).length

  return (
    <div
      className="cat-preview-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu produit"
    >
      <aside className="cat-preview-panel" onClick={e => e.stopPropagation()}>

        {/* Bandeau coloré catégorie */}
        <div className="cat-preview-header" style={{ background: catColor }}>
          <span className="cat-preview-cat-label">
            {product.category || 'Sans catégorie'}
          </span>
          <button className="cat-preview-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <div className="cat-preview-body">

          {/* Image de face */}
          {product.imageFront ? (
            <div className="cat-preview-img-wrap">
              <img
                src={product.imageFront}
                alt={product.reference}
                className="cat-preview-img"
              />
            </div>
          ) : (
            <div className="cat-preview-img-placeholder">
              <span>Pas d'image disponible</span>
            </div>
          )}

          {/* Référence + badge statut */}
          <div className="cat-preview-title-row">
            <div className="cat-preview-names">
              <div className="cat-preview-ref">{product.reference}</div>
              <div className="cat-preview-brand">{product.manufacturer}</div>
            </div>
            <span className={`cat-card-badge cat-card-badge--${status}`}>
              {isBuiltin ? 'Intégré'
                : status === 'approved' ? 'Commun'
                : status === 'pending'  ? 'En attente'
                : '—'}
            </span>
          </div>

          {/* Spécifications */}
          <div className="cat-preview-specs">
            {product.articleCode && (
              <div className="cat-preview-spec">
                <span className="cat-preview-spec-label">Code article</span>
                <strong className="cat-preview-spec-val">{product.articleCode}</strong>
              </div>
            )}
            {(product.rackHeightU || product.rackSize) && (
              <div className="cat-preview-spec">
                <span className="cat-preview-spec-label">Rack</span>
                <strong className="cat-preview-spec-val">
                  {[
                    product.rackHeightU && `${product.rackHeightU}U`,
                    product.rackSize    && `${product.rackSize}"`,
                  ].filter(Boolean).join(' · ')}
                </strong>
              </div>
            )}
            {product.widthCm && (
              <div className="cat-preview-spec">
                <span className="cat-preview-spec-label">Largeur</span>
                <strong className="cat-preview-spec-val">{product.widthCm} cm</strong>
              </div>
            )}
            {product.depthCm && (
              <div className="cat-preview-spec">
                <span className="cat-preview-spec-label">Profondeur</span>
                <strong className="cat-preview-spec-val">{product.depthCm} cm</strong>
              </div>
            )}
            {product.heightCm && (
              <div className="cat-preview-spec">
                <span className="cat-preview-spec-label">Hauteur</span>
                <strong className="cat-preview-spec-val">{product.heightCm} cm</strong>
              </div>
            )}
            {product.weightKg && (
              <div className="cat-preview-spec">
                <span className="cat-preview-spec-label">Poids</span>
                <strong className="cat-preview-spec-val">{product.weightKg} kg</strong>
              </div>
            )}
            {product.powerStandbyW && (
              <div className="cat-preview-spec">
                <span className="cat-preview-spec-label">Puissance veille</span>
                <strong className="cat-preview-spec-val">{product.powerStandbyW} W</strong>
              </div>
            )}
            {product.powerOperatingW && (
              <div className="cat-preview-spec">
                <span className="cat-preview-spec-label">Puissance marche</span>
                <strong className="cat-preview-spec-val">{product.powerOperatingW} W</strong>
              </div>
            )}
            {product.thermalBtuH && (
              <div className="cat-preview-spec">
                <span className="cat-preview-spec-label">Dégagement thermique</span>
                <strong className="cat-preview-spec-val">{product.thermalBtuH} BTU/h</strong>
              </div>
            )}
            {(portIn + portOut + portMid) > 0 && (
              <div className="cat-preview-spec">
                <span className="cat-preview-spec-label">Ports</span>
                <strong className="cat-preview-spec-val">
                  {[
                    portIn  > 0 && `↙ ${portIn} entrée${portIn  > 1 ? 's' : ''}`,
                    portOut > 0 && `↗ ${portOut} sortie${portOut > 1 ? 's' : ''}`,
                    portMid > 0 && `⇄ ${portMid} middle`,
                  ].filter(Boolean).join('  ·  ')}
                </strong>
              </div>
            )}
          </div>

          {/* Fiches techniques PDF */}
          {(product.datasheetUrls?.length ?? 0) > 0 && (
            <div className="cat-preview-pdfs">
              <div className="cat-preview-section-label">Fiches techniques</div>
              {product.datasheetUrls!.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="cat-preview-pdf-link"
                >
                  📄 {pdfFileName(url)}
                </a>
              ))}
            </div>
          )}

          {/* Boutons d'action */}
          <div className="cat-preview-actions">
            <button className="primary" onClick={onEdit}>✏️ Modifier la fiche</button>
            {product.productUrl && (
              <a
                href={product.productUrl}
                target="_blank"
                rel="noreferrer"
                className="cat-preview-ext-link"
              >
                🔗 Page produit
              </a>
            )}
          </div>

        </div>
      </aside>
    </div>
  )
}

// ── Éditeur de logo marque ────────────────────────────────────────────────

function BrandLogoEditor({
  brandName,
  currentLogo,
  onSave,
  onClose,
}: {
  brandName: string
  currentLogo?: string
  onSave: (logo: string | null) => void
  onClose: () => void
}) {
  const isUrl = (s: string) => /^https?:\/\/.+/.test(s.trim())
  const [tab, setTab]         = useState<'upload' | 'url'>(currentLogo && isUrl(currentLogo) ? 'url' : 'upload')
  const [urlInput, setUrlInput] = useState(currentLogo && isUrl(currentLogo) ? currentLogo : '')
  const [preview, setPreview] = useState<string | null>(currentLogo ?? null)
  const [imgError, setImgError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setPreview(reader.result as string); setImgError(false) }
    reader.readAsDataURL(file)
  }

  const handleUrlChange = (v: string) => {
    setUrlInput(v)
    setImgError(false)
    if (isUrl(v)) setPreview(v.trim())
    else setPreview(null)
  }

  return (
    <div className="brand-logo-overlay" onClick={onClose}>
      <div className="brand-logo-modal" onClick={e => e.stopPropagation()}>

        <div className="brand-logo-modal-header">
          <span>Logo — <strong>{brandName}</strong></span>
          <button className="brand-logo-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Onglets */}
        <div className="brand-logo-tabs">
          <button
            className={tab === 'upload' ? 'active' : ''}
            onClick={() => setTab('upload')}
          >📁 Fichier image</button>
          <button
            className={tab === 'url' ? 'active' : ''}
            onClick={() => setTab('url')}
          >🔗 URL web</button>
        </div>

        {tab === 'upload' ? (
          <div
            className="brand-logo-upload-area"
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
            <span className="brand-logo-upload-icon">🖼</span>
            <span className="brand-logo-upload-text">Cliquer pour choisir une image</span>
            <span className="brand-logo-upload-sub">PNG, SVG, JPG · max ~200 Ko recommandé</span>
          </div>
        ) : (
          <input
            className="brand-logo-url-input"
            value={urlInput}
            onChange={e => handleUrlChange(e.target.value)}
            placeholder="https://exemple.com/logo-marque.png"
            autoFocus
          />
        )}

        {/* Prévisualisation */}
        {preview && !imgError && (
          <div className="brand-logo-preview">
            <img
              src={preview}
              alt="Prévisualisation"
              className="brand-logo-preview-img"
              onError={() => setImgError(true)}
            />
          </div>
        )}
        {imgError && (
          <div className="brand-logo-preview-err">⚠ Image impossible à charger</div>
        )}

        {/* Boutons */}
        <div className="brand-logo-actions">
          {currentLogo && (
            <button className="danger" onClick={() => onSave(null)}>
              Supprimer le logo
            </button>
          )}
          <button
            className="primary"
            disabled={!preview || imgError}
            onClick={() => { if (preview && !imgError) onSave(preview) }}
          >
            Enregistrer
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Tuile marque ──────────────────────────────────────────────────────────

function BrandTile({
  brandName,
  count,
  logo,
  brandId,
  isAdmin,
  onOpen,
  onEditLogo,
}: {
  brandName: string
  count: number
  logo?: string
  brandId?: string
  isAdmin: boolean
  onOpen: () => void
  onEditLogo: () => void
}) {
  return (
    <div className="brand-tile">
      {/* Bouton modifier logo (admin) */}
      {isAdmin && brandId && (
        <button
          className="brand-tile-edit-btn"
          onClick={e => { e.stopPropagation(); onEditLogo() }}
          title={`Modifier le logo de ${brandName}`}
        >
          ✏️
        </button>
      )}

      <button className="brand-tile-inner" onClick={onOpen}>
        {/* Zone logo */}
        <div className="brand-tile-logo-area">
          {logo
            ? <img src={logo} alt={brandName} className="brand-tile-logo-img" />
            : <div className="brand-tile-logo-placeholder">
                {(brandName[0] ?? '?').toUpperCase()}
              </div>
          }
        </div>

        <div className="brand-tile-name">{brandName}</div>
        <div className="brand-tile-count">
          {count} produit{count > 1 ? 's' : ''}
        </div>
      </button>
    </div>
  )
}

// ── Carte produit (vue grille) ─────────────────────────────────────────────

function ProductCard({
  product,
  meta,
  isBuiltin,
  categoryColor,
  isSelected,
  onSelect,
  onClick,
}: {
  product: Product
  meta: UserProductMeta | undefined
  isBuiltin: boolean
  categoryColor: string
  isSelected: boolean
  onSelect: () => void
  onClick: () => void
}) {
  const status  = isBuiltin ? 'builtin' : (meta?.status ?? 'unknown')
  const portIn  = product.inputs.length
  const portOut = product.outputs.length
  const portMid = (product.middle ?? []).length
  const hasFront = !!product.imageFront

  return (
    <button
      className={`cat-card${isSelected ? ' cat-card--selected' : ''}`}
      onClick={onClick}
      title={`Aperçu : ${product.manufacturer} ${product.reference}`}
    >
      {/* C : Checkbox de sélection (div pour éviter button imbriqué) */}
      <div
        className={`cat-card-checkbox${isSelected ? ' cat-card-checkbox--checked' : ''}`}
        onClick={e => { e.stopPropagation(); onSelect() }}
        role="checkbox"
        aria-checked={isSelected}
        aria-label="Sélectionner ce produit"
      >
        {isSelected && '✓'}
      </div>

      {/* Ligne d'accent colorée (fine) */}
      <div className="cat-card-top-band" style={{ background: categoryColor }} aria-hidden="true" />

      {/* Corps */}
      <div className={`cat-card-body${hasFront ? ' cat-card-body--has-thumb' : ''}`}>
        {/* Catégorie en texte discret */}
        <div className="cat-card-category-label">
          {product.category || 'Sans catégorie'}
        </div>

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
  isSelected,
  onSelect,
  onClick,
}: {
  product: Product
  meta: UserProductMeta | undefined
  isBuiltin: boolean
  categoryColor: string
  isSelected: boolean
  onSelect: () => void
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
    <button
      className={`cat-list-row${isSelected ? ' cat-list-row--selected' : ''}`}
      onClick={onClick}
    >
      {/* C : Checkbox */}
      <div
        className={`cat-list-checkbox cat-list-col-cb${isSelected ? ' cat-list-checkbox--checked' : ''}`}
        onClick={e => { e.stopPropagation(); onSelect() }}
        role="checkbox"
        aria-checked={isSelected}
        aria-label="Sélectionner"
      >
        {isSelected && '✓'}
      </div>

      <div className="cat-list-color-dot cat-list-col-dot" style={{ background: categoryColor }} />
      {product.imageFront
        ? <img src={product.imageFront} className="cat-list-thumb cat-list-col-img" alt="" />
        : <div className="cat-list-thumb-placeholder cat-list-col-img" />
      }
      <span className="cat-list-ref cat-list-col-ref">{product.reference}</span>
      <span className="cat-list-brand cat-list-col-brand">{product.manufacturer}</span>
      <span className="cat-list-cat cat-list-col-cat">
        {product.category || <em className="cat-card-na">—</em>}
      </span>
      <span className="cat-list-rack cat-list-col-rack">{rackStr}</span>
      <span className="cat-list-ports cat-list-col-ports">
        {portIn + portOut > 0 ? `↙${portIn} ↗${portOut}` : '—'}
      </span>
      <span className={`cat-card-badge cat-card-badge--${status} cat-list-col-status`}>
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
  selectedIds,
  onToggleSelect,
  onPreview,
}: {
  products: Product[]
  productMeta: Record<string, UserProductMeta>
  catColorMap: Record<string, string>
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onPreview: (id: string) => void
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
          isSelected={selectedIds.has(p.id)}
          onSelect={() => onToggleSelect(p.id)}
          onClick={() => onPreview(p.id)}
        />
      ))}
    </div>
  )
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

  // ── UI state ──
  const [search,          setSearch]          = useState('')
  const [filterMode,      setFilterMode]      = useState<FilterMode>('all')
  const [filterCategory,  setFilterCategory]  = useState('')
  const [filterBrand,     setFilterBrand]     = useState('')
  const [sortKey,         setSortKey]         = useState<SortKey>('manufacturer')
  const [viewMode,        setViewMode]        = useState<ViewMode>('byBrand')
  const [editingProductId, setEditingProductId] = useState<string | 'new' | null>(null)
  const [accountOpen,     setAccountOpen]     = useState(false)
  const [accountInitialPanel, setAccountInitialPanel] = useState<Panel>('info')
  const [importError,     setImportError]     = useState<string | null>(null)
  const [importSuccess,   setImportSuccess]   = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  // ── Navigation marques ──
  const [brandView,           setBrandView]           = useState<string | null>(null)  // null = grille tuiles, string = marque sélectionnée
  const [editingLogoForBrand, setEditingLogoForBrand] = useState<string | null>(null) // nom de la marque dont on édite le logo
  const [openCategories,      setOpenCategories]      = useState<Set<string>>(new Set()) // catégories dépliées dans la vue détail marque

  /** Ouvre la vue détail d'une marque en réinitialisant les catégories (toutes repliées). */
  const openBrand = (brand: string) => {
    setBrandView(brand)
    setOpenCategories(new Set())
  }

  /** Bascule l'état ouvert/fermé d'une catégorie. */
  const toggleCategory = (cat: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  // ── A : Aperçu rapide ──
  const [previewId, setPreviewId] = useState<string | null>(null)

  // ── B : Filtres avancés ──
  const [showAdvFilters, setShowAdvFilters] = useState(false)
  const [advRackUs,      setAdvRackUs]      = useState<string[]>([])
  const [advWithImage,   setAdvWithImage]   = useState(false)
  const [advWithPdf,     setAdvWithPdf]     = useState(false)

  // ── C : Sélection multiple ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── D : Tri colonne liste ──
  const [listSortKey, setListSortKey] = useState<ListSortKey>('manufacturer')
  const [listSortDir, setListSortDir] = useState<'asc' | 'desc'>('asc')

  // ── Couleurs des catégories ──
  const catColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    catalogCategories.forEach(c => { m[c.name] = c.color })
    return m
  }, [catalogCategories])

  // ── Logos & IDs des marques ──
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

  // ── Filtrage + tri (inclut les filtres avancés B) ──
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
    // B : filtres avancés spécifications
    if (advRackUs.length > 0) {
      list = list.filter(p => {
        const u = p.rackHeightU ?? 0
        return advRackUs.some(r => r === '4+' ? u >= 4 : u === parseInt(r, 10))
      })
    }
    if (advWithImage) list = list.filter(p => !!p.imageFront)
    if (advWithPdf)   list = list.filter(p => (p.datasheetUrls?.length ?? 0) > 0)

    list.sort((a, b) => {
      if (sortKey === 'reference') return a.reference.localeCompare(b.reference, 'fr')
      if (sortKey === 'category')  return a.category.localeCompare(b.category, 'fr') || a.manufacturer.localeCompare(b.manufacturer, 'fr')
      return a.manufacturer.localeCompare(b.manufacturer, 'fr') || a.reference.localeCompare(b.reference, 'fr')
    })
    return list
  }, [products, productMeta, filterMode, filterCategory, filterBrand, search, sortKey, profile?.id, advRackUs, advWithImage, advWithPdf])

  // ── D : Liste triée par colonne ──
  const displayList = useMemo(() => {
    const list = [...filtered]
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
  }, [filtered, listSortKey, listSortDir])

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

  // ── Vue détail marque : produits de la marque groupés par catégorie ──
  const groupedBrandDetail = useMemo(() => {
    if (!brandView) return []
    const groups = new Map<string, Product[]>()
    filtered
      .filter(p => p.manufacturer === brandView)
      .forEach(p => {
        const k = p.category || '(Sans catégorie)'
        if (!groups.has(k)) groups.set(k, [])
        groups.get(k)!.push(p)
      })
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [filtered, brandView])

  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, Product[]>()
    filtered.forEach(p => {
      const k = p.category || '(Sans catégorie)'
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(p)
    })
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [filtered])

  // ── A : Produit en aperçu ──
  const previewProduct = previewId ? (products.find(p => p.id === previewId) ?? null) : null

  // ── C : Sélection ──
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkApprove = async () => {
    const ids = [...selectedIds].filter(id => !BUILTIN_IDS.has(id))
    for (const id of ids) {
      const existing = productMeta[id]
      if (!existing) continue
      setProductMeta(id, { ...existing, status: 'approved' })
      validateUserProduct(id).catch(() => {})
    }
    setSelectedIds(new Set())
  }

  const handleBulkExport = () => {
    const sel = products.filter(p => selectedIds.has(p.id))
    exportToCsv(sel, productMeta, `selection-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  // ── Logo marque ──
  const handleSaveBrandLogo = (logo: string | null) => {
    if (!editingLogoForBrand) return
    const brandId = brandIdMap[editingLogoForBrand]
    if (!brandId) return
    // Mise à jour locale du store
    const updatedBrands = catalogBrands.map(b =>
      b.id === brandId ? { ...b, logo: logo ?? undefined } : b,
    )
    setCatalogMeta(updatedBrands, catalogCategories)
    // Persistance Supabase (silencieuse)
    updateBrandLogo(brandId, logo).catch(() => {})
    setEditingLogoForBrand(null)
  }

  // ── D : Tri colonne ──
  const toggleListSort = (key: ListSortKey) => {
    if (key === listSortKey) {
      setListSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setListSortKey(key)
      setListSortDir('asc')
    }
  }

  const sortArrow = (key: ListSortKey) =>
    listSortKey === key ? (listSortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'

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

  // ── Filtres ──
  const hasAdvFilter = advRackUs.length > 0 || advWithImage || advWithPdf
  const hasActiveFilter = filterMode !== 'all' || filterCategory || filterBrand || search || hasAdvFilter
  const clearFilters = () => {
    setFilterMode('all')
    setFilterCategory('')
    setFilterBrand('')
    setSearch('')
    setAdvRackUs([])
    setAdvWithImage(false)
    setAdvWithPdf(false)
  }

  // ── Nombre de filtres avancés actifs ──
  const advFilterCount = advRackUs.length + (advWithImage ? 1 : 0) + (advWithPdf ? 1 : 0)

  return (
    <div className="catalogue-page">

      {/* ── Header unifié ── */}
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

      {/* ── Toolbar compacte ── */}
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

          {/* B : Bouton filtres avancés */}
          <button
            className={`catalogue-adv-filter-btn${hasAdvFilter ? ' active' : ''}`}
            onClick={() => setShowAdvFilters(v => !v)}
            title="Filtres avancés (rack, image, PDF)"
          >
            ⚙ Filtres{advFilterCount > 0 ? ` (${advFilterCount})` : ''}
            <span style={{ fontSize: 10, marginLeft: 3 }}>{showAdvFilters ? '▲' : '▼'}</span>
          </button>

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

        {/* Navigation marque (fil d'Ariane quand on est dans la vue détail d'une marque) */}
        {viewMode === 'byBrand' && brandView && (
          <div className="catalogue-brand-nav">
            <button className="catalogue-brand-back" onClick={() => setBrandView(null)}>
              ← Toutes les marques
            </button>
            <span className="catalogue-brand-nav-sep">›</span>
            {brandLogoMap[brandView] && (
              <img src={brandLogoMap[brandView]} alt={brandView} className="brand-nav-logo-sm" />
            )}
            <span className="catalogue-brand-nav-name">{brandView}</span>
            <span className="catalogue-brand-nav-count">
              ({groupedBrandDetail.reduce((s, [, p]) => s + p.length, 0)} produits)
            </span>
          </div>
        )}

        {/* B : Section filtres avancés (collapsible) */}
        {showAdvFilters && (
          <div className="catalogue-adv-filters">
            <div className="catalogue-adv-filter-group">
              <span className="catalogue-adv-filter-label">Hauteur rack :</span>
              {['1', '2', '3', '4+'].map(r => (
                <label key={r} className="catalogue-adv-filter-check">
                  <input
                    type="checkbox"
                    checked={advRackUs.includes(r)}
                    onChange={() =>
                      setAdvRackUs(prev =>
                        prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r],
                      )
                    }
                  />
                  {r}{r !== '4+' ? 'U' : ''}
                </label>
              ))}
            </div>
            <div className="catalogue-adv-filter-sep" />
            <div className="catalogue-adv-filter-group">
              <label className="catalogue-adv-filter-check">
                <input
                  type="checkbox"
                  checked={advWithImage}
                  onChange={e => setAdvWithImage(e.target.checked)}
                />
                Avec image
              </label>
              <label className="catalogue-adv-filter-check">
                <input
                  type="checkbox"
                  checked={advWithPdf}
                  onChange={e => setAdvWithPdf(e.target.checked)}
                />
                Avec PDF
              </label>
            </div>
          </div>
        )}
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
          {selectedIds.size > 0 && (
            <span className="catalogue-results-selected">
              · {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
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
          /* ── D : Vue liste avec colonnes triables ── */
          <div className="catalogue-list">
            <div className="cat-list-header">
              <span className="cat-list-col-cb" />
              <span className="cat-list-col-dot" />
              <span className="cat-list-col-img" />
              <button
                className={`cat-list-sort-btn cat-list-col-ref${listSortKey === 'reference' ? ' active' : ''}`}
                onClick={() => toggleListSort('reference')}
                title="Trier par référence"
              >
                Référence<span className="cat-list-sort-arrow">{sortArrow('reference')}</span>
              </button>
              <button
                className={`cat-list-sort-btn cat-list-col-brand${listSortKey === 'manufacturer' ? ' active' : ''}`}
                onClick={() => toggleListSort('manufacturer')}
                title="Trier par marque"
              >
                Marque<span className="cat-list-sort-arrow">{sortArrow('manufacturer')}</span>
              </button>
              <button
                className={`cat-list-sort-btn cat-list-col-cat${listSortKey === 'category' ? ' active' : ''}`}
                onClick={() => toggleListSort('category')}
                title="Trier par catégorie"
              >
                Catégorie<span className="cat-list-sort-arrow">{sortArrow('category')}</span>
              </button>
              <button
                className={`cat-list-sort-btn cat-list-col-rack${listSortKey === 'rack' ? ' active' : ''}`}
                onClick={() => toggleListSort('rack')}
                title="Trier par hauteur rack"
              >
                Rack<span className="cat-list-sort-arrow">{sortArrow('rack')}</span>
              </button>
              <span className="cat-list-col-ports">Ports</span>
              <span className="cat-list-col-status">Statut</span>
            </div>
            {displayList.map(p => (
              <ProductListRow
                key={p.id}
                product={p}
                meta={productMeta[p.id]}
                isBuiltin={BUILTIN_IDS.has(p.id)}
                categoryColor={catColorMap[p.category] ?? '#9ca3af'}
                isSelected={selectedIds.has(p.id)}
                onSelect={() => toggleSelect(p.id)}
                onClick={() => setPreviewId(p.id)}
              />
            ))}
          </div>

        ) : viewMode === 'byBrand' && brandView ? (
          /* ── Vue détail marque : catégories repliables ── */
          <>
            {groupedBrandDetail.length === 0 ? (
              <div className="catalogue-empty">
                <p>Aucun produit pour cette marque avec les filtres actifs.</p>
                {hasActiveFilter && <button onClick={clearFilters}>Effacer les filtres</button>}
              </div>
            ) : groupedBrandDetail.map(([cat, prods]) => {
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
                      <ProductGrid
                        products={prods}
                        productMeta={productMeta}
                        catColorMap={catColorMap}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelect}
                        onPreview={id => setPreviewId(id)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </>

        ) : viewMode === 'byBrand' ? (
          /* ── Grille de tuiles marques ── */
          <div className="brand-tiles-grid">
            {groupedByBrand.map(([brand, prods]) => (
              <BrandTile
                key={brand}
                brandName={brand}
                count={prods.length}
                logo={brandLogoMap[brand]}
                brandId={brandIdMap[brand]}
                isAdmin={isAdmin}
                onOpen={() => openBrand(brand)}
                onEditLogo={() => setEditingLogoForBrand(brand)}
              />
            ))}
          </div>

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
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onPreview={id => setPreviewId(id)}
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
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onPreview={id => setPreviewId(id)}
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

      {/* ── C : Barre de sélection multiple ── */}
      {selectedIds.size > 0 && (
        <div className="cat-selection-bar">
          <span className="cat-selection-count">
            {selectedIds.size} fiche{selectedIds.size > 1 ? 's' : ''} sélectionnée{selectedIds.size > 1 ? 's' : ''}
          </span>
          <div className="cat-selection-actions">
            {isAdmin && (
              <button
                className="cat-selection-btn cat-selection-btn--approve"
                onClick={handleBulkApprove}
                title="Approuver les fiches sélectionnées"
              >
                ✓ Approuver
              </button>
            )}
            <button
              className="cat-selection-btn"
              onClick={handleBulkExport}
              title="Exporter la sélection en CSV"
            >
              ↓ Exporter CSV
            </button>
            <button
              className="cat-selection-btn cat-selection-btn--clear"
              onClick={() => setSelectedIds(new Set())}
              title="Désélectionner tout"
            >
              × Tout désélectionner
            </button>
          </div>
        </div>
      )}

      {/* ── A : Panneau d'aperçu rapide ── */}
      {previewProduct && (
        <ProductPreviewPanel
          product={previewProduct}
          meta={productMeta[previewProduct.id]}
          isBuiltin={BUILTIN_IDS.has(previewProduct.id)}
          catColor={catColorMap[previewProduct.category] ?? '#9ca3af'}
          onClose={() => setPreviewId(null)}
          onEdit={() => { setPreviewId(null); setEditingProductId(previewProduct.id) }}
        />
      )}

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

      {/* ── Éditeur de logo marque ── */}
      {editingLogoForBrand && (
        <BrandLogoEditor
          brandName={editingLogoForBrand}
          currentLogo={brandLogoMap[editingLogoForBrand]}
          onSave={handleSaveBrandLogo}
          onClose={() => setEditingLogoForBrand(null)}
        />
      )}
    </div>
  )
}

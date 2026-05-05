import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { UserTable } from '../components/auth/UserTable'
import type { Profile, UserStatus, UserRole } from '../auth/AuthContext'
import {
  fetchBrands, createBrand, updateBrand, deleteBrand,
  fetchCategories, createCategory, updateCategory, deleteCategory,
  importMetaFromProducts,
} from '../lib/catalogMetaApi'
import type { CatalogBrand, CatalogCategory } from '../lib/catalogMetaApi'
import { useCatalogMeta } from '../store'
import { BUILTIN_CATALOG } from '../catalog'

// ── Onglet utilisateurs ───────────────────────────────────────────────────

type FilterStatus = UserStatus | 'all'

const FILTER_LABELS: Record<FilterStatus, string> = {
  all: 'Tous', pending: 'En attente', approved: 'Approuvés', rejected: 'Refusés',
}

// ── Onglet catalogue ──────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  '#6B7280', '#1F2937',
]

function BrandRow({
  brand, onSave, onDelete,
}: {
  brand: CatalogBrand
  onSave: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(brand.name)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim() || name.trim() === brand.name) { setEditing(false); return }
    setBusy(true)
    await onSave(brand.id, name.trim())
    setBusy(false)
    setEditing(false)
  }

  return (
    <div className="catmeta-row">
      {editing ? (
        <input
          className="catmeta-input"
          value={name}
          autoFocus
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setName(brand.name); setEditing(false) } }}
        />
      ) : (
        <span className="catmeta-name">{brand.name}</span>
      )}
      <div className="catmeta-actions">
        {editing ? (
          <>
            <button className="primary" onClick={() => void save()} disabled={busy}>✓</button>
            <button onClick={() => { setName(brand.name); setEditing(false) }}>✕</button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} title="Renommer">✎</button>
            <button className="danger" onClick={() => void onDelete(brand.id)} title="Supprimer">🗑</button>
          </>
        )}
      </div>
    </div>
  )
}

function CategoryRow({
  category, onSave, onDelete,
}: {
  category: CatalogCategory
  onSave: (id: string, name: string, color: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [color, setColor] = useState(category.color)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) { setEditing(false); return }
    setBusy(true)
    await onSave(category.id, name.trim(), color)
    setBusy(false)
    setEditing(false)
  }

  return (
    <div className="catmeta-row">
      <span
        className="catmeta-color-dot"
        style={{ background: category.color }}
        title={category.color}
      />
      {editing ? (
        <div className="catmeta-edit-group">
          <input
            className="catmeta-input"
            value={name}
            autoFocus
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setName(category.name); setColor(category.color); setEditing(false) } }}
          />
          <div className="catmeta-color-picker">
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              title="Choisir la couleur"
              className="catmeta-color-input"
            />
            <div className="catmeta-presets">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  className={`catmeta-preset${color === c ? ' active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  title={c}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <span className="catmeta-name">{category.name}</span>
      )}
      <div className="catmeta-actions">
        {editing ? (
          <>
            <button className="primary" onClick={() => void save()} disabled={busy}>✓</button>
            <button onClick={() => { setName(category.name); setColor(category.color); setEditing(false) }}>✕</button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} title="Modifier">✎</button>
            <button className="danger" onClick={() => void onDelete(category.id)} title="Supprimer">🗑</button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────

type AdminTab = 'users' | 'catalog'

export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const { profile: currentProfile } = useAuth()
  const [activeTab, setActiveTab] = useState<AdminTab>('users')

  // ── Utilisateurs ──
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')

  useEffect(() => {
    setLoadingUsers(true)
    supabase
      .rpc('admin_list_users')
      .then(({ data }) => {
        setProfiles((data as Profile[]) ?? [])
        setLoadingUsers(false)
      })
  }, [])

  const updateStatus = async (id: string, status: UserStatus) => {
    await supabase.from('profiles').update({ status }).eq('id', id)
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  const updateRole = async (id: string, role: UserRole) => {
    await supabase.from('profiles').update({ role }).eq('id', id)
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, role } : p))
  }

  const filtered = filterStatus === 'all' ? profiles : profiles.filter(p => p.status === filterStatus)
  const filters: FilterStatus[] = ['all', 'pending', 'approved', 'rejected']

  // ── Catalogue ──
  const setCatalogMeta = useCatalogMeta(s => s.setCatalogMeta)
  const [brands, setBrands] = useState<CatalogBrand[]>([])
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [catalogErr, setCatalogErr] = useState<string | null>(null)
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [importing, setImporting] = useState(false)

  // Nouvelle marque
  const [newBrand, setNewBrand] = useState('')
  const [addingBrand, setAddingBrand] = useState(false)

  // Nouvelle catégorie
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('#3B82F6')
  const [addingCat, setAddingCat] = useState(false)

  const loadCatalog = async (autoImport = false) => {
    setLoadingCatalog(true)
    setCatalogErr(null)
    setMigrationMissing(false)
    try {
      const [b, c] = await Promise.all([fetchBrands(), fetchCategories()])
      // Si les deux listes sont vides, importer automatiquement depuis les produits existants
      if (autoImport && b.length === 0 && c.length === 0) {
        // Produits cloud
        await importMetaFromProducts()
        // Produits builtin
        const builtinBrands = [...new Set(BUILTIN_CATALOG.map(p => p.manufacturer?.trim() ?? '').filter(Boolean))]
        const builtinCategories = [...new Set(BUILTIN_CATALOG.map(p => p.category?.trim() ?? '').filter(Boolean))]
        for (const name of builtinBrands) { try { await createBrand(name) } catch { /* doublon ignoré */ } }
        for (const name of builtinCategories) { try { await createCategory(name, '#6c7480') } catch { /* doublon ignoré */ } }
        // Recharger
        const [b2, c2] = await Promise.all([fetchBrands(), fetchCategories()])
        setBrands(b2)
        setCategories(c2)
        setCatalogMeta(b2, c2)
      } else {
        setBrands(b)
        setCategories(c)
        setCatalogMeta(b, c)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur de chargement'
      if (msg.toLowerCase().includes('schema cache') || msg.toLowerCase().includes('not found')) {
        setMigrationMissing(true)
      } else {
        setCatalogErr(msg)
      }
    } finally {
      setLoadingCatalog(false)
    }
  }

  const handleImportFromProducts = async () => {
    setImporting(true)
    setCatalogErr(null)
    try {
      // 1. Importer depuis user_products (produits cloud)
      const fromCloud = await importMetaFromProducts()

      // 2. Ajouter les marques/catégories du catalogue intégré (BUILTIN_CATALOG)
      //    qui ne sont JAMAIS dans user_products (ils sont dans le code)
      const builtinBrands = [...new Set(
        BUILTIN_CATALOG.map(p => p.manufacturer?.trim() ?? '').filter(Boolean)
      )]
      const builtinCategories = [...new Set(
        BUILTIN_CATALOG.map(p => p.category?.trim() ?? '').filter(Boolean)
      )]

      // Insérer les marques builtin manquantes
      const existingBrandNames = new Set([...brands.map(b => b.name), ...fromCloud.brands.map(b => b.name)])
      const missingBrands = builtinBrands.filter(n => !existingBrandNames.has(n))
      for (const name of missingBrands) {
        try { await createBrand(name) } catch { /* doublon ignoré */ }
      }

      // Insérer les catégories builtin manquantes
      const existingCatNames = new Set([...categories.map(c => c.name), ...fromCloud.categories.map(c => c.name)])
      const missingCats = builtinCategories.filter(n => !existingCatNames.has(n))
      for (const name of missingCats) {
        try { await createCategory(name, '#6c7480') } catch { /* doublon ignoré */ }
      }

      // 3. Recharger la liste complète
      await loadCatalog(false)
    } catch (e) {
      setCatalogErr(e instanceof Error ? e.message : 'Erreur lors de l\'import')
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'catalog') void loadCatalog(true)
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Marques
  const handleAddBrand = async () => {
    if (!newBrand.trim()) return
    setAddingBrand(true)
    try {
      const b = await createBrand(newBrand.trim())
      const next = [...brands, b].sort((a, c) => a.name.localeCompare(c.name, 'fr'))
      setBrands(next)
      setCatalogMeta(next, categories)
      setNewBrand('')
    } catch (e) {
      setCatalogErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setAddingBrand(false)
    }
  }

  const handleSaveBrand = async (id: string, name: string) => {
    await updateBrand(id, name)
    const next = brands.map(b => b.id === id ? { ...b, name } : b).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    setBrands(next)
    setCatalogMeta(next, categories)
  }

  const handleDeleteBrand = async (id: string) => {
    if (!confirm('Supprimer cette marque ?')) return
    await deleteBrand(id)
    const next = brands.filter(b => b.id !== id)
    setBrands(next)
    setCatalogMeta(next, categories)
  }

  // Catégories
  const handleAddCat = async () => {
    if (!newCatName.trim()) return
    setAddingCat(true)
    try {
      const c = await createCategory(newCatName.trim(), newCatColor)
      const next = [...categories, c].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      setCategories(next)
      setCatalogMeta(brands, next)
      setNewCatName('')
      setNewCatColor('#3B82F6')
    } catch (e) {
      setCatalogErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setAddingCat(false)
    }
  }

  const handleSaveCat = async (id: string, name: string, color: string) => {
    await updateCategory(id, name, color)
    const next = categories.map(c => c.id === id ? { ...c, name, color } : c).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    setCategories(next)
    setCatalogMeta(brands, next)
  }

  const handleDeleteCat = async (id: string) => {
    if (!confirm('Supprimer cette catégorie ?')) return
    await deleteCategory(id)
    const next = categories.filter(c => c.id !== id)
    setCategories(next)
    setCatalogMeta(brands, next)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal admin-dashboard-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="admin-tabs">
            <button
              className={`admin-tab${activeTab === 'users' ? ' active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              Utilisateurs
            </button>
            <button
              className={`admin-tab${activeTab === 'catalog' ? ' active' : ''}`}
              onClick={() => setActiveTab('catalog')}
            >
              Catalogue
            </button>
          </div>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="admin-dashboard-body">

          {/* ── Onglet Utilisateurs ── */}
          {activeTab === 'users' && (
            <>
              <div className="admin-filter-bar">
                <span className="muted">Filtrer :</span>
                {filters.map(s => (
                  <button
                    key={s}
                    className={filterStatus === s ? 'primary' : ''}
                    onClick={() => setFilterStatus(s)}
                  >
                    {FILTER_LABELS[s]}
                  </button>
                ))}
                <span className="muted admin-filter-count">
                  {filtered.length} utilisateur{filtered.length > 1 ? 's' : ''}
                </span>
              </div>
              {loadingUsers
                ? <div className="auth-loading-inline">Chargement…</div>
                : <UserTable
                    profiles={filtered}
                    currentUserId={currentProfile?.id ?? ''}
                    onUpdateStatus={updateStatus}
                    onUpdateRole={updateRole}
                  />
              }
            </>
          )}

          {/* ── Onglet Catalogue ── */}
          {activeTab === 'catalog' && (
            <>
              {/* Migration manquante */}
              {migrationMissing && (
                <div className="catmeta-migration-warning">
                  <strong>⚠ Migration SQL requise</strong>
                  <p>
                    Les tables <code>catalog_brands</code> et <code>catalog_categories</code> n'existent pas encore.
                    Exécutez le fichier <code>supabase/migrations/006_catalog_meta.sql</code> dans l'éditeur SQL
                    de Supabase, puis rechargez cette page.
                  </p>
                  <button onClick={() => void loadCatalog(true)}>Réessayer</button>
                </div>
              )}

              {!migrationMissing && (
                <div className="catmeta-layout">

                  {/* Colonne Marques */}
                  <div className="catmeta-col">
                    <div className="catmeta-col-header">
                      <h3 className="catmeta-col-title">Marques</h3>
                      <button
                        className="catmeta-import-btn"
                        onClick={() => void handleImportFromProducts()}
                        disabled={importing || loadingCatalog}
                        title="Importer toutes les marques déjà utilisées dans les produits"
                      >
                        {importing ? '…' : '↻ Sync depuis produits'}
                      </button>
                    </div>
                    {catalogErr && <div className="auth-error" style={{ marginBottom: 8 }}>{catalogErr}</div>}
                    {loadingCatalog
                      ? <div className="auth-loading-inline">Chargement…</div>
                      : (
                        <div className="catmeta-list">
                          {brands.map(b => (
                            <BrandRow
                              key={b.id}
                              brand={b}
                              onSave={handleSaveBrand}
                              onDelete={handleDeleteBrand}
                            />
                          ))}
                          {brands.length === 0 && (
                            <div className="catmeta-empty">
                              Aucune marque définie.<br />
                              <button
                                className="catmeta-import-link"
                                onClick={() => void handleImportFromProducts()}
                                disabled={importing}
                              >
                                Importer depuis les produits existants
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    }
                    <div className="catmeta-add-row">
                      <input
                        className="catmeta-input"
                        placeholder="Nouvelle marque…"
                        value={newBrand}
                        onChange={e => setNewBrand(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && void handleAddBrand()}
                      />
                      <button
                        className="primary"
                        onClick={() => void handleAddBrand()}
                        disabled={addingBrand || !newBrand.trim()}
                      >
                        Ajouter
                      </button>
                    </div>
                  </div>

                  {/* Colonne Catégories */}
                  <div className="catmeta-col">
                    <div className="catmeta-col-header">
                      <h3 className="catmeta-col-title">Catégories</h3>
                    </div>
                    {loadingCatalog
                      ? null
                      : (
                        <div className="catmeta-list">
                          {categories.map(c => (
                            <CategoryRow
                              key={c.id}
                              category={c}
                              onSave={handleSaveCat}
                              onDelete={handleDeleteCat}
                            />
                          ))}
                          {categories.length === 0 && (
                            <div className="catmeta-empty">Aucune catégorie définie</div>
                          )}
                        </div>
                      )
                    }
                    <div className="catmeta-add-row">
                      <input
                        type="color"
                        value={newCatColor}
                        onChange={e => setNewCatColor(e.target.value)}
                        className="catmeta-color-input"
                        title="Couleur de la catégorie"
                      />
                      <input
                        className="catmeta-input"
                        placeholder="Nouvelle catégorie…"
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && void handleAddCat()}
                      />
                      <button
                        className="primary"
                        onClick={() => void handleAddCat()}
                        disabled={addingCat || !newCatName.trim()}
                      >
                        Ajouter
                      </button>
                    </div>
                  </div>

                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}

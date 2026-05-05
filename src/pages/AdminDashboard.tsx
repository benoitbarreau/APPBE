import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { UserTable } from '../components/auth/UserTable'
import type { Profile, UserStatus, UserRole } from '../auth/AuthContext'
import {
  fetchBrands, createBrand, updateBrand, deleteBrand,
  fetchCategories, createCategory, updateCategory, deleteCategory,
} from '../lib/catalogMetaApi'
import type { CatalogBrand, CatalogCategory } from '../lib/catalogMetaApi'
import { useCatalogMeta } from '../store'

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
  const [activeTab, setActiveTab] = useState<AdminTab>('users')

  // ── Utilisateurs ──
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')

  useEffect(() => {
    setLoadingUsers(true)
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
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

  // Nouvelle marque
  const [newBrand, setNewBrand] = useState('')
  const [addingBrand, setAddingBrand] = useState(false)

  // Nouvelle catégorie
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('#3B82F6')
  const [addingCat, setAddingCat] = useState(false)

  const loadCatalog = async () => {
    setLoadingCatalog(true)
    setCatalogErr(null)
    try {
      const [b, c] = await Promise.all([fetchBrands(), fetchCategories()])
      setBrands(b)
      setCategories(c)
      setCatalogMeta(b, c)
    } catch (e) {
      setCatalogErr(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoadingCatalog(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'catalog') void loadCatalog()
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
                    onUpdateStatus={updateStatus}
                    onUpdateRole={updateRole}
                  />
              }
            </>
          )}

          {/* ── Onglet Catalogue ── */}
          {activeTab === 'catalog' && (
            <div className="catmeta-layout">

              {/* Colonne Marques */}
              <div className="catmeta-col">
                <h3 className="catmeta-col-title">Marques</h3>
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
                        <div className="catmeta-empty">Aucune marque définie</div>
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
                <h3 className="catmeta-col-title">Catégories</h3>
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
        </div>

        <div className="modal-footer">
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}

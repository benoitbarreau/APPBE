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
import type { InviteMethod } from '../lib/inviteApi'
import { inviteUser, generatePassword } from '../lib/inviteApi'
import { useAppStore, useCatalogMeta } from '../store'
import { BUILTIN_CATALOG } from '../catalog'
import {
  fetchArchivedUserProducts,
  restoreUserProduct,
  deleteUserProduct,
} from '../lib/userProductsApi'

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

// ── Panneau Invitations ───────────────────────────────────────────────────

function InvitationsPanel() {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [method, setMethod] = useState<InviteMethod>('invite')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    email: string
    role: 'user' | 'admin'
    method: InviteMethod
    password?: string
  } | null>(null)

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)
    try {
      await inviteUser({
        email: email.trim(),
        role,
        fullName: fullName.trim() || undefined,
        method,
        password: method === 'password' ? password : undefined,
      })
      setSuccess({ email: email.trim(), role, method, password: method === 'password' ? password : undefined })
      setEmail('')
      setFullName('')
      setRole('user')
      setMethod('invite')
      setPassword('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="invite-success-card">
        <div className="invite-success-icon">✓</div>
        <h3 className="invite-success-title">Compte créé avec succès</h3>
        <div className="invite-success-details">
          <div className="form-row">
            <label>Email</label>
            <span>{success.email}</span>
          </div>
          <div className="form-row">
            <label>Rôle</label>
            <span>{success.role === 'admin' ? 'Administrateur' : 'Utilisateur'}</span>
          </div>
          {success.method === 'invite' ? (
            <div className="form-row">
              <label>Invitation</label>
              <span>Email d'invitation envoyé — l'utilisateur devra cliquer sur le lien pour définir son mot de passe.</span>
            </div>
          ) : (
            <div className="form-row invite-success-pwd-row">
              <label>Mot de passe provisoire</label>
              <code className="invite-success-pwd">{success.password}</code>
            </div>
          )}
        </div>
        <button className="primary" onClick={() => setSuccess(null)}>
          + Créer un autre compte
        </button>
      </div>
    )
  }

  const canSubmit = email.trim() !== '' && (method === 'invite' || password.length >= 6)

  return (
    <div className="invite-form">
      <p className="account-hint">
        Créez un compte directement sans passer par le formulaire d'inscription.
        L'utilisateur sera automatiquement approuvé et visible dans l'onglet Utilisateurs.
      </p>

      {/* Email */}
      <div className="invite-field">
        <label className="invite-label">
          Email <span className="invite-required">*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoFocus
          placeholder="utilisateur@exemple.fr"
          className="invite-input"
        />
      </div>

      {/* Nom complet */}
      <div className="invite-field">
        <label className="invite-label">
          Nom complet <span className="invite-optional">(facultatif)</span>
        </label>
        <input
          type="text"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          placeholder="Prénom Nom"
          className="invite-input"
        />
      </div>

      {/* Rôle */}
      <div className="invite-field">
        <label className="invite-label">
          Rôle <span className="invite-required">*</span>
        </label>
        <div className="invite-radio-group">
          <label className={`invite-radio-card${role === 'user' ? ' selected' : ''}`}>
            <input type="radio" name="role" value="user" checked={role === 'user'} onChange={() => setRole('user')} />
            <span className="invite-radio-title">Utilisateur</span>
            <span className="invite-radio-desc">Accès standard à ses propres projets</span>
          </label>
          <label className={`invite-radio-card${role === 'admin' ? ' selected' : ''}`}>
            <input type="radio" name="role" value="admin" checked={role === 'admin'} onChange={() => setRole('admin')} />
            <span className="invite-radio-title">Administrateur</span>
            <span className="invite-radio-desc">Accès complet au tableau de bord admin</span>
          </label>
        </div>
      </div>

      {/* Méthode */}
      <div className="invite-field">
        <label className="invite-label">
          Méthode <span className="invite-required">*</span>
        </label>
        <div className="invite-radio-group">
          <label className={`invite-radio-card${method === 'invite' ? ' selected' : ''}`}>
            <input type="radio" name="method" value="invite" checked={method === 'invite'} onChange={() => setMethod('invite')} />
            <span className="invite-radio-title">📧 Email d'invitation</span>
            <span className="invite-radio-desc">L'utilisateur reçoit un lien pour créer son mot de passe</span>
          </label>
          <label className={`invite-radio-card${method === 'password' ? ' selected' : ''}`}>
            <input type="radio" name="method" value="password" checked={method === 'password'} onChange={() => setMethod('password')} />
            <span className="invite-radio-title">🔑 Mot de passe provisoire</span>
            <span className="invite-radio-desc">Accès immédiat — l'utilisateur change son MDP depuis son profil</span>
          </label>
        </div>
      </div>

      {/* Mot de passe provisoire */}
      {method === 'password' && (
        <div className="invite-field">
          <label className="invite-label">
            Mot de passe provisoire <span className="invite-required">*</span>
          </label>
          <div className="invite-pwd-row">
            <input
              type="text"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimum 6 caractères"
              className="invite-input invite-pwd-input"
              minLength={6}
              autoComplete="off"
            />
            <button
              type="button"
              className="invite-generate-btn"
              onClick={() => setPassword(generatePassword())}
            >
              Générer
            </button>
          </div>
          <p className="account-hint" style={{ marginTop: 4, marginBottom: 0 }}>
            Communiquez ce mot de passe à l'utilisateur par un canal sécurisé.
          </p>
        </div>
      )}

      {error && <div className="auth-error">{error}</div>}

      <button
        className="primary"
        style={{ marginTop: 8 }}
        disabled={loading || !canSubmit}
        onClick={() => void handleSubmit()}
      >
        {loading ? 'Création en cours…' : 'Créer le compte'}
      </button>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────

type AdminTab = 'users' | 'catalog' | 'archives' | 'invitations'

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

  const deleteUser = async (id: string) => {
    await supabase.rpc('admin_delete_user', { target_user_id: id })
    setProfiles(prev => prev.filter(p => p.id !== id))
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

  // ── Archives produits ──
  const archivedProducts = useAppStore(s => s.archivedProducts)
  const archivedProductsMeta = useAppStore(s => s.archivedProductsMeta)
  const setArchivedProducts = useAppStore(s => s.setArchivedProducts)
  const restoreProductLocal = useAppStore(s => s.restoreProductLocal)
  const hardDeleteArchivedLocal = useAppStore(s => s.hardDeleteArchivedLocal)
  const [loadingArchives, setLoadingArchives] = useState(false)
  const [archivesErr, setArchivesErr] = useState<string | null>(null)
  const [hardDeleting, setHardDeleting] = useState<string | null>(null)

  const loadArchives = async () => {
    setLoadingArchives(true)
    setArchivesErr(null)
    try {
      const rows = await fetchArchivedUserProducts()
      setArchivedProducts(rows)
    } catch (e) {
      setArchivesErr(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoadingArchives(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'archives') void loadArchives()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestore = async (productId: string) => {
    try {
      await restoreUserProduct(productId)
      restoreProductLocal(productId)
    } catch (e) {
      alert('Erreur lors de la restauration : ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const handleHardDelete = async (productId: string) => {
    try {
      await deleteUserProduct(productId)
      hardDeleteArchivedLocal(productId)
      setHardDeleting(null)
    } catch (e) {
      alert('Erreur lors de la suppression : ' + (e instanceof Error ? e.message : String(e)))
    }
  }

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
            <button
              className={`admin-tab${activeTab === 'archives' ? ' active' : ''}`}
              onClick={() => setActiveTab('archives')}
            >
              Archives produits
            </button>
            <button
              className={`admin-tab${activeTab === 'invitations' ? ' active' : ''}`}
              onClick={() => setActiveTab('invitations')}
            >
              Invitations
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
                    onDeleteUser={deleteUser}
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

          {/* ── Onglet Archives produits ── */}
          {activeTab === 'archives' && (
            <div className="archives-panel">
              <div className="archives-header">
                <h3 className="archives-title">Fiches archivées du catalogue commun</h3>
                <button onClick={() => void loadArchives()} disabled={loadingArchives}>
                  ↻ Recharger
                </button>
              </div>
              {archivesErr && (
                <div className="auth-error" style={{ marginBottom: 8 }}>{archivesErr}</div>
              )}
              {loadingArchives ? (
                <div className="auth-loading-inline">Chargement…</div>
              ) : archivedProducts.length === 0 ? (
                <div className="catmeta-empty">
                  Aucune fiche archivée.
                </div>
              ) : (
                <table className="archives-table">
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Marque</th>
                      <th>Catégorie</th>
                      <th>Créé par</th>
                      <th>Archivé le</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedProducts.map(p => {
                      const meta = archivedProductsMeta[p.id]
                      const archivedDate = meta?.archivedAt
                        ? new Date(meta.archivedAt).toLocaleDateString('fr-FR')
                        : '—'
                      const isConfirming = hardDeleting === p.id
                      return (
                        <tr key={p.id}>
                          <td>{p.reference}</td>
                          <td>{p.manufacturer}</td>
                          <td>{p.category}</td>
                          <td>{meta?.creatorName ?? '—'}</td>
                          <td>{archivedDate}</td>
                          <td className="archives-actions">
                            <button
                              className="primary"
                              onClick={() => void handleRestore(p.id)}
                              title="Restaurer dans le catalogue commun"
                            >
                              ↻ Restaurer
                            </button>
                            {isConfirming ? (
                              <>
                                <button onClick={() => setHardDeleting(null)}>Annuler</button>
                                <button
                                  className="danger danger-confirm"
                                  onClick={() => void handleHardDelete(p.id)}
                                  title="Suppression définitive"
                                >
                                  Confirmer
                                </button>
                              </>
                            ) : (
                              <button
                                className="danger"
                                onClick={() => setHardDeleting(p.id)}
                                title="Supprimer définitivement"
                              >
                                🗑 Supprimer
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {/* ── Onglet Invitations ── */}
          {activeTab === 'invitations' && (
            <div style={{ padding: '12px 16px' }}>
              <InvitationsPanel />
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

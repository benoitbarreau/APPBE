import { useEffect, useState, useCallback } from 'react'
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
import { UserEditModal } from '../components/auth/UserEditModal'
import { useAppStore, useCatalogMeta } from '../store'
import { BUILTIN_CATALOG } from '../catalog'
import {
  fetchArchivedUserProducts,
  restoreUserProduct,
  deleteUserProduct,
} from '../lib/userProductsApi'
import { confirmDialog, notify } from '../components/dialogs/dialogStore'
import type { FilterStatus, AdminLog } from './admin/types'
import { FILTER_LABELS, ACTION_LABELS, ACTION_ICONS } from './admin/constants'
import { BrandRow } from './admin/BrandRow'
import { CategoryRow } from './admin/CategoryRow'
import { InvitationsPanel } from './admin/InvitationsPanel'

// ── Composant principal ───────────────────────────────────────────────────

type AdminTab = 'users' | 'invitations' | 'catalog' | 'archives' | 'logs'

export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const { profile: currentProfile } = useAuth()
  const [activeTab, setActiveTab] = useState<AdminTab>('users')

  // ── Logging ──────────────────────────────────────────────────────────────
  const logAction = useCallback(async (
    action: string,
    targetId?: string,
    targetLabel?: string,
    details?: Record<string, unknown>,
  ) => {
    try {
      await supabase.from('admin_logs').insert({
        admin_id: currentProfile?.id ?? null,
        action,
        target_id: targetId ?? null,
        target_label: targetLabel ?? null,
        details: details ?? {},
      })
    } catch {
      // Erreur de log non bloquante
    }
  }, [currentProfile?.id])

  // ── Stats globaux ─────────────────────────────────────────────────────────
  const [projectsCount, setProjectsCount] = useState<number | null>(null)
  const [clientsCount, setClientsCount]   = useState<number | null>(null)

  useEffect(() => {
    void Promise.all([
      supabase.from('projects').select('*', { count: 'exact', head: true }),
      supabase.from('clients').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    ]).then(([proj, cli]) => {
      setProjectsCount(proj.count ?? 0)
      setClientsCount(cli.count ?? 0)
    })
  }, [])

  // ── Utilisateurs ─────────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)

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
    const target = profiles.find(p => p.id === id)
    await supabase.from('profiles').update({ status }).eq('id', id)
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, status } : p))
    void logAction(
      status === 'approved' ? 'approve_user' : 'reject_user',
      id,
      target?.full_name ?? target?.email ?? id,
    )
  }

  const updateRole = async (id: string, role: UserRole) => {
    await supabase.from('profiles').update({ role }).eq('id', id)
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, role } : p))
  }

  const deleteUser = async (id: string) => {
    const target = profiles.find(p => p.id === id)
    await supabase.rpc('admin_delete_user', { target_user_id: id })
    setProfiles(prev => prev.filter(p => p.id !== id))
    void logAction('delete_user', id, target?.full_name ?? target?.email ?? id)
  }

  const handleUserSaved = (updated: Profile) => {
    setProfiles(prev => prev.map(p => p.id === updated.id ? updated : p))
    void logAction('update_user', updated.id, updated.full_name ?? updated.email ?? updated.id)
  }

  const pendingUsers  = profiles.filter(p => p.status === 'pending')
  const pendingCount  = pendingUsers.length
  const filtered      = filterStatus === 'all' ? profiles : profiles.filter(p => p.status === filterStatus)
  const filters: FilterStatus[] = ['all', 'pending', 'approved', 'rejected']

  // ── Catalogue ─────────────────────────────────────────────────────────────
  const setCatalogMeta = useCatalogMeta(s => s.setCatalogMeta)
  const [brands, setBrands]         = useState<CatalogBrand[]>([])
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [catalogErr, setCatalogErr]         = useState<string | null>(null)
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [importing, setImporting]               = useState(false)

  const [newBrand, setNewBrand]     = useState('')
  const [addingBrand, setAddingBrand] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('#3B82F6')
  const [addingCat, setAddingCat]   = useState(false)

  const loadCatalog = async (autoImport = false) => {
    setLoadingCatalog(true)
    setCatalogErr(null)
    setMigrationMissing(false)
    try {
      const [b, c] = await Promise.all([fetchBrands(), fetchCategories()])
      if (autoImport && b.length === 0 && c.length === 0) {
        await importMetaFromProducts()
        const builtinBrands = [...new Set(BUILTIN_CATALOG.map(p => p.manufacturer?.trim() ?? '').filter(Boolean))]
        const builtinCategories = [...new Set(BUILTIN_CATALOG.map(p => p.category?.trim() ?? '').filter(Boolean))]
        for (const name of builtinBrands) { try { await createBrand(name) } catch { /* doublon ignoré */ } }
        for (const name of builtinCategories) { try { await createCategory(name, '#6c7480') } catch { /* doublon ignoré */ } }
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
      const fromCloud = await importMetaFromProducts()
      const builtinBrands = [...new Set(BUILTIN_CATALOG.map(p => p.manufacturer?.trim() ?? '').filter(Boolean))]
      const builtinCategories = [...new Set(BUILTIN_CATALOG.map(p => p.category?.trim() ?? '').filter(Boolean))]
      const existingBrandNames = new Set([...brands.map(b => b.name), ...fromCloud.brands.map(b => b.name)])
      const missingBrands = builtinBrands.filter(n => !existingBrandNames.has(n))
      for (const name of missingBrands) { try { await createBrand(name) } catch { /* doublon ignoré */ } }
      const existingCatNames = new Set([...categories.map(c => c.name), ...fromCloud.categories.map(c => c.name)])
      const missingCats = builtinCategories.filter(n => !existingCatNames.has(n))
      for (const name of missingCats) { try { await createCategory(name, '#6c7480') } catch { /* doublon ignoré */ } }
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
    const brand = brands.find(b => b.id === id)
    const ok = await confirmDialog({
      title: `Supprimer la marque « ${brand?.name ?? '?'} » ?`,
      message: 'Les produits existants ne seront pas modifiés — seule la marque disparaît du référentiel.',
      confirmLabel: '🗑 Supprimer',
      danger: true,
    })
    if (!ok) return
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
    const cat = categories.find(c => c.id === id)
    const ok = await confirmDialog({
      title: `Supprimer la catégorie « ${cat?.name ?? '?'} » ?`,
      message: 'Les produits existants ne seront pas modifiés — seule la catégorie (et sa couleur) disparaît du référentiel.',
      confirmLabel: '🗑 Supprimer',
      danger: true,
    })
    if (!ok) return
    await deleteCategory(id)
    const next = categories.filter(c => c.id !== id)
    setCategories(next)
    setCatalogMeta(brands, next)
  }

  // ── Archives produits ─────────────────────────────────────────────────────
  const archivedProducts     = useAppStore(s => s.archivedProducts)
  const archivedProductsMeta = useAppStore(s => s.archivedProductsMeta)
  const setArchivedProducts  = useAppStore(s => s.setArchivedProducts)
  const restoreProductLocal  = useAppStore(s => s.restoreProductLocal)
  const hardDeleteArchivedLocal = useAppStore(s => s.hardDeleteArchivedLocal)
  const [loadingArchives, setLoadingArchives] = useState(false)
  const [archivesErr, setArchivesErr]         = useState<string | null>(null)
  const [hardDeleting, setHardDeleting]       = useState<string | null>(null)

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
    const p = archivedProducts.find(x => x.id === productId)
    try {
      await restoreUserProduct(productId)
      restoreProductLocal(productId)
      void logAction('restore_product', productId, p?.reference ?? productId)
      notify(`Fiche « ${p?.reference ?? productId} » restaurée dans le catalogue commun.`, 'success')
    } catch (e) {
      notify('Erreur lors de la restauration : ' + (e instanceof Error ? e.message : String(e)), 'error')
    }
  }

  const handleHardDelete = async (productId: string) => {
    const p = archivedProducts.find(x => x.id === productId)
    try {
      await deleteUserProduct(productId)
      hardDeleteArchivedLocal(productId)
      setHardDeleting(null)
      void logAction('delete_product', productId, p?.reference ?? productId)
    } catch (e) {
      notify('Erreur lors de la suppression : ' + (e instanceof Error ? e.message : String(e)), 'error')
    }
  }

  // ── Journal d'activité ────────────────────────────────────────────────────
  const [logs, setLogs]           = useState<AdminLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  const loadLogs = async () => {
    setLoadingLogs(true)
    try {
      const { data } = await supabase
        .from('admin_logs')
        .select('*, admin:profiles!admin_logs_admin_id_fkey(full_name, email)')
        .order('created_at', { ascending: false })
        .limit(200)
      setLogs((data ?? []) as AdminLog[])
    } catch (e) {
      console.error('Erreur chargement logs:', e)
    } finally {
      setLoadingLogs(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'logs') void loadLogs()
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="modal-backdrop">
      <div className="modal admin-dashboard-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header avec titre + onglets ── */}
        <div className="modal-header admin-dashboard-modal-header">
          <div className="admin-dashboard-header-top">
            <h2 className="admin-dashboard-title">Tableau de bord</h2>
            <button onClick={onClose} title="Fermer">✕</button>
          </div>
          <div className="admin-tabs">
            <button
              className={`admin-tab${activeTab === 'users' ? ' active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              👥 Utilisateurs
              {pendingCount > 0 && <span className="admin-tab-badge">{pendingCount}</span>}
            </button>
            <button
              className={`admin-tab${activeTab === 'invitations' ? ' active' : ''}`}
              onClick={() => setActiveTab('invitations')}
            >
              ✉️ Invitations
            </button>
            <button
              className={`admin-tab${activeTab === 'catalog' ? ' active' : ''}`}
              onClick={() => setActiveTab('catalog')}
            >
              📦 Catalogue
            </button>
            <button
              className={`admin-tab${activeTab === 'archives' ? ' active' : ''}`}
              onClick={() => setActiveTab('archives')}
            >
              🗄️ Archives
            </button>
            <button
              className={`admin-tab${activeTab === 'logs' ? ' active' : ''}`}
              onClick={() => setActiveTab('logs')}
            >
              📋 Journal
            </button>
          </div>
        </div>

        {/* ── Barre de stats KPI ── */}
        <div className="admin-stats-bar">
          <div className="admin-stat-card">
            <span className="admin-stat-value">{profiles.length}</span>
            <span className="admin-stat-label">Utilisateurs</span>
          </div>
          {pendingCount > 0 && (
            <div className="admin-stat-card admin-stat-card--alert">
              <span className="admin-stat-value">{pendingCount}</span>
              <span className="admin-stat-label">En attente</span>
            </div>
          )}
          <div className="admin-stat-card">
            <span className="admin-stat-value">{projectsCount ?? '—'}</span>
            <span className="admin-stat-label">Projets</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-value">{clientsCount ?? '—'}</span>
            <span className="admin-stat-label">Clients</span>
          </div>
        </div>

        {/* ── Contenu ── */}
        <div className="admin-dashboard-body">

          {/* ── Onglet Utilisateurs ── */}
          {activeTab === 'users' && (
            <>
              {/* Section "À traiter" */}
              {!loadingUsers && pendingCount > 0 && (
                <div className="admin-pending-section">
                  <div className="admin-pending-header">
                    <span className="admin-pending-title">⏳ À traiter — {pendingCount} inscription{pendingCount > 1 ? 's' : ''} en attente</span>
                  </div>
                  <div className="admin-pending-list">
                    {pendingUsers.map(p => (
                      <div key={p.id} className="admin-pending-row">
                        <div className="admin-pending-user">
                          <span className="admin-pending-name">{p.full_name || '—'}</span>
                          <span className="admin-pending-email">{p.email}</span>
                        </div>
                        <div className="admin-pending-actions">
                          <button
                            className="primary admin-pending-btn"
                            onClick={() => void updateStatus(p.id, 'approved')}
                          >
                            ✓ Approuver
                          </button>
                          <button
                            className="danger admin-pending-btn"
                            onClick={() => void updateStatus(p.id, 'rejected')}
                          >
                            ✕ Refuser
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                    onEditUser={setEditingProfile}
                  />
              }
            </>
          )}

          {/* ── Onglet Invitations ── */}
          {activeTab === 'invitations' && (
            <div style={{ padding: '12px 16px' }}>
              <InvitationsPanel
                onSuccess={(email, role) => {
                  void logAction('invite_user', undefined, email, { role })
                }}
              />
            </div>
          )}

          {/* ── Onglet Catalogue ── */}
          {activeTab === 'catalog' && (
            <>
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

          {/* ── Onglet Journal d'activité ── */}
          {activeTab === 'logs' && (
            <div className="admin-logs-panel">
              <div className="admin-logs-header">
                <h3 className="admin-logs-title">Journal d'activité</h3>
                <button onClick={() => void loadLogs()} disabled={loadingLogs}>
                  ↻ Recharger
                </button>
              </div>
              {loadingLogs ? (
                <div className="auth-loading-inline">Chargement…</div>
              ) : logs.length === 0 ? (
                <div className="catmeta-empty">
                  Aucune activité enregistrée pour l'instant.<br />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Les actions admin (approbation, invitation, suppression…) apparaîtront ici.
                  </span>
                </div>
              ) : (
                <div className="admin-logs-list">
                  {logs.map(log => {
                    const icon     = ACTION_ICONS[log.action] ?? '•'
                    const label    = ACTION_LABELS[log.action] ?? log.action
                    const adminName = log.admin?.full_name ?? log.admin?.email ?? 'Admin'
                    const date     = new Date(log.created_at)
                    const dateStr  = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                    const timeStr  = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <div key={log.id} className={`admin-log-entry admin-log-entry--${log.action.replace('_', '-')}`}>
                        <span className="admin-log-icon">{icon}</span>
                        <div className="admin-log-content">
                          <span className="admin-log-label">{label}</span>
                          {log.target_label && (
                            <span className="admin-log-target">— {log.target_label}</span>
                          )}
                          <span className="admin-log-by">par {adminName}</span>
                        </div>
                        <div className="admin-log-time">
                          <span>{dateStr}</span>
                          <span className="admin-log-hour">{timeStr}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        <div className="modal-footer">
          <button onClick={onClose}>Fermer</button>
        </div>
      </div>

      {/* ── Modal d'édition utilisateur ── */}
      {editingProfile && (
        <UserEditModal
          profile={editingProfile}
          isSelf={editingProfile.id === currentProfile?.id}
          onClose={() => setEditingProfile(null)}
          onSaved={handleUserSaved}
        />
      )}
    </div>
  )
}

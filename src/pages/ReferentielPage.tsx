import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  listClients, createClient, updateClient, deleteClient,
  listSites, createSite, updateSite, deleteSite,
  listRooms, createRoom, updateRoom,
  softDeleteClient, restoreClient, listDeletedClients,
  listApprovedProfiles, assignClientManager,
  type Client, type Site, type Room,
} from '../lib/referentielApi'
import { AdminSettings } from '../components/AdminSettings'
import { confirmDialog } from '../components/dialogs/dialogStore'
import { Modal } from './referentiel/Modal'
import { ClientForm } from './referentiel/ClientForm'
import { SiteForm } from './referentiel/SiteForm'
import { RoomForm } from './referentiel/RoomForm'
import { ContactsSection } from './referentiel/ContactsSection'
import { RoomPanel } from './referentiel/RoomPanel'
import { profileDisplayName, profileInitials } from './referentiel/helpers'
import type { ApprovedProfile } from './referentiel/types'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

interface Props {
  onOpenProjects: () => void
  onOpenAdminDashboard?: () => void
  onNewProjectFromRoom?: (roomId: string, roomName: string, siteName: string, clientName: string) => void
  onOpenProject?: (projectId: string, projectName: string) => void
  onOpenCatalogue?: () => void
  onGoHome?: () => void
  /** Si fourni, ouvre automatiquement la fiche de ce client à l'initialisation. */
  initialClientId?: string | null
}

// ── Page principale ────────────────────────────────────────────────────────

export function ReferentielPage({ onOpenProjects, onOpenAdminDashboard, onNewProjectFromRoom, onOpenProject, onOpenCatalogue, onGoHome, initialClientId }: Props) {
  const { user, profile, signOut } = useAuth()

  // ── Navigation interne ──
  const [view, setView] = useState<'clients' | 'client' | 'deleted'>('clients')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [selectedRoomSite, setSelectedRoomSite] = useState<Site | null>(null)

  // ── Données ──
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [sitesMap, setSitesMap] = useState<Record<string, Site[]>>({})
  const [roomsMap, setRoomsMap] = useState<Record<string, Room[]>>({})
  const [sitesLoading, setSitesLoading] = useState(false)

  // ── UI / erreur ──
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)

  // ── Modaux ──
  const [clientModal, setClientModal] = useState<'create' | Client | null>(null)
  const [siteModal, setSiteModal] = useState<'create' | Site | null>(null)
  const [roomModal, setRoomModal] = useState<{ mode: 'create'; siteId: string } | { mode: 'edit'; room: Room } | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Clients supprimés (admin) ──
  const [deletedClients, setDeletedClients] = useState<Client[]>([])
  const [deletedLoading, setDeletedLoading] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deletingClient, setDeletingClient] = useState(false)

  const loadDeletedClients = () => {
    setDeletedLoading(true)
    listDeletedClients()
      .then(setDeletedClients)
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur chargement clients supprimés'))
      .finally(() => setDeletedLoading(false))
  }

  const handleSoftDeleteClient = async () => {
    if (!selectedClient) return
    setDeletingClient(true)
    try {
      await softDeleteClient(selectedClient.id)
      setClients(prev => prev.filter(c => c.id !== selectedClient.id))
      // Invalider le cache des supprimés pour forcer un rechargement
      setDeletedClients([])
      setConfirmDeleteOpen(false)
      backToClients()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur suppression client')
    } finally {
      setDeletingClient(false)
    }
  }

  const handleRestoreClient = async (client: Client) => {
    try {
      await restoreClient(client.id)
      setDeletedClients(prev => prev.filter(c => c.id !== client.id))
      loadClients()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur restauration client')
    }
  }

  const handlePermanentDeleteClient = async (client: Client) => {
    const ok = await confirmDialog({
      title: `Supprimer définitivement « ${client.name} » ?`,
      message: 'Toutes ses données (sites, salles, contacts, documents) seront supprimées.\nCette action est irréversible.',
      confirmLabel: '🗑 Supprimer définitivement',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteClient(client.id)
      setDeletedClients(prev => prev.filter(c => c.id !== client.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur suppression définitive')
    }
  }

  // ── Gestionnaire de compte ──
  const [managerModalOpen, setManagerModalOpen] = useState(false)
  const [approvedProfiles, setApprovedProfiles] = useState<ApprovedProfile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(false)
  const [assigningManager, setAssigningManager] = useState(false)

  // ── Chargement clients ──
  const loadClients = () => {
    setClientsLoading(true)
    listClients()
      .then(setClients)
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur chargement clients'))
      .finally(() => setClientsLoading(false))
  }

  useEffect(() => { loadClients() }, [])

  // ── Ouverture automatique d'un client via initialClientId ──
  const hasOpenedInitClient = useRef(false)
  useEffect(() => {
    if (!initialClientId || hasOpenedInitClient.current) return
    if (clients.length === 0) return
    const client = clients.find(c => c.id === initialClientId)
    if (client) {
      hasOpenedInitClient.current = true
      void openClient(client)
    }
  }, [initialClientId, clients]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drill-down vers un client ──
  const openClient = async (client: Client) => {
    setSelectedClient(client)
    setView('client')
    if (!sitesMap[client.id]) {
      setSitesLoading(true)
      try {
        const sites = await listSites(client.id)
        setSitesMap(prev => ({ ...prev, [client.id]: sites }))
        const roomPromises = sites.map(s => listRooms(s.id).then(rooms => ({ siteId: s.id, rooms })))
        const results = await Promise.all(roomPromises)
        const newRoomsMap: Record<string, Room[]> = {}
        for (const r of results) newRoomsMap[r.siteId] = r.rooms
        setRoomsMap(prev => ({ ...prev, ...newRoomsMap }))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur chargement sites')
      } finally {
        setSitesLoading(false)
      }
    }
  }

  const backToClients = () => {
    setView('clients')
    setSelectedClient(null)
  }

  // ── CRUD Clients ──
  const handleCreateClient = async (data: Parameters<typeof createClient>[0]) => {
    setSaving(true)
    try {
      const c = await createClient(data)
      setClients(prev => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))
      setClientModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création client')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateClient = async (data: Parameters<typeof createClient>[0]) => {
    if (!clientModal || clientModal === 'create') return
    setSaving(true)
    try {
      await updateClient(clientModal.id, data)
      const updated = { ...clientModal, ...data }
      setClients(prev => prev.map(c => c.id === updated.id ? updated as Client : c).sort((a, b) => a.name.localeCompare(b.name)))
      if (selectedClient?.id === updated.id) setSelectedClient(updated as Client)
      setClientModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur modification client')
    } finally {
      setSaving(false)
    }
  }


  // ── CRUD Sites ──
  const handleCreateSite = async (data: Omit<Site, 'id' | 'client_id' | 'created_at' | 'updated_at'>) => {
    if (!selectedClient) return
    setSaving(true)
    try {
      const s = await createSite({ ...data, client_id: selectedClient.id })
      setSitesMap(prev => ({
        ...prev,
        [selectedClient.id]: [...(prev[selectedClient.id] ?? []), s].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      setRoomsMap(prev => ({ ...prev, [s.id]: [] }))
      setSiteModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création site')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateSite = async (data: Omit<Site, 'id' | 'client_id' | 'created_at' | 'updated_at'>) => {
    if (!siteModal || siteModal === 'create' || !selectedClient) return
    setSaving(true)
    try {
      await updateSite(siteModal.id, data)
      const updated = { ...siteModal, ...data }
      setSitesMap(prev => ({
        ...prev,
        [selectedClient.id]: (prev[selectedClient.id] ?? [])
          .map(s => s.id === updated.id ? updated as Site : s)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      setSiteModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur modification site')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSite = async (site: Site) => {
    if (!selectedClient) return
    const ok = await confirmDialog({
      title: `Supprimer le site « ${site.name} » ?`,
      message: 'Toutes ses salles et leurs documents seront supprimés.',
      confirmLabel: '🗑 Supprimer',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteSite(site.id)
      setSitesMap(prev => ({
        ...prev,
        [selectedClient.id]: (prev[selectedClient.id] ?? []).filter(s => s.id !== site.id),
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur suppression site')
    }
  }

  // ── CRUD Rooms ──
  const handleCreateRoom = async (data: Omit<Room, 'id' | 'site_id' | 'created_at' | 'updated_at'>) => {
    if (!roomModal || roomModal.mode !== 'create') return
    setSaving(true)
    try {
      const r = await createRoom({ ...data, site_id: roomModal.siteId })
      setRoomsMap(prev => ({
        ...prev,
        [roomModal.siteId]: [...(prev[roomModal.siteId] ?? []), r].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      setRoomModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création salle')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateRoom = async (data: Omit<Room, 'id' | 'site_id' | 'created_at' | 'updated_at'>) => {
    if (!roomModal || roomModal.mode !== 'edit') return
    setSaving(true)
    try {
      await updateRoom(roomModal.room.id, data)
      const updated = { ...roomModal.room, ...data }
      setRoomsMap(prev => ({
        ...prev,
        [roomModal.room.site_id]: (prev[roomModal.room.site_id] ?? [])
          .map(r => r.id === updated.id ? updated as Room : r)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      setRoomModal(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur modification salle')
    } finally {
      setSaving(false)
    }
  }

  // ── Gestionnaire de compte ──
  const canAssignManager =
    profile?.role === 'admin' ||
    (!!user && !!selectedClient && user.id === selectedClient.account_manager_id)

  const handleAssignManager = async (profileId: string | null) => {
    if (!selectedClient) return
    setAssigningManager(true)
    try {
      await assignClientManager(selectedClient.id, profileId)
      const newManager = profileId
        ? (approvedProfiles.find(p => p.id === profileId) ?? null)
        : null
      const updated: Client = {
        ...selectedClient,
        account_manager_id: profileId,
        account_manager: newManager,
      }
      setSelectedClient(updated)
      setClients(prev => prev.map(c => c.id === updated.id ? updated : c))
      setManagerModalOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur assignation gestionnaire')
    } finally {
      setAssigningManager(false)
    }
  }

  const openManagerModal = () => {
    setManagerModalOpen(true)
    if (approvedProfiles.length === 0) {
      setProfilesLoading(true)
      listApprovedProfiles()
        .then(setApprovedProfiles)
        .catch(() => setError('Impossible de charger la liste des utilisateurs'))
        .finally(() => setProfilesLoading(false))
    }
  }

  // ── Filtrage ──
  const filteredClients = clients.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || (c.code ?? '').toLowerCase().includes(q)
  })

  const sites = selectedClient ? (sitesMap[selectedClient.id] ?? []) : []

  // ── Rendu ──
  return (
    <div className="projects-page">
      {/* ── Header ── */}
      <header className="projects-page-header">
        <div className="projects-page-brand">
          <img src={logoUrl} alt="SynoX" className="projects-page-logo" />
        </div>

        {/* Navigation principale */}
        <nav className="ref-main-nav">
          {onGoHome && (
            <button className="ref-nav-btn" onClick={onGoHome}>
              ← Accueil
            </button>
          )}
          <button className="ref-nav-btn" onClick={onOpenProjects}>
            Projets en cours
          </button>
          <button
            className={`ref-nav-btn${view !== 'deleted' ? ' ref-nav-btn-active' : ''}`}
            onClick={() => { setView('clients'); setSelectedClient(null) }}
          >
            Référentiel
          </button>
          <button className="ref-nav-btn" onClick={onOpenCatalogue}>
            Catalogue
          </button>
          {profile?.role === 'admin' && (
            <button
              className={`ref-nav-btn${view === 'deleted' ? ' ref-nav-btn-deleted-active' : ' ref-nav-btn-deleted'}`}
              onClick={() => {
                setView('deleted')
                setSelectedClient(null)
                if (deletedClients.length === 0) loadDeletedClients()
              }}
            >
              🗑 Clients supprimés
            </button>
          )}
        </nav>

        <div className="projects-page-user">
          <button onClick={() => void signOut()} className="btn-signout" title="Se déconnecter">
            Se déconnecter
          </button>
          {profile?.role === 'admin' && onOpenAdminDashboard && (
            <button onClick={onOpenAdminDashboard} title="Tableau de bord administrateur">
              Tableau de bord
            </button>
          )}
          <button className="btn-account" onClick={() => setAccountOpen(true)} title="Gérer mon compte">
            <span className="btn-account-avatar">
              {(profile?.full_name ?? profile?.email ?? '?')[0].toUpperCase()}
            </span>
            <span className="btn-account-name">
              {profile?.full_name ?? profile?.email ?? ''}
            </span>
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="projects-page-main">
        <div className="projects-page-container" style={{ maxWidth: 1100 }}>

          {/* Breadcrumb */}
          <nav className="ref-breadcrumb">
            <button
              className={`ref-breadcrumb-item${view === 'clients' ? ' active' : ''}`}
              onClick={backToClients}
            >
              Clients
            </button>
            {view === 'client' && selectedClient && (
              <>
                <span className="ref-breadcrumb-sep">›</span>
                <span className="ref-breadcrumb-item active">{selectedClient.name}</span>
              </>
            )}
            {view === 'deleted' && (
              <>
                <span className="ref-breadcrumb-sep">›</span>
                <span className="ref-breadcrumb-item active" style={{ color: 'var(--danger)' }}>Clients supprimés</span>
              </>
            )}
          </nav>

          {error && (
            <div className="auth-error" style={{ marginBottom: 16 }}>
              {error}
              <button style={{ marginLeft: 12 }} onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* ── Vue : liste des clients ── */}
          {view === 'clients' && (
            <>
              <div className="projects-page-topbar">
                <div>
                  <h1 className="projects-page-heading">Référentiel clients</h1>
                  <p className="projects-page-sub">
                    {clientsLoading
                      ? 'Chargement…'
                      : `${filteredClients.length} client${filteredClients.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
                <button className="primary projects-page-new" onClick={() => setClientModal('create')}>
                  + Nouveau client
                </button>
              </div>

              <div className="projects-search-bar">
                <input
                  type="search"
                  className="projects-search-input"
                  placeholder="Rechercher un client par nom ou code…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {!clientsLoading && filteredClients.length === 0 && (
                <div className="projects-page-empty">
                  <div className="projects-page-empty-icon">🏢</div>
                  <p>{search ? 'Aucun client ne correspond à votre recherche.' : 'Aucun client pour l\'instant.'}</p>
                  {!search && (
                    <button className="primary" onClick={() => setClientModal('create')}>
                      Créer votre premier client
                    </button>
                  )}
                </div>
              )}

              <div className="ref-clients-grid">
                {filteredClients.map(client => (
                  <div key={client.id} className="ref-client-card">
                    <div className="ref-client-card-body" onClick={() => void openClient(client)}>
                      <div className="ref-client-card-top">
                        {client.logo_url
                          ? <img src={client.logo_url} alt={client.name} className="ref-client-logo" />
                          : <div className="ref-client-logo-placeholder">{client.name[0].toUpperCase()}</div>
                        }
                        <div className="ref-client-card-identity">
                          {client.code && <span className="ref-client-code">{client.code}</span>}
                          <div className="ref-client-name">{client.name}</div>
                        </div>
                      </div>
                      {client.address && <div className="ref-client-address">{client.address}</div>}
                      {(client.phone || client.email) && (
                        <div className="ref-client-contacts">
                          {client.phone && <span>{client.phone}</span>}
                          {client.email && <span>{client.email}</span>}
                        </div>
                      )}
                      {client.account_manager && (
                        <div className="ref-client-manager">
                          <span className="ref-client-manager-avatar">
                            {profileInitials(client.account_manager)}
                          </span>
                          <span className="ref-client-manager-name">
                            {profileDisplayName(client.account_manager)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Vue : détail client (sites + salles) ── */}
          {view === 'client' && selectedClient && (
            <>
              <div className="projects-page-topbar">
                <div>
                  <h1 className="projects-page-heading">{selectedClient.name}</h1>
                  {selectedClient.address && (
                    <p className="projects-page-sub">{selectedClient.address}</p>
                  )}
                  {selectedClient.code && (
                    <p className="projects-page-sub ref-siret-row">
                      <span className="ref-siret-label">SIRET</span>
                      <span className="ref-siret-value">{selectedClient.code}</span>
                      {selectedClient.code.replace(/\s/g, '').length === 14 && (
                        <a
                          href={`https://www.infogreffe.fr/entreprise/${selectedClient.code.replace(/\s/g, '').slice(0, 9)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ref-infogreffe-link"
                        >
                          🔍 Fiche Infogreffe
                        </a>
                      )}
                    </p>
                  )}
                  <p className="projects-page-sub ref-manager-row">
                    <span className="ref-manager-label">Gestionnaire</span>
                    {selectedClient.account_manager ? (
                      <>
                        <span className="ref-manager-avatar">
                          {profileInitials(selectedClient.account_manager)}
                        </span>
                        <span className="ref-manager-name">
                          {profileDisplayName(selectedClient.account_manager)}
                        </span>
                      </>
                    ) : (
                      <span className="ref-manager-none">Non assigné</span>
                    )}
                    {canAssignManager && (
                      <button className="ref-manager-change-btn" onClick={openManagerModal}>
                        {selectedClient.account_manager ? '✏ Changer' : '+ Assigner'}
                      </button>
                    )}
                  </p>
                </div>
                <div className="projects-page-topbar-actions">
                  <button className="ref-topbar-btn" onClick={() => setClientModal(selectedClient)}>
                    ✏ Modifier le client
                  </button>
                  <button className="ref-topbar-btn ref-topbar-btn--primary" onClick={() => setSiteModal('create')}>
                    + Nouveau site
                  </button>
                </div>
              </div>

              {/* Contacts du client */}
              <div className="ref-section-block">
                <ContactsSection entityType="client" entityId={selectedClient.id} />
              </div>

              {sitesLoading ? (
                <div className="ref-loading">Chargement des sites…</div>
              ) : sites.length === 0 ? (
                <div className="projects-page-empty">
                  <div className="projects-page-empty-icon">🏗</div>
                  <p>Aucun site pour ce client.</p>
                  <button className="primary" onClick={() => setSiteModal('create')}>
                    Créer le premier site
                  </button>
                </div>
              ) : (
                <div className="ref-sites-list">
                  {sites.map(site => {
                    const rooms = roomsMap[site.id] ?? []
                    return (
                      <div key={site.id} className="ref-site-card">
                        <div className="ref-site-card-header">
                          <div className="ref-site-card-info">
                            <span className="ref-site-name">🏗 {site.name}</span>
                            {site.address && <span className="ref-site-address">{site.address}</span>}
                          </div>
                          <div className="ref-site-card-actions">
                            <button className="ref-manager-change-btn" onClick={() => setSiteModal(site)} title="Modifier le site">
                              ✏ Modifier
                            </button>
                            <button
                              className="ref-add-btn"
                              onClick={() => setRoomModal({ mode: 'create', siteId: site.id })}
                              title="Ajouter une salle"
                            >
                              + Salle
                            </button>
                            <button
                              className="ref-site-delete-btn"
                              onClick={() => void handleDeleteSite(site)}
                              title="Supprimer le site"
                            >
                              🗑
                            </button>
                          </div>
                        </div>

                        <div className="ref-rooms-list">
                          {rooms.length === 0 ? (
                            <span className="ref-empty-hint">Aucune salle — cliquez sur + Salle pour en ajouter</span>
                          ) : (
                            rooms.map(room => (
                              <button
                                key={room.id}
                                className="ref-room-chip"
                                onClick={() => { setSelectedRoom(room); setSelectedRoomSite(site) }}
                                title={`${room.name}${room.type ? ` — ${room.type}` : ''}`}
                              >
                                <span className="ref-room-chip-icon">🚪</span>
                                <span className="ref-room-chip-name">{room.name}</span>
                                {room.type && <span className="ref-room-chip-type">{room.type}</span>}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Bouton suppression — bas droite de la fiche ── */}
              <div className="ref-danger-zone">
                <button className="ref-delete-client-btn" onClick={() => setConfirmDeleteOpen(true)}>
                  🗑 Supprimer ce client
                </button>
              </div>
            </>
          )}

          {/* ── Vue : Clients supprimés (admin uniquement) ── */}
          {view === 'deleted' && profile?.role === 'admin' && (
            <>
              <div className="projects-page-topbar">
                <div>
                  <h1 className="projects-page-heading" style={{ color: 'var(--danger)' }}>
                    🗑 Clients supprimés
                  </h1>
                  <p className="projects-page-sub">
                    {deletedLoading
                      ? 'Chargement…'
                      : `${deletedClients.length} client${deletedClients.length !== 1 ? 's' : ''} archivé${deletedClients.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>

              {deletedLoading ? (
                <div className="ref-loading">Chargement…</div>
              ) : deletedClients.length === 0 ? (
                <div className="projects-page-empty">
                  <div className="projects-page-empty-icon">✅</div>
                  <p>Aucun client supprimé.</p>
                </div>
              ) : (
                <div className="ref-deleted-list">
                  {deletedClients.map(client => (
                    <div key={client.id} className="ref-deleted-card">
                      <div className="ref-deleted-card-info">
                        {client.logo_url
                          ? <img src={client.logo_url} alt="" className="ref-deleted-logo" />
                          : <div className="ref-deleted-logo-placeholder">{client.name[0].toUpperCase()}</div>
                        }
                        <div>
                          <div className="ref-deleted-name">{client.name}</div>
                          {client.code && <div className="ref-deleted-meta">{client.code}</div>}
                          {client.address && <div className="ref-deleted-meta">{client.address}</div>}
                          {client.deleted_at && (
                            <div className="ref-deleted-date">
                              Supprimé le {new Date(client.deleted_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="ref-deleted-card-actions">
                        <button className="ref-topbar-btn" onClick={() => void handleRestoreClient(client)}>
                          ↩ Restaurer
                        </button>
                        <button className="danger" onClick={() => void handlePermanentDeleteClient(client)}>
                          Supprimer définitivement
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ── Panneau détail salle ── */}
      {selectedRoom && selectedRoomSite && selectedClient && (
        <RoomPanel
          room={selectedRoom}
          site={selectedRoomSite}
          client={selectedClient}
          onClose={() => { setSelectedRoom(null); setSelectedRoomSite(null) }}
          onRoomUpdated={updated => {
            setSelectedRoom(updated)
            setRoomsMap(prev => ({
              ...prev,
              [updated.site_id]: (prev[updated.site_id] ?? [])
                .map(r => r.id === updated.id ? updated : r),
            }))
          }}
          onRoomDeleted={() => {
            if (selectedRoom) {
              setRoomsMap(prev => ({
                ...prev,
                [selectedRoom.site_id]: (prev[selectedRoom.site_id] ?? [])
                  .filter(r => r.id !== selectedRoom.id),
              }))
            }
            setSelectedRoom(null)
            setSelectedRoomSite(null)
          }}
          onNewProject={onNewProjectFromRoom}
          onOpenProject={onOpenProject}
        />
      )}

      {/* ── Modal Client ── */}
      {clientModal !== null && (
        <Modal
          title={clientModal === 'create' ? 'Nouveau client' : `Modifier — ${clientModal.name}`}
          onClose={() => setClientModal(null)}
        >
          <ClientForm
            initial={clientModal === 'create' ? undefined : clientModal}
            clientId={clientModal === 'create' ? undefined : clientModal.id}
            onSave={clientModal === 'create' ? handleCreateClient : handleUpdateClient}
            onLogoUploaded={(url, path) => {
              if (clientModal === 'create') return
              const updated = { ...clientModal, logo_url: url || null, logo_storage_path: path || null }
              setClients(prev => prev.map(c => c.id === updated.id ? updated as Client : c))
              if (selectedClient?.id === updated.id) setSelectedClient(updated as Client)
            }}
            onCancel={() => setClientModal(null)}
            saving={saving}
          />
        </Modal>
      )}

      {/* ── Modal Site ── */}
      {siteModal !== null && (
        <Modal
          title={siteModal === 'create' ? 'Nouveau site' : `Modifier — ${siteModal.name}`}
          onClose={() => setSiteModal(null)}
        >
          <SiteForm
            initial={siteModal === 'create' ? undefined : siteModal}
            onSave={siteModal === 'create' ? handleCreateSite : handleUpdateSite}
            onCancel={() => setSiteModal(null)}
            saving={saving}
          />
        </Modal>
      )}

      {/* ── Modal Salle ── */}
      {roomModal !== null && (
        <Modal
          title={roomModal.mode === 'create' ? 'Nouvelle salle' : `Modifier — ${roomModal.room.name}`}
          onClose={() => setRoomModal(null)}
        >
          <RoomForm
            initial={roomModal.mode === 'edit' ? roomModal.room : undefined}
            onSave={roomModal.mode === 'create' ? handleCreateRoom : handleUpdateRoom}
            onCancel={() => setRoomModal(null)}
            saving={saving}
          />
        </Modal>
      )}

      {/* ── Modal Confirmation suppression client ── */}
      {confirmDeleteOpen && selectedClient && (
        <Modal title="Supprimer ce client ?" onClose={() => setConfirmDeleteOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ref-delete-warning">
              <span style={{ fontSize: 28, flexShrink: 0 }}>⚠️</span>
              <div>
                <p style={{ fontWeight: 700, margin: 0, fontSize: 15 }}>{selectedClient.name}</p>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                  Ce client sera <strong>archivé</strong> et masqué du référentiel.<br />
                  Ses sites, salles et documents seront conservés.<br />
                  Un administrateur pourra le <strong>restaurer</strong> à tout moment depuis la section « Clients supprimés ».
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDeleteOpen(false)}>Annuler</button>
              <button className="danger" disabled={deletingClient} onClick={() => void handleSoftDeleteClient()}>
                {deletingClient ? '…' : '🗑 Archiver ce client'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal Gestionnaire ── */}
      {managerModalOpen && selectedClient && (
        <Modal title="Gestionnaire de compte" onClose={() => setManagerModalOpen(false)}>
          {profilesLoading ? (
            <p className="ref-loading-hint">Chargement des utilisateurs…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedClient.account_manager && (
                <button
                  className="ref-manager-remove-btn"
                  disabled={assigningManager}
                  onClick={() => void handleAssignManager(null)}
                >
                  🗑 Retirer le gestionnaire actuel
                </button>
              )}
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 8px' }}>
                Sélectionnez un utilisateur SynoX comme gestionnaire de ce compte :
              </p>
              <ul className="ref-link-project-list">
                {approvedProfiles.map(p => (
                  <li key={p.id} className={`ref-link-project-item${p.id === selectedClient.account_manager_id ? ' ref-manager-current' : ''}`}>
                    <span className="ref-manager-avatar" style={{ width: 36, height: 36, fontSize: 14, flexShrink: 0 }}>
                      {profileInitials(p)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{profileDisplayName(p)}</div>
                      {p.full_name && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.email}</div>}
                    </div>
                    {p.id === selectedClient.account_manager_id ? (
                      <span className="ref-manager-current-badge">Actuel</span>
                    ) : (
                      <button
                        className="primary"
                        disabled={assigningManager}
                        onClick={() => void handleAssignManager(p.id)}
                      >
                        {assigningManager ? '…' : 'Choisir'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Modal>
      )}

      {/* ── Modal Mon compte ── */}
      {accountOpen && <AdminSettings onClose={() => setAccountOpen(false)} />}
    </div>
  )
}

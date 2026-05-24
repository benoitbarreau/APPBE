import { useAuth } from '../auth/useAuth'
import { useState } from 'react'
import { AdminSettings } from '../components/AdminSettings'
import type { Panel } from '../components/AdminSettings'

const logoUrl = `${import.meta.env.BASE_URL}synoX.png`

interface Props {
  onOpenProjects: () => void
  onOpenReferentiel: () => void
  onOpenAdminDashboard?: () => void
}

export function HomePage({ onOpenProjects, onOpenReferentiel, onOpenAdminDashboard }: Props) {
  const { profile, signOut } = useAuth()
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountInitialPanel, setAccountInitialPanel] = useState<Panel>('info')

  const firstName = profile?.full_name?.trim().split(' ')[0] || ''

  return (
    <div className="home-page">
      {/* ── Header ── */}
      <header className="home-header">
        <div className="home-header-brand">
          <img src={logoUrl} alt="SynoX" className="home-header-logo" />
        </div>

        <div className="home-header-right">
          {profile?.role === 'admin' && onOpenAdminDashboard && (
            <button className="home-header-action-btn" onClick={onOpenAdminDashboard} title="Tableau de bord administrateur">
              ⚙️ Tableau de bord
            </button>
          )}
          <button
            className="home-header-user-chip"
            onClick={() => { setAccountInitialPanel('info'); setAccountOpen(true) }}
            title="Gérer mon compte"
          >
            <span className="home-header-avatar">
              {(profile?.full_name ?? profile?.email ?? '?')[0].toUpperCase()}
            </span>
            <span className="home-header-username">
              {profile?.full_name ?? profile?.email ?? ''}
            </span>
          </button>
          <button className="home-header-action-btn home-header-signout" onClick={() => void signOut()}>
            Déconnexion
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="home-main">
        {/* Greeting */}
        <div className="home-greeting">
          <h1 className="home-greeting-title">
            {firstName ? `Bonjour, ${firstName} 👋` : 'Bienvenue 👋'}
          </h1>
          <p className="home-greeting-sub">Que souhaitez-vous faire aujourd'hui ?</p>
        </div>

        {/* Navigation cards */}
        <div className="home-cards">

          {/* Card — Projets en cours */}
          <button className="home-card" onClick={onOpenProjects}>
            <div className="home-card-inner">
              <div className="home-card-icon home-card-icon--projects">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                  <rect x="4" y="4" width="28" height="28" rx="6" fill="white" fillOpacity="0.2"/>
                  <path d="M8 18h20M18 8v20" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                  <rect x="10" y="10" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.9"/>
                  <rect x="19" y="19" width="7" height="7" rx="1.5" fill="white" fillOpacity="0.9"/>
                  <rect x="10" y="20" width="7" height="6" rx="1.5" fill="white" fillOpacity="0.5"/>
                  <rect x="19" y="10" width="7" height="6" rx="1.5" fill="white" fillOpacity="0.5"/>
                </svg>
              </div>
              <div className="home-card-content">
                <h2 className="home-card-title">Projets en cours</h2>
                <p className="home-card-desc">
                  Créez et gérez vos diagrammes de câblage et d'installation audiovisuelle
                </p>
                <span className="home-card-cta">
                  Accéder aux projets
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </div>
            </div>
            <div className="home-card-bg home-card-bg--projects" />
          </button>

          {/* Card — Référentiel clients */}
          <button className="home-card" onClick={onOpenReferentiel}>
            <div className="home-card-inner">
              <div className="home-card-icon home-card-icon--ref">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                  <rect x="4" y="16" width="28" height="18" rx="3" fill="white" fillOpacity="0.25"/>
                  <rect x="10" y="10" width="16" height="22" rx="2" fill="white" fillOpacity="0.15"/>
                  <rect x="14" y="4" width="8" height="12" rx="2" fill="white" fillOpacity="0.3"/>
                  <circle cx="18" cy="20" r="3" fill="white" fillOpacity="0.9"/>
                  <rect x="15" y="23" width="6" height="5" rx="1" fill="white" fillOpacity="0.7"/>
                  <rect x="8" y="20" width="4" height="3" rx="0.5" fill="white" fillOpacity="0.5"/>
                  <rect x="24" y="20" width="4" height="3" rx="0.5" fill="white" fillOpacity="0.5"/>
                </svg>
              </div>
              <div className="home-card-content">
                <h2 className="home-card-title">Référentiel clients</h2>
                <p className="home-card-desc">
                  Gérez vos clients, sites, salles, contacts et documents techniques
                </p>
                <span className="home-card-cta">
                  Accéder au référentiel
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              </div>
            </div>
            <div className="home-card-bg home-card-bg--ref" />
          </button>

        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <span>SynoX — Video Synergie</span>
      </footer>

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

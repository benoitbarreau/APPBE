import { useEffect, useRef, useState } from "react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { DiagramCanvas } from "./components/DiagramCanvas";
import { ProductPalette } from "./components/ProductPalette";
import { ProductEditor } from "./components/ProductEditor";
import { ImportDialog } from "./components/ImportDialog";
import { CableList } from "./components/CableList";
import { EtiquettesList } from "./components/EtiquettesList";
import { Legend } from "./components/Legend";
import { ZonesList } from "./components/ZonesList";
import { Cartouche } from "./components/Cartouche";
import { InstancePortsConfig } from "./components/InstancePortsConfig";
import { AdminSettings } from "./components/AdminSettings";
import { useAppStore, getFlushedTabs } from "./store";
import { layoutNodes } from "./layout";
import { exportDiagram } from "./export";
import { useAuth } from "./auth/useAuth";
import { saveProject } from "./lib/projectsApi";

interface AppProps {
  onOpenAdminDashboard?: () => void
  onBackToProjects?: () => void
}

export default function App({ onOpenAdminDashboard, onBackToProjects }: AppProps) {
  return (
    <ReactFlowProvider>
      <AppInner onOpenAdminDashboard={onOpenAdminDashboard} onBackToProjects={onBackToProjects} />
    </ReactFlowProvider>
  );
}

function AppInner({ onOpenAdminDashboard, onBackToProjects }: AppProps) {
  const reactFlow = useReactFlow();
  const { profile } = useAuth();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [editingInstance, setEditingInstance] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"cables" | "etiquettes" | "legend" | "zones">("cables");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // ── État onglets ──────────────────────────────────────────────────────
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const addTab = useAppStore((s) => s.addTab);
  const removeTab = useAppStore((s) => s.removeTab);
  const renameTab = useAppStore((s) => s.renameTab);
  const duplicateTab = useAppStore((s) => s.duplicateTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");
  const tabInputRef = useRef<HTMLInputElement>(null);

  const addNode = useAppStore((s) => s.addNode);
  const nodes = useAppStore((s) => s.nodes);
  const resetProject = useAppStore((s) => s.resetProject);
  const updateNode = useAppStore((s) => s.updateNode);
  const updateCable = useAppStore((s) => s.updateCable);
  const currentProjectName = useAppStore((s) => s.currentProjectName);
  const setProjectName = useAppStore((s) => s.setProjectName);
  const currentProjectId = useAppStore((s) => s.currentProjectId);

  const handleAutoLayout = () => {
    const state = useAppStore.getState();
    const positions = layoutNodes(state.nodes, state.cables, state.products);
    for (const p of positions) updateNode(p.id, { position: { x: p.x, y: p.y } });
    for (const c of state.cables) {
      if (c.labelOffset || (c.waypoints && c.waypoints.length > 0)) {
        updateCable(c.id, { labelOffset: { x: 0, y: 0 }, waypoints: [] });
      }
    }
  };

  const handleAdd = (productId: string) => {
    const offset = nodes.length * 30;
    addNode(productId, { x: 200 + offset, y: 100 + offset });
  };

  const handleNew = () => {
    if (!confirm("Créer un nouveau projet ? Les modifications non sauvegardées seront perdues.")) return;
    resetProject();
  };

  const handleBackToProjects = () => {
    const hasNodes = useAppStore.getState().nodes.length > 0;
    if (hasNodes && !savedOk) {
      if (!confirm("Retourner aux projets ? Les modifications non sauvegardées seront perdues.")) return;
    }
    onBackToProjects?.();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const state = useAppStore.getState();
      // Flush l'état de travail dans l'onglet actif avant de sauvegarder
      const flushedTabs = getFlushedTabs();
      const id = await saveProject(
        state.currentProjectId,
        state.currentProjectName || "Sans titre",
        {
          tabs: flushedTabs,
          activeTabId: state.activeTabId,
          projectMeta: state.projectMeta,
          signals: state.signals,
          products: state.products,
        },
      );
      // Mettre à jour le store avec les tabs flushés
      useAppStore.setState({ tabs: flushedTabs });
      if (!state.currentProjectId) {
        useAppStore.setState({ currentProjectId: id });
      }
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch (e) {
      alert("Erreur de sauvegarde : " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const exportProject = () => {
    const state = useAppStore.getState();
    const flushedTabs = getFlushedTabs();
    const blob = new Blob(
      [JSON.stringify({ products: state.products, tabs: flushedTabs }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentProjectName.replace(/[^a-z0-9]+/gi, "-") || "synoptique"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [exportMenuOpen]);

  const handleExport = async (format: "png" | "jpeg" | "svg" | "pdf") => {
    setExportMenuOpen(false);
    try {
      const refLabel =
        useAppStore.getState().projectMeta.client?.replace(/[^a-z0-9]+/gi, "-") || "synoptique";
      await exportDiagram(reactFlow, { format, filename: `${refLabel}.${format}` });
    } catch (e) {
      alert("Echec export : " + (e instanceof Error ? e.message : String(e)));
    }
  };

  // ── Gestion des onglets ───────────────────────────────────────────────

  const startTabEdit = (tabId: string, currentName: string) => {
    setEditingTabId(tabId);
    setEditingTabName(currentName);
    // Focus auto géré par autoFocus sur l'input
  };

  const commitTabName = (tabId: string) => {
    const name = editingTabName.trim();
    if (name) renameTab(tabId, name);
    setEditingTabId(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          {onBackToProjects && (
            <button
              onClick={handleBackToProjects}
              title="Retour à la liste des projets"
              className="btn-back"
            >
              ← Projets
            </button>
          )}
          <div className="brand">SynoX</div>
          <span className="header-sep">|</span>
          <input
            className="project-name-input"
            value={currentProjectName}
            onChange={e => setProjectName(e.target.value)}
            placeholder="Sans titre"
            title="Nom du projet (cliquer pour renommer)"
          />
          {currentProjectId && (
            <span className="header-project-saved" title="Projet synchronisé dans le cloud">☁</span>
          )}
        </div>

        <div className="header-actions">
          <button onClick={handleNew} title="Créer un nouveau projet vide">
            Nouveau
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className={savedOk ? "btn-saved" : ""}
            title="Sauvegarder dans le cloud"
          >
            {saving ? "Sauvegarde…" : savedOk ? "Sauvegardé ✓" : "Sauvegarder"}
          </button>

          <div className="header-separator" />

          <button onClick={handleAutoLayout} title="Replacer les produits">
            Réorganiser
          </button>
          <div className="export-menu" ref={exportMenuRef}>
            <button onClick={() => setExportMenuOpen((v) => !v)}>Exporter ▾</button>
            {exportMenuOpen && (
              <div className="export-dropdown">
                <button onClick={() => { setExportMenuOpen(false); exportProject(); }}>
                  JSON (projet complet)
                </button>
                <button onClick={() => handleExport("png")}>PNG</button>
                <button onClick={() => handleExport("jpeg")}>JPEG</button>
                <button onClick={() => handleExport("svg")}>SVG (Visio, AutoCAD)</button>
                <button onClick={() => handleExport("pdf")}>PDF</button>
              </div>
            )}
          </div>

          <div className="header-separator" />

          {profile?.role === "admin" && onOpenAdminDashboard && (
            <button onClick={onOpenAdminDashboard} title="Tableau de bord administrateur">
              Tableau de bord
            </button>
          )}
          <button onClick={() => setAdminOpen(true)} title="Mon compte">
            ⚙ Mon compte
          </button>
        </div>
      </header>

      {/* ── Barre d'onglets ──────────────────────────────────────────────── */}
      <div className="tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-item${activeTabId === tab.id ? " active" : ""}`}
          >
            {editingTabId === tab.id ? (
              <input
                ref={tabInputRef}
                className="tab-name-input"
                value={editingTabName}
                autoFocus
                onChange={e => setEditingTabName(e.target.value)}
                onBlur={() => commitTabName(tab.id)}
                onKeyDown={e => {
                  if (e.key === "Enter") commitTabName(tab.id);
                  if (e.key === "Escape") setEditingTabId(null);
                }}
              />
            ) : (
              <button
                className="tab-name"
                onClick={() => setActiveTab(tab.id)}
                onDoubleClick={() => startTabEdit(tab.id, tab.name)}
                title="Double-clic pour renommer"
              >
                {tab.name}
              </button>
            )}
            <button
              className="tab-dup"
              onClick={() => duplicateTab(tab.id)}
              title="Dupliquer ce synoptique"
            >
              ⎘
            </button>
            {tabs.length > 1 && (
              <button
                className="tab-close"
                onClick={() => removeTab(tab.id)}
                title="Fermer ce synoptique"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          className="tab-add"
          onClick={() => addTab()}
          title="Ajouter un synoptique"
        >
          +
        </button>
      </div>

      <div className={`app-body${paletteOpen ? "" : " left-collapsed"}`}>
        <aside className={`sidebar left${paletteOpen ? "" : " collapsed"}`}>
          {paletteOpen ? (
            <ProductPalette
              onAdd={handleAdd}
              onEdit={(id) => setEditing(id)}
              onNew={() => setEditing("new")}
              onImport={() => setImporting(true)}
              onCollapse={() => setPaletteOpen(false)}
            />
          ) : (
            <button
              className="palette-expand-btn"
              onClick={() => setPaletteOpen(true)}
              title="Afficher le catalogue"
            >
              <span className="palette-expand-icon">▶</span>
              <span className="palette-expand-label">Catalogue</span>
            </button>
          )}
        </aside>

        {/* key=activeTabId force le remontage de React Flow lors du changement d'onglet */}
        <main className="canvas" key={activeTabId}>
          <DiagramCanvas onEditInstance={(id) => setEditingInstance(id)} />
          <Cartouche />
        </main>

        <aside className="sidebar right">
          <div className="tabs">
            <button className={rightTab === "cables" ? "active" : ""} onClick={() => setRightTab("cables")}>
              Câbles
            </button>
            <button className={rightTab === "etiquettes" ? "active" : ""} onClick={() => setRightTab("etiquettes")}>
              Etiquettes
            </button>
            <button className={rightTab === "zones" ? "active" : ""} onClick={() => setRightTab("zones")}>
              Zones
            </button>
            <button className={rightTab === "legend" ? "active" : ""} onClick={() => setRightTab("legend")}>
              Légende
            </button>
          </div>
          {rightTab === "cables" && <CableList />}
          {rightTab === "etiquettes" && <EtiquettesList />}
          {rightTab === "zones" && <ZonesList />}
          {rightTab === "legend" && <Legend />}
        </aside>
      </div>

      {editing !== null && (
        <ProductEditor productId={editing} onClose={() => setEditing(null)} onSwitchTo={(id) => setEditing(id)} />
      )}
      {editingInstance !== null && (
        <InstancePortsConfig nodeId={editingInstance} onClose={() => setEditingInstance(null)} />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {adminOpen && <AdminSettings onClose={() => setAdminOpen(false)} />}
    </div>
  );
}

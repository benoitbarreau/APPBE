import { useEffect, useRef, useState } from "react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { DiagramCanvas } from "./components/DiagramCanvas";
import { ProductPalette } from "./components/ProductPalette";
import { ProductEditor } from "./components/ProductEditor";
import { ImportDialog } from "./components/ImportDialog";
import { CableList } from "./components/CableList";
import { EtiquettesList } from "./components/EtiquettesList";
import { ProductLabelsList } from "./components/ProductLabelsList";
import { Legend } from "./components/Legend";
import { ZonesList } from "./components/ZonesList";
import { Cartouche } from "./components/Cartouche";
import { InstancePortsConfig } from "./components/InstancePortsConfig";
import { AdminSettings } from "./components/AdminSettings";
import { useAppStore, getFlushedTabs } from "./store";
import { layoutNodes } from "./layout";
import {
  exportDiagram,
  printDiagram,
  openPrintPreview,
  captureAndComposePage,
  buildAndSavePDF,
  computePageRects,
  downloadFile,
  type CartoucheData,
} from "./export";
import { ExportScopeModal } from "./components/ExportScopeModal";
import { useAuth } from "./auth/useAuth";
import {
  saveProject,
  saveProjectVersion,
  updateVersionsMeta,
  pruneProjectVersions,
  incrementVersion,
  computeProjectHash,
} from "./lib/projectsApi";

interface AppProps {
  onOpenAdminDashboard?: () => void
  onBackToProjects?: () => void
  readOnly?: boolean
  readOnlyVersion?: string
}

export default function App({ onOpenAdminDashboard, onBackToProjects, readOnly, readOnlyVersion }: AppProps) {
  return (
    <ReactFlowProvider>
      <AppInner
        onOpenAdminDashboard={onOpenAdminDashboard}
        onBackToProjects={onBackToProjects}
        readOnly={readOnly}
        readOnlyVersion={readOnlyVersion}
      />
    </ReactFlowProvider>
  );
}

function AppInner({ onOpenAdminDashboard, onBackToProjects, readOnly, readOnlyVersion }: AppProps) {
  const reactFlow = useReactFlow();
  const { profile, signOut } = useAuth();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [editingInstance, setEditingInstance] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"cables" | "etiquettes" | "labels" | "legend" | "zones">("cables");
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
  const updateNode = useAppStore((s) => s.updateNode);
  const updateCable = useAppStore((s) => s.updateCable);
  const updateProjectMeta = useAppStore((s) => s.updateProjectMeta);
  const setVersionsMeta = useAppStore((s) => s.setVersionsMeta);
  const currentProjectName = useAppStore((s) => s.currentProjectName);
  const setProjectName = useAppStore((s) => s.setProjectName);
  const currentProjectId = useAppStore((s) => s.currentProjectId);

  // Hash de l'état au dernier enregistrement — permet de détecter les vraies modifications
  const lastSavedHash = useRef<string>("");

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

  const handleBackToProjects = () => {
    // En lecture seule : pas de confirmation (rien ne peut être modifié)
    if (readOnly) {
      onBackToProjects?.();
      return;
    }
    const hasNodes = useAppStore.getState().nodes.length > 0;
    if (hasNodes && !savedOk) {
      if (!confirm("Retourner aux projets ? Les modifications non sauvegardées seront perdues.")) return;
    }
    onBackToProjects?.();
  };

  const handleSave = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      const state = useAppStore.getState();
      // Flush l'état de travail dans l'onglet actif avant de sauvegarder
      const flushedTabs = getFlushedTabs();

      // ── Détection de modification réelle ──────────────────────────────
      const currentHash = computeProjectHash(flushedTabs, state.products, state.signals);
      const isModified = lastSavedHash.current !== "" && currentHash !== lastSavedHash.current;
      const isExistingProject = !!state.currentProjectId;

      // ── Date du jour mise à jour à chaque sauvegarde ──────────────────
      const todayStr = new Date().toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      let metaToSave = { ...state.projectMeta, date: todayStr };
      updateProjectMeta({ date: todayStr });

      let versionsMeta = [...(state.currentVersionsMeta ?? [])];

      // ── Archivage + incrément de version si modification détectée ─────
      if (isModified && isExistingProject) {
        const currentVersion = state.projectMeta.version || "V1.0";
        try {
          // Archiver la version courante avant d'incrémenter
          const archived = await saveProjectVersion(state.currentProjectId!, currentVersion, {
            tabs: flushedTabs,
            activeTabId: state.activeTabId,
            projectMeta: state.projectMeta,
            signals: state.signals,
            products: state.products,
          });
          // Conserver les 3 derniers snapshots archivés max
          versionsMeta = [...versionsMeta, archived].slice(-3);
          await pruneProjectVersions(state.currentProjectId!, 3);

          // Incrémenter la version dans les meta
          const newVersion = incrementVersion(currentVersion);
          updateProjectMeta({ version: newVersion });
          metaToSave = { ...metaToSave, version: newVersion };
          setVersionsMeta(versionsMeta);
        } catch {
          // Si l'archivage échoue, on sauvegarde quand même sans incrémenter
        }
      }

      // ── Sauvegarde principale ─────────────────────────────────────────
      const id = await saveProject(
        state.currentProjectId,
        state.currentProjectName || "Sans titre",
        {
          tabs: flushedTabs,
          activeTabId: state.activeTabId,
          projectMeta: metaToSave,
          signals: state.signals,
          products: state.products,
        },
      );

      // Mise à jour des versions_meta sur le projet (affichage liste)
      if (isModified && isExistingProject) {
        await updateVersionsMeta(id, versionsMeta).catch(() => {});
      }

      // Mettre à jour le store avec les tabs flushés
      useAppStore.setState({ tabs: flushedTabs });
      if (!state.currentProjectId) {
        useAppStore.setState({ currentProjectId: id });
      }

      // Mémoriser le hash de cet enregistrement
      lastSavedHash.current = currentHash;

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

  const [printing, setPrinting] = useState(false);
  const [scopeModal, setScopeModal] = useState<{
    action: "export" | "print";
    format?: "png" | "jpeg" | "svg" | "pdf";
  } | null>(null);

  // ── Helpers export ────────────────────────────────────────────────────

  const buildCartoucheForTab = (tabId: string): CartoucheData => {
    const s = useAppStore.getState();
    const tab = s.tabs.find((t) => t.id === tabId);
    const meta = s.projectMeta;
    return {
      client: meta.client,
      lieu: meta.lieu,
      campus: s.currentProjectName || meta.campus || "Sans titre",
      tabName: tab?.trade || tab?.name || "",
      date:
        meta.date ||
        new Date().toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      authorName: meta.authorName,
      version: meta.version,
    };
  };

  const switchTabAndWait = (tabId: string): Promise<void> =>
    new Promise((resolve) => {
      useAppStore.getState().setActiveTab(tabId);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setTimeout(resolve, 400)),
      );
    });

  const handlePrintCurrentTab = async () => {
    try {
      setPrinting(true);
      const state = useAppStore.getState();
      await printDiagram(reactFlow, {
        cartouche: buildCartoucheForTab(state.activeTabId),
      });
    } catch (e) {
      alert("Echec impression : " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintAllTabs = async () => {
    const state = useAppStore.getState();
    const originalTabId = state.activeTabId;
    const flushedTabs = getFlushedTabs();
    let totalPages = 0;
    for (const tab of flushedTabs) totalPages += computePageRects(tab.nodes).length;

    try {
      setPrinting(true);
      const allPageUrls: string[] = [];
      let pageNum = 1;
      for (const tab of flushedTabs) {
        await switchTabAndWait(tab.id);
        const nodes = useAppStore.getState().nodes;
        const pages = computePageRects(nodes);
        const cartouche = buildCartoucheForTab(tab.id);
        for (const page of pages) {
          allPageUrls.push(
            await captureAndComposePage(reactFlow, page, {
              cartouche,
              pageNum,
              totalPages,
            }),
          );
          pageNum++;
        }
      }
      await openPrintPreview(allPageUrls, totalPages);
    } catch (e) {
      alert("Echec impression : " + (e instanceof Error ? e.message : String(e)));
    } finally {
      await switchTabAndWait(originalTabId);
      setPrinting(false);
    }
  };

  const handlePrint = () => {
    const { tabs } = useAppStore.getState();
    if (tabs.length > 1) {
      setScopeModal({ action: "print" });
    } else {
      void handlePrintCurrentTab();
    }
  };

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
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

  const handleExportCurrentTab = async (format: "png" | "jpeg" | "svg" | "pdf") => {
    try {
      const state = useAppStore.getState();
      const refLabel =
        state.projectMeta.client?.replace(/[^a-z0-9]+/gi, "-") || "synoptique";
      await exportDiagram(reactFlow, {
        format,
        filename: `${refLabel}.${format}`,
        cartouche: buildCartoucheForTab(state.activeTabId),
      });
    } catch (e) {
      alert("Echec export : " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleExportAllTabs = async (format: "png" | "jpeg" | "svg" | "pdf") => {
    const state = useAppStore.getState();
    const originalTabId = state.activeTabId;
    const flushedTabs = getFlushedTabs();
    const refLabel =
      state.projectMeta.client?.replace(/[^a-z0-9]+/gi, "-") || "synoptique";

    // Calcul du nombre total de pages
    let totalPages = 0;
    for (const tab of flushedTabs) {
      totalPages += computePageRects(tab.nodes).length;
    }

    try {
      if (format === "pdf") {
        const allPageUrls: string[] = [];
        let pageNum = 1;
        for (const tab of flushedTabs) {
          await switchTabAndWait(tab.id);
          const nodes = useAppStore.getState().nodes;
          const pages = computePageRects(nodes);
          const cartouche = buildCartoucheForTab(tab.id);
          for (const page of pages) {
            allPageUrls.push(
              await captureAndComposePage(reactFlow, page, {
                cartouche,
                pageNum,
                totalPages,
              }),
            );
            pageNum++;
          }
        }
        await buildAndSavePDF(allPageUrls, `${refLabel}.pdf`);
      } else {
        let pageNum = 1;
        for (const tab of flushedTabs) {
          await switchTabAndWait(tab.id);
          const nodes = useAppStore.getState().nodes;
          const pages = computePageRects(nodes);
          const cartouche = buildCartoucheForTab(tab.id);
          const tabSlug = (tab.trade || tab.name)
            .replace(/[^a-z0-9]+/gi, "-")
            .toLowerCase();
          for (let i = 0; i < pages.length; i++) {
            const suffix =
              flushedTabs.length > 1 || pages.length > 1
                ? `-${tabSlug}${pages.length > 1 ? `-p${i + 1}` : ""}`
                : "";
            const filename = `${refLabel}${suffix}.${format}`;
            const url = await captureAndComposePage(reactFlow, pages[i], {
              cartouche,
              pageNum,
              totalPages,
              format: format as "png" | "jpeg" | "svg",
            });
            downloadFile(url, filename, format);
            pageNum++;
          }
        }
      }
    } catch (e) {
      alert("Echec export : " + (e instanceof Error ? e.message : String(e)));
    } finally {
      await switchTabAndWait(originalTabId);
    }
  };

  const handleExport = (format: "png" | "jpeg" | "svg" | "pdf") => {
    setExportMenuOpen(false);
    const { tabs } = useAppStore.getState();
    if (tabs.length > 1) {
      setScopeModal({ action: "export", format });
    } else {
      void handleExportCurrentTab(format);
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
      {/* ── Sidebar gauche pleine hauteur ────────────────────────────────── */}
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

      {/* ── Zone principale : bannière + header + onglets + body ─────────── */}
      <div className="app-main">
        {/* ── Bannière lecture seule ─────────────────────────────────────── */}
        {readOnly && (
          <div className="readonly-banner">
            🔒 Lecture seule — Version {readOnlyVersion ?? "archivée"} — Cette version ne peut pas être modifiée
            <button onClick={onBackToProjects} className="readonly-back-btn">
              ← Retour aux projets
            </button>
          </div>
        )}

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
              onChange={e => !readOnly && setProjectName(e.target.value)}
              placeholder="Sans titre"
              readOnly={readOnly}
              title={readOnly ? "Version en lecture seule" : "Nom du projet (cliquer pour renommer)"}
            />
            {currentProjectId && !readOnly && (
              <span className="header-project-saved" title="Projet synchronisé dans le cloud">☁</span>
            )}

            <div className="header-separator" />

            {!readOnly && (
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className={savedOk ? "btn-saved" : ""}
                title="Sauvegarder dans le cloud"
              >
                {saving ? "Sauvegarde…" : savedOk ? "Sauvegardé ✓" : "Sauvegarder"}
              </button>
            )}
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
            <button
              onClick={() => void handlePrint()}
              disabled={printing}
              title="Prévisualiser et imprimer en A3"
            >
              {printing ? "Génération…" : "🖨 Imprimer"}
            </button>
          </div>

          <div className="header-actions">
            <button
              onClick={() => void signOut()}
              title="Se déconnecter"
              className="btn-signout"
            >
              Se déconnecter
            </button>
            {profile?.role === "admin" && onOpenAdminDashboard && (
              <button onClick={onOpenAdminDashboard} title="Tableau de bord administrateur">
                Tableau de bord
              </button>
            )}
            <button onClick={() => setAdminOpen(true)} title="Mon compte" className="primary">
              Mon compte
            </button>
          </div>
        </header>

        {/* ── Barre d'onglets ────────────────────────────────────────────── */}
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

        {/* ── Canvas + panneau droit ─────────────────────────────────────── */}
        <div className={`app-body${rightPanelOpen ? "" : " right-collapsed"}`}>
          {/* key=activeTabId force le remontage de React Flow lors du changement d'onglet */}
          <main className="canvas" key={activeTabId}>
            <DiagramCanvas onEditInstance={(id) => setEditingInstance(id)} />
            <Cartouche />
          </main>

          <aside className={`sidebar right${rightPanelOpen ? "" : " collapsed"}`}>
            {rightPanelOpen ? (
              <>
                <div className="right-panel-topbar">
                  <div className="tabs">
                    <button className={rightTab === "cables" ? "active" : ""} onClick={() => setRightTab("cables")}>
                      Câbles
                    </button>
                    <button className={rightTab === "etiquettes" ? "active" : ""} onClick={() => setRightTab("etiquettes")}>
                      Etiquettes
                    </button>
                    <button className={rightTab === "labels" ? "active" : ""} onClick={() => setRightTab("labels")}>
                      Label
                    </button>
                    <button className={rightTab === "zones" ? "active" : ""} onClick={() => setRightTab("zones")}>
                      Zones
                    </button>
                    <button className={rightTab === "legend" ? "active" : ""} onClick={() => setRightTab("legend")}>
                      Légende
                    </button>
                  </div>
                  <button
                    className="right-collapse-btn"
                    onClick={() => setRightPanelOpen(false)}
                    title="Réduire le panneau"
                  >
                    ▶
                  </button>
                </div>
                {rightTab === "cables" && <CableList />}
                {rightTab === "etiquettes" && <EtiquettesList />}
                {rightTab === "labels" && <ProductLabelsList />}
                {rightTab === "zones" && <ZonesList />}
                {rightTab === "legend" && <Legend />}
              </>
            ) : (
              <button
                className="right-expand-btn"
                onClick={() => setRightPanelOpen(true)}
                title="Afficher le panneau"
              >
                <span className="right-expand-icon">◀</span>
                <span className="right-expand-label">Outils</span>
              </button>
            )}
          </aside>
        </div>
      </div>

      {editing !== null && (
        <ProductEditor productId={editing} onClose={() => setEditing(null)} onSwitchTo={(id) => setEditing(id)} />
      )}
      {editingInstance !== null && (
        <InstancePortsConfig nodeId={editingInstance} onClose={() => setEditingInstance(null)} />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {adminOpen && <AdminSettings onClose={() => setAdminOpen(false)} />}
      {scopeModal && (
        <ExportScopeModal
          tabs={tabs}
          activeTabName={tabs.find((t) => t.id === activeTabId)?.trade || tabs.find((t) => t.id === activeTabId)?.name || ""}
          action={scopeModal.action}
          onCurrentTab={() => {
            setScopeModal(null);
            if (scopeModal.action === "export" && scopeModal.format) {
              void handleExportCurrentTab(scopeModal.format);
            } else {
              void handlePrintCurrentTab();
            }
          }}
          onAllTabs={() => {
            setScopeModal(null);
            if (scopeModal.action === "export" && scopeModal.format) {
              void handleExportAllTabs(scopeModal.format);
            } else {
              void handlePrintAllTabs();
            }
          }}
          onCancel={() => setScopeModal(null)}
        />
      )}
    </div>
  );
}

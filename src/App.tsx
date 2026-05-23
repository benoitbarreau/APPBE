import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { createPortal } from "react-dom";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { DiagramCanvas } from "./components/DiagramCanvas";
import { ProductPalette } from "./components/ProductPalette";
import { FormattingPanel } from "./components/FormattingPanel";
import { ProductEditor } from "./components/ProductEditor";
import { ImportDialog } from "./components/ImportDialog";
import { CableList } from "./components/CableList";
import { EtiquettesList } from "./components/EtiquettesList";
import { ProductLabelsList } from "./components/ProductLabelsList";
import { Legend } from "./components/Legend";
import { ZonesList } from "./components/ZonesList";
import { IPTableEditor } from "./components/IPTableEditor";
import { BayCanvas } from "./components/bay/BayCanvas";
import { BayCreateModal } from "./components/bay/BayCreateModal";
import { isBayTab, isIPTableTab } from "./types";
import { Cartouche } from "./components/Cartouche";
import { InstancePortsConfig } from "./components/InstancePortsConfig";
import { AdminSettings } from "./components/AdminSettings";
import { UnsavedChangesModal } from "./components/UnsavedChangesModal";
import { ImageImportModal } from "./components/ImageImportModal";
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
import { getProjectRoomInfo, type ProjectRoomInfo } from "./lib/referentielApi";

interface AppProps {
  onOpenAdminDashboard?: () => void
  onBackToProjects?: () => void
  onGoToReferentiel?: (clientId: string) => void
  readOnly?: boolean
  readOnlyVersion?: string
}

export default function App({ onOpenAdminDashboard, onBackToProjects, onGoToReferentiel, readOnly, readOnlyVersion }: AppProps) {
  return (
    <ReactFlowProvider>
      <AppInner
        onOpenAdminDashboard={onOpenAdminDashboard}
        onBackToProjects={onBackToProjects}
        onGoToReferentiel={onGoToReferentiel}
        readOnly={readOnly}
        readOnlyVersion={readOnlyVersion}
      />
    </ReactFlowProvider>
  );
}

function AppInner({ onOpenAdminDashboard, onBackToProjects, onGoToReferentiel, readOnly, readOnlyVersion }: AppProps) {
  const reactFlow = useReactFlow();
  const { profile, signOut } = useAuth();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [editingInstance, setEditingInstance] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"cables" | "etiquettes" | "labels" | "legend" | "zones">("cables");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // ── Undo / Redo — état du store temporel (zundo) ──────────────────────
  const canUndo = useStore(useAppStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useAppStore.temporal, (s) => s.futureStates.length > 0);

  // ── État onglets ──────────────────────────────────────────────────────
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const addTab = useAppStore((s) => s.addTab);
  const addIPTableTab = useAppStore((s) => s.addIPTableTab);
  const addBayTab = useAppStore((s) => s.addBayTab);
  const removeTab = useAppStore((s) => s.removeTab);
  const reorderTabs = useAppStore((s) => s.reorderTabs);
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const renameTab = useAppStore((s) => s.renameTab);
  const duplicateTab = useAppStore((s) => s.duplicateTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const [addTabMenuOpen, setAddTabMenuOpen] = useState(false);
  const [addTabMenuPos, setAddTabMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [bayCreateOpen, setBayCreateOpen] = useState(false);
  const addTabBtnRef = useRef<HTMLButtonElement>(null);
  const addTabMenuRef = useRef<HTMLDivElement>(null);

  /** Ouvre/ferme le menu et calcule la position du dropdown selon le bouton. */
  const toggleAddTabMenu = () => {
    if (addTabMenuOpen) {
      setAddTabMenuOpen(false);
      return;
    }
    if (addTabBtnRef.current) {
      const rect = addTabBtnRef.current.getBoundingClientRect();
      setAddTabMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setAddTabMenuOpen(true);
  };

  // Onglet actif (utilisé pour basculer entre DiagramCanvas, IPTableEditor et BayCanvas)
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeIsIPTab = activeTab ? isIPTableTab(activeTab) : false;
  const activeIsBayTab = activeTab ? isBayTab(activeTab) : false;

  // Quand on bascule vers un onglet IP ou Baie, si le panneau droit est
  // positionné sur un onglet synoptique-only (câbles/étiquettes/labels),
  // passer automatiquement sur "zones" pour ne pas afficher un panneau vide.
  useEffect(() => {
    if ((activeIsIPTab || activeIsBayTab) &&
        (rightTab === "cables" || rightTab === "etiquettes" || rightTab === "labels")) {
      setRightTab("zones");
    }
  }, [activeIsIPTab, activeIsBayTab, rightTab]);

  // Quand un câble est sélectionné sur le synoptique → basculer sur l'onglet
  // Câbles et ouvrir le panneau s'il était fermé.
  const selectedCableId = useAppStore((s) => s.selectedCableId);
  useEffect(() => {
    if (selectedCableId && !activeIsIPTab && !activeIsBayTab) {
      setRightTab("cables");
      setRightPanelOpen(true);
    }
  }, [selectedCableId, activeIsIPTab, activeIsBayTab]);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");
  const tabInputRef = useRef<HTMLInputElement>(null);

  const addNode = useAppStore((s) => s.addNode);
  const addBlankBlock = useAppStore((s) => s.addBlankBlock);
  const nodes = useAppStore((s) => s.nodes);
  const updateNode = useAppStore((s) => s.updateNode);
  const updateCable = useAppStore((s) => s.updateCable);
  const addTextNode = useAppStore((s) => s.addTextNode);
  const addShapeNode = useAppStore((s) => s.addShapeNode);
  const addImageNode = useAppStore((s) => s.addImageNode);
  const updateProjectMeta = useAppStore((s) => s.updateProjectMeta);
  const setVersionsMeta = useAppStore((s) => s.setVersionsMeta);
  const currentProjectName = useAppStore((s) => s.currentProjectName);
  const setProjectName = useAppStore((s) => s.setProjectName);
  const currentProjectId = useAppStore((s) => s.currentProjectId);

  // Hash de l'état au dernier enregistrement — permet de détecter les vraies modifications
  const lastSavedHash = useRef<string>("");

  // Modal "modifications non sauvegardées"
  const [unsavedModalOpen, setUnsavedModalOpen] = useState(false);
  /** Action à exécuter après confirmation de navigation (enregistrer ou ignorer). */
  const pendingLeaveAction = useRef<(() => void) | null>(null);

  // Infos client/salle liées au projet (chip en en-tête)
  const [linkedRoomInfo, setLinkedRoomInfo] = useState<ProjectRoomInfo | null>(null);

  // Initialise le hash de référence avec l'état chargé depuis la DB.
  // Toute modification ultérieure produira un hash différent.
  useEffect(() => {
    const state = useAppStore.getState();
    const flushedTabs = getFlushedTabs();
    lastSavedHash.current = computeProjectHash(
      flushedTabs,
      state.products,
      state.signals,
      state.accessories,
      state.zones,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleAddTextNode = () => {
    // Position au centre du viewport actuel pour que l'utilisateur voie
    // immédiatement le bloc texte apparaître.
    let position = { x: 200, y: 200 };
    try {
      const vp = reactFlow.getViewport();
      const canvas = document.querySelector(".react-flow") as HTMLElement | null;
      if (canvas) {
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;
        position = {
          x: (cw / 2 - vp.x) / vp.zoom - 100,  // -100 = moitié de la largeur 200
          y: (ch / 2 - vp.y) / vp.zoom - 40,   // -40  = moitié de la hauteur 80
        };
      }
    } catch { /* viewport indisponible, on garde le fallback */ }

    addTextNode({
      position,
      width: 200,
      height: 80,
      content: "",
      fontFamily: "Arial, sans-serif",
      fontSize: 14,
      bold: false,
      italic: false,
      underline: false,
      textAlign: "left",
      color: "#1c1f24",
      // Fond blanc par défaut pour que le bloc soit visible
      background: "#ffffff",
      // Bordure visible par défaut (l'utilisateur pourra la retirer ensuite)
      borderStyle: "solid",
      borderColor: "#888888",
      borderWidth: 1,
      borderRadius: 0,
    });
  };

  const handleAddShapeNode = (shape: "rectangle" | "ellipse" | "cloud") => {
    let position = { x: 200, y: 200 };
    try {
      const vp = reactFlow.getViewport();
      const canvas = document.querySelector(".react-flow") as HTMLElement | null;
      if (canvas) {
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;
        position = {
          x: (cw / 2 - vp.x) / vp.zoom - 100,   // -100 = moitié de la largeur 200
          y: (ch / 2 - vp.y) / vp.zoom - 75,     // -75  = moitié de la hauteur 150
        };
      }
    } catch { /* viewport indisponible, fallback */ }
    addShapeNode(shape, position);
  };

  // ── Modal import image ─────────────────────────────────────────────────
  const [imageImportOpen, setImageImportOpen] = useState(false);

  const handleAddImageNode = () => {
    setImageImportOpen(true);
  };

  const handleAdd = (productId: string) => {
    const offset = nodes.length * 30;
    addNode(productId, { x: 200 + offset, y: 100 + offset });
  };

  const handleAddBlankBlock = () => {
    const offset = nodes.length * 30;
    addBlankBlock({ x: 200 + offset, y: 100 + offset });
  };

  /** Vérifie les modifications non sauvegardées et appelle `action` ou ouvre le modal. */
  const guardedLeave = (action: () => void) => {
    if (readOnly) { action(); return; }
    const state = useAppStore.getState();
    const flushedTabs = getFlushedTabs();
    const currentHash = computeProjectHash(
      flushedTabs,
      state.products,
      state.signals,
      state.accessories,
      state.zones,
    );
    const hasUnsavedChanges = currentHash !== lastSavedHash.current;
    if (hasUnsavedChanges) {
      pendingLeaveAction.current = action;
      setUnsavedModalOpen(true);
      return;
    }
    action();
  };

  const handleBackToProjects = () => guardedLeave(() => onBackToProjects?.());

  const handleGoToClient = (clientId: string) =>
    guardedLeave(() => onGoToReferentiel?.(clientId));

  const handleSave = async (): Promise<boolean> => {
    if (readOnly) return false;
    setSaving(true);
    try {
      const state = useAppStore.getState();
      // Flush l'état de travail dans l'onglet actif avant de sauvegarder
      const flushedTabs = getFlushedTabs();

      // ── Détection de modification réelle ──────────────────────────────
      const currentHash = computeProjectHash(flushedTabs, state.products, state.signals, state.accessories, state.zones);
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
            accessories: state.accessories,
            ipTableColumns: state.ipTableColumns,
            zones: state.zones,
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
          accessories: state.accessories,
          ipTableColumns: state.ipTableColumns,
          zones: state.zones,
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
      return true;
    } catch (e) {
      alert("Erreur de sauvegarde : " + (e instanceof Error ? e.message : String(e)));
      return false;
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
        cables:    state.cables,
        signals:   state.signals,
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
    const signals = state.signals;
    // Filtrer les onglets Tableau IP et Baie — ils ont leur propre export
    const flushedTabs = getFlushedTabs().filter((t) => !isIPTableTab(t) && !isBayTab(t));
    let totalPages = 0;
    for (const tab of flushedTabs) totalPages += computePageRects(tab.nodes).length;

    try {
      setPrinting(true);
      const allPageUrls: string[] = [];
      let pageNum = 1;
      for (const tab of flushedTabs) {
        await switchTabAndWait(tab.id);
        const tabState = useAppStore.getState();
        const nodes = tabState.nodes;
        const cables = tabState.cables;
        const pages = computePageRects(nodes);
        const cartouche = buildCartoucheForTab(tab.id);
        for (const page of pages) {
          allPageUrls.push(
            await captureAndComposePage(reactFlow, page, {
              cartouche,
              pageNum,
              totalPages,
              cables,
              signals,
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

  // Fit view automatique à l'ouverture d'un projet (changement de currentProjectId)
  useEffect(() => {
    if (!currentProjectId) return;
    const s = useAppStore.getState();
    const activeTab = s.tabs.find((t) => t.id === s.activeTabId);
    if (!activeTab || isIPTableTab(activeTab) || isBayTab(activeTab)) return;
    const timer = setTimeout(
      () => reactFlow.fitView({ duration: 300, padding: 0.08 }),
      400,
    );
    return () => clearTimeout(timer);
  }, [currentProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Charge les infos client/salle liées au projet courant (chip en-tête)
  useEffect(() => {
    if (!currentProjectId) { setLinkedRoomInfo(null); return; }
    let cancelled = false;
    getProjectRoomInfo(currentProjectId)
      .then((info) => { if (!cancelled) setLinkedRoomInfo(info); })
      .catch(() => { if (!cancelled) setLinkedRoomInfo(null); });
    return () => { cancelled = true; };
  }, [currentProjectId]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [formattingOpen, setFormattingOpen] = useState(false);
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

  // Fermer le menu "+" au clic extérieur (en excluant le bouton et le menu lui-même)
  useEffect(() => {
    if (!addTabMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (addTabBtnRef.current?.contains(target)) return;
      if (addTabMenuRef.current?.contains(target)) return;
      setAddTabMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [addTabMenuOpen]);

  const handleExportCurrentTab = async (format: "png" | "jpeg" | "svg" | "pdf") => {
    try {
      const state = useAppStore.getState();
      const refLabel =
        state.projectMeta.client?.replace(/[^a-z0-9]+/gi, "-") || "synoptique";
      await exportDiagram(reactFlow, {
        format,
        filename: `${refLabel}.${format}`,
        cartouche: buildCartoucheForTab(state.activeTabId),
        cables:    state.cables,
        signals:   state.signals,
      });
    } catch (e) {
      alert("Echec export : " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleExportAllTabs = async (format: "png" | "jpeg" | "svg" | "pdf") => {
    const state = useAppStore.getState();
    const originalTabId = state.activeTabId;
    const signals = state.signals;
    // Filtrer les onglets Tableau IP et Baie — ils ont leur propre export
    const flushedTabs = getFlushedTabs().filter((t) => !isIPTableTab(t) && !isBayTab(t));
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
          const tabState = useAppStore.getState();
          const nodes = tabState.nodes;
          const cables = tabState.cables;
          const pages = computePageRects(nodes);
          const cartouche = buildCartoucheForTab(tab.id);
          for (const page of pages) {
            allPageUrls.push(
              await captureAndComposePage(reactFlow, page, {
                cartouche,
                pageNum,
                totalPages,
                cables,
                signals,
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
          const tabState = useAppStore.getState();
          const nodes = tabState.nodes;
          const cables = tabState.cables;
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
              cables,
              signals,
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
      {/* ── Sidebar gauche : Catalogue ───────────────────────────────────── */}
      <aside className={`sidebar left${paletteOpen ? "" : " collapsed"}`}>
        {paletteOpen ? (
          <ProductPalette
            onAdd={handleAdd}
            onEdit={(id) => setEditing(id)}
            onNew={() => setEditing("new")}
            onImport={() => setImporting(true)}
            onAddBlankBlock={handleAddBlankBlock}
            onCollapse={() => setPaletteOpen(false)}
          />
        ) : (
          <button
            className="palette-expand-btn"
            onClick={() => {
              setPaletteOpen(true);
              setFormattingOpen(false);
            }}
            title="Afficher le catalogue"
          >
            <span className="palette-expand-icon">▶</span>
            <span className="palette-expand-label">Catalogue</span>
          </button>
        )}
      </aside>

      {/* ── Sidebar gauche : Mises en formes (synoptique uniquement) ─────── */}
      {!activeIsIPTab && !activeIsBayTab && (
        <aside className={`sidebar left formatting-sidebar${formattingOpen ? "" : " collapsed"}`}>
          {formattingOpen ? (
            <FormattingPanel
              onCollapse={() => setFormattingOpen(false)}
              onAutoLayout={handleAutoLayout}
              onAddTextNode={handleAddTextNode}
              onAddShapeNode={handleAddShapeNode}
              onAddImageNode={handleAddImageNode}
            />
          ) : (
            <button
              className="palette-expand-btn"
              onClick={() => {
                setFormattingOpen(true);
                setPaletteOpen(false);
              }}
              title="Afficher les mises en formes"
            >
              <span className="palette-expand-icon">▶</span>
              <span className="palette-expand-label">Mises en formes</span>
            </button>
          )}
        </aside>
      )}

      {/* ── Zone principale : bannière + header + onglets + body ─────────── */}
      <div className="app-main">
        {/* ── Bannière lecture seule ─────────────────────────────────────── */}
        {readOnly && (
          <div className="readonly-banner">
            {readOnlyVersion === 'Mode Lecteur'
              ? '👁 Mode Lecteur — Vous pouvez consulter et exporter ce projet, mais pas le modifier'
              : `🔒 Lecture seule — Version ${readOnlyVersion ?? 'archivée'} — Cette version ne peut pas être modifiée`
            }
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
            <div className="brand">
              <strong>SynoX-AV</strong>
              <em className="brand-author"> by Benoit BARREAU</em>
            </div>
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
            {currentProjectId && !readOnly && linkedRoomInfo && (
              <button
                className="header-room-chip"
                title={`Fiche client : ${linkedRoomInfo.clientName} › ${linkedRoomInfo.siteName} › ${linkedRoomInfo.roomName}`}
                onClick={() => handleGoToClient(linkedRoomInfo.clientId)}
              >
                🏢 {linkedRoomInfo.clientName}
                <span className="header-room-chip-room">· {linkedRoomInfo.roomName}</span>
              </button>
            )}

            <div className="header-separator" />

            {!readOnly && (
              <>
                <button
                  onClick={() => useAppStore.temporal.getState().undo()}
                  disabled={!canUndo}
                  title="Annuler (Ctrl+Z)"
                  className="btn-undo-redo"
                >
                  ↩
                </button>
                <button
                  onClick={() => useAppStore.temporal.getState().redo()}
                  disabled={!canRedo}
                  title="Rétablir (Ctrl+Y)"
                  className="btn-undo-redo"
                >
                  ↪
                </button>
                <button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className={`btn-save${savedOk ? " btn-saved" : ""}`}
                  title="Sauvegarder dans le cloud"
                >
                  {saving ? "Sauvegarde…" : savedOk ? "Sauvegardé ✓" : "Sauvegarder"}
                </button>
              </>
            )}
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
              data-kind={tab.kind ?? 'synoptic'}
              className={`tab-item${activeTabId === tab.id ? " active" : ""}${dragTabId === tab.id ? " tab-dragging" : ""}${dragOverTabId === tab.id && dragOverTabId !== dragTabId ? " tab-drag-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (tab.id !== dragTabId) setDragOverTabId(tab.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragTabId && dragTabId !== tab.id) reorderTabs(dragTabId, tab.id);
                setDragTabId(null);
                setDragOverTabId(null);
              }}
              onDragEnd={() => { setDragTabId(null); setDragOverTabId(null); }}
            >
              {/* Poignée de glissement dédiée */}
              <span
                className="tab-drag-handle"
                draggable
                onDragStart={(e) => {
                  setDragTabId(tab.id);
                  e.dataTransfer.setData("text/plain", tab.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => { setDragTabId(null); setDragOverTabId(null); }}
                title="Glisser pour réorganiser"
              >
                ⠿
              </span>
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
                  draggable={false}
                  onClick={() => {
                    setActiveTab(tab.id);
                    // Fit view automatique sur les onglets synoptiques uniquement
                    if (!isIPTableTab(tab) && !isBayTab(tab)) {
                      requestAnimationFrame(() =>
                        requestAnimationFrame(() =>
                          setTimeout(() => reactFlow.fitView({ duration: 300, padding: 0.08 }), 50)
                        )
                      );
                    }
                  }}
                  onDoubleClick={() => startTabEdit(tab.id, tab.name)}
                  title="Double-clic pour renommer"
                >
                  <span className="tab-kind-icon" aria-hidden>
                    {isIPTableTab(tab) ? '⊞' : isBayTab(tab) ? '☰' : '⬡'}
                  </span>
                  {tab.name}
                </button>
              )}
              {!isIPTableTab(tab) && (
                <button
                  className="tab-dup"
                  draggable={false}
                  onClick={() => duplicateTab(tab.id)}
                  title={isBayTab(tab) ? "Dupliquer cette baie" : "Dupliquer ce synoptique"}
                >
                  ⎘
                </button>
              )}
              {tabs.length > 1 && (
                <button
                  className="tab-close"
                  draggable={false}
                  onClick={() => removeTab(tab.id)}
                  title="Fermer ce synoptique"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            ref={addTabBtnRef}
            className="tab-add"
            onClick={toggleAddTabMenu}
            title="Ajouter un onglet"
          >
            +
          </button>
        </div>

        {/* Menu d'ajout d'onglet (rendu via portail pour éviter le clipping
            par le overflow du tab-bar). */}
        {addTabMenuOpen && addTabMenuPos &&
          createPortal(
            <div
              ref={addTabMenuRef}
              className="tab-add-menu"
              style={{
                position: "fixed",
                top: addTabMenuPos.top,
                left: addTabMenuPos.left,
              }}
            >
              <button
                onClick={() => {
                  setAddTabMenuOpen(false);
                  addTab();
                }}
              >
                <strong>+ Synoptique</strong>
                <small>Canvas graphique avec produits et câbles</small>
              </button>
              <button
                onClick={() => {
                  setAddTabMenuOpen(false);
                  addIPTableTab();
                }}
              >
                <strong>+ Tableau IP</strong>
                <small>Tableur des équipements réseau (IP, MAC, login…)</small>
              </button>
              <button
                onClick={() => {
                  setAddTabMenuOpen(false);
                  setBayCreateOpen(true);
                }}
              >
                <strong>+ Baie</strong>
                <small>Plan de câblage en rack (19"/10", 6U à 48U)</small>
              </button>
            </div>,
            document.body,
          )}

        {/* ── Canvas + panneau droit ─────────────────────────────────────── */}
        <div className={`app-body${rightPanelOpen ? "" : " right-collapsed"}`}>
          {/* key=activeTabId force le remontage lors du changement d'onglet */}
          <main className="canvas" key={activeTabId}>
            {activeIsIPTab ? (
              <IPTableEditor tabId={activeTabId} />
            ) : activeIsBayTab ? (
              <>
                <BayCanvas tabId={activeTabId} />
                <Cartouche />
              </>
            ) : (
              <>
                <DiagramCanvas onEditInstance={(id) => setEditingInstance(id)} />
                <Cartouche />
              </>
            )}
          </main>

          {/* Sidebar droite — visible pour tous les types d'onglet.
              Pour IP et Baie seuls les onglets Zones et Légende sont affichés
              (Câbles / Étiquettes / Labels n'ont pas de sens hors synoptique). */}
          <aside className={`sidebar right${rightPanelOpen ? "" : " collapsed"}`}>
            {rightPanelOpen ? (
              <>
                <div className="right-panel-topbar">
                  <div className="tabs">
                    {/* Onglets synoptique uniquement */}
                    {!activeIsIPTab && !activeIsBayTab && (
                      <>
                        <button className={rightTab === "cables" ? "active" : ""} onClick={() => setRightTab("cables")}>
                          Câbles
                        </button>
                        <button className={rightTab === "etiquettes" ? "active" : ""} onClick={() => setRightTab("etiquettes")}>
                          Etiquettes
                        </button>
                        <button className={rightTab === "labels" ? "active" : ""} onClick={() => setRightTab("labels")}>
                          Label
                        </button>
                      </>
                    )}
                    {/* Zones et Légende : communs à tous les types */}
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
                {rightTab === "cables" && !activeIsIPTab && !activeIsBayTab && <CableList />}
                {rightTab === "etiquettes" && !activeIsIPTab && !activeIsBayTab && <EtiquettesList />}
                {rightTab === "labels" && !activeIsIPTab && !activeIsBayTab && <ProductLabelsList />}
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

      {bayCreateOpen && (
        <BayCreateModal
          onConfirm={({ name, widthInch, heightU }) => {
            setBayCreateOpen(false);
            addBayTab({ name, widthInch, heightU });
          }}
          onCancel={() => setBayCreateOpen(false)}
        />
      )}
      {editing !== null && (
        <ProductEditor productId={editing} onClose={() => setEditing(null)} onSwitchTo={(id) => setEditing(id)} />
      )}
      {editingInstance !== null && (
        <InstancePortsConfig nodeId={editingInstance} onClose={() => setEditingInstance(null)} />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {adminOpen && <AdminSettings onClose={() => setAdminOpen(false)} />}
      {imageImportOpen && (
        <ImageImportModal
          onClose={() => setImageImportOpen(false)}
          onInsert={(src, srcType, layer) => {
            let position = { x: 200, y: 200 };
            try {
              const vp = reactFlow.getViewport();
              const canvas = document.querySelector(".react-flow") as HTMLElement | null;
              if (canvas) {
                const cw = canvas.clientWidth;
                const ch = canvas.clientHeight;
                position = {
                  x: (cw / 2 - vp.x) / vp.zoom - 150,
                  y: (ch / 2 - vp.y) / vp.zoom - 100,
                };
              }
            } catch { /* fallback */ }
            addImageNode({
              position,
              width: 300,
              height: 200,
              src,
              srcType,
              layer,
              borderStyle: "none",
              borderColor: "#000000",
              borderWidth: 0,
              borderRadius: 0,
              opacity: 1,
            });
            setImageImportOpen(false);
          }}
        />
      )}
      {unsavedModalOpen && (
        <UnsavedChangesModal
          saving={saving}
          onSaveAndLeave={() => {
            void handleSave().then((success) => {
              if (success) {
                setUnsavedModalOpen(false);
                pendingLeaveAction.current?.();
                pendingLeaveAction.current = null;
              }
              // Si success=false, l'alert interne a déjà informé l'utilisateur
              // → on reste sur la page avec le modal ouvert
            });
          }}
          onIgnoreAndLeave={() => {
            setUnsavedModalOpen(false);
            pendingLeaveAction.current?.();
            pendingLeaveAction.current = null;
          }}
          onCancel={() => {
            setUnsavedModalOpen(false);
            pendingLeaveAction.current = null;
          }}
        />
      )}
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

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
import { useAppStore } from "./store";
import { layoutNodes } from "./layout";
import { exportDiagram } from "./export";
import { useAuth } from "./auth/useAuth";

export default function App({ onOpenAdminDashboard }: { onOpenAdminDashboard?: () => void }) {
  return (
    <ReactFlowProvider>
      <AppInner onOpenAdminDashboard={onOpenAdminDashboard} />
    </ReactFlowProvider>
  );
}

function AppInner({ onOpenAdminDashboard }: { onOpenAdminDashboard?: () => void }) {
  const reactFlow = useReactFlow();
  const { profile } = useAuth();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [editingInstance, setEditingInstance] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [rightTab, setRightTab] = useState<
    "cables" | "etiquettes" | "legend" | "zones"
  >("cables");

  const addNode = useAppStore((s) => s.addNode);
  const nodes = useAppStore((s) => s.nodes);
  const resetProject = useAppStore((s) => s.resetProject);
  const updateNode = useAppStore((s) => s.updateNode);
  const updateCable = useAppStore((s) => s.updateCable);

  const handleAutoLayout = () => {
    const state = useAppStore.getState();
    const positions = layoutNodes(state.nodes, state.cables, state.products);
    for (const p of positions) {
      updateNode(p.id, { position: { x: p.x, y: p.y } });
    }
    for (const c of state.cables) {
      if (c.labelOffset || (c.waypoints && c.waypoints.length > 0)) {
        updateCable(c.id, {
          labelOffset: { x: 0, y: 0 },
          waypoints: [],
        });
      }
    }
  };

  const handleAdd = (productId: string) => {
    const offset = nodes.length * 30;
    addNode(productId, { x: 200 + offset, y: 100 + offset });
  };

  const exportProject = () => {
    const state = useAppStore.getState();
    const data = JSON.stringify(
      { products: state.products, nodes: state.nodes, cables: state.cables },
      null,
      2,
    );
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "synoptique.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as Node)
      ) {
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
        useAppStore.getState().projectMeta.client?.replace(/[^a-z0-9]+/gi, "-") ||
        "synoptique";
      await exportDiagram(reactFlow, {
        format,
        filename: `${refLabel}.${format}`,
      });
    } catch (e) {
      alert(
        "Échec de l'export : " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">Générateur de synoptiques Audiovisuel</div>
        <div className="header-actions">
          <button onClick={handleAutoLayout} title="Replacer les produits pour minimiser les croisements">
            Réorganiser
          </button>
          <div className="export-menu" ref={exportMenuRef}>
            <button onClick={() => setExportMenuOpen((v) => !v)}>
              Exporter ▾
            </button>
            {exportMenuOpen && (
              <div className="export-dropdown">
                <button onClick={() => { setExportMenuOpen(false); exportProject(); }}>
                  JSON (projet complet)
                </button>
                <button onClick={() => handleExport("png")}>PNG</button>
                <button onClick={() => handleExport("jpeg")}>JPEG</button>
                <button onClick={() => handleExport("svg")}>
                  SVG (Visio, AutoCAD)
                </button>
                <button onClick={() => handleExport("pdf")}>PDF</button>
              </div>
            )}
          </div>
          {profile?.role === 'admin' && onOpenAdminDashboard && (
            <button onClick={onOpenAdminDashboard} title="Tableau de bord administrateur">
              Tableau de bord
            </button>
          )}
          <button onClick={() => setAdminOpen(true)} title="Mon compte">
            ⚙ Mon compte
          </button>
          <button
            className="danger"
            onClick={() => {
              if (confirm("Vider le synoptique en cours ?")) resetProject();
            }}
          >
            Réinitialiser
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar left">
          <ProductPalette
            onAdd={handleAdd}
            onEdit={(id) => setEditing(id)}
            onNew={() => setEditing("new")}
            onImport={() => setImporting(true)}
          />
        </aside>

        <main className="canvas">
          <DiagramCanvas onEditInstance={(id) => setEditingInstance(id)} />
          <Cartouche />
        </main>

        <aside className="sidebar right">
          <div className="tabs">
            <button
              className={rightTab === "cables" ? "active" : ""}
              onClick={() => setRightTab("cables")}
            >
              Câbles
            </button>
            <button
              className={rightTab === "etiquettes" ? "active" : ""}
              onClick={() => setRightTab("etiquettes")}
            >
              Etiquettes
            </button>
            <button
              className={rightTab === "zones" ? "active" : ""}
              onClick={() => setRightTab("zones")}
            >
              Zones
            </button>
            <button
              className={rightTab === "legend" ? "active" : ""}
              onClick={() => setRightTab("legend")}
            >
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
        <ProductEditor
          productId={editing}
          onClose={() => setEditing(null)}
          onSwitchTo={(id) => setEditing(id)}
        />
      )}
      {editingInstance !== null && (
        <InstancePortsConfig
          nodeId={editingInstance}
          onClose={() => setEditingInstance(null)}
        />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {adminOpen && <AdminSettings onClose={() => setAdminOpen(false)} />}
    </div>
  );
}

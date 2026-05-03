import { useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { DiagramCanvas } from "./components/DiagramCanvas";
import { ProductPalette } from "./components/ProductPalette";
import { ProductEditor } from "./components/ProductEditor";
import { ImportDialog } from "./components/ImportDialog";
import { CableList } from "./components/CableList";
import { Legend } from "./components/Legend";
import { Cartouche } from "./components/Cartouche";
import { useAppStore } from "./store";

export default function App() {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [rightTab, setRightTab] = useState<"cables" | "legend">("cables");

  const addNode = useAppStore((s) => s.addNode);
  const nodes = useAppStore((s) => s.nodes);
  const resetProject = useAppStore((s) => s.resetProject);

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

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">Générateur de synoptiques AV</div>
        <div className="header-actions">
          <button onClick={exportProject}>Exporter projet</button>
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
          <ReactFlowProvider>
            <DiagramCanvas />
          </ReactFlowProvider>
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
              className={rightTab === "legend" ? "active" : ""}
              onClick={() => setRightTab("legend")}
            >
              Légende
            </button>
          </div>
          {rightTab === "cables" ? <CableList /> : <Legend />}
        </aside>
      </div>

      {editing !== null && (
        <ProductEditor productId={editing} onClose={() => setEditing(null)} />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

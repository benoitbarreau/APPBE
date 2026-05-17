import { useState } from "react";
import { useAppStore } from "../../store";
import { ensureRacks, isBayTab } from "../../types";
import type { CartoucheData } from "../../export";
import { BayProductLibrary } from "./BayProductLibrary";
import { RackView } from "./RackView";
import { BayItemProperties } from "./BayItemProperties";
import { BayCreateModal } from "./BayCreateModal";
import { BayExportMenu } from "./BayExportMenu";

interface BayCanvasProps {
  tabId: string;
}

export function BayCanvas({ tabId }: BayCanvasProps) {
  const tabs = useAppStore((s) => s.tabs);
  const syncBayItems = useAppStore((s) => s.syncBayItems);
  const addRackToTab = useAppStore((s) => s.addRackToTab);
  const removeRackFromTab = useAppStore((s) => s.removeRackFromTab);
  const projectMeta = useAppStore((s) => s.projectMeta);
  const currentProjectName = useAppStore((s) => s.currentProjectName);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeRackId, setActiveRackId] = useState<string | null>(null);
  const [addRackOpen, setAddRackOpen] = useState(false);
  const [synced, setSynced] = useState(false);

  const tab = tabs.find((t) => t.id === tabId);
  if (!tab || !isBayTab(tab)) return null;

  const racks = ensureRacks(tab);
  const effectiveRackId = activeRackId ?? racks[0]?.id ?? "";

  const handleSelectItem = (rackId: string, itemId: string | null) => {
    setSelectedItemId(itemId);
    if (itemId) setActiveRackId(rackId);
  };

  const handleSync = () => {
    syncBayItems(tabId);
    setSynced(true);
    setTimeout(() => setSynced(false), 2000);
  };

  const totalItems = racks.reduce((n, r) => n + r.items.length, 0);
  const selectedRack = racks.find((r) => r.id === activeRackId) ?? null;

  // Identique à buildCartoucheForTab dans App.tsx (champ "lot" = nom de l'onglet)
  const cartouche: CartoucheData = {
    client:     projectMeta.client,
    lieu:       projectMeta.lieu,
    campus:     currentProjectName || projectMeta.campus || "Sans titre",
    tabName:    tab.name,
    date:       projectMeta.date || new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    authorName: projectMeta.authorName,
    version:    projectMeta.version || "V1.0",
  };

  return (
    <div className="bay-canvas">
      {/* ── Info bar ─────────────────────────────────────────────────────── */}
      <div className="bay-infobar">
        <span className="bay-infobar-label">
          {racks.length} baie{racks.length > 1 ? "s" : ""}
        </span>
        <span className="bay-infobar-hint">
          Glisser un équipement depuis la bibliothèque · Cliquer sur une baie pour la sélectionner
        </span>
        <span className="bay-infobar-count">
          {totalItems} équipement{totalItems > 1 ? "s" : ""}
        </span>
        <button
          className={`bay-sync-btn${synced ? " synced" : ""}`}
          onClick={handleSync}
          title="Resynchroniser les labels et références depuis les synoptiques"
        >
          {synced ? "✓ Synchronisé" : "⟳ Synchroniser"}
        </button>
        <BayExportMenu racks={racks} cartouche={cartouche} tabName={tab.name} />
      </div>

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div className="bay-layout">
        <BayProductLibrary tabId={tabId} activeRackId={effectiveRackId} />

        <div className="bay-center">
          <div className="bay-racks-row">
            {racks.map((rack) => (
              <RackView
                key={rack.id}
                tab={tab}
                rack={rack}
                selectedItemId={selectedItemId}
                onSelectItem={(itemId) => handleSelectItem(rack.id, itemId)}
                onRackClick={() => setActiveRackId(rack.id)}
                canDelete={racks.length > 1}
                onDeleteRack={() => {
                  if (activeRackId === rack.id) {
                    setSelectedItemId(null);
                    setActiveRackId(null);
                  }
                  removeRackFromTab(tabId, rack.id);
                }}
                isActive={effectiveRackId === rack.id}
              />
            ))}

            {/* Bouton ajouter une baie */}
            <div className="bay-add-rack-col">
              <button
                className="bay-add-rack-btn"
                onClick={() => setAddRackOpen(true)}
                title="Ajouter une baie dans cet onglet"
              >
                <span className="bay-add-rack-icon">+</span>
                Ajouter une baie
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal propriétés (portail vers document.body) */}
      <BayItemProperties
        tab={tab}
        rack={selectedRack}
        selectedItemId={selectedItemId}
        onDeselect={() => { setSelectedItemId(null); }}
      />

      {/* Modal ajout baie */}
      {addRackOpen && (
        <BayCreateModal
          title="Ajouter une baie"
          defaultName={`Baie ${racks.length + 1}`}
          onConfirm={({ name, widthInch, heightU }) => {
            const newId = addRackToTab(tabId, { name, widthInch, heightU });
            setActiveRackId(newId);
            setAddRackOpen(false);
          }}
          onCancel={() => setAddRackOpen(false)}
        />
      )}
    </div>
  );
}

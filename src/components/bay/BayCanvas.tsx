import { useMemo, useState } from "react";
import { useAppStore } from "../../store";
import { useEditorState } from "../../store";
import { ensureRacks, isBayTab, isSynopticTab } from "../../types";
import { rackResizeProblem } from "../../lib/rackLayout";
import { confirmDialog, notify } from "../dialogs/dialogStore";
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
  const updateRack = useAppStore((s) => s.updateRack);
  const projectMeta = useAppStore((s) => s.projectMeta);
  const currentProjectName = useAppStore((s) => s.currentProjectName);
  const readOnly = useEditorState((s) => s.readOnly);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeRackId, setActiveRackId] = useState<string | null>(null);
  const [addRackOpen, setAddRackOpen] = useState(false);
  const [editingRackId, setEditingRackId] = useState<string | null>(null);
  const [editRackError, setEditRackError] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);

  // Nœuds encore présents dans les synoptiques : un équipement « synoptique »
  // dont le nœud a disparu est signalé orphelin dans la baie.
  const synopticNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tabs) if (isSynopticTab(t)) for (const n of t.nodes ?? []) ids.add(n.id);
    return ids;
  }, [tabs]);

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
          {readOnly
            ? "👁 Mode Lecteur — consultation et export uniquement"
            : "Glisser un équipement depuis la bibliothèque · Cliquer sur une baie pour la sélectionner"}
        </span>
        <span className="bay-infobar-count">
          {totalItems} équipement{totalItems > 1 ? "s" : ""}
        </span>
        {!readOnly && (
          <button
            className={`bay-sync-btn${synced ? " synced" : ""}`}
            onClick={handleSync}
            title="Resynchroniser les labels et références depuis les synoptiques"
          >
            {synced ? "✓ Synchronisé" : "⟳ Synchroniser"}
          </button>
        )}
        <BayExportMenu racks={racks} cartouche={cartouche} tabName={tab.name} />
      </div>

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div className="bay-layout">
        {/* Bibliothèque masquée en mode lecteur */}
        {!readOnly && <BayProductLibrary tabId={tabId} activeRackId={effectiveRackId} />}

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
                canDelete={!readOnly && racks.length > 1}
                onDeleteRack={async () => {
                  // Le verrou protège aussi de la suppression de la baie entière.
                  const lockedCount = rack.items.filter((it) => it.locked).length;
                  if (lockedCount > 0) {
                    notify(`La baie « ${rack.name} » contient ${lockedCount} équipement(s) verrouillé(s) : déverrouillez-les avant de la supprimer.`, "error");
                    return;
                  }
                  // Supprimer une baie efface ses équipements : toujours confirmé.
                  const n = rack.items.length;
                  const ok = await confirmDialog({
                    title: `Supprimer la baie « ${rack.name} » ?`,
                    message: n > 0
                      ? `Ses ${n} équipement(s) et leurs annotations seront supprimés. Cette action ne s'annule pas.`
                      : "Cette action ne s'annule pas.",
                    confirmLabel: "🗑 Supprimer la baie",
                    danger: true,
                  });
                  if (!ok) return;
                  if (activeRackId === rack.id) {
                    setSelectedItemId(null);
                    setActiveRackId(null);
                  }
                  removeRackFromTab(tabId, rack.id);
                }}
                onEditRack={() => { setEditRackError(null); setEditingRackId(rack.id); }}
                synopticNodeIds={synopticNodeIds}
                isActive={effectiveRackId === rack.id}
                readOnly={readOnly}
              />
            ))}

            {/* Bouton ajouter une baie — masqué en mode lecteur */}
            {!readOnly && (
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
            )}
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

      {/* Modal modification baie */}
      {editingRackId && (() => {
        const rack = racks.find((r) => r.id === editingRackId);
        if (!rack) return null;
        return (
          <BayCreateModal
            title="Modifier la baie"
            confirmLabel="Enregistrer"
            showNumbering
            initial={{ name: rack.name, widthInch: rack.widthInch, heightU: rack.heightU, numberingFromBottom: rack.numberingFromBottom }}
            error={editRackError}
            onConfirm={(values) => {
              if (updateRack(tabId, rack.id, values)) {
                setEditingRackId(null);
                setEditRackError(null);
                return;
              }
              setEditRackError(
                rackResizeProblem(rack, values.heightU)
                  ?? "Un équipement 19\" ne rentre pas dans une baie 10\" : retirez-le ou gardez le format 19\".",
              );
            }}
            onCancel={() => { setEditingRackId(null); setEditRackError(null); }}
          />
        );
      })()}

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

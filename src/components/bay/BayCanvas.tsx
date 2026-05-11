import { useState } from "react";
import { useAppStore } from "../../store";
import { isBayTab } from "../../types";
import { BayProductLibrary } from "./BayProductLibrary";
import { RackView } from "./RackView";
import { BayItemProperties } from "./BayItemProperties";

interface BayCanvasProps {
  tabId: string;
}

export function BayCanvas({ tabId }: BayCanvasProps) {
  const tabs = useAppStore((s) => s.tabs);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const tab = tabs.find((t) => t.id === tabId);
  if (!tab || !isBayTab(tab)) return null;

  return (
    <div className="bay-canvas">
      {/* ── Info bar ─────────────────────────────────────────────────────── */}
      <div className="bay-infobar">
        <span className="bay-infobar-label">
          Baie {tab.bayWidthInch ?? 19}" · {tab.bayHeightU ?? 42}U
        </span>
        <span className="bay-infobar-hint">
          Glisser un équipement depuis la bibliothèque sur la baie, ou cliquer pour ajouter en bas.
        </span>
        <span className="bay-infobar-count">
          {(tab.bayItems ?? []).length} équipement{(tab.bayItems ?? []).length > 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div className="bay-layout">
        <BayProductLibrary tabId={tabId} />

        <div className="bay-center">
          <RackView
            tab={tab}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
          />
        </div>

        <BayItemProperties
          tab={tab}
          selectedItemId={selectedItemId}
          onDeselect={() => setSelectedItemId(null)}
        />
      </div>
    </div>
  );
}

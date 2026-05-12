import { useMemo } from "react";
import { useAppStore } from "../store";
import { isSynopticTab, type Cable } from "../types";

export function CableList() {
  const tabs        = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const activeCables = useAppStore((s) => s.cables);
  const activeNodes  = useAppStore((s) => s.nodes);
  const products     = useAppStore((s) => s.products);
  const updateCable  = useAppStore((s) => s.updateCable);
  const removeCable  = useAppStore((s) => s.removeCable);
  const reverseCable = useAppStore((s) => s.reverseCable);
  const selectedCableId = useAppStore((s) => s.selectedCableId);

  /** Câbles de tous les synoptiques, groupés par onglet. */
  const groups = useMemo(() => {
    return tabs
      .filter(isSynopticTab)
      .map((t) => {
        const isActive = t.id === activeTabId;
        const cables = isActive ? activeCables : (t.cables ?? []);
        const nodes  = isActive ? activeNodes  : (t.nodes  ?? []);

        const rows = cables.map((c) => {
          const fromNode    = nodes.find((n) => n.id === c.fromNodeId);
          const toNode      = nodes.find((n) => n.id === c.toNodeId);
          const fromProduct = products.find((p) => p.id === fromNode?.productId);
          const toProduct   = products.find((p) => p.id === toNode?.productId);
          const allFromPorts = [
            ...(fromProduct?.outputs ?? []),
            ...(fromProduct?.middle  ?? []),
          ];
          const allToPorts = [
            ...(toProduct?.inputs  ?? []),
            ...(toProduct?.middle  ?? []),
          ];
          const fromPort = allFromPorts.find((p) => p.id === c.fromPortId);
          const toPort   = allToPorts.find((p) => p.id === c.toPortId);
          return {
            cable: c,
            from: `${fromNode?.name ?? "?"} • ${fromPort?.label ?? "?"}`,
            to:   `${toNode?.name   ?? "?"} • ${toPort?.label   ?? "?"}`,
          };
        });

        return { tabId: t.id, tabName: t.name, editable: isActive, rows };
      })
      .filter((g) => g.rows.length > 0);
  }, [tabs, activeTabId, activeCables, activeNodes, products]);

  /** Récapitulatif global (tous synoptiques). */
  const summary = useMemo(() => {
    const map = new Map<string, { count: number; meters: number }>();
    for (const g of groups) {
      for (const { cable: c } of g.rows) {
        const key = c.cableType;
        const cur = map.get(key) ?? { count: 0, meters: 0 };
        cur.count  += 1;
        cur.meters += Number(c.lengthMeters || 0);
        map.set(key, cur);
      }
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [groups]);

  const totalCables = groups.reduce((n, g) => n + g.rows.length, 0);

  const exportCsv = () => {
    const header = ["N°", "Synoptique", "Type de câble", "Signal", "De", "Vers", "Longueur (m)", "Libellé"].join(";");
    const lines: string[] = [];
    for (const g of groups) {
      for (const { cable: c, from, to } of g.rows) {
        lines.push(
          [c.number, g.tabName, c.cableType, c.signal, from, to, c.lengthMeters ?? "", c.label ?? ""]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(";"),
        );
      }
    }
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "liste-cables.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cable-list">
      <div className="cable-list-header">
        <h3>Liste des câbles ({totalCables})</h3>
        <button onClick={exportCsv} disabled={!totalCables}>Export CSV</button>
      </div>

      {summary.length > 0 && (
        <div className="cable-summary">
          <h4>Récapitulatif</h4>
          <table>
            <thead>
              <tr><th>Type</th><th>Quantité</th><th>Longueur totale</th></tr>
            </thead>
            <tbody>
              {summary.map(([type, s]) => (
                <tr key={type}>
                  <td>{type}</td>
                  <td>{s.count}</td>
                  <td>{s.meters} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="cable-rows">
        {groups.map((g) => (
          <div key={g.tabId}>
            {/* En-tête de section par synoptique */}
            <div className="cable-tab-section">
              <span className={`cable-tab-badge${g.editable ? " active" : ""}`}>
                {g.tabName}
              </span>
              {!g.editable && (
                <span className="cable-tab-hint">Basculer sur cet onglet pour modifier</span>
              )}
            </div>

            {g.rows.map(({ cable, from, to }) => (
              <CableRow
                key={cable.id}
                cable={cable}
                from={from}
                to={to}
                selected={cable.id === selectedCableId}
                editable={g.editable}
                onChange={(patch) => updateCable(cable.id, patch)}
                onRemove={() => removeCable(cable.id)}
                onReverse={() => reverseCable(cable.id)}
              />
            ))}
          </div>
        ))}

        {totalCables === 0 && (
          <div className="muted">Tracez une liaison entre deux ports sur le synoptique.</div>
        )}
      </div>
    </div>
  );
}

function CableRow({
  cable, from, to, selected, editable, onChange, onRemove, onReverse,
}: {
  cable: Cable;
  from: string;
  to: string;
  selected: boolean;
  editable: boolean;
  onChange: (patch: Partial<Cable>) => void;
  onRemove: () => void;
  onReverse: () => void;
}) {
  const color = useAppStore((s) => s.signals[cable.signal]?.color) ?? "#888";

  return (
    <div className={`cable-row${selected ? " selected" : ""}${!editable ? " cable-row-readonly" : ""}`}>
      <div className="cable-row-top">
        <span className="cable-number" style={{ background: color, color: "#fff" }} title="Numérotation auto">
          {cable.number}
        </span>
        {editable ? (
          <input
            className="cable-type"
            value={cable.cableType}
            onChange={(e) => onChange({ cableType: e.target.value })}
          />
        ) : (
          <span className="cable-type cable-ro">{cable.cableType}</span>
        )}
        {editable ? (
          <input
            type="number" min={0} step={0.5} className="cable-length"
            value={cable.lengthMeters ?? ""} placeholder="—"
            onChange={(e) => {
              const v = e.target.value;
              onChange({ lengthMeters: v === "" ? undefined : Number(v) });
            }}
          />
        ) : (
          <span className="cable-length cable-ro">{cable.lengthMeters ?? "—"}</span>
        )}
        <span className="muted">m</span>
        {editable && <button onClick={onRemove} title="Supprimer">✕</button>}
      </div>
      <div className="cable-row-bottom">
        <span>{cable.reversed ? to : from}</span>
        <button
          className="cable-row-reverse"
          onClick={editable ? onReverse : undefined}
          title={editable ? "Inverser le sens de la flèche" : undefined}
          disabled={!editable}
        >
          {cable.reversed ? "←" : "→"}
        </button>
        <span>{cable.reversed ? from : to}</span>
      </div>
      {editable ? (
        <input
          className="cable-label"
          placeholder="Etiquette cable (ex. IP1 - VIGNETTAGE)"
          value={cable.label ?? ""}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      ) : (
        cable.label && <div className="cable-label cable-ro">{cable.label}</div>
      )}
    </div>
  );
}

import { useMemo } from "react";
import { useAppStore } from "../store";
import { type Cable } from "../types";

export function CableList() {
  const cables = useAppStore((s) => s.cables);
  const nodes = useAppStore((s) => s.nodes);
  const products = useAppStore((s) => s.products);
  const updateCable = useAppStore((s) => s.updateCable);
  const removeCable = useAppStore((s) => s.removeCable);
  const reverseCable = useAppStore((s) => s.reverseCable);
  const selectedCableId = useAppStore((s) => s.selectedCableId);

  const rows = useMemo(
    () =>
      cables.map((c) => {
        const fromNode = nodes.find((n) => n.id === c.fromNodeId);
        const toNode = nodes.find((n) => n.id === c.toNodeId);
        const fromProduct = products.find((p) => p.id === fromNode?.productId);
        const toProduct = products.find((p) => p.id === toNode?.productId);
        const fromPort = fromProduct?.outputs.find((p) => p.id === c.fromPortId);
        const toPort = toProduct?.inputs.find((p) => p.id === c.toPortId);
        return {
          cable: c,
          from: `${fromNode?.name ?? "?"} • ${fromPort?.label ?? "?"}`,
          to: `${toNode?.name ?? "?"} • ${toPort?.label ?? "?"}`,
        };
      }),
    [cables, nodes, products],
  );

  const summary = useMemo(() => {
    const map = new Map<string, { count: number; meters: number }>();
    for (const c of cables) {
      const key = c.cableType;
      const cur = map.get(key) ?? { count: 0, meters: 0 };
      cur.count += 1;
      cur.meters += Number(c.lengthMeters || 0);
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [cables]);

  const exportCsv = () => {
    const header = [
      "N°",
      "Type de câble",
      "Signal",
      "De",
      "Vers",
      "Longueur (m)",
      "Libellé",
    ].join(";");
    const lines = rows.map(({ cable, from, to }) =>
      [
        cable.number,
        cable.cableType,
        cable.signal,
        from,
        to,
        cable.lengthMeters,
        cable.label ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liste-cables.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cable-list">
      <div className="cable-list-header">
        <h3>Liste des câbles ({cables.length})</h3>
        <button onClick={exportCsv} disabled={!cables.length}>
          Export CSV
        </button>
      </div>

      {summary.length > 0 && (
        <div className="cable-summary">
          <h4>Récapitulatif</h4>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Quantité</th>
                <th>Longueur totale</th>
              </tr>
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
        {rows.map(({ cable, from, to }) => (
          <CableRow
            key={cable.id}
            cable={cable}
            from={from}
            to={to}
            selected={cable.id === selectedCableId}
            onChange={(patch) => updateCable(cable.id, patch)}
            onRemove={() => removeCable(cable.id)}
            onReverse={() => reverseCable(cable.id)}
          />
        ))}
        {rows.length === 0 && (
          <div className="muted">
            Tracez une liaison entre deux ports sur le synoptique.
          </div>
        )}
      </div>
    </div>
  );
}

function CableRow({
  cable,
  from,
  to,
  selected,
  onChange,
  onRemove,
  onReverse,
}: {
  cable: Cable;
  from: string;
  to: string;
  selected: boolean;
  onChange: (patch: Partial<Cable>) => void;
  onRemove: () => void;
  onReverse: () => void;
}) {
  const color = useAppStore((s) => s.signals[cable.signal]?.color) ?? "#888";
  return (
    <div className={"cable-row" + (selected ? " selected" : "")}>
      <div className="cable-row-top">
        <span
          className="cable-number"
          style={{ background: color, color: "#fff" }}
          title="Numérotation auto"
        >
          {cable.number}
        </span>
        <input
          className="cable-type"
          value={cable.cableType}
          onChange={(e) => onChange({ cableType: e.target.value })}
        />
        <input
          type="number"
          min={0}
          step={0.5}
          className="cable-length"
          value={cable.lengthMeters}
          onChange={(e) => onChange({ lengthMeters: Number(e.target.value) })}
        />
        <span className="muted">m</span>
        <button onClick={onRemove} title="Supprimer">
          ✕
        </button>
      </div>
      <div className="cable-row-bottom">
        <span>{cable.reversed ? to : from}</span>
        <button
          className="cable-row-reverse"
          onClick={onReverse}
          title="Inverser le sens de la flèche"
        >
          {cable.reversed ? "←" : "→"}
        </button>
        <span>{cable.reversed ? from : to}</span>
      </div>
      <input
        className="cable-label"
        placeholder="Libellé optionnel (ex. IP1 - VIGNETTAGE)"
        value={cable.label ?? ""}
        onChange={(e) => onChange({ label: e.target.value })}
      />
    </div>
  );
}

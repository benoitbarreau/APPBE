import { useMemo } from "react";
import { useAppStore } from "../store";
import { defaultPlacement, getEffectivePlacement } from "../ports";
import type { PortPlacement } from "../types";

const PLACEMENTS: { value: PortPlacement; label: string }[] = [
  { value: "left", label: "Gauche" },
  { value: "right", label: "Droite" },
  { value: "middle", label: "Milieu" },
];

export function InstancePortsConfig({
  nodeId,
  onClose,
}: {
  nodeId: string;
  onClose: () => void;
}) {
  const node = useAppStore((s) => s.nodes.find((n) => n.id === nodeId));
  const product = useAppStore((s) =>
    s.products.find((p) => p.id === node?.productId),
  );
  const signals = useAppStore((s) => s.signals);
  const setNodePortPlacement = useAppStore((s) => s.setNodePortPlacement);
  const resetNodePortPlacement = useAppStore((s) => s.resetNodePortPlacement);

  const allPorts = useMemo(() => {
    if (!product) return [];
    return [
      ...product.inputs,
      ...product.outputs,
      ...(product.middle ?? []),
    ];
  }, [product]);

  if (!node || !product) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Configurer ce produit</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="muted">
            Déplace un port d'une section à une autre <strong>uniquement
            pour ce produit posé</strong>. Le catalogue n'est pas modifié.
            Les câbles déjà connectés suivent automatiquement le port.
          </p>
          <table className="instance-ports-table">
            <thead>
              <tr>
                <th></th>
                <th>Port</th>
                <th>Signal</th>
                <th>Section</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {allPorts.map((p) => {
                const def = signals[p.signal];
                const placement = getEffectivePlacement(product, node, p.id);
                const isOverridden =
                  placement !== defaultPlacement(product, p.id);
                return (
                  <tr key={p.id}>
                    <td>
                      <span
                        className="port-dot"
                        style={{ background: def?.color ?? "#888" }}
                      />
                    </td>
                    <td>{p.label}</td>
                    <td>
                      <span style={{ color: def?.color ?? "#888", fontWeight: 700 }}>
                        {def?.label ?? p.signal}
                      </span>
                    </td>
                    <td>
                      <select
                        value={placement}
                        onChange={(e) =>
                          setNodePortPlacement(
                            node.id,
                            p.id,
                            e.target.value as PortPlacement,
                          )
                        }
                      >
                        {PLACEMENTS.map((pl) => (
                          <option key={pl.value} value={pl.value}>
                            {pl.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {isOverridden && (
                        <button
                          onClick={() =>
                            resetNodePortPlacement(node.id, p.id)
                          }
                          title="Revenir à la disposition du catalogue"
                        >
                          ↺
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button className="primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useAppStore } from "../store";
import {
  defaultPlacement,
  getEffectivePlacement,
  getEffectivePorts,
  isExtraPort,
} from "../ports";
import type { Port, PortPlacement, SignalType } from "../types";

const SECTIONS: { key: PortPlacement; label: string }[] = [
  { key: "left", label: "Gauche" },
  { key: "right", label: "Droite" },
  { key: "middle", label: "Milieu" },
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
  const setNodePortLabel = useAppStore((s) => s.setNodePortLabel);
  const resetNodePortLabel = useAppStore((s) => s.resetNodePortLabel);
  const setNodePortOrder = useAppStore((s) => s.setNodePortOrder);
  const addNodePort = useAppStore((s) => s.addNodePort);
  const removeNodePort = useAppStore((s) => s.removeNodePort);

  const [dragId, setDragId] = useState<string | null>(null);

  const signalOptions = useMemo(() => Object.values(signals), [signals]);

  if (!node || !product) return null;

  const eff = getEffectivePorts(product, node);
  const sectionPorts: Record<PortPlacement, Port[]> = {
    left: eff.inputs,
    right: eff.outputs,
    middle: eff.middle,
  };

  const allOrdered = [...eff.inputs, ...eff.outputs, ...eff.middle];

  const onDrop = (targetId: string, targetSection: PortPlacement) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    // Source section
    let dragSection: PortPlacement | null = null;
    for (const sec of SECTIONS) {
      if (sectionPorts[sec.key].some((p) => p.id === dragId)) {
        dragSection = sec.key;
        break;
      }
    }
    if (dragSection === null || dragSection !== targetSection) {
      setDragId(null);
      return;
    }
    const without = allOrdered.map((p) => p.id).filter((id) => id !== dragId);
    const targetIdx = without.indexOf(targetId);
    if (targetIdx === -1) {
      setDragId(null);
      return;
    }
    const newOrder = [
      ...without.slice(0, targetIdx),
      dragId,
      ...without.slice(targetIdx),
    ];
    setNodePortOrder(node.id, newOrder);
    setDragId(null);
  };

  const handleAdd = (section: PortPlacement) => {
    const direction =
      section === "left" ? "in" : section === "right" ? "out" : "bi";
    const id = `extra-${Date.now()}`;
    const port: Port = {
      id,
      label: section === "left" ? "Nouvelle in" : section === "right" ? "Nouvelle out" : "Nouvelle",
      signal: "HDMI",
      direction,
    };
    addNodePort(node.id, port);
    // Append to the order so it stays at the end of its section
    setNodePortOrder(node.id, [...allOrdered.map((p) => p.id), id]);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-instance"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Configurer ce produit</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="muted">
            Édite uniquement <strong>ce produit posé</strong>. Renomme,
            change la section, glisse pour réordonner, ajoute ou supprime
            des ports. Le catalogue n'est pas modifié.
          </p>

          {SECTIONS.map((sec) => {
            const ports = sectionPorts[sec.key];
            return (
              <div key={sec.key} className="instance-section">
                <div className="instance-section-header">
                  <h4>{sec.label}</h4>
                  <button onClick={() => handleAdd(sec.key)}>+ Ajouter</button>
                </div>
                {ports.length === 0 && (
                  <div className="muted instance-section-empty">Aucun port.</div>
                )}
                {ports.map((p) => {
                  // Éléments décoratifs (espaces / séparateurs) : non
                  // configurables par instance, simple affichage avec une
                  // poignée pour les réordonner si besoin.
                  if (p.kind === "spacer" || p.kind === "separator") {
                    return (
                      <div
                        key={p.id}
                        className={"instance-port-row port-edit-row-decorative"
                          + (dragId === p.id ? " dragging" : "")}
                        draggable
                        onDragStart={(e) => {
                          setDragId(p.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          onDrop(p.id, sec.key);
                        }}
                        onDragEnd={() => setDragId(null)}
                      >
                        <span className="instance-drag-handle" title="Glisser pour réordonner">≡</span>
                        <span className="port-decorative-label">
                          {p.kind === "spacer" ? "— Espace —" : "— Séparateur —"}
                        </span>
                      </div>
                    );
                  }
                  const def = signals[p.signal];
                  const placement = getEffectivePlacement(product, node, p.id);
                  const isOverridden =
                    placement !== defaultPlacement(product, node, p.id);
                  const extra = isExtraPort(node, p.id);
                  const labelOverridden =
                    !extra &&
                    node.portLabelOverrides?.[p.id] !== undefined;
                  return (
                    <div
                      key={p.id}
                      className={
                        "instance-port-row" +
                        (dragId === p.id ? " dragging" : "")
                      }
                      draggable
                      onDragStart={(e) => {
                        setDragId(p.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        onDrop(p.id, sec.key);
                      }}
                      onDragEnd={() => setDragId(null)}
                    >
                      <span className="instance-drag-handle" title="Glisser pour réordonner">
                        ≡
                      </span>
                      <span
                        className="port-dot"
                        style={{ background: def?.color ?? "#888" }}
                      />
                      <input
                        className="instance-port-label"
                        value={p.label}
                        onChange={(e) =>
                          setNodePortLabel(node.id, p.id, e.target.value)
                        }
                        placeholder="Libellé"
                      />
                      {extra ? (
                        <select
                          value={p.signal}
                          onChange={(e) => {
                            // Update extra port's signal directly
                            const newPort: Port = {
                              ...p,
                              signal: e.target.value as SignalType,
                            };
                            // Replace the extra port via remove + add at same position
                            useAppStore.setState((s) => ({
                              nodes: s.nodes.map((n) =>
                                n.id === node.id
                                  ? {
                                      ...n,
                                      extraPorts: (n.extraPorts ?? []).map(
                                        (xp) => (xp.id === p.id ? newPort : xp),
                                      ),
                                    }
                                  : n,
                              ),
                            }));
                          }}
                          className="instance-port-signal"
                        >
                          {signalOptions.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className="instance-port-signal-readonly"
                          style={{ color: def?.color ?? "#888" }}
                          title="Signal défini par le catalogue"
                        >
                          {def?.label ?? p.signal}
                        </span>
                      )}
                      <select
                        value={placement}
                        onChange={(e) =>
                          setNodePortPlacement(
                            node.id,
                            p.id,
                            e.target.value as PortPlacement,
                          )
                        }
                        className="instance-port-section"
                      >
                        {SECTIONS.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      {extra ? (
                        <button
                          onClick={() => removeNodePort(node.id, p.id)}
                          className="danger"
                          title="Supprimer ce port"
                        >
                          ✕
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (isOverridden)
                              resetNodePortPlacement(node.id, p.id);
                            if (labelOverridden)
                              resetNodePortLabel(node.id, p.id);
                          }}
                          disabled={!isOverridden && !labelOverridden}
                          title="Revenir à la définition du catalogue"
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
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

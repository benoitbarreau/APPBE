import { useMemo, useState } from "react";
import { useAppStore } from "../store";
import {
  defaultPlacement,
  getEffectivePlacement,
  getEffectivePorts,
  isExtraPort,
} from "../ports";
import { BLANK_PRODUCT } from "../types";
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
  const productFromStore = useAppStore((s) =>
    s.products.find((p) => p.id === node?.productId),
  );
  const product = node?.isBlankBlock ? BLANK_PRODUCT : productFromStore;
  const signals = useAppStore((s) => s.signals);
  const cables = useAppStore((s) => s.cables);
  const setNodePortPlacement = useAppStore((s) => s.setNodePortPlacement);
  const resetNodePortPlacement = useAppStore((s) => s.resetNodePortPlacement);
  const setNodePortLabel = useAppStore((s) => s.setNodePortLabel);
  const resetNodePortLabel = useAppStore((s) => s.resetNodePortLabel);
  const setNodePortSignal = useAppStore((s) => s.setNodePortSignal);
  const resetNodePortSignal = useAppStore((s) => s.resetNodePortSignal);
  const setNodePortOrder = useAppStore((s) => s.setNodePortOrder);
  const addNodePort = useAppStore((s) => s.addNodePort);
  const removeNodePort = useAppStore((s) => s.removeNodePort);
  const hideNodePort = useAppStore((s) => s.hideNodePort);
  const duplicateNodePort = useAppStore((s) => s.duplicateNodePort);

  const [dragId, setDragId] = useState<string | null>(null);
  // Avertissement signal : portId en attente de confirmation
  const [signalWarnPortId, setSignalWarnPortId] = useState<string | null>(null);
  const [pendingSignal, setPendingSignal] = useState<SignalType | null>(null);

  const signalOptions = useMemo(() => Object.values(signals), [signals]);

  if (!node || !product) return null;

  const eff = getEffectivePorts(product, node);
  const sectionPorts: Record<PortPlacement, Port[]> = {
    left: eff.inputs,
    right: eff.outputs,
    middle: eff.middle,
  };

  const allOrdered = [...eff.inputs, ...eff.outputs, ...eff.middle];

  /** Vérifie si un câble est branché sur ce port de ce nœud */
  const portHasCable = (portId: string): boolean =>
    cables.some(
      (c) =>
        (c.fromNodeId === node.id && c.fromPortId === portId) ||
        (c.toNodeId === node.id && c.toPortId === portId),
    );

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
    setNodePortOrder(node.id, [...allOrdered.map((p) => p.id), id]);
  };

  const handleAddSpacer = (section: PortPlacement) => {
    const direction =
      section === "left" ? "in" : section === "right" ? "out" : "bi";
    const id = `extra-${Date.now()}-sp`;
    const port: Port = { id, label: "", signal: "", direction, kind: "spacer" };
    addNodePort(node.id, port);
    setNodePortOrder(node.id, [...allOrdered.map((p) => p.id), id]);
  };

  const handleAddSeparator = (section: PortPlacement) => {
    const direction =
      section === "left" ? "in" : section === "right" ? "out" : "bi";
    const id = `extra-${Date.now()}-sep`;
    const port: Port = { id, label: "", signal: "", direction, kind: "separator" };
    addNodePort(node.id, port);
    setNodePortOrder(node.id, [...allOrdered.map((p) => p.id), id]);
  };

  /** Demande la surcharge du signal (avec avertissement si câble branché) */
  const requestSignalChange = (portId: string, newSignal: SignalType) => {
    if (portHasCable(portId)) {
      setSignalWarnPortId(portId);
      setPendingSignal(newSignal);
    } else {
      setNodePortSignal(node.id, portId, newSignal);
    }
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

          {/* ── Avertissement surcharge signal ── */}
          {signalWarnPortId && pendingSignal && (
            <div className="instance-signal-warn">
              <strong>⚠ Câble connecté</strong> — Changer le signal laissera le
              câble avec son ancienne couleur. Continuer ?
              <div className="instance-signal-warn-btns">
                <button
                  className="primary"
                  onClick={() => {
                    setNodePortSignal(node.id, signalWarnPortId, pendingSignal);
                    setSignalWarnPortId(null);
                    setPendingSignal(null);
                  }}
                >
                  Oui, changer
                </button>
                <button
                  onClick={() => {
                    setSignalWarnPortId(null);
                    setPendingSignal(null);
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {SECTIONS.map((sec) => {
            const ports = sectionPorts[sec.key];
            return (
              <div key={sec.key} className="instance-section">
                <div className="instance-section-header">
                  <h4>{sec.label}</h4>
                  <div className="instance-section-actions">
                    <button onClick={() => handleAdd(sec.key)} title="Ajouter un port">+ Port</button>
                    <button onClick={() => handleAddSpacer(sec.key)} title="Ajouter un espace vide">+ Espace</button>
                    <button onClick={() => handleAddSeparator(sec.key)} title="Ajouter un séparateur">+ Sépar.</button>
                  </div>
                </div>
                {ports.length === 0 && (
                  <div className="muted instance-section-empty">Aucun port.</div>
                )}
                {ports.map((p) => {
                  // ── Éléments décoratifs ────────────────────────────────────
                  if (p.kind === "spacer" || p.kind === "separator") {
                    return (
                      <div
                        key={p.id}
                        className={"instance-port-row port-edit-row-decorative"
                          + (dragId === p.id ? " dragging" : "")}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          onDrop(p.id, sec.key);
                        }}
                      >
                        <span
                          className="instance-drag-handle"
                          title="Glisser pour réordonner"
                          draggable
                          onDragStart={(e) => {
                            setDragId(p.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDragId(null)}
                        >≡</span>
                        <span className="port-decorative-label">
                          {p.kind === "spacer" ? "— Espace —" : "— Séparateur —"}
                        </span>
                        <button
                          onClick={() => removeNodePort(node.id, p.id)}
                          className="danger instance-port-btn"
                          title="Supprimer"
                        >✕</button>
                      </div>
                    );
                  }

                  // ── Port normal ────────────────────────────────────────────
                  const def = signals[p.signal];
                  const placement = getEffectivePlacement(product, node, p.id);
                  const isOverridden = placement !== defaultPlacement(product, node, p.id);
                  const extra = isExtraPort(node, p.id);
                  const labelOverridden = !extra && node.portLabelOverrides?.[p.id] !== undefined;
                  const signalOverridden = !extra && node.portSignalOverrides?.[p.id] !== undefined;
                  const hasCable = portHasCable(p.id);

                  return (
                    <div
                      key={p.id}
                      className={
                        "instance-port-row" +
                        (dragId === p.id ? " dragging" : "")
                      }
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        onDrop(p.id, sec.key);
                      }}
                    >
                      {/* Poignée drag */}
                      <span
                        className="instance-drag-handle"
                        title="Glisser pour réordonner"
                        draggable
                        onDragStart={(e) => {
                          setDragId(p.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDragId(null)}
                      >≡</span>

                      {/* Pastille couleur signal */}
                      <span
                        className="port-dot"
                        style={{ background: def?.color ?? "#888" }}
                      />

                      {/* Label */}
                      <input
                        className="instance-port-label"
                        value={p.label}
                        onChange={(e) =>
                          setNodePortLabel(node.id, p.id, e.target.value)
                        }
                        placeholder="Libellé"
                      />

                      {/* Signal — éditable pour TOUS les ports */}
                      <select
                        value={p.signal}
                        onChange={(e) => {
                          const newSignal = e.target.value as SignalType;
                          if (extra) {
                            // Port extra : mise à jour directe
                            useAppStore.setState((s) => ({
                              nodes: s.nodes.map((n) =>
                                n.id === node.id
                                  ? {
                                      ...n,
                                      extraPorts: (n.extraPorts ?? []).map(
                                        (xp) => (xp.id === p.id ? { ...xp, signal: newSignal } : xp),
                                      ),
                                    }
                                  : n,
                              ),
                            }));
                          } else {
                            // Port catalogue : surcharge avec avertissement si câble
                            requestSignalChange(p.id, newSignal);
                          }
                        }}
                        className={`instance-port-signal${signalOverridden ? " overridden" : ""}`}
                        title={
                          signalOverridden
                            ? "Signal surchargé (différent du catalogue)"
                            : hasCable && !extra
                            ? "⚠ Un câble est branché sur ce port"
                            : "Signal"
                        }
                      >
                        {signalOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>

                      {/* Section (gauche/droite/milieu) */}
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

                      {/* Dupliquer */}
                      <button
                        className="instance-port-btn"
                        onClick={() => duplicateNodePort(node.id, p.id)}
                        title="Dupliquer ce port"
                      >⧉</button>

                      {/* Réinitialiser / Masquer / Supprimer */}
                      {extra ? (
                        <button
                          onClick={() => removeNodePort(node.id, p.id)}
                          className="danger instance-port-btn"
                          title="Supprimer ce port"
                        >✕</button>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              if (isOverridden) resetNodePortPlacement(node.id, p.id);
                              if (labelOverridden) resetNodePortLabel(node.id, p.id);
                              if (signalOverridden) resetNodePortSignal(node.id, p.id);
                            }}
                            disabled={!isOverridden && !labelOverridden && !signalOverridden}
                            title="Revenir à la définition du catalogue"
                            className="instance-port-btn"
                          >↺</button>
                          <button
                            onClick={() => hideNodePort(node.id, p.id)}
                            className="instance-port-btn"
                            title={
                              hasCable
                                ? "Masquer ce port (supprimera le câble connecté)"
                                : "Masquer ce port sur cette instance"
                            }
                          >👁</button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* ── Ports masqués ── */}
          {(node.hiddenPorts ?? []).length > 0 && (
            <div className="instance-section instance-hidden-section">
              <div className="instance-section-header">
                <h4>Ports masqués</h4>
              </div>
              {(node.hiddenPorts ?? []).map((portId) => {
                // Trouver le port dans le produit
                const allCatalogPorts = [
                  ...(product.inputs ?? []),
                  ...(product.outputs ?? []),
                  ...(product.middle ?? []),
                ];
                const catalogPort = allCatalogPorts.find((p) => p.id === portId);
                const label = catalogPort?.label ?? portId;
                return (
                  <div key={portId} className="instance-port-row instance-hidden-row">
                    <span className="port-dot" style={{ background: "#ccc" }} />
                    <span className="instance-port-label-text muted">{label}</span>
                    <button
                      className="instance-port-btn"
                      title="Rendre ce port visible à nouveau"
                      onClick={() => {
                        useAppStore.setState((s) => ({
                          nodes: s.nodes.map((n) =>
                            n.id === node.id
                              ? { ...n, hiddenPorts: (n.hiddenPorts ?? []).filter((id) => id !== portId) }
                              : n,
                          ),
                        }));
                      }}
                    >
                      ↩ Afficher
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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

import { useMemo } from "react";
import { useAppStore } from "../store";
import type { SignalDef } from "../types";
import { DEFAULT_SIGNAL_DEFS } from "../types";
import {
  upsertUserSignal,
  deleteUserSignal,
  deleteAllUserSignals,
} from "../lib/userSignalsZonesApi";

const slugifyId = (label: string): string =>
  label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "NEW";

export function Legend() {
  const signals = useAppStore((s) => s.signals);
  const cables = useAppStore((s) => s.cables);
  const tabs = useAppStore((s) => s.tabs);
  const upsert = useAppStore((s) => s.upsertSignal);
  const remove = useAppStore((s) => s.removeSignal);
  const resetSignalsToDefaults = useAppStore((s) => s.resetSignalsToDefaults);

  const list = useMemo(() => Object.values(signals), [signals]);

  /** Réinitialise la légende à la liste par défaut.
   *  Avertit si des câbles utilisent des signaux qui vont être supprimés. */
  const handleReset = async () => {
    const defaultIds = new Set(Object.keys(DEFAULT_SIGNAL_DEFS));
    // Collecte tous les signaux utilisés dans le projet (onglet actif + autres)
    const usedSignalIds = new Set<string>();
    for (const c of cables) usedSignalIds.add(c.signal);
    for (const t of tabs) {
      for (const c of (t.cables ?? [])) usedSignalIds.add(c.signal);
    }
    // Signaux qui vont disparaître = utilisés mais absents des défauts
    const removedUsed: string[] = [];
    for (const sigId of usedSignalIds) {
      if (!defaultIds.has(sigId)) {
        const lbl = signals[sigId]?.label ?? sigId;
        removedUsed.push(lbl);
      }
    }
    const defaultsLabels = Object.values(DEFAULT_SIGNAL_DEFS)
      .map((s) => s.label)
      .join(", ");
    const baseMsg =
      `Réinitialiser la légende ?\n\n` +
      `La liste sera remplacée par les ${defaultIds.size} types par défaut :\n` +
      `${defaultsLabels}.`;
    const warnMsg = removedUsed.length
      ? `\n\n⚠ Attention : ${removedUsed.length} type(s) utilisé(s) dans le projet vont être supprimé(s) :\n` +
        `${removedUsed.join(", ")}.\n` +
        `Les câbles concernés perdront leur couleur et leur préfixe — il faudra leur réassigner un signal.`
      : "";
    if (!confirm(baseMsg + warnMsg + "\n\nContinuer ?")) return;

    // 1. Mise à jour locale immédiate
    resetSignalsToDefaults();
    // 2. Nettoyage cloud : supprime tous les user_signals existants
    //    puis réinsère les valeurs par défaut (pour qu'au prochain login
    //    elles soient prioritaires sur DEFAULT_SIGNAL_DEFS).
    try {
      await deleteAllUserSignals();
      await Promise.all(
        Object.values(DEFAULT_SIGNAL_DEFS).map((def) => upsertUserSignal(def)),
      );
    } catch {
      /* échec silencieux — la réinitialisation locale est faite, la sync
         cloud pourra être retentée plus tard */
    }
  };

  const handleAdd = () => {
    let baseId = "NOUVEAU";
    let id = baseId;
    let n = 1;
    while (signals[id]) {
      id = `${baseId}${n++}`;
    }
    const def: SignalDef = {
      id,
      label: "Nouveau câble",
      color: "#888888",
      defaultCable: "Câble",
      numberPrefix: id.slice(0, 4),
    };
    upsert(def);
    upsertUserSignal(def).catch(() => {});
  };

  const handleRemove = (id: string) => {
    const used = cables.filter((c) => c.signal === id).length;
    const ok = used
      ? confirm(
          `Le type "${signals[id]?.label ?? id}" est utilisé par ${used} câble(s). Supprimer quand même ? Les câbles seront orphelins.`,
        )
      : confirm(`Supprimer le type "${signals[id]?.label ?? id}" ?`);
    if (!ok) return;
    remove(id);
    deleteUserSignal(id).catch(() => {});
  };

  const handleUpsert = (def: SignalDef) => {
    upsert(def);
    upsertUserSignal(def).catch(() => {});
  };

  const handleChangeLabel = (def: SignalDef, label: string) => {
    handleUpsert({ ...def, label });
  };

  return (
    <div className="legend-editor">
      <div className="legend-editor-header">
        <h3>Types de câbles</h3>
        <div className="legend-editor-header-actions">
          <button
            onClick={() => void handleReset()}
            title="Remplacer la liste par les 10 types de câbles par défaut"
          >
            ↻ Réinitialiser
          </button>
          <button onClick={handleAdd}>+ Ajouter</button>
        </div>
      </div>
      <div className="legend-editor-hint muted">
        La couleur s'applique en direct aux pastilles et aux liaisons. Le préfixe pilote la
        numérotation auto (IPn, HDMIn…).
      </div>
      <div className="legend-editor-list">
        <div className="legend-editor-row legend-editor-headrow">
          <span></span>
          <span>Nom</span>
          <span>Préfixe</span>
          <span>Câble par défaut</span>
          <span></span>
        </div>
        {list.map((def) => {
          const used = cables.filter((c) => c.signal === def.id).length;
          return (
            <div key={def.id} className="legend-editor-row">
              <input
                type="color"
                className="legend-color"
                value={def.color}
                onChange={(e) => upsert({ ...def, color: e.target.value })}
                onBlur={(e) => handleUpsert({ ...def, color: e.target.value })}
                title="Couleur"
              />
              <input
                value={def.label}
                onChange={(e) => handleChangeLabel(def, e.target.value)}
                placeholder="Nom affiché"
              />
              <input
                value={def.numberPrefix}
                onChange={(e) => handleUpsert({ ...def, numberPrefix: e.target.value })}
                placeholder="Préf."
                className="legend-prefix"
                maxLength={6}
              />
              <input
                value={def.defaultCable}
                onChange={(e) => handleUpsert({ ...def, defaultCable: e.target.value })}
                placeholder="Câble par défaut"
              />
              <button
                onClick={() => handleRemove(def.id)}
                className="danger"
                title={used ? `Utilisé par ${used} câble(s)` : "Supprimer"}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { slugifyId };

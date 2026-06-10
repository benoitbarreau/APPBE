import { useMemo } from "react";
import { useAppStore } from "../store";
import type { SignalDef } from "../types";
import { DEFAULT_SIGNAL_DEFS } from "../types";
import {
  upsertUserSignal,
  deleteUserSignal,
  deleteAllUserSignals,
} from "../lib/userSignalsZonesApi";
import { useAuth } from "../auth/useAuth";

const slugifyId = (label: string): string =>
  label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "NEW";

/** Vrai si l'id appartient aux 10 types de câbles livrés par défaut. */
const isDefaultSignal = (id: string): boolean =>
  Object.prototype.hasOwnProperty.call(DEFAULT_SIGNAL_DEFS, id);

export function Legend() {
  const signals = useAppStore((s) => s.signals);
  const cables = useAppStore((s) => s.cables);
  const tabs = useAppStore((s) => s.tabs);
  const upsert = useAppStore((s) => s.upsertSignal);
  const remove = useAppStore((s) => s.removeSignal);
  const resetSignalsToDefaults = useAppStore((s) => s.resetSignalsToDefaults);

  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const list = useMemo(() => Object.values(signals), [signals]);

  /** Réinitialise la légende à la liste par défaut (admin uniquement). */
  const handleReset = async () => {
    const defaultIds = new Set(Object.keys(DEFAULT_SIGNAL_DEFS));
    const usedSignalIds = new Set<string>();
    for (const c of cables) usedSignalIds.add(c.signal);
    for (const t of tabs) {
      for (const c of (t.cables ?? [])) usedSignalIds.add(c.signal);
    }
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

    resetSignalsToDefaults();
    try {
      await deleteAllUserSignals();
      await Promise.all(
        Object.values(DEFAULT_SIGNAL_DEFS).map((def) => upsertUserSignal(def)),
      );
    } catch {
      /* échec silencieux */
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
    // Admin : sync global (user_signals). User : per-project uniquement, pas de sync.
    if (isAdmin) upsertUserSignal(def).catch((e) => console.error("Échec sync globale signal :", e));
  };

  const handleRemove = (id: string) => {
    // Seul un admin peut supprimer les types par défaut
    if (!isAdmin && isDefaultSignal(id)) return;
    const used = cables.filter((c) => c.signal === id).length;
    const ok = used
      ? confirm(
          `Le type "${signals[id]?.label ?? id}" est utilisé par ${used} câble(s). Supprimer quand même ? Les câbles seront orphelins.`,
        )
      : confirm(`Supprimer le type "${signals[id]?.label ?? id}" ?`);
    if (!ok) return;
    remove(id);
    // Admin : sync global. User : per-project uniquement.
    if (isAdmin) deleteUserSignal(id).catch((e) => console.error("Échec suppression globale signal :", e));
  };

  const handleUpsert = (def: SignalDef) => {
    // Seul un admin peut modifier les types par défaut
    if (!isAdmin && isDefaultSignal(def.id)) return;
    upsert(def);
    // Admin : sync global. User : per-project uniquement.
    if (isAdmin) upsertUserSignal(def).catch((e) => console.error("Échec sync globale signal :", e));
  };

  const handleChangeLabel = (def: SignalDef, label: string) => {
    handleUpsert({ ...def, label });
  };

  return (
    <div className="legend-editor">
      <div className="legend-editor-header">
        <h3>Types de câbles</h3>
        <div className="legend-editor-header-actions">
          {/* Réinitialiser : admin uniquement */}
          {isAdmin && (
            <button
              onClick={() => void handleReset()}
              title="Remplacer la liste par les 10 types de câbles par défaut"
            >
              ↻ Réinitialiser
            </button>
          )}
          <button onClick={handleAdd}>+ Ajouter</button>
        </div>
      </div>
      <div className="legend-editor-hint muted">
        La couleur s'applique en direct aux pastilles et aux liaisons. Le préfixe pilote la
        numérotation auto (IPn, HDMIn…).
        {!isAdmin && (
          <span className="legend-hint-user">
            {" "}Les types par défaut sont en lecture seule. Vous pouvez ajouter vos propres types (par projet).
          </span>
        )}
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
          const isDefault = isDefaultSignal(def.id);
          // Un user peut éditer uniquement ses propres types (non-défaut)
          const canEdit = isAdmin || !isDefault;

          return (
            <div
              key={def.id}
              className={`legend-editor-row${!canEdit ? " legend-row-readonly" : ""}`}
            >
              <input
                type="color"
                className="legend-color"
                value={def.color}
                onChange={(e) => canEdit && upsert({ ...def, color: e.target.value })}
                onBlur={(e) => canEdit && handleUpsert({ ...def, color: e.target.value })}
                title={canEdit ? "Couleur" : "Lecture seule — admin uniquement"}
                disabled={!canEdit}
              />
              <input
                value={def.label}
                onChange={(e) => canEdit && handleChangeLabel(def, e.target.value)}
                placeholder="Nom affiché"
                readOnly={!canEdit}
                title={canEdit ? undefined : "Lecture seule — admin uniquement"}
              />
              <input
                value={def.numberPrefix}
                onChange={(e) => canEdit && handleUpsert({ ...def, numberPrefix: e.target.value })}
                placeholder="Préf."
                className="legend-prefix"
                maxLength={6}
                readOnly={!canEdit}
                title={canEdit ? undefined : "Lecture seule — admin uniquement"}
              />
              <input
                value={def.defaultCable}
                onChange={(e) => canEdit && handleUpsert({ ...def, defaultCable: e.target.value })}
                placeholder="Câble par défaut"
                readOnly={!canEdit}
                title={canEdit ? undefined : "Lecture seule — admin uniquement"}
              />
              {/* Bouton supprimer : admin = tout, user = uniquement ses types perso */}
              {canEdit ? (
                <button
                  onClick={() => handleRemove(def.id)}
                  className="danger"
                  title={used ? `Utilisé par ${used} câble(s)` : "Supprimer"}
                >
                  ✕
                </button>
              ) : (
                <span className="legend-row-readonly-spacer" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { slugifyId };

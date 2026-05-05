import { useMemo } from "react";
import { useAppStore } from "../store";
import type { SignalDef } from "../types";
import { upsertUserSignal, deleteUserSignal } from "../lib/userSignalsZonesApi";

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
  const upsert = useAppStore((s) => s.upsertSignal);
  const remove = useAppStore((s) => s.removeSignal);

  const list = useMemo(() => Object.values(signals), [signals]);

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
        <button onClick={handleAdd}>+ Ajouter</button>
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

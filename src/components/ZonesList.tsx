import { useAppStore } from "../store";
import type { Zone } from "../types";
import { confirmDialog } from "./dialogs/dialogStore";


export function ZonesList() {
  const zones = useAppStore((s) => s.zones);
  const nodes = useAppStore((s) => s.nodes);
  const upsert = useAppStore((s) => s.upsertZone);
  const remove = useAppStore((s) => s.removeZone);

  const handleAdd = () => {
    let baseId = "ZONE";
    let id = baseId;
    let n = 1;
    while (zones.some((z) => z.id === id)) {
      id = `${baseId}${n++}`;
    }
    const zone: Zone = { id, label: "Nouvelle zone", color: "#888888" };
    upsert(zone);
    // Les zones sont désormais per-project, sauvegardées avec le projet — pas de sync user_zones
  };

  const handleUpsert = (z: Zone) => {
    upsert(z);
    // Les zones sont désormais per-project, sauvegardées avec le projet — pas de sync user_zones
  };

  const handleRemove = async (z: Zone) => {
    const used = nodes.filter((n) => n.zoneId === z.id).length;
    const ok = await confirmDialog({
      title: `Supprimer la zone « ${z.label} » ?`,
      message: used
        ? `Elle est utilisée par ${used} produit(s) — ils ne seront plus assignés à aucune zone.`
        : undefined,
      confirmLabel: "🗑 Supprimer",
      danger: true,
    });
    if (!ok) return;
    remove(z.id);
    // Les zones sont désormais per-project, sauvegardées avec le projet — pas de sync user_zones
  };

  return (
    <div className="legend-editor">
      <div className="legend-editor-header">
        <h3>Zones</h3>
        <button onClick={handleAdd}>+ Ajouter</button>
      </div>
      <div className="legend-editor-hint muted">
        La couleur s'applique en fond du cartouche des produits assignés à
        la zone. Édite l'étiquette et la couleur en direct.
      </div>
      <div className="legend-editor-list">
        <div className="legend-editor-row legend-editor-headrow">
          <span></span>
          <span>Étiquette</span>
          <span></span>
        </div>
        {zones.map((z) => {
          const used = nodes.filter((n) => n.zoneId === z.id).length;
          return (
            <div key={z.id} className="legend-editor-row legend-editor-row-zone">
              <input
                type="color"
                className="legend-color"
                value={z.color}
                onChange={(e) => upsert({ ...z, color: e.target.value })}
                onBlur={(e) => handleUpsert({ ...z, color: e.target.value })}
                title="Couleur"
              />
              <input
                value={z.label}
                onChange={(e) => {
                  // On ne modifie JAMAIS l'ID après la création : si on recalcule
                  // un nouvel ID qui n'existe pas encore, upsertZone crée une zone
                  // supplémentaire au lieu de mettre à jour l'existante.
                  handleUpsert({ ...z, label: e.target.value });
                }}
                placeholder="Nom (Baie, Régie…)"
              />
              <button
                onClick={() => void handleRemove(z)}
                className="danger"
                title={used ? `Utilisé par ${used} produit(s)` : "Supprimer"}
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

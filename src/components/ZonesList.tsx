import { useAppStore } from "../store";
import type { Zone } from "../types";

const slugifyId = (label: string): string =>
  label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "ZONE";

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

  const handleRemove = (z: Zone) => {
    const used = nodes.filter((n) => n.zoneId === z.id).length;
    const ok = used
      ? confirm(
          `La zone "${z.label}" est utilisée par ${used} produit(s). Supprimer quand même ?`,
        )
      : confirm(`Supprimer la zone "${z.label}" ?`);
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
                  const label = e.target.value;
                  const expected = slugifyId(z.label);
                  const newId = z.id === expected ? slugifyId(label) : z.id;
                  handleUpsert({ ...z, id: newId, label });
                }}
                placeholder="Nom (Baie, Régie…)"
              />
              <button
                onClick={() => handleRemove(z)}
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

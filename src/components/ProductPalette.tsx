import { useMemo, useState } from "react";
import { useAppStore, useCatalogMeta } from "../store";

type GroupBy = "brand" | "category";

export function ProductPalette({
  onAdd,
  onEdit,
  onNew,
  onImport,
  onCollapse,
}: {
  onAdd: (productId: string) => void;
  onEdit: (productId: string) => void;
  onNew: () => void;
  onImport: () => void;
  onCollapse?: () => void;
}) {
  const products = useAppStore((s) => s.products);
  const catalogCategories = useCatalogMeta((s) => s.catalogCategories);
  const [filter, setFilter] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("brand");

  // Map catégorie → couleur pour l'affichage dans les items
  const categoryColorMap = useMemo(
    () => new Map(catalogCategories.map((c) => [c.name, c.color])),
    [catalogCategories],
  );
  // Groupes explicitement ouverts — départ vide = tout replié par défaut.
  // Quand un filtre est actif, tous les groupes s'affichent (résultats visibles).
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const filtered = products.filter(
      (p) =>
        !f ||
        p.reference.toLowerCase().includes(f) ||
        p.manufacturer.toLowerCase().includes(f) ||
        p.category.toLowerCase().includes(f),
    );
    const getKey = (p: (typeof filtered)[0]) =>
      groupBy === "brand"
        ? (p.manufacturer || "Sans marque")
        : (p.category || "Sans catégorie");
    const map = new Map<string, typeof filtered>();
    for (const p of filtered) {
      const k = getKey(p);
      const arr = map.get(k) ?? [];
      arr.push(p);
      map.set(k, arr);
    }
    // Tri alphabétique des groupes, puis par référence dans chaque groupe
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "fr"))
      .map(([key, items]) => [
        key,
        [...items].sort((a, b) => a.reference.localeCompare(b.reference, "fr")),
      ] as [string, typeof filtered]);
  }, [products, filter, groupBy]);

  return (
    <div className="palette">
      {/* ── En-tête ── */}
      <div className="palette-header">
        <h3>Catalogue</h3>
        <div className="palette-actions">
          <button onClick={onNew} title="Créer un nouveau produit">+ Nouveau</button>
          <button onClick={onImport} title="Importer depuis un fichier JSON">Importer…</button>
          {onCollapse && (
            <button
              className="palette-collapse-btn"
              onClick={onCollapse}
              title="Masquer le catalogue"
            >
              ◀
            </button>
          )}
        </div>
      </div>

      {/* ── Bascule par marque / par catégorie ── */}
      <div className="palette-groupby">
        <button
          className={groupBy === "brand" ? "active" : ""}
          onClick={() => setGroupBy("brand")}
        >
          Par marque
        </button>
        <button
          className={groupBy === "category" ? "active" : ""}
          onClick={() => setGroupBy("category")}
        >
          Par catégorie
        </button>
      </div>

      {/* ── Recherche ── */}
      <input
        type="search"
        placeholder="Rechercher…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="palette-search"
      />

      {/* ── Liste ── */}
      <div className="palette-list">
        {grouped.length === 0 && (
          <div className="palette-empty">Aucun produit trouvé</div>
        )}
        {grouped.map(([group, items]) => {
          // Ouvert si : filtre actif (on veut voir les résultats) OU groupe explicitement ouvert
          const isOpen = filter.trim() !== "" || openGroups.has(group);
          return (
            <div key={group} className="palette-group">
              <button
                className="palette-group-title"
                onClick={() => toggleGroup(group)}
                title={isOpen ? "Réduire" : "Développer"}
              >
                <span className={`palette-group-chevron${isOpen ? "" : " closed"}`}>▾</span>
                <span className="palette-group-name">{group}</span>
                <span className="palette-group-count">{items.length}</span>
              </button>
              {isOpen && items.map((p) => {
                const catColor = categoryColorMap.get(p.category);
                return (
                  <div
                    key={p.id}
                    className="palette-item"
                    style={catColor ? { borderLeftColor: catColor, borderLeftWidth: 3 } : undefined}
                  >
                    <div className="palette-item-info">
                      <div className="palette-item-ref">{p.reference}</div>
                      <div className="palette-item-cat" style={catColor ? { color: catColor } : undefined}>
                        {groupBy === "brand" ? p.category : p.manufacturer}
                      </div>
                      <div className="palette-item-io">
                        {p.inputs.length} in · {p.outputs.length} out
                      </div>
                    </div>
                    <div className="palette-item-actions">
                      <button onClick={() => onAdd(p.id)} title="Placer sur le synoptique">+</button>
                      <button onClick={() => onEdit(p.id)} title="Éditer la fiche">✎</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

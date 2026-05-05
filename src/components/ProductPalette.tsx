import { useMemo, useRef, useState } from "react";
import { useAppStore, useCatalogMeta } from "../store";
import type { Product } from "../types";

type GroupBy = "brand" | "category";

// Clé composite pour les sous-groupes : "PrimaryGroup::SubGroup"
const subKey = (primary: string, sub: string) => `${primary}::${sub}`;

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

  // Groupes ouverts — vide = tout replié par défaut
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openSubGroups, setOpenSubGroups] = useState<Set<string>>(new Set());

  // Réinitialise l'état open lors du changement de mode groupement
  const prevGroupBy = useRef<GroupBy>(groupBy);
  if (prevGroupBy.current !== groupBy) {
    prevGroupBy.current = groupBy;
    setOpenGroups(new Set());
    setOpenSubGroups(new Set());
  }

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleSubGroup = (key: string) =>
    setOpenSubGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Map catégorie → couleur pour l'affichage
  const categoryColorMap = useMemo(
    () => new Map(catalogCategories.map((c) => [c.name, c.color])),
    [catalogCategories],
  );

  // Hiérarchie deux niveaux : primary → [sub → [Product]]
  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const filtered = products.filter(
      (p) =>
        !f ||
        p.reference.toLowerCase().includes(f) ||
        p.manufacturer.toLowerCase().includes(f) ||
        p.category.toLowerCase().includes(f),
    );

    const getPrimary = (p: Product) =>
      groupBy === "brand"
        ? p.manufacturer || "Sans marque"
        : p.category || "Sans catégorie";

    const getSecondary = (p: Product) =>
      groupBy === "brand"
        ? p.category || "Sans catégorie"
        : p.manufacturer || "Sans marque";

    // Premier niveau
    const primaryMap = new Map<string, Product[]>();
    for (const p of filtered) {
      const pk = getPrimary(p);
      const arr = primaryMap.get(pk) ?? [];
      arr.push(p);
      primaryMap.set(pk, arr);
    }

    // Deuxième niveau dans chaque groupe primaire
    return Array.from(primaryMap.entries())
      .sort(([a], [b]) => a.localeCompare(b, "fr"))
      .map(([pk, items]) => {
        const subMap = new Map<string, Product[]>();
        for (const p of items) {
          const sk = getSecondary(p);
          const arr = subMap.get(sk) ?? [];
          arr.push(p);
          subMap.set(sk, arr);
        }
        const subs = Array.from(subMap.entries())
          .sort(([a], [b]) => a.localeCompare(b, "fr"))
          .map(([sk, si]) => [
            sk,
            [...si].sort((a, b) => a.reference.localeCompare(b.reference, "fr")),
          ] as [string, Product[]]);
        return [pk, subs] as [string, [string, Product[]][]];
      });
  }, [products, filter, groupBy]);

  const hasFilter = filter.trim() !== "";

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

      {/* ── Liste deux niveaux ── */}
      <div className="palette-list">
        {grouped.length === 0 && (
          <div className="palette-empty">Aucun produit trouvé</div>
        )}
        {grouped.map(([primary, subs]) => {
          const primaryOpen = hasFilter || openGroups.has(primary);
          const totalCount = subs.reduce((n, [, items]) => n + items.length, 0);

          return (
            <div key={primary} className="palette-group">
              {/* Titre groupe primaire (marque ou catégorie) */}
              <button
                className="palette-group-title"
                onClick={() => toggleGroup(primary)}
                title={primaryOpen ? "Réduire" : "Développer"}
              >
                <span className={`palette-group-chevron${primaryOpen ? "" : " closed"}`}>▾</span>
                <span className="palette-group-name">{primary}</span>
                <span className="palette-group-count">{totalCount}</span>
              </button>

              {primaryOpen && subs.map(([secondary, items]) => {
                const sk = subKey(primary, secondary);
                const subOpen = hasFilter || openSubGroups.has(sk);
                const catColor = groupBy === "brand"
                  ? categoryColorMap.get(secondary)
                  : categoryColorMap.get(primary);

                // N'afficher le sous-groupe que s'il y a plusieurs sous-groupes
                const showSubGroup = subs.length > 1;

                return (
                  <div key={sk} className="palette-subgroup">
                    {/* Titre sous-groupe — caché si un seul sous-groupe */}
                    {showSubGroup && (
                      <button
                        className="palette-subgroup-title"
                        onClick={() => toggleSubGroup(sk)}
                        title={subOpen ? "Réduire" : "Développer"}
                        style={catColor ? { color: catColor } : undefined}
                      >
                        <span className={`palette-subgroup-chevron${subOpen ? "" : " closed"}`}>›</span>
                        <span className="palette-subgroup-name">{secondary}</span>
                        <span className="palette-group-count">{items.length}</span>
                      </button>
                    )}

                    {/* Produits */}
                    {(subOpen || !showSubGroup) && items.map((p) => {
                      const itemColor = catColor;
                      return (
                        <div
                          key={p.id}
                          className="palette-item"
                          style={itemColor ? { borderLeftColor: itemColor, borderLeftWidth: 3 } : undefined}
                        >
                          <div className="palette-item-info">
                            <div className="palette-item-ref">{p.reference}</div>
                            {!showSubGroup && (
                              <div
                                className="palette-item-cat"
                                style={itemColor ? { color: itemColor } : undefined}
                              >
                                {secondary}
                              </div>
                            )}
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
          );
        })}
      </div>
    </div>
  );
}

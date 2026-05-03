import { useMemo, useState } from "react";
import { useAppStore } from "../store";

export function ProductPalette({
  onAdd,
  onEdit,
  onNew,
  onImport,
}: {
  onAdd: (productId: string) => void;
  onEdit: (productId: string) => void;
  onNew: () => void;
  onImport: () => void;
}) {
  const products = useAppStore((s) => s.products);
  const [filter, setFilter] = useState("");

  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const filtered = products.filter(
      (p) =>
        !f ||
        p.reference.toLowerCase().includes(f) ||
        p.manufacturer.toLowerCase().includes(f) ||
        p.category.toLowerCase().includes(f),
    );
    const map = new Map<string, typeof filtered>();
    for (const p of filtered) {
      const arr = map.get(p.manufacturer) ?? [];
      arr.push(p);
      map.set(p.manufacturer, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [products, filter]);

  return (
    <div className="palette">
      <div className="palette-header">
        <h3>Catalogue produits</h3>
        <div className="palette-actions">
          <button onClick={onNew}>+ Nouveau</button>
          <button onClick={onImport}>Importer…</button>
        </div>
      </div>
      <input
        type="search"
        placeholder="Rechercher produit, marque, catégorie…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="palette-list">
        {grouped.map(([brand, items]) => (
          <div key={brand} className="palette-group">
            <div className="palette-group-title">{brand}</div>
            {items.map((p) => (
              <div key={p.id} className="palette-item">
                <div className="palette-item-info">
                  <div className="palette-item-ref">{p.reference}</div>
                  <div className="palette-item-cat">{p.category}</div>
                  <div className="palette-item-io">
                    {p.inputs.length} in / {p.outputs.length} out
                  </div>
                </div>
                <div className="palette-item-actions">
                  <button onClick={() => onAdd(p.id)} title="Placer sur le synoptique">
                    +
                  </button>
                  <button onClick={() => onEdit(p.id)} title="Éditer">
                    ✎
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

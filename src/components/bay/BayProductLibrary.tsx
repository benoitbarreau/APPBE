import { useMemo, useState } from "react";
import { useAppStore } from "../../store";
import type { RackItem } from "../../types";
import { isSynopticTab } from "../../types";
import { BAY_ACCESSORIES } from "./bay-accessories";

interface BayProductLibraryProps {
  tabId: string;
}

type LibTab = "synoptic" | "catalog" | "accessories";

function rackWidthToCol(rw?: string): 1 | 2 | 4 {
  if (rw === "quarter") return 1;
  if (rw === "half") return 2;
  return 4;
}

/** Données portées par le drag-and-drop */
export function setDragItem(data: Omit<RackItem, "id" | "uStart">) {
  window.__bayDragItem = data;
}
export function getDragItem(): (Omit<RackItem, "id" | "uStart">) | null {
  return window.__bayDragItem ?? null;
}
export function clearDragItem() {
  delete window.__bayDragItem;
}

declare global {
  interface Window {
    __bayDragItem?: Omit<RackItem, "id" | "uStart">;
  }
}

export function BayProductLibrary({ tabId }: BayProductLibraryProps) {
  const [libTab, setLibTab] = useState<LibTab>("synoptic");
  const [search, setSearch] = useState("");
  const products = useAppStore((s) => s.products);
  const tabs = useAppStore((s) => s.tabs);
  const addRackItem = useAppStore((s) => s.addRackItem);

  // ── Produits placés dans les onglets synoptiques ─────────────────────────
  const synopticItems = useMemo(() => {
    const seen = new Map<string, { productId: string; nodeId: string; label?: string }>();
    for (const t of tabs) {
      if (!isSynopticTab(t) || t.id === tabId) continue;
      for (const node of t.nodes ?? []) {
        const key = `${node.productId}:${node.id}`;
        if (!seen.has(key)) {
          seen.set(key, { productId: node.productId, nodeId: node.id, label: node.label });
        }
      }
    }
    // Inclure aussi les nœuds de l'onglet actif si c'est un synoptique
    // (l'onglet actif est une Baie, donc on ignore)
    return Array.from(seen.values()).map(({ productId, nodeId, label }) => {
      const product = products.find((p) => p.id === productId);
      return { productId, nodeId, label, product };
    }).filter((x) => x.product && (x.product.rackHeightU ?? 0) > 0);
  }, [tabs, tabId, products]);

  // ── Produits du catalogue avec rackHeightU ───────────────────────────────
  const catalogItems = useMemo(
    () => products.filter((p) => (p.rackHeightU ?? 0) > 0),
    [products],
  );

  // ── Filtrage par recherche ───────────────────────────────────────────────
  const q = search.toLowerCase();

  const filteredSynoptic = synopticItems.filter(({ product, label }) =>
    !q ||
    (product?.manufacturer ?? "").toLowerCase().includes(q) ||
    (product?.reference ?? "").toLowerCase().includes(q) ||
    (product?.category ?? "").toLowerCase().includes(q) ||
    (label ?? "").toLowerCase().includes(q),
  );

  const filteredCatalog = catalogItems.filter((p) =>
    !q ||
    p.manufacturer.toLowerCase().includes(q) ||
    p.reference.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q),
  );

  const filteredAccessories = BAY_ACCESSORIES.filter((a) =>
    !q ||
    a.label.toLowerCase().includes(q) ||
    a.category.toLowerCase().includes(q) ||
    a.reference.toLowerCase().includes(q),
  );

  // ── Ajout rapide au click ────────────────────────────────────────────────
  const quickAdd = (item: Omit<RackItem, "id" | "uStart">) => {
    addRackItem(tabId, { ...item, uStart: 1, colStart: 0 });
  };

  // ── Drag start ──────────────────────────────────────────────────────────
  const handleDragStart = (item: Omit<RackItem, "id" | "uStart">) => {
    setDragItem(item);
  };

  return (
    <div className="bay-library">
      {/* Tabs */}
      <div className="bay-lib-tabs">
        <button className={libTab === "synoptic" ? "active" : ""} onClick={() => setLibTab("synoptic")}>Synoptique</button>
        <button className={libTab === "catalog" ? "active" : ""} onClick={() => setLibTab("catalog")}>Catalogue</button>
        <button className={libTab === "accessories" ? "active" : ""} onClick={() => setLibTab("accessories")}>Accessoires</button>
      </div>

      <input
        className="bay-lib-search"
        type="search"
        placeholder="Rechercher…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="bay-lib-list">
        {/* ── Onglet Synoptique ─────────────────────────────────────────── */}
        {libTab === "synoptic" && (
          filteredSynoptic.length === 0 ? (
            <div className="bay-lib-empty">
              {search ? "Aucun résultat." : "Aucun produit dans les synoptiques."}
            </div>
          ) : (
            filteredSynoptic.map(({ productId, nodeId, label, product }) => {
              const item: Omit<RackItem, "id" | "uStart"> = {
                sourceType: "synoptic",
                productId,
                nodeId,
                label,
                manufacturer: product!.manufacturer,
                reference: product!.reference,
                category: product!.category,
                heightU: product!.rackHeightU ?? 1,
                widthCols: rackWidthToCol(product!.rackWidth),
                colStart: 0,
              };
              return (
                <div
                  key={`${productId}:${nodeId}`}
                  className="bay-lib-item"
                  draggable
                  onDragStart={() => handleDragStart(item)}
                  onClick={() => quickAdd(item)}
                  title={`${product!.manufacturer} ${product!.reference} — ${product!.rackHeightU ?? 1}U — Cliquer pour ajouter`}
                >
                  <span className="bay-lib-item-label">{label || product!.reference}</span>
                  <span className="bay-lib-item-sub">{product!.manufacturer} · {product!.rackHeightU ?? 1}U</span>
                </div>
              );
            })
          )
        )}

        {/* ── Onglet Catalogue ─────────────────────────────────────────── */}
        {libTab === "catalog" && (
          filteredCatalog.length === 0 ? (
            <div className="bay-lib-empty">
              {search ? "Aucun résultat." : "Aucun produit avec hauteur en U."}
            </div>
          ) : (
            filteredCatalog.map((p) => {
              const item: Omit<RackItem, "id" | "uStart"> = {
                sourceType: "catalog",
                productId: p.id,
                manufacturer: p.manufacturer,
                reference: p.reference,
                category: p.category,
                heightU: p.rackHeightU ?? 1,
                widthCols: rackWidthToCol(p.rackWidth),
                colStart: 0,
              };
              return (
                <div
                  key={p.id}
                  className="bay-lib-item"
                  draggable
                  onDragStart={() => handleDragStart(item)}
                  onClick={() => quickAdd(item)}
                  title={`${p.manufacturer} ${p.reference} — ${p.rackHeightU}U — Cliquer pour ajouter`}
                >
                  <span className="bay-lib-item-label">{p.reference}</span>
                  <span className="bay-lib-item-sub">{p.manufacturer} · {p.rackHeightU}U · {p.category}</span>
                </div>
              );
            })
          )
        )}

        {/* ── Onglet Accessoires ────────────────────────────────────────── */}
        {libTab === "accessories" && (
          filteredAccessories.length === 0 ? (
            <div className="bay-lib-empty">Aucun résultat.</div>
          ) : (
            filteredAccessories.map((acc) => {
              const item: Omit<RackItem, "id" | "uStart"> = {
                sourceType: "accessory",
                productId: acc.id,
                manufacturer: acc.manufacturer,
                reference: acc.reference,
                category: acc.category,
                label: acc.label,
                heightU: acc.heightU,
                widthCols: acc.widthCols,
                colStart: 0,
                color: acc.color,
              };
              return (
                <div
                  key={acc.id}
                  className="bay-lib-item"
                  draggable
                  onDragStart={() => handleDragStart(item)}
                  onClick={() => quickAdd(item)}
                  title={`${acc.label} — ${acc.heightU}U — Cliquer pour ajouter`}
                >
                  <span className="bay-lib-item-label">{acc.label}</span>
                  <span className="bay-lib-item-sub">{acc.category} · {acc.heightU}U</span>
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
}

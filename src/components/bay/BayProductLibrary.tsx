import { useMemo, useState } from "react";
import { useAppStore } from "../../store";
import type { RackItem } from "../../types";
import { isBayTab, isSynopticTab } from "../../types";
import type { BayAccessory } from "./bay-accessories";
import { BayAccessoryEditor } from "./BayAccessoryEditor";

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
  const [warnMsg, setWarnMsg] = useState<string | null>(null);
  const [editingAcc, setEditingAcc] = useState<BayAccessory | null | "new">(null);
  const products = useAppStore((s) => s.products);
  const tabs = useAppStore((s) => s.tabs);
  const addRackItem = useAppStore((s) => s.addRackItem);
  const accessories = useAppStore((s) => s.accessories);
  const addBayAccessory = useAppStore((s) => s.addBayAccessory);
  const updateBayAccessory = useAppStore((s) => s.updateBayAccessory);
  const removeBayAccessory = useAppStore((s) => s.removeBayAccessory);

  // nodeIds déjà présents dans N'IMPORTE QUELLE baie → Map<nodeId, nomDeLaBaie>
  const alreadyInRack = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tabs) {
      if (!isBayTab(t)) continue;
      for (const it of t.bayItems ?? []) {
        if (it.sourceType === "synoptic" && it.nodeId) map.set(it.nodeId, t.name);
      }
    }
    return map;
  }, [tabs]);

  // ── Produits placés dans TOUS les onglets synoptiques ────────────────────
  // Chaque entrée porte aussi le nom du synoptique source pour l'affichage.
  const synopticItems = useMemo(() => {
    const items: {
      productId: string;
      nodeId: string;
      label?: string;
      synopticName: string;
      product: typeof products[number] | undefined;
    }[] = [];
    const seenNodeIds = new Set<string>();
    for (const t of tabs) {
      if (!isSynopticTab(t)) continue; // exclut IP et Baie
      for (const node of t.nodes ?? []) {
        if (seenNodeIds.has(node.id)) continue; // même nœud présent 2x (ne devrait pas arriver)
        seenNodeIds.add(node.id);
        const product = products.find((p) => p.id === node.productId);
        if (!product || (product.rackHeightU ?? 0) <= 0) continue;
        items.push({
          productId: node.productId,
          nodeId: node.id,
          label: node.label,
          synopticName: t.name,
          product,
        });
      }
    }
    return items;
  }, [tabs, products]);

  // ── Produits du catalogue avec rackHeightU ───────────────────────────────
  const catalogItems = useMemo(
    () => products.filter((p) => (p.rackHeightU ?? 0) > 0),
    [products],
  );

  // ── Filtrage par recherche ───────────────────────────────────────────────
  const q = search.toLowerCase();

  const filteredSynoptic = synopticItems.filter(({ product, label, synopticName }) =>
    !q ||
    (product?.manufacturer ?? "").toLowerCase().includes(q) ||
    (product?.reference ?? "").toLowerCase().includes(q) ||
    (product?.category ?? "").toLowerCase().includes(q) ||
    (label ?? "").toLowerCase().includes(q) ||
    synopticName.toLowerCase().includes(q),
  );

  const filteredCatalog = catalogItems.filter((p) =>
    !q ||
    p.manufacturer.toLowerCase().includes(q) ||
    p.reference.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q),
  );

  const filteredAccessories = accessories.filter((a) =>
    !q ||
    a.label.toLowerCase().includes(q) ||
    a.category.toLowerCase().includes(q) ||
    a.reference.toLowerCase().includes(q),
  );

  // ── Avertissement doublon ────────────────────────────────────────────────
  const showWarn = (name: string, bayName?: string) => {
    const where = bayName ? ` dans la baie « ${bayName} »` : "";
    setWarnMsg(`« ${name} » est déjà présent${where}.`);
    setTimeout(() => setWarnMsg(null), 3000);
  };

  // ── Ajout rapide au click ────────────────────────────────────────────────
  const quickAdd = (item: Omit<RackItem, "id" | "uStart">, nodeId?: string) => {
    if (nodeId && alreadyInRack.has(nodeId)) {
      showWarn(item.label ?? item.reference ?? "Ce produit", alreadyInRack.get(nodeId));
      return;
    }
    // Placer à la suite du dernier item (pas d'empilement)
    const bayTab = tabs.find((t) => t.id === tabId && isBayTab(t));
    const existing = bayTab?.bayItems ?? [];
    const maxU = existing.reduce((m, it) => Math.max(m, it.uStart + it.heightU - 1), 0);
    addRackItem(tabId, { ...item, uStart: maxU + 1, colStart: 0 });
  };

  // ── Drag start (bloqué si déjà présent dans n'importe quelle baie) ──────
  const handleDragStart = (item: Omit<RackItem, "id" | "uStart">, nodeId?: string) => {
    if (nodeId && alreadyInRack.has(nodeId)) {
      showWarn(item.label ?? item.reference ?? "Ce produit", alreadyInRack.get(nodeId));
      return;
    }
    setDragItem(item);
  };

  return (
    <div className="bay-library">
      {/* Avertissement doublon */}
      {warnMsg && (
        <div className="bay-lib-warn">{warnMsg}</div>
      )}

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
              const alreadyAdded = alreadyInRack.has(nodeId);
              const alreadyBayName = alreadyInRack.get(nodeId);
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
                  className={`bay-lib-item${alreadyAdded ? " already-added" : ""}`}
                  draggable={!alreadyAdded}
                  onDragStart={() => handleDragStart(item, nodeId)}
                  onDragEnd={clearDragItem}
                  onClick={() => quickAdd(item, nodeId)}
                  title={alreadyAdded
                    ? `${product!.manufacturer} ${product!.reference} — Déjà dans la baie « ${alreadyBayName} »`
                    : `${product!.manufacturer} ${product!.reference} — ${product!.rackHeightU ?? 1}U — Cliquer pour ajouter`}
                >
                  <span className="bay-lib-item-label">
                    {alreadyAdded && <span className="bay-lib-in-rack">✓ </span>}
                    {label || product!.reference}
                  </span>
                  <span className="bay-lib-item-sub">
                    {product!.manufacturer} · {product!.reference} · {product!.rackHeightU ?? 1}U
                  </span>
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
                  onDragEnd={clearDragItem}
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
          <>
            {/* Bouton ajouter */}
            <div className="bay-lib-acc-toolbar">
              <button className="bay-lib-acc-add-btn" onClick={() => setEditingAcc("new")}>
                + Ajouter
              </button>
            </div>

            {filteredAccessories.length === 0 ? (
              <div className="bay-lib-empty">
                {search ? "Aucun résultat." : "Aucun accessoire. Cliquez sur + Ajouter."}
              </div>
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
                  logoUrl: acc.logoUrl,
                };
                return (
                  <div
                    key={acc.id}
                    className="bay-lib-item bay-lib-item-acc"
                    draggable
                    onDragStart={() => handleDragStart(item)}
                    onDragEnd={clearDragItem}
                    onClick={() => quickAdd(item)}
                    title={`${acc.label} — ${acc.heightU}U — Cliquer pour ajouter`}
                  >
                    <div className="bay-lib-item-acc-row">
                      <span className="bay-lib-item-label">{acc.label}</span>
                      <div className="bay-lib-item-acc-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="bay-lib-acc-btn"
                          title="Modifier"
                          onClick={() => setEditingAcc(acc)}
                        >✏</button>
                        <button
                          className="bay-lib-acc-btn bay-lib-acc-btn-del"
                          title="Supprimer"
                          onClick={() => removeBayAccessory(acc.id)}
                        >×</button>
                      </div>
                    </div>
                    <span className="bay-lib-item-sub">{acc.category} · {acc.heightU}U</span>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* Modal édition / création d'accessoire */}
      {editingAcc !== null && (
        <BayAccessoryEditor
          initial={editingAcc === "new" ? undefined : editingAcc}
          onSave={(data) => {
            if (editingAcc === "new") addBayAccessory(data);
            else updateBayAccessory(editingAcc.id, data);
            setEditingAcc(null);
          }}
          onCancel={() => setEditingAcc(null)}
          onDelete={editingAcc !== "new" ? () => {
            removeBayAccessory(editingAcc.id);
            setEditingAcc(null);
          } : undefined}
        />
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore, useCatalogMeta } from "../store";
import { useAuth } from "../auth/useAuth";
import type { Product } from "../types";
import { validateUserProduct } from "../lib/userProductsApi";
import { exportProductsCsv, exportProductsXls } from "../lib/productImportExport";

type GroupBy = "brand" | "category";

// Clé composite pour les sous-groupes : "PrimaryGroup::SubGroup"
const subKey = (primary: string, sub: string) => `${primary}::${sub}`;

export function ProductPalette({
  onAdd,
  onEdit,
  onNew,
  onImport,
  onAddBlankBlock,
  onCollapse,
}: {
  onAdd: (productId: string) => void;
  onEdit: (productId: string) => void;
  onNew: () => void;
  onImport: () => void;
  onAddBlankBlock?: () => void;
  onCollapse?: () => void;
}) {
  const products = useAppStore((s) => s.products);
  const productMeta = useAppStore((s) => s.productMeta);
  const validateProductLocal = useAppStore((s) => s.validateProductLocal);
  const catalogCategories = useCatalogMeta((s) => s.catalogCategories);
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const userId = profile?.id;

  const [filter, setFilter] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("brand");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Fermer le menu export au clic extérieur
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [exportMenuOpen]);

  const handleExportJson = () => {
    setExportMenuOpen(false);
    const json = JSON.stringify(products, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalogue-produits.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    setExportMenuOpen(false);
    exportProductsCsv(products);
  };

  const handleExportXls = () => {
    setExportMenuOpen(false);
    exportProductsXls(products);
  };

  // Groupes ouverts — vide = tout replié par défaut
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openSubGroups, setOpenSubGroups] = useState<Set<string>>(new Set());
  // État ouvert/replié pour les groupes par utilisateur (section admin)
  const [openUserGroups, setOpenUserGroups] = useState<Set<string>>(new Set());

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

  const toggleUserGroup = (key: string) =>
    setOpenUserGroups((prev) => {
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

  /**
   * Sépare les produits en deux listes :
   *  - common  : catalogue commun (builtin OU meta.status='approved')
   *  - pending : fiches en attente
   *      • utilisateur : uniquement les SIENNES
   *      • admin       : TOUTES les pending de tous les utilisateurs
   */
  const { commonProducts, pendingProducts } = useMemo(() => {
    const common: Product[] = [];
    const pending: Product[] = [];
    for (const p of products) {
      const meta = productMeta[p.id];
      if (!meta) {
        // Pas de meta → produit builtin → catalogue commun
        common.push(p);
        continue;
      }
      if (meta.status === "approved") {
        common.push(p);
      } else {
        // pending — filtrage : admin voit tout, user voit ses propres
        if (isAdmin || meta.creatorId === userId) pending.push(p);
      }
    }
    return { commonProducts: common, pendingProducts: pending };
  }, [products, productMeta, isAdmin, userId]);

  /** Validation d'une fiche pending par un admin. */
  const handleValidate = (productId: string) => {
    if (!isAdmin) return;
    validateProductLocal(productId);
    validateUserProduct(productId).catch((e) => {
      console.error("Échec validation cloud :", e);
      alert("⚠ L'approbation n'a pas pu être enregistrée dans le cloud.\nLa fiche repassera « En attente » à la prochaine connexion — réessayez.");
    });
  };

  // ── Filtre texte ────────────────────────────────────────────────────────
  const f = filter.trim().toLowerCase();
  const matchesFilter = (p: Product) =>
    !f ||
    p.reference.toLowerCase().includes(f) ||
    p.manufacturer.toLowerCase().includes(f) ||
    p.category.toLowerCase().includes(f);

  // Hiérarchie deux niveaux pour le catalogue commun
  const groupedCommon = useMemo(() => groupProducts(commonProducts.filter(matchesFilter), groupBy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commonProducts, filter, groupBy]);

  // Pour la section pending :
  //  - utilisateur : même groupement par marque/catégorie
  //  - admin       : groupement par créateur (full_name / email), trié alpha,
  //                  fiches triées par date décroissante (createdAt non disponible
  //                  côté client → fallback : ordre d'arrivée du fetch)
  const filteredPending = pendingProducts.filter(matchesFilter);

  const groupedPendingByUser = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, { creatorId: string; products: Product[] }>();
    for (const p of filteredPending) {
      const meta = productMeta[p.id];
      const key = meta?.creatorName ?? meta?.creatorId ?? "Inconnu";
      const cur = map.get(key) ?? { creatorId: meta?.creatorId ?? "", products: [] };
      cur.products.push(p);
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "fr"))
      .map(([name, { creatorId, products }]) => ({ name, creatorId, products }));
  }, [filteredPending, productMeta, isAdmin]);

  const groupedPendingUser = useMemo(() => {
    if (isAdmin) return [];
    return groupProducts(filteredPending, groupBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredPending, groupBy, isAdmin]);

  const hasFilter = filter.trim() !== "";

  /**
   * Rendu d'une carte produit.
   * - showValidate : pour les admins, ajoute le bouton vert ✓ Valider
   * - meta         : utilisé pour l'affichage du badge pending
   */
  const renderProductCard = (
    p: Product,
    catColor: string | undefined,
    showCatBadge: boolean,
    secondary: string,
  ) => {
    const meta = productMeta[p.id];
    const isPending = meta?.status === "pending";
    return (
      <div
        key={p.id}
        className={`palette-item${isPending ? " palette-item-pending" : ""}`}
        style={catColor ? { borderLeftColor: catColor, borderLeftWidth: 3 } : undefined}
      >
        <div className="palette-item-info">
          <div className="palette-item-ref">
            {isPending && <span className="palette-pending-dot" title="En attente de validation" />}
            {p.reference}
          </div>
          {showCatBadge && (
            <div
              className="palette-item-cat"
              style={catColor ? { color: catColor } : undefined}
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
          {isPending && isAdmin && (
            <button
              className="palette-validate-btn"
              onClick={() => handleValidate(p.id)}
              title="Valider et transférer au catalogue commun"
            >
              ✓
            </button>
          )}
        </div>
      </div>
    );
  };

  /** Rendu d'un bloc grouped (deux niveaux primaire → secondaire). */
  const renderGroupedBlock = (
    grouped: [string, [string, Product[]][]][],
    keyPrefix: string,
  ) => (
    <>
      {grouped.map(([primary, subs]) => {
        const stableKey = `${keyPrefix}::${primary}`;
        const primaryOpen = hasFilter || openGroups.has(stableKey);
        const totalCount = subs.reduce((n, [, items]) => n + items.length, 0);
        return (
          <div key={stableKey} className="palette-group">
            <button
              className="palette-group-title"
              onClick={() => toggleGroup(stableKey)}
              title={primaryOpen ? "Réduire" : "Développer"}
            >
              <span className={`palette-group-chevron${primaryOpen ? "" : " closed"}`}>▾</span>
              <span className="palette-group-name">{primary}</span>
              <span className="palette-group-count">{totalCount}</span>
            </button>
            {primaryOpen && subs.map(([secondary, items]) => {
              const sk = `${keyPrefix}::${subKey(primary, secondary)}`;
              const subOpen = hasFilter || openSubGroups.has(sk);
              const catColor = groupBy === "brand"
                ? categoryColorMap.get(secondary)
                : categoryColorMap.get(primary);
              const showSubGroup = subs.length > 1;
              return (
                <div key={sk} className="palette-subgroup">
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
                  {(subOpen || !showSubGroup) && items.map((p) =>
                    renderProductCard(p, catColor, !showSubGroup, secondary),
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );

  const pendingSectionTitle = isAdmin ? "Catalogue utilisateur" : "Mon catalogue";

  return (
    <div className="palette">
      <div className="palette-header">
        <h3>Catalogue</h3>
        <div className="palette-actions">
          <button onClick={onNew} title="Créer un nouveau produit">+ Nouveau</button>
          <button onClick={onImport} title="Importer des produits (JSON, CSV, XLS)">Importer…</button>
          <div className="palette-export-menu" ref={exportMenuRef}>
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={!products.length}
              title="Exporter le catalogue"
            >
              Exporter ▾
            </button>
            {exportMenuOpen && (
              <div className="palette-export-dropdown">
                <button onClick={handleExportCsv}>CSV</button>
                <button onClick={handleExportXls}>XLS (Excel)</button>
                <button onClick={handleExportJson}>JSON</button>
              </div>
            )}
          </div>
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

      <input
        type="search"
        placeholder="Rechercher…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="palette-search"
      />

      {onAddBlankBlock && (
        <button
          className="palette-blank-block-btn"
          onClick={onAddBlankBlock}
          title="Ajouter un bloc vierge sur le synoptique (marque, référence, catégorie et ports éditables par instance)"
        >
          ⊞ Bloc vierge
        </button>
      )}

      <div className="palette-list">
        {/* ── Catalogue commun ─────────────────────────────────────────── */}
        {groupedCommon.length === 0 && filteredPending.length === 0 && (
          <div className="palette-empty">Aucun produit trouvé</div>
        )}
        {renderGroupedBlock(groupedCommon, "common")}

        {/* ── Séparateur + section pending / Mon catalogue ─────────────── */}
        {filteredPending.length > 0 && (
          <div className="palette-section-divider">
            <div className="palette-section-line" />
            <div className="palette-section-label">
              {pendingSectionTitle}
              <span className="palette-section-count">{filteredPending.length}</span>
            </div>
            <div className="palette-section-line" />
          </div>
        )}

        {/* Admin → regroupement par créateur */}
        {isAdmin && groupedPendingByUser.map(({ name, creatorId, products: prods }) => {
          const key = `creator::${creatorId || name}`;
          const open = hasFilter || openUserGroups.has(key);
          return (
            <div key={key} className="palette-group palette-group-pending">
              <button
                className="palette-group-title"
                onClick={() => toggleUserGroup(key)}
                title={open ? "Réduire" : "Développer"}
              >
                <span className={`palette-group-chevron${open ? "" : " closed"}`}>▾</span>
                <span className="palette-group-name">{name}</span>
                <span className="palette-group-count">{prods.length}</span>
              </button>
              {open && (
                <div className="palette-subgroup">
                  {prods.map((p) => renderProductCard(p, undefined, true, p.category || "Sans catégorie"))}
                </div>
              )}
            </div>
          );
        })}

        {/* Utilisateur → regroupement par marque/catégorie comme le commun */}
        {!isAdmin && renderGroupedBlock(groupedPendingUser, "mine")}
      </div>
    </div>
  );
}

// ── Utilitaire de groupement deux niveaux ────────────────────────────────
function groupProducts(items: Product[], groupBy: GroupBy): [string, [string, Product[]][]][] {
  const getPrimary = (p: Product) =>
    groupBy === "brand"
      ? p.manufacturer || "Sans marque"
      : p.category || "Sans catégorie";

  const getSecondary = (p: Product) =>
    groupBy === "brand"
      ? p.category || "Sans catégorie"
      : p.manufacturer || "Sans marque";

  const primaryMap = new Map<string, Product[]>();
  for (const p of items) {
    const pk = getPrimary(p);
    const arr = primaryMap.get(pk) ?? [];
    arr.push(p);
    primaryMap.set(pk, arr);
  }
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
}


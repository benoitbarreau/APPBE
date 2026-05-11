import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Cable,
  IPNetworkInfo,
  IPTableRow,
  PlacedProduct,
  Port,
  PortPlacement,
  PortSide,
  Product,
  ProjectMeta,
  RackItem,
  SignalDef,
  SignalType,
  Tab,
  Zone,
} from "./types";
import type { ProjectData } from "./lib/projectsApi";
import { DEFAULT_IP_NETWORK, DEFAULT_SIGNAL_DEFS, isBayTab, isIPTableTab, isSynopticTab } from "./types";
import { findNodesByInstanceIds, makeEmptyRow, syncIPRowsFromSynoptics } from "./lib/ipTableSync";

const DEFAULT_ZONES: Zone[] = [
  { id: "baie", label: "Baie", color: "#FF8A3D" },
  { id: "regie", label: "Régie", color: "#3D8AFF" },
];
import { BUILTIN_CATALOG } from "./catalog";

const DEFAULT_PROJECT_META: ProjectMeta = {
  campus: "",
  lieu: "",
  client: "",
  bureauEtude: "",
  trade: "",
  authorName: "",
  version: "V1.0",
  date: new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }),
};

interface State {
  products: Product[];
  // ── Onglets ────────────────────────────────────────────────────────────
  tabs: Tab[];
  activeTabId: string;
  // ── État de travail (= contenu de l'onglet actif) ─────────────────────
  nodes: PlacedProduct[];
  cables: Cable[];
  zones: Zone[];
  // ── Données partagées entre onglets ───────────────────────────────────
  signals: Record<string, SignalDef>;
  projectMeta: ProjectMeta;
  selectedNodeId: string | null;
  selectedCableId: string | null;
  // Cloud project tracking
  currentProjectId: string | null;
  currentProjectName: string;
  currentVersionsMeta: import('./lib/projectsApi').VersionMeta[];
  lastUserId: string | null;

  // ── Actions onglets ───────────────────────────────────────────────────
  addTab: (name?: string) => void;
  /** Crée un onglet Tableau IP, optionnellement pré-rempli depuis les synoptiques. */
  addIPTableTab: (name?: string, autoSync?: boolean) => string;
  /** Crée un onglet Baie (rack planner). */
  addBayTab: (opts?: { name?: string; widthInch?: 10 | 19; heightU?: number }) => string;
  /** Met à jour la configuration de la baie (dimensions, numérotation). */
  updateBayConfig: (tabId: string, patch: { bayWidthInch?: 10 | 19; bayHeightU?: number; bayNumberingFromBottom?: boolean }) => void;
  /** Ajoute un équipement dans la baie. Retourne l'ID créé. */
  addRackItem: (tabId: string, item: Omit<RackItem, 'id'>) => string;
  /** Met à jour un équipement de la baie. */
  updateRackItem: (tabId: string, itemId: string, patch: Partial<RackItem>) => void;
  /** Supprime un équipement de la baie. */
  removeRackItem: (tabId: string, itemId: string) => void;
  removeTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => void;
  duplicateTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setActiveTabTrade: (trade: string) => void;

  // ── Tableau IP ────────────────────────────────────────────────────────
  /** Synchronise les lignes d'un Tableau IP avec l'état actuel des synoptiques. */
  syncIPTable: (tabId: string) => void;
  /** Met à jour une ligne. Si le LABEL change ET que la ligne est liée à des
   *  PlacedProducts (lignes auto), met aussi à jour le label sur ces noeuds. */
  updateIPRow: (tabId: string, rowId: string, patch: Partial<IPTableRow>) => void;
  /** Ajoute une ligne manuelle vide. */
  addIPRow: (tabId: string) => string;
  /** Supprime une ligne. */
  removeIPRow: (tabId: string, rowId: string) => void;
  /** Ajoute plusieurs lignes en une fois (utilisé pour l'import). */
  addIPRows: (tabId: string, rows: IPTableRow[]) => void;
  /** Met à jour le cartouche réseau d'un Tableau IP. */
  updateIPNetwork: (tabId: string, patch: Partial<IPNetworkInfo>) => void;
  /** Met à jour le titre de document du Tableau IP. */
  updateIPTitle: (tabId: string, title: string) => void;

  addProduct: (p: Product) => void;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  removeProduct: (id: string) => void;

  addNode: (productId: string, position: { x: number; y: number }) => string;
  updateNode: (id: string, patch: Partial<PlacedProduct>) => void;
  removeNode: (id: string) => void;
  /** Réordonne les nœuds (drag & drop dans la liste des étiquettes produits). */
  reorderNodes: (fromIndex: number, toIndex: number) => void;

  addCable: (
    c: Omit<Cable, "id" | "cableType" | "number"> & { cableType?: string },
  ) => string;
  updateCable: (id: string, patch: Partial<Cable>) => void;
  removeCable: (id: string) => void;
  reverseCable: (id: string) => void;

  setSelectedNode: (id: string | null) => void;
  setSelectedCable: (id: string | null) => void;

  updateProjectMeta: (patch: Partial<ProjectMeta>) => void;

  upsertSignal: (def: SignalDef) => void;
  removeSignal: (id: string) => void;

  upsertZone: (z: Zone) => void;
  removeZone: (id: string) => void;
  setNodeZone: (nodeId: string, zoneId: string | undefined) => void;

  setNodePortPlacement: (
    nodeId: string,
    portId: string,
    placement: PortPlacement,
  ) => void;
  resetNodePortPlacement: (nodeId: string, portId: string) => void;
  setNodePortLabel: (nodeId: string, portId: string, label: string) => void;
  resetNodePortLabel: (nodeId: string, portId: string) => void;
  setNodePortOrder: (nodeId: string, order: string[]) => void;
  addNodePort: (nodeId: string, port: Port) => void;
  removeNodePort: (nodeId: string, portId: string) => void;

  setProjectName: (name: string) => void;
  setVersionsMeta: (versionsMeta: import('./lib/projectsApi').VersionMeta[]) => void;
  loadProjectData: (id: string, name: string, data: ProjectData, versionsMeta?: import('./lib/projectsApi').VersionMeta[]) => void;
  resetProject: () => void;
  clearForUser: (userId: string) => void;
  /**
   * Fusionne les produits custom chargés depuis Supabase avec le catalogue
   * local. Les produits cloud ont la priorité sur ceux du localStorage.
   */
  mergeUserProducts: (cloudProducts: Product[]) => void;
  /**
   * Fusionne les signaux (légende) chargés depuis Supabase.
   * Les signaux cloud ont la priorité sur ceux du localStorage.
   */
  mergeUserSignals: (cloudSignals: Record<string, SignalDef>) => void;
  /**
   * Fusionne les zones chargées depuis Supabase.
   * Les zones cloud ont la priorité sur celles du localStorage.
   */
  mergeUserZones: (cloudZones: Zone[]) => void;
}

const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/** Préfixe à 1-3 lettres dérivé de la catégorie produit (sans accents,
 *  alphanumérique uniquement, majuscules). Fallback "EQP" si vide. */
function categoryPrefix(category: string): string {
  const clean = (category ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!clean) return "EQP";
  return clean.slice(0, 3);
}

/** Calcule le prochain numéro disponible pour un préfixe donné en analysant
 *  tous les labels existants à travers tous les onglets. Retourne par
 *  exemple "DSP-01" puis "DSP-02" etc. */
function nextAutoLabel(prefix: string, allLabels: string[]): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
  let max = 0;
  for (const lbl of allLabels) {
    const m = (lbl ?? "").trim().match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}-${(max + 1).toString().padStart(2, "0")}`;
}

/** Collecte tous les labels existants à travers tous les onglets synoptiques
 *  + l'état de travail courant (s.nodes). */
function collectAllLabels(s: Pick<State, "tabs" | "activeTabId" | "nodes">): string[] {
  const labels: string[] = [];
  for (const n of s.nodes) labels.push(n.label ?? "");
  for (const t of s.tabs) {
    if (t.id === s.activeTabId) continue;
    if (isIPTableTab(t) || isBayTab(t)) continue;
    for (const n of t.nodes ?? []) labels.push(n.label ?? "");
  }
  return labels;
}

/** Crée un onglet synoptique vide avec des zones par défaut. */
const makeDefaultTab = (name = "Synoptique 1"): Tab => ({
  id: uid(),
  name,
  kind: "synoptic",
  nodes: [],
  cables: [],
  zones: [...DEFAULT_ZONES],
});

/** Crée un onglet Tableau IP vierge. */
const makeIPTab = (name = "Tableau IP"): Tab => ({
  id: uid(),
  name,
  kind: "iptable",
  nodes: [],
  cables: [],
  zones: [],
  rows: [],
  network: { ...DEFAULT_IP_NETWORK },
  documentTitle: "",
});

/** Crée un onglet Baie vierge. */
const makeBayTab = (name = "Baie 1", widthInch: 10 | 19 = 19, heightU = 42): Tab => ({
  id: uid(),
  name,
  kind: "bay",
  nodes: [],
  cables: [],
  zones: [],
  bayWidthInch: widthInch,
  bayHeightU: heightU,
  bayNumberingFromBottom: true,
  bayItems: [],
});

/**
 * Retourne le tableau tabs avec l'état de travail courant flushé dans l'onglet actif.
 * À appeler avant un switch d'onglet ou avant la sauvegarde.
 *
 * Pour un onglet de type "iptable" l'état de travail (nodes/cables/zones) n'est
 * PAS pertinent — on conserve l'onglet tel quel.
 */
// Les zones sont globales au projet (s.zones) — on ne les stocke PAS
// dans chaque onglet. flushActive ne persiste que nodes/cables.
const flushActive = (s: Pick<State, "tabs" | "activeTabId" | "nodes" | "cables">): Tab[] =>
  s.tabs.map((t) => {
    if (t.id !== s.activeTabId) return t;
    if (isIPTableTab(t) || isBayTab(t)) return t;
    return { ...t, nodes: s.nodes, cables: s.cables };
  });

export const useAppStore = create<State>()(
  persist(
    (set, get) => {
      const firstTab = makeDefaultTab();

      return {
        products: BUILTIN_CATALOG,
        tabs: [firstTab],
        activeTabId: firstTab.id,
        nodes: [],
        cables: [],
        signals: { ...DEFAULT_SIGNAL_DEFS },
        zones: [...DEFAULT_ZONES],
        projectMeta: DEFAULT_PROJECT_META,
        selectedNodeId: null,
        selectedCableId: null,
        currentProjectId: null,
        currentProjectName: "Sans titre",
        currentVersionsMeta: [],
        lastUserId: null,

        // ── Gestion des onglets ─────────────────────────────────────────

        addTab: (name?) =>
          set((s) => {
            const flushed = flushActive(s);
            const synopticCount = flushed.filter((t) => isSynopticTab(t)).length;
            const newTab = makeDefaultTab(name ?? `Synoptique ${synopticCount + 1}`);
            return {
              tabs: [...flushed, newTab],
              activeTabId: newTab.id,
              nodes: [],
              cables: [],
              zones: [...DEFAULT_ZONES],
              selectedNodeId: null,
              selectedCableId: null,
            };
          }),

        addIPTableTab: (name, autoSync = true) => {
          const newId = uid();
          set((s) => {
            const flushed = flushActive(s);
            const ipCount = flushed.filter((t) => isIPTableTab(t)).length;
            const tabName = name ?? (ipCount === 0 ? "Tableau IP" : `Tableau IP ${ipCount + 1}`);
            const newTab: Tab = makeIPTab(tabName);
            newTab.id = newId;
            // Auto-sync depuis les synoptiques si demandé
            if (autoSync) {
              newTab.rows = syncIPRowsFromSynoptics([], flushed, s.products);
            }
            return {
              tabs: [...flushed, newTab],
              activeTabId: newTab.id,
              // L'état de travail synoptique n'est plus pertinent → vide
              nodes: [],
              cables: [],
              zones: [],
              selectedNodeId: null,
              selectedCableId: null,
            };
          });
          return newId;
        },

        addBayTab: (opts) => {
          const newId = uid();
          set((s) => {
            const flushed = flushActive(s);
            const bayCount = flushed.filter((t) => isBayTab(t)).length;
            const tabName = opts?.name ?? (bayCount === 0 ? "Baie 1" : `Baie ${bayCount + 1}`);
            const newTab: Tab = makeBayTab(tabName, opts?.widthInch ?? 19, opts?.heightU ?? 42);
            newTab.id = newId;
            return {
              tabs: [...flushed, newTab],
              activeTabId: newTab.id,
              nodes: [],
              cables: [],
              // Ne pas vider zones : elles seraient persistées vides en localStorage
              // et effaceraient les zones de l'utilisateur au rechargement.
              selectedNodeId: null,
              selectedCableId: null,
            };
          });
          return newId;
        },

        updateBayConfig: (tabId, patch) =>
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId && isBayTab(t) ? { ...t, ...patch } : t,
            ),
          })),

        addRackItem: (tabId, item) => {
          const newId = uid();
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId && isBayTab(t)
                ? { ...t, bayItems: [...(t.bayItems ?? []), { ...item, id: newId }] }
                : t,
            ),
          }));
          return newId;
        },

        updateRackItem: (tabId, itemId, patch) =>
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId && isBayTab(t)
                ? {
                    ...t,
                    bayItems: (t.bayItems ?? []).map((it) =>
                      it.id === itemId ? { ...it, ...patch } : it,
                    ),
                  }
                : t,
            ),
          })),

        removeRackItem: (tabId, itemId) =>
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId && isBayTab(t)
                ? { ...t, bayItems: (t.bayItems ?? []).filter((it) => it.id !== itemId) }
                : t,
            ),
          })),

        removeTab: (tabId) =>
          set((s) => {
            if (s.tabs.length <= 1) return {};
            const flushed = flushActive(s);
            const newTabs = flushed.filter((t) => t.id !== tabId);
            if (s.activeTabId !== tabId) {
              return { tabs: newTabs };
            }
            const idx = flushed.findIndex((t) => t.id === tabId);
            const newActive = newTabs[Math.min(idx, newTabs.length - 1)];
            if (isIPTableTab(newActive)) {
              return {
                tabs: newTabs,
                activeTabId: newActive.id,
                nodes: [],
                cables: [],
                // Conserver zones (même logique que bay)
                selectedNodeId: null,
                selectedCableId: null,
              };
            }
            if (isBayTab(newActive)) {
              return {
                tabs: newTabs,
                activeTabId: newActive.id,
                nodes: [],
                cables: [],
                // Conserver zones — cf. commentaire addBayTab
                selectedNodeId: null,
                selectedCableId: null,
              };
            }
            return {
              tabs: newTabs,
              activeTabId: newActive.id,
              nodes: newActive.nodes ?? [],
              cables: newActive.cables ?? [],
              // zones globales : inchangé
              selectedNodeId: null,
              selectedCableId: null,
            };
          }),

        renameTab: (tabId, name) =>
          set((s) => ({
            tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, name } : t)),
          })),

        setActiveTabTrade: (trade) =>
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === s.activeTabId
                ? { ...t, trade, name: trade.trim() || t.name }
                : t,
            ),
          })),

        // ── Actions Tableau IP ──────────────────────────────────────────

        syncIPTable: (tabId) =>
          set((s) => {
            const flushed = flushActive(s);
            const target = flushed.find((t) => t.id === tabId);
            if (!target || !isIPTableTab(target)) return {};
            const next = syncIPRowsFromSynoptics(
              target.rows ?? [],
              flushed,
              s.products,
            );
            return {
              tabs: flushed.map((t) =>
                t.id === tabId ? { ...t, rows: next } : t,
              ),
            };
          }),

        updateIPRow: (tabId, rowId, patch) =>
          set((s) => {
            const target = s.tabs.find((t) => t.id === tabId);
            if (!target || !isIPTableTab(target)) return {};
            const oldRow = (target.rows ?? []).find((r) => r.id === rowId);
            if (!oldRow) return {};
            const newRow = { ...oldRow, ...patch };

            // Synchro inverse : si le LABEL change ET que la ligne est liée à
            // des PlacedProducts, propager le nouveau label dans tous les
            // synoptiques. Concerne lignes auto + lignes manuelles liées.
            const labelChanged =
              patch.label !== undefined && patch.label !== oldRow.label;
            const hasLinks = oldRow.productInstanceIds.length > 0;

            const updatedTabs = s.tabs.map((t) =>
              t.id === tabId
                ? {
                    ...t,
                    rows: (t.rows ?? []).map((r) => (r.id === rowId ? newRow : r)),
                  }
                : t,
            );

            if (!labelChanged || !hasLinks) {
              return { tabs: updatedTabs };
            }

            // Propagation du LABEL dans les onglets synoptiques (et dans
            // l'état de travail nodes[] si l'onglet actif est concerné)
            const nodeRefs = findNodesByInstanceIds(
              updatedTabs,
              oldRow.productInstanceIds,
            );
            const newLabel = patch.label!;

            const tabsWithLabelSync = updatedTabs.map((t) => {
              if (!isSynopticTab(t)) return t;
              const refs = nodeRefs.filter((r) => r.tabId === t.id);
              if (refs.length === 0) return t;
              const refIds = new Set(refs.map((r) => r.nodeId));
              return {
                ...t,
                nodes: (t.nodes ?? []).map((n) =>
                  refIds.has(n.id) ? { ...n, label: newLabel, labelIsAuto: false } : n,
                ),
              };
            });

            // Si l'onglet actif est un synoptique, on doit aussi mettre à
            // jour l'état de travail s.nodes — sinon on verrait l'ancien
            // label tant qu'on n'a pas changé d'onglet.
            const activeIsSynoptic = isSynopticTab(
              s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0],
            );
            if (!activeIsSynoptic) {
              return { tabs: tabsWithLabelSync };
            }
            const refIdsActive = new Set(
              nodeRefs
                .filter((r) => r.tabId === s.activeTabId)
                .map((r) => r.nodeId),
            );
            return {
              tabs: tabsWithLabelSync,
              nodes: s.nodes.map((n) =>
                refIdsActive.has(n.id) ? { ...n, label: newLabel, labelIsAuto: false } : n,
              ),
            };
          }),

        addIPRow: (tabId) => {
          const newRow = makeEmptyRow(true);
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId && isIPTableTab(t)
                ? { ...t, rows: [...(t.rows ?? []), newRow] }
                : t,
            ),
          }));
          return newRow.id;
        },

        removeIPRow: (tabId, rowId) =>
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId && isIPTableTab(t)
                ? { ...t, rows: (t.rows ?? []).filter((r) => r.id !== rowId) }
                : t,
            ),
          })),

        addIPRows: (tabId, rows) =>
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId && isIPTableTab(t)
                ? { ...t, rows: [...(t.rows ?? []), ...rows] }
                : t,
            ),
          })),

        updateIPNetwork: (tabId, patch) =>
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId && isIPTableTab(t)
                ? {
                    ...t,
                    network: { ...(t.network ?? DEFAULT_IP_NETWORK), ...patch },
                  }
                : t,
            ),
          })),

        updateIPTitle: (tabId, title) =>
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === tabId && isIPTableTab(t) ? { ...t, documentTitle: title } : t,
            ),
          })),

        duplicateTab: (tabId) =>
          set((s) => {
            const flushed = flushActive(s);
            const source = flushed.find((t) => t.id === tabId);
            if (!source) return {};

            // Duplication d'une Baie
            if (isBayTab(source)) {
              const newTab: Tab = {
                ...source,
                id: uid(),
                name: `Copie de ${source.name}`,
                bayItems: (source.bayItems ?? []).map((it) => ({ ...it, id: uid() })),
              };
              const idx = flushed.findIndex((t) => t.id === tabId);
              const newTabs = [
                ...flushed.slice(0, idx + 1),
                newTab,
                ...flushed.slice(idx + 1),
              ];
              return {
                tabs: newTabs,
                activeTabId: newTab.id,
                nodes: [],
                cables: [],
                zones: [],
                selectedNodeId: null,
                selectedCableId: null,
              };
            }

            // Remappage des IDs de nœuds (les câbles référencent les IDs de nœuds)
            const nodeIdMap = new Map<string, string>();
            const newNodes = source.nodes.map((n) => {
              const newId = uid();
              nodeIdMap.set(n.id, newId);
              return { ...n, id: newId };
            });

            const newCables = source.cables.map((c) => ({
              ...c,
              id: uid(),
              fromNodeId: nodeIdMap.get(c.fromNodeId) ?? c.fromNodeId,
              toNodeId: nodeIdMap.get(c.toNodeId) ?? c.toNodeId,
            }));

            // Zones globales : pas besoin de les copier par onglet.
            const newTab: Tab = {
              id: uid(),
              name: `Copie de ${source.name}`,
              nodes: newNodes,
              cables: newCables,
              zones: [],
            };

            // Insérer juste après l'onglet source
            const idx = flushed.findIndex((t) => t.id === tabId);
            const newTabs = [
              ...flushed.slice(0, idx + 1),
              newTab,
              ...flushed.slice(idx + 1),
            ];

            return {
              tabs: newTabs,
              activeTabId: newTab.id,
              nodes: newNodes,
              cables: newCables,
              // s.zones inchangé (zones globales)
              selectedNodeId: null,
              selectedCableId: null,
            };
          }),

        setActiveTab: (tabId) =>
          set((s) => {
            if (s.activeTabId === tabId) return {};
            const flushed = flushActive(s);
            const target = flushed.find((t) => t.id === tabId);
            if (!target) return {};
            // Onglet IP : vider nodes/cables mais CONSERVER zones — même
            // raison que pour les baies : zones: [] persiste en localStorage
            // et efface les définitions de zones de l'utilisateur.
            if (isIPTableTab(target)) {
              return {
                tabs: flushed,
                activeTabId: tabId,
                nodes: [],
                cables: [],
                selectedNodeId: null,
                selectedCableId: null,
              };
            }
            // Baie : vider nodes/cables mais CONSERVER zones pour ne pas
            // les persister vides en localStorage et effacer les zones utilisateur.
            if (isBayTab(target)) {
              return {
                tabs: flushed,
                activeTabId: tabId,
                nodes: [],
                cables: [],
                selectedNodeId: null,
                selectedCableId: null,
              };
            }
            // Zones globales : on ne restaure PAS depuis t.zones (obsolète).
            // s.zones reste inchangé — il est la source unique de vérité.
            return {
              tabs: flushed,
              activeTabId: tabId,
              nodes: target.nodes ?? [],
              cables: target.cables ?? [],
              selectedNodeId: null,
              selectedCableId: null,
            };
          }),

        // ── Produits ────────────────────────────────────────────────────

        addProduct: (p) =>
          set((s) => ({ products: [...s.products.filter((x) => x.id !== p.id), p] })),
        updateProduct: (id, patch) =>
          set((s) => ({
            products: s.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          })),
        removeProduct: (id) =>
          set((s) => ({ products: s.products.filter((p) => p.id !== id) })),

        // ── Nœuds ───────────────────────────────────────────────────────

        addNode: (productId, position) => {
          const id = uid();
          set((s) => {
            const product = s.products.find((p) => p.id === productId);
            const baseName = product ? `${product.manufacturer} ${product.reference}` : "Produit";
            const count = s.nodes.filter((n) => n.productId === productId).length;
            const name = count === 0 ? baseName : `${baseName} #${count + 1}`;
            // Label auto basé sur la catégorie : "DSP-01" pour un DSP audio,
            // "MAT-01" pour une matrice, etc. Numérotation continue à travers
            // tous les onglets pour éviter les doublons.
            const prefix = categoryPrefix(product?.category ?? "");
            const label = nextAutoLabel(prefix, collectAllLabels(s));
            return {
              nodes: [
                ...s.nodes,
                { id, productId, name, position, label, labelIsAuto: true },
              ],
            };
          });
          return id;
        },
        updateNode: (id, patch) =>
          set((s) => ({
            nodes: s.nodes.map((n) => {
              if (n.id !== id) return n;
              // Si label change sans précision explicite sur labelIsAuto,
              // c'est une édition manuelle → on retire le flag auto.
              const finalPatch =
                "label" in patch && !("labelIsAuto" in patch)
                  ? { ...patch, labelIsAuto: false }
                  : patch;
              return { ...n, ...finalPatch };
            }),
          })),
        removeNode: (id) =>
          set((s) => ({
            nodes: s.nodes.filter((n) => n.id !== id),
            cables: s.cables.filter((c) => c.fromNodeId !== id && c.toNodeId !== id),
          })),
        reorderNodes: (fromIndex, toIndex) =>
          set((s) => {
            if (
              fromIndex === toIndex ||
              fromIndex < 0 ||
              fromIndex >= s.nodes.length ||
              toIndex < 0 ||
              toIndex >= s.nodes.length
            ) {
              return {};
            }
            const next = [...s.nodes];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return { nodes: next };
          }),

        // ── Câbles ──────────────────────────────────────────────────────

        addCable: (c) => {
          const id = uid();
          set((s) => {
            const def = s.signals[c.signal];
            const prefix = def?.numberPrefix ?? c.signal;
            const used = s.cables
              .map((x) => x.number)
              .filter((n): n is string => !!n && n.startsWith(prefix))
              .map((n) => parseInt(n.slice(prefix.length), 10))
              .filter((n) => !isNaN(n));
            const next = (used.length ? Math.max(...used) : 0) + 1;
            const number = `${prefix}${next}`;
            return {
              cables: [
                ...s.cables,
                {
                  id,
                  number,
                  fromPortSide: "out",
                  toPortSide: "in",
                  cableType: c.cableType ?? def?.defaultCable ?? "Câble",
                  ...c,
                } as Cable,
              ],
            };
          });
          return id;
        },
        updateCable: (id, patch) =>
          set((s) => ({
            cables: s.cables.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          })),
        removeCable: (id) =>
          set((s) => ({ cables: s.cables.filter((c) => c.id !== id) })),
        reverseCable: (id) =>
          set((s) => ({
            cables: s.cables.map((c) =>
              c.id === id ? { ...c, reversed: !c.reversed } : c,
            ),
          })),

        setSelectedNode: (id) => set({ selectedNodeId: id, selectedCableId: null }),
        setSelectedCable: (id) => set({ selectedCableId: id, selectedNodeId: null }),

        updateProjectMeta: (patch) =>
          set((s) => ({ projectMeta: { ...s.projectMeta, ...patch } })),

        upsertSignal: (def) =>
          set((s) => ({ signals: { ...s.signals, [def.id]: def } })),
        removeSignal: (id) =>
          set((s) => {
            const next = { ...s.signals };
            delete next[id];
            return { signals: next };
          }),

        upsertZone: (z) =>
          set((s) => {
            const idx = s.zones.findIndex((x) => x.id === z.id);
            if (idx === -1) return { zones: [...s.zones, z] };
            const next = [...s.zones];
            next[idx] = z;
            return { zones: next };
          }),
        removeZone: (id) =>
          set((s) => ({
            zones: s.zones.filter((z) => z.id !== id),
            nodes: s.nodes.map((n) =>
              n.zoneId === id ? { ...n, zoneId: undefined } : n,
            ),
          })),
        setNodeZone: (nodeId, zoneId) =>
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === nodeId ? { ...n, zoneId } : n,
            ),
          })),

        setNodePortPlacement: (nodeId, portId, placement) =>
          set((s) => {
            const sideFor = (current: PortSide | undefined): PortSide => {
              if (placement === "left") return "in";
              if (placement === "right") return "out";
              if (current === "midL" || current === "midR") return current;
              return "midL";
            };
            return {
              nodes: s.nodes.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      portOverrides: { ...(n.portOverrides ?? {}), [portId]: placement },
                    }
                  : n,
              ),
              cables: s.cables.map((c) => {
                let next = c;
                if (c.fromNodeId === nodeId && c.fromPortId === portId) {
                  next = { ...next, fromPortSide: sideFor(c.fromPortSide) };
                }
                if (c.toNodeId === nodeId && c.toPortId === portId) {
                  next = { ...next, toPortSide: sideFor(c.toPortSide) };
                }
                return next;
              }),
            };
          }),

        resetNodePortPlacement: (nodeId, portId) =>
          set((s) => ({
            nodes: s.nodes.map((n) => {
              if (n.id !== nodeId || !n.portOverrides) return n;
              const next = { ...n.portOverrides };
              delete next[portId];
              return { ...n, portOverrides: next };
            }),
          })),

        setNodePortLabel: (nodeId, portId, label) =>
          set((s) => ({
            nodes: s.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              const isExtra = (n.extraPorts ?? []).some((p) => p.id === portId);
              if (isExtra) {
                return {
                  ...n,
                  extraPorts: (n.extraPorts ?? []).map((p) =>
                    p.id === portId ? { ...p, label } : p,
                  ),
                };
              }
              return {
                ...n,
                portLabelOverrides: {
                  ...(n.portLabelOverrides ?? {}),
                  [portId]: label,
                },
              };
            }),
          })),

        resetNodePortLabel: (nodeId, portId) =>
          set((s) => ({
            nodes: s.nodes.map((n) => {
              if (n.id !== nodeId || !n.portLabelOverrides) return n;
              const next = { ...n.portLabelOverrides };
              delete next[portId];
              return { ...n, portLabelOverrides: next };
            }),
          })),

        setNodePortOrder: (nodeId, order) =>
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === nodeId ? { ...n, portOrder: order } : n,
            ),
          })),

        addNodePort: (nodeId, port) =>
          set((s) => ({
            nodes: s.nodes.map((n) =>
              n.id === nodeId
                ? { ...n, extraPorts: [...(n.extraPorts ?? []), port] }
                : n,
            ),
          })),

        removeNodePort: (nodeId, portId) =>
          set((s) => ({
            nodes: s.nodes.map((n) => {
              if (n.id !== nodeId) return n;
              return {
                ...n,
                extraPorts: (n.extraPorts ?? []).filter((p) => p.id !== portId),
                portOrder: n.portOrder?.filter((id) => id !== portId),
                portOverrides: n.portOverrides
                  ? Object.fromEntries(
                      Object.entries(n.portOverrides).filter(([k]) => k !== portId),
                    )
                  : undefined,
                portLabelOverrides: n.portLabelOverrides
                  ? Object.fromEntries(
                      Object.entries(n.portLabelOverrides).filter(([k]) => k !== portId),
                    )
                  : undefined,
              };
            }),
            cables: s.cables.filter(
              (c) =>
                !(c.fromNodeId === nodeId && c.fromPortId === portId) &&
                !(c.toNodeId === nodeId && c.toPortId === portId),
            ),
          })),

        setProjectName: (name) => set({ currentProjectName: name }),
        setVersionsMeta: (currentVersionsMeta) => set({ currentVersionsMeta }),

        loadProjectData: (id, name, data, versionsMeta) => {
          let tabs: Tab[];
          let activeTabId: string;

          if (data.tabs && data.tabs.length > 0) {
            tabs = data.tabs;
            const stored = data.activeTabId;
            activeTabId =
              stored && tabs.some((t) => t.id === stored) ? stored : tabs[0].id;
          } else {
            // Format legacy (sans onglets) — migration à la volée
            const legacyTab: Tab = {
              id: uid(),
              name: "Synoptique 1",
              nodes: data.nodes ?? [],
              cables: data.cables ?? [],
              zones: data.zones ?? [...DEFAULT_ZONES],
            };
            tabs = [legacyTab];
            activeTabId = legacyTab.id;
          }

          const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

          // ── Fusion produits ───────────────────────────────────────────────
          // Catalogue courant (cloud mergé au login) prioritaire.
          // Le projet fournit uniquement les produits absents du catalogue global.
          const currentProducts = get().products;
          const mergedProductMap = new Map<string, Product>(
            currentProducts.map((p) => [p.id, p]),
          );
          for (const p of (data.products ?? [] as Product[])) {
            if (!mergedProductMap.has(p.id)) {
              mergedProductMap.set(p.id, p);
            }
          }

          // ── Signaux et zones : JAMAIS écrasés par le projet ─────────────
          // Ces données sont globales (catalogue partagé d'équipe) et sont
          // gérées exclusivement via Supabase user_signals / user_zones.
          // Le JSONB projet peut les contenir pour compatibilité ascendante
          // mais ne doit jamais écraser l'état courant du store.

          set({
            currentProjectId: id,
            currentProjectName: name,
            currentVersionsMeta: versionsMeta ?? [],
            tabs,
            activeTabId,
            nodes: activeTab.nodes,
            cables: activeTab.cables,
            // zones et signals : on garde ce qui est déjà dans le store
            projectMeta: data.projectMeta ?? DEFAULT_PROJECT_META,
            products: Array.from(mergedProductMap.values()),
            selectedNodeId: null,
            selectedCableId: null,
          });
        },

        resetProject: () => {
          const tab = makeDefaultTab();
          set({
            tabs: [tab],
            activeTabId: tab.id,
            nodes: [],
            cables: [],
            zones: [...DEFAULT_ZONES],
            currentProjectId: null,
            currentProjectName: "Sans titre",
            currentVersionsMeta: [],
            projectMeta: { ...DEFAULT_PROJECT_META },
            selectedNodeId: null,
            selectedCableId: null,
          });
        },

        mergeUserProducts: (cloudProducts) =>
          set((s) => {
            const builtinIds = new Set(BUILTIN_CATALOG.map((p) => p.id));
            // Catalogue de base (builtin) + produits cloud (priorité max)
            const result = new Map<string, Product>(
              BUILTIN_CATALOG.map((p) => [p.id, p]),
            );
            for (const p of cloudProducts) result.set(p.id, p);
            // Produits custom locaux pas encore synchronisés (nouveaux, offline)
            for (const p of s.products) {
              if (!builtinIds.has(p.id) && !result.has(p.id)) {
                result.set(p.id, p);
              }
            }
            return { products: Array.from(result.values()) };
          }),

        mergeUserSignals: (cloudSignals) =>
          set((s) => {
            // Signaux cloud (priorité max) + locaux non encore synchro
            const result: Record<string, SignalDef> = { ...s.signals };
            for (const [id, def] of Object.entries(cloudSignals)) {
              result[id] = def;
            }
            return { signals: result };
          }),

        mergeUserZones: (cloudZones) =>
          set((s) => {
            // Zones cloud (priorité max) + locales non encore synchro
            const result = new Map<string, Zone>(s.zones.map((z) => [z.id, z]));
            for (const z of cloudZones) result.set(z.id, z);
            return { zones: Array.from(result.values()) };
          }),

        clearForUser: (userId) =>
          set((s) => {
            if (s.lastUserId === userId) return {};
            const tab = makeDefaultTab();
            return {
              lastUserId: userId,
              tabs: [tab],
              activeTabId: tab.id,
              currentProjectId: null,
              currentProjectName: "Sans titre",
              currentVersionsMeta: [],
              nodes: [],
              cables: [],
              zones: [...DEFAULT_ZONES],
              projectMeta: { ...DEFAULT_PROJECT_META },
              signals: { ...DEFAULT_SIGNAL_DEFS },
              selectedNodeId: null,
              selectedCableId: null,
              products: BUILTIN_CATALOG,
            };
          }),
      };
    },
    {
      name: "av-diagram-generator",
      version: 10,
      migrate: (persisted, fromVersion) => {
        const state = persisted as Partial<State> & {
          adminCode?: unknown;
          nodes?: PlacedProduct[];
          cables?: Cable[];
          zones?: Zone[];
        } | undefined;
        if (!state) return state as unknown as State;

        if (fromVersion < 2 && state.cables) {
          const counters: Record<string, number> = {};
          state.cables = state.cables.map((c) => {
            if (c.number) return c;
            const prefix = DEFAULT_SIGNAL_DEFS[c.signal]?.numberPrefix ?? "X";
            counters[prefix] = (counters[prefix] ?? 0) + 1;
            return { ...c, number: `${prefix}${counters[prefix]}` };
          });
        }
        if (!state.projectMeta) state.projectMeta = DEFAULT_PROJECT_META;
        if (fromVersion < 3 || !state.signals) state.signals = { ...DEFAULT_SIGNAL_DEFS };
        if (fromVersion < 4 || !state.zones) state.zones = [...DEFAULT_ZONES];
        delete state.adminCode;
        if (state.currentProjectId === undefined) state.currentProjectId = null;
        if (!state.currentProjectName) state.currentProjectName = "Sans titre";
        if (state.lastUserId === undefined) state.lastUserId = null;

        // v9 : migration vers le système d'onglets
        if (fromVersion < 9 || !state.tabs || state.tabs.length === 0) {
          const newId: string =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? (crypto as { randomUUID: () => string }).randomUUID()
              : Math.random().toString(36).slice(2);
          const tab: Tab = {
            id: newId,
            name: "Synoptique 1",
            nodes: state.nodes ?? [],
            cables: state.cables ?? [],
            zones: state.zones ?? [...DEFAULT_ZONES],
          };
          state.tabs = [tab];
          state.activeTabId = tab.id;
        }
        if (!state.activeTabId) state.activeTabId = state.tabs[0].id;

        // v10 : ajout du discriminator `kind` sur les onglets
        // Les anciens onglets sans `kind` sont implicitement des synoptiques.
        if (fromVersion < 10 && state.tabs) {
          state.tabs = state.tabs.map((t) =>
            t.kind === undefined ? { ...t, kind: "synoptic" as const } : t,
          );
        }

        return state as unknown as State;
      },
    },
  ),
);

export const defaultCableFor = (signal: SignalType): string =>
  useAppStore.getState().signals[signal]?.defaultCable ?? "Câble générique";

/**
 * Retourne le tableau tabs avec l'état de travail courant flushé dans l'onglet actif.
 * À appeler dans App.tsx avant de sauvegarder le projet.
 */
export function getFlushedTabs(): Tab[] {
  const s = useAppStore.getState();
  return s.tabs.map((t) => {
    if (t.id !== s.activeTabId) return t;
    if (isIPTableTab(t) || isBayTab(t)) return t;
    return { ...t, nodes: s.nodes, cables: s.cables, zones: s.zones };
  });
}

// ── Store catalogue méta (non persisté) ──────────────────────────────────
// Marques et catégories gérées par les admins, chargées depuis Supabase
// au login. Non persistées en localStorage pour toujours refléter le serveur.

import type { CatalogBrand, CatalogCategory } from "./lib/catalogMetaApi";

interface CatalogMetaState {
  catalogBrands: CatalogBrand[];
  catalogCategories: CatalogCategory[];
  setCatalogMeta: (brands: CatalogBrand[], categories: CatalogCategory[]) => void;
}

export const useCatalogMeta = create<CatalogMetaState>()((set) => ({
  catalogBrands: [],
  catalogCategories: [],
  setCatalogMeta: (catalogBrands, catalogCategories) =>
    set({ catalogBrands, catalogCategories }),
}));

// ── État éditeur non-persisté (lecture seule, vue câbles, etc.) ────────────
interface EditorState {
  readOnly: boolean;
  setReadOnly: (v: boolean) => void;
  cableView: "simple" | "detailed";
  setCableView: (v: "simple" | "detailed") => void;
}

export const useEditorState = create<EditorState>()((set) => ({
  readOnly: false,
  setReadOnly: (readOnly) => set({ readOnly }),
  cableView: "detailed",
  setCableView: (cableView) => set({ cableView }),
}));

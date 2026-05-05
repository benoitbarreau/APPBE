import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Cable,
  PlacedProduct,
  Port,
  PortPlacement,
  PortSide,
  Product,
  ProjectMeta,
  SignalDef,
  SignalType,
  Tab,
  Zone,
} from "./types";
import type { ProjectData } from "./lib/projectsApi";
import { DEFAULT_SIGNAL_DEFS } from "./types";

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
  removeTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => void;
  duplicateTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  addProduct: (p: Product) => void;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  removeProduct: (id: string) => void;

  addNode: (productId: string, position: { x: number; y: number }) => string;
  updateNode: (id: string, patch: Partial<PlacedProduct>) => void;
  removeNode: (id: string) => void;

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
}

const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/** Crée un onglet vide avec des zones par défaut */
const makeDefaultTab = (name = "Synoptique 1"): Tab => ({
  id: uid(),
  name,
  nodes: [],
  cables: [],
  zones: [...DEFAULT_ZONES],
});

/**
 * Retourne le tableau tabs avec l'état de travail courant flushé dans l'onglet actif.
 * À appeler avant un switch d'onglet ou avant la sauvegarde.
 */
const flushActive = (s: Pick<State, "tabs" | "activeTabId" | "nodes" | "cables" | "zones">): Tab[] =>
  s.tabs.map((t) =>
    t.id === s.activeTabId
      ? { ...t, nodes: s.nodes, cables: s.cables, zones: s.zones }
      : t,
  );

export const useAppStore = create<State>()(
  persist(
    (set) => {
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
            const newTab = makeDefaultTab(name ?? `Synoptique ${flushed.length + 1}`);
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
            return {
              tabs: newTabs,
              activeTabId: newActive.id,
              nodes: newActive.nodes,
              cables: newActive.cables,
              zones: newActive.zones,
              selectedNodeId: null,
              selectedCableId: null,
            };
          }),

        renameTab: (tabId, name) =>
          set((s) => ({
            tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, name } : t)),
          })),

        duplicateTab: (tabId) =>
          set((s) => {
            const flushed = flushActive(s);
            const source = flushed.find((t) => t.id === tabId);
            if (!source) return {};

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

            const newTab: Tab = {
              id: uid(),
              name: `Copie de ${source.name}`,
              nodes: newNodes,
              cables: newCables,
              zones: source.zones.map((z) => ({ ...z })),
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
              zones: newTab.zones,
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
            return {
              tabs: flushed,
              activeTabId: tabId,
              nodes: target.nodes,
              cables: target.cables,
              zones: target.zones,
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
            return { nodes: [...s.nodes, { id, productId, name, position }] };
          });
          return id;
        },
        updateNode: (id, patch) =>
          set((s) => ({
            nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
          })),
        removeNode: (id) =>
          set((s) => ({
            nodes: s.nodes.filter((n) => n.id !== id),
            cables: s.cables.filter((c) => c.fromNodeId !== id && c.toNodeId !== id),
          })),

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

          set({
            currentProjectId: id,
            currentProjectName: name,
            currentVersionsMeta: versionsMeta ?? [],
            tabs,
            activeTabId,
            nodes: activeTab.nodes,
            cables: activeTab.cables,
            zones: activeTab.zones,
            projectMeta: data.projectMeta ?? DEFAULT_PROJECT_META,
            signals: data.signals ?? { ...DEFAULT_SIGNAL_DEFS },
            products: data.products ?? BUILTIN_CATALOG,
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
      version: 9,
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
  return s.tabs.map((t) =>
    t.id === s.activeTabId
      ? { ...t, nodes: s.nodes, cables: s.cables, zones: s.zones }
      : t,
  );
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

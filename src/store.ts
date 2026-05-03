import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Cable,
  PlacedProduct,
  Product,
  ProjectMeta,
  SignalDef,
  SignalType,
} from "./types";
import { DEFAULT_SIGNAL_DEFS } from "./types";
import { BUILTIN_CATALOG } from "./catalog";

const DEFAULT_PROJECT_META: ProjectMeta = {
  campus: "Campus",
  client: "Client",
  bureauEtude: "Bureau d'étude",
  trade: "Courant Faible",
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
  nodes: PlacedProduct[];
  cables: Cable[];
  signals: Record<string, SignalDef>;
  projectMeta: ProjectMeta;
  selectedNodeId: string | null;
  selectedCableId: string | null;

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

  resetProject: () => void;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export const useAppStore = create<State>()(
  persist(
    (set) => ({
      products: BUILTIN_CATALOG,
      nodes: [],
      cables: [],
      signals: { ...DEFAULT_SIGNAL_DEFS },
      projectMeta: DEFAULT_PROJECT_META,
      selectedNodeId: null,
      selectedCableId: null,

      addProduct: (p) =>
        set((s) => ({ products: [...s.products.filter((x) => x.id !== p.id), p] })),
      updateProduct: (id, patch) =>
        set((s) => ({
          products: s.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      removeProduct: (id) =>
        set((s) => ({ products: s.products.filter((p) => p.id !== id) })),

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

      resetProject: () => set({ nodes: [], cables: [] }),
    }),
    {
      name: "av-diagram-generator",
      version: 3,
      migrate: (persisted, fromVersion) => {
        const state = persisted as Partial<State> | undefined;
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
        if (fromVersion < 3 || !state.signals) {
          state.signals = { ...DEFAULT_SIGNAL_DEFS };
        }
        return state as unknown as State;
      },
    },
  ),
);

export const defaultCableFor = (signal: SignalType): string =>
  useAppStore.getState().signals[signal]?.defaultCable ?? "Câble générique";

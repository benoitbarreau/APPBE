import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Cable, PlacedProduct, Product, ProjectMeta, SignalType } from "./types";
import { SIGNAL_DEFAULT_CABLE, SIGNAL_NUMBER_PREFIX } from "./types";
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

  setSelectedNode: (id: string | null) => void;
  setSelectedCable: (id: string | null) => void;

  updateProjectMeta: (patch: Partial<ProjectMeta>) => void;

  resetProject: () => void;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export const defaultCableFor = (signal: SignalType): string =>
  SIGNAL_DEFAULT_CABLE[signal] ?? "Câble générique";

export const useAppStore = create<State>()(
  persist(
    (set) => ({
      products: BUILTIN_CATALOG,
      nodes: [],
      cables: [],
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
          const prefix = SIGNAL_NUMBER_PREFIX[c.signal];
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
                cableType: c.cableType ?? defaultCableFor(c.signal),
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

      setSelectedNode: (id) => set({ selectedNodeId: id, selectedCableId: null }),
      setSelectedCable: (id) => set({ selectedCableId: id, selectedNodeId: null }),

      updateProjectMeta: (patch) =>
        set((s) => ({ projectMeta: { ...s.projectMeta, ...patch } })),

      resetProject: () => set({ nodes: [], cables: [] }),
    }),
    {
      name: "av-diagram-generator",
      version: 2,
      migrate: (persisted, fromVersion) => {
        const state = persisted as Partial<State> | undefined;
        if (!state) return state as unknown as State;
        if (fromVersion < 2 && state.cables) {
          const counters: Record<string, number> = {};
          state.cables = state.cables.map((c) => {
            if (c.number) return c;
            const prefix = SIGNAL_NUMBER_PREFIX[c.signal] ?? "X";
            counters[prefix] = (counters[prefix] ?? 0) + 1;
            return { ...c, number: `${prefix}${counters[prefix]}` };
          });
        }
        if (!state.projectMeta) state.projectMeta = DEFAULT_PROJECT_META;
        return state as unknown as State;
      },
    },
  ),
);

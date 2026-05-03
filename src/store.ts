import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Cable, PlacedProduct, Product, SignalType } from "./types";
import { SIGNAL_DEFAULT_CABLE } from "./types";
import { BUILTIN_CATALOG } from "./catalog";

interface State {
  products: Product[];
  nodes: PlacedProduct[];
  cables: Cable[];
  selectedNodeId: string | null;
  selectedCableId: string | null;

  addProduct: (p: Product) => void;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  removeProduct: (id: string) => void;

  addNode: (productId: string, position: { x: number; y: number }) => string;
  updateNode: (id: string, patch: Partial<PlacedProduct>) => void;
  removeNode: (id: string) => void;

  addCable: (c: Omit<Cable, "id" | "cableType"> & { cableType?: string }) => string;
  updateCable: (id: string, patch: Partial<Cable>) => void;
  removeCable: (id: string) => void;

  setSelectedNode: (id: string | null) => void;
  setSelectedCable: (id: string | null) => void;

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
        set((s) => ({
          cables: [
            ...s.cables,
            {
              id,
              cableType: c.cableType ?? defaultCableFor(c.signal),
              ...c,
            } as Cable,
          ],
        }));
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

      resetProject: () => set({ nodes: [], cables: [] }),
    }),
    { name: "av-diagram-generator" },
  ),
);

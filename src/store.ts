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
  zones: Zone[];
  projectMeta: ProjectMeta;
  selectedNodeId: string | null;
  selectedCableId: string | null;

  // Cloud project tracking
  currentProjectId: string | null;
  currentProjectName: string;

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
  loadProjectData: (id: string, name: string, data: ProjectData) => void;
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
      zones: [...DEFAULT_ZONES],
      projectMeta: DEFAULT_PROJECT_META,
      selectedNodeId: null,
      selectedCableId: null,
      currentProjectId: null,
      currentProjectName: "Sans titre",

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
            // middle: keep midL/midR if already on a middle handle, else default midL
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
                    Object.entries(n.portOverrides).filter(
                      ([k]) => k !== portId,
                    ),
                  )
                : undefined,
              portLabelOverrides: n.portLabelOverrides
                ? Object.fromEntries(
                    Object.entries(n.portLabelOverrides).filter(
                      ([k]) => k !== portId,
                    ),
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

      loadProjectData: (id, name, data) =>
        set({
          currentProjectId: id,
          currentProjectName: name,
          nodes: data.nodes ?? [],
          cables: data.cables ?? [],
          projectMeta: data.projectMeta ?? DEFAULT_PROJECT_META,
          signals: data.signals ?? { ...DEFAULT_SIGNAL_DEFS },
          zones: data.zones ?? [...DEFAULT_ZONES],
          products: data.products ?? BUILTIN_CATALOG,
          selectedNodeId: null,
          selectedCableId: null,
        }),

      resetProject: () =>
        set({
          nodes: [],
          cables: [],
          currentProjectId: null,
          currentProjectName: "Sans titre",
          projectMeta: { ...DEFAULT_PROJECT_META },
          selectedNodeId: null,
          selectedCableId: null,
        }),
    }),
    {
      name: "av-diagram-generator",
      version: 7,
      migrate: (persisted, fromVersion) => {
        const state = persisted as Partial<State> & { adminCode?: unknown } | undefined;
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
        if (fromVersion < 4 || !state.zones) {
          state.zones = [...DEFAULT_ZONES];
        }
        // v6: adminCode removed — strip from persisted state if present
        delete state.adminCode;
        if (state.currentProjectId === undefined) state.currentProjectId = null;
        if (!state.currentProjectName) state.currentProjectName = "Sans titre";
        return state as unknown as State;
      },
    },
  ),
);

export const defaultCableFor = (signal: SignalType): string =>
  useAppStore.getState().signals[signal]?.defaultCable ?? "Câble générique";

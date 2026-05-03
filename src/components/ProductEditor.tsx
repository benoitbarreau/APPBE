import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store";
import {
  type Port,
  type PortDirection,
  type Product,
  type SignalType,
} from "../types";

type PortListKey = "inputs" | "outputs" | "middle";

const emptyProduct = (): Product => ({
  id: "",
  reference: "",
  manufacturer: "",
  category: "",
  inputs: [],
  outputs: [],
  middle: [],
});

export function ProductEditor({
  productId,
  onClose,
}: {
  productId: string | "new" | null;
  onClose: () => void;
}) {
  const products = useAppStore((s) => s.products);
  const addProduct = useAppStore((s) => s.addProduct);
  const updateProduct = useAppStore((s) => s.updateProduct);
  const removeProduct = useAppStore((s) => s.removeProduct);

  const [draft, setDraft] = useState<Product>(emptyProduct());

  useEffect(() => {
    if (productId === "new" || productId === null) {
      setDraft({ ...emptyProduct(), id: `custom-${Date.now()}` });
    } else {
      const found = products.find((p) => p.id === productId);
      if (found) setDraft(JSON.parse(JSON.stringify(found)));
    }
  }, [productId, products]);

  if (productId === null) return null;

  const isNew = productId === "new" || !products.some((p) => p.id === productId);

  const getList = (d: Product, side: PortListKey): Port[] =>
    side === "middle" ? d.middle ?? [] : d[side];

  const setPort = (side: PortListKey, idx: number, patch: Partial<Port>) => {
    setDraft((d) => ({
      ...d,
      [side]: getList(d, side).map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  };

  const addPort = (side: PortListKey) => {
    setDraft((d) => {
      const list = getList(d, side);
      const labelPrefix =
        side === "inputs" ? "IN" : side === "outputs" ? "OUT" : "MID";
      const direction: PortDirection =
        side === "inputs" ? "in" : side === "outputs" ? "out" : "bi";
      const newPort: Port = {
        id: `${side}-${list.length + 1}-${Date.now()}`,
        label: `${labelPrefix} ${list.length + 1}`,
        signal: "HDMI",
        direction,
      };
      return { ...d, [side]: [...list, newPort] };
    });
  };

  const removePort = (side: PortListKey, idx: number) => {
    setDraft((d) => ({
      ...d,
      [side]: getList(d, side).filter((_, i) => i !== idx),
    }));
  };

  const movePort = (from: PortListKey, idx: number, to: PortListKey) => {
    if (from === to) return;
    setDraft((d) => {
      const fromList = getList(d, from);
      const port = fromList[idx];
      if (!port) return d;
      const newDirection: PortDirection =
        to === "inputs" ? "in" : to === "outputs" ? "out" : "bi";
      const moved: Port = { ...port, direction: newDirection };
      const toList = getList(d, to);
      return {
        ...d,
        [from]: fromList.filter((_, i) => i !== idx),
        [to]: [...toList, moved],
      };
    });
  };

  const save = () => {
    if (!draft.reference.trim() || !draft.manufacturer.trim()) {
      alert("Référence et marque obligatoires");
      return;
    }
    if (isNew) addProduct(draft);
    else updateProduct(draft.id, draft);
    onClose();
  };

  const remove = () => {
    if (!confirm("Supprimer ce produit du catalogue ?")) return;
    removeProduct(draft.id);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isNew ? "Nouveau produit" : "Éditer le produit"}</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>Marque</label>
            <input
              value={draft.manufacturer}
              onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Référence</label>
            <input
              value={draft.reference}
              onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Catégorie</label>
            <input
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              placeholder="Écran, matrice, caméra…"
            />
          </div>

          <PortsEditor
            title="Gauche"
            ports={draft.inputs}
            section="inputs"
            onAdd={() => addPort("inputs")}
            onChange={(i, patch) => setPort("inputs", i, patch)}
            onRemove={(i) => removePort("inputs", i)}
            onMove={(i, to) => movePort("inputs", i, to)}
            defaultDirection="in"
          />
          <PortsEditor
            title="Droite"
            ports={draft.outputs}
            section="outputs"
            onAdd={() => addPort("outputs")}
            onChange={(i, patch) => setPort("outputs", i, patch)}
            onRemove={(i) => removePort("outputs", i)}
            onMove={(i, to) => movePort("outputs", i, to)}
            defaultDirection="out"
          />
          <PortsEditor
            title="Milieu (deux côtés, le côté opposé se bloque dès qu'un est raccordé)"
            ports={draft.middle ?? []}
            section="middle"
            onAdd={() => addPort("middle")}
            onChange={(i, patch) => setPort("middle", i, patch)}
            onRemove={(i) => removePort("middle", i)}
            onMove={(i, to) => movePort("middle", i, to)}
            defaultDirection="bi"
          />
        </div>
        <div className="modal-footer">
          {!isNew && (
            <button className="danger" onClick={remove}>
              Supprimer
            </button>
          )}
          <button onClick={onClose}>Annuler</button>
          <button className="primary" onClick={save}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

const SECTION_LABELS: Record<PortListKey, string> = {
  inputs: "Gauche",
  outputs: "Droite",
  middle: "Milieu",
};

function PortsEditor({
  title,
  ports,
  section,
  onAdd,
  onChange,
  onRemove,
  onMove,
}: {
  title: string;
  ports: Port[];
  section: PortListKey;
  onAdd: () => void;
  onChange: (i: number, patch: Partial<Port>) => void;
  onRemove: (i: number) => void;
  onMove: (i: number, to: PortListKey) => void;
  defaultDirection: PortDirection;
}) {
  const signals = useAppStore((s) => s.signals);
  const signalOptions = useMemo(() => Object.values(signals), [signals]);
  return (
    <div className="ports-editor">
      <div className="ports-editor-header">
        <h4>{title}</h4>
        <button onClick={onAdd}>+ Ajouter</button>
      </div>
      {ports.length === 0 && <div className="muted">Aucune.</div>}
      {ports.map((p, i) => (
        <div key={i} className="port-edit-row">
          <span className="port-dot" style={{ background: signals[p.signal]?.color ?? "#888" }} />
          <input
            value={p.label}
            onChange={(e) => onChange(i, { label: e.target.value })}
            placeholder="Libellé"
          />
          <select
            value={p.signal}
            onChange={(e) => onChange(i, { signal: e.target.value as SignalType })}
          >
            {signalOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={section}
            title="Déplacer dans une autre section"
            onChange={(e) => onMove(i, e.target.value as PortListKey)}
            className="port-section-select"
          >
            {(Object.keys(SECTION_LABELS) as PortListKey[]).map((s) => (
              <option key={s} value={s}>
                {SECTION_LABELS[s]}
              </option>
            ))}
          </select>
          <button onClick={() => onRemove(i)} title="Supprimer">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

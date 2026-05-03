import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store";
import {
  type Port,
  type PortDirection,
  type Product,
  type SignalType,
} from "../types";

const emptyProduct = (): Product => ({
  id: "",
  reference: "",
  manufacturer: "",
  category: "",
  inputs: [],
  outputs: [],
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

  const setPort = (side: "inputs" | "outputs", idx: number, patch: Partial<Port>) => {
    setDraft((d) => ({
      ...d,
      [side]: d[side].map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }));
  };

  const addPort = (side: "inputs" | "outputs") => {
    setDraft((d) => ({
      ...d,
      [side]: [
        ...d[side],
        {
          id: `${side}-${d[side].length + 1}`,
          label: side === "inputs" ? `IN ${d.inputs.length + 1}` : `OUT ${d.outputs.length + 1}`,
          signal: "HDMI",
          direction: side === "inputs" ? "in" : "out",
        } as Port,
      ],
    }));
  };

  const removePort = (side: "inputs" | "outputs", idx: number) => {
    setDraft((d) => ({ ...d, [side]: d[side].filter((_, i) => i !== idx) }));
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
            title="Entrées"
            ports={draft.inputs}
            onAdd={() => addPort("inputs")}
            onChange={(i, patch) => setPort("inputs", i, patch)}
            onRemove={(i) => removePort("inputs", i)}
            defaultDirection="in"
          />
          <PortsEditor
            title="Sorties"
            ports={draft.outputs}
            onAdd={() => addPort("outputs")}
            onChange={(i, patch) => setPort("outputs", i, patch)}
            onRemove={(i) => removePort("outputs", i)}
            defaultDirection="out"
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

function PortsEditor({
  title,
  ports,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  ports: Port[];
  onAdd: () => void;
  onChange: (i: number, patch: Partial<Port>) => void;
  onRemove: (i: number) => void;
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
          <button onClick={() => onRemove(i)} title="Supprimer">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

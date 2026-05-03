import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store";
import { fileToResizedDataUrl } from "../image";
import { ProductPreview } from "./ProductPreview";
import {
  type Port,
  type PortDirection,
  type Product,
  type RackSize,
  type RackWidth,
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

  const reorderPort = (side: PortListKey, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setDraft((d) => {
      const list = [...getList(d, side)];
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return { ...d, [side]: list };
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

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const remove = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    removeProduct(draft.id);
    onClose();
  };

  const exportProduct = () => {
    const data = JSON.stringify(draft, null, 2);
    const slug = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const filename = `${slug(draft.manufacturer || "produit")}-${slug(
      draft.reference || "fiche",
    )}.json`;
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "fiche-produit.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importProduct = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<Product>;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof parsed.reference !== "string" ||
        !Array.isArray(parsed.inputs) ||
        !Array.isArray(parsed.outputs)
      ) {
        alert("Fichier produit invalide");
        return;
      }
      // Keep the id of the currently-edited product (or the freshly
      // generated one for a new product) so we don't overwrite another
      // catalog entry by accident.
      setDraft({ ...(parsed as Product), id: draft.id });
    } catch {
      alert("Fichier JSON invalide");
    }
  };

  return (
    <div className="modal-backdrop">
      <div
        className="modal modal-with-preview"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{isNew ? "Nouveau produit" : "Éditer le produit"}</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="modal-body modal-body-split">
          <div className="modal-form">
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

          <div className="form-row">
            <label>Code article</label>
            <input
              value={draft.articleCode ?? ""}
              onChange={(e) => setDraft({ ...draft, articleCode: e.target.value })}
              placeholder="ex. 60-1822-12"
            />
          </div>
          <div className="form-row">
            <label>URL produit</label>
            <input
              type="url"
              value={draft.productUrl ?? ""}
              onChange={(e) => setDraft({ ...draft, productUrl: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div className="form-row">
            <label>Hauteur rack (U)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={draft.rackHeightU ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setDraft({
                  ...draft,
                  rackHeightU: v === "" ? undefined : Number(v),
                });
              }}
              placeholder="ex. 1, 2, 3…"
              style={{ width: 120 }}
            />
          </div>
          <div className="form-row">
            <label>Largeur rack</label>
            <select
              value={draft.rackSize ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setDraft({
                  ...draft,
                  rackSize: (v || undefined) as RackSize | undefined,
                  // Reset rackWidth if not 19"
                  rackWidth:
                    v === "19" ? draft.rackWidth ?? "full" : undefined,
                });
              }}
              style={{ width: 110 }}
            >
              <option value="">— aucune —</option>
              <option value="19">19 pouces</option>
              <option value="10">10 pouces</option>
            </select>
            {draft.rackSize === "19" && (
              <select
                value={draft.rackWidth ?? "full"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    rackWidth: e.target.value as RackWidth,
                  })
                }
                style={{ width: 130, marginLeft: 6 }}
              >
                <option value="full">Largeur complète</option>
                <option value="half">1/2 largeur</option>
                <option value="quarter">1/4 largeur</option>
              </select>
            )}
          </div>

          <ImageField
            label="Image de face"
            value={draft.imageFront}
            onChange={(v) => setDraft({ ...draft, imageFront: v })}
          />
          <ImageField
            label="Image de dos"
            value={draft.imageBack}
            onChange={(v) => setDraft({ ...draft, imageBack: v })}
          />

          <PortsEditor
            title="Gauche"
            ports={draft.inputs}
            section="inputs"
            onAdd={() => addPort("inputs")}
            onChange={(i, patch) => setPort("inputs", i, patch)}
            onRemove={(i) => removePort("inputs", i)}
            onMove={(i, to) => movePort("inputs", i, to)}
            onReorder={(from, to) => reorderPort("inputs", from, to)}
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
            onReorder={(from, to) => reorderPort("outputs", from, to)}
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
            onReorder={(from, to) => reorderPort("middle", from, to)}
            defaultDirection="bi"
          />
          </div>
          <aside className="modal-preview">
            <div className="modal-preview-title">Aperçu</div>
            <ProductPreview product={draft} />
            {(draft.imageFront || draft.imageBack) && (
              <div className="modal-preview-images">
                {draft.imageFront && (
                  <div className="modal-preview-image">
                    <div className="modal-preview-image-label">Face</div>
                    <img src={draft.imageFront} alt="Face" />
                  </div>
                )}
                {draft.imageBack && (
                  <div className="modal-preview-image">
                    <div className="modal-preview-image-label">Dos</div>
                    <img src={draft.imageBack} alt="Dos" />
                  </div>
                )}
              </div>
            )}
            {(draft.rackHeightU || draft.rackSize) && (
              <div className="modal-preview-meta muted">
                {draft.rackHeightU ? `${draft.rackHeightU} U` : ""}
                {draft.rackSize ? ` · ${draft.rackSize}"` : ""}
                {draft.rackWidth && draft.rackSize === "19"
                  ? draft.rackWidth === "full"
                    ? " · pleine largeur"
                    : draft.rackWidth === "half"
                      ? " · 1/2 largeur"
                      : " · 1/4 largeur"
                  : ""}
              </div>
            )}
            {draft.articleCode && (
              <div className="modal-preview-meta muted">
                Code : {draft.articleCode}
              </div>
            )}
            {draft.productUrl && (
              <a
                className="modal-preview-meta"
                href={draft.productUrl}
                target="_blank"
                rel="noreferrer"
              >
                Lien produit
              </a>
            )}
          </aside>
        </div>
        <div className="modal-footer">
          {!isNew && (
            <button
              className={"danger" + (confirmingDelete ? " danger-confirm" : "")}
              onClick={remove}
              onBlur={() => setConfirmingDelete(false)}
              title={
                confirmingDelete
                  ? "Cliquer encore pour confirmer la suppression"
                  : "Supprimer ce produit du catalogue"
              }
            >
              {confirmingDelete ? "Confirmer la suppression ?" : "Supprimer"}
            </button>
          )}
          <button onClick={exportProduct}>Exporter</button>
          <label className="button-as-label">
            Importer
            <input
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importProduct(f);
                e.target.value = "";
              }}
            />
          </label>
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
  onReorder,
}: {
  title: string;
  ports: Port[];
  section: PortListKey;
  onAdd: () => void;
  onChange: (i: number, patch: Partial<Port>) => void;
  onRemove: (i: number) => void;
  onMove: (i: number, to: PortListKey) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
  defaultDirection: PortDirection;
}) {
  const signals = useAppStore((s) => s.signals);
  const signalOptions = useMemo(() => Object.values(signals), [signals]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  return (
    <div className="ports-editor">
      <div className="ports-editor-header">
        <h4>{title}</h4>
        <button onClick={onAdd}>+ Ajouter</button>
      </div>
      {ports.length === 0 && <div className="muted">Aucune.</div>}
      {ports.map((p, i) => (
        <div
          key={i}
          className={"port-edit-row" + (dragIdx === i ? " dragging" : "")}
          draggable
          onDragStart={(e) => {
            setDragIdx(i);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIdx !== null && dragIdx !== i) onReorder(dragIdx, i);
            setDragIdx(null);
          }}
          onDragEnd={() => setDragIdx(null)}
        >
          <span className="instance-drag-handle" title="Glisser pour réordonner">
            ≡
          </span>
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

function ImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 800, 0.85);
      onChange(dataUrl);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Échec du chargement");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <div className="form-row form-row-image">
      <label>{label}</label>
      <div className="image-field">
        {value && (
          <div className="image-field-preview">
            <img src={value} alt={label} />
            <button
              className="image-field-remove"
              onClick={() => onChange(undefined)}
              title="Retirer l'image"
            >
              ✕
            </button>
          </div>
        )}
        <input type="file" accept="image/*" onChange={onFile} disabled={busy} />
        {busy && <span className="muted">Chargement…</span>}
        {err && <span className="muted danger-text">{err}</span>}
      </div>
    </div>
  );
}

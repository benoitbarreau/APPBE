import { useEffect, useMemo, useState } from "react";
import { useAppStore, useCatalogMeta } from "../store";
import { useAuth } from "../auth/useAuth";
import { fileToResizedDataUrl } from "../image";
import { ProductPreview } from "./ProductPreview";
import {
  upsertUserProduct,
  deleteUserProduct,
  archiveUserProduct,
  type UserProductMeta,
} from "../lib/userProductsApi";
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
  onSwitchTo,
}: {
  productId: string | "new" | null;
  onClose: () => void;
  onSwitchTo?: (id: string) => void;
}) {
  const products = useAppStore((s) => s.products);
  const productMeta = useAppStore((s) => s.productMeta);
  const addProduct = useAppStore((s) => s.addProduct);
  const updateProduct = useAppStore((s) => s.updateProduct);
  const removeProduct = useAppStore((s) => s.removeProduct);
  const archiveProductLocal = useAppStore((s) => s.archiveProductLocal);
  const setProductMeta = useAppStore((s) => s.setProductMeta);
  const catalogBrands = useCatalogMeta((s) => s.catalogBrands);
  const catalogCategories = useCatalogMeta((s) => s.catalogCategories);

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

  /** Duplique un port en incrémentant le numéro en fin de label.
   *  Exemples : "IN 1" -> "IN 2", "Audio 5" -> "Audio 6", "ABC" -> "ABC 2".
   *  Cherche le prochain numéro libre dans la section pour éviter les
   *  doublons immédiats. Le nouveau port est inséré juste après l'original. */
  const duplicatePort = (side: PortListKey, idx: number) => {
    setDraft((d) => {
      const list = getList(d, side);
      const port = list[idx];
      if (!port) return d;
      const existing = new Set(list.map((p) => p.label));
      const m = port.label.match(/^(.*?)(\d+)\s*$/);
      let prefix: string;
      let n: number;
      if (m) {
        prefix = m[1];
        n = parseInt(m[2], 10);
      } else {
        // Pas de numéro à incrémenter → on en ajoute un (séparé par un espace)
        prefix = port.label.endsWith(" ") || port.label === "" ? port.label : port.label + " ";
        n = 1;
      }
      let candidate: string;
      do {
        n++;
        candidate = `${prefix}${n}`;
      } while (existing.has(candidate));
      const newPort: Port = {
        ...port,
        id: `${side}-dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: candidate,
      };
      const next = [...list];
      next.splice(idx + 1, 0, newPort);
      return { ...d, [side]: next };
    });
  };

  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const meta: UserProductMeta | undefined = productMeta[draft.id];
  const isApproved = meta?.status === "approved";
  const isOwn = meta?.creatorId === profile?.id;
  /** Peut-on éditer cette fiche ?
   *  - Création : oui toujours
   *  - Admin : oui sur toutes les fiches cloud
   *  - Utilisateur : oui uniquement sur ses propres fiches `pending` */
  const canEdit = isNew || isAdmin || (isOwn && !isApproved);
  /** Peut-on supprimer / archiver cette fiche ?
   *  - Admin : oui (archive si approved, suppression si pending)
   *  - Utilisateur : oui sur ses propres fiches pending uniquement */
  const canDelete = !isNew && (isAdmin || (isOwn && !isApproved));

  const save = () => {
    if (!draft.reference.trim() || !draft.manufacturer.trim()) {
      alert("Référence et marque obligatoires");
      return;
    }
    const initialStatus = isAdmin ? "approved" : "pending";
    if (isNew) {
      addProduct(draft);
      // Attache immédiatement la meta locale pour que la fiche apparaisse
      // dans la bonne section (Mon catalogue / Catalogue commun) sans attendre
      // un re-fetch cloud.
      if (profile?.id) {
        setProductMeta(draft.id, {
          productId: draft.id,
          status: initialStatus,
          creatorId: profile.id,
          creatorName: profile.full_name?.trim() || profile.email,
        });
      }
    } else {
      updateProduct(draft.id, draft);
    }
    // Synchronisation cloud — à la création, statut selon le rôle :
    //   admin → approved (directement dans le catalogue commun)
    //   user  → pending (validation requise par un admin)
    upsertUserProduct(draft, { initialStatus }).catch(() => { /* échec silencieux */ });
    onClose();
  };

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const startDelete = () => setConfirmingDelete(true);
  const cancelDelete = () => setConfirmingDelete(false);
  const confirmDelete = () => {
    // Suppression d'une fiche `approved` par un admin → archivage (réversible).
    // Suppression d'une fiche `pending` (utilisateur ou admin) → suppression définitive.
    if (isAdmin && isApproved) {
      archiveProductLocal(draft.id);
      archiveUserProduct(draft.id).catch(() => { /* échec silencieux */ });
    } else {
      removeProduct(draft.id);
      deleteUserProduct(draft.id).catch(() => { /* échec silencieux */ });
    }
    onClose();
  };

  const duplicate = () => {
    const newId = `dup-${Date.now()}`;
    const refTrim = draft.reference.trim();
    const newRef = refTrim ? `${refTrim} Copie` : "Copie";
    const copy: Product = { ...draft, id: newId, reference: newRef };
    const initialStatus = isAdmin ? "approved" : "pending";
    addProduct(copy);
    if (profile?.id) {
      setProductMeta(newId, {
        productId: newId,
        status: initialStatus,
        creatorId: profile.id,
        creatorName: profile.full_name?.trim() || profile.email,
      });
    }
    upsertUserProduct(copy, { initialStatus }).catch(() => { /* échec silencieux */ });
    if (onSwitchTo) onSwitchTo(newId);
    else onClose();
  };

  return (
    <div className="modal-backdrop">
      <div
        className="modal modal-with-preview"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>
            {isNew
              ? "Nouveau produit"
              : canEdit
                ? "Éditer le produit"
                : "Détails du produit"}
            {!isNew && meta?.status === "pending" && (
              <span className="product-editor-pending-badge" title="En attente de validation">
                ● En attente
              </span>
            )}
            {!isNew && !canEdit && (
              <span className="product-editor-readonly-hint">
                (lecture seule — catalogue commun)
              </span>
            )}
          </h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="modal-body modal-body-split">
          <div className="modal-form">
          {/* Datalists pour l'autocomplete marque/catégorie */}
          <datalist id="pe-brands-list">
            {catalogBrands.map(b => <option key={b.id} value={b.name} />)}
          </datalist>
          <datalist id="pe-categories-list">
            {catalogCategories.map(c => <option key={c.id} value={c.name} />)}
          </datalist>

          <div className="form-row">
            <label>Marque</label>
            <input
              list="pe-brands-list"
              value={draft.manufacturer}
              onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })}
              placeholder={catalogBrands.length ? "Saisir ou choisir…" : "Ex. Kramer"}
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
              list="pe-categories-list"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              placeholder={catalogCategories.length ? "Saisir ou choisir…" : "Écran, matrice, caméra…"}
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
            onDuplicate={(i) => duplicatePort("inputs", i)}
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
            onDuplicate={(i) => duplicatePort("outputs", i)}
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
            onDuplicate={(i) => duplicatePort("middle", i)}
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
          {canDelete && !confirmingDelete && (
            <button
              className="danger"
              onClick={startDelete}
              title={isApproved
                ? "Archiver ce produit (admin pourra le restaurer)"
                : "Supprimer définitivement ce produit"}
            >
              {isApproved ? "Archiver" : "Supprimer"}
            </button>
          )}
          {canDelete && confirmingDelete && (
            <div className="delete-confirm-group">
              <span className="muted" style={{ fontSize: 11 }}>
                {isApproved ? "Archiver cette fiche ?" : "Confirmer la suppression ?"}
              </span>
              <button onClick={cancelDelete}>Annuler</button>
              <button className="danger danger-confirm" onClick={confirmDelete}>
                {isApproved ? "Archiver" : "Supprimer"}
              </button>
            </div>
          )}
          {!isNew && (
            <button onClick={duplicate} title="Créer une copie de cette fiche">
              Dupliquer
            </button>
          )}
          <button onClick={onClose}>{canEdit ? "Annuler" : "Fermer"}</button>
          {canEdit && (
            <button className="primary" onClick={save}>
              Enregistrer
            </button>
          )}
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
  onDuplicate,
  onMove,
  onReorder,
}: {
  title: string;
  ports: Port[];
  section: PortListKey;
  onAdd: () => void;
  onChange: (i: number, patch: Partial<Port>) => void;
  onRemove: (i: number) => void;
  onDuplicate: (i: number) => void;
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
          <button
            onClick={() => onDuplicate(i)}
            title="Dupliquer ce port (incrémente le numéro)"
            className="port-dup-btn"
          >
            ⎘
          </button>
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

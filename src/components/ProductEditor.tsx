import { useEffect, useState } from "react";
import { useAppStore, useCatalogMeta } from "../store";
import { useAuth } from "../auth/useAuth";
import {
  upsertUserProduct,
  deleteUserProduct,
  archiveUserProduct,
  type UserProductMeta,
} from "../lib/userProductsApi";
import {
  type Port,
  type Product,
  type RackSize,
  type RackWidth,
} from "../types";
import { usePortOperations } from "./product-editor/usePortOperations";
import { PortsEditor } from "./product-editor/PortsEditor";
import { SpeakerPortEditor } from "./product-editor/SpeakerPortEditor";
import { PdfField } from "./product-editor/PdfField";
import { ImageField } from "./product-editor/ImageField";
import { ProductPreviewPanel } from "./product-editor/ProductPreviewPanel";

const SPEAKER_CATEGORIES = new Set(["Enceintes", "Caisson de basse"]);

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

  // ── Opérations sur les ports (extraites dans ./product-editor) ───────────
  const {
    setPort,
    addPort,
    addSpacer,
    addSeparator,
    removePort,
    movePort,
    reorderPort,
    duplicatePort,
  } = usePortOperations(setDraft);

  // ── Poids : bascule d'unité (stocké toujours en kg) ─────────────────────
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");
  const KG_TO_LBS = 2.20462;

  const weightDisplay =
    draft.weightKg == null
      ? ""
      : weightUnit === "kg"
        ? String(Math.round(draft.weightKg * 100) / 100)
        : String(Math.round(draft.weightKg * KG_TO_LBS * 100) / 100);

  const onWeightChange = (v: string) => {
    const n = parseFloat(v);
    if (isNaN(n) || v === "") { setDraft({ ...draft, weightKg: undefined }); return; }
    const kg = weightUnit === "kg" ? n : n / KG_TO_LBS;
    setDraft({ ...draft, weightKg: Math.round(kg * 1000) / 1000 });
  };

  const toggleWeightUnit = () =>
    setWeightUnit((u) => (u === "kg" ? "lbs" : "kg"));

  // ── Calcul BTU/h depuis la puissance de fonctionnement ──────────────────
  const calcBtu = () => {
    if (!draft.powerOperatingW) return;
    setDraft({ ...draft, thermalBtuH: Math.round(draft.powerOperatingW * 3.41214) });
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
    // La modale se ferme tout de suite ; en cas d'échec cloud, on prévient
    // l'utilisateur (sinon la fiche disparaîtrait à la prochaine connexion).
    upsertUserProduct(draft, { initialStatus }).catch((e) => {
      console.error("Échec sauvegarde cloud fiche produit :", e);
      alert(`⚠ La fiche « ${draft.reference} » n'a pas pu être sauvegardée dans le cloud.\nElle reste visible localement mais disparaîtra à la prochaine connexion.\nRouvrez-la et enregistrez à nouveau.`);
    });
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
      archiveUserProduct(draft.id).catch((e) => {
        console.error("Échec archivage cloud :", e);
        alert(`⚠ L'archivage de « ${draft.reference} » n'a pas pu être enregistré dans le cloud.\nLa fiche réapparaîtra à la prochaine connexion — réessayez.`);
      });
    } else {
      removeProduct(draft.id);
      deleteUserProduct(draft.id).catch((e) => {
        console.error("Échec suppression cloud :", e);
        alert(`⚠ La suppression de « ${draft.reference} » n'a pas pu être enregistrée dans le cloud.\nLa fiche réapparaîtra à la prochaine connexion — réessayez.`);
      });
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
    upsertUserProduct(copy, { initialStatus }).catch((e) => {
      console.error("Échec sauvegarde cloud copie :", e);
      alert(`⚠ La copie « ${newRef} » n'a pas pu être sauvegardée dans le cloud.\nElle disparaîtra à la prochaine connexion — rouvrez-la et enregistrez à nouveau.`);
    });
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

          <div className="pe-section-title">Identification</div>
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

          <div className="pe-section-title">Références commerciales</div>
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

          <div className="pe-section-title">Rack</div>
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

          <div className="pe-section-title">Caractéristiques techniques</div>

          {/* Dimensions L × P × H */}
          <div className="form-row">
            <label>Dimensions (cm)</label>
            <div className="pe-inline-group">
              <div className="pe-measure-field">
                <span className="pe-measure-label">L</span>
                <input
                  type="number" min={0} step={0.1}
                  value={draft.widthCm ?? ""}
                  onChange={e => setDraft({ ...draft, widthCm: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="—"
                  className="pe-measure-input"
                />
              </div>
              <span className="pe-measure-sep">×</span>
              <div className="pe-measure-field">
                <span className="pe-measure-label">P</span>
                <input
                  type="number" min={0} step={0.1}
                  value={draft.depthCm ?? ""}
                  onChange={e => setDraft({ ...draft, depthCm: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="—"
                  className="pe-measure-input"
                />
              </div>
              <span className="pe-measure-sep">×</span>
              <div className="pe-measure-field">
                <span className="pe-measure-label">H</span>
                <input
                  type="number" min={0} step={0.1}
                  value={draft.heightCm ?? ""}
                  onChange={e => setDraft({ ...draft, heightCm: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="—"
                  className="pe-measure-input"
                />
              </div>
              <span className="pe-unit-hint">cm</span>
            </div>
          </div>

          {/* Poids avec bascule kg ↔ lbs */}
          <div className="form-row">
            <label>Poids</label>
            <input
              type="number" min={0} step={0.01}
              value={weightDisplay}
              onChange={e => onWeightChange(e.target.value)}
              placeholder="—"
              style={{ width: 90, flex: "none" }}
            />
            <button
              type="button"
              className="pe-unit-toggle"
              onClick={toggleWeightUnit}
              title={weightUnit === "kg" ? "Basculer en livres" : "Basculer en kilogrammes"}
            >
              {weightUnit}
            </button>
            {draft.weightKg != null && weightUnit === "lbs" && (
              <span className="pe-unit-hint">= {(draft.weightKg).toFixed(2)} kg</span>
            )}
            {draft.weightKg != null && weightUnit === "kg" && (
              <span className="pe-unit-hint">= {(draft.weightKg * KG_TO_LBS).toFixed(2)} lbs</span>
            )}
          </div>

          <div className="pe-section-title">Alimentation</div>

          {/* Consommation électrique */}
          <div className="form-row">
            <label>Consommation</label>
            <div className="pe-inline-group">
              <div className="pe-measure-field">
                <span className="pe-measure-label">Veille</span>
                <input
                  type="number" min={0} step={1}
                  value={draft.powerStandbyW ?? ""}
                  onChange={e => setDraft({ ...draft, powerStandbyW: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="—"
                  className="pe-measure-input"
                />
              </div>
              <div className="pe-measure-field">
                <span className="pe-measure-label">Fonct.</span>
                <input
                  type="number" min={0} step={1}
                  value={draft.powerOperatingW ?? ""}
                  onChange={e => setDraft({ ...draft, powerOperatingW: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="—"
                  className="pe-measure-input"
                />
              </div>
              <span className="pe-unit-hint">W</span>
            </div>
          </div>

          {/* Dissipation thermique */}
          <div className="form-row">
            <label>Dissipation</label>
            <input
              type="number" min={0} step={1}
              value={draft.thermalBtuH ?? ""}
              onChange={e => setDraft({ ...draft, thermalBtuH: e.target.value === "" ? undefined : Number(e.target.value) })}
              placeholder="—"
              style={{ width: 90, flex: "none" }}
            />
            <span className="pe-unit-hint">BTU/h</span>
            {draft.powerOperatingW != null && draft.powerOperatingW > 0 && (
              <button
                type="button"
                className="pe-calc-btn"
                onClick={calcBtu}
                title={`Calculer depuis ${draft.powerOperatingW} W de fonctionnement`}
              >
                ↻ Calculer depuis {draft.powerOperatingW} W
              </button>
            )}
          </div>

          <div className="pe-section-title">Visuels</div>
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
          <PdfField
            productId={draft.id}
            values={draft.datasheetUrls ?? []}
            onChange={(v) => setDraft({ ...draft, datasheetUrls: v })}
          />

          <div className="pe-section-title">Connectique</div>
          {SPEAKER_CATEGORIES.has(draft.category) ? (
            <SpeakerPortEditor
              port={draft.inputs[0] ?? null}
              onSet={(port) =>
                setDraft((d) => ({ ...d, inputs: [port], outputs: [], middle: [] }))
              }
              onRemove={() =>
                setDraft((d) => ({ ...d, inputs: [], outputs: [], middle: [] }))
              }
              onChange={(patch) =>
                setDraft((d) => ({
                  ...d,
                  inputs: [{ ...(d.inputs[0] ?? {}), ...patch } as Port],
                  outputs: [],
                  middle: [],
                }))
              }
            />
          ) : (
            <>
              <PortsEditor
                title="Gauche"
                ports={draft.inputs}
                section="inputs"
                onAdd={() => addPort("inputs")}
                onAddSpacer={() => addSpacer("inputs")}
                onAddSeparator={() => addSeparator("inputs")}
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
                onAddSpacer={() => addSpacer("outputs")}
                onAddSeparator={() => addSeparator("outputs")}
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
                onAddSpacer={() => addSpacer("middle")}
                onAddSeparator={() => addSeparator("middle")}
                onChange={(i, patch) => setPort("middle", i, patch)}
                onRemove={(i) => removePort("middle", i)}
                onDuplicate={(i) => duplicatePort("middle", i)}
                onMove={(i, to) => movePort("middle", i, to)}
                onReorder={(from, to) => reorderPort("middle", from, to)}
                defaultDirection="bi"
              />
            </>
          )}
          </div>
          <ProductPreviewPanel product={draft} />
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

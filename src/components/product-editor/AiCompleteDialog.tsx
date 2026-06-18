import { useState } from "react";
import type { Product } from "../../types";
import type { ProductAiSpecs } from "../../lib/aiCompleteApi";
import type { AiSelection } from "../../lib/applyAiSpecs";

// ── Fenêtre de revue des caractéristiques proposées par l'IA ─────────────────
// L'utilisateur COCHE ce qu'il veut appliquer. Par défaut, les champs déjà
// remplis dans la fiche sont décochés (protégés) et signalés « déjà rempli ».

const DIR_LABEL: Record<string, string> = { in: "entrée", out: "sortie", bi: "bidir." };

// Clés de sélection gérées par cases à cocher
type SelKey = keyof AiSelection;

export function AiCompleteDialog({
  specs,
  product,
  onApply,
  onCancel,
}: {
  specs: ProductAiSpecs;
  product: Product;
  onApply: (selection: AiSelection) => void;
  onCancel: () => void;
}) {
  const inputs = specs.inputs ?? [];
  const outputs = specs.outputs ?? [];

  // ── Quels groupes l'IA a-t-elle proposés ? ──────────────────────────────
  const present: Record<SelKey, boolean> = {
    inputs: inputs.length > 0,
    outputs: outputs.length > 0,
    rack: specs.rackHeightU != null || specs.rackSize != null,
    powerOperatingW: specs.powerOperatingW != null,
    powerStandbyW: specs.powerStandbyW != null,
    thermalBtuH: specs.thermalBtuH != null,
    dimensions: specs.widthCm != null || specs.depthCm != null || specs.heightCm != null,
    weightKg: specs.weightKg != null,
  };

  // ── Le champ correspondant est-il déjà rempli dans la fiche ? ────────────
  const filled: Record<SelKey, boolean> = {
    inputs: product.inputs.length > 0,
    outputs: product.outputs.length > 0,
    rack: product.rackHeightU != null || product.rackSize != null,
    powerOperatingW: product.powerOperatingW != null,
    powerStandbyW: product.powerStandbyW != null,
    thermalBtuH: product.thermalBtuH != null,
    dimensions: product.widthCm != null || product.depthCm != null || product.heightCm != null,
    weightKg: product.weightKg != null,
  };

  // ── État initial des cases : coché si proposé ET pas déjà rempli ─────────
  const [sel, setSel] = useState<AiSelection>(() => ({
    inputs: present.inputs && !filled.inputs,
    outputs: present.outputs && !filled.outputs,
    rack: present.rack && !filled.rack,
    powerOperatingW: present.powerOperatingW && !filled.powerOperatingW,
    powerStandbyW: present.powerStandbyW && !filled.powerStandbyW,
    thermalBtuH: present.thermalBtuH && !filled.thermalBtuH,
    dimensions: present.dimensions && !filled.dimensions,
    weightKg: present.weightKg && !filled.weightKg,
  }));

  const toggle = (k: SelKey) => setSel((s) => ({ ...s, [k]: !s[k] }));

  // Lignes « caractéristiques » à afficher (uniquement celles proposées)
  const charRows: { key: SelKey; label: string; value: string }[] = [];
  if (present.rack)
    charRows.push({
      key: "rack",
      label: "Format rack",
      value: `${specs.rackHeightU != null ? `${specs.rackHeightU} U` : ""}${specs.rackSize ? `${specs.rackHeightU != null ? " · " : ""}${specs.rackSize}"` : ""}`,
    });
  if (present.powerOperatingW)
    charRows.push({ key: "powerOperatingW", label: "Conso. en marche", value: `${specs.powerOperatingW} W` });
  if (present.powerStandbyW)
    charRows.push({ key: "powerStandbyW", label: "Conso. en veille", value: `${specs.powerStandbyW} W` });
  if (present.thermalBtuH)
    charRows.push({ key: "thermalBtuH", label: "Dissipation", value: `${specs.thermalBtuH} BTU/h` });
  if (present.dimensions) {
    const dims = [
      specs.widthCm != null ? `L ${specs.widthCm}` : null,
      specs.depthCm != null ? `P ${specs.depthCm}` : null,
      specs.heightCm != null ? `H ${specs.heightCm}` : null,
    ].filter(Boolean);
    charRows.push({ key: "dimensions", label: "Dimensions (cm)", value: dims.join(" × ") });
  }
  if (present.weightKg)
    charRows.push({ key: "weightKg", label: "Poids", value: `${specs.weightKg} kg` });

  const hasPorts = present.inputs || present.outputs;
  const hasAnything = hasPorts || charRows.length > 0;
  const selectedCount = (Object.keys(sel) as SelKey[]).filter((k) => present[k] && sel[k]).length;

  const allOn = () => setSel(() => buildAll(present, true));
  const allOff = () => setSel(() => buildAll(present, false));

  // Badge « déjà rempli » réutilisable
  const filledBadge = (k: SelKey) =>
    filled[k] ? <span className="ai-specs-filled-badge">déjà rempli</span> : null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="ai-specs-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="ai-specs-header">
          <h3>✨ Proposition de l'IA</h3>
          <button className="ai-specs-close" onClick={onCancel} aria-label="Fermer">✕</button>
        </div>

        <div className="ai-specs-body">
          {!hasAnything && (
            <p className="ai-specs-empty">
              L'IA n'a trouvé aucune caractéristique exploitable dans ce PDF.
            </p>
          )}

          {hasAnything && (
            <div className="ai-specs-selectbar">
              <span>Coche ce que tu veux appliquer :</span>
              <span className="ai-specs-selectlinks">
                <button type="button" onClick={allOn}>Tout cocher</button>
                <span>·</span>
                <button type="button" onClick={allOff}>Tout décocher</button>
              </span>
            </div>
          )}

          {hasPorts && (
            <div className="ai-specs-section">
              <div className="ai-specs-section-title">Connectique proposée</div>

              {present.inputs && (
                <div className="ai-specs-ports">
                  <label className="ai-specs-check">
                    <input type="checkbox" checked={sel.inputs} onChange={() => toggle("inputs")} />
                    <span className="ai-specs-ports-label">Entrées ({inputs.length})</span>
                    {filledBadge("inputs")}
                  </label>
                  {filled.inputs && sel.inputs && (
                    <p className="ai-specs-replace-warn">⚠ Les entrées actuelles seront remplacées.</p>
                  )}
                  <ul>
                    {inputs.map((p, i) => (
                      <li key={`in-${i}`}>
                        <strong>{p.label}</strong> — {p.signal}{" "}
                        <span className="ai-specs-dir">({DIR_LABEL[p.direction] ?? p.direction})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {present.outputs && (
                <div className="ai-specs-ports">
                  <label className="ai-specs-check">
                    <input type="checkbox" checked={sel.outputs} onChange={() => toggle("outputs")} />
                    <span className="ai-specs-ports-label">Sorties ({outputs.length})</span>
                    {filledBadge("outputs")}
                  </label>
                  {filled.outputs && sel.outputs && (
                    <p className="ai-specs-replace-warn">⚠ Les sorties actuelles seront remplacées.</p>
                  )}
                  <ul>
                    {outputs.map((p, i) => (
                      <li key={`out-${i}`}>
                        <strong>{p.label}</strong> — {p.signal}{" "}
                        <span className="ai-specs-dir">({DIR_LABEL[p.direction] ?? p.direction})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {charRows.length > 0 && (
            <div className="ai-specs-section">
              <div className="ai-specs-section-title">Caractéristiques</div>
              <table className="ai-specs-table">
                <tbody>
                  {charRows.map((r) => (
                    <tr key={r.key} className={!sel[r.key] ? "ai-specs-row-off" : ""}>
                      <td className="ai-specs-check-cell">
                        <label className="ai-specs-check">
                          <input type="checkbox" checked={sel[r.key]} onChange={() => toggle(r.key)} />
                          <span>{r.label}</span>
                          {filledBadge(r.key)}
                        </label>
                      </td>
                      <td className="ai-specs-val">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {specs.notes && specs.notes.trim() && (
            <div className="ai-specs-notes">
              <strong>Note de l'IA :</strong> {specs.notes}
            </div>
          )}

          <p className="ai-specs-disclaimer">
            Les champs <strong>déjà remplis</strong> sont décochés par défaut pour ne pas les écraser.
            Vérifie toujours ces valeurs : l'IA peut se tromper. Après « Appliquer », tu pourras
            corriger chaque champ avant d'enregistrer.
          </p>
        </div>

        <div className="ai-specs-footer">
          <button className="ai-specs-cancel" onClick={onCancel}>Annuler</button>
          <button className="ai-specs-apply" onClick={() => onApply(sel)} disabled={selectedCount === 0}>
            Appliquer {selectedCount > 0 ? `(${selectedCount})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// Construit une sélection « tout coché » ou « tout décoché », limitée aux champs proposés.
function buildAll(present: Record<SelKey, boolean>, value: boolean): AiSelection {
  const keys: SelKey[] = [
    "inputs", "outputs", "rack", "powerOperatingW",
    "powerStandbyW", "thermalBtuH", "dimensions", "weightKg",
  ];
  const out = {} as AiSelection;
  keys.forEach((k) => { out[k] = value && present[k]; });
  return out;
}

import type { ProductAiSpecs } from "../../lib/aiCompleteApi";

// ── Fenêtre de revue des caractéristiques proposées par l'IA ─────────────────
// L'IA ne fait que PROPOSER : rien n'est écrit dans la fiche tant que
// l'utilisateur n'a pas cliqué sur « Appliquer ».

const DIR_LABEL: Record<string, string> = { in: "entrée", out: "sortie", bi: "bidir." };

export function AiCompleteDialog({
  specs,
  onApply,
  onCancel,
}: {
  specs: ProductAiSpecs;
  onApply: () => void;
  onCancel: () => void;
}) {
  // Lignes « caractéristiques » à afficher (uniquement celles trouvées)
  const charRows: { label: string; value: string }[] = [];
  if (specs.rackHeightU != null)
    charRows.push({
      label: "Format rack",
      value: `${specs.rackHeightU} U${specs.rackSize ? ` · ${specs.rackSize}"` : ""}`,
    });
  if (specs.powerOperatingW != null)
    charRows.push({ label: "Conso. en marche", value: `${specs.powerOperatingW} W` });
  if (specs.powerStandbyW != null)
    charRows.push({ label: "Conso. en veille", value: `${specs.powerStandbyW} W` });
  if (specs.thermalBtuH != null)
    charRows.push({ label: "Dissipation", value: `${specs.thermalBtuH} BTU/h` });
  const dims = [
    specs.widthCm != null ? `L ${specs.widthCm}` : null,
    specs.depthCm != null ? `P ${specs.depthCm}` : null,
    specs.heightCm != null ? `H ${specs.heightCm}` : null,
  ].filter(Boolean);
  if (dims.length) charRows.push({ label: "Dimensions (cm)", value: dims.join(" × ") });
  if (specs.weightKg != null)
    charRows.push({ label: "Poids", value: `${specs.weightKg} kg` });

  const inputs = specs.inputs ?? [];
  const outputs = specs.outputs ?? [];
  const hasPorts = inputs.length > 0 || outputs.length > 0;
  const hasAnything = hasPorts || charRows.length > 0;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="ai-specs-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="ai-specs-header">
          <h3>✨ Proposition de l'IA</h3>
          <button className="ai-specs-close" onClick={onCancel} aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="ai-specs-body">
          {!hasAnything && (
            <p className="ai-specs-empty">
              L'IA n'a trouvé aucune caractéristique exploitable dans ce PDF.
            </p>
          )}

          {hasPorts && (
            <div className="ai-specs-section">
              <div className="ai-specs-section-title">Connectique proposée</div>
              <p className="ai-specs-replace-warn">
                ⚠ Les connecteurs actuels de la fiche seront remplacés par cette liste.
              </p>
              {inputs.length > 0 && (
                <div className="ai-specs-ports">
                  <span className="ai-specs-ports-label">Entrées ({inputs.length})</span>
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
              {outputs.length > 0 && (
                <div className="ai-specs-ports">
                  <span className="ai-specs-ports-label">Sorties ({outputs.length})</span>
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
                    <tr key={r.label}>
                      <td className="ai-specs-key">{r.label}</td>
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
            Vérifie toujours ces valeurs : l'IA peut se tromper. Après « Appliquer »,
            tu pourras corriger chaque champ avant d'enregistrer.
          </p>
        </div>

        <div className="ai-specs-footer">
          <button className="ai-specs-cancel" onClick={onCancel}>
            Annuler
          </button>
          <button className="ai-specs-apply" onClick={onApply} disabled={!hasAnything}>
            Appliquer à la fiche
          </button>
        </div>
      </div>
    </div>
  );
}

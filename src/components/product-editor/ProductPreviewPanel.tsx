import { type Product } from "../../types";
import { ProductPreview } from "../ProductPreview";
import { openImageTab } from "./openImageTab";
import { pdfFileName } from "../../lib/pdfFileName";

const KG_TO_LBS = 2.20462;

/** Colonne d'aperçu (à droite) de l'éditeur de produit.
 *  Reçoit le brouillon courant via `product` ; affichage en lecture seule. */
export function ProductPreviewPanel({ product: draft }: { product: Product }) {
  return (
    <aside className="modal-preview">
      <div className="modal-preview-title">Aperçu</div>
      <ProductPreview product={draft} />

      {/* Métadonnées rack */}
      {(draft.rackHeightU || draft.rackSize) && (
        <div className="modal-preview-badge-row">
          {draft.rackHeightU && (
            <span className="modal-preview-badge">
              {draft.rackHeightU} U
            </span>
          )}
          {draft.rackSize && (
            <span className="modal-preview-badge">
              {draft.rackSize}"
              {draft.rackWidth && draft.rackSize === "19"
                ? draft.rackWidth === "full" ? " – pleine" : draft.rackWidth === "half" ? " – 1/2" : " – 1/4"
                : ""}
            </span>
          )}
        </div>
      )}

      {/* Code article + lien */}
      {(draft.articleCode || draft.productUrl) && (
        <div className="modal-preview-links">
          {draft.articleCode && (
            <span className="modal-preview-code">#{draft.articleCode}</span>
          )}
          {draft.productUrl && (
            <a
              className="modal-preview-url-btn"
              href={draft.productUrl}
              target="_blank"
              rel="noreferrer"
              title={draft.productUrl}
            >
              ↗ Fiche fabricant
            </a>
          )}
        </div>
      )}

      {/* Fiches techniques PDF */}
      {(draft.datasheetUrls?.length ?? 0) > 0 && (
        <div className="modal-preview-links" style={{ marginTop: 4, flexDirection: 'column', gap: 3 }}>
          {draft.datasheetUrls!.map((url, i) => (
            <a
              key={i}
              className="modal-preview-url-btn"
              href={url}
              target="_blank"
              rel="noreferrer"
              title={pdfFileName(url)}
            >
              📄 {pdfFileName(url)}
            </a>
          ))}
        </div>
      )}

      {/* Caractéristiques techniques */}
      {(draft.widthCm || draft.depthCm || draft.heightCm ||
        draft.weightKg || draft.powerStandbyW || draft.powerOperatingW || draft.thermalBtuH) && (
        <div className="modal-preview-specs">
          {(draft.widthCm || draft.depthCm || draft.heightCm) && (
            <div className="modal-preview-spec-row">
              <span className="modal-preview-spec-icon">📐</span>
              <span>
                {[draft.widthCm, draft.depthCm, draft.heightCm]
                  .map(v => v != null ? `${v}` : "—").join(" × ")} cm
              </span>
            </div>
          )}
          {draft.weightKg != null && (
            <div className="modal-preview-spec-row">
              <span className="modal-preview-spec-icon">⚖️</span>
              <span>{draft.weightKg} kg</span>
              <span className="modal-preview-spec-alt">
                {(draft.weightKg * KG_TO_LBS).toFixed(2)} lbs
              </span>
            </div>
          )}
          {(draft.powerStandbyW != null || draft.powerOperatingW != null) && (
            <div className="modal-preview-spec-row">
              <span className="modal-preview-spec-icon">⚡</span>
              <span>
                {draft.powerOperatingW != null ? `${draft.powerOperatingW} W` : "—"}
                {draft.powerStandbyW != null && (
                  <span className="modal-preview-spec-alt"> / veille {draft.powerStandbyW} W</span>
                )}
              </span>
            </div>
          )}
          {draft.thermalBtuH != null && (
            <div className="modal-preview-spec-row">
              <span className="modal-preview-spec-icon">🌡️</span>
              <span>{draft.thermalBtuH.toLocaleString("fr-FR")} BTU/h</span>
            </div>
          )}
        </div>
      )}

      {/* Images produit cliquables */}
      {(draft.imageFront || draft.imageBack) && (
        <div className="modal-preview-images">
          {draft.imageFront && (
            <div
              className="modal-preview-image modal-preview-image--clickable"
              onClick={() => openImageTab(draft.imageFront!)}
              title="Cliquer pour agrandir"
            >
              <div className="modal-preview-image-label">Face</div>
              <img src={draft.imageFront} alt="Face" />
              <span className="modal-preview-image-zoom">⤢</span>
            </div>
          )}
          {draft.imageBack && (
            <div
              className="modal-preview-image modal-preview-image--clickable"
              onClick={() => openImageTab(draft.imageBack!)}
              title="Cliquer pour agrandir"
            >
              <div className="modal-preview-image-label">Dos</div>
              <img src={draft.imageBack} alt="Dos" />
              <span className="modal-preview-image-zoom">⤢</span>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

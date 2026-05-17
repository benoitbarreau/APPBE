import { useRef, useState } from "react";
import type { ImageNodeData } from "../types";

interface ImageImportModalProps {
  onClose: () => void;
  onInsert: (src: string, srcType: ImageNodeData["srcType"], layer: ImageNodeData["layer"]) => void;
}

export function ImageImportModal({ onClose, onInsert }: ImageImportModalProps) {
  const [tab, setTab] = useState<"file" | "url">("file");
  const [previewSrc, setPreviewSrc] = useState<string>("");
  const [srcType, setSrcType] = useState<ImageNodeData["srcType"]>("base64");
  const [urlInput, setUrlInput] = useState("");
  const [layer, setLayer] = useState<ImageNodeData["layer"]>("background");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ACCEPTED = "image/svg+xml,image/png,image/jpeg,image/gif,image/webp";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setPreviewSrc(result);
      setSrcType("base64");
      setLoading(false);
    };
    reader.onerror = () => {
      setError("Impossible de lire le fichier.");
      setLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleUrlConfirm = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    setError(null);
    setPreviewSrc(trimmed);
    setSrcType("url");
  };

  const handleInsert = () => {
    if (!previewSrc) return;
    onInsert(previewSrc, srcType, layer);
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box image-import-modal" style={{ width: 480, maxWidth: "95vw" }}>
        {/* En-tête */}
        <div className="modal-header">
          <span className="modal-title">🖼 Importer une image</span>
          <button className="modal-close-btn" onClick={onClose} title="Fermer">✕</button>
        </div>

        {/* Onglets Fichier / URL */}
        <div className="image-import-tabs">
          <button
            className={`image-import-tab${tab === "file" ? " active" : ""}`}
            onClick={() => { setTab("file"); setPreviewSrc(""); setError(null); }}
          >
            📂 Fichier
          </button>
          <button
            className={`image-import-tab${tab === "url" ? " active" : ""}`}
            onClick={() => { setTab("url"); setPreviewSrc(""); setError(null); }}
          >
            🔗 URL
          </button>
        </div>

        <div className="image-import-body">
          {/* Zone de sélection */}
          {tab === "file" ? (
            <div
              className="image-drop-zone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (!file) return;
                // Simuler le FileReader
                setError(null);
                setLoading(true);
                const reader = new FileReader();
                reader.onload = (ev) => {
                  setPreviewSrc(ev.target?.result as string);
                  setSrcType("base64");
                  setLoading(false);
                };
                reader.onerror = () => { setError("Impossible de lire le fichier."); setLoading(false); };
                reader.readAsDataURL(file);
              }}
            >
              {loading ? (
                <span className="image-drop-hint">Chargement…</span>
              ) : previewSrc ? (
                <img src={previewSrc} alt="aperçu" className="image-drop-preview" />
              ) : (
                <>
                  <span className="image-drop-icon">🖼</span>
                  <span className="image-drop-hint">Cliquez ou glissez une image ici</span>
                  <span className="image-drop-formats">PNG · JPEG · SVG · GIF · WebP</span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </div>
          ) : (
            <div className="image-url-zone">
              <div className="image-url-row">
                <input
                  type="url"
                  className="image-url-input"
                  placeholder="https://exemple.com/logo.png"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleUrlConfirm(); }}
                />
                <button className="image-url-btn" onClick={handleUrlConfirm}>
                  Aperçu
                </button>
              </div>
              {previewSrc && (
                <div className="image-drop-zone" style={{ cursor: "default", marginTop: 12 }}>
                  <img
                    src={previewSrc}
                    alt="aperçu"
                    className="image-drop-preview"
                    onError={() => setError("Impossible de charger l'image depuis cette URL.")}
                    onLoad={() => setError(null)}
                  />
                </div>
              )}
            </div>
          )}

          {error && <p className="image-import-error">{error}</p>}

          {/* Choix du calque */}
          <div className="image-import-layer">
            <span className="image-import-layer-label">Calque :</span>
            <button
              className={`text-toolbar-btn${layer === "background" ? " active" : ""}`}
              onClick={() => setLayer("background")}
              title="Derrière les équipements"
            >
              Arrière-plan
            </button>
            <button
              className={`text-toolbar-btn${layer === "foreground" ? " active" : ""}`}
              onClick={() => setLayer("foreground")}
              title="Devant les équipements"
            >
              Premier plan
            </button>
          </div>
        </div>

        {/* Pied */}
        <div className="image-import-footer">
          <button className="modal-btn secondary" onClick={onClose}>Annuler</button>
          <button
            className="modal-btn primary"
            disabled={!previewSrc || loading}
            onClick={handleInsert}
          >
            Insérer
          </button>
        </div>
      </div>
    </div>
  );
}

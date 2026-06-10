import { useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { pdfFileName } from "../../lib/pdfFileName";

// ── Champ fiches techniques PDF — multi-fichiers avec drag & drop ─────────────
export function PdfField({
  productId,
  values,
  onChange,
}: {
  productId: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [uploading, setUploading] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: File[]) => {
    const pdfs = files.filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfs.length === 0) return;
    setUploading(pdfs.map((f) => f.name));
    setErrors([]);
    const newUrls: string[] = [];
    const errs: string[] = [];
    for (const file of pdfs) {
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._\-() ]/g, "_");
        const path = `${productId}/${safeName}`;
        const { error } = await supabase.storage
          .from("product-datasheets")
          .upload(path, file, { upsert: true, contentType: "application/pdf" });
        if (error) throw error;
        const { data } = supabase.storage.from("product-datasheets").getPublicUrl(path);
        newUrls.push(data.publicUrl);
      } catch (ex) {
        errs.push(`${file.name} : ${ex instanceof Error ? ex.message : "Erreur"}`);
      }
    }
    setUploading([]);
    if (errs.length > 0) setErrors(errs);
    if (newUrls.length > 0) onChange([...values, ...newUrls]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    uploadFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    uploadFiles(files);
  };

  const removeUrl = (url: string) => {
    onChange(values.filter((u) => u !== url));
    const parts = url.split("/product-datasheets/");
    if (parts.length > 1) {
      const path = decodeURIComponent(parts[1].split("?")[0]);
      supabase.storage.from("product-datasheets").remove([path]).catch(() => {});
    }
  };

  return (
    <div className="form-row form-row-pdf">
      <label>Fiches techniques</label>
      <div className="pdf-field">
        {/* Liste des PDFs existants */}
        {values.length > 0 && (
          <div className="pdf-list">
            {values.map((url, i) => (
              <div key={i} className="pdf-list-item">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="pdf-field-link"
                  title={pdfFileName(url)}
                >
                  📄 {pdfFileName(url)}
                </a>
                <button
                  type="button"
                  className="pdf-field-remove"
                  onClick={() => removeUrl(url)}
                  title="Retirer ce fichier"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Zone de dépôt drag & drop */}
        <div
          className={`pdf-drop-zone${isDragOver ? " pdf-drop-zone--over" : ""}${uploading.length > 0 ? " pdf-drop-zone--busy" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
          onDrop={handleDrop}
          onClick={() => uploading.length === 0 && fileRef.current?.click()}
          role="button"
          aria-label="Zone de dépôt PDF"
        >
          {uploading.length > 0 ? (
            <span className="pdf-drop-busy-text">
              ⏳ Upload… {uploading.length > 1 ? `${uploading.length} fichiers` : uploading[0]}
            </span>
          ) : (
            <>
              <span className="pdf-drop-icon">📄</span>
              <span className="pdf-drop-text">
                Glisser des PDF ici
                <span className="pdf-drop-sub">ou cliquer pour parcourir</span>
              </span>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {errors.map((err, i) => (
          <span key={i} className="muted danger-text" style={{ fontSize: 11, display: "block" }}>
            ⚠ {err}
          </span>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { fileToResizedDataUrl } from "../../image";
import { openImageTab } from "./openImageTab";

export function ImageField({
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
            <img
              src={value}
              alt={label}
              className="image-field-thumb"
              onClick={() => openImageTab(value)}
              title="Cliquer pour agrandir"
            />
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

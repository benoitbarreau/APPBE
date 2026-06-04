import { useRef, useState } from 'react'

// ── Éditeur de logo (marque ou catégorie) ───────────────────────────────────
export function BrandLogoEditor({
  brandName,
  currentLogo,
  onSave,
  onClose,
}: {
  brandName: string
  currentLogo?: string
  onSave: (logo: string | null) => void
  onClose: () => void
}) {
  const isUrl = (s: string) => /^https?:\/\/.+/.test(s.trim())
  const [tab, setTab]           = useState<'upload' | 'url'>(currentLogo && isUrl(currentLogo) ? 'url' : 'upload')
  const [urlInput, setUrlInput] = useState(currentLogo && isUrl(currentLogo) ? currentLogo : '')
  const [preview, setPreview]   = useState<string | null>(currentLogo ?? null)
  const [imgError, setImgError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setPreview(reader.result as string); setImgError(false) }
    reader.readAsDataURL(file)
  }

  const handleUrlChange = (v: string) => {
    setUrlInput(v)
    setImgError(false)
    if (isUrl(v)) setPreview(v.trim())
    else setPreview(null)
  }

  return (
    <div className="brand-logo-overlay" onClick={onClose}>
      <div className="brand-logo-modal" onClick={e => e.stopPropagation()}>
        <div className="brand-logo-modal-header">
          <span>Logo — <strong>{brandName}</strong></span>
          <button className="brand-logo-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="brand-logo-tabs">
          <button className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}>📁 Fichier image</button>
          <button className={tab === 'url' ? 'active' : ''} onClick={() => setTab('url')}>🔗 URL web</button>
        </div>
        {tab === 'upload' ? (
          <div className="brand-logo-upload-area" onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
            <span className="brand-logo-upload-icon">🖼</span>
            <span className="brand-logo-upload-text">Cliquer pour choisir une image</span>
            <span className="brand-logo-upload-sub">PNG, SVG, JPG · max ~200 Ko recommandé</span>
          </div>
        ) : (
          <input
            className="brand-logo-url-input"
            value={urlInput}
            onChange={e => handleUrlChange(e.target.value)}
            placeholder="https://exemple.com/logo-marque.png"
            autoFocus
          />
        )}
        {preview && !imgError && (
          <div className="brand-logo-preview">
            <img src={preview} alt="Prévisualisation" className="brand-logo-preview-img" onError={() => setImgError(true)} />
          </div>
        )}
        {imgError && <div className="brand-logo-preview-err">⚠ Image impossible à charger</div>}
        <div className="brand-logo-actions">
          {currentLogo && <button className="danger" onClick={() => onSave(null)}>Supprimer le logo</button>}
          <button className="primary" disabled={!preview || imgError} onClick={() => { if (preview && !imgError) onSave(preview) }}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

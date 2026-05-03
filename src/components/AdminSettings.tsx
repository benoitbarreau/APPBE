import { useState } from "react";
import { useAppStore } from "../store";

export function AdminSettings({ onClose }: { onClose: () => void }) {
  const adminCode = useAppStore((s) => s.adminCode);
  const setAdminCode = useAppStore((s) => s.setAdminCode);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const save = () => {
    if (current !== adminCode) {
      setError("Code actuel incorrect");
      return;
    }
    if (!next || next.length < 2) {
      setError("Nouveau code trop court (min 2 caractères)");
      return;
    }
    if (next !== confirm) {
      setError("La confirmation ne correspond pas");
      return;
    }
    setAdminCode(next);
    setOk(true);
    setError(null);
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Administration</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="muted">
            Le code administrateur est demandé pour confirmer la suppression
            d'une fiche produit. Code par défaut : <code>1234</code>.
          </p>
          <div className="form-row">
            <label>Code actuel</label>
            <input
              type="password"
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value);
                setError(null);
              }}
              autoFocus
            />
          </div>
          <div className="form-row">
            <label>Nouveau code</label>
            <input
              type="password"
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="form-row">
            <label>Confirmer</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
          </div>
          {error && (
            <div className="danger-text" style={{ fontSize: 12 }}>
              {error}
            </div>
          )}
          {ok && (
            <div style={{ color: "#1a7f37", fontSize: 12 }}>
              Code mis à jour.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Fermer</button>
          <button className="primary" onClick={save}>
            Enregistrer le nouveau code
          </button>
        </div>
      </div>
    </div>
  );
}

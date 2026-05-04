import { useAuth } from "../auth/useAuth";

export function AdminSettings({ onClose }: { onClose: () => void }) {
  const { profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Mon compte</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {profile && (
            <>
              <div className="form-row">
                <label>Nom</label>
                <span>{profile.full_name ?? "—"}</span>
              </div>
              <div className="form-row">
                <label>Email</label>
                <span>{profile.email}</span>
              </div>
              <div className="form-row">
                <label>Rôle</label>
                <span className={`status-badge ${profile.role === "admin" ? "status-approved" : ""}`}>
                  {profile.role === "admin" ? "Administrateur" : "Utilisateur"}
                </span>
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Fermer</button>
          <button className="danger" onClick={() => void handleSignOut()}>
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}

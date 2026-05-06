import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/useAuth";

type Panel = "info" | "name" | "password" | "help";

export function AdminSettings({ onClose }: { onClose: () => void }) {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [panel, setPanel] = useState<Panel>("info");

  // ── Modification du nom affiché ─────────────────────────────────────────
  const [newName, setNewName] = useState(profile?.full_name ?? "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const saveName = async () => {
    if (!newName.trim()) return;
    setNameSaving(true);
    setNameMsg(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: newName.trim() })
        .eq("id", user!.id);
      if (error) throw error;
      await refreshProfile();
      setNameMsg({ ok: true, text: "Nom mis à jour ✓" });
    } catch (e) {
      setNameMsg({ ok: false, text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setNameSaving(false);
    }
  };

  // ── Changement de mot de passe ──────────────────────────────────────────
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const savePassword = async () => {
    if (!pwd1 || pwd1 !== pwd2) {
      setPwdMsg({ ok: false, text: "Les mots de passe ne correspondent pas" });
      return;
    }
    if (pwd1.length < 6) {
      setPwdMsg({ ok: false, text: "Minimum 6 caractères requis" });
      return;
    }
    setPwdSaving(true);
    setPwdMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd1 });
      if (error) throw error;
      setPwdMsg({ ok: true, text: "Mot de passe modifié ✓" });
      setPwd1("");
      setPwd2("");
    } catch (e) {
      setPwdMsg({ ok: false, text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setPwdSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal account-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Mon compte</h2>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="account-modal-body">
          {/* ── Navigation latérale ── */}
          <nav className="account-nav">
            <button
              className={panel === "info" ? "active" : ""}
              onClick={() => setPanel("info")}
            >
              Informations
            </button>
            <button
              className={panel === "name" ? "active" : ""}
              onClick={() => { setPanel("name"); setNameMsg(null); }}
            >
              Modifier le nom
            </button>
            <button
              className={panel === "password" ? "active" : ""}
              onClick={() => { setPanel("password"); setPwdMsg(null); }}
            >
              Mot de passe
            </button>
            <button
              className={panel === "help" ? "active" : ""}
              onClick={() => setPanel("help")}
            >
              Aide
            </button>
          </nav>

          {/* ── Panneau contenu ── */}
          <div className="account-panel">

            {/* Informations */}
            {panel === "info" && (
              <div className="account-info">
                <div className="form-row">
                  <label>Nom affiché</label>
                  <span>{profile?.full_name || <em className="muted">Non renseigné</em>}</span>
                </div>
                <div className="form-row">
                  <label>Email</label>
                  <span>{profile?.email ?? user?.email ?? "—"}</span>
                </div>
                <div className="form-row">
                  <label>Rôle</label>
                  <span className={`status-badge ${profile?.role === "admin" ? "status-approved" : ""}`}>
                    {profile?.role === "admin" ? "Administrateur" : "Utilisateur"}
                  </span>
                </div>
                <div className="form-row">
                  <label>Membre depuis</label>
                  <span>
                    {profile?.created_at
                      ? new Date(profile.created_at).toLocaleDateString("fr-FR", {
                          day: "numeric", month: "long", year: "numeric",
                        })
                      : "—"}
                  </span>
                </div>
              </div>
            )}

            {/* Modifier le nom */}
            {panel === "name" && (
              <div>
                <p className="account-hint">
                  Ce nom est affiché dans les projets partagés et dans l'interface.
                </p>
                <div className="form-row">
                  <label>Nom affiché</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Votre nom complet"
                    onKeyDown={(e) => e.key === "Enter" && void saveName()}
                    autoFocus
                  />
                </div>
                {nameMsg && (
                  <p className={`account-msg ${nameMsg.ok ? "account-msg-ok" : "account-msg-err"}`}>
                    {nameMsg.text}
                  </p>
                )}
                <button
                  className="primary"
                  style={{ marginTop: 16 }}
                  disabled={nameSaving || !newName.trim()}
                  onClick={() => void saveName()}
                >
                  {nameSaving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            )}

            {/* Aide / Documentation */}
            {panel === "help" && (
              <div>
                <p className="account-hint">
                  Le guide utilisateur couvre toutes les fonctionnalités de SynoX :
                  ajout de produits, câblage, zones, labels, exports A3, multi-onglets…
                </p>
                <div className="help-actions">
                  <a
                    href={`${import.meta.env.BASE_URL}guide-utilisateur.html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="help-btn-primary"
                  >
                    📖 Ouvrir le guide utilisateur
                  </a>
                  <p className="account-hint" style={{ marginTop: 18 }}>
                    Le guide s'ouvre dans un nouvel onglet. Vous pouvez l'enregistrer
                    en PDF depuis le bouton « 🖨 Enregistrer en PDF » en haut de la
                    page (ou avec Ctrl+P → Enregistrer au format PDF).
                  </p>
                </div>
                <div className="help-contact">
                  <strong>Une question ?</strong>
                  <br />
                  <a href="mailto:contact@videosynergie.com">
                    contact@videosynergie.com
                  </a>
                </div>
              </div>
            )}

            {/* Changement de mot de passe */}
            {panel === "password" && (
              <div>
                <p className="account-hint">
                  Choisissez un mot de passe d'au moins 6 caractères.
                </p>
                <div className="form-row">
                  <label>Nouveau mot de passe</label>
                  <input
                    type="password"
                    value={pwd1}
                    onChange={(e) => setPwd1(e.target.value)}
                    placeholder="Minimum 6 caractères"
                    autoComplete="new-password"
                    autoFocus
                  />
                </div>
                <div className="form-row">
                  <label>Confirmer</label>
                  <input
                    type="password"
                    value={pwd2}
                    onChange={(e) => setPwd2(e.target.value)}
                    placeholder="Répéter le mot de passe"
                    autoComplete="new-password"
                    onKeyDown={(e) => e.key === "Enter" && void savePassword()}
                  />
                </div>
                {pwdMsg && (
                  <p className={`account-msg ${pwdMsg.ok ? "account-msg-ok" : "account-msg-err"}`}>
                    {pwdMsg.text}
                  </p>
                )}
                <button
                  className="primary"
                  style={{ marginTop: 16 }}
                  disabled={pwdSaving || !pwd1 || !pwd2}
                  onClick={() => void savePassword()}
                >
                  {pwdSaving ? "Modification…" : "Modifier le mot de passe"}
                </button>
              </div>
            )}

          </div>
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

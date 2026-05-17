import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/useAuth";

type Panel = "info" | "name" | "password" | "company" | "help";

export function AdminSettings({ onClose }: { onClose: () => void }) {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [panel, setPanel] = useState<Panel>("info");

  // L'utilisateur est "externe" si son email n'est pas @videosynergie.com
  const isExternal = !(user?.email ?? "").endsWith("@videosynergie.com");

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

  // ── Société & Logo ──────────────────────────────────────────────────────
  const [companyName, setCompanyName] = useState(profile?.company_name ?? "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    profile?.company_logo_url ?? null
  );
  const [companySaving, setCompanySaving] = useState(false);
  const [companyMsg, setCompanyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogoPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const saveCompany = async () => {
    if (!user) return;
    setCompanySaving(true);
    setCompanyMsg(null);
    try {
      let logoUrl = profile?.company_logo_url ?? null;

      // Upload du nouveau logo si sélectionné
      if (logoFile) {
        const path = `${user.id}/logo.png`;
        const { error: uploadErr } = await supabase.storage
          .from("company-logos")
          .upload(path, logoFile, {
            upsert: true,
            contentType: logoFile.type,
          });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from("company-logos")
          .getPublicUrl(path);
        // Cache-bust : ajouter un timestamp pour forcer le rechargement
        logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      }

      // Mise à jour du profil
      const { error } = await supabase
        .from("profiles")
        .update({
          company_name: companyName.trim() || null,
          company_logo_url: logoUrl,
        })
        .eq("id", user.id);
      if (error) throw error;

      await refreshProfile();
      setLogoFile(null);
      setCompanyMsg({ ok: true, text: "Informations société mises à jour ✓" });
    } catch (e) {
      setCompanyMsg({ ok: false, text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setCompanySaving(false);
    }
  };

  const removeLogo = async () => {
    if (!user) return;
    setCompanySaving(true);
    setCompanyMsg(null);
    try {
      // Supprimer le fichier du storage
      await supabase.storage.from("company-logos").remove([`${user.id}/logo.png`]);
      // Mettre à jour le profil
      const { error } = await supabase
        .from("profiles")
        .update({ company_logo_url: null })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      setLogoPreview(null);
      setLogoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setCompanyMsg({ ok: true, text: "Logo supprimé ✓" });
    } catch (e) {
      setCompanyMsg({ ok: false, text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setCompanySaving(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────

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
            {isExternal && (
              <button
                className={panel === "company" ? "active" : ""}
                onClick={() => { setPanel("company"); setCompanyMsg(null); }}
              >
                Société
              </button>
            )}
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
                {isExternal && profile?.company_name && (
                  <div className="form-row">
                    <label>Société</label>
                    <span>{profile.company_name}</span>
                  </div>
                )}
                {isExternal && profile?.company_logo_url && (
                  <div className="form-row">
                    <label>Logo</label>
                    <img
                      src={profile.company_logo_url}
                      alt="Logo société"
                      className="account-company-logo-preview"
                    />
                  </div>
                )}
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

            {/* Société & Logo (utilisateurs externes uniquement) */}
            {panel === "company" && isExternal && (
              <div>
                <p className="account-hint">
                  Ces informations apparaissent dans vos cartouches et exports de synoptiques.
                </p>
                <div className="form-row">
                  <label>Nom de la société</label>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Votre société"
                    autoFocus
                  />
                </div>

                <div className="form-row account-logo-row">
                  <label>Logo (PNG / JPEG)</label>
                  <div className="account-logo-upload">
                    {logoPreview && (
                      <div className="account-logo-preview-wrap">
                        <img
                          src={logoPreview}
                          alt="Aperçu logo"
                          className="account-logo-preview"
                        />
                        <button
                          className="danger account-logo-remove-btn"
                          type="button"
                          title="Supprimer le logo"
                          onClick={() => void removeLogo()}
                          disabled={companySaving}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <label className="account-logo-pick-btn" htmlFor="logo-file-input">
                      {logoPreview ? "Changer de logo" : "Choisir un logo"}
                    </label>
                    <input
                      id="logo-file-input"
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: "none" }}
                      onChange={handleLogoChange}
                    />
                    <p className="account-hint" style={{ marginTop: 4, marginBottom: 0 }}>
                      Formats acceptés : PNG, JPEG — 2 Mo max
                    </p>
                  </div>
                </div>

                {companyMsg && (
                  <p className={`account-msg ${companyMsg.ok ? "account-msg-ok" : "account-msg-err"}`}>
                    {companyMsg.text}
                  </p>
                )}
                <button
                  className="primary"
                  style={{ marginTop: 16 }}
                  disabled={companySaving || (!companyName.trim() && !logoFile && !!profile?.company_name === !!companyName)}
                  onClick={() => void saveCompany()}
                >
                  {companySaving ? "Enregistrement…" : "Enregistrer"}
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
                  <a href="mailto:admin.synox@gmail.com">
                    admin.synox@gmail.com
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

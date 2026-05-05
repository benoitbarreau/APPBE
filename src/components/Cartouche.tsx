import { useEffect } from "react";
import { useAppStore, useEditorState } from "../store";
import { useAuth } from "../auth/useAuth";
import type { ProjectMeta } from "../types";

export function Cartouche() {
  const meta = useAppStore((s) => s.projectMeta);
  const update = useAppStore((s) => s.updateProjectMeta);
  const currentProjectName = useAppStore((s) => s.currentProjectName);
  const { profile } = useAuth();
  const readOnly = useEditorState((s) => s.readOnly);

  // Pré-remplir "Auteur" avec le nom affiché de l'utilisateur connecté (si vide)
  useEffect(() => {
    if (!meta.authorName && profile?.full_name) {
      update({ authorName: profile.full_name });
    }
  }, [profile?.full_name, meta.authorName, update]);

  // Pré-remplir "Campus / Site" avec le nom du projet (si vide)
  useEffect(() => {
    if (!meta.campus && currentProjectName && currentProjectName !== "Sans titre") {
      update({ campus: currentProjectName });
    }
  }, [currentProjectName, meta.campus, update]);

  const setField = (k: keyof ProjectMeta) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!readOnly) update({ [k]: e.target.value });
  };

  return (
    <div className={`cartouche${readOnly ? " cartouche-readonly" : ""}`}>
      {/* Colonne 1 : Campus / Site, Lot, Date */}
      <div className="cartouche-cell cartouche-site">
        <input className="cartouche-title" value={meta.campus} onChange={setField("campus")} placeholder="Campus / Site" readOnly={readOnly} />
        <input className="cartouche-trade" value={meta.trade} onChange={setField("trade")} placeholder="Lot" readOnly={readOnly} />
        <input className="cartouche-date" value={meta.date} onChange={setField("date")} placeholder="Date" readOnly={readOnly} />
      </div>

      {/* Colonne 2 : CLIENT + Lieu */}
      <div className="cartouche-cell cartouche-client">
        <div className="cartouche-client-row">
          <span className="cartouche-label">CLIENT :</span>
          <input className="cartouche-client-name" value={meta.client} onChange={setField("client")} placeholder="Nom client" readOnly={readOnly} />
        </div>
        <div className="cartouche-lieu-row">
          <span className="cartouche-lieu-label">LIEU :</span>
          <input className="cartouche-lieu-name" value={meta.lieu} onChange={setField("lieu")} placeholder="Lieu / Adresse" readOnly={readOnly} />
        </div>
      </div>

      {/* Colonne 3 : Bureau d'étude, Auteur, Version */}
      <div className="cartouche-cell cartouche-be">
        <input className="cartouche-be-name" value={meta.bureauEtude} onChange={setField("bureauEtude")} placeholder="Bureau d'étude" readOnly={readOnly} />
        <input className="cartouche-author" value={meta.authorName} onChange={setField("authorName")} placeholder="Auteur" readOnly={readOnly} />
        <input className="cartouche-version" value={meta.version} onChange={setField("version")} placeholder="V1.0" readOnly={readOnly} />
      </div>

      {/* Colonne 4 : Logo entreprise */}
      <div className="cartouche-cell cartouche-logo">
        <img
          src={`${import.meta.env.BASE_URL}company-logo.png`}
          alt="Logo"
          className="cartouche-logo-img"
        />
      </div>
    </div>
  );
}

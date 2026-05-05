-- ── Historique de versions de projets ────────────────────────────────────────
-- Chaque sauvegarde avec modification réelle incrémente la version (+0.1).
-- On conserve au maximum 3 instantanés archivés + la version courante = 4 au total.

-- Table des snapshots archivés
CREATE TABLE IF NOT EXISTS public.project_versions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version     text        NOT NULL,
  saved_at    timestamptz NOT NULL DEFAULT now(),
  data        jsonb       NOT NULL
);

CREATE INDEX IF NOT EXISTS pv_project_id_idx
  ON public.project_versions(project_id, saved_at DESC);

-- Colonne légère sur la table projects pour l'affichage dans la liste
-- (évite de charger les données complètes de chaque version pour la liste)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS versions_meta jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;

-- SELECT : propriétaire ou utilisateur avec accès partagé
CREATE POLICY "view_project_versions" ON public.project_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.project_shares ps
            WHERE ps.project_id = p.id AND ps.user_id = auth.uid()
          )
        )
    )
  );

-- INSERT / UPDATE / DELETE : propriétaire uniquement
CREATE POLICY "manage_project_versions" ON public.project_versions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

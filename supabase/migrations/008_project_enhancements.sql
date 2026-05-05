-- ── Améliorations table projects ──────────────────────────────────────────
-- Colonnes dénormalisées pour affichage rapide dans la liste (sans charger data)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_name text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS lieu        text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived    boolean NOT NULL DEFAULT false;

-- Index pour filtrer les projets archivés efficacement
CREATE INDEX IF NOT EXISTS projects_archived_idx ON public.projects(archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_client_idx   ON public.projects(client_name);

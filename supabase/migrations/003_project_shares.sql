-- ── Partage de projets ─────────────────────────────────────────────────────

CREATE TABLE public.project_shares (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid        REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role       text        NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'viewer')),
  shared_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(project_id, user_id)
);

CREATE INDEX project_shares_user_id_idx   ON public.project_shares(user_id);
CREATE INDEX project_shares_project_id_idx ON public.project_shares(project_id);

ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;

-- Le propriétaire du projet peut gérer tous les partages de son projet
CREATE POLICY "share_owner_manages" ON public.project_shares
  FOR ALL
  USING  (EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND user_id = auth.uid()));

-- L'utilisateur partagé peut lire ses propres partages (pour afficher les badges)
CREATE POLICY "share_target_reads" ON public.project_shares
  FOR SELECT
  USING (user_id = auth.uid());

-- Les admins peuvent tout voir et gérer
CREATE POLICY "share_admins_all" ON public.project_shares
  FOR ALL
  USING  (public.is_admin());

-- ── Nouvelles policies sur public.projects ────────────────────────────────

-- Les utilisateurs avec qui un projet est partagé peuvent le lire
CREATE POLICY "shared_users_select" ON public.projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_shares
      WHERE project_id = id AND user_id = auth.uid()
    )
  );

-- Les utilisateurs partagés en mode 'editor' peuvent modifier le projet
CREATE POLICY "shared_editors_update" ON public.projects
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.project_shares
      WHERE project_id = id AND user_id = auth.uid() AND role = 'editor'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_shares
      WHERE project_id = id AND user_id = auth.uid() AND role = 'editor'
    )
  );

-- ── Fonction SECURITY DEFINER : résolution email → profil ─────────────────
-- Permet à tout utilisateur connecté de chercher un autre par email
-- sans exposer l'intégralité de la table profiles via RLS.

CREATE OR REPLACE FUNCTION public.get_profile_by_email(p_email text)
RETURNS TABLE(id uuid, email text, full_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id, p.email, p.full_name
  FROM public.profiles p
  WHERE lower(p.email) = lower(p_email)
    AND p.status = 'approved'
  LIMIT 1;
$$;

-- ── Migration 015 : correction du partage de projets (récursion RLS) ──────────
--
-- Problème : les policies RLS créaient une récursion circulaire silencieuse :
--
--   1. Évaluation de "shared_users_select" sur projects
--      → sous-requête sur project_shares (avec RLS !)
--      → RLS project_shares évalue "share_owner_manages"
--      → appel is_project_owner() ou sous-requête sur projects
--      → retour à l'évaluation RLS de projects → RÉCURSION
--
-- Solution : TOUTES les vérifications inter-tables passent par des fonctions
-- SECURITY DEFINER qui court-circuitent les RLS. Zéro récursion possible.
--
-- Nouvelles fonctions :
--   • is_project_owner(uuid)      — déjà présente, recréée pour être sûr
--   • list_shared_project_ids()   — NOUVEAU : renvoie les project_id partagés
--   • is_shared_editor(uuid)      — NOUVEAU : vérifie le rôle 'editor' partagé

-- ── 1. Fonctions SECURITY DEFINER ──────────────────────────────────────────────

-- Vérifie si l'utilisateur courant est propriétaire d'un projet
CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects
    WHERE id = p_project_id
      AND user_id = auth.uid()
  );
$$;

-- Renvoie les IDs de projets partagés avec l'utilisateur courant
-- (lit project_shares SANS RLS grâce à SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.list_shared_project_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT project_id FROM project_shares WHERE user_id = auth.uid();
$$;

-- Vérifie si l'utilisateur courant est éditeur partagé sur un projet
-- (lit project_shares SANS RLS grâce à SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_shared_editor(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_shares
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND role = 'editor'
  );
$$;

-- ── 2. Policies sur project_shares ─────────────────────────────────────────────

DROP POLICY IF EXISTS "share_owner_manages"       ON public.project_shares;
DROP POLICY IF EXISTS "shared_users_select"        ON public.project_shares;
DROP POLICY IF EXISTS "shared_user_reads_own_share" ON public.project_shares;
DROP POLICY IF EXISTS "admin_manages_shares"       ON public.project_shares;

-- L'utilisateur voit ses propres lignes de partage (simple, pas de récursion)
CREATE POLICY "shared_users_select"
  ON public.project_shares FOR SELECT
  USING (user_id = auth.uid());

-- Le propriétaire du projet gère tous les partages de son projet
-- is_project_owner() → SECURITY DEFINER → pas de récursion
CREATE POLICY "share_owner_manages"
  ON public.project_shares FOR ALL
  USING    (public.is_project_owner(project_id))
  WITH CHECK (public.is_project_owner(project_id));

-- Les admins gèrent tous les partages
CREATE POLICY "admin_manages_shares"
  ON public.project_shares FOR ALL
  USING    (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 3. Policies sur projects (partage) ─────────────────────────────────────────

DROP POLICY IF EXISTS "shared_users_select"   ON public.projects;
DROP POLICY IF EXISTS "shared_editors_update" ON public.projects;

-- Les utilisateurs partagés voient les projets partagés avec eux
-- list_shared_project_ids() → SECURITY DEFINER → zéro récursion
CREATE POLICY "shared_users_select"
  ON public.projects FOR SELECT
  USING (id = ANY(public.list_shared_project_ids()));

-- Les éditeurs partagés peuvent sauvegarder le projet
-- is_shared_editor() → SECURITY DEFINER → zéro récursion
CREATE POLICY "shared_editors_update"
  ON public.projects FOR UPDATE
  USING    (public.is_shared_editor(id))
  WITH CHECK (true);

-- ── 4. Vérification ────────────────────────────────────────────────────────────

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('projects', 'project_shares')
ORDER BY tablename, policyname;

SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN ('is_project_owner', 'list_shared_project_ids', 'is_shared_editor');

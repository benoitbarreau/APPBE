-- ── Correction : récursion infinie dans les policies de project_shares ────
--
-- Problème : share_owner_manages vérifie l'ownership via une sous-requête
-- sur projects. Mais projects a maintenant des policies qui interrogent
-- project_shares → boucle infinie.
--
-- Solution : une fonction SECURITY DEFINER qui contourne le RLS sur projects
-- (elle s'exécute avec les droits de son propriétaire = superuser).

CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND user_id = auth.uid()
  );
$$;

-- Remplacer la policy incriminée par une version sans récursion
DROP POLICY IF EXISTS "share_owner_manages" ON public.project_shares;

CREATE POLICY "share_owner_manages" ON public.project_shares
  FOR ALL
  USING  (public.is_project_owner(project_id))
  WITH CHECK (public.is_project_owner(project_id));

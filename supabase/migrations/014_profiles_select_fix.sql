-- ── Migration 014 : correction de la policy profiles_select ─────────────────
--
-- Problème : la policy "profiles_select" ne permettait de voir que sa propre
-- ligne (auth.uid() = id) ou toutes les lignes pour un admin.
-- Conséquence : quand l'utilisateur B ouvre la liste de ses projets,
-- PostgREST fait un INNER JOIN avec profiles pour récupérer le nom/email
-- du propriétaire. Si B ne peut pas voir le profil du propriétaire A (RLS),
-- le projet est absent du résultat — même avec profiles!left, la colonne
-- reste NULL et les cartes "Par X" n'affichent rien.
--
-- Solution : tout utilisateur authentifié peut voir les profils approuvés
-- (email + full_name). Cela est cohérent avec list_approved_profiles() qui
-- expose déjà ces informations via SECURITY DEFINER.

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id         -- sa propre ligne (toujours visible)
    OR public.is_admin()    -- admin voit tout
    OR status = 'approved'  -- tout utilisateur connecté voit les profils approuvés
  );

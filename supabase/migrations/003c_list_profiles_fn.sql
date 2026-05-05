-- ── Fonction SECURITY DEFINER : liste de tous les profils approuvés ───────
-- Permet à tout utilisateur connecté de lister les autres comptes approuvés
-- pour le sélecteur de partage, sans exposer le RLS de la table profiles.

CREATE OR REPLACE FUNCTION public.list_approved_profiles()
RETURNS TABLE(id uuid, email text, full_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id, p.email, p.full_name
  FROM public.profiles p
  WHERE p.status = 'approved'
    AND p.id != auth.uid()
  ORDER BY p.full_name NULLS LAST, p.email;
$$;

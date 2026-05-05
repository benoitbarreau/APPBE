-- ── Fonction admin : liste des utilisateurs avec dernière connexion ────────
-- Lit auth.users (inaccessible côté client) via SECURITY DEFINER.
-- Seuls les admins obtiennent des résultats.

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id              uuid,
  email           text,
  full_name       text,
  status          user_status,
  role            user_role,
  created_at      timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.status,
    p.role,
    p.created_at,
    u.last_sign_in_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE public.is_admin()
  ORDER BY p.created_at DESC;
$$;

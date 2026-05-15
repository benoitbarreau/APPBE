-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 013 : champs Société + suppression admin + bucket logos
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Nouveaux champs sur profiles ──────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_name     TEXT,
  ADD COLUMN IF NOT EXISTS company_logo_url TEXT;

-- ── 2. Politique RLS : mise à jour des champs personnels (non-admin) ──────────
-- Permet à chaque utilisateur de modifier full_name, company_name, company_logo_url
-- sans pouvoir toucher à status ou role.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
    AND policyname = 'profiles_update_self'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "profiles_update_self"
      ON public.profiles FOR UPDATE
      TO authenticated
      USING  (auth.uid() = id)
      WITH CHECK (
        auth.uid() = id
        -- L'utilisateur ne peut pas s'accorder un rôle ou un statut différent
        AND role   = (SELECT role   FROM public.profiles WHERE id = auth.uid())
        AND status = (SELECT status FROM public.profiles WHERE id = auth.uid())
      )
    $pol$;
  END IF;
END;
$$;

-- ── 3. Bucket Supabase Storage pour les logos société ────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,                                  -- accès public (URLs permanentes)
  2097152,                               -- 2 Mo max par fichier
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Politique : n'importe qui peut lire les logos (bucket public)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'company_logos_public_read'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "company_logos_public_read"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'company-logos')
    $pol$;
  END IF;
END;
$$;

-- Politique : chaque utilisateur peut uploader/remplacer son propre logo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'company_logos_self_insert'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "company_logos_self_insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'company-logos'
        AND split_part(name, '/', 1) = (auth.uid())::text
      )
    $pol$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'company_logos_self_update'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "company_logos_self_update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'company-logos'
        AND split_part(name, '/', 1) = (auth.uid())::text
      )
    $pol$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'company_logos_self_delete'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "company_logos_self_delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'company-logos'
        AND split_part(name, '/', 1) = (auth.uid())::text
      )
    $pol$;
  END IF;
END;
$$;

-- ── 4. Mise à jour de admin_list_users pour inclure les nouveaux champs ───────
-- DROP requis car la signature de retour change (ajout de deux colonnes).

DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id               uuid,
  email            text,
  full_name        text,
  status           user_status,
  role             user_role,
  created_at       timestamptz,
  last_sign_in_at  timestamptz,
  company_name     text,
  company_logo_url text
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
    u.last_sign_in_at,
    p.company_name,
    p.company_logo_url
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE public.is_admin()
  ORDER BY p.created_at DESC;
$$;

-- ── 5. Fonction admin : suppression complète d'un utilisateur ─────────────────
-- Supprime le compte auth.users (cascade vers profiles).
-- Réservée aux administrateurs.

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission refusée — réservé aux administrateurs';
  END IF;

  -- La contrainte ON DELETE CASCADE dans 001_init.sql supprime automatiquement
  -- la ligne dans public.profiles.
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

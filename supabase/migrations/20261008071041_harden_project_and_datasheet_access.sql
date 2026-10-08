-- Apply after the existing 001–027 migrations.
BEGIN;

-- RLS authorizes rows, not columns. Shared editors must not take ownership.
CREATE OR REPLACE FUNCTION public.protect_project_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     AND auth.uid() IS NOT NULL
     AND NOT (public.is_admin() AND public.is_approved_user()) THEN
    RAISE EXCEPTION 'Seul un administrateur approuvé peut transférer un projet'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_protect_owner ON public.projects;
CREATE TRIGGER projects_protect_owner
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.protect_project_owner();

-- PDFs remain publicly readable. Only approved accounts may upload;
-- only the uploader or an approved administrator may replace/delete them.
-- Objects uploaded by service_role (no owner_id) remain admin-managed.
DROP POLICY IF EXISTS "product-datasheets upload" ON storage.objects;
CREATE POLICY "product-datasheets upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-datasheets'
    AND public.is_approved_user()
    AND (owner_id = auth.uid()::text OR public.is_admin())
  );

DROP POLICY IF EXISTS "product-datasheets update" ON storage.objects;
CREATE POLICY "product-datasheets update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-datasheets'
    AND public.is_approved_user()
    AND (owner_id = auth.uid()::text OR public.is_admin())
  )
  WITH CHECK (
    bucket_id = 'product-datasheets'
    AND public.is_approved_user()
    AND (owner_id = auth.uid()::text OR public.is_admin())
  );

DROP POLICY IF EXISTS "product-datasheets delete" ON storage.objects;
CREATE POLICY "product-datasheets delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-datasheets'
    AND public.is_approved_user()
    AND (owner_id = auth.uid()::text OR public.is_admin())
  );

COMMIT;

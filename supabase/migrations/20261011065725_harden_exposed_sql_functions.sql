-- RPC permissions are explicit; trigger execution does not require caller EXECUTE.
ALTER FUNCTION public.set_updated_at() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.handle_new_user(), public.set_updated_at(), public.protect_project_owner() FROM PUBLIC, anon, authenticated;

-- Anonymous policies must not evaluate helpers whose EXECUTE is revoked below.
-- Preserve authenticated predicates verbatim (including public catalogue reads).
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT * FROM pg_policies WHERE schemaname IN ('public','storage')
  AND roles=ARRAY['public']::name[]
  AND coalesce(qual,'')||coalesce(with_check,'') ~ '\mis_admin\M|\mis_approved_user\M|\mis_project_owner\M|\mis_shared_editor\M|\mis_shared_with_me\M'
 LOOP EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated',p.policyname,p.schemaname,p.tablename); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND status='approved');
$$;
CREATE OR REPLACE FUNCTION public.get_profile_by_email(p_email text)
RETURNS TABLE(id uuid,email text,full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id,p.email,p.full_name FROM public.profiles p
 WHERE public.is_approved_user() AND lower(p.email)=lower(p_email) AND p.status='approved' LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.list_approved_profiles()
RETURNS TABLE(id uuid,email text,full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id,p.email,p.full_name FROM public.profiles p
 WHERE public.is_approved_user() AND p.status='approved' AND p.id<>auth.uid()
 ORDER BY p.full_name NULLS LAST,p.email;
$$;
-- Existing bodies use schema-qualified relations, except these project predicates.
CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND user_id=auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.is_shared_editor(p_project_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.project_shares WHERE project_id=p_project_id AND user_id=auth.uid() AND role='editor');
$$;
CREATE OR REPLACE FUNCTION public.is_shared_with_me(p_project_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.project_shares WHERE project_id=p_project_id AND user_id=auth.uid());
$$;
ALTER FUNCTION public.is_approved_user() SET search_path='';
ALTER FUNCTION public.admin_list_users() SET search_path='';
ALTER FUNCTION public.admin_delete_user(uuid) SET search_path='';
DO $$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY['admin_delete_user(uuid)','admin_list_users()','get_profile_by_email(text)',
  'list_approved_profiles()','is_admin()','is_approved_user()','is_project_owner(uuid)','is_shared_editor(uuid)','is_shared_with_me(uuid)']
 LOOP
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.'||signature||' FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||signature||' TO authenticated, service_role';
 END LOOP;
END $$;

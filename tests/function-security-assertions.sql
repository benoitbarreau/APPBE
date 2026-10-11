BEGIN;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef LOOP
  ASSERT NOT has_function_privilege('anon',f.oid,'EXECUTE'), 'Anonymous privileged function';
 END LOOP;
 ASSERT NOT has_function_privilege('authenticated','public.handle_new_user()','EXECUTE');
 ASSERT (SELECT proconfig IS NOT NULL FROM pg_proc WHERE oid='public.set_updated_at()'::regprocedure);
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.get_profile_by_email('owner@example.test'); RAISE EXCEPTION 'Anonymous lookup allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
DO $$ BEGIN
 ASSERT NOT public.is_admin();
 ASSERT (SELECT count(*)=0 FROM public.list_approved_profiles());
 ASSERT (SELECT count(*)=0 FROM public.get_profile_by_email('owner@example.test'));
 ASSERT (SELECT count(*)=0 FROM public.admin_list_users());
 BEGIN PERFORM public.admin_delete_user('00000000-0000-0000-0000-000000000001'); RAISE EXCEPTION 'Pending delete allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Pending delete allowed' THEN RAISE; END IF; END;
END $$;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 FROM public.get_profile_by_email('owner@example.test'));
 ASSERT (SELECT count(*)>=1 FROM public.list_approved_profiles());
 ASSERT (SELECT count(*)=0 FROM public.admin_list_users());
END $$;
SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
DO $$ BEGIN ASSERT public.is_admin(); ASSERT (SELECT count(*)>=4 FROM public.admin_list_users()); END $$;
RESET ROLE;
UPDATE public.profiles SET status='pending' WHERE id='00000000-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
DO $$ BEGIN ASSERT NOT public.is_admin(); ASSERT (SELECT count(*)=0 FROM public.admin_list_users()); END $$;
ROLLBACK;

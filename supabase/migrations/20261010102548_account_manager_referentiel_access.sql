BEGIN;
-- Invoker helpers deliberately retain the caller's RLS permissions.
CREATE FUNCTION public.can_manage_ref_entity(p_type text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT public.is_approved_user() THEN RETURN false; END IF;
 IF p_type='client' THEN
  RETURN EXISTS(SELECT 1 FROM public.clients c WHERE c.id=p_id AND
   (c.user_id=auth.uid() OR c.account_manager_id=auth.uid() OR public.is_admin()));
 ELSIF p_type='site' THEN
  RETURN EXISTS(SELECT 1 FROM public.sites s WHERE s.id=p_id AND public.can_manage_ref_entity('client',s.client_id));
 ELSIF p_type='room' THEN
  RETURN EXISTS(SELECT 1 FROM public.rooms r WHERE r.id=p_id AND public.can_manage_ref_entity('site',r.site_id));
 END IF;
 RETURN false;
END;
$$;
CREATE FUNCTION public.ref_entity_client_id(p_type text,p_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_type='client' THEN RETURN (SELECT id FROM public.clients WHERE id=p_id);
 ELSIF p_type='site' THEN RETURN (SELECT client_id FROM public.sites WHERE id=p_id);
 ELSIF p_type='room' THEN RETURN (SELECT s.client_id FROM public.rooms r JOIN public.sites s ON s.id=r.site_id WHERE r.id=p_id);
 END IF;
 RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.can_manage_ref_entity(text,uuid),public.ref_entity_client_id(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_ref_entity(text,uuid),public.ref_entity_client_id(text,uuid) TO authenticated,service_role;

DROP POLICY IF EXISTS clients_manager_select ON public.clients;
DROP POLICY IF EXISTS clients_manager_update ON public.clients;
CREATE POLICY clients_manager_select ON public.clients FOR SELECT TO authenticated
 USING(public.is_approved_user() AND account_manager_id=auth.uid());
-- Direct editing must retain the assignment; reassignment uses the narrow RPC below.
CREATE POLICY clients_manager_update ON public.clients FOR UPDATE TO authenticated
 USING(public.is_approved_user() AND account_manager_id=auth.uid()) WITH CHECK(public.is_approved_user() AND account_manager_id=auth.uid());
CREATE FUNCTION public.protect_client_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NOT NULL THEN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
   RAISE EXCEPTION 'Identifiant client immuable' USING ERRCODE='42501';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT (public.is_approved_user() AND public.is_admin()) THEN
   RAISE EXCEPTION 'Transfert de propriété réservé aux administrateurs' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_client_owner() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER clients_protect_owner BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.protect_client_owner();

-- A narrow definer RPC allows reassignment without granting visibility of the
-- resulting client to the previous manager. Ownership fields are never writable here.
CREATE FUNCTION public.assign_client_manager(p_client_id uuid,p_manager_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_approved_user() THEN
  RAISE EXCEPTION 'Compte approuvé requis' USING ERRCODE='42501';
 END IF;
 IF p_manager_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_manager_id AND status='approved') THEN
  RAISE EXCEPTION 'Gestionnaire approuvé requis' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.clients WHERE id=p_client_id AND
  (user_id=auth.uid() OR account_manager_id=auth.uid() OR public.is_admin()) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assignation non autorisée' USING ERRCODE='42501'; END IF;
 UPDATE public.clients SET account_manager_id=p_manager_id,updated_at=clock_timestamp() WHERE id=p_client_id;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_client_manager(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_client_manager(uuid,uuid) TO authenticated;

CREATE POLICY sites_manager_access ON public.sites FOR ALL TO authenticated
 USING(public.can_manage_ref_entity('client',client_id)) WITH CHECK(public.can_manage_ref_entity('client',client_id));
CREATE POLICY rooms_manager_access ON public.rooms FOR ALL TO authenticated
 USING(public.can_manage_ref_entity('site',site_id)) WITH CHECK(public.can_manage_ref_entity('site',site_id));
CREATE POLICY contacts_manager_access ON public.contacts FOR ALL TO authenticated
 USING(public.can_manage_ref_entity(entity_type,entity_id)) WITH CHECK(public.can_manage_ref_entity(entity_type,entity_id));
CREATE POLICY ref_documents_manager_access ON public.ref_documents FOR ALL TO authenticated
 USING(public.can_manage_ref_entity(entity_type,entity_id)) WITH CHECK(public.can_manage_ref_entity(entity_type,entity_id));
CREATE POLICY room_contacts_manager_access ON public.room_contacts FOR ALL TO authenticated
 USING(public.can_manage_ref_entity('room',room_id) AND EXISTS(
  SELECT 1 FROM public.contacts c WHERE c.id=contact_id AND public.can_manage_ref_entity(c.entity_type,c.entity_id)
   AND public.ref_entity_client_id(c.entity_type,c.entity_id)=public.ref_entity_client_id('room',room_id)))
 WITH CHECK(public.can_manage_ref_entity('room',room_id) AND EXISTS(
  SELECT 1 FROM public.contacts c WHERE c.id=contact_id AND public.can_manage_ref_entity(c.entity_type,c.entity_id)
   AND public.ref_entity_client_id(c.entity_type,c.entity_id)=public.ref_entity_client_id('room',room_id)));

-- Parse file paths safely: malformed or legacy paths never raise a UUID error.
CREATE FUNCTION public.can_manage_ref_file(p_name text,p_logo boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE parts text[]:=string_to_array(p_name,'/'); entity_type text; entity_id text;
BEGIN
 IF NOT public.is_approved_user() THEN RETURN false; END IF;
 IF p_logo THEN entity_type:='client'; entity_id:=parts[2];
 ELSE entity_type:=parts[2]; entity_id:=parts[3]; END IF;
 IF entity_type IN ('client','site','room') AND entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RETURN public.can_manage_ref_entity(entity_type,entity_id::uuid);
 END IF;
 -- Preserve owner-only access for pre-existing files without an entity path.
 RETURN parts[1]=auth.uid()::text;
END;
$$;
REVOKE ALL ON FUNCTION public.can_manage_ref_file(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_ref_file(text,boolean) TO authenticated,service_role;
DROP POLICY IF EXISTS ref_storage_select ON storage.objects;
DROP POLICY IF EXISTS ref_storage_insert ON storage.objects;
DROP POLICY IF EXISTS ref_storage_delete ON storage.objects;
DROP POLICY IF EXISTS ref_storage_admin ON storage.objects;
CREATE POLICY ref_storage_select ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='ref-documents' AND public.can_manage_ref_file(name));
CREATE POLICY ref_storage_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='ref-documents' AND (storage.foldername(name))[1]=auth.uid()::text AND public.can_manage_ref_file(name));
CREATE POLICY ref_storage_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='ref-documents' AND public.can_manage_ref_file(name));
CREATE POLICY ref_storage_admin ON storage.objects FOR ALL TO authenticated
 USING(bucket_id='ref-documents' AND public.is_approved_user() AND public.is_admin())
 WITH CHECK(bucket_id='ref-documents' AND public.is_approved_user() AND public.is_admin());
CREATE POLICY client_logos_manager_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='client-logos' AND public.can_manage_ref_file(name,true));
CREATE POLICY client_logos_manager_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='client-logos' AND (storage.foldername(name))[1]=auth.uid()::text AND public.can_manage_ref_file(name,true));
COMMIT;

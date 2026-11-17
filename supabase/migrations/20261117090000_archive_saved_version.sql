-- Un point de version (« Enregistrer ») archive l'état qui vient d'être enregistré,
-- sous son propre numéro. Auparavant, il archivait l'état précédent du serveur,
-- c'est-à-dire la dernière sauvegarde automatique, sous l'ancien numéro : la
-- version « V1.0 » contenait alors un état bien postérieur à son enregistrement.
-- Même signature, mêmes contrôles de droits et de concurrence que
-- 20261009034950_atomic_project_save.sql ; seul l'archivage change.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_project_atomic(
  p_id uuid, p_name text, p_data jsonb,
  p_expected_updated_at timestamptz,
  p_create_version boolean DEFAULT false,
  p_force boolean DEFAULT false
)
RETURNS TABLE(id uuid, updated_at timestamptz, versions_meta jsonb, version text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  previous public.projects%ROWTYPE;
  saved_data jsonb := p_data;
  previous_version text;
  next_version text;
  version_number numeric;
  history jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'Compte approuvé requis' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_admin() OR public.is_project_owner(p_id) OR public.is_shared_editor(p_id)) THEN
    RAISE EXCEPTION 'Édition du projet non autorisée' USING ERRCODE = '42501';
  END IF;
  SELECT p.* INTO previous FROM public.projects p WHERE p.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Projet introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF NOT p_force AND (p_expected_updated_at IS NULL OR previous.updated_at <> p_expected_updated_at) THEN
    RAISE EXCEPTION 'Le projet a été modifié ailleurs' USING ERRCODE = 'PT409';
  END IF;
  IF jsonb_typeof(p_data->'projectMeta') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Métadonnées projet invalides' USING ERRCODE = '22023';
  END IF;
  next_version := coalesce(p_data #>> '{projectMeta,version}', 'V1.0');
  history := previous.versions_meta;
  IF p_create_version THEN
    previous_version := coalesce(previous.data #>> '{projectMeta,version}', 'V1.0');
    version_number := CASE WHEN previous_version ~* '^V?[0-9]+(\.[0-9]+)?$'
      THEN regexp_replace(previous_version, '^[Vv]', '')::numeric ELSE 1.0 END;
    next_version := 'V' || to_char(round(version_number + 0.1, 1), 'FM999999990.0');
    saved_data := jsonb_set(p_data, '{projectMeta,version}', to_jsonb(next_version));
    INSERT INTO public.project_versions(project_id, version, data, saved_at)
      VALUES (p_id, next_version, saved_data, clock_timestamp());
    DELETE FROM public.project_versions v WHERE v.project_id=p_id AND v.id NOT IN (
      SELECT keep.id FROM public.project_versions keep WHERE keep.project_id=p_id
      ORDER BY keep.saved_at DESC, keep.id DESC LIMIT 3
    );
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'savedAt',v.saved_at)
      ORDER BY v.saved_at,v.id),'[]'::jsonb) INTO history
      FROM public.project_versions v WHERE v.project_id=p_id;
  END IF;
  RETURN QUERY UPDATE public.projects p SET
    name=p_name, data=saved_data, versions_meta=history,
    client_name=coalesce(saved_data #>> '{projectMeta,client}',''),
    lieu=coalesce(saved_data #>> '{projectMeta,lieu}','')
    WHERE p.id=p_id
    RETURNING p.id,p.updated_at,p.versions_meta,next_version;
END;
$$;
REVOKE ALL ON FUNCTION public.save_project_atomic(uuid,text,jsonb,timestamptz,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_project_atomic(uuid,text,jsonb,timestamptz,boolean,boolean) TO authenticated;

COMMIT;

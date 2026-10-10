BEGIN;
CREATE TABLE public.ai_completion_limits (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  daily_limit integer NOT NULL DEFAULT 50 CHECK (daily_limit BETWEEN 1 AND 10000),
  concurrent_limit integer NOT NULL DEFAULT 1 CHECK (concurrent_limit BETWEEN 1 AND 10)
);
INSERT INTO public.ai_completion_limits(singleton) VALUES (true);
CREATE TABLE public.ai_completion_usage (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  usage_day date NOT NULL,
  requests integer NOT NULL DEFAULT 0 CHECK (requests >= 0),
  leases jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(leases)='object')
);
ALTER TABLE public.ai_completion_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_completion_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_completion_limits,public.ai_completion_usage FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE ON public.ai_completion_limits TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.ai_completion_usage TO service_role;

-- Only the authenticated Edge Function backend may reserve a slot.
-- The lock is held just for this transaction, never during the HTTP/AI call.
CREATE FUNCTION public.reserve_ai_completion(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  usage public.ai_completion_usage%ROWTYPE;
  limits public.ai_completion_limits%ROWTYPE;
  today date := (clock_timestamp() AT TIME ZONE 'Europe/Paris')::date;
  active_leases jsonb;
  lease_id uuid := gen_random_uuid();
  next_reset timestamptz := ((today + 1)::timestamp AT TIME ZONE 'Europe/Paris');
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND status='approved') THEN
    RAISE EXCEPTION 'Compte approuvé requis' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT limits FROM public.ai_completion_limits WHERE singleton;
  INSERT INTO public.ai_completion_usage(user_id,usage_day) VALUES(p_user_id,today)
    ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT usage FROM public.ai_completion_usage WHERE user_id=p_user_id FOR UPDATE;
  SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO active_leases
    FROM jsonb_each_text(usage.leases) WHERE value::timestamptz > clock_timestamp();
  IF usage.usage_day <> today THEN usage.requests := 0; END IF;
  IF usage.requests >= limits.daily_limit THEN
    RETURN jsonb_build_object('allowed',false,'reason','daily','limit',limits.daily_limit,'resetAt',next_reset);
  END IF;
  IF (SELECT count(*) FROM jsonb_each(active_leases)) >= limits.concurrent_limit THEN
    RETURN jsonb_build_object('allowed',false,'reason','concurrent');
  END IF;
  UPDATE public.ai_completion_usage SET usage_day=today, requests=usage.requests+1,
    leases=active_leases || jsonb_build_object(lease_id::text,clock_timestamp()+interval '5 minutes')
    WHERE user_id=p_user_id;
  RETURN jsonb_build_object('allowed',true,'leaseId',lease_id);
END;
$$;
CREATE FUNCTION public.release_ai_completion(p_user_id uuid,p_lease_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  UPDATE public.ai_completion_usage SET leases=leases-p_lease_id::text WHERE user_id=p_user_id;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_completion(uuid),public.release_ai_completion(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_completion(uuid),public.release_ai_completion(uuid,uuid) TO service_role;
COMMIT;

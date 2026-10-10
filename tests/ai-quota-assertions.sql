DO $$ BEGIN
  ASSERT NOT has_function_privilege('authenticated','reserve_ai_completion(uuid)','EXECUTE');
  ASSERT NOT has_function_privilege('anon','reserve_ai_completion(uuid)','EXECUTE');
  ASSERT NOT has_table_privilege('authenticated','ai_completion_usage','UPDATE');
END $$;
SET ROLE service_role;
DO $$ DECLARE r jsonb; lease uuid; BEGIN
  r := reserve_ai_completion('00000000-0000-0000-0000-000000000001');
  ASSERT (r->>'allowed')::boolean;
  lease := (r->>'leaseId')::uuid;
  r := reserve_ai_completion('00000000-0000-0000-0000-000000000001');
  ASSERT r->>'reason'='concurrent';
  ASSERT (SELECT requests=1 FROM ai_completion_usage WHERE user_id='00000000-0000-0000-0000-000000000001');
  PERFORM release_ai_completion('00000000-0000-0000-0000-000000000003',lease);
  ASSERT (reserve_ai_completion('00000000-0000-0000-0000-000000000001')->>'reason')='concurrent';
  PERFORM release_ai_completion('00000000-0000-0000-0000-000000000001',lease);
  r := reserve_ai_completion('00000000-0000-0000-0000-000000000001');
  ASSERT (r->>'allowed')::boolean;
  UPDATE ai_completion_limits SET daily_limit=2;
  PERFORM release_ai_completion('00000000-0000-0000-0000-000000000001',(r->>'leaseId')::uuid);
  ASSERT (reserve_ai_completion('00000000-0000-0000-0000-000000000001')->>'reason')='daily';
  UPDATE ai_completion_usage SET usage_day=usage_day-1,leases='{}';
  ASSERT (reserve_ai_completion('00000000-0000-0000-0000-000000000001')->>'allowed')::boolean;
  ASSERT (SELECT requests=1 FROM ai_completion_usage WHERE user_id='00000000-0000-0000-0000-000000000001');
  UPDATE ai_completion_usage SET leases=jsonb_build_object('expired',now()-interval '1 minute');
  ASSERT (reserve_ai_completion('00000000-0000-0000-0000-000000000001')->>'allowed')::boolean;
  BEGIN
    PERFORM reserve_ai_completion('00000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'pending account accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE ai_completion_limits SET daily_limit=50;
  UPDATE ai_completion_usage SET requests=0,leases='{}';
END $$;
RESET ROLE;

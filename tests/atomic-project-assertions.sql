ALTER TABLE projects ADD CONSTRAINT simulated_save_failure CHECK(name <> 'FAIL');
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
DO $$
DECLARE ts timestamptz; result record; before_count integer; after_ts timestamptz;
BEGIN
 SELECT updated_at INTO ts FROM projects LIMIT 1;
 SELECT * INTO result FROM save_project_atomic('10000000-0000-0000-0000-000000000001','Saved','{"projectMeta":{"version":"V1.0"},"marker":"new"}',ts,true,false);
 IF result.version <> 'V1.1' OR jsonb_array_length(result.versions_meta) <> 1 THEN RAISE EXCEPTION 'Version creation failed'; END IF;
 IF (SELECT data->>'marker' FROM project_versions LIMIT 1) <> 'old' THEN RAISE EXCEPTION 'History did not archive previous server data'; END IF;
 BEGIN
  PERFORM save_project_atomic('10000000-0000-0000-0000-000000000001','Stale','{"projectMeta":{"version":"V1.1"}}',ts,true,false);
  RAISE EXCEPTION 'Conflict accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 IF (SELECT count(*) FROM project_versions) <> 1 OR (SELECT name FROM projects LIMIT 1) <> 'Saved' THEN RAISE EXCEPTION 'Conflict modified history/project'; END IF;
 SELECT updated_at INTO ts FROM projects LIMIT 1;
 BEGIN
  PERFORM save_project_atomic('10000000-0000-0000-0000-000000000001','FAIL','{"projectMeta":{"version":"V1.1"}}',ts,true,false);
  RAISE EXCEPTION 'Simulated failure accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF (SELECT count(*) FROM project_versions) <> 1 THEN RAISE EXCEPTION 'Failed project save left snapshot'; END IF;
 SELECT * INTO result FROM save_project_atomic('10000000-0000-0000-0000-000000000001','Auto','{"projectMeta":{"version":"V1.1"}}',ts,false,false);
 IF result.version <> 'V1.1' OR jsonb_array_length(result.versions_meta) <> 1 THEN RAISE EXCEPTION 'Auto-save created version'; END IF;
 BEGIN
  PERFORM save_project_atomic('10000000-0000-0000-0000-000000000001','Missing ref','{"projectMeta":{"version":"V1.1"}}',null,false,false);
  RAISE EXCEPTION 'Missing concurrency reference accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 FOR i IN 1..4 LOOP
  SELECT updated_at INTO ts FROM projects LIMIT 1;
  PERFORM save_project_atomic('10000000-0000-0000-0000-000000000001','Versions','{"projectMeta":{"version":"V1.1"}}',ts,true,false);
 END LOOP;
 IF (SELECT count(*) FROM project_versions) <> 3 THEN RAISE EXCEPTION 'History not pruned'; END IF;
 IF (SELECT data #>> '{projectMeta,version}' FROM projects LIMIT 1) <> 'V1.5' THEN RAISE EXCEPTION 'Version did not advance'; END IF;
END $$;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
DO $$ DECLARE ts timestamptz; r record; BEGIN
 SELECT updated_at INTO ts FROM projects LIMIT 1;
 SELECT * INTO r FROM save_project_atomic('10000000-0000-0000-0000-000000000001','Editor','{"projectMeta":{"version":"V1.5"}}',ts,true,false);
 IF r.version <> 'V1.6' THEN RAISE EXCEPTION 'Shared editor cannot version'; END IF;
END $$;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
DO $$ DECLARE ts timestamptz; r record; BEGIN
 SELECT updated_at INTO ts FROM projects LIMIT 1;
 SELECT * INTO r FROM save_project_atomic('10000000-0000-0000-0000-000000000001','Admin','{"projectMeta":{"version":"V1.6"}}',ts,true,false);
 IF r.version <> 'V1.7' THEN RAISE EXCEPTION 'Admin cannot version'; END IF;
END $$;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
DO $$ BEGIN
 IF (SELECT count(*) FROM project_versions) <> 3 THEN RAISE EXCEPTION 'Viewer cannot read history'; END IF;
 BEGIN
  PERFORM save_project_atomic('10000000-0000-0000-0000-000000000001','Viewer','{"projectMeta":{"version":"V1.7"}}',null,true,true);
  RAISE EXCEPTION 'Viewer modified project';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'Atomic save assertions passed' AS result;

ALTER TABLE projects ADD CONSTRAINT simulated_save_failure CHECK(name <> 'FAIL');
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
DO $$
DECLARE ts timestamptz; result record; before_count integer; after_ts timestamptz;
BEGIN
 SELECT updated_at INTO ts FROM projects LIMIT 1;
 SELECT * INTO result FROM save_project_atomic('10000000-0000-0000-0000-000000000001','Saved','{"projectMeta":{"version":"V1.0"},"marker":"new"}',ts,true,false);
 IF result.version <> 'V1.1' OR jsonb_array_length(result.versions_meta) <> 1 THEN RAISE EXCEPTION 'Version creation failed'; END IF;
 -- Le point de version archive l'état enregistré, sous son propre numéro (et non
 -- l'état précédent du serveur, qui n'est que la dernière sauvegarde automatique).
 IF (SELECT data->>'marker' FROM project_versions LIMIT 1) <> 'new' THEN RAISE EXCEPTION 'History did not archive the saved data'; END IF;
 IF (SELECT version FROM project_versions LIMIT 1) <> 'V1.1' THEN RAISE EXCEPTION 'Snapshot not labelled with its own version'; END IF;
 IF (SELECT data #>> '{projectMeta,version}' FROM project_versions LIMIT 1) <> 'V1.1' THEN RAISE EXCEPTION 'Snapshot data carries a stale version'; END IF;
 IF (result.versions_meta->0->>'version') <> 'V1.1' THEN RAISE EXCEPTION 'Version list not labelled with the saved version'; END IF;
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
 SELECT * INTO result FROM save_project_atomic('10000000-0000-0000-0000-000000000001','Auto','{"projectMeta":{"version":"V1.1"},"marker":"auto"}',ts,false,false);
 IF result.version <> 'V1.1' OR jsonb_array_length(result.versions_meta) <> 1 THEN RAISE EXCEPTION 'Auto-save created version'; END IF;
 -- Une sauvegarde automatique puis un « Enregistrer » : la nouvelle version contient
 -- l'état enregistré, et la version précédente garde le sien.
 SELECT updated_at INTO ts FROM projects LIMIT 1;
 SELECT * INTO result FROM save_project_atomic('10000000-0000-0000-0000-000000000001','Manual','{"projectMeta":{"version":"V1.1"},"marker":"manual"}',ts,true,false);
 IF result.version <> 'V1.2' THEN RAISE EXCEPTION 'Manual save did not advance the version'; END IF;
 IF (SELECT data->>'marker' FROM project_versions WHERE version='V1.2') IS DISTINCT FROM 'manual' THEN RAISE EXCEPTION 'V1.2 snapshot does not hold the manually saved state'; END IF;
 IF (SELECT data->>'marker' FROM project_versions WHERE version='V1.1') IS DISTINCT FROM 'new' THEN RAISE EXCEPTION 'V1.1 snapshot was altered by the auto-save'; END IF;
 BEGIN
  PERFORM save_project_atomic('10000000-0000-0000-0000-000000000001','Missing ref','{"projectMeta":{"version":"V1.1"}}',null,false,false);
  RAISE EXCEPTION 'Missing concurrency reference accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 FOR i IN 1..4 LOOP
  SELECT updated_at INTO ts FROM projects LIMIT 1;
  PERFORM save_project_atomic('10000000-0000-0000-0000-000000000001','Versions','{"projectMeta":{"version":"V1.1"}}',ts,true,false);
 END LOOP;
 IF (SELECT count(*) FROM project_versions) <> 3 THEN RAISE EXCEPTION 'History not pruned'; END IF;
 IF (SELECT data #>> '{projectMeta,version}' FROM projects LIMIT 1) <> 'V1.6' THEN RAISE EXCEPTION 'Version did not advance'; END IF;
END $$;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
DO $$ DECLARE ts timestamptz; r record; BEGIN
 SELECT updated_at INTO ts FROM projects LIMIT 1;
 SELECT * INTO r FROM save_project_atomic('10000000-0000-0000-0000-000000000001','Editor','{"projectMeta":{"version":"V1.6"}}',ts,true,false);
 IF r.version <> 'V1.7' THEN RAISE EXCEPTION 'Shared editor cannot version'; END IF;
END $$;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
DO $$ DECLARE ts timestamptz; r record; BEGIN
 SELECT updated_at INTO ts FROM projects LIMIT 1;
 SELECT * INTO r FROM save_project_atomic('10000000-0000-0000-0000-000000000001','Admin','{"projectMeta":{"version":"V1.7"}}',ts,true,false);
 IF r.version <> 'V1.8' THEN RAISE EXCEPTION 'Admin cannot version'; END IF;
END $$;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
DO $$ BEGIN
 IF (SELECT count(*) FROM project_versions) <> 3 THEN RAISE EXCEPTION 'Viewer cannot read history'; END IF;
 BEGIN
  PERFORM save_project_atomic('10000000-0000-0000-0000-000000000001','Viewer','{"projectMeta":{"version":"V1.8"}}',null,true,true);
  RAISE EXCEPTION 'Viewer modified project';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'Atomic save assertions passed' AS result;

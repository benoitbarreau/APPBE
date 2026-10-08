SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
DO $$
DECLARE n integer;
BEGIN
  UPDATE projects SET name='Edited' WHERE id=1;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Editor cannot update project content'; END IF;
  BEGIN
    UPDATE projects SET user_id='00000000-0000-0000-0000-000000000002' WHERE id=1;
    RAISE EXCEPTION 'Editor changed project owner';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE storage.objects SET name='own-updated.pdf' WHERE id=1;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Uploader cannot update own PDF'; END IF;
  UPDATE storage.objects SET name='stolen.pdf' WHERE id=2;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'Uploader changed another PDF'; END IF;
  DELETE FROM storage.objects WHERE id IN (2,3);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'Uploader deleted another PDF'; END IF;
  BEGIN
    UPDATE storage.objects SET owner_id='00000000-0000-0000-0000-000000000002' WHERE id=1;
    RAISE EXCEPTION 'Uploader reassigned PDF ownership';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO storage.objects(bucket_id,owner_id,name) VALUES ('product-datasheets',auth.uid()::text,'new.pdf');
  BEGIN
    INSERT INTO storage.objects(bucket_id,owner_id,name) VALUES ('product-datasheets','00000000-0000-0000-0000-000000000002','forged.pdf');
    RAISE EXCEPTION 'Uploader forged PDF ownership';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    INSERT INTO storage.objects(bucket_id,owner_id,name) VALUES ('product-datasheets',auth.uid()::text,'pending.pdf');
    RAISE EXCEPTION 'Pending user uploaded a PDF';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE storage.objects SET name='pending-change.pdf';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'Pending user updated PDF'; END IF;
END $$;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
DO $$
DECLARE n integer;
BEGIN
  UPDATE projects SET user_id='00000000-0000-0000-0000-000000000002' WHERE id=1;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Admin cannot transfer project'; END IF;
  UPDATE storage.objects SET name='admin-updated.pdf' WHERE id IN (2,3);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n<>2 THEN RAISE EXCEPTION 'Admin cannot update others or ownerless PDF'; END IF;
  DELETE FROM storage.objects WHERE id=2;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Admin cannot delete another PDF'; END IF;
END $$;
RESET ROLE;
SELECT 'Security assertions passed' AS result;

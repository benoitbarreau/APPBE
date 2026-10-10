INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-000000000001','owner@example.test'),('00000000-0000-0000-0000-000000000002','manager@example.test'),
 ('00000000-0000-0000-0000-000000000003','admin@example.test'),('00000000-0000-0000-0000-000000000004','pending@example.test');
INSERT INTO profiles(id,email,role,status) VALUES
 ('00000000-0000-0000-0000-000000000001','owner@example.test','user','approved'),
 ('00000000-0000-0000-0000-000000000002','manager@example.test','user','approved'),
 ('00000000-0000-0000-0000-000000000003','admin@example.test','admin','approved'),
 ('00000000-0000-0000-0000-000000000004','pending@example.test','user','pending')
 ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,status=EXCLUDED.status;
INSERT INTO clients(id,user_id,name,account_manager_id) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Assigned','00000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Other',null);
INSERT INTO sites(id,client_id,name) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Assigned site'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Other site');
INSERT INTO rooms(id,site_id,name) VALUES
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Assigned room'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Other room');
INSERT INTO contacts(id,entity_type,entity_id,first_name,last_name) VALUES
 ('40000000-0000-0000-0000-000000000001','client','10000000-0000-0000-0000-000000000001','Assigned','Contact'),
 ('40000000-0000-0000-0000-000000000002','client','10000000-0000-0000-0000-000000000002','Other','Contact');
INSERT INTO ref_documents(id,entity_type,entity_id,name,doc_type) VALUES
 ('50000000-0000-0000-0000-000000000001','room','30000000-0000-0000-0000-000000000001','Assigned PDF','pdf'),
 ('50000000-0000-0000-0000-000000000002','room','30000000-0000-0000-0000-000000000002','Other PDF','pdf');
INSERT INTO storage.objects(bucket_id,name) VALUES
 ('ref-documents','00000000-0000-0000-0000-000000000001/room/30000000-0000-0000-0000-000000000001/file.pdf'),
 ('ref-documents','00000000-0000-0000-0000-000000000001/room/30000000-0000-0000-0000-000000000002/file.pdf');
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
DO $$ DECLARE affected integer; BEGIN
 ASSERT (SELECT count(*)=1 FROM clients);
 ASSERT (SELECT count(*)=1 FROM sites);
 ASSERT (SELECT count(*)=1 FROM rooms);
 ASSERT (SELECT count(*)=1 FROM contacts);
 ASSERT (SELECT count(*)=1 FROM ref_documents);
 ASSERT (SELECT count(*)=1 FROM storage.objects WHERE bucket_id='ref-documents');
 UPDATE sites SET name='Edited' WHERE id='20000000-0000-0000-0000-000000000001';
 GET DIAGNOSTICS affected=ROW_COUNT; ASSERT affected=1;
 INSERT INTO sites(client_id,name) VALUES('10000000-0000-0000-0000-000000000001','New');
 DELETE FROM sites WHERE name='New';
 UPDATE rooms SET name='Edited room' WHERE id='30000000-0000-0000-0000-000000000001';
 GET DIAGNOSTICS affected=ROW_COUNT; ASSERT affected=1;
 UPDATE contacts SET first_name='Edited contact' WHERE id='40000000-0000-0000-0000-000000000001';
 GET DIAGNOSTICS affected=ROW_COUNT; ASSERT affected=1;
 INSERT INTO room_contacts(room_id,contact_id) VALUES('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001');
 ASSERT (SELECT count(*)=1 FROM room_contacts);
 DELETE FROM room_contacts;
 INSERT INTO ref_documents(entity_type,entity_id,name,doc_type) VALUES('room','30000000-0000-0000-0000-000000000001','New document','link');
 DELETE FROM ref_documents WHERE name='New document';
 INSERT INTO storage.objects(bucket_id,name) VALUES('ref-documents','00000000-0000-0000-0000-000000000002/room/30000000-0000-0000-0000-000000000001/upload.pdf');
 DELETE FROM storage.objects WHERE name LIKE '%upload.pdf';
 BEGIN
  UPDATE sites SET client_id='10000000-0000-0000-0000-000000000002' WHERE id='20000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'Cross-client site transfer accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE clients SET user_id='00000000-0000-0000-0000-000000000002' WHERE id='10000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'Client ownership transfer accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO room_contacts(room_id,contact_id) VALUES('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'Foreign contact accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES('ref-documents','00000000-0000-0000-0000-000000000002/room/30000000-0000-0000-0000-000000000002/forbidden.pdf');
  RAISE EXCEPTION 'Foreign file accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM assign_client_manager('10000000-0000-0000-0000-000000000002',NULL);
  RAISE EXCEPTION 'Unassigned client reassignment accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM assign_client_manager('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004');
  RAISE EXCEPTION 'Pending manager accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 ASSERT NOT can_manage_ref_file('stranger/room/not-a-uuid/file.pdf');
END $$;
-- The manager may reassign the account, but instantly loses hierarchical access.
SELECT assign_client_manager('10000000-0000-0000-0000-000000000001',NULL);
DO $$ BEGIN ASSERT (SELECT count(*)=0 FROM sites); ASSERT (SELECT count(*)=0 FROM storage.objects); END $$;
RESET ROLE;
UPDATE clients SET account_manager_id='00000000-0000-0000-0000-000000000004' WHERE id='10000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000004';
DO $$ BEGIN ASSERT (SELECT count(*)=0 FROM clients); ASSERT (SELECT count(*)=0 FROM sites); ASSERT (SELECT count(*)=0 FROM storage.objects); END $$;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
DO $$ BEGIN ASSERT (SELECT count(*)=2 FROM clients); ASSERT (SELECT count(*)=2 FROM sites); ASSERT (SELECT count(*)=2 FROM contacts); ASSERT (SELECT count(*)=2 FROM storage.objects); END $$;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
DO $$ BEGIN ASSERT (SELECT count(*)=2 FROM clients); ASSERT (SELECT count(*)=2 FROM rooms); ASSERT (SELECT count(*)=2 FROM storage.objects); END $$;
RESET ROLE;

DO $$ BEGIN
 ASSERT (SELECT count(*)=4 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'ref_storage_%');
 ASSERT (SELECT NOT public AND file_size_limit=52428800 FROM storage.buckets WHERE id='ref-documents');
 ASSERT to_regprocedure('public.save_project_atomic(uuid,text,jsonb,timestamp with time zone,boolean,boolean)') IS NOT NULL;
 ASSERT to_regprocedure('public.reserve_ai_completion(uuid)') IS NOT NULL;
 ASSERT (SELECT daily_limit=50 AND concurrent_limit=1 FROM public.ai_completion_limits);
 ASSERT NOT EXISTS(SELECT FROM vault.secrets WHERE name='synox_notification_webhook_url');
 ASSERT (SELECT count(*)=1 FROM vault.secrets WHERE name='synox_notification_webhook_token');
END $$;

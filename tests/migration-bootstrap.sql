-- Disposable database only: minimal Auth/Storage contracts used by our SQL.
-- PostgreSQL, pg_net, pgcrypto and Vault are real extensions, not mocks.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text,
 raw_user_meta_data jsonb DEFAULT '{}', last_sign_in_at timestamptz
);
DO $$ BEGIN
 IF to_regprocedure('auth.uid()') IS NULL THEN
  EXECUTE $definition$CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $body$
   SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $body$ $definition$;
 END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
 id text PRIMARY KEY,name text NOT NULL,public boolean DEFAULT false,
 file_size_limit bigint,allowed_mime_types text[]
);
-- The database image has the initial Storage schema; the service normally adds
-- these columns in its own migrations. Complete the current application contract.
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS public boolean DEFAULT false;
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS file_size_limit bigint;
ALTER TABLE storage.buckets ADD COLUMN IF NOT EXISTS allowed_mime_types text[];
CREATE TABLE IF NOT EXISTS storage.objects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id),
 name text NOT NULL,owner_id text
);
ALTER TABLE storage.objects ADD COLUMN IF NOT EXISTS owner_id text;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF to_regprocedure('storage.foldername(text)') IS NULL THEN
  EXECUTE $definition$CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $body$
   SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]
  $body$ $definition$;
 END IF;
END $$;

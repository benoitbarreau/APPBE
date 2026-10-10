BEGIN;

-- Generate the dedicated token inside PostgreSQL; it never leaves Vault.
DO $$
DECLARE
  project_url text := nullif(current_setting('app.supabase_url', true), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'synox_notification_webhook_token') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'synox_notification_webhook_token',
      'Dedicated SynoX registration notification webhook token'
    );
  END IF;
  -- Fresh installations must never send events to another project's endpoint.
  -- An existing Vault URL is preserved; otherwise use the explicitly configured project.
  IF project_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'synox_notification_webhook_url') THEN
    PERFORM vault.create_secret(
      rtrim(project_url, '/') || '/functions/v1/notify-admin-new-user',
      'synox_notification_webhook_url',
      'SynoX notification endpoint; update when installing on another project'
    );
  END IF;
END;
$$;

-- The server can verify a token, but this RPC never returns the stored secret.
CREATE OR REPLACE FUNCTION public.verify_notification_webhook_token(p_token text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT length(p_token) = 64 AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'synox_notification_webhook_token'
      AND decrypted_secret = p_token
  );
$$;
REVOKE ALL ON FUNCTION public.verify_notification_webhook_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_notification_webhook_token(text) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_admin_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  endpoint text;
  webhook_token text;
BEGIN
  SELECT decrypted_secret INTO endpoint FROM vault.decrypted_secrets
    WHERE name = 'synox_notification_webhook_url';
  SELECT decrypted_secret INTO webhook_token FROM vault.decrypted_secrets
    WHERE name = 'synox_notification_webhook_token';
  IF endpoint IS NULL OR webhook_token IS NULL THEN
    RAISE WARNING '[notify_admin] Notification Vault configuration missing';
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-synox-webhook-secret', webhook_token),
    body := jsonb_build_object('record', row_to_json(NEW)),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Do not log SQLERRM: it could contain request headers or the token.
  RAISE WARNING '[notify_admin] Notification request failed (%)', SQLSTATE;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_admin_new_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_new_profile_notify_admin ON public.profiles;
CREATE TRIGGER on_new_profile_notify_admin
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_admin_new_profile();

COMMIT;

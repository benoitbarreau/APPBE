-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 012 : Notification admin à chaque nouvelle inscription
-- ─────────────────────────────────────────────────────────────────────────────
--
-- PRÉREQUIS : exécuter d'abord dans le SQL Editor du Dashboard Supabase
-- (ces valeurs ne sont PAS dans Git pour des raisons de sécurité) :
--
--   ALTER DATABASE postgres
--     SET app.supabase_url      = 'https://VOTRE_REF.supabase.co';
--   ALTER DATABASE postgres
--     SET app.service_role_key  = 'VOTRE_SERVICE_ROLE_KEY';
--
-- Vous retrouvez ces valeurs dans Dashboard → Project Settings → API.
-- ─────────────────────────────────────────────────────────────────────────────

-- Activer pg_net si pas encore activé (déjà inclus dans tous les projets Supabase)
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Fonction déclenchée après chaque INSERT dans profiles
CREATE OR REPLACE FUNCTION public.notify_admin_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url  text := current_setting('app.supabase_url',     true);
  _key  text := current_setting('app.service_role_key', true);
BEGIN
  -- Si les settings ne sont pas configurés, on avertit sans bloquer l'INSERT
  IF _url IS NULL OR _url = '' OR _key IS NULL OR _key = '' THEN
    RAISE WARNING '[notify_admin] app.supabase_url ou app.service_role_key non défini — notification ignorée';
    RETURN NEW;
  END IF;

  -- Appel non-bloquant vers la Edge Function (pg_net est dans le schéma net)
  PERFORM net.http_post(
    url     := _url || '/functions/v1/notify-admin-new-user',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || _key
               ),
    body    := jsonb_build_object('record', row_to_json(NEW))
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ne jamais bloquer l'inscription si la notification échoue
  RAISE WARNING '[notify_admin] Échec de la notification : %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Déclencheur AFTER INSERT sur profiles
DROP TRIGGER IF EXISTS on_new_profile_notify_admin ON public.profiles;

CREATE TRIGGER on_new_profile_notify_admin
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_new_profile();

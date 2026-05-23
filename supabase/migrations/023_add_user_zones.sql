-- ── Migration 023 : Ajout de la table user_zones ─────────────────────────────
-- La table user_zones était prévue dans 010_user_signals_zones.sql.
-- Ce fichier est entièrement idempotent (IF NOT EXISTS / DROP IF EXISTS)
-- et peut être réexécuté sans erreur même si la table existe déjà.
--
-- Même architecture que user_signals : catalogue partagé entre tous les
-- utilisateurs approuvés (zones physiques / couleurs des blocs du synoptique).

CREATE TABLE IF NOT EXISTS public.user_zones (
  id           text        PRIMARY KEY,  -- = zone id ex: "BAIE", "REGIE"
  user_id      uuid        REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  zone_data    jsonb       NOT NULL,
  created_at   timestamptz DEFAULT now() NOT NULL,
  updated_at   timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS user_zones_user_id_idx ON public.user_zones(user_id);

ALTER TABLE public.user_zones ENABLE ROW LEVEL SECURITY;

-- Accès pour tous les utilisateurs approuvés (même logique que user_signals)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_zones'
    AND policyname = 'team_zones_access'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "team_zones_access" ON public.user_zones
        FOR ALL
        USING (
          EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
        )
        WITH CHECK (
          EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
        )
    $pol$;
  END IF;
END$$;

DROP TRIGGER IF EXISTS user_zones_updated_at ON public.user_zones;
CREATE TRIGGER user_zones_updated_at
  BEFORE UPDATE ON public.user_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Catalogue global signaux + zones (partagé équipe) ─────────────────────
-- Même architecture que user_products : données partagées entre tous les
-- utilisateurs approuvés, last-write-wins par ID.

-- ── Signaux (types de câbles / légende) ───────────────────────────────────
CREATE TABLE public.user_signals (
  id           text        PRIMARY KEY,  -- = signal id ex: "AUDIO", "VIDEO"
  user_id      uuid        REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  signal_data  jsonb       NOT NULL,     -- SignalDef sérialisé
  created_at   timestamptz DEFAULT now() NOT NULL,
  updated_at   timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX user_signals_user_id_idx ON public.user_signals(user_id);

ALTER TABLE public.user_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_signals_access" ON public.user_signals
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
  );

CREATE TRIGGER user_signals_updated_at
  BEFORE UPDATE ON public.user_signals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Zones (zones physiques / couleurs des blocs) ───────────────────────────
CREATE TABLE public.user_zones (
  id           text        PRIMARY KEY,  -- = zone id ex: "BAIE", "REGIE"
  user_id      uuid        REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  zone_data    jsonb       NOT NULL,     -- Zone sérialisé
  created_at   timestamptz DEFAULT now() NOT NULL,
  updated_at   timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX user_zones_user_id_idx ON public.user_zones(user_id);

ALTER TABLE public.user_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_zones_access" ON public.user_zones
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
  );

CREATE TRIGGER user_zones_updated_at
  BEFORE UPDATE ON public.user_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

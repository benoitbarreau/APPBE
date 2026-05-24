-- Migration 024: Journal d'activité admin
-- Table pour tracer toutes les actions effectuées par les administrateurs

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  action       TEXT        NOT NULL,
  target_id    UUID,
  target_label TEXT,
  details      JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- Seuls les admins peuvent lire les logs
DROP POLICY IF EXISTS admin_logs_select ON public.admin_logs;
CREATE POLICY admin_logs_select ON public.admin_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Seuls les admins peuvent insérer des logs
DROP POLICY IF EXISTS admin_logs_insert ON public.admin_logs;
CREATE POLICY admin_logs_insert ON public.admin_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Index pour requêtes rapides (ordre chronologique inverse)
CREATE INDEX IF NOT EXISTS admin_logs_created_at_idx ON public.admin_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_logs_admin_id_idx   ON public.admin_logs (admin_id);

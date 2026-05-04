-- ── Cloud project storage ─────────────────────────────────────────────────

CREATE TABLE public.projects (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name       text        NOT NULL DEFAULT 'Sans titre',
  data       jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX projects_user_id_idx ON public.projects(user_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own projects
CREATE POLICY "users_own_projects" ON public.projects
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can see and manage all projects
CREATE POLICY "admins_all_projects" ON public.projects
  FOR ALL
  USING  (public.is_admin());

-- Auto-update updated_at on any row modification
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

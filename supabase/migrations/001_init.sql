-- Enum types
CREATE TYPE user_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE user_role   AS ENUM ('admin', 'user');

-- Profiles table
CREATE TABLE public.profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email      TEXT        NOT NULL,
  full_name  TEXT,
  status     user_status NOT NULL DEFAULT 'pending',
  role       user_role   NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helper — avoids infinite RLS recursion when admins
-- query the profiles table from within a policy.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Read: own row OR admin
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR is_admin());

-- Insert: own row only (called by trigger on signup)
CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Update: admin only (validate / reject / change role)
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- Trigger: auto-create profile on new Supabase Auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

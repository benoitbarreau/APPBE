CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,status text);
INSERT INTO profiles VALUES
 ('00000000-0000-0000-0000-000000000001','user','approved'),
 ('00000000-0000-0000-0000-000000000002','user','approved'),
 ('00000000-0000-0000-0000-000000000003','admin','approved'),
 ('00000000-0000-0000-0000-000000000004','user','approved');
CREATE TABLE projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,name text,data jsonb,updated_at timestamptz DEFAULT now(),versions_meta jsonb DEFAULT '[]',client_name text,lieu text);
CREATE TABLE project_shares(project_id uuid,user_id uuid,role text);
CREATE TABLE project_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES projects(id),version text,saved_at timestamptz DEFAULT now(),data jsonb NOT NULL);
CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') $$;
CREATE FUNCTION is_approved_user() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND status='approved') $$;
CREATE FUNCTION is_project_owner(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1 AND user_id=auth.uid()) $$;
CREATE FUNCTION is_shared_with_me(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM project_shares WHERE project_id=$1 AND user_id=auth.uid()) $$;
CREATE FUNCTION is_shared_editor(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM project_shares WHERE project_id=$1 AND user_id=auth.uid() AND role='editor') $$;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_read ON projects FOR SELECT USING(is_admin() OR is_project_owner(id) OR is_shared_with_me(id));
CREATE POLICY project_edit ON projects FOR UPDATE USING(is_admin() OR is_project_owner(id) OR is_shared_editor(id));
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER updated BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
INSERT INTO projects(id,user_id,name,data) VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Initial','{"projectMeta":{"version":"V1.0"},"marker":"old"}');
INSERT INTO project_shares VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','editor'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','viewer');
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT,UPDATE ON projects TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON project_versions TO authenticated;

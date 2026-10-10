CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text);
INSERT INTO profiles VALUES('00000000-0000-0000-0000-000000000001','approved'),('00000000-0000-0000-0000-000000000002','pending'),('00000000-0000-0000-0000-000000000003','approved');
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
GRANT SELECT ON profiles TO service_role;

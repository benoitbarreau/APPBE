-- ── Migration 016 : Module Référentiel ──────────────────────────────────────
-- Clients → Sites → Salles + Documents attachés + liaison projets SynoX
-- Appliquer via : Supabase Dashboard > SQL Editor

-- ── Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        TEXT        NOT NULL,
  code        TEXT,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id   UUID        REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  name        TEXT        NOT NULL,
  address     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id     UUID        REFERENCES sites(id) ON DELETE CASCADE NOT NULL,
  name        TEXT        NOT NULL,
  type        TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- doc_type : 'pdf' | 'image' | 'link' | 'project_export'
-- entity_type : 'client' | 'site' | 'room'
CREATE TABLE IF NOT EXISTS ref_documents (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type   TEXT        NOT NULL CHECK (entity_type IN ('client', 'site', 'room')),
  entity_id     UUID        NOT NULL,
  name          TEXT        NOT NULL,
  doc_type      TEXT        NOT NULL CHECK (doc_type IN ('pdf', 'image', 'link', 'project_export')),
  url           TEXT,
  storage_path  TEXT,
  file_size     BIGINT,
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Liaison projets SynoX ↔ salles
ALTER TABLE projects ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;

-- ── Index ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS clients_user_id_idx       ON clients(user_id);
CREATE INDEX IF NOT EXISTS sites_client_id_idx       ON sites(client_id);
CREATE INDEX IF NOT EXISTS rooms_site_id_idx         ON rooms(site_id);
CREATE INDEX IF NOT EXISTS ref_docs_entity_idx       ON ref_documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS projects_room_id_idx      ON projects(room_id);

-- ── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE clients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_documents ENABLE ROW LEVEL SECURITY;

-- Clients : propriétaire
CREATE POLICY "clients_select_own" ON clients FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "clients_insert_own" ON clients FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "clients_update_own" ON clients FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "clients_delete_own" ON clients FOR DELETE
  USING (user_id = auth.uid());

-- Clients : admin voit tout
CREATE POLICY "clients_admin" ON clients FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Sites : accès via client (ownership chain)
CREATE POLICY "sites_select_own" ON sites FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = sites.client_id AND c.user_id = auth.uid()));
CREATE POLICY "sites_insert_own" ON sites FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients c WHERE c.id = sites.client_id AND c.user_id = auth.uid()));
CREATE POLICY "sites_update_own" ON sites FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = sites.client_id AND c.user_id = auth.uid()));
CREATE POLICY "sites_delete_own" ON sites FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = sites.client_id AND c.user_id = auth.uid()));
CREATE POLICY "sites_admin" ON sites FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Rooms : accès via site → client
CREATE POLICY "rooms_select_own" ON rooms FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sites s JOIN clients c ON c.id = s.client_id
    WHERE s.id = rooms.site_id AND c.user_id = auth.uid()
  ));
CREATE POLICY "rooms_insert_own" ON rooms FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM sites s JOIN clients c ON c.id = s.client_id
    WHERE s.id = rooms.site_id AND c.user_id = auth.uid()
  ));
CREATE POLICY "rooms_update_own" ON rooms FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM sites s JOIN clients c ON c.id = s.client_id
    WHERE s.id = rooms.site_id AND c.user_id = auth.uid()
  ));
CREATE POLICY "rooms_delete_own" ON rooms FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM sites s JOIN clients c ON c.id = s.client_id
    WHERE s.id = rooms.site_id AND c.user_id = auth.uid()
  ));
CREATE POLICY "rooms_admin" ON rooms FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ref_documents : accès via chaîne d'ownership
CREATE POLICY "ref_documents_select_own" ON ref_documents FOR SELECT
  USING (
    CASE entity_type
      WHEN 'client' THEN
        EXISTS (SELECT 1 FROM clients c WHERE c.id = ref_documents.entity_id AND c.user_id = auth.uid())
      WHEN 'site' THEN
        EXISTS (SELECT 1 FROM sites s JOIN clients c ON c.id = s.client_id WHERE s.id = ref_documents.entity_id AND c.user_id = auth.uid())
      WHEN 'room' THEN
        EXISTS (SELECT 1 FROM rooms r JOIN sites s ON s.id = r.site_id JOIN clients c ON c.id = s.client_id WHERE r.id = ref_documents.entity_id AND c.user_id = auth.uid())
      ELSE false
    END
  );
CREATE POLICY "ref_documents_insert_own" ON ref_documents FOR INSERT
  WITH CHECK (
    CASE entity_type
      WHEN 'client' THEN
        EXISTS (SELECT 1 FROM clients c WHERE c.id = ref_documents.entity_id AND c.user_id = auth.uid())
      WHEN 'site' THEN
        EXISTS (SELECT 1 FROM sites s JOIN clients c ON c.id = s.client_id WHERE s.id = ref_documents.entity_id AND c.user_id = auth.uid())
      WHEN 'room' THEN
        EXISTS (SELECT 1 FROM rooms r JOIN sites s ON s.id = r.site_id JOIN clients c ON c.id = s.client_id WHERE r.id = ref_documents.entity_id AND c.user_id = auth.uid())
      ELSE false
    END
  );
CREATE POLICY "ref_documents_delete_own" ON ref_documents FOR DELETE
  USING (
    CASE entity_type
      WHEN 'client' THEN
        EXISTS (SELECT 1 FROM clients c WHERE c.id = ref_documents.entity_id AND c.user_id = auth.uid())
      WHEN 'site' THEN
        EXISTS (SELECT 1 FROM sites s JOIN clients c ON c.id = s.client_id WHERE s.id = ref_documents.entity_id AND c.user_id = auth.uid())
      WHEN 'room' THEN
        EXISTS (SELECT 1 FROM rooms r JOIN sites s ON s.id = r.site_id JOIN clients c ON c.id = s.client_id WHERE r.id = ref_documents.entity_id AND c.user_id = auth.uid())
      ELSE false
    END
  );
CREATE POLICY "ref_documents_admin" ON ref_documents FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- ── Storage bucket ref-documents ──────────────────────────────────────────
-- À créer manuellement dans Supabase Dashboard > Storage > New bucket
-- Nom : "ref-documents"  |  Public : NON  |  Max file size : 50 MB
-- Policy suggérée : authenticated users can insert/select their own files
-- (chemin : {user_id}/{entity_type}/{entity_id}/{filename})

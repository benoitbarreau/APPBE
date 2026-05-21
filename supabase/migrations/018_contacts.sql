-- ── Migration 018 : Contacts (rattachés aux sites et aux salles) ─────────────

CREATE TABLE IF NOT EXISTS contacts (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type  TEXT        NOT NULL CHECK (entity_type IN ('site', 'room')),
  entity_id    UUID        NOT NULL,
  first_name   TEXT        NOT NULL,
  last_name    TEXT        NOT NULL,
  role         TEXT,
  phone        TEXT,
  email        TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS contacts_entity_idx ON contacts(entity_type, entity_id);

-- ── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Accès via la chaîne site → client (user_id)
CREATE POLICY "contacts_select_own" ON contacts FOR SELECT
  USING (
    CASE entity_type
      WHEN 'site' THEN
        EXISTS (
          SELECT 1 FROM sites s JOIN clients c ON c.id = s.client_id
          WHERE s.id = contacts.entity_id AND c.user_id = auth.uid()
        )
      WHEN 'room' THEN
        EXISTS (
          SELECT 1 FROM rooms r
          JOIN sites s ON s.id = r.site_id
          JOIN clients c ON c.id = s.client_id
          WHERE r.id = contacts.entity_id AND c.user_id = auth.uid()
        )
      ELSE false
    END
  );

CREATE POLICY "contacts_insert_own" ON contacts FOR INSERT
  WITH CHECK (
    CASE entity_type
      WHEN 'site' THEN
        EXISTS (
          SELECT 1 FROM sites s JOIN clients c ON c.id = s.client_id
          WHERE s.id = contacts.entity_id AND c.user_id = auth.uid()
        )
      WHEN 'room' THEN
        EXISTS (
          SELECT 1 FROM rooms r
          JOIN sites s ON s.id = r.site_id
          JOIN clients c ON c.id = s.client_id
          WHERE r.id = contacts.entity_id AND c.user_id = auth.uid()
        )
      ELSE false
    END
  );

CREATE POLICY "contacts_update_own" ON contacts FOR UPDATE
  USING (
    CASE entity_type
      WHEN 'site' THEN
        EXISTS (
          SELECT 1 FROM sites s JOIN clients c ON c.id = s.client_id
          WHERE s.id = contacts.entity_id AND c.user_id = auth.uid()
        )
      WHEN 'room' THEN
        EXISTS (
          SELECT 1 FROM rooms r
          JOIN sites s ON s.id = r.site_id
          JOIN clients c ON c.id = s.client_id
          WHERE r.id = contacts.entity_id AND c.user_id = auth.uid()
        )
      ELSE false
    END
  );

CREATE POLICY "contacts_delete_own" ON contacts FOR DELETE
  USING (
    CASE entity_type
      WHEN 'site' THEN
        EXISTS (
          SELECT 1 FROM sites s JOIN clients c ON c.id = s.client_id
          WHERE s.id = contacts.entity_id AND c.user_id = auth.uid()
        )
      WHEN 'room' THEN
        EXISTS (
          SELECT 1 FROM rooms r
          JOIN sites s ON s.id = r.site_id
          JOIN clients c ON c.id = s.client_id
          WHERE r.id = contacts.entity_id AND c.user_id = auth.uid()
        )
      ELSE false
    END
  );

CREATE POLICY "contacts_admin" ON contacts FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

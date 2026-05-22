-- ── Migration 020 : Contacts au niveau client + liaison salle ↔ contact ──────

-- 1. Étendre la contrainte entity_type pour autoriser 'client'
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_entity_type_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_entity_type_check
  CHECK (entity_type IN ('client', 'site', 'room'));

-- 2. Table de liaison many-to-many salle ↔ contact
CREATE TABLE IF NOT EXISTS room_contacts (
  room_id     UUID REFERENCES rooms(id)    ON DELETE CASCADE,
  contact_id  UUID REFERENCES contacts(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, contact_id)
);

ALTER TABLE room_contacts ENABLE ROW LEVEL SECURITY;

-- Lecture : propriété via la chaîne rooms → sites → clients
CREATE POLICY "room_contacts_select_own" ON room_contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rooms r
      JOIN sites s ON s.id = r.site_id
      JOIN clients c ON c.id = s.client_id
      WHERE r.id = room_contacts.room_id
        AND c.user_id = auth.uid()
    )
  );

-- Insertion
CREATE POLICY "room_contacts_insert_own" ON room_contacts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rooms r
      JOIN sites s ON s.id = r.site_id
      JOIN clients c ON c.id = s.client_id
      WHERE r.id = room_contacts.room_id
        AND c.user_id = auth.uid()
    )
  );

-- Suppression
CREATE POLICY "room_contacts_delete_own" ON room_contacts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM rooms r
      JOIN sites s ON s.id = r.site_id
      JOIN clients c ON c.id = s.client_id
      WHERE r.id = room_contacts.room_id
        AND c.user_id = auth.uid()
    )
  );

-- Admin : accès total
CREATE POLICY "room_contacts_admin" ON room_contacts FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

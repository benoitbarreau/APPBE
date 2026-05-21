-- ── Migration 019 : Logo client + liaison projet ↔ salle ─────────────────────

-- Colonnes logo sur la table clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS logo_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS logo_url          TEXT;

-- Bucket public pour les logos clients (pas besoin d'URL signée)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-logos',
  'client-logos',
  true,           -- public : les logos sont visibles sans authentification
  5242880,        -- 5 Mo max
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Policy : chaque utilisateur gère ses propres logos
CREATE POLICY "client_logos_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'client-logos');  -- public en lecture

CREATE POLICY "client_logos_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'client-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "client_logos_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'client-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "client_logos_admin" ON storage.objects FOR ALL
  USING (
    bucket_id = 'client-logos'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

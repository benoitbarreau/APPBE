-- ── Migration 017 : Bucket Storage pour le module Référentiel ────────────────
-- À exécuter UNIQUEMENT si tu as déjà lancé 016_referentiel.sql
-- (016 a créé les tables et les policies — ce fichier ajoute seulement le bucket)

-- Crée le bucket ref-documents (privé, 50 Mo max)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ref-documents',
  'ref-documents',
  false,
  52428800,
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/json']
)
ON CONFLICT (id) DO NOTHING;

-- Chaque utilisateur ne voit que ses propres fichiers (chemin : {user_id}/…)
CREATE POLICY "ref_storage_select" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'ref-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "ref_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ref-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "ref_storage_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'ref-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Les admins ont accès à tous les fichiers du bucket
CREATE POLICY "ref_storage_admin" ON storage.objects FOR ALL
  USING (
    bucket_id = 'ref-documents'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

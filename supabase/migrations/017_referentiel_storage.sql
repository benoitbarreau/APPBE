-- ── Migration 017 : Bucket Storage pour le module Référentiel ────────────────
-- À exécuter UNIQUEMENT si tu as déjà lancé 016_referentiel.sql
-- 016 crée déjà le bucket et les quatre policies. Cette migration historique
-- garantit uniquement la présence du bucket, sans recréer ni modifier les droits.

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

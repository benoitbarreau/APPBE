-- Migration 025: bucket Supabase Storage pour les fiches techniques PDF produits

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-datasheets',
  'product-datasheets',
  true,
  20971520,   -- 20 Mo max par fichier
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Lecture publique (lien direct dans la fiche produit)
DROP POLICY IF EXISTS "product-datasheets read"   ON storage.objects;
CREATE POLICY "product-datasheets read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'product-datasheets');

-- Upload réservé aux utilisateurs authentifiés
DROP POLICY IF EXISTS "product-datasheets upload" ON storage.objects;
CREATE POLICY "product-datasheets upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-datasheets');

-- Mise à jour (upsert) par les utilisateurs authentifiés
DROP POLICY IF EXISTS "product-datasheets update" ON storage.objects;
CREATE POLICY "product-datasheets update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-datasheets');

-- Suppression par les utilisateurs authentifiés
DROP POLICY IF EXISTS "product-datasheets delete" ON storage.objects;
CREATE POLICY "product-datasheets delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-datasheets');

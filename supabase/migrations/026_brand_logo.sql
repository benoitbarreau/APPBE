-- 026_brand_logo.sql
-- Ajoute un champ logo à la table catalog_brands
-- Le logo peut être une URL externe (https://...) ou un data-URL base64

ALTER TABLE catalog_brands ADD COLUMN IF NOT EXISTS logo TEXT;

COMMENT ON COLUMN catalog_brands.logo IS
  'Logo de la marque : URL externe ou data-URL base64 (image/png, image/svg+xml, etc.)';

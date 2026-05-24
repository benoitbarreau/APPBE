-- 027_category_logo.sql
-- Ajoute un champ logo à la table catalog_categories
-- Le logo peut être une URL externe (https://...) ou un data-URL base64

ALTER TABLE catalog_categories ADD COLUMN IF NOT EXISTS logo TEXT;

COMMENT ON COLUMN catalog_categories.logo IS
  'Logo de la catégorie : URL externe ou data-URL base64 (image/png, image/svg+xml, etc.)';

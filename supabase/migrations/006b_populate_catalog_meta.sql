-- ── Peuplement initial du référentiel catalogue ───────────────────────────
-- À exécuter si les tables catalog_brands et catalog_categories existent déjà
-- mais sont vides (après avoir exécuté 006_catalog_meta.sql).
-- Importe automatiquement toutes les marques et catégories déjà présentes
-- dans les produits synchronisés (table user_products).

INSERT INTO public.catalog_brands (name)
SELECT DISTINCT trim(product_data->>'manufacturer')
FROM   public.user_products
WHERE  trim(product_data->>'manufacturer') IS NOT NULL
  AND  trim(product_data->>'manufacturer') <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.catalog_categories (name, color)
SELECT DISTINCT trim(product_data->>'category'), '#6c7480'
FROM   public.user_products
WHERE  trim(product_data->>'category') IS NOT NULL
  AND  trim(product_data->>'category') <> ''
ON CONFLICT (name) DO NOTHING;

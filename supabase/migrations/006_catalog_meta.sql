-- ── Référentiel catalogue : marques et catégories ────────────────────────
-- Permettent aux admins de gérer les listes de marques et catégories
-- utilisées comme suggestions dans l'éditeur produit, et d'associer une
-- couleur à chaque catégorie (affichée dans la palette du synoptique).

-- ── Marques ──────────────────────────────────────────────────────────────
CREATE TABLE public.catalog_brands (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text        NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT catalog_brands_name_unique UNIQUE (name)
);

ALTER TABLE public.catalog_brands ENABLE ROW LEVEL SECURITY;

-- Tous les utilisateurs approuvés peuvent lire la liste des marques
CREATE POLICY "approved_read_brands" ON public.catalog_brands
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
  );

-- Seuls les admins peuvent créer / modifier / supprimer
CREATE POLICY "admin_manage_brands" ON public.catalog_brands
  FOR ALL
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── Catégories ────────────────────────────────────────────────────────────
CREATE TABLE public.catalog_categories (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text        NOT NULL,
  color      text        NOT NULL DEFAULT '#6c7480',
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT catalog_categories_name_unique UNIQUE (name)
);

ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approved_read_categories" ON public.catalog_categories
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'approved')
  );

CREATE POLICY "admin_manage_categories" ON public.catalog_categories
  FOR ALL
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── Auto-population depuis les produits existants ─────────────────────────
-- Importe automatiquement toutes les marques et catégories déjà utilisées
-- dans user_products pour que les tables ne soient jamais vides au départ.

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

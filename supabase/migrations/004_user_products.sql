-- ── Catalogue produits personnalisé par utilisateur ──────────────────────
-- Chaque produit custom créé/modifié dans l'éditeur est synchronisé ici.
-- Permet de retrouver son catalogue sur n'importe quel appareil.

CREATE TABLE public.user_products (
  id           text        PRIMARY KEY,   -- = product.id (ex: "custom-1716…")
  user_id      uuid        REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  product_data jsonb       NOT NULL,      -- Product sérialisé
  created_at   timestamptz DEFAULT now() NOT NULL,
  updated_at   timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX user_products_user_id_idx ON public.user_products(user_id);

ALTER TABLE public.user_products ENABLE ROW LEVEL SECURITY;

-- Chaque utilisateur ne voit et gère que ses propres produits
CREATE POLICY "users_own_products" ON public.user_products
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Les admins voient et gèrent tous les produits
CREATE POLICY "admins_all_products" ON public.user_products
  FOR ALL
  USING  (public.is_admin());

-- Mise à jour automatique de updated_at
CREATE TRIGGER user_products_updated_at
  BEFORE UPDATE ON public.user_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

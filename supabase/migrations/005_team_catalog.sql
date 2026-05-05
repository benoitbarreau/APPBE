-- ── Catalogue produits partagé (équipe) ─────────────────────────────────
-- Modifie les politiques RLS de user_products pour que tous les utilisateurs
-- approuvés puissent voir et gérer l'ensemble du catalogue custom.
--
-- Avant : catalogue isolé par user_id (chaque utilisateur ne voyait que ses
--         propres produits, impossible de partager une fiche entre collègues).
-- Après : catalogue d'équipe partagé — last-write-wins par ID produit.
--         Tout utilisateur approuvé peut créer, modifier, ou supprimer
--         n'importe quelle fiche produit.

-- Supprimer les politiques restrictives existantes
DROP POLICY IF EXISTS "users_own_products"   ON public.user_products;
DROP POLICY IF EXISTS "admins_all_products"  ON public.user_products;

-- Un seul check : l'utilisateur courant doit avoir le statut « approved »
CREATE POLICY "team_catalog_access" ON public.user_products
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND status = 'approved'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND status = 'approved'
    )
  );

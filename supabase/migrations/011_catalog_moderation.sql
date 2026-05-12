-- ── Modération du catalogue produits ─────────────────────────────────────
-- Avant : tout utilisateur approuvé peut créer / modifier / supprimer
--         n'importe quelle fiche du catalogue partagé (team_catalog_access).
-- Après : chaque fiche a un statut (pending / approved) et peut être archivée.
--         - Les utilisateurs créent en `pending` dans leur catalogue personnel.
--         - Les admins créent directement en `approved` (catalogue commun).
--         - Les admins valident une fiche `pending` → `approved`.
--         - Une « suppression » dans le catalogue commun = archivage (soft).
--         - Une suppression réelle est possible depuis les archives par un admin.

-- ── Colonnes ─────────────────────────────────────────────────────────────
ALTER TABLE public.user_products
  ADD COLUMN IF NOT EXISTS status      text        NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved')),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS user_products_status_idx      ON public.user_products(status);
CREATE INDEX IF NOT EXISTS user_products_archived_at_idx ON public.user_products(archived_at);

-- Les lignes existantes restent en 'approved', archived_at NULL → rétro-compat.

-- ── Helpers RLS ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'approved'
  );
$$;

-- (is_admin() existe déjà — défini dans 001_init.sql)

-- ── Politiques RLS ───────────────────────────────────────────────────────
-- Supprimer toutes les anciennes politiques
DROP POLICY IF EXISTS "users_own_products"   ON public.user_products;
DROP POLICY IF EXISTS "admins_all_products"  ON public.user_products;
DROP POLICY IF EXISTS "team_catalog_access"  ON public.user_products;

-- SELECT : un utilisateur approuvé voit
--   - toutes les fiches `approved` non archivées (catalogue commun)
--   - toutes ses propres fiches (y compris pending et archivées — pour la rétention)
--   - un admin voit tout
CREATE POLICY "select_user_products" ON public.user_products
  FOR SELECT
  USING (
    public.is_approved_user() AND (
      public.is_admin()
      OR user_id = auth.uid()
      OR (status = 'approved' AND archived_at IS NULL)
    )
  );

-- INSERT : un admin peut insérer n'importe quel produit (commun ou pending) ;
--         un utilisateur ne peut insérer QUE ses propres fiches en pending
--         et non archivées.
CREATE POLICY "insert_user_products" ON public.user_products
  FOR INSERT
  WITH CHECK (
    public.is_approved_user() AND (
      public.is_admin()
      OR (user_id = auth.uid() AND status = 'pending' AND archived_at IS NULL)
    )
  );

-- UPDATE : un admin peut tout modifier (y compris valider, archiver, restaurer) ;
--         un utilisateur ne peut modifier QUE ses propres fiches pending non archivées.
CREATE POLICY "update_user_products" ON public.user_products
  FOR UPDATE
  USING (
    public.is_approved_user() AND (
      public.is_admin()
      OR (user_id = auth.uid() AND status = 'pending' AND archived_at IS NULL)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (user_id = auth.uid() AND status = 'pending' AND archived_at IS NULL)
  );

-- DELETE : un admin peut supprimer définitivement n'importe quelle fiche
--         (notamment depuis les archives) ; un utilisateur ne peut supprimer
--         que ses propres fiches pending.
CREATE POLICY "delete_user_products" ON public.user_products
  FOR DELETE
  USING (
    public.is_approved_user() AND (
      public.is_admin()
      OR (user_id = auth.uid() AND status = 'pending' AND archived_at IS NULL)
    )
  );

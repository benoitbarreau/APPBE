-- ── Migration 021 : Gestionnaire de compte sur les clients ───────────────────
-- Ajoute la colonne account_manager_id sur clients + policies RLS associées.
-- Un gestionnaire de compte est un utilisateur SynoX approuvé assigné à un client.

-- 1. Colonne account_manager_id (nullable — un client peut n'avoir aucun gestionnaire)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS account_manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. Index pour les jointures et filtres rapides
CREATE INDEX IF NOT EXISTS clients_account_manager_idx ON clients(account_manager_id);

-- 3. Policy SELECT : le gestionnaire assigné peut voir les clients dont il est responsable
--    (en complément de clients_select_own qui couvre le propriétaire)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clients' AND policyname = 'clients_manager_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "clients_manager_select" ON clients FOR SELECT
        USING (account_manager_id = auth.uid())
    $pol$;
  END IF;
END$$;

-- 4. Policy UPDATE : le gestionnaire peut modifier les clients qui lui sont assignés
--    (notamment pour changer le gestionnaire de compte)
--    WITH CHECK (true) permet de modifier account_manager_id vers n'importe quelle valeur
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clients' AND policyname = 'clients_manager_update'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "clients_manager_update" ON clients FOR UPDATE
        USING (account_manager_id = auth.uid())
        WITH CHECK (true)
    $pol$;
  END IF;
END$$;

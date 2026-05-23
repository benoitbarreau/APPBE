-- ── Migration 022 : Archivage (soft-delete) des clients ──────────────────────
-- Ajoute la colonne deleted_at sur clients.
-- null  = client actif
-- non-null = client archivé (invisible dans listClients(), visible via listDeletedClients())
--
-- Pas de changement aux policies RLS existantes : les policies actuelles suffisent.
--   • clients_select_own / clients_update_own  → le propriétaire peut archiver ses propres clients
--   • clients_admin                            → l'admin peut lister, restaurer et supprimer définitivement
-- Le filtre applicatif (.is('deleted_at', null) dans listClients) masque les archivés
-- aux utilisateurs normaux sans modifier le RLS.

-- 1. Colonne deleted_at (null par défaut → tous les clients existants restent actifs)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Index partiel : uniquement sur les lignes archivées (faible cardinalité, très efficace)
CREATE INDEX IF NOT EXISTS clients_deleted_at_idx
  ON clients(deleted_at)
  WHERE deleted_at IS NOT NULL;

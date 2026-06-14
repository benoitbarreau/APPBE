# Infrastructure SynoX — Configuration manuelle

Ce fichier documente tout ce qui ne peut pas être versionné en git mais est
nécessaire pour que l'application fonctionne : secrets, webhooks, buckets Storage.

---

## 1. GitHub — Secrets & Variables

Aller sur : **GitHub → Settings → Secrets and variables → Actions**

### Secrets (onglet Secrets)

| Nom | Description | Où trouver la valeur |
|-----|-------------|----------------------|
| `VITE_SUPABASE_URL` | URL du projet Supabase (ex. `https://xxxx.supabase.co`) | Supabase Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Clé anonyme publique Supabase | Supabase Dashboard → Settings → API → anon public |
| `SUPABASE_ACCESS_TOKEN` | Token CLI Supabase pour déployer les Edge Functions | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |

### Variables (onglet Variables)

| Nom | Description | Exemple |
|-----|-------------|---------|
| `SUPABASE_PROJECT_ID` | Identifiant du projet Supabase (ref) | `abcdefghijklmnop` (Supabase → Settings → General → Reference ID) |

---

## 2. Supabase — Secrets des Edge Functions

Aller sur : **Supabase Dashboard → Edge Functions → Manage secrets**

| Nom | Description | Obligatoire |
|-----|-------------|:-----------:|
| `RESEND_API_KEY` | Clé API [Resend](https://resend.com) pour l'envoi d'e-mails | ✅ |
| `ADMIN_EMAIL` | Adresse e-mail de destination des notifications d'inscription | ✅ |
| `FROM_EMAIL` | Adresse expéditrice vérifiée dans Resend (ex. `SynoX-AV <notifications@videosynergie.com>`) | ✅ |
| `GEMINI_API_KEY` | Clé API [Google AI Studio](https://aistudio.google.com/apikey) pour la complétion IA des fiches produit (fonction `complete-product`) | ✅ (pour l'IA) |
| `SUPABASE_URL` | **Injecté automatiquement** par Supabase — ne pas ajouter manuellement | — |
| `SUPABASE_SERVICE_ROLE_KEY` | **Injecté automatiquement** par Supabase — ne pas ajouter manuellement | — |

---

## 3. Supabase — Edge Functions déployées

Les fonctions sont dans `supabase/functions/` et déployées automatiquement
via GitHub Actions (`deploy.yml`) à chaque push sur la branche principale.

| Fonction | Rôle |
|----------|------|
| `admin-update-user` | Modifier email / mot de passe / rôle / statut d'un utilisateur (nécessite SERVICE_ROLE) |
| `invite-user` | Créer un compte par invitation ou mot de passe provisoire, envoie un e-mail via Resend |
| `notify-admin-new-user` | Envoyer un e-mail à l'admin à chaque nouvelle inscription (déclenchée par webhook) |
| `complete-product` | Complète une fiche produit (connectique, alimentation, dimensions…) à partir de sa fiche technique PDF via Google Gemini (nécessite `GEMINI_API_KEY`) |

---

## 4. Supabase — Database Webhook

Aller sur : **Supabase Dashboard → Database → Webhooks → Create a new hook**

Ce webhook déclenche automatiquement la Edge Function `notify-admin-new-user`
à chaque nouvelle inscription.

| Paramètre | Valeur |
|-----------|--------|
| **Name** | `on_new_profile` (ou tout autre nom descriptif) |
| **Table** | `public.profiles` |
| **Events** | `INSERT` uniquement |
| **Type** | Supabase Edge Functions |
| **Edge Function** | `notify-admin-new-user` |
| **HTTP Headers** | _(laisser vide — Supabase injecte automatiquement l'Authorization)_ |

---

## 5. Supabase — Storage Buckets

Les buckets sont créés par les migrations SQL (pas besoin de les recréer manuellement).
Ils sont listés ici pour référence.

| Bucket | Public | Taille max | Créé par |
|--------|:------:|:----------:|----------|
| `company-logos` | ✅ Oui | 2 Mo | Migration 013 |
| `ref-documents` | ❌ Non (URLs signées) | 50 Mo | Migration 016 |
| `client-logos` | ✅ Oui | 5 Mo | Migration 019 |

---

## 6. Migrations SQL appliquées

Les migrations sont dans `supabase/migrations/` et doivent être exécutées dans l'ordre
dans **Supabase Dashboard → SQL Editor** si le projet est recréé from scratch.

| Fichier | Contenu |
|---------|---------|
| `001_init.sql` | Table `profiles`, enum `user_status`/`user_role`, trigger `handle_new_user` |
| `002_projects.sql` | Table `projects`, trigger `set_updated_at` |
| `003_project_shares.sql` | Table `project_shares`, fonction `get_profile_by_email` |
| `003b_fix_shares_rls.sql` | Correction RLS sur `project_shares` |
| `003c_list_profiles_fn.sql` | Fonction `list_approved_profiles` |
| `004_user_products.sql` | Table `user_products` |
| `005_team_catalog.sql` | RLS catalogue partagé équipe |
| `006_catalog_meta.sql` | Tables `catalog_brands` et `catalog_categories` |
| `006b_populate_catalog_meta.sql` | Import initial des marques/catégories depuis `user_products` |
| `007_project_versions.sql` | Table `project_versions`, colonne `versions_meta` sur `projects` |
| `008_project_enhancements.sql` | Colonnes `client_name`, `lieu`, `archived` sur `projects` |
| `008b_backfill_project_meta.sql` | Rétro-remplissage de `client_name` / `lieu` |
| `009_admin_users_fn.sql` | Fonction `admin_list_users` |
| `010_user_signals_zones.sql` | Tables `user_signals` et `user_zones` |
| `011_catalog_moderation.sql` | Colonnes `status`, `archived_at` sur `user_products`, fonction `is_approved_user` |
| `012_notify_admin_webhook.sql` | (Documentation du webhook — voir section 4 ci-dessus) |
| `013_company_profile.sql` | Colonnes `company_name`, `company_logo_url` sur `profiles`, bucket `company-logos`, fonction `admin_delete_user` |
| `014_profiles_select_fix.sql` | Correction RLS SELECT sur `profiles` |
| `015_fix_project_shares_rls.sql` | Correction RLS sur `project_shares` |
| `016_referentiel.sql` | Tables `clients`, `sites`, `rooms`, `ref_documents`, bucket `ref-documents`, colonne `room_id` sur `projects` |
| `017_referentiel_storage.sql` | Policies Storage pour le bucket `ref-documents` |
| `018_contacts.sql` | Table `contacts` (sites et salles) |
| `019_client_logo_project_room.sql` | Colonnes `logo_url`, `logo_storage_path` sur `clients`, bucket `client-logos` |
| `020_contact_client_room_contacts.sql` | Extension contacts au niveau client, table `room_contacts` |
| `021_account_manager.sql` | Colonne `account_manager_id` sur `clients`, policies gestionnaire |
| `022_client_soft_delete.sql` | Colonne `deleted_at` sur `clients` (archivage réversible) |
| `023_add_user_zones.sql` | Table `user_zones` (idempotent — peut être réexécuté) |

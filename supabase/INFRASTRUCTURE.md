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
| **HTTP Headers** | `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` — secret configuré côté serveur uniquement |

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


## Correctifs de sécurité — octobre 2026

Appliquer `20261008071041_harden_project_and_datasheet_access.sql` après les migrations existantes. La migration protège les transferts de propriété des projets et limite les écritures PDF aux comptes approuvés : auteur de l’upload ou administrateur. Elle utilise `storage.objects.owner_id` ; vérifier cette colonne sur une ancienne installation Storage. Les fichiers sans propriétaire restent modifiables par les administrateurs. La lecture publique des fiches techniques est conservée.

Appliquer ensuite `20261009034436_configure_notification_webhook_vault.sql` et redéployer `notify-admin-new-user`. Le déclencheur lit dans Vault un secret dédié et l’URL de la fonction, puis utilise l’en-tête `x-synox-webhook-secret`. Le secret est généré dans PostgreSQL ; il n’est jamais enregistré dans Git ou dans le frontend. La RPC de vérification ne retourne qu’un booléen et seul `service_role` peut l’appeler.

Pour une installation sur un autre projet, adapter l’URL de configuration dans la migration avant application, ou modifier `synox_notification_webhook_url` dans Vault. Le secret `synox_notification_webhook_token` peut être renouvelé dans Vault ; la fonction le vérifie à chaque appel sans redéploiement.

L’ancien webhook serveur avec Authorization service_role reste compatible. Le déclencheur Vault suffit : éviter un webhook Dashboard supplémentaire, qui provoquerait des doublons. Un appel authentifié avec `{ "dryRun": true }` vérifie l’authentification et la présence de la clé Resend sans envoyer d’email.

Ces correctifs ne sont actifs en production qu’après application de la migration et déploiement de la fonction.

## Sauvegarde atomique

Migration `20261009034950_atomic_project_save.sql` appliquée le 9 octobre 2026. `save_project_atomic` s’exécute avec les droits de l’appelant (RLS), verrouille la ligne, refuse une date obsolète et archive la version distante précédente dans la même transaction. Les trois derniers instantanés sont conservés. Exécution réservée aux utilisateurs authentifiés ; compte approuvé et droit d’édition contrôlés dans la fonction.

## Complétion IA et fiches PDF

La fonction complete-product contrôle Auth et profiles.status=approved. Elle n’accepte pour analyse que les URL publiques HTTPS du bucket product-datasheets du projet. Lecture limitée à 15 Mo, délai de téléchargement 20 s, redirections refusées, signature PDF contrôlée. Les URL externes nécessitent un import préalable. Les secrets Gemini restent côté serveur ; aucun changement SQL requis.

## Configuration des quotas IA

`ai_completion_limits` contient une ligne singleton avec daily_limit=50 et concurrent_limit=1. Modifiable uniquement côté serveur (SQL Editor/service_role), sans redéployer la fonction. Exemple : `UPDATE public.ai_completion_limits SET daily_limit=100, concurrent_limit=2 WHERE singleton;`. Les limites s’appliquent aussi aux administrateurs. `ai_completion_usage` conserve uniquement le compteur de la journée et les réservations temporaires, sans contenu PDF ou réponse IA. Ces tables ne sont pas accessibles aux utilisateurs.

## Installations neuves et migrations

Les 35 fichiers s’appliquent par ordre de nom, comme décrit dans README.md. 017 est désormais compatible avec 016 et ne change pas ses politiques. Sur un nouveau projet, la migration Vault ne crée plus automatiquement une URL pointant vers la production SynoX. Configurer synox_notification_webhook_url pour le projet concerné ; les valeurs Vault existantes sont conservées. Aucun rejeu des migrations historiques n’est nécessaire en production. `npm run test:migrations` vérifie cette chaîne dans une base jetable.

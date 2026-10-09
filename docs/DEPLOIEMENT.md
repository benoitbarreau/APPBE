# Déploiement des correctifs — 8 octobre 2026

Commit publié : `a8672a789631a97a46a86442664a9accefb95a10` sur `claude/av-diagram-generator-DvBJA`.

Workflow : https://github.com/benoitbarreau/APPBE/actions/runs/37748258222

Les jobs build, deploy (GitHub Pages) et deploy-functions ont réussi.

Application : https://benoitbarreau.github.io/APPBE/

## Supabase

Projet vérifié : `dqywrwluwywdgjdzyyrx` (celui des variables frontend).

- Migration `harden_project_and_datasheet_access` appliquée.
- Présence du trigger `projects_protect_owner` confirmée.
- Politiques d'écriture PDF : comptes approuvés, auteur de l'upload ou administrateur ; contrôle de la ligne après UPDATE également présent.
- Fonction `notify-admin-new-user` protégée déployée, puis redéployée par le workflow.
- Test HTTP sans Authorization effectué depuis pg_net : réponse 401, sans timeout. Aucun email de test envoyé.

## Configuration restant nécessaire pour les emails d'inscription

Le trigger `on_new_profile_notify_admin` est actif, mais `app.service_role_key` n'est pas configuré dans la base ; aucune clé correspondante n'a été trouvée dans Vault. La notification était donc déjà ignorée par le trigger avant cette intervention.

Dans le SQL Editor Supabase, configurer `app.supabase_url` et `app.service_role_key` conformément à la migration 012, avec la clé serveur du projet. Ne pas transmettre cette clé dans le chat, dans le frontend ou dans Git. Une alternative est le webhook Dashboard avec Authorization configuré côté serveur, décrit dans INFRASTRUCTURE.md. Éviter d'activer à la fois trigger et webhook.

## Limites de vérification

La compilation et le déploiement Pages sont confirmés par les jobs GitHub Actions. L'accès HTTP direct au site depuis cette session est bloqué par le réseau ; les parcours utilisateur connectés n'ont pas été testés en production.

Les conseillers Supabase signalent également des points préexistants, hors de cette première série de correctifs :

- search_path de `set_updated_at` : https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- fonctions SECURITY DEFINER exposées aux rôles anon/authenticated, à examiner selon leur rôle et contrôles internes : https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- protection contre les mots de passe compromis désactivée : https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection


## Finalisation — 9 octobre 2026

La configuration manquante ci-dessus est résolue par la migration `configure_notification_webhook_vault`. Le déclencheur utilise désormais `synox_notification_webhook_token` et `synox_notification_webhook_url` dans Vault ; les anciens paramètres app.* ne sont plus nécessaires. Le secret reste côté serveur. La fonction de vérification ne retourne qu’un booléen et son exécution est réservée à service_role.

Validation distante : utilisateur/anon interdits d’exécuter la RPC, utilisateur interdit de lire Vault, appel pg_net authentifié en dry-run → HTTP 200 avec authenticated=true et emailConfigured=true. Aucun email de test envoyé ; la réception d’un email réel reste à constater lors d’une prochaine inscription.

Les 12 tests locaux passent et la vérification TypeScript réussit.

## Sauvegarde atomique — 9 octobre 2026

La migration `20261009034950_atomic_project_save.sql` a été appliquée en production avant le déploiement frontend. La RPC `save_project_atomic` verrouille le projet, contrôle la date réellement chargée, archive la version distante précédente et met à jour projet/historique dans une transaction. Trois versions sont conservées ; l’autosauvegarde ne crée pas de version. Les comptes approuvés propriétaires, éditeurs partagés et administrateurs peuvent enregistrer ; les lecteurs peuvent consulter l’historique.

Le navigateur conserve la date et l’empreinte de la dernière sauvegarde, y compris après rechargement. Les modifications faites pendant une requête restent en attente. Une ancienne session locale sans date de référence nécessite un rechargement distant via la résolution de conflit. Validation : 15 tests Node, TypeScript, build et assertions SQL dans PostgreSQL jetable.

## Chargement différé — 9 octobre 2026

Les vues accueil, projets, éditeur, catalogue, référentiel et administration sont chargées à leur ouverture avec React.lazy et un écran d’attente Suspense. La bibliothèque jsPDF est chargée uniquement lors des exports PDF (synoptique, câbles, tableau IP, baie).

Build mesuré : entrée JS 431,33 Ko (122,06 Ko gzip), contre 1471,97 Ko (443,73 Ko gzip) avant séparation ; module éditeur 455,24 Ko ; module PDF 390,24 Ko. Ces chiffres mesurent les fichiers compilés, pas le temps de chargement réel. Aucun chunk ne dépasse désormais 500 Ko. Les 15 tests et le build TypeScript passent. Vérification navigateur avec Chromium local : écran de connexion affiché, aucune erreur JavaScript, seule l’entrée JS téléchargée (éditeur et PDF absents). Les parcours connectés ne sont pas validés ici.

## Isolation entre comptes — 9 octobre 2026

Le changement de compte et la déconnexion purgent les données projet, images, groupes, colonnes IP, métadonnées et archives produits, accessoires, buffers de zones/signaux, métadonnées catalogue et historique d’annulation. Le même compte conserve son travail lors d’un F5. La purge attend la fin du bootstrap Auth pour préserver cette restauration.

Les chargements initiaux sont ignorés après nettoyage de leur effet ou changement de compte. Les ouvertures et créations de projet ainsi que les réponses de sauvegarde vérifient le compte avant de modifier le store. Aucun changement de base ou de politique Supabase. Validation : 17 tests et compilation TypeScript/Vite ; les scénarios avec deux comptes réels ne sont pas exécutés en production.

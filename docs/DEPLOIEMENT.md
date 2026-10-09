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

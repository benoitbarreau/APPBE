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

## Téléchargements PDF de la complétion IA — 10 octobre 2026

`complete-product` exige désormais un profil approved après validation du jeton Auth. Seules les URL HTTPS publiques du bucket product-datasheets de ce projet Supabase sont téléchargées, sans identifiants, paramètres ou fragment. Les chemins ambigus et les redirections sont refusés. Les PDF provenant de liens externes doivent être importés dans SynoX avant analyse IA ; les liens eux-mêmes restent utilisables comme documents.

La lecture est limitée à 15 Mo pendant le streaming (même si Content-Length est absent ou incorrect), avec annulation à 20 secondes et vérification de la signature %PDF-. Chaque appel Gemini est limité à 60 secondes. Aucun quota applicatif par compte n’est ajouté dans cette série.

Validation : 27 tests Node dont scénarios serveur simulés, et vérification TypeScript du module de téléchargement. Aucun appel réel à Gemini ni modification de la base.

## Quotas IA — 10 octobre 2026

Migration `20261010092505_ai_completion_quotas.sql` appliquée avant le déploiement de complete-product. Limites initiales : 50 demandes acceptées par jour et par compte, une analyse simultanée. Réinitialisation à minuit Europe/Paris. Une demande réservée compte même si le téléchargement ou Gemini échoue ; les demandes refusées ne comptent pas. Une nouvelle tentative Gemini interne reste dans la même demande (au plus deux appels fournisseur).

Réservation atomique sous verrou de la ligne utilisateur, libération en finally, expiration de secours après 5 minutes. Seul service_role peut lire/modifier les quotas et exécuter les RPC, qui restent SECURITY INVOKER. RLS est activé sans politique utilisateur, volontairement : les tables sont réservées au backend. Le conseiller signale ce choix à titre informatif ([explication Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).

31 tests Node, TypeScript du module quota, assertions SQL locales et test de deux réservations concurrentes passent. Validation distante réservation/refus/libération effectuée dans une transaction entièrement annulée ; aucun appel réel Gemini.

## Reproductibilité des migrations — 10 octobre 2026

017 ne recrée plus les quatre politiques Storage déjà établies par 016. La migration Vault préserve une URL existante et ne configure une nouvelle URL que si app.supabase_url est explicitement fourni ; aucune référence au projet de production n’est incorporée pour une nouvelle installation. À défaut, la notification reste désactivée jusqu’à sa configuration dans Vault (README.md).

`npm run test:migrations` applique les 35 fichiers à une base jetable avec les extensions réelles pgcrypto, pg_net et Vault. Le bootstrap complète les contrats SQL Auth/Storage nécessaires au projet, sans remplacer les fonctions présentes. Le test valide le schéma final, le rejeu de 017 sans modification des politiques, et la configuration d’une URL propre à l’installation. Les API des services Auth/Storage ne sont pas testées.

Validation locale : 35 migrations et assertions réussies, 31 tests Node réussis. GitHub Actions exécute désormais ces vérifications avant la compilation ; les déploiements frontend et fonctions dépendent de ce job. Aucun script historique n’est rejoué sur la production : il s’agit de correctifs pour les installations futures et le contrôle continu.

## Droits des gestionnaires de compte — 10 octobre 2026

Migration `20261010102548_account_manager_referentiel_access.sql` appliquée avant le frontend. Les comptes approuvés assignés accèdent aux sites, salles, contacts, associations salle/contact et documents du client. Les fichiers privés au format utilisateur/type/id/fichier suivent les droits de leur entité, y compris les dépôts d’un autre utilisateur. Les anciens chemins sans entité conservent un accès propriétaire uniquement. Le partage des projets reste régi par ses propres politiques.

Les contrôles UPDATE/INSERT valident aussi l’entité cible. Les nouvelles règles gestionnaire limitent les liens salle/contact au même client. La propriété du client est protégée par trigger ; seuls les administrateurs approuvés peuvent la transférer. La RPC assign_client_manager permet une réassignation autorisée et vérifie que le nouveau gestionnaire est approuvé. Après réassignation, l’ancien gestionnaire perd ses accès ; l’interface revient à la liste et vide son cache si nécessaire.

Les helpers de lecture sont SECURITY INVOKER. La RPC de réassignation est volontairement SECURITY DEFINER pour pouvoir terminer l’opération après retrait du droit de lecture du gestionnaire précédent ; elle vérifie l’identité, l’approbation et la relation au client sous verrou, sans permettre de modifier sa propriété. Son exécution anonyme est interdite. Le conseiller signale cette exposition authentifiée intentionnelle ([explication Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)).

Validation : 33 tests Node et TypeScript réussis, assertions PostgreSQL locales avec vrais rôles/RLS. Vérification distante d’accès site, refus du transfert de propriété et réassignation dans une transaction annulée intégralement. Le parcours navigateur avec comptes réels reste à vérifier. Le workflow teste désormais 36 migrations et ces assertions avant déploiement.

### 11 octobre 2026 — audit des fonctions SQL exposées

Migration `20261011065725_harden_exposed_sql_functions.sql` appliquée en production. Aucun SECURITY DEFINER public n'est désormais exécutable par `anon`; aucun search_path mutable ne reste parmi les fonctions publiques. Les triggers signup/date/propriétaire ne sont plus directement exécutables par les clients. Les politiques utilisant les helpers révoqués sont limitées au rôle authenticated, sans modification de leurs prédicats. `is_admin()` exige désormais un administrateur approuvé; les deux RPC de recherche de profils exigent un appelant approuvé.

Validation : 33 tests Node réussis, migrations applicatives sur PostgreSQL 16 isolé (hors Vault/webhook), assertions référentiel et nouveaux tests SQL anon/pending/user/admin réussis. Vérification des permissions et advisors après application en production. Aucun compte de production créé ou supprimé pour les tests.

Restent 10 avis SECURITY DEFINER authenticated : accès intentionnels, avec contrôles dans les fonctions. Les helpers d'appartenance renvoient uniquement un booléen relatif à auth.uid; ils évitent la récursion RLS. Les RPC admin sont réservés aux administrateurs approuvés, les recherches aux comptes approuvés et l'assignation au propriétaire/gestionnaire/admin approuvé. Retirer SECURITY DEFINER casserait ces accès ou la récursion RLS. Voir https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable . Les 2 INFO de quotas sans politiques sont intentionnels : tables serveur uniquement. La protection des mots de passe compromis reste désactivée, réglage Auth non modifiable avec les outils disponibles : https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

## Lot 1 de l'audit — 17 novembre 2026

Corrige les huit pertes de données critiques de `docs/AUDIT_2026-11-17.md` (C1 à C8).

- **C1, C4** : la sauvegarde, l'empreinte « modifié » et l'export JSON emportent les images et les groupes de l'onglet actif (`getFlushedTabs` = `flushActive`). Les six champs du canevas (produits, câbles, textes, formes, images, groupes) sont remplacés ensemble à chaque changement d'onglet, ouverture, création ou suppression (`workingStateOf`) ; la duplication d’un synoptique copie ses groupes et relie les câbles des formes à leurs copies.
- **C2** : l'historique d'annulation est vidé à chaque changement d'onglet, de projet ou de compte (`resetHistoryAround`), et une modification hors canevas (sélection, cartouche, Tableau IP) n'y crée plus d'entrée (`equality: shallow`).
- **C3** : créer un Tableau IP ou dupliquer une baie ne vide plus les zones du projet.
- **C5** : migration `20261117090000_archive_saved_version.sql` : « Enregistrer » archive l'état enregistré sous son nouveau numéro, et non plus la dernière sauvegarde automatique sous l'ancien.
- **C6, C7** : la synchronisation IP ne supprime plus une ligne qui contient des saisies : elle la garde « orpheline » (fond orangé, badge, suppression avec confirmation) et la reprend si un équipement de même référence et de même label revient, ou si son équipement, toujours présent, reçoit de nouveau un label à lui. Deux équipements renommés avec le même label gardent leurs deux lignes. Un produit collé dans le même synoptique reçoit un nouveau label.
- **C8** : une réponse de sauvegarde arrivée après l'ouverture d'un autre projet n'est plus appliquée au projet affiché (époque du projet, `getProjectEpoch`).

Validation locale : 57 tests Node (dont 24 nouveaux), TypeScript et build réussis. Assertions SQL de la sauvegarde atomique rejouées sur PostgreSQL en mémoire (PGlite) avec la nouvelle migration. La chaîne complète des migrations (`npm run test:migrations`, Docker) n'a pas pu être lancée sur la machine de développement : la CI la jouera.

**Mise en production** : migration `20261117090000_archive_saved_version.sql` appliquée le 17/11/2026 dans le SQL Editor du projet `dqywrwluwywdgjdzyyrx`, avant le push du frontend. Avant : corps de `save_project_atomic` identique à celui de `20261009034950` (empreinte SHA-256 comparée). Après : corps identique à la nouvelle migration, `anon` sans droit d'exécution, `authenticated` avec, `search_path` vide, SECURITY INVOKER. Retour arrière : rejouer la fonction de `20261009034950_atomic_project_save.sql`. Les versions déjà archivées gardent l'ancien sens (état précédent).

Non vérifié en navigateur : parcours réels d'annulation, de changement d'onglet et des lignes orphelines.

### CI : déploiement des fonctions — 17 novembre 2026

Le job `deploy-functions` du push du lot 1 a échoué sans rien déployer : la CLI Supabase (`version: latest`) demande désormais une confirmation (« Confirmation required … Re-run with --yes ») qu'un job CI ne peut pas donner. Ajout de `--yes` à `supabase functions deploy`. Les fonctions de production n'ont pas changé dans l'intervalle (code identique depuis octobre).

## Lot 2 de l'audit — 17 novembre 2026

Droits et confidentialité (`docs/AUDIT_2026-11-17.md`, H1 et constats « Projets » et « Lecture seule partielle »). Aucune migration : frontend seulement.

- **Mots de passe des équipements** (H1) : masqués par défaut dans le Tableau IP, retirés des quatre modèles d'export (`src/lib/ipExportTemplates.ts`), export seulement si la colonne est cochée à la main, jamais en lecture seule (ni filtre ni tri sur cette colonne) ; cellules en `autoComplete="new-password"` pour que le navigateur n'y remplisse pas le mot de passe du compte ; l'export JSON en lecture seule les retire (`redactPasswords`). **Limite** : ils restent dans le JSON du projet en base, lisible par tout destinataire du partage via l'API ; une vraie protection demande de les sortir dans une table à part, avec RLS propriétaire et éditeurs (à décider).
- **Catalogue embarqué** : un projet n'enregistre plus que les fiches utilisées par ses synoptiques et ses baies (`usedProducts`), à la sauvegarde, à la création (page Projets et Référentiel) et dans l'export JSON.
- **Lecture seule** : barrière dans le store (`READ_ONLY_BLOCKED`, fin de `src/store.ts`) ; interface : catalogue, mises en forme et gestion des onglets masqués, légende, blocs texte et liste des câbles non modifiables. Le drapeau est levé en quittant l'éditeur.
- **Rôle de partage** : `getMyShareRole` filtre sur le compte connecté ; ouverture depuis le Référentiel et restauration après F5 respectent le rôle lecteur.
- **Erreurs et sorties** : code SQL conservé dans les erreurs (`pgErr`), motif affiché (`describeSaveError`), auto-save arrêté sur refus de droit ou projet supprimé ; confirmation avant fermeture du navigateur (`beforeunload`), déconnexion (`guardedLeave`), fermeture d'un onglet non vide, Recharger et Écraser ; échec de création de projet affiché sur la page Projets.

Validation locale : 66 tests Node (dont 9 nouveaux), TypeScript et build. Non vérifié en navigateur : parcours en Mode Lecteur, badge d'erreur, confirmations.

## Lot 3 de l'audit — 17 novembre 2026

Module Baie (`docs/AUDIT_2026-11-17.md`, H2 à H5, M5 à M7). Frontend seulement, aucune migration.

- **Règle de placement unique** : `src/lib/rackLayout.ts` (`placementProblem`, `findFreeSlot`, `rackResizeProblem`, `uLabel`), appliquée par le store (`addRackItem` renvoie `''` si refusé, `updateRackItem` refuse position et taille invalides ou verrouillées, `removeRackItem` refuse un équipement verrouillé) et par l'interface (clic, glisser-déposer, Propriétés), avec le motif affiché.
- **Modification d'une baie** : action `updateRack` (refus si la hauteur coupe des équipements ou si un 19" passerait en 10"), bouton ⚙, fenêtre `BayCreateModal` généralisée avec la numérotation.
- **Position** toujours comptée depuis le bas ; la numérotation ne change que les numéros affichés (repères, Propriétés, exports CSV et XLS). Corrige l'affichage en miroir des baies « 1 en haut ».
- **Suppression d'une baie** confirmée ; **équipements orphelins** signalés.

Validation locale : 85 tests Node (dont 19 nouveaux), TypeScript et build. Non vérifié en navigateur : glisser-déposer, aperçu rouge, fenêtre ⚙.

## Lot 4 de l'audit — 17 novembre 2026

Exports et Tableau IP (`docs/AUDIT_2026-11-17.md`, H5, constats « Baie et exports » et « Tableau IP »). Frontend seulement, aucune migration.

- **Exports** : pages de « tout le projet » calculées sur `reactFlow.getNodes()` après passage sur chaque onglet (`collectSynopticPages`), écran d'attente `exportingAll` ; vrai JPEG (`composedImageType`) ; fenêtre d'impression ouverte au clic (`openPrintWindow`, synoptique, tout le projet, baie) ; cartouche commun `src/lib/cartouche.ts`.
- **Baie** : lignes d'export dans `src/lib/bayRows.ts` (IP et n° de série du Tableau IP par `ipLinksByNode`), `safeCsvCell`, nom de feuille XLS nettoyé, capture sans ⚙ ni × ni cadre actif, résolution de capture adaptée.
- **Tableau IP (exports)** : `src/lib/ipExportValues.ts` (`NET_LABELS` avec « MASQUE », `exportCellValue` qui marque les orphelines), style texte `XLS_TEXT_CELL`, logo échappé.
- **Tableau IP (import et contrôles)**, fait par un sous-agent puis intégré : `src/lib/ipImport.ts` (décodage UTF-8 ou Windows-1252, séparateur `;` tabulation `,`, en-têtes sans accents dont « IP DANTE SECONDAIRE », choix du tableau d'un .xls par en-têtes reconnus, mise à jour par label avec aperçu, acceptation des fichiers), glisser-déposer dans la fenêtre d'import (bouton conservé ; pas d'outillage E2E dans ce dépôt, test unitaire de la fonction d'acceptation), doublons IPv4 et MAC normalisés, formats IP et MAC signalés sans bloquer (`isValidIPv4`, `isValidMac`).

Validation locale : 123 tests Node (dont 38 nouveaux), TypeScript et build. Non vérifié en navigateur : impression, export de tout le projet, glisser-déposer de l'import, aperçu de mise à jour.

## Lot 5 de l'audit — 17 novembre 2026

Performance et dette (`docs/AUDIT_2026-11-17.md`, H6, H7, H9, M9, IP « lenteur », écarts du guide). Frontend seulement.

- **Routage** : `src/lib/cableRouting.ts` (`obstaclesFor`, `baseRoutesFor` avec cache par rendu vidé en microtâche, car React Flow modifie `nodeLookup` sur place). Même tracé qu'avant (arcs compris).
- **Historique** : `beginHistoryGesture` / `endHistoryGesture` (fin de `src/store.ts`) pour les glisser de `DiagramCanvas` (`onNodeDragStart` / `onNodeDragStop`) et de `CableEdge`, et pour la mise en page automatique.
- **Empreinte** : `buildSignature` calcule sur `usedProducts`. Après déploiement, un projet ouvert avant peut paraître « modifié » une fois (ancienne empreinte) et s'enregistrer automatiquement.
- **Tableau IP** : `IPRow` mémorisé, rappels stables, plus de hooks après un retour anticipé.
- **Câbles orphelins** : supprimés avec leur forme, texte ou image ; retirés à l'ouverture (`withoutOrphanCables`).

Non fait, à décider : découpe de `store.ts` (≈ 2 100 lignes) et `App.tsx` (≈ 1 450) sans tests d'interface ; persistance locale allégée (écriture différée du localStorage) ; réécriture du routage pour que les arcs suivent les vrais tracés (M8). Validation locale : 135 tests Node (dont 12 nouveaux), TypeScript et build ; non vérifié en navigateur (fluidité, annulation des glisser).

## Vérification des cinq lots dans le navigateur — 17 novembre 2026

Passée en production sur un projet d'essai : versions archivées à chaque « Sauvegarder » (lot 1), collage avec nouveau label, Tableau IP (doublons, masque, mot de passe masqué et exclu de l'export Excel, cellules au format texte, import CSV par glisser-déposer), baie (placement sans chevauchement, réduction refusée sous l'occupation), annulation d'un glisser de produit ou de segment en un Ctrl+Z, câbles supprimés avec leur forme. Non vérifié : lecture seule d'un partage (lot 2, faute de compte lecteur).

Corrigé ensuite : la touche Suppr faisait deux entrées d'annulation (câbles puis élément), regroupées par `onBeforeDelete` et `historyGestureUntilNextTask` (fin de `src/store.ts`) ; une image n'est plus supprimable par Suppr (`deletable: false`), ce qui retirait ses câbles en la laissant.


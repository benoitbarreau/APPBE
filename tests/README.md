# Vérifications des correctifs

`npm test` exécute cent trente-six tests ciblés : synchronisation IP, import et contrôles du Tableau IP, sérialisation complète, renommage authentification de la notification et contrat de sauvegarde atomique. Les sources TypeScript sont transpilées en mémoire. Les dépendances réseau de la notification sont simulées ; aucun email réel n'est envoyé.

Les fichiers SQL sont réservés à une base PostgreSQL jetable. Ils créent un schéma minimal compatible avec les fonctions d'identité Supabase, puis vérifient les règles de la nouvelle migration. Ils ne valident pas toutes les politiques de l'installation distante.

```sh
docker run --detach --name synox-security-check --env POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine
# Attendre que PostgreSQL accepte les connexions :
docker exec synox-security-check pg_isready -U postgres
docker exec -i synox-security-check psql -U postgres -v ON_ERROR_STOP=1 < tests/security-fixture.sql
docker exec -i synox-security-check psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261008071041_harden_project_and_datasheet_access.sql
docker exec -i synox-security-check psql -U postgres -v ON_ERROR_STOP=1 < tests/security-assertions.sql
docker rm --force synox-security-check
```

Ne jamais exécuter les fixtures SQL sur la production. Pour le frontend : `npm run typecheck` et `npm run build`.

Les fixtures `atomic-project-fixture.sql`, les migrations `20261009034950_atomic_project_save.sql` et `20261117090000_archive_saved_version.sql`, puis `atomic-project-assertions.sql` se lancent dans cet ordre dans une autre base jetable. Elles vérifient conflits, rollback complet en cas d’échec, conservation de trois versions, contenu des versions (l'état enregistré, sous son propre numéro, même après une sauvegarde automatique) et droits propriétaire/éditeur/administrateur/lecteur. Sans Docker, PGlite (PostgreSQL en mémoire, `@electric-sql/pglite`) suffit pour ces trois fichiers.

`tab-state.test.mjs` exécute le vrai store : images et groupes de l'onglet actif dans la sauvegarde, groupes rechargés à chaque changement d'onglet ou de projet, zones conservées à la création d'un Tableau IP et à la duplication d'une baie, historique d'annulation vidé aux changements d'onglet ou de projet et sans entrée pour une modification hors canevas, label renouvelé au collage dans le même onglet, câbles des formes reliés à leurs copies à la duplication, époque du projet (une réponse de sauvegarde ne s'applique pas à un autre projet ouvert entre-temps).

`ip-orphans.test.mjs` vérifie que la synchronisation IP ne perd aucune saisie : produit supprimé puis remis, ligne remplie gardée orpheline puis reprise, ligne vide retirée, colonnes personnalisées, deux équipements renommés avec le même label puis séparés, label vidé puis redonné, anciennes lignes de même label.

`ip-import.test.mjs` vérifie l'import et les contrôles du Tableau IP : décodage des octets (BOM UTF-8, UTF-8 strict, sinon Windows-1252 pour « N° SERIE »), en-têtes (IP DANTE SECONDAIRE avec ou sans accent, colonnes personnalisées), séparateurs « ; », « , » et tabulation, choix du tableau de données plutôt que du cartouche d'un .xls, mise à jour par label sans modifier l'entrée (champs non vides, colonnes personnalisées, produit d'une ligne liée préservé), fichiers acceptés ou refusés au glisser-déposer, doublons IP normalisés et doublons MAC, validation des formats IPv4 et MAC.

`user-isolation.test.mjs` exécute le vrai store avec un stockage local simulé : changement de compte, purge des buffers de migration, impossibilité de restaurer les données par annulation, maintien du travail sur rafraîchissement du même compte et purge à la déconnexion.

`pdf-download.test.mjs` vérifie l’origine/bucket, les URL ambiguës, le refus des redirections, la lecture bornée avec taille déclarée absente ou mensongère, les délais avant et après réception des en-têtes, la signature PDF et les comptes non approuvés. Réseau et Gemini sont simulés : aucun appel IA facturable.

`ai-quota.test.mjs` vérifie les refus sans appel PDF/Gemini et la libération après succès/échec. Dans une base jetable, lancer `ai-quota-fixture.sql`, la migration `20261010092505_ai_completion_quotas.sql`, puis `ai-quota-assertions.sql`. Les réservations concurrentes ont aussi été testées avec deux connexions PostgreSQL distinctes.

## Chaîne complète de migrations

`npm run test:migrations` lance une base jetable avec l’image `supabase/postgres:15.8.1.085`, applique les fichiers par ordre de nom, rejoue 017 et vérifie le schéma final. Les extensions pgcrypto, pg_net et Vault sont réelles. Auth/Storage sont initialisés avec les contrats SQL minimaux utilisés par le projet ; ce test ne valide pas les API Auth/Storage ni l’historique distant des migrations. Les valeurs Vault restent dans le conteneur, qui est supprimé en fin de test. Aucun email ni appel IA n’est envoyé.

Les assertions `referentiel-assertions.sql` sont intégrées au test complet des migrations : propriétaire, gestionnaire, administrateur, compte non approuvé, accès fichiers, refus inter-clients, protection de propriété et retrait de l’assignation. Les comptes sont fictifs et réservés à la base jetable. `referentiel-fixture.sql` permet également une exécution isolée avec les migrations 016, 018, 019, 020, 021 et la migration gestionnaire de compte.

`lot2-droits.test.mjs` : barrière de lecture seule du store (modifications sans effet, navigation et ouverture permises), produits embarqués limités à ceux utilisés (synoptiques, baies, ancien format), mots de passe retirés d'une copie, aucun modèle d'export avec mot de passe, motifs d'échec d'enregistrement.

`rack-layout.test.mjs` : règle de placement des baies (haut et hauteur de la baie, position et largeur, chevauchement, 19" en 10", première place libre, réduction de hauteur, numéro affiché) et son application par le store (ajout, modification, verrou, modification de la baie, synchronisation).

`exports.test.mjs` : cartouche commun des exports (campus, lot, bureau d'étude, date), cellules CSV neutralisées, vrai JPEG, style texte XLS, intitulé MASQUE, lignes orphelines marquées, IP et n° de série du Tableau IP dans les exports de baie.

`cable-routing.test.mjs` : obstacles d'un câble, tracé de base identique au calcul câble par câble, partage des tracés dans un même rendu, câble sans extrémité. `tab-state.test.mjs` couvre aussi les gestes d'annulation (une entrée par glisser) et les câbles orphelins.

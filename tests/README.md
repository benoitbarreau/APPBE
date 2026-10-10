# Vérifications des correctifs

`npm test` exécute vingt-sept tests ciblés : synchronisation IP, sérialisation complète, renommage authentification de la notification et contrat de sauvegarde atomique. Les sources TypeScript sont transpilées en mémoire. Les dépendances réseau de la notification sont simulées ; aucun email réel n'est envoyé.

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

Les fixtures `atomic-project-fixture.sql`, la migration `20261009034950_atomic_project_save.sql`, puis `atomic-project-assertions.sql` se lancent dans cet ordre dans une autre base jetable. Elles vérifient conflits, rollback complet en cas d’échec, conservation de trois versions et droits propriétaire/éditeur/administrateur/lecteur.

`user-isolation.test.mjs` exécute le vrai store avec un stockage local simulé : changement de compte, purge des buffers de migration, impossibilité de restaurer les données par annulation, maintien du travail sur rafraîchissement du même compte et purge à la déconnexion.

`pdf-download.test.mjs` vérifie l’origine/bucket, les URL ambiguës, le refus des redirections, la lecture bornée avec taille déclarée absente ou mensongère, les délais avant et après réception des en-têtes, la signature PDF et les comptes non approuvés. Réseau et Gemini sont simulés : aucun appel IA facturable.

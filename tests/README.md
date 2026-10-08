# Vérifications des correctifs

`npm test` exécute neuf tests ciblés : synchronisation IP, sérialisation complète, renommage et authentification de la notification. Les sources TypeScript sont transpilées en mémoire. Les dépendances réseau de la notification sont simulées ; aucun email réel n'est envoyé.

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

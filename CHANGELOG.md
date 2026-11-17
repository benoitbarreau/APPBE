# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Les livraisons antérieures sont décrites dans `docs/DEPLOIEMENT.md`.

## [2026-11-17]

Lot 1 de l'audit (`docs/AUDIT_2026-11-17.md`) : plus aucune perte de données silencieuse.

### Corrigé
- Les images et les groupes de l'onglet actif sont enregistrés dans le cloud et dans l'export JSON.
- Les groupes ne passent plus d'un onglet ou d'un projet à l'autre ; la duplication d'un synoptique copie ses groupes et relie les câbles des formes à leurs copies.
- Ctrl+Z ne colle plus le canevas d'un autre onglet ou d'un autre projet : l'historique repart de zéro à chaque changement, et une modification hors canevas n'y crée plus d'entrée.
- Créer un Tableau IP ou dupliquer une baie ne vide plus les zones du projet.
- Une réponse de sauvegarde arrivée après l'ouverture d'un autre projet n'est plus appliquée au projet affiché.
- Tableau IP : la synchronisation ne supprime plus une ligne qui contient des saisies ; deux équipements renommés avec le même label gardent leurs deux lignes ; un produit collé dans le même synoptique reçoit un nouveau label.

### Modifié
- « Enregistrer » archive l'état enregistré sous son nouveau numéro de version (migration `20261117090000_archive_saved_version.sql`, appliquée en production le 17/11/2026). Les versions déjà archivées gardent l'ancien sens.

### Corrigé (CI)
- Déploiement des fonctions serveur : `--yes` ajouté, la CLI Supabase demandant désormais une confirmation impossible en CI.

### Ajouté
- Lignes orphelines du Tableau IP : fond orangé, badge dans la barre d'état, suppression confirmée, reprise automatique quand l'équipement revient.

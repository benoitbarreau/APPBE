# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Les livraisons antérieures sont décrites dans `docs/DEPLOIEMENT.md`.

## [2026-11-17] Lot 5 : performance et dette

### Amélioré
- Tracé des câbles : chaque câble ne recalcule plus tous les câbles précédents ; les tracés sont calculés une fois par rendu (nettement plus fluide en déplaçant un produit sur un gros synoptique). Tracé identique.
- Saisie dans le Tableau IP : seule la ligne modifiée est redessinée.
- Détection « modifié » : calculée sur les seules fiches produits utilisées, plus sur tout le catalogue toutes les 2 secondes.

### Corrigé
- Ctrl+Z annule un déplacement de produit, de segment, de coin ou d'étiquette de câble, et toute une mise en page automatique, en une fois (le glisser ne s'annulait pas ; la mise en page remplissait l'historique).
- Supprimer une forme, un texte ou une image supprime aussi ses câbles ; les câbles orphelins d'anciens projets sont retirés à l'ouverture.
- Guide utilisateur remis d'accord avec l'application (ajout de produit par « + », repères de page automatiques, numéro de câble non modifiable, colonnes et exports du Tableau IP, versions).

### Interne
- Routage des câbles dans `src/lib/cableRouting.ts` (testé), gestes d'annulation `beginHistoryGesture` / `endHistoryGesture` (store), code mort retiré de `projectsApi.ts`.

## [2026-11-17] Lot 4 : exports et Tableau IP

### Corrigé (exports)
- « Exporter / imprimer tout le projet » : pages calculées comme à l'écran (textes, formes, images et repères de page compris), total « PAGE n » juste ; écran d'attente pendant la capture ; la fenêtre de choix ne compte que les synoptiques.
- Export JPEG : vrai JPEG (c'était un PNG renommé).
- Impression : la fenêtre s'ouvre au clic et n'est plus bloquée par le navigateur.
- Cartouche identique à l'écran sur tous les exports : campus saisi, lot de l'onglet, bureau d'étude.
- Baie : IP et n° de série du Tableau IP dans le CSV et le XLS, capture sans boutons, petite baie nette en PDF, nom de feuille XLS valide.
- Protection contre les formules : cellules CSV de la baie neutralisées, cellules XLS du Tableau IP en texte (zéros de tête et identifiants conservés).
- Tableau IP : masque exporté sous « MASQUE », lignes orphelines marquées « (orpheline) ».

### Corrigé (import et contrôles du Tableau IP)
- Import d'un CSV d'Excel en Windows-1252 lu correctement (« N° SERIE » n'était plus reconnu) ; fichiers séparés par tabulation ; « IP DANTE SECONDAIRE » reconnu ; réimport de son propre .xls sans prendre le cartouche réseau pour le tableau.
- Import en « mise à jour par label » (coché par défaut) avec aperçu : plus de lignes en double à chaque réimport.
- Doublons : IP normalisées (192.168.1.010 = 192.168.1.10) et MAC détectées (casse et séparateurs ignorés).
- Format IP ou MAC invalide signalé sur la cellule, sans bloquer la saisie.

### Ajouté
- Glisser-déposer d'un fichier dans la fenêtre d'import du Tableau IP (le bouton reste disponible).

## [2026-11-17] Lot 3 : baie

### Corrigé
- Une seule règle de placement (`src/lib/rackLayout.ts`) pour le clic, le glisser-déposer, le panneau Propriétés, la synchronisation et le store : un équipement ne peut plus dépasser la baie, en chevaucher un autre, ni entrer en 19" dans une baie 10". Motif du refus affiché.
- Ajout au clic : première place libre en partant du bas, message s'il n'y en a plus (il était posé au-dessus de la baie).
- Glisser-déposer : l'aperçu montre l'emplacement réel (il était décalé d'un U et figé en colonne 0), en rouge s'il est refusé.
- Équipement verrouillé : position, taille et suppression bloquées partout, pas seulement au glisser ; sa baie ne peut plus être supprimée.
- Synchronisation : une hauteur de catalogue plus grande n'est reprise que si elle tient.
- Numérotation « 1 en haut » : les équipements ne s'affichent plus en miroir de l'endroit où on les a posés ; le champ Position et les exports suivent la numérotation affichée.
- Création de baie : nom par défaut en 10" correct, hauteur hors limites signalée.

### Ajouté
- Modifier une baie (⚙) : nom, format, hauteur, numérotation, avec refus si des équipements ne tiennent plus.
- Confirmation avant de supprimer une baie.
- Badge « orphelin » pour un équipement dont le produit n'est plus sur aucun synoptique.

## [2026-11-17] Lot 2 : droits et confidentialité

### Sécurité
- Mots de passe des équipements masqués par défaut (bouton pour les afficher), absents de tous les modèles d'export, jamais affichés ni exportés en lecture seule ; l'export JSON en lecture seule les retire.
- Un projet n'enregistre plus que les fiches produits qu'il utilise : le catalogue complet, fiches en attente de modération comprises, ne part plus chez les destinataires d'un partage.
- Lecture seule garantie par le store : toute action qui modifie le projet est sans effet en lecture seule, quel que soit le bouton ou le raccourci ; la légende globale d'un administrateur n'est plus modifiable depuis une version archivée.
- Ouverture depuis le Référentiel et retour après F5 : le rôle de partage est vérifié (lecteur → lecture seule). Le rôle lu est celui du compte connecté.

### Corrigé
- Échec de création de projet : message sur la page Projets au lieu d'un éditeur sans identifiant.
- Échec d'enregistrement : motif affiché (droit retiré, projet supprimé, réseau) ; sans droit, l'enregistrement automatique s'arrête au lieu de réessayer toutes les 4 secondes.
- Confirmation avant de fermer l'onglet du navigateur, de se déconnecter avec des modifications non enregistrées, de fermer un onglet non vide, de recharger ou d'écraser en cas de conflit.

## [2026-11-17] Lot 1 : pertes de données

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

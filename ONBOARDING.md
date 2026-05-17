# SynoX — Guide utilisateur

**SynoX** est l'outil de dessin de synoptiques audiovisuels de Vidéo Synergie.  
Il permet de créer des schémas de câblage AV, des tableaux IP et des plans de baies rack, puis de les exporter en PDF professionnel (A3 paysage).

🌐 **URL** : https://benoitbarreau.github.io/APPBE/

---

## Sommaire

1. [Connexion](#1-connexion)
2. [Page Projets](#2-page-projets)
3. [Interface de l'éditeur](#3-interface-de-léditeur)
4. [Onglet Synoptique](#4-onglet-synoptique)
5. [Onglet Tableau IP](#5-onglet-tableau-ip)
6. [Onglet Baie Rack](#6-onglet-baie-rack)
7. [Cartouche & métadonnées projet](#7-cartouche--métadonnées-projet)
8. [Export & Impression](#8-export--impression)
9. [Versioning & partage](#9-versioning--partage)

---

## 1. Connexion

- Rendez-vous sur l'URL de l'application.
- Connectez-vous avec votre e-mail et mot de passe.
- Si votre compte est en attente d'approbation, un message vous l'indique.
- Les comptes sont approuvés par un administrateur Vidéo Synergie.

---

## 2. Page Projets

### Mes projets
La page d'accueil affiche vos projets en haut de la page (ceux dont vous êtes propriétaire).

### Projets partagés
Une section repliable **"Projets partagés"** apparaît en bas — elle liste les projets que d'autres utilisateurs ont partagés avec vous. Elle est repliée par défaut.

### Actions disponibles sur chaque projet
| Action | Description |
|--------|-------------|
| **Ouvrir** | Ouvre le projet dans l'éditeur |
| **Archiver / Désarchiver** | Bascule le projet entre actif et archive |
| **Supprimer** | Supprime définitivement le projet |
| **Dupliquer** | Crée une copie indépendante du projet |
| **Partager** | Invite d'autres utilisateurs à accéder au projet |

### Créer un nouveau projet
Cliquez sur **"+ Nouveau projet"** pour créer un projet vierge.

### Filtres & recherche
Utilisez la barre de recherche pour filtrer par nom. Un bouton bascule permet d'afficher les projets archivés.

---

## 3. Interface de l'éditeur

### Navigation par onglets
Un projet contient un ou plusieurs **onglets** en haut de l'interface :
- **Synoptique** : canvas graphique de câblage AV
- **Tableau IP** : tableau de gestion des adresses réseau
- **Baie** : plan de baie rack 19"/10"

> **Fit View automatique** : au clic sur un onglet Synoptique, la vue se recentre et s'adapte automatiquement au contenu (animation 300 ms). Idem à l'ouverture d'un projet.

### Ajouter un onglet
Cliquez sur **"+"** à droite des onglets et choisissez le type d'onglet à créer.

### Renommer un onglet
Double-clic sur le nom de l'onglet pour le renommer.

### Dupliquer / Supprimer un onglet
Les boutons ⎘ (dupliquer) et ✕ (supprimer) sont visibles à droite du nom de chaque onglet.

### Sauvegarde
La sauvegarde est automatique. Vous pouvez aussi forcer une sauvegarde avec le bouton **"Enregistrer"** dans la barre du haut.

### Mode lecture seule
Quand vous consultez une version archivée, l'éditeur passe en mode lecture seule (aucune modification possible).

---

## 4. Onglet Synoptique

### Ajouter un produit
1. Ouvrez la **Palette** (bouton en haut à gauche).
2. Recherchez un produit par nom, fabricant ou catégorie.
3. **Faites glisser** le produit sur le canvas.

> Pour créer un **bloc vierge** (produit non catalogué), utilisez l'option "Bloc vierge" dans la palette.

### Câbler deux produits
- Survolez un **port** d'un produit (cercle coloré sur le côté).
- Cliquez et **faites glisser** vers un port de destination.
- Le câble s'affiche en couleur selon le type de signal.

Les câbles sont **orthogonaux** (segments H/V uniquement) avec :
- Arcs de croisement aux intersections
- Arrondi des angles (6 px)
- Distance minimale automatique de 10 px entre câbles parallèles

### Déplacer un segment de câble
Cliquez-glissez sur un segment du câble pour le repositionner manuellement.

### Sélectionner, déplacer, supprimer
- **Clic** : sélectionne un produit ou un câble.
- **Clic + glisser** : déplace un produit.
- **Suppr / Backspace** : supprime la sélection.
- **Ctrl+Z** : annuler / **Ctrl+Y** : refaire.

### Autolayout
Le bouton **"Autolayout"** réorganise automatiquement les produits du canvas avec l'algorithme Dagre (gauche → droite).

### Blocs texte & formes
- Insérez des **blocs texte** libres via le menu "+" de la barre d'outils.
- Ajoutez des **formes géométriques** (rectangle, ellipse) pour délimiter des zones visuelles.

### Zones
Les zones permettent de regrouper les produits (ex. Baie, Régie) :
- Panneau **Zones** (onglet droite) : créez, renommez, colorez.
- Chaque produit peut être assigné à une zone depuis ses propriétés.

### Panneau droite — Câbles, Étiquettes, Labels, Légende, Zones
Le panneau à droite de l'éditeur contient plusieurs onglets :
| Onglet | Contenu |
|--------|---------|
| **Câbles** | Liste de tous les câbles du projet avec numéros, types, longueurs |
| **Étiquettes** | Étiquettes de câbles (type, longueur affichés sur le canvas) |
| **Labels** | Labels texte affichés sur les produits |
| **Légende** | Définition des types de câbles (couleur, nom, préfixe de numérotation) |
| **Zones** | Gestion des zones du projet |

### Numérotation des câbles
Chaque câble reçoit un numéro automatique basé sur le préfixe du signal (ex. "IP1", "HDMI3"). Modifiable dans le panneau Câbles.

### Pages d'impression
Ajoutez des **nœuds de page** sur le canvas pour définir les zones d'impression (format A3 paysage). Chaque page deviendra une page distincte dans l'export PDF.

### Synchroniser avec le Tableau IP
Le bouton **"Synchroniser"** dans la barre synoptique met à jour le Tableau IP avec les produits et câbles du synoptique.

---

## 5. Onglet Tableau IP

L'onglet Tableau IP regroupe les informations réseau du projet :
- **Équipements** : liste des devices avec adresses IP, VLAN, informations de connexion
- **Réseau** : configuration du réseau (plage, masque, passerelle, DNS)

### Remplir le tableau
- Cliquez sur une cellule pour l'éditer directement.
- Les colonnes disponibles : Désignation, Référence, Adresse MAC, IP, VLAN, Login, Mot de passe, Notes.

### Import / Export du Tableau IP
- **Import** : importez un fichier CSV pour remplir le tableau automatiquement.
- **Export** : exportez le tableau en CSV ou XLS.

### Synchronisation avec les synoptiques
Utilisez le bouton **"Synchroniser"** pour mettre à jour automatiquement le Tableau IP depuis les produits et câbles des onglets Synoptique.

---

## 6. Onglet Baie Rack

### Créer une baie
À la création d'un onglet Baie, définissez :
- **Nom** de la baie
- **Largeur** (19" ou 10")
- **Hauteur** (en U, ex. 42U)

### Ajouter plusieurs baies
Cliquez sur **"+ Ajouter une baie"** pour ajouter une seconde baie dans le même onglet.

### Remplir une baie
1. Ouvrez la **bibliothèque de produits** (panneau gauche).
2. **Faites glisser** un produit depuis la bibliothèque vers la baie.
3. Cliquez sur un équipement pour voir et modifier ses propriétés (IP, port switch, VLAN, N° de série).

### Synchroniser les labels depuis le synoptique
Le bouton **"⟳ Synchroniser"** dans la barre de la baie met à jour automatiquement les labels et références des équipements depuis les données du synoptique.

### Numérotation
Choisissez la numérotation **du bas vers le haut** ou **du haut vers le bas** selon votre convention.

---

## 7. Cartouche & métadonnées projet

Le **cartouche** est affiché en bas à droite de chaque page exportée (et à l'écran sur le synoptique).  
Il contient les métadonnées du projet :

| Champ | Description |
|-------|-------------|
| **Client** | Nom du client |
| **Lieu** | Lieu de l'installation |
| **Campus / Salle** | Nom du projet |
| **Lot** | Nom de l'onglet (synoptique ou baie) |
| **Auteur** | Nom du bureau d'étude |
| **Date** | Date du document |
| **Version** | Version du document (ex. V1.0) |
| **Logo** | Logo affiché dans le cartouche — changez-le en cliquant dessus dans le cartouche visible à l'écran |

Remplissez ces champs dans le **cartouche visible** à droite du canvas synoptique ou via le menu Projet.

---

## 8. Export & Impression

### Format A3 paysage
Tous les exports PDF, JPEG et impressions sont en **A3 paysage** à haute résolution (~300 dpi).

La page exportée est composée de :
- **Zone de dessin** (haut) : le synoptique ou la baie, centré et agrandi au maximum
- **Bande inférieure** avec :
  - **Légende câbles** (gauche) — uniquement si des câbles sont présents
  - **Mention légale** (centre)
  - **Cartouche** (droite, 25 % de la largeur)

### Légende des liaisons câbles (synoptiques)
La légende s'affiche automatiquement à gauche de la bande inférieure lorsque des câbles sont présents sur la page :
- **Filtrée par page** : seuls les types de câbles réellement utilisés sur chaque page sont affichés
- Les libellés affichés correspondent à la colonne **"Type de câble"** de votre panneau Légende
- Disposition : max 3 entrées par colonne, colonnes remplies de haut en bas
- Chaque entrée affiche une ligne colorée, une flèche, et un badge avec le nom du câble
- Si aucun câble sur la page → la légende n'apparaît pas

### Export depuis un onglet Synoptique
Cliquez sur **"⬇ Exporter ▾"** dans la barre d'outils pour choisir le format :
| Format | Description |
|--------|-------------|
| **PDF** | Document PDF A3 paysage, une page par page du canvas |
| **PNG** | Image PNG haute résolution |
| **JPEG** | Image JPEG (légèrement compressée) |
| **SVG** | Vecteur (compatible Visio, AutoCAD, Illustrator) |

Cliquez sur **"🖨 Imprimer"** pour ouvrir la prévisualisation impression.

> **Export multi-onglets** : si votre projet contient plusieurs onglets Synoptique, une boîte de dialogue vous demande d'exporter l'onglet actif ou tous les onglets. Pour un PDF multi-onglets, toutes les pages sont regroupées dans un seul fichier.

### Export depuis un onglet Baie
La barre de la baie contient ses propres boutons d'export :
| Format | Description |
|--------|-------------|
| **PDF** | Baie en A3 paysage avec cartouche |
| **JPEG** | Image JPEG de la baie |
| **CSV** | Tableau des équipements (Position U, Hauteur, Fabricant, Référence, Label, IP, Port switch, VLAN, N° série) |
| **XLS** | Même tableau au format Excel |
| **🖨 Imprimer** | Prévisualisation impression de la baie |

### Export depuis un onglet Tableau IP
Le bouton d'export du Tableau IP permet d'exporter en **CSV** ou **XLS**.

---

## 9. Versioning & partage

### Sauvegarde des versions
Chaque fois que vous sauvegardez, une **version archivée** est créée automatiquement.  
Vous pouvez consulter et restaurer les versions depuis la page Projets (bouton historique sur la carte du projet).

### Partager un projet
1. Cliquez sur **"Partager"** sur la carte du projet (page Projets).
2. Entrez l'adresse e-mail de l'utilisateur à inviter.
3. Choisissez le niveau d'accès : **Lecture** ou **Édition**.

> Les utilisateurs invités voient le projet dans leur section "Projets partagés".

### Consulter une version archivée
1. Cliquez sur **"Historique"** depuis la carte du projet.
2. Sélectionnez une version pour l'ouvrir en **mode lecture seule**.
3. Vous pouvez la restaurer ou la télécharger depuis cette vue.

---

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl + Z` | Annuler |
| `Ctrl + Y` | Refaire |
| `Ctrl + S` | Sauvegarder |
| `Suppr` / `Backspace` | Supprimer la sélection |
| `Échap` | Désélectionner / Annuler une action |
| `Ctrl + clic` | Sélection multiple |
| Molette souris | Zoom avant/arrière |
| Clic + glisser (canvas vide) | Déplacer la vue |

---

*SynoX — Vidéo Synergie · Bureau d'étude AV*

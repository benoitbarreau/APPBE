# Générateur de synoptiques AV

Première version d'une application web pour concevoir des synoptiques d'installations audiovisuelles (matrices, écrans, caméras, DSP, micros, etc.) et générer automatiquement la liste des câbles.

## Fonctionnalités v0.1

- Catalogue produits avec marque, référence, catégorie, entrées et sorties typées (HDMI, RJ45, USB, USB-C, RS232, DTP/HDBaseT, eBUS, audio, HP, Dante, PoE, fibre…).
- Création / édition / suppression de produits (ajout libre d'entrées / sorties).
- Import depuis un catalogue local + depuis un fichier JSON ; point d'entrée prêt à brancher sur une vraie API constructeur (`searchVendorCatalog` dans `src/catalog.ts`).
- Glisser/poser de produits sur un canvas zoomable (React Flow).
- Création de liaisons en tirant un port de sortie vers un port d'entrée. Couleur automatique selon le type de signal, avec confirmation si les types ne correspondent pas.
- Pour chaque câble : type, longueur en mètres, libellé.
- Liste des câbles + récapitulatif quantité/longueur par type, export CSV.
- Sauvegarde automatique du projet dans le navigateur (localStorage), export JSON du projet.

## Démarrage

```bash
npm install
npm run dev
```

Puis ouvrez http://localhost:5173.

## Roadmap envisageable

- Connexion réelle à l'API Extron / Crestron / Viewsonic / Lindy pour récupérer fiches produits + entrées/sorties pré-renseignées.
- Génération automatique du dessin façon Visio (alignements, libellés style "RJ45 15M IP1 - VIGNETTAGE").
- Export PDF/SVG du synoptique.
- Plusieurs salles / pages dans un même projet, palette de commande client (boutons ON, OFF, ZOOM, HDMI…).
- Multi-utilisateur / backend partagé.

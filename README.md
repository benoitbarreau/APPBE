# SynoX — Générateur de synoptiques Audiovisuel

Application web pour concevoir des synoptiques d'installations audiovisuelles (matrices, écrans, caméras, DSP, micros, etc.) avec sauvegarde cloud par utilisateur et gestion des droits d'accès.

---

## Fonctionnalités

### Onglets de projet

Un projet peut contenir plusieurs onglets de deux types :

- **Synoptique** — canvas câblé (voir ci-dessous)
- **Baie** — vue rack 19"/10" (voir ci-dessous)

---

### Synoptique

- Catalogue produits avec marque, référence, catégorie, entrées et sorties typées (HDMI, RJ45, USB, USB-C, RS232, DTP/HDBaseT, audio, HP, Dante, PoE, fibre…)
- Création / édition de produits, ajout libre d'entrées / sorties
- Glisser/poser de produits sur un canvas zoomable (React Flow)
- Création de liaisons câblées avec couleur automatique par type de signal
- Zones nommées et colorées (Baie, Régie, etc.)
- Auto-layout pour minimiser les croisements
- Export PNG, JPEG, SVG, PDF, JSON

---

### Panneau Outils — commun à tous les synoptiques

Les panneaux **Câbles**, **Étiquettes câbles** et **Labels produits** agrègent les données de **tous les onglets synoptiques** du projet. L'édition (type, longueur, label, zone…) reste restreinte au synoptique actuellement actif ; les lignes des autres onglets s'affichent en lecture seule avec un badge indiquant leur synoptique d'origine.

#### Câbles
- Liste des câbles groupée par synoptique avec en-têtes de section
- Récapitulatif global : quantité et longueur totale par type de câble
- Modification du type, de la longueur et de l'étiquette de chaque câble (onglet actif)
- Inversion du sens de la flèche
- Suppression d'un câble (onglet actif)
- Export CSV

#### Étiquettes câbles
- Vue **simple** (N°, Synoptique, Type) ou **détaillée** (+ Étiquette et Longueur)
- Double-clic sur une étiquette ou une longueur pour les modifier (onglet actif)
- Tri par colonne (N°, Synoptique, Étiquette, Type, Longueur)
- Badge coloré indiquant le synoptique d'origine de chaque câble
- Export CSV et XLS

#### Labels produits
- Tableau de tous les nœuds de tous les synoptiques
- Modification du label et de la zone (onglet actif)
- Tri par colonne (Label, Référence, Zone, Synoptique)
- Réordonnement par glisser/déposer (onglet actif uniquement)
- Export CSV et XLS

---

### Module Baie (Rack)

- Vue rack 19" ou 10" avec numérotation des unités (U)
- **Plusieurs baies côte à côte** dans un même onglet Baie, chacune avec un nom éditable
- Ajout / suppression de baies au sein d'un onglet
- Bibliothèque de produits glissables depuis les synoptiques du projet (avec zone et nom du synoptique en italique)
- Accessoires personnalisés (câbles de brassage, panneaux vierges, cornières…)
  - Logo PNG par accessoire, affiché en haut à droite dans le visuel du rack
- Déplacement des équipements par glisser/déposer dans la baie
- Détection des collisions lors du placement
- Propriétés par équipement : couleur, annotations, verrouillage, référence
- **Synchronisation** des labels et références depuis les synoptiques (bouton ⟳)

---

### Authentification & rôles

- Inscription / connexion par email + mot de passe (Supabase Auth)
- Réinitialisation de mot de passe par email
- Validation des comptes par un administrateur (statuts : en attente / approuvé / refusé)
- **Rôle `admin`** : accès au tableau de bord de gestion des utilisateurs, suppression de produits du catalogue, accès à tous les projets
- **Rôle `user`** : accès uniquement à ses propres projets

---

### Sauvegarde cloud

- **Nouveau** : crée un projet vierge
- **Sauvegarder** : enregistre le projet complet en base (Supabase) — synoptiques, baies et accessoires personnalisés inclus
- **Projets** : liste et ouvre les projets sauvegardés
- Historique de versions (dernières sauvegardes)
- Sauvegarde locale automatique en localStorage entre les sessions
- Export JSON du projet complet

---

## Démarrage en local

Pré-requis : [Node.js 18+](https://nodejs.org) et un projet [Supabase](https://supabase.com).

### 1. Variables d'environnement

Créer un fichier `.env` à la racine :
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 2. Base de données Supabase

Exécuter les migrations dans Supabase → SQL Editor dans l'ordre :
1. `supabase/migrations/001_init.sql` — table `profiles`, RLS, trigger inscription
2. `supabase/migrations/002_projects.sql` — table `projects`, RLS par utilisateur/admin

### 3. Configuration Supabase

Dans Supabase → Authentication → Settings :
- Désactiver **Confirm email** (ou confirmer manuellement les comptes tests)

### 4. Premier administrateur

Après la première inscription, passer le compte en admin via SQL Editor :
```sql
INSERT INTO public.profiles (id, email, full_name, status, role)
SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', email), 'approved', 'admin'
FROM auth.users WHERE email = 'votre@email.com'
ON CONFLICT (id) DO UPDATE SET status = 'approved', role = 'admin';
```

### 5. Lancer l'application

```bash
git clone -b claude/av-diagram-generator-DvBJA https://github.com/benoitbarreau/APPBE.git
cd APPBE
npm install
npm run dev
```

Ouvrir http://localhost:5173

---

## Déploiement GitHub Pages

À chaque push sur `main` ou `claude/av-diagram-generator-DvBJA`, GitHub Actions construit et déploie sur : **https://benoitbarreau.github.io/APPBE/**

Pré-requis (à faire une fois) :
- *Settings → Pages → Source = GitHub Actions*
- *Settings → Secrets → Actions* : ajouter `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`

---

## Architecture

| Couche | Technologie |
|--------|-------------|
| UI | React 18 + TypeScript + Vite 5 |
| Diagramme | React Flow (@xyflow/react) |
| État | Zustand (persist — localStorage) |
| Backend | Supabase (Auth + PostgreSQL + RLS) |
| Déploiement | GitHub Pages via GitHub Actions |

---

## Roadmap

- Connexion API Extron / Crestron / Viewsonic pour fiches produits automatiques
- Partage de projet entre utilisateurs
- Export PDF de la vue Baie

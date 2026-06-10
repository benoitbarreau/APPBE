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

### Catalogue produits

- Vue par **tuiles Marques** (avec logos) et **tuiles Catégories** (avec couleurs et logos)
- Détail d'une marque : bandeau latéral de navigation entre marques + produits groupés par catégories repliables
- Recherche, filtres par statut (Intégrés / Commun / Mes fiches / En attente) et filtres avancés (hauteur rack, image, PDF)
- Aperçu rapide d'un produit en panneau latéral (specs, ports, fiches techniques)
- Sélection multiple avec actions groupées (approbation admin, export CSV)
- **Modération** : les fiches créées par un utilisateur sont `pending` jusqu'à validation par un admin ; archivage réversible des fiches du catalogue commun
- Import / export CSV du catalogue
- Fiches produit : dimensions, poids (kg/lbs), consommation, dissipation BTU/h, images face/dos, fiches techniques PDF multiples (glisser-déposer)

---

### Référentiel clients

- **Clients** → **Sites** → **Salles** : hiérarchie complète avec fiches détaillées
- Logo client (fichier ou URL), SIRET avec lien Infogreffe, gestionnaire de compte assignable
- **Contacts** par client, assignables aux salles
- **Documents** par salle : PDF, images (upload multiple), liens externes (SharePoint…), exports SynoX
- Liaison salle ↔ projets SynoX (créer un projet depuis une salle, lier un projet existant)
- Suppression douce des clients (archivage restaurable par un admin)

---

### Authentification & rôles

- Inscription / connexion par email + mot de passe (Supabase Auth)
- Réinitialisation de mot de passe par email
- Validation des comptes par un administrateur (statuts : en attente / approuvé / refusé)
- **Rôle `admin`** : accès au tableau de bord, modération du catalogue, accès à tous les projets
- **Rôle `user`** : accès uniquement à ses propres projets et aux projets partagés avec lui

---

### Tableau de bord admin

- **Utilisateurs** : approbation des inscriptions, gestion des rôles, édition, suppression
- **Invitations** : création directe de comptes (email d'invitation ou mot de passe provisoire)
- **Catalogue** : gestion des marques et catégories (couleurs via palette de 48 teintes, sync depuis les produits)
- **Archives** : restauration ou suppression définitive des fiches produit archivées
- **Journal** : historique des actions admin (approbations, invitations, suppressions…)

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

Exécuter **toutes les migrations** de `supabase/migrations/` dans Supabase → SQL Editor, **dans l'ordre des numéros** (001 → 027). Aperçu des principales :

| Migrations | Contenu |
|---|---|
| 001–003c | Profils, projets, partage de projets, RLS |
| 004–006b | Catalogue produits utilisateur + référentiel marques/catégories |
| 007–010 | Versions de projets, signaux & zones par utilisateur |
| 011 | **Modération du catalogue** (statuts pending/approved, archivage) |
| 012–015 | Webhook admin, profil société, correctifs RLS |
| 016–022 | **Référentiel** : clients, sites, salles, documents, contacts, gestionnaire, suppression douce |
| 023–025 | Zones utilisateur, journal admin, fiches techniques PDF |
| 026–027 | Logos des marques et catégories du catalogue |

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
- ~~Partage de projet entre utilisateurs~~ ✅ fait
- ~~Export PDF de la vue Baie~~ ✅ fait

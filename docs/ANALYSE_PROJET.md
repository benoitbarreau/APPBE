# SynoX — Analyse et référence du projet

Analyse du dépôt local le 8 octobre 2026. Ce document conserve la compréhension de l'architecture et les constats utiles pour les prochaines interventions.

## Portée et vérification

Inventaire de tous les fichiers applicatifs, cartographie des imports et des usages du store, lecture approfondie des modèles, de la persistance, de l'authentification, des API, des fonctions serveur et des principales politiques SQL. Inspection ciblée des composants et de leurs interactions. Ce travail n'est pas une validation exhaustive de chaque interaction utilisateur ou de chaque ligne de CSS.

- `npm run typecheck` : réussi.
- `npm run build` : réussi ; 738 modules transformés.
- Avertissement Vite : bundle principal de 1 471,62 ko, 443,64 ko gzip.
- Reproduction isolée du défaut de synchronisation IP : deux lignes produites avec un seul identifiant unique ; une seule ligne conservée par le filtre d'affichage.
- Aucun dispositif de tests automatisés trouvé dans le dépôt hors dépendances ; aucun script de test ou de lint dans package.json.
- Les fonctions Deno ne sont pas incluses dans le typecheck frontend (`tsconfig.json` inclut seulement `src`).
- Base Supabase distante, secrets, webhooks et comportement en production non vérifiés. Les constats SQL décrivent les migrations versionnées, pas nécessairement les règles actuellement déployées.
- Aucun changement de code métier ou de base effectué pendant l'analyse.

## Produit et parcours

SynoX est une application web de bureau d'études audiovisuel. Elle produit les documents d'installation et centralise les données des équipements et clients.

1. Authentification email/mot de passe, inscription, récupération de mot de passe.
2. Validation administrative des comptes : pending, approved, rejected ; rôles user et admin.
3. Accueil donnant accès aux projets, au catalogue et au référentiel.
4. Projet contenant plusieurs onglets : synoptique, tableau IP ou baie.
5. Synoptique : produits et blocs vierges, ports personnalisés par instance, câbles, zones, textes, formes, images, groupes, mise en page et exports.
6. Tableau IP : équipements, IP principale et Dante, MAC, identifiants de connexion, numéros de série, colonnes personnalisées, doublons, import et export.
7. Baie : plusieurs racks 10 ou 19 pouces, placement en unités U et quarts de largeur, accessoires, collision, verrouillage, annotations et synchronisation.
8. Catalogue : fiches intégrées et cloud, modération, archives, marques/catégories/logos, PDF et complétion IA.
9. Référentiel : clients → sites → salles, contacts, documents et liens vers les projets, gestionnaire de compte, archivage client.
10. Administration : comptes, invitations, métadonnées catalogue, archives et journal.

## Technologies et exécution

| Rôle | Technologie |
| --- | --- |
| Interface | React 18, TypeScript strict |
| Développement et compilation | Vite 5 |
| Éditeur graphique | React Flow 12 (`@xyflow/react`) |
| État applicatif | Zustand 4 |
| Annuler/refaire | zundo, 50 instantanés de canvas |
| Placement automatique | Dagre, orientation gauche → droite |
| Captures et PDF | html-to-image, jsPDF |
| Backend | Supabase Auth, PostgreSQL, Storage, Edge Functions Deno |
| Extraction PDF | Google Gemini 2.5 Flash |
| Emails | Resend |
| Hébergement | GitHub Pages, chemin `/APPBE/` |

Les commandes disponibles sont dev, build, preview et typecheck. Le lockfile est présent. Les plages de versions des dépendances autorisent des mises à jour ; les versions installées sont déterminées par le lockfile lors de `npm ci`.

L'entrée `src/main.tsx` monte StrictMode → AuthProvider → ProtectedRoute, avec DialogHost global. ProtectedRoute assure à la fois la protection d'accès et la navigation entre pages par état React ; il n'y a pas de dépendance de routage dédiée.

## Organisation et responsabilités

| Zone | Responsabilité |
| --- | --- |
| `src/types.ts` | Modèles métier et valeurs par défaut |
| `src/store.ts` | État, mutations métier, migrations locales, synchronisations |
| `src/App.tsx` | Éditeur, sauvegarde, versionnage, conflits, navigation des onglets, exports |
| `src/auth/` | Session, profil, accès et restauration de la vue |
| `src/pages/` | Accueil, projets, catalogue, référentiel, administration |
| `src/components/` | Diagramme, panneaux, tableaux et dialogues |
| `src/components/product-editor/` | Formulaire produit, ports, médias, propositions IA |
| `src/components/bay/` | Planificateur rack et accessoires |
| `src/lib/` | Accès cloud, imports/exports et fonctions métier réutilisables |
| `src/export.ts` | Pagination, capture, cartouche, légende, PDF et impression |
| `src/ports.ts` | Connectique effective après surcharges d'instance |
| `src/layout.ts` | Placement automatique Dagre |
| `src/catalog.ts` | Catalogue intégré et recherche constructeur locale |
| `src/styles.css` | Styles globaux : 12 720 lignes |
| `supabase/migrations/` | Évolution du schéma, fonctions SQL et droits |
| `supabase/functions/` | Quatre fonctions serveur |
| `.github/workflows/` | Compilation, Pages et déploiement des fonctions |
| `public/` | Logos, favicon et guide utilisateur HTML |
| `README.md`, `ONBOARDING.md` | Installation et documentation utilisateur |

## Modèle métier

Un Product décrit une référence catalogue : fabricant, catégorie, connectique, caractéristiques physiques, rack, alimentation, images et fiches techniques. Un PlacedProduct représente une occurrence dans un synoptique, avec position, label, zone et surcharges de ports. Cette distinction est essentielle : personnaliser une instance doit préserver la fiche commune.

Un Cable référence les identifiants des deux instances et des ports ; il conserve type de signal, câble, numéro, longueur, label, sens et points de passage.

Un Tab contient les données adaptées à son kind. L'absence de kind est interprétée comme un ancien synoptique. Les baies acceptent le format historique mono-rack et le format actuel `racks[]`. Les tableaux IP relient leurs lignes aux instances graphiques par `productInstanceIds`.

Les zones sont actuellement globales au projet, même si des champs legacy restent dans Tab. Les signaux sont ceux du projet, avec possibilité de surcharge par les signaux personnels administrateur. Les colonnes IP sont partagées au niveau projet.

## État et flux de données

Le store principal persiste sous la clé localStorage `av-diagram-generator`, schéma local version 14. Il porte catalogue, projet ouvert, onglets, métadonnées, accessoires et données du canvas actif. Deux stores supplémentaires portent les métadonnées catalogue et les préférences/modes de l'éditeur.

Les objets graphiques de l'onglet actif sont aussi conservés dans des champs de travail au sommet du store. `flushActive` et `getFlushedTabs` recopient ces champs dans l'onglet avant un changement ou une sauvegarde. Une lecture directe de `tabs` peut donc être périmée pour le synoptique actif.

À la connexion, le frontend charge séparément les produits cloud, signaux, zones et marques/catégories. Plusieurs échecs sont silencieux et utilisent l'état local comme secours. `clearForUser` tente d'isoler les utilisateurs. Les projets anciens et les racks legacy sont migrés lors du chargement.

Le catalogue courant est prioritaire sur les produits embarqués dans un projet lors de `loadProjectData`. Conséquence : ouvrir une version archivée peut rendre un produit avec sa fiche catalogue actuelle, plutôt qu'avec ses caractéristiques historiques.

Le tableau IP regroupe les occurrences par produit et label normalisé. La synchronisation préserve les lignes manuelles et les valeurs renseignées, rafraîchit les colonnes dérivées et retire les anciennes lignes automatiques sans correspondance. L'édition de labels peut se propager aux instances liées.

## Sauvegarde et versions

Le projet est stocké principalement en JSONB dans `projects.data`. Les champs nom, client, lieu, archive, salle et dates facilitent l'affichage et les filtres.

- Détection des modifications par signatures calculées sur les onglets flushés et les autres données.
- Vérification périodique toutes les 2 secondes ; sauvegarde après environ 4 secondes de stabilité, ou 60 secondes de modifications continues.
- Pas d'auto-save cloud tant qu'un projet n'a pas d'identifiant.
- Sauvegarde manuelle : crée un snapshot si le contenu versionnable a changé, augmente la version de 0,1 et conserve trois snapshots.
- Auto-save : ne crée pas de snapshot et n'augmente pas la version.
- Concurrence optimiste par filtre sur `updated_at`, avec choix de recharger ou écraser en cas de conflit.
- Garde de sortie pour les modifications non enregistrées.

La signature complète inclut colonnes IP et cartouche, mais pas `currentProjectName`. Les versions sont écrites et purgées avant la sauvegarde principale : ces étapes ne constituent pas une transaction atomique.

## Diagramme et documents

DiagramCanvas assemble les nœuds React Flow, gère déplacements, sélection, groupes, copie, alignement et câblage. ProductNode utilise les ports effectifs. Les ports peuvent être déplacés, renommés, masqués, dupliqués ou ajoutés par instance ; des espaces et séparateurs servent à la présentation.

CableEdge contient le routage orthogonal, la simplification des points, la détection d'obstacles et croisements, les arcs et le déplacement des segments/labels. Le routage et le placement Dagre sont deux mécanismes distincts.

Les panneaux câbles, étiquettes et labels agrègent plusieurs synoptiques. Les actions d'édition se concentrent sur le synoptique actif.

Les exports graphiques capturent le DOM React Flow, puis composent des pages A3 paysage avec cartouche, légende filtrée et mentions. Les PDF incorporent des images ; les SVG passent par html-to-image. La compatibilité avec les outils de CAO nécessite une vérification pratique. Les images distantes dépendent de leurs règles CORS.

Les exports XLS sont des tableaux HTML avec extension XLS, pas des classeurs XLSX natifs. Deux chemins de CSV produit coexistent : `productImportExport.ts` conserve les ports en JSON ; `catalogueApi.ts` exporte surtout des caractéristiques et des nombres de ports. Ils ne sont pas équivalents pour restaurer une fiche complète.

## Backend et données

Tables principales : profiles, projects, project_shares, project_versions, user_products, catalog_brands, catalog_categories, user_signals, user_zones, clients, sites, rooms, ref_documents, contacts, room_contacts et admin_logs.

Les projets partagés ont des rôles viewer/editor. Les politiques SQL utilisent des fonctions SECURITY DEFINER pour éviter les récursions entre projets et partages. Les produits cloud ont un statut pending/approved et un archivage séparé. Le référentiel hérite majoritairement des droits du propriétaire client ; le gestionnaire reçoit des droits supplémentaires sur le client.

Buckets : company-logos public (2 Mo), client-logos public (5 Mo), product-datasheets public (20 Mo), ref-documents privé (50 Mo). Les documents privés s'ouvrent avec des URL signées valables une heure.

| Fonction serveur | Fonctionnement |
| --- | --- |
| admin-update-user | Vérifie le jeton et le rôle admin ; modifie Auth et profiles |
| invite-user | Vérifie le rôle admin ; génère une invitation Resend ou crée un compte avec mot de passe |
| notify-admin-new-user | Reçoit un événement profil et envoie une notification Resend |
| complete-product | Vérifie un utilisateur Auth ; télécharge un PDF et demande une extraction structurée à Gemini |

Les propositions IA sont présentées à l'utilisateur avant application. Le serveur limite le PDF à 15 Mo, mais vérifie la taille après téléchargement complet. Les clés de service et des prestataires sont utilisées côté serveur.

## Déploiement

GitHub Actions se déclenche sur main et sur la branche `claude/av-diagram-generator-DvBJA`, ou manuellement. Le frontend utilise Node 24, npm ci et npm run build. Le déploiement des fonctions est conditionné par la variable SUPABASE_PROJECT_ID et utilise un token CLI.

Les quatre fonctions sont déployées avec `--no-verify-jwt` : la vérification doit donc être assurée par chaque fonction. Les migrations ne sont pas appliquées par ce workflow. Le chemin Vite est fixé à `/APPBE/` ; l'environnement BASE_PATH du workflow ne pilote pas cette valeur.

## Constats prioritaires

### 1. Notification admin accessible sans contrôle dans son code — priorité haute

Le workflow désactive la vérification JWT et notify-admin-new-user n'authentifie ni le demandeur ni l'origine webhook. Si ce déploiement est celui utilisé en production, un appel direct peut déclencher des emails arbitraires à l'adresse admin. Vérifier le déploiement réel puis protéger la fonction par un secret webhook ou un contrôle adapté.

### 2. Modification de tous les PDF par tout utilisateur authentifié — priorité haute

La migration 025 autorise UPDATE et DELETE sur tout le bucket product-datasheets, sans contrôle de propriétaire, de produit ni de statut approved. Un compte authentifié pourrait modifier ou supprimer des fichiers d'autres utilisateurs. La modération de la fiche ne protège pas ces objets Storage.

### 3. Changement de propriétaire d'un projet par un éditeur partagé — priorité haute

La politique shared_editors_update de la migration 015 impose seulement `WITH CHECK (true)`. Elle ne limite pas les colonnes modifiées, notamment user_id. Un éditeur peut donc tenter de transférer le projet à son compte via l'API directe ; la politique propriétaire permettrait ensuite de le gérer. À vérifier contre les droits/contraintes de la base réelle.

### 4. Ligne IP masquée après synchronisation — défaut reproduit

Dans ipTableSync.ts, le fallback par label peut réutiliser une même ligne existante pour plusieurs groupes de produits différents. `consumedRowIds` est alimenté mais n'empêche pas cette réutilisation. Deux résultats ont alors le même id et la même IP ; dedupeRowsById masque l'un d'eux. Reproduction locale : deux résultats, un identifiant unique, une seule ligne visible.

### 5. Export « projet complet » incomplet — constat code

App.tsx exporte uniquement `{ products, tabs }`. Cartouche, signaux personnalisés, zones globales, accessoires personnalisés, configuration des colonnes IP et onglet actif ne sont pas tous conservés. Ce fichier ne représente donc pas toute la structure sauvegardée dans le cloud.

### 6. Renommage seul non détecté pour l'auto-save — constat code

buildSignature ignore le nom du projet. Un renommage sans autre changement ne suffit pas à déclencher l'auto-save ou la garde de sortie. La sauvegarde manuelle écrit bien le nom.

### 7. Migrations 016 et 017 incompatibles en séquence brute — constat SQL

016 crée déjà les politiques ref_storage_select/insert/delete/admin ; 017 les recrée sans DROP ni vérification d'existence. Exécuter toutes les migrations comme le recommande le README peut échouer sur ces doublons.

### 8. Versions partagées/admin et atomisation — constat SQL/code

La gestion des snapshots est réservée au propriétaire dans 007, sans autorisation équivalente pour admin ou éditeur partagé. L'éditeur masque un échec d'archivage et poursuit la sauvegarde. L'historique peut donc manquer pour ces acteurs. Par ailleurs, un conflit à la sauvegarde principale peut survenir après création/purge des versions.

### 9. Gestionnaire de compte : droits incomplets — constat SQL

021 ajoute les droits sur clients mais pas sur sites, rooms, contacts, documents ou fichiers privés. Un gestionnaire qui n'est pas propriétaire/admin peut voir la fiche client sans accéder à toute sa hiérarchie. La politique de mise à jour client avec WITH CHECK true permet également de modifier des champs sensibles comme user_id si les privilèges de colonnes le permettent.

### 10. Remise à zéro utilisateur partielle — à tester en navigateur

clearForUser ne remet pas explicitement à zéro tous les champs : imageNodes, groups, métadonnées produit, archives, accessoires et buffers de module, notamment. Certaines données peuvent rester d'une session à l'autre. Une vérification avec deux comptes sur le même navigateur est nécessaire.

### 11. Contrôle approved hétérogène — constat SQL/code

Le frontend bloque pending/rejected, mais plusieurs politiques projets/référentiel et la fonction complete-product contrôlent l'identité ou le rôle sans vérifier approved. L'approbation UI ne constitue pas à elle seule une restriction sur les appels directs.

### 12. URL PDF arbitraire et quotas IA — à renforcer

complete-product accepte une URL sans restriction au bucket attendu et ne présente pas de limite d'usage par compte dans son code. Il faut limiter destinations, redirections, durée et volume téléchargé avant de traiter le PDF, puis contrôler le statut du compte et les quotas.

## Maintenabilité et suite recommandée

Le projet couvre un métier riche avec des modèles explicites, TypeScript strict, une séparation API/composants et des migrations de compatibilité. La compilation passe et les fonctions sensibles admin vérifient le rôle côté serveur.

Les principaux coûts de maintenance viennent du store central de 2 024 lignes, d'App de 1 401 lignes, des grands composants graphiques, du CSS global et des chemins d'import/export parallèles. La sérialisation fréquente du catalogue et des images en localStorage peut devenir coûteuse ; mesurer avec de gros projets.

Ordre conseillé : contrôler les règles de production et fermer les accès trop larges ; corriger les pertes de données (IP, JSON, nom) ; rendre les migrations reproductibles ; sécuriser la sauvegarde/versionnage ; ajouter des tests ciblés de synchronisation, sérialisation et droits ; mesurer et découper le chargement des modules lourds.

La documentation infrastructure est en retard sur les migrations 024–027 et ne liste pas le bucket product-datasheets. Le guide utilisateur décrit le versionnage de façon plus générale que le code actuel : les auto-saves ne créent pas de versions.

## Inventaire des fichiers applicatifs

La liste suivante couvre les sources, migrations et fonctions, avec leur taille en lignes. Les dépendances installées et les fichiers de compilation sont exclus.


### src

- `src/App.tsx` — 1401 lignes
- `src/auth/AuthContext.tsx` — 324 lignes
- `src/auth/ProtectedRoute.tsx` — 453 lignes
- `src/auth/useAuth.ts` — 8 lignes
- `src/catalog.ts` — 157 lignes
- `src/components/AdminSettings.tsx` — 450 lignes
- `src/components/CableEdge.tsx` — 914 lignes
- `src/components/CableList.tsx` — 376 lignes
- `src/components/Cartouche.tsx` — 86 lignes
- `src/components/DiagramCanvas.tsx` — 1047 lignes
- `src/components/EtiquettesList.tsx` — 337 lignes
- `src/components/ExportScopeModal.tsx` — 52 lignes
- `src/components/FormattingPanel.tsx` — 102 lignes
- `src/components/IPTableEditor.tsx` — 658 lignes
- `src/components/IPTableExportModal.tsx` — 183 lignes
- `src/components/IPTableImportModal.tsx` — 297 lignes
- `src/components/ImageImportModal.tsx` — 186 lignes
- `src/components/ImageNode.tsx` — 236 lignes
- `src/components/ImportDialog.tsx` — 472 lignes
- `src/components/InstancePortsConfig.tsx` — 447 lignes
- `src/components/Legend.tsx` — 229 lignes
- `src/components/PageNode.tsx` — 16 lignes
- `src/components/ProductEditor.tsx` — 686 lignes
- `src/components/ProductLabelsList.tsx` — 407 lignes
- `src/components/ProductNode.tsx` — 601 lignes
- `src/components/ProductPalette.tsx` — 465 lignes
- `src/components/ProductPreview.tsx` — 254 lignes
- `src/components/ShapeNode.tsx` — 280 lignes
- `src/components/ShareModal.tsx` — 232 lignes
- `src/components/TextNode.tsx` — 421 lignes
- `src/components/UnsavedChangesModal.tsx` — 59 lignes
- `src/components/ZonesList.tsx` — 95 lignes
- `src/components/auth/LoginForm.tsx` — 158 lignes
- `src/components/auth/RegisterForm.tsx` — 95 lignes
- `src/components/auth/UserEditModal.tsx` — 286 lignes
- `src/components/auth/UserTable.tsx` — 251 lignes
- `src/components/bay/BayAccessoryEditor.tsx` — 170 lignes
- `src/components/bay/BayCanvas.tsx` — 155 lignes
- `src/components/bay/BayCreateModal.tsx` — 113 lignes
- `src/components/bay/BayExportMenu.tsx` — 102 lignes
- `src/components/bay/BayItemProperties.tsx` — 267 lignes
- `src/components/bay/BayProductLibrary.tsx` — 428 lignes
- `src/components/bay/RackView.tsx` — 379 lignes
- `src/components/bay/bay-accessories.ts` — 45 lignes
- `src/components/dialogs/DialogHost.tsx` — 72 lignes
- `src/components/dialogs/dialogStore.ts` — 79 lignes
- `src/components/product-editor/AiCompleteDialog.tsx` — 232 lignes
- `src/components/product-editor/ImageField.tsx` — 61 lignes
- `src/components/product-editor/PdfField.tsx` — 142 lignes
- `src/components/product-editor/PortsEditor.tsx` — 166 lignes
- `src/components/product-editor/ProductPreviewPanel.tsx` — 144 lignes
- `src/components/product-editor/SpeakerPortEditor.tsx` — 72 lignes
- `src/components/product-editor/openImageTab.ts` — 14 lignes
- `src/components/product-editor/types.ts` — 2 lignes
- `src/components/product-editor/usePortOperations.ts` — 154 lignes
- `src/export.ts` — 1038 lignes
- `src/image.ts` — 32 lignes
- `src/layout.ts` — 52 lignes
- `src/lib/adminUserApi.ts` — 50 lignes
- `src/lib/aiCompleteApi.ts` — 70 lignes
- `src/lib/applyAiSpecs.ts` — 68 lignes
- `src/lib/bayExport.ts` — 257 lignes
- `src/lib/catalogMetaApi.ts` — 168 lignes
- `src/lib/catalogueApi.ts` — 162 lignes
- `src/lib/inviteApi.ts` — 54 lignes
- `src/lib/ipTableExport.ts` — 371 lignes
- `src/lib/ipTableSync.ts` — 288 lignes
- `src/lib/pdfFileName.ts` — 12 lignes
- `src/lib/productImportExport.ts` — 405 lignes
- `src/lib/projectsApi.ts` — 319 lignes
- `src/lib/referentielApi.ts` — 514 lignes
- `src/lib/supabase.ts` — 20 lignes
- `src/lib/userProductsApi.ts` — 155 lignes
- `src/lib/userSignalsZonesApi.ts` — 73 lignes
- `src/main.tsx` — 15 lignes
- `src/page.ts` — 19 lignes
- `src/pages/AdminDashboard.tsx` — 772 lignes
- `src/pages/CataloguePage.tsx` — 752 lignes
- `src/pages/HomePage.tsx` — 178 lignes
- `src/pages/LoginPage.tsx` — 35 lignes
- `src/pages/PendingPage.tsx` — 29 lignes
- `src/pages/ProjectsPage.tsx` — 521 lignes
- `src/pages/ReferentielPage.tsx` — 881 lignes
- `src/pages/RegisterPage.tsx` — 38 lignes
- `src/pages/RejectedPage.tsx` — 29 lignes
- `src/pages/admin/BrandRow.tsx` — 52 lignes
- `src/pages/admin/CategoryRow.tsx` — 62 lignes
- `src/pages/admin/ColorPickerPopover.tsx` — 75 lignes
- `src/pages/admin/InvitationsPanel.tsx` — 203 lignes
- `src/pages/admin/constants.ts` — 27 lignes
- `src/pages/admin/types.ts` — 16 lignes
- `src/pages/catalogue/ActionsMenu.tsx` — 40 lignes
- `src/pages/catalogue/BrandLogoEditor.tsx` — 79 lignes
- `src/pages/catalogue/PreImportDialog.tsx` — 263 lignes
- `src/pages/catalogue/ProductQuickPreview.tsx` — 87 lignes
- `src/pages/catalogue/ProductViews.tsx` — 165 lignes
- `src/pages/catalogue/Tiles.tsx` — 71 lignes
- `src/pages/catalogue/constants.ts` — 14 lignes
- `src/pages/catalogue/types.ts` — 6 lignes
- `src/pages/referentiel/ClientForm.tsx` — 224 lignes
- `src/pages/referentiel/ContactForm.tsx` — 69 lignes
- `src/pages/referentiel/ContactsSection.tsx` — 170 lignes
- `src/pages/referentiel/Modal.tsx` — 15 lignes
- `src/pages/referentiel/RoomContactsSection.tsx` — 144 lignes
- `src/pages/referentiel/RoomForm.tsx` — 50 lignes
- `src/pages/referentiel/RoomPanel.tsx` — 589 lignes
- `src/pages/referentiel/SiteForm.tsx` — 46 lignes
- `src/pages/referentiel/constants.ts` — 27 lignes
- `src/pages/referentiel/helpers.ts` — 29 lignes
- `src/pages/referentiel/types.ts` — 3 lignes
- `src/ports.ts` — 94 lignes
- `src/store.ts` — 2024 lignes
- `src/styles.css` — 12720 lignes
- `src/types.ts` — 417 lignes
- `src/vite-env.d.ts` — 10 lignes

### supabase/migrations

- `supabase/migrations/001_init.sql` — 69 lignes
- `supabase/migrations/002_projects.sql` — 38 lignes
- `supabase/migrations/003_project_shares.sql` — 78 lignes
- `supabase/migrations/003b_fix_shares_rls.sql` — 29 lignes
- `supabase/migrations/003c_list_profiles_fn.sql` — 17 lignes
- `supabase/migrations/004_user_products.sql` — 31 lignes
- `supabase/migrations/005_team_catalog.sql` — 29 lignes
- `supabase/migrations/006_catalog_meta.sql` — 67 lignes
- `supabase/migrations/006b_populate_catalog_meta.sql` — 19 lignes
- `supabase/migrations/007_project_versions.sql` — 48 lignes
- `supabase/migrations/008_project_enhancements.sql` — 10 lignes
- `supabase/migrations/008b_backfill_project_meta.sql` — 11 lignes
- `supabase/migrations/009_admin_users_fn.sql` — 32 lignes
- `supabase/migrations/010_user_signals_zones.sql` — 55 lignes
- `supabase/migrations/011_catalog_moderation.sql` — 93 lignes
- `supabase/migrations/012_notify_admin_webhook.sql` — 60 lignes
- `supabase/migrations/013_company_profile.sql` — 188 lignes
- `supabase/migrations/014_profiles_select_fix.sql` — 23 lignes
- `supabase/migrations/015_fix_project_shares_rls.sql` — 122 lignes
- `supabase/migrations/016_referentiel.sql` — 202 lignes
- `supabase/migrations/017_referentiel_storage.sql` — 43 lignes
- `supabase/migrations/018_contacts.sql` — 103 lignes
- `supabase/migrations/019_client_logo_project_room.sql` — 39 lignes
- `supabase/migrations/020_contact_client_room_contacts.sql` — 58 lignes
- `supabase/migrations/021_account_manager.sql` — 42 lignes
- `supabase/migrations/022_client_soft_delete.sql` — 19 lignes
- `supabase/migrations/023_add_user_zones.sql` — 45 lignes
- `supabase/migrations/024_admin_logs.sql` — 40 lignes
- `supabase/migrations/025_product_datasheets.sql` — 35 lignes
- `supabase/migrations/026_brand_logo.sql` — 8 lignes
- `supabase/migrations/027_category_logo.sql` — 8 lignes

### supabase/functions

- `supabase/functions/admin-update-user/index.ts` — 119 lignes
- `supabase/functions/complete-product/index.ts` — 221 lignes
- `supabase/functions/invite-user/index.ts` — 214 lignes
- `supabase/functions/notify-admin-new-user/index.ts` — 139 lignes


## Correctifs locaux réalisés après l’analyse

Les constats ci-dessus décrivent l’état initial. Une première série de correctifs traite la réutilisation des lignes IP, la sérialisation complète du projet et la prise en compte du nom pour l’auto-save. La logique de signature et d’export est isolée dans `src/lib/projectSerialization.ts`.

La fonction de notification contrôle désormais le jeton serveur avant l’envoi. Une nouvelle migration protège le propriétaire projet et les écritures de fiches PDF. Voir `supabase/INFRASTRUCTURE.md` pour son application et la configuration webhook. Ces modifications serveur ne sont pas déployées par cette intervention.

Des tests Node ciblés sont disponibles via `npm test`. Les fichiers SQL de `tests/` servent exclusivement à une base isolée et vérifient les autorisations de la nouvelle migration sur un schéma minimal compatible. Ils ne doivent pas être exécutés sur la base de production.

## Suivi des corrections — 9 octobre 2026

Les constats initiaux 1 à 6 et 8 ont été traités par les correctifs déployés (notification protégée, droits PDF/propriétaire, synchronisation IP, export JSON, renommage et sauvegarde atomique). Le chargement différé réduit l’entrée JavaScript à environ 122 Ko gzip. Le constat 10 est traité pour la remise à zéro du store et les réponses de chargement tardives, avec tests automatisés ; le parcours de deux comptes réels reste à vérifier. Voir DEPLOIEMENT.md pour les validations et limites actualisées.

Le constat 7 (doublon des politiques 016/017) est corrigé. Les 35 migrations passent sur une base jetable, avec un contrôle ajouté au workflow. La documentation d’installation inclut les fichiers horodatés et la configuration du webhook propre au projet.

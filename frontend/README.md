# Balagh MR : dashboard web (Angular 21)

Dashboard des agents, responsables d'organisme, administrateur national et vue État (cahier des charges §7.3,
maquettes 16 à 20). Français et arabe (droite à gauche), mise à jour en temps réel par WebSocket.

## Lancer

Prérequis : le backend démarré (`backend\start-backend.ps1`, port 8080).

```powershell
cd frontend
npm install                       # une seule fois
copy public\config.example.json public\config.json
npm start                         # http://localhost:4200
```

`public/config.json` (non versionné) :

| Clé | Rôle |
|---|---|
| `apiUrl` | Adresse du backend, `http://localhost:8080` en local |
| `mapTileUrl` | Fond de carte Leaflet (`{z}/{x}/{y}`). Par défaut les tuiles OpenStreetMap, sans clé |
| `mapAttribution` | Mention des sources en bas de la carte (HTML). Vide avec les tuiles OSM : mention OpenStreetMap |

Carte : [Leaflet](https://leafletjs.com) + tuiles [OpenStreetMap](https://www.openstreetmap.org), aucune clé ni compte.
Les serveurs `tile.openstreetmap.org` suffisent pour le développement et un usage modéré
([règles d'usage](https://operations.osmfoundation.org/policies/tiles/)) ; en production à fort trafic, prendre un
fournisseur de tuiles OSM (ou un serveur de tuiles à soi) et mettre son adresse dans `mapTileUrl` et sa mention dans `mapAttribution`.

## Comptes de démonstration

Mot de passe commun : `DEMO_USERS_PASSWORD` de `backend/.env`. Le téléphone se tape sur 8 chiffres ou avec `+222`.

| Rôle | Téléphone | Ce qu'il voit et fait |
|---|---|---|
| Agent ONAS | 22000002 | Incidents de l'ONAS, **assigne les missions**, confirme, rejette, doublons ; invite et bloque les chauffeurs |
| Responsable ONAS | 22000001 | Comme l'agent + ses zones, ses véhicules, invite agents et chauffeurs |
| Agent / responsable déchets | 21000002 / 21000001 | Idem pour l'entreprise de déchets |
| Admin national | 20000001 | Vue nationale, organismes, zones, utilisateurs, paramètres, audit (sans assigner) |
| Vue État | 20000002 | Lecture seule : vue nationale, routes non assignées, performance, exports |

Les chauffeurs et les citoyens n'ont pas accès au dashboard (applications mobiles).

## Écrans

| Route | Rôles | Contenu |
|---|---|---|
| `/tableau-de-bord` | tous | Compteurs, carte en temps réel (cercle rouge autour des urgents), urgents, alertes |
| `/incidents`, `/incidents/:id` | tous | Liste filtrable + export CSV ; détail avec photos, chronologie, **assignation** |
| `/missions` | tous | Missions en cours, terminées, annulées |
| `/equipes` | agent, responsable | Chauffeurs (disponibilité, mission en cours), véhicules |
| `/statistiques` | tous | Incidents par semaine, zones les plus touchées, carte de chaleur |
| `/mes-zones` | agent, responsable | Zones d'intervention (wilaya → moughataa → commune) |
| `/utilisateurs` | responsable, agent, admin | Admin : créer (invitation SMS ou mot de passe initial), modifier, suspendre/réactiver tous les comptes, NNI journalisé ; responsable : ses agents et chauffeurs ; agent (menu « Chauffeurs ») : chauffeurs de son organisme |
| `/organismes`, `/zones` | admin, État | Création d'organisme + invitation du responsable ; libération et transfert de zones |
| `/parametres`, `/audit` | admin | Seuils d'urgence ; journal d'audit |
| `/etat/performance`, `/etat/exports` | admin, État | Performance comparée ; exports CSV / GeoJSON anonymisés |
| `/activation?token=...` | invité | Activation du compte (code SMS + mot de passe) |

## Organisation du code

```
src/app/
├── core/       services : API, connexion (JWT), temps réel (STOMP), alertes sonores, traductions FR/AR
├── layout/     menu latéral et barre du haut
├── shared/     carte (seul fichier lié à Leaflet), badges de statut, graphiques
└── features/   un dossier par écran
```

- Les textes sont dans `core/i18n/fr.ts` et `core/i18n/ar.ts` ; une clé arabe manquante est une erreur de compilation.
- La couleur d'un incident (`core/ui.ts`) : rouge = urgent, ambre = nouveau, bleu = en cours, vert-bleu = résolu.
  Ce jeu de couleurs a été vérifié pour les daltoniens.
- Le son des alertes exige un clic (règle des navigateurs) : bouton « Activer le son » dans la barre du haut.

## Vérifier

```powershell
npx ng test --watch=false   # tests unitaires (Vitest)
npm run build                # build de production dans dist/frontend/browser
```

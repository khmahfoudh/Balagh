# Phase 0 : exploration du dépôt, écarts avec le modèle de données, plan

Date : 10/10/2026. Référence : *Balagh MR, cahier des charges v1.1* (section 9 pour le modèle de données).

---

## 1. État réel du dépôt

| Élément | Constat | Conséquence |
|---|---|---|
| Git | Le dossier `stage/` **n'est pas un dépôt Git**. | Aucun commit possible tant qu'on n'a pas fait `git init`. |
| `backend/pom.xml` | **Malformé** : `flyway-core`, `flyway-database-postgresql` et `hibernate-spatial` sont **en dehors** de `<dependencies>`. `mvnw validate` échoue (`Unrecognised tag: 'dependency'`, ligne 50). | **Le backend ne compile pas.** |
| Dépendances manquantes | Pas de `spring-boot-starter-data-jpa`, ni du driver `postgresql`, de Lombok, Security, Validation, WebSocket ou springdoc. Avec Spring Boot 4, Flyway exige aussi `spring-boot-starter-flyway` (sinon l'auto-configuration ne s'exécute pas). | Les entités ne peuvent pas fonctionner. |
| Versions | Spring Boot **4.1.1** et `java.version` **17**, alors que le PDF prévoit Spring Boot 3.x et Java 21. JDK installés : 17 (par défaut), 23 et 25. | À trancher (voir questions). |
| Langage | Projet **Groovy** (`src/main/groovy`, gmavenplus), mais les entités sont en **Java + Lombok**. | Lombok et MapStruct ne fonctionnent pas avec Groovy. |
| Entités | 9 fichiers dans `backend/entity/`, **hors de `src/main/java`**, **sans déclaration `package`**, et ils importent `com.example.backend.enums.*`, **qui n'existe pas** (12 enums manquants). | Elles ne sont **pas compilées du tout**. Pour le build, elles n'existent pas encore. |
| `BalaghController.groovy` | Maquette en mémoire (`ConcurrentHashMap`) sur `/api/...` sans base de données. Le front Angular et l'app mobile actuels l'appellent (`/api/dashboard`). | Prototype à remplacer par les vraies routes `/api/v1`. |
| `application.properties` | Mot de passe **en clair** (`stage123`). Base `stagedb` (et non `stage_db`). `ddl-auto` défini deux fois, la seconde fois avec une valeur invalide (`non`). `show-sql=true`. | Secrets à passer en variables d'environnement. |
| Migration `V1__init_schema.sql` | Crée 9 tables proches du PDF. Pas de `CREATE EXTENSION postgis`. | Voir section 3. |
| Frontend | Angular 21 **avec SSR** (`server.ts`, `app.config.server.ts`). Un seul composant de démo qui appelle `/api/dashboard`. | Le SSR complique Google Maps, le WebSocket et l'API Audio, qui n'existent que dans le navigateur. |
| Mobile | Un seul projet Expo **SDK 57** (RN 0.86, expo-router), toujours le modèle par défaut (`Mobile/`). | À restructurer en monorepo `mobile/apps/{citizen,driver}` + `mobile/packages/shared`. |
| PDF | `docs/cahier_des_charges.pdf` **absent** du dépôt (fourni uniquement dans la conversation). | À copier dans `docs/`. |

### Base de données (inspectée en lecture seule)

| Base | Propriétaire | Extensions | Tables |
|---|---|---|---|
| **`stagedb`** | `stage_user` | plpgsql, **postgis 3.6.2** | aucune (sauf `spatial_ref_sys`) |
| `balagh` | `balagh` | plpgsql, postgis 3.6.2 | aucune |
| `balagh_db` | `postgres` | plpgsql | aucune |

- **`stage_db` n'existe pas.** La base configurée est `stagedb`.
- **Le V1 n'a jamais été appliqué** : il n'y a pas de table `flyway_schema_history`. Aucune donnée n'existe, donc aucune migration ne peut être destructive aujourd'hui.
- `stage_user` n'est **pas superuser** et n'a ni CREATEROLE ni CREATEDB. Il **ne peut donc pas créer** l'utilisateur applicatif demandé en phase 1 (étape 5).
- PostgreSQL 18 tourne en service Windows. `psql` existe mais n'est pas dans le PATH.
- **Le démon Docker ne répond pas** (erreur 500 sur `docker info`). Testcontainers ne pourra pas fonctionner tant que Docker Desktop n'est pas relancé.

---

## 2. Comparaison table par table (PDF section 9, V1 SQL et entités Java)

Légende : ✅ conforme · ⚠️ écart à corriger · ➕ ajout nécessaire pour une règle du PDF.

### users
✅ Tous les champs du PDF sont là : `id, first_name, last_name, phone (unique), nni_encrypted, nni_hash (unique), role (6 valeurs, CHECK), organization_id, trust_score, status, created_at`. Le « enum role » de la phase 1 existe déjà sous forme de `VARCHAR + CHECK` (recommandé : le garder, car un enum PostgreSQL natif est difficile à faire évoluer).

- ⚠️ `trust_score` vaut 0 par défaut. Si le score **baisse** à chaque rejet, il devient négatif. L'échelle est à décider (Q7).
- ⚠️ Aucun contrôle de format sur `phone` (`+222` suivi de 8 chiffres).
- ⚠️ Pas de cohérence rôle/organisme : un DRIVER, AGENT ou MANAGER doit avoir un `organization_id`, un CITIZEN ou un ADMIN non (CHECK).
- ➕ `password_hash` : le responsable « active son compte (téléphone, code SMS, **mot de passe**) » (section 5).
- ➕ `phone_verified_at`, `preferred_lang` (ar/fr), `updated_at`.

### organizations
✅ `id, name, type (4 valeurs), contact_phone, contact_email (= "email" du PDF), status (3 valeurs), categories text[]`.
- ➕ `contract_reference` (section 5, étape 1 : « référence du contrat »).
- ➕ `created_at`, `updated_at`.
- ⚠️ `categories` accepte n'importe quel texte. Ajouter un CHECK pour limiter aux valeurs `WASTE`, `STAGNANT_WATER` et `ROAD_HOLE`.

### admin_units
✅ `id, level, name_fr, name_ar, parent_id, geom geography(MultiPolygon,4326)` + index GIST.
- ➕ `code` (code officiel, pour réimporter les limites sans créer de doublons).
- ➕ Index sur `parent_id` et sur `level`, pour les listes en cascade.
- ⚠️ Aucune garantie de hiérarchie (une commune doit avoir une moughataa pour parent). À ajouter par trigger.

### organization_coverage : **écart le plus important**
✅ `organization_id, category, admin_unit_id, active, created_at, created_by`.
- ⚠️ **La contrainte « parents et enfants inclus » n'est pas implémentée.** L'index unique partiel `(category, admin_unit_id) WHERE active` ne bloque que **la même unité**. Aujourd'hui, l'organisme A pourrait prendre la commune Ksar et l'organisme B la moughataa Ksar, ou la wilaya Nouakchott-Ouest entière.
  → Solution : un **trigger** qui pose un `pg_advisory_xact_lock` par catégorie, puis refuse toute couverture active d'un **autre** organisme sur un ancêtre ou un descendant, avec une erreur traduite en **409** par l'API. Le service vérifie aussi en amont pour griser les zones et renvoyer un message clair.
- ⚠️ `category` est un VARCHAR sans CHECK, et rien ne vérifie qu'il appartient à `organizations.categories`.
- ➕ Historique (section 4, « historique conservé » ; libération et transfert par l'admin) : `released_at`, `released_by`, `release_reason`, `transferred_from_id`.
- ➕ `idle_alert_sent_at` (règle des 30 jours sans incident traité, pour ne pas renvoyer l'alerte à chaque passage).

### vehicles
✅ `id, plate (unique), organization_id, type, active`.
- ➕ `out_of_service` ou un statut : la maquette 18 affiche « HORS SERVICE / maintenance ». « EN MISSION » et « DISPONIBLE » se calculent à partir des missions.
- ➕ `created_at`.

### incidents
✅ Tous les champs du PDF : `category, centroid geography(Point) + GIST, radius_m, reporters_count, priority, status (8 valeurs), admin_unit_id, organization_id, routing_status, citizen_check, reopened_count, first/last_reported_at, resolved_at`.
- ➕ **`urgent_since`** : la règle « urgent sans mission après 24 h » a besoin de l'heure de passage en urgent. Plus `urgent_alert_sent_at` pour ne pas renvoyer l'alerte.
- ➕ `confirmed_at`, `confirmed_by`, `confirmation_mode` (AUTO/MANUAL), pour le badge « CONFIRMÉ AUTOMATIQUEMENT » de la maquette 17.
- ➕ `rejection_reason` (motif obligatoire), `rejected_at`, `rejected_by`.
- ➕ `duplicate_of_id` (bouton « Marquer comme doublon »).
- ➕ `version` (verrou optimiste) et `updated_at`.
- ➕ Index : `(organization_id, status)`, plus un index partiel sur les incidents ouverts `(category) WHERE status NOT IN ('RESOLVED','REJECTED')`.

### reports
✅ `id, user_id, incident_id, category, location geography(Point) + GIST, accuracy_m, description, created_at`.
- ⚠️ `category` sans CHECK. Côté entité, c'est un `String` au lieu de `IncidentCategory`.
- ⚠️ `accuracy_m` est en `NUMERIC(8,2)` alors que l'entité utilise un `Double` : types incohérents (bloquant avec `ddl-auto=validate`). Passer la colonne en `double precision`.
- ➕ **`client_id UUID UNIQUE`** (clé d'idempotence) : la file d'attente hors ligne renvoie les requêtes, et sans cette clé on crée des doublons.
- ➕ `captured_at` : un signalement fait hors ligne arrive plus tard, et `created_at` ne correspond alors plus au moment réel.
- ➕ `device_id` (section 5 : « détection de signalements en série depuis un même appareil »).
- ➕ `source` (NEW / ME_TOO), pour distinguer « moi aussi » d'un nouveau signalement.
- ➕ Index `(user_id, category, created_at)`, pour la limite 1 signalement / 50 m / 24 h, et un index sur `incident_id`.

### media
✅ `id, report_id, mission_id, type (PHOTO/VIDEO), url (clé MinIO), size_bytes`.
- ⚠️ Le CHECK actuel est un « OU » : il doit devenir un « OU exclusif » (exactement un des deux).
- ➕ **`location` + `captured_at`** : l'indicateur « Preuves avant/après » de la section 5 exige une photo « avec position GPS et heure ».
- ➕ `content_type`, `duration_s` (vidéo de 15 s max), `sha256` (repérer une même photo réutilisée), `created_at`.

### missions
✅ `id, incident_id, driver_id, vehicle_id, status (4 valeurs), assigned_at, started_at, arrived_at, completed_at, proof_media_id`.
- ⚠️ **Statut `CANCELLED` manquant** : la section 11 prévoit « mission annulée ou modifiée ».
- ⚠️ La règle « 0 ou 1 mission active par incident » n'est pas imposée. Ajouter un index unique partiel `(incident_id) WHERE status NOT IN ('DONE','CANCELLED')`.
- ➕ `assigned_by` (audit), `due_at` (« délai souhaité », maquette 17), `driver_note` (« remarque », maquette D3), `cancelled_at`, `cancel_reason`.
- ➕ Index `(driver_id, status)`.

### Entités Java : problèmes communs
1. Pas de `package` et situées hors de `src/main/java`. Il faut les **déplacer** (sans les réécrire) dans `src/main/java/com/example/backend/entity/`.
2. Il faut créer les **12 enums** : `AdminLevel, IncidentCategory, Priority, IncidentStatus, RoutingStatus, CitizenCheck, MediaType, MissionStatus, OrgType, OrgStatus, Role, UserStatus`.
3. Colonnes `geography` : ajouter `@JdbcTypeCode(SqlTypes.GEOGRAPHY)` (sinon Hibernate les traite comme `geometry`), créer les points avec SRID 4326 et dans l'ordre **(x = longitude, y = latitude)**. À valider par un test d'intégration.
4. `category` en `String` dans `Report` et `OrganizationCoverage` : passer à l'enum `IncidentCategory`.
5. Ajouter les nouveaux champs ci-dessus. Supprimer les imports inutilisés.
6. Recommandation : `ddl-auto=none`. Flyway fait foi, et un test d'intégration charge et sauvegarde chaque entité, ce qui est plus fiable que `validate` sur des colonnes géographiques.

---

## 3. Tables absentes

| Table | Source PDF | Contenu prévu |
|---|---|---|
| `notifications` | §9 | user_id, type, payload jsonb, read_at, created_at |
| `device_tokens` | §9 | user_id, token Expo/FCM, platform, app (citizen/driver), last_seen_at |
| `otp_codes` | §9 | phone, code_hash, purpose, expires_at, attempts, consumed_at |
| `settings` | §3, §9 | key, category (null = global), value, updated_by, updated_at, avec les valeurs par défaut |
| `incident_feedback` | §6, §9 | incident_id, user_id, resolved (bool), created_at. Unique (incident, user) |
| `audit_log` | §9, §12 | actor_id, action, entity_type, entity_id, details jsonb, ip, created_at |
| `contracts` | §9 (phase 2) | organization_id, category, admin_unit_id, start/end, target_hours |

**Tables hors PDF mais nécessaires** (justification) :

| Table | Pourquoi |
|---|---|
| `refresh_tokens` | §12 « refresh token **révocable** » : il faut les stocker (sous forme hachée) pour pouvoir les révoquer. |
| `invitations` | §5 « lien d'activation » : token haché, téléphone ou e-mail, rôle, organisme, expiration, date d'acceptation. |
| `incident_events` | §6 « chaque changement de statut est horodaté, attribué à un utilisateur » et maquette 17 « Chronologie ». `audit_log` sert à la sécurité, cette table sert au métier. |

**Paramètres par défaut** (`settings`) : seuil 5 · rayon 100 m (eau stagnante 150 m) · fenêtre 7 j · limite citoyen 50 m / 24 h · précision GPS max 50 m · feedback 72 h · 2 contestations · urgent sans mission 24 h · zone inactive 30 j · score de confiance (Q7).

---

## 4. Migrations Flyway proposées

Le V1 reste **inchangé**. Toutes les corrections passent par de nouvelles migrations. Comme la base est vide, aucune n'est destructive aujourd'hui.

| Fichier | Contenu |
|---|---|
| migration d'extension, exécutée avant V1 | `CREATE EXTENSION IF NOT EXISTS postgis` (idempotent : déjà installée dans `stagedb`, et créée automatiquement par l'image Docker `postgis/postgis`) |
| `V2__users_auth.sql` | colonnes users, CHECK téléphone et rôle/organisme, `refresh_tokens`, `otp_codes`, `invitations`, `device_tokens` |
| `V3__organizations_zones.sql` | colonnes organizations, admin_units et coverage, **trigger de verrouillage hiérarchique**, CHECK catégories |
| `V4__incidents_missions.sql` | colonnes incidents, reports, media, missions et vehicles, `incident_events`, index partiel « 1 mission active », index de performance |
| `V5__settings_feedback_audit.sql` | `settings` + valeurs par défaut, `incident_feedback`, `notifications`, `audit_log`, `contracts` |
| `db/seed/V1000__demo_data.sql` | **données de démo, chargées uniquement avec le profil `dev`** (dossier Flyway séparé, pour ne jamais les déployer en production) |
| `db/admin/create_app_role.sql` | **hors Flyway, à exécuter en superuser** : crée `balagh_app` (SELECT, INSERT, UPDATE et DELETE uniquement, pas de DDL). `stage_user` reste propriétaire et sert à Flyway. |

Démo : 1 admin, 1 compte État, 2 organismes (déchets, ONAS), chacun avec 1 responsable, 1 agent, 2 chauffeurs et 2 véhicules, plus quelques citoyens. Zones : les 3 wilayas de Nouakchott (Nord, Ouest, Sud), les 9 moughataas (Tevragh Zeina, Ksar, Sebkha, Dar Naïm, Teyarett, Toujounine, Arafat, El Mina, Riyad) et les 9 communes correspondantes, avec des **polygones simplifiés et approximatifs**, marqués comme données de démo.

---

## 5. Plan détaillé par phase

Chaque phase se termine par : compilation, tests, commit Git, résumé (fait / reste / comment tester).

### Phase 1 : base de données et rôles
1. Remise en état : `git init` à la racine avec un `.gitignore` racine. Conversion du backend en **Java** (suppression de Groovy). Correction du `pom.xml` (JPA, postgresql, Flyway via `spring-boot-starter-flyway`, hibernate-spatial, Lombok, Validation, Testcontainers). `application.yml` avec profils `dev`, `test` et `prod`, toute la configuration par variables d'environnement, `.env.example`.
2. Déplacement des entités et création des enums. Ajout des champs manquants.
3. Migrations V2 à V5, seed de démo, script de rôle applicatif.
4. Tests (Testcontainers `postgis/postgis`) : les migrations passent, chaque entité se sauvegarde et se relit (y compris la géographie), le trigger de verrouillage refuse un parent ou un enfant d'un autre organisme et accepte une autre catégorie.
5. `docs/BACKEND_LOGIC.md` (modèle et règles de zones).

### Phase 2 : sécurité et authentification
`SmsProvider` (implémentation console), OTP haché avec expiration et nombre d'essais limité, JWT 15 min + refresh token haché et révocable avec rotation. NNI chiffré en AES-256-GCM (clé en variable d'environnement) et empreinte HMAC-SHA-256 salée. Erreurs JSON uniformes `{code, message, details}`. Autorisations par rôle **et** par organisme (filtre systématique sur `organization_id` dans les repositories des rôles AGENT et MANAGER). Rate limiting avec Bucket4j en mémoire (Redis plus tard si plusieurs instances). Invitations (`POST /organizations`, `POST /users/invite`) avec liens d'activation. Audit des actions sensibles.
Tests : OTP, rotation et révocation du refresh token, NNI jamais renvoyé, un agent qui tente de lire un incident d'un autre organisme reçoit un 403 ou un 404.

### Phase 3 : logique métier (le cœur)
- `ReportService` : validation, limite citoyen, puis regroupement ST_DWithin, comptage des citoyens distincts sur la fenêtre, urgence, routage ST_Covers et coverage. Tout se fait dans **une seule transaction** avec un `pg_advisory_xact_lock` par catégorie, pour éviter que deux signalements simultanés au même endroit créent deux incidents.
- `CoverageService` : listes en cascade, zones prises grisées, 409, libération et transfert par l'admin, proposition des incidents non assignés dès qu'une zone est prise.
- `IncidentLifecycleService` : machine à états explicite (table des transitions autorisées), `incident_events`, publication d'événements Spring vers le WebSocket et les notifications (branchés en phase 4).
- Missions, preuve photo, « moi aussi », feedback 72 h avec réouverture après 2 contestations, score de confiance.
- Tâches planifiées (`@Scheduled` + ShedLock pour ne pas les exécuter en double avec plusieurs instances) : urgent sans mission depuis 24 h, zone inactive depuis 30 j, clôture du feedback.
- Endpoints AUTHORITY : export CSV et GeoJSON anonymisé, performance comparée, priorisation des routes (CSV puis PDF avec OpenPDF). Statistiques et carte de chaleur.
- Tests : urgence (5 citoyens différents donnent 1 incident URGENT ; 1 citoyen qui signale 5 fois ne la déclenche pas), rayon (99 m regroupé, 101 m non), 150 m pour l'eau, flux de statuts, réouverture, routage non assigné.

### Phase 4 : API REST, WebSocket, notifications
Toutes les routes de la section 10 sous `/api/v1`, documentées avec springdoc. STOMP `/ws` authentifié par JWT, avec vérification à l'abonnement (`/topic/org/{orgId}` réservé aux membres de l'organisme). Matrice de notifications : WebSocket + push Expo (`channelId` `missions`, `urgent` ou `status`, son personnalisé, priorité haute) + e-mail (SMTP ; Mailpit en dev). MinIO avec URL signées, contrôle du type et de la taille, suppression des métadonnées EXIF.

### Phase 5 : dashboard Angular
SSR désactivé (Q14), Angular Material, `@angular/google-maps` avec clustering et une abstraction `MapProvider`, `@stomp/rx-stomp`, traductions AR (RTL) et FR. Écrans des maquettes 16 à 20, alerte sonore (bouton « Activer le son », option pour couper) et visuelle sur URGENT.

### Phase 6 : deux apps mobiles (monorepo)
`mobile/` avec npm workspaces : `apps/citizen`, `apps/driver`, `packages/shared` (client API généré depuis OpenAPI, auth, i18n RTL, thème vert et or, file d'attente hors ligne, notifications). Bundle IDs distincts. Chaque app refuse le mauvais rôle. `react-native-maps` avec `PROVIDER_GOOGLE`, canaux Android avec son `.wav`, builds de développement EAS. Docs Expo SDK 57 vérifiées avant chaque API.

### Livrables finaux
Docker Compose (backend, PostGIS, MinIO, Nginx), README, `.env.example`, et tableau OK / pas OK des critères de la section 23.

---

## 6. Où la demande s'écarte du PDF (la demande prime)
| Sujet | PDF | Demande |
|---|---|---|
| Apps mobiles | 1 app, 2 interfaces | **2 apps distinctes** en monorepo |
| Cartographie | OpenStreetMap recommandé | **Google Maps** (clés et facturation Google Cloud nécessaires) |
| Backend | Spring Boot 3.x, Java 21 | Le dépôt utilise Spring Boot 4.1.1 et Java 17 (Q3) |

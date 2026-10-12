# Balagh MR : logique du backend (explications simples)

Ce document explique **ce que fait chaque service important** et **comment le vérifier**.
Le code se trouve dans `backend/src/main/java/com/example/backend/`.

---

## 1. Vue d'ensemble

```
App Citoyen ──► POST /reports ──► ReportService ──► (PostGIS) regroupe ──► IncidentWorkflow : urgence
                                                 └► RoutingService : quel organisme ?
Dashboard agent ──► POST /incidents/{id}/assign ──► MissionService ──► notification au chauffeur
App Chauffeur ──► PATCH /missions/{id}/status ──► MissionService ──► incident RÉSOLU ──► citoyens notifiés
App Citoyen ──► POST /incidents/{id}/feedback ──► FeedbackService ──► 2 « pas résolu » = rouvert
```

Organisation du code : `web/` (contrôleurs, sans logique) → `service/` (règles métier) → `repository/` (requêtes SQL/PostGIS) → `entity/` (tables).

---

## 2. Les fonctions clés

### 2.1 Signaler : `ReportService.create()`

| Étape | Règle | Erreur si non respectée |
|---|---|---|
| 1 | Le compte est un citoyen actif | `FORBIDDEN` / `ACCOUNT_BLOCKED` |
| 2 | 1 à 3 photos ou vidéos | `MEDIA_REQUIRED` |
| 3 | GPS présent, précision ≤ 50 m | `GPS_INACCURATE` |
| 4 | Pas déjà signalé : même catégorie, à moins de 50 m, depuis moins de 24 h | `REPORT_LIMIT` (429) |
| 5 | Cherche un incident **ouvert** de même catégorie à moins de 100 m (150 m pour l'eau) | – |
| 6 | Trouvé : le signalement s'y rattache. Sinon : nouvel incident | – |
| 7 | Recompte les **citoyens distincts** et applique la règle d'urgence | – |
| 8 | Route vers l'organisme de la zone | – |

**Exemple** : Ahmed signale de l'eau au Carrefour Ksar, ce qui crée un incident NOUVEAU. Aïchetou signale à 20 m :
pas de nouvel incident, le compteur passe à 2 citoyens.

Détails importants :
- `clientId` : identifiant généré par le téléphone. Si la file hors ligne renvoie le même signalement, le backend
  renvoie le premier au lieu d'en créer un second.
- Verrou `pg_advisory_xact_lock` par catégorie : deux citoyens qui signalent au même instant au même endroit
  ne créent pas deux incidents.
- La requête PostGIS (`IncidentRepository.findNearestOpen`) est celle du cahier des charges :
  `ST_DWithin(centroid, point, rayon)` triée par `ST_Distance`.

### 2.2 Urgence : `IncidentWorkflow.evaluateUrgency()`

> Si au moins **5 citoyens différents** ont signalé l'incident pendant les **7 derniers jours**,
> il passe **URGENT** et **CONFIRMÉ** automatiquement, et les agents sont alertés.

- On compte `COUNT(DISTINCT user_id)` : **1 citoyen qui signale 5 fois compte pour 1**.
- Les valeurs (5, 7 jours, 100 m) sont dans la table `settings`, modifiables par l'admin sans redéployer
  (`PUT /api/v1/settings/urgency.threshold`). Au démarrage, on peut abaisser le seuil à 3.
- L'urgence est « collante » : elle ne redescend pas quand des signalements sortent de la fenêtre de 7 jours.

### 2.3 Routage : `RoutingService.route()`

1. Trouver la commune qui contient le point GPS : `ST_Covers(admin_units.geom, point)`.
2. Remonter commune → moughataa → wilaya.
3. Chercher un organisme **actif** qui a pris l'une de ces zones pour la catégorie.
4. Si aucun organisme : l'incident reste **NON ASSIGNÉ**, mais il est enregistré et visible par l'État.

**Exemple** : un trou dans la chaussée à Arafat. Aucun organisme ne couvre les routes, donc l'incident est non assigné
et apparaît dans `GET /api/v1/authority/incidents?unassigned=true`.

### 2.4 Zones : `CoverageService.add()` + trigger SQL `coverage_check_lock`

« Premier arrivé, premier verrouillé », **par catégorie**, à tous les niveaux :
- l'entreprise A a pris la wilaya Nouakchott-Ouest pour les déchets : l'entreprise B ne peut prendre ni cette wilaya,
  ni une de ses moughataas ou communes pour les déchets (réponse **409** `ZONE_ALREADY_TAKEN`) ;
- l'ONAS peut prendre Nouakchott-Ouest pour l'eau stagnante (autre catégorie) ;
- dès qu'un organisme prend une zone, les incidents ouverts non assignés de cette zone lui sont attribués.

Le service vérifie d'abord, pour donner un message clair. Le trigger PostgreSQL revérifie ensuite, ce qui protège
contre deux requêtes simultanées.

### 2.5 Missions : `MissionService`

| Qui | Fonction | Effet |
|---|---|---|
| Agent (dashboard) | `assign()` | Crée la mission ; incident ASSIGNÉ ; notifie le chauffeur et les citoyens |
| Chauffeur | `updateStatus(EN_ROUTE)` | Incident EN ROUTE ; citoyens notifiés « camion en route » |
| Chauffeur | `updateStatus(ON_SITE)` | Incident SUR PLACE |
| Chauffeur | `uploadProof()` | Enregistre la photo « après » avec GPS et heure |
| Chauffeur | `updateStatus(DONE)` | **Refusé sans photo** (`PROOF_REQUIRED`) ; sinon incident RÉSOLU |
| Agent | `cancel()` | Mission annulée, incident redevient CONFIRMÉ |

- Au plus **1 mission active par incident** (index unique en base).
- Dashboard : `MissionService.list()` (`GET /api/v1/missions?status=...`) liste les missions, plus récentes d'abord.
  **Isolation** : un agent ou un responsable ne voit que les missions de son organisme ; l'admin et l'État voient tout.
- Seuls l'**agent** et le **responsable** de l'organisme assignent ou annulent (le chauffeur doit appartenir à leur
  organisme). L'admin national supervise sans assigner.
- Le chauffeur avance étape par étape ; renvoyer la même étape ne fait rien (utile pour la file hors ligne).
- `myActive()` trie les missions : urgentes d'abord, puis par distance au camion.

### 2.6 Confirmation citoyenne : `FeedbackService.submit()`

Pendant **72 h** après RÉSOLU, les citoyens qui avaient signalé répondent « vraiment résolu » ou « pas résolu ».
**2 citoyens différents** qui contestent → l'incident est **rouvert** automatiquement (REOPENED) et l'organisme est alerté.

### 2.7 Autres règles

| Fonction | Règle |
|---|---|
| `IncidentService.confirm()` / `reject()` | Sous le seuil, l'agent confirme ou rejette avec un motif obligatoire |
| `TrustService.penalizeReporters()` | Rejet « hors sujet » ou « faux » : −10 au score de confiance (départ 100) ; alerte admin sous 50 |
| `IncidentService.markDuplicate()` | Les signalements du doublon rejoignent l'incident d'origine, qui est recompté (urgence comprise) |
| `AlertService` (tâches planifiées) | Urgent sans mission depuis 24 h → alerte au responsable et à l'admin ; zone sans incident traité depuis 30 j → alerte admin ; fin des 72 h de feedback |
| `IncidentService.assertCanView()` | **Isolation** : un agent ne voit que les incidents de son organisme (sinon 404) |
| `AuthService` | Code SMS 6 chiffres (5 min, 5 essais) ; JWT 15 min + refresh token révocable ; une app refuse les autres rôles |
| `OtpService.send()` | Le code est enregistré dans sa propre transaction **avant** l'envoi du SMS (sinon un code envoyé pouvait ne pas exister en base) |
| `AuthService.acceptInvitation()` | Numéro déjà utilisé et mauvaise application vérifiés **avant** de consommer le code : un refus ne « brûle » pas le code |
| `UserService.invite()` / `setStatus()` | Responsable : invite et bloque ses agents et chauffeurs. **Agent : invite et bloque les chauffeurs de son organisme** (choix du client, en plus du cahier des charges). Admin : bloque tout compte sauf admin |
| `CryptoService` | NNI chiffré AES-256-GCM + empreinte HMAC unique ; jamais renvoyé (sauf admin, avec audit) |

### 2.8 Temps réel : WebSocket STOMP `/ws`

Le dashboard se met à jour **sans recharger la page** (carte, compteurs, listes) et sonne dès qu'un incident passe URGENT.

| Élément | Rôle |
|---|---|
| `IncidentWorkflow.record()` | Chaque ligne de chronologie publie un événement `IncidentChanged` (incident, organisme, statut, priorité, type) |
| `NotificationService.notify()` | Chaque notification enregistrée publie un événement `UserNotified` pour son destinataire |
| `RealtimePublisher` | Envoie ces événements **après le commit** (une transaction annulée n'envoie rien) |
| `StompAuthInterceptor` | Connexion : JWT obligatoire (en-tête `Authorization: Bearer ...`). Abonnement : vérifié selon le rôle |
| `WebSocketConfig` | Point d'entrée `/ws`, mêmes origines autorisées que le CORS (`CORS_ALLOWED_ORIGINS`) |

| Canal | Qui peut s'abonner | Contenu |
|---|---|---|
| `/topic/org/{orgId}/incidents` | Agents et responsable **de cet organisme** | Changements de ses incidents |
| `/topic/national/incidents` | Admin national et État | Changements de tous les incidents |
| `/user/queue/notifications` | Chaque utilisateur connecté (les siennes) | Ses notifications (URGENT, incident rouvert...) |

**Exemple** : le 5e citoyen signale l'eau stagnante d'El Mina → `PRIORITY_URGENT` est enregistré → après le commit,
les agents de l'ONAS et la vue nationale reçoivent l'événement → le dashboard affiche l'alerte rouge, bipe (si le son est
activé) et recharge ses compteurs. Mesuré en local : alerte affichée environ 2 s après l'envoi du signalement.

Le broker est en mémoire : il suffit tant qu'il n'y a qu'**une seule instance** du backend. Avec plusieurs instances, il
faudra un broker externe (RabbitMQ STOMP). Une session WebSocket déjà ouverte reste valide après l'expiration du JWT
(15 min) ; le dashboard renouvelle le jeton à chaque reconnexion.

---

## 3. Cycle de vie d'un incident

```
NOUVEAU ──(5 citoyens ou agent)──► CONFIRMÉ ──(assignation)──► ASSIGNÉ ──► EN ROUTE ──► SUR PLACE ──(photo après)──► RÉSOLU
   │                                                                                                         │
   └──(agent, motif)──► REJETÉ                                              2 contestations ◄──────── 72 h ───┘
                                                                                  │
                                                                              REOPENED ──► (nouvelle mission)
```

Chaque étape est enregistrée dans `incident_events` (qui, quand, quoi) : c'est la « Chronologie » du dashboard.

---

## 4. Voir la base de données

La base utilisée par le backend est **`balagh_db`** (`DB_NAME` dans `backend/.env`). Les tables sont créées par
Flyway au démarrage du backend (`src/main/resources/db/migration/V0` à `V5`), avec les données de démo si `DEMO_DATA=true`.
La base `balagh` (sans `_db`) est l'ancien prototype : elle n'est plus utilisée.

### Avec pgAdmin 4 (installé avec PostgreSQL)

1. Menu Démarrer → **pgAdmin 4**.
2. Clic droit sur « Servers » → Register → Server.
   - Onglet General : Name = `Balagh local`
   - Onglet Connection : Host = `localhost`, Port = `5432`, Database = `balagh_db`, Username = `postgres`,
     Password = celui de `backend/.env` (`DB_MIGRATION_PASSWORD`).
3. Déplier : Databases → balagh_db → Schemas → public → **Tables** (clic droit sur une table → View/Edit Data → All Rows).

### Avec SQL Shell (psql)

```
Server [localhost]:            ← Entrée
Database [postgres]: balagh_db
Port [5432]:                   ← Entrée
Username [postgres]:           ← Entrée
Mot de passe :                 ← mot de passe de postgres
```

Puis, dans psql :

| Commande | Effet |
|---|---|
| `\c balagh_db` | Se connecter à la base (si on est sur `postgres`) |
| `\dt` | Liste des tables |
| `\d incidents` | Colonnes, index et contraintes d'une table |
| `\x auto` | Affichage vertical quand une ligne est trop large |
| `SELECT * FROM users;` | Contenu d'une table (ne pas oublier le `;`) |
| `SELECT version, description, success FROM flyway_schema_history;` | Migrations appliquées |
| `\q` | Quitter |

Les colonnes `geography` (`centroid`, `location`, `geom`) s'affichent en hexadécimal : utiliser `ST_AsText(col)` ou
`ST_Y(col::geometry)` (latitude) / `ST_X(col::geometry)` (longitude).

Accents mal affichés dans SQL Shell (`PropriÚtaire`) : taper `\! chcp 1252` puis relancer la requête.

### Requêtes utiles (Tools → Query Tool, ou dans psql)

```sql
-- Utilisateurs
SELECT first_name, last_name, phone, role, status, trust_score FROM users ORDER BY role, phone;

-- Derniers signalements avec leur auteur et leur incident
SELECT r.created_at, u.first_name, i.category, i.status
FROM reports r JOIN users u ON u.id = r.user_id JOIN incidents i ON i.id = r.incident_id
ORDER BY r.created_at DESC;

-- Incidents avec leur nombre de citoyens et leur organisme
SELECT i.category, i.status, i.priority, i.reporters_count, o.name AS organisme,
       ST_Y(i.centroid::geometry) AS lat, ST_X(i.centroid::geometry) AS lng
FROM incidents i LEFT JOIN organizations o ON o.id = i.organization_id
ORDER BY i.priority DESC, i.reporters_count DESC;

-- Chronologie d'un incident
SELECT created_at, type, from_status, to_status, note FROM incident_events ORDER BY created_at;

-- Zones prises par chaque organisme
SELECT o.name, c.category, u.level, u.name_fr
FROM organization_coverage c JOIN organizations o ON o.id = c.organization_id
JOIN admin_units u ON u.id = c.admin_unit_id WHERE c.active;

-- Paramètres d'urgence
SELECT key, category, value FROM settings ORDER BY key;
```

### En ligne de commande

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d balagh_db
```

---

## 5. Tester l'API

1. Démarrer : `cd backend` puis `.\start-backend.ps1`. Dans les logs, `Database: jdbc:postgresql://localhost:5432/balagh_db`
   et `Successfully validated 6 migrations` confirment la connexion et la migration.
   On peut aussi lancer directement `.\mvnw.cmd spring-boot:run`, même si le `JAVA_HOME` du système est un JDK 17 :
   le profil Maven `jdk-toolchain` (pom.xml) choisit alors tout seul un JDK 21+ installé sur la machine
   (log : `Toolchain in maven-compiler-plugin: JDK[...]` puis `Starting BackendApplication using Java 25...`).
   Erreurs de démarrage connues :
   - `UnsupportedClassVersionError ... class file version 65.0 ... only recognizes up to 61.0` : aucun JDK 21+ trouvé.
     En installer un (ex. dans `~/.jdks`) ou utiliser `.\start-backend.ps1`.
   - `ClassFormatError ... Code length 0` : `.class` cassés écrits par l'extension Java de VS Code (bug Lombok + ECJ,
     d'où l'auto-build désactivé dans `.vscode/settings.json`). Lancer `.\mvnw.cmd clean spring-boot:run`.
   - `PKIX path building failed` en téléchargeant une dépendance : l'antivirus Avast intercepte HTTPS et Java ne fait pas
     confiance à son certificat. Ajouter `-Djavax.net.ssl.trustStoreType=Windows-ROOT` (magasin de certificats Windows)
     à la commande Maven, ou désactiver l'analyse HTTPS d'Avast.
   - `Port 8080 was already in use` : un backend tourne déjà (autre terminal) ; l'arrêter avec Ctrl+C.
2. Ouvrir **http://localhost:8080/swagger-ui.html**.
3. `POST /api/v1/auth/login` avec `{"phone": "+22222000002", "password": "Balagh@2026", "app": "DASHBOARD"}`
   (agent ONAS), copier `accessToken`, cliquer sur **Authorize** et le coller.
4. Essayer `GET /api/v1/incidents` : seuls les incidents de l'ONAS apparaissent, dont 1 URGENT (5 citoyens).
5. Le dashboard Angular fait tout cela avec une interface : voir `frontend/README.md`.

| Compte de démo | Téléphone | Mot de passe |
|---|---|---|
| Admin national | +22220000001 | Balagh@2026 |
| État / Autorité | +22220000002 | Balagh@2026 |
| Responsable déchets / agent déchets | +22221000001 / +22221000002 | Balagh@2026 |
| Responsable ONAS / agent ONAS | +22222000001 / +22222000002 | Balagh@2026 |
| Chauffeurs ONAS | +22222000003, +22222000004 | Balagh@2026 |
| Citoyens | +22230000001 à +22230000006 | Balagh@2026 |

Le mot de passe de démo vient de `DEMO_USERS_PASSWORD` dans `backend/.env`. En production, `DEMO_DATA=false`.

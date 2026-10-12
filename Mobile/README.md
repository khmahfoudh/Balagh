# Balagh MR : applications mobiles

Deux applications distinctes (Expo SDK 57, React Native) qui partagent le même code commun :

```
Mobile/
├── apps/citizen    app « Balagh » (mr.balagh.citizen) : signaler, carte, suivi, profil
├── apps/driver     app « Balagh Chauffeur » (mr.balagh.driver) : missions, itinéraire, photo « après »
└── packages/shared @balagh/shared : client API, connexion, FR/AR (RTL), thème, carte, file hors ligne
```

Chaque app refuse les comptes de l'autre rôle (le backend répond `WRONG_APP`).

## 1. Installer (une seule fois)

```powershell
cd Mobile
npm install
```

## 2. Adresse du backend (automatique)

En développement, l'app appelle le backend sur **le PC qui la sert** (même IP que Metro, port 8080) : rien à
configurer, même quand l'IP Wi-Fi du PC change. Côté backend, laisser `PUBLIC_BASE_URL=` vide dans `backend/.env` :
les liens des photos reprennent alors l'adresse utilisée par le téléphone.

Pour forcer une adresse (émulateur Android : `http://10.0.2.2:8080`, serveur distant, production), définir
`EXPO_PUBLIC_API_URL` dans `apps/citizen/.env.local` et `apps/driver/.env.local` (copier `.env.example`), puis
relancer Metro.

Le PC et le téléphone doivent être sur le même réseau. Si Windows demande d'autoriser Java ou Node.js sur le réseau,
acceptez, y compris pour les réseaux publics (sinon les ports 8080 et 8081 sont bloqués par le pare-feu).

Problèmes fréquents dans Expo Go :
- « You're signed in to Expo Go as X, but not signed in to Expo CLI » : Metro a démarré hors ligne (réseau
  instable) et n'a pas transmis le compte Expo. Relancer Metro avec Internet (`npx expo whoami` doit afficher le même
  compte que l'app), ou se déconnecter d'Expo Go (onglet Profil).
- « Could not connect to development server » : Metro n'est pas joignable. Vérifier que le terminal affiche le QR code,
  puis ouvrir `http://IP-du-PC:8081/status` dans le navigateur du téléphone : il doit afficher `packager-status:running`.

## 3. Lancer

```powershell
npm run citizen    # app citoyen (port 8081)
npm run driver     # app chauffeur (port 8082), dans un autre terminal
```

Scanner le QR code avec **Expo Go** (Android) ou l'appareil photo (iOS). La carte Google fonctionne dans Expo Go
sur Android sans clé. Émulateur Android : `EXPO_PUBLIC_API_URL=http://10.0.2.2:8080`.

## 4. Comptes de démonstration

Mot de passe commun (lien « Se connecter avec un mot de passe (démo) », visible en développement) : `Balagh@2026`.
Connexion par code SMS : le code s'affiche dans les logs du backend (`[SMS DEV]`).

| Rôle | Téléphone | App |
|---|---|---|
| Citoyen | +222 30 00 00 01 (à 06) | Balagh |
| Chauffeur ONAS (2 missions) | +222 22 00 00 03 | Balagh Chauffeur |
| Chauffeur déchets | +222 21 00 00 03 | Balagh Chauffeur |

## 5. Clés Google Maps (builds de développement et stores)

Inutiles dans Expo Go. Pour un build EAS (sons de notification, Google Maps sur iOS) :

1. Google Cloud Console → créer un projet → activer **Maps SDK for Android** et **Maps SDK for iOS**.
2. Créer une clé par plateforme et la **restreindre** : Android = nom du package (`mr.balagh.citizen` /
   `mr.balagh.driver`) + empreinte SHA-1 du certificat (`eas credentials`) ; iOS = bundle ID.
3. Les mettre en variables d'environnement (jamais dans le code), par exemple dans `.env.local` ou les secrets EAS :
   `GOOGLE_MAPS_ANDROID_API_KEY=…` et `GOOGLE_MAPS_IOS_API_KEY=…` (lues par `app.config.ts`),
   et `EXPO_PUBLIC_IOS_GOOGLE_MAPS=true` pour utiliser Google Maps sur iOS.
4. `npx eas-cli@latest build --profile development --platform android` (dans `apps/citizen` ou `apps/driver`).

Toute la carte passe par `packages/shared/src/maps/BalaghMap.tsx` : changer de fournisseur ne touche que ce fichier.

## Ce qui reste à faire

- Notifications push (Expo / FCM) avec canaux et sons dédiés : en attendant, l'app chauffeur vérifie
  ses missions toutes les 20 s et vibre à chaque nouvelle mission.
- Regroupement des marqueurs (clustering) sur la carte quand il y a beaucoup d'incidents.

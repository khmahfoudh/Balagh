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

## 2. Indiquer l'adresse du backend

Le téléphone ne peut pas joindre `localhost` : il faut l'IP du PC sur le Wi-Fi (`ipconfig` → « Adresse IPv4 »).
Dans `apps/citizen/.env.local` et `apps/driver/.env.local` (copier `.env.example`) :

```
EXPO_PUBLIC_API_URL=http://172.20.10.9:8080
```

Dans `backend/.env`, mettre la même IP pour que les photos s'affichent sur le téléphone :
`PUBLIC_BASE_URL=http://172.20.10.9:8080`, puis redémarrer le backend.

Le PC et le téléphone doivent être sur le même réseau. Si Windows demande d'autoriser Java sur le réseau, acceptez
(sinon, le port 8080 est bloqué par le pare-feu).

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

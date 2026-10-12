import type { ExpoConfig } from 'expo/config';

// Clés Google Maps : variables d'environnement (jamais dans le code). Inutiles dans Expo Go,
// obligatoires pour un build de développement EAS ou une publication sur les stores.
const mapsPlugin: [string, Record<string, string>] = ['react-native-maps', {}];
if (process.env.GOOGLE_MAPS_ANDROID_API_KEY) mapsPlugin[1].androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
if (process.env.GOOGLE_MAPS_IOS_API_KEY) mapsPlugin[1].iosGoogleMapsApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY;

const config: ExpoConfig = {
  name: 'Balagh',
  slug: 'balagh-citizen',
  scheme: 'balagh',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: { bundleIdentifier: 'mr.balagh.citizen', supportsTablet: false },
  android: {
    package: 'mr.balagh.citizen',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0B6E4F' },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-location', { locationWhenInUsePermission: 'Balagh utilise votre position pour localiser le problème signalé.' }],
    ['expo-image-picker', {
      cameraPermission: 'Balagh utilise l’appareil photo pour photographier le problème signalé.',
      microphonePermission: 'Balagh utilise le micro pour les vidéos de signalement.',
    }],
    mapsPlugin,
  ],
};

export default config;

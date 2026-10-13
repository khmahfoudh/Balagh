import type { ExpoConfig } from 'expo/config';

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
  ],
};

export default config;

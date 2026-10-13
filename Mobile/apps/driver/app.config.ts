import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Balagh Chauffeur',
  slug: 'balagh-driver',
  scheme: 'balagh-driver',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: { bundleIdentifier: 'mr.balagh.driver', supportsTablet: false },
  android: {
    package: 'mr.balagh.driver',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#1F2933' },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-location', { locationWhenInUsePermission: 'Balagh Chauffeur utilise votre position pour trier les missions par distance.' }],
    ['expo-image-picker', {
      cameraPermission: 'Balagh Chauffeur utilise l’appareil photo pour la photo « après » de chaque mission.',
      microphonePermission: false,
    }],
  ],
};

export default config;

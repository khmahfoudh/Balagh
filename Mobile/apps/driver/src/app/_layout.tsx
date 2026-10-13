import {
  AuthProvider, I18nProvider, OfflineQueueRunner, configureApi, devServerApiUrl, setMapOptions, setRoutingUrl,
} from '@balagh/shared';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Adresse du backend : EXPO_PUBLIC_API_URL si défini (production, émulateur), sinon le PC qui sert l'app en
// développement (même IP que Metro, port 8080) : rien à changer quand l'IP Wi-Fi du PC change.
configureApi({
  baseUrl: process.env.EXPO_PUBLIC_API_URL || devServerApiUrl(Constants.expoConfig?.hostUri) || 'http://10.0.2.2:8080',
  app: 'DRIVER',
});
// Fond de carte : tuiles OpenStreetMap par défaut ; en production, l'adresse d'un fournisseur de tuiles OSM
setMapOptions({ tileUrl: process.env.EXPO_PUBLIC_MAP_TILE_URL, attribution: process.env.EXPO_PUBLIC_MAP_ATTRIBUTION });
// Calcul d'itinéraire : serveur OSRM de démonstration par défaut ; en production, un OSRM à soi
setRoutingUrl(process.env.EXPO_PUBLIC_ROUTING_URL);

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider app="DRIVER">
          <OfflineQueueRunner />
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

import { AuthProvider, I18nProvider, OfflineQueueRunner, configureApi, devServerApiUrl, setMapOptions } from '@balagh/shared';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Adresse du backend : EXPO_PUBLIC_API_URL si défini (production, émulateur), sinon le PC qui sert l'app en
// développement (même IP que Metro, port 8080) : rien à changer quand l'IP Wi-Fi du PC change.
configureApi({
  baseUrl: process.env.EXPO_PUBLIC_API_URL || devServerApiUrl(Constants.expoConfig?.hostUri) || 'http://10.0.2.2:8080',
  app: 'CITIZEN',
});
setMapOptions({ googleOnIOS: process.env.EXPO_PUBLIC_IOS_GOOGLE_MAPS === 'true' });

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider app="CITIZEN">
          <OfflineQueueRunner />
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="report" options={{ presentation: 'modal' }} />
          </Stack>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

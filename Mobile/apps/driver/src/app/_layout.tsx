import { AuthProvider, I18nProvider, OfflineQueueRunner, configureApi, setMapOptions } from '@balagh/shared';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Adresse du backend : apps/driver/.env.local → EXPO_PUBLIC_API_URL
configureApi({ baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8080', app: 'DRIVER' });
setMapOptions({ googleOnIOS: process.env.EXPO_PUBLIC_IOS_GOOGLE_MAPS === 'true' });

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

import { AuthProvider, I18nProvider, OfflineQueueRunner, configureApi, setMapOptions } from '@balagh/shared';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Adresse du backend : apps/citizen/.env.local → EXPO_PUBLIC_API_URL
configureApi({ baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8080', app: 'CITIZEN' });
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

import { colors, Loader, useAuth, useI18n } from '@balagh/shared';
import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';

const icon = (emoji: string) => ({ focused }: { focused: boolean }) => (
  <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
);

/** Onglets Missions, Carte, Historique (maquette 15-D1). */
export default function TabsLayout() {
  const { status } = useAuth();
  const { t } = useI18n();
  if (status === 'loading') return <Loader />;
  if (status !== 'signedIn') return <Redirect href="/login" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.green,
      tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
      tabBarStyle: { height: 66, paddingBottom: 8 },
    }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.missions'), tabBarIcon: icon('🚛') }} />
      <Tabs.Screen name="map" options={{ title: t('tabs.map'), tabBarIcon: icon('🗺️') }} />
      <Tabs.Screen name="history" options={{ title: t('tabs.history'), tabBarIcon: icon('🕘') }} />
    </Tabs>
  );
}

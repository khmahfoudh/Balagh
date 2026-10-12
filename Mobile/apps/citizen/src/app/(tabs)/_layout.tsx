import { colors, Loader, useAuth, useI18n } from '@balagh/shared';
import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';

const icon = (emoji: string) => ({ focused }: { focused: boolean }) => (
  <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
);

/** 3 écrans principaux : Carte, Suivi, Profil (cahier des charges §13, simplicité). */
export default function TabsLayout() {
  const { status } = useAuth();
  const { t } = useI18n();
  if (status === 'loading') return <Loader />;
  if (status !== 'signedIn') return <Redirect href="/login" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.green,
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      tabBarStyle: { height: 62, paddingBottom: 8 },
    }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.map'), tabBarIcon: icon('🗺️') }} />
      <Tabs.Screen name="reports" options={{ title: t('tabs.reports'), tabBarIcon: icon('📋') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('👤') }} />
    </Tabs>
  );
}

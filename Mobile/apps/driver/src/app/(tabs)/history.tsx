import {
  api, AppButton, Banner, Card, categoryIcon, colors, EmptyState, type MissionSummary, Row, Screen, spacing,
  styles, timeAgo, useAuth, useI18n,
} from '@balagh/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text } from 'react-native';

/** Historique des missions + profil du chauffeur (langue, déconnexion). */
export default function HistoryScreen() {
  const { t, lang, setLang, errorMessage } = useI18n();
  const { user, signOut } = useAuth();
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMissions(await api.missionHistory());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [errorMessage]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  return (
    <Screen title={t('history.title')}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg }}
        data={missions}
        keyExtractor={(m) => m.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[colors.green]} />}
        ListHeaderComponent={
          <Card>
            <Text style={styles.title}>{user?.firstName} {user?.lastName}</Text>
            <Text style={styles.muted}>{user?.organization?.name}</Text>
            <Row style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <AppButton label={lang === 'fr' ? 'العربية' : 'Français'} variant="outline" style={{ flex: 1 }}
                         onPress={() => setLang(lang === 'fr' ? 'ar' : 'fr')} />
              <AppButton label={t('profile.logout')} variant="danger" style={{ flex: 1 }} onPress={signOut} />
            </Row>
            {error ? <Banner tone="error" message={error} /> : null}
          </Card>
        }
        ListEmptyComponent={!loading ? <EmptyState message={t('history.empty')} /> : null}
        renderItem={({ item }) => (
          <Card accent={item.status === 'DONE' ? colors.resolved : colors.gray}>
            <Text style={styles.title}>{categoryIcon[item.category]} {t(`category.${item.category}`)}</Text>
            <Text style={styles.muted}>{item.place}</Text>
            <Text style={styles.muted}>
              {item.status === 'DONE' ? t('mission.steps.DONE') + ' · ' + timeAgo(item.completedAt, t) : t('mission.cancelled')}
            </Text>
          </Card>
        )}
      />
    </Screen>
  );
}

import {
  Banner, Card, categoryIcon, colors, EmptyState, formatDistance, PriorityBadge, Screen, spacing, styles,
  useI18n, useQueuedJobs,
} from '@balagh/shared';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { useMissions } from '../../hooks/useMissions';

/** « Mes missions » (maquette 15-D1) : urgentes d'abord, puis par distance, en temps réel. */
export default function MissionsScreen() {
  const { t } = useI18n();
  const queued = useQueuedJobs();
  const { missions, loading, error, newMission, dismissNew, reload } = useMissions();
  const truck = missions.find((m) => m.vehiclePlate)?.vehiclePlate;
  const busy = missions.some((m) => m.status === 'EN_ROUTE' || m.status === 'ON_SITE');

  return (
    <Screen title={t('missions.title')}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg }}
        data={missions}
        keyExtractor={(m) => m.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} colors={[colors.green]} />}
        ListHeaderComponent={
          <>
            <Text style={[styles.muted, { marginBottom: spacing.md }]}>
              {truck ? `🚛 ${truck} · ` : ''}
              <Text style={{ color: busy ? colors.blue : colors.resolved, fontWeight: '700' }}>
                {busy ? t('missions.busy') : t('missions.available')}
              </Text>
            </Text>
            {newMission ? (
              <Pressable onPress={dismissNew}><Banner tone="success" message={'🔔 ' + t('missions.newMission')} /></Pressable>
            ) : null}
            {queued.length > 0 ? <Banner tone="warning" message={t('common.offlinePending', { n: queued.length })} /> : null}
            {error ? <Banner tone="error" message={error} /> : null}
          </>
        }
        ListEmptyComponent={!loading ? <EmptyState message={t('missions.empty')} /> : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/mission/${item.id}`)} accessibilityRole="button">
            <Card accent={item.priority === 'URGENT' ? colors.red : colors.orange} style={{ minHeight: 96 }}>
              <View style={[styles.row, { gap: spacing.sm }]}>
                <PriorityBadge priority={item.priority} />
                <Text style={styles.title}>{categoryIcon[item.category]} {t(`category.${item.category}`)}</Text>
              </View>
              <Text style={{ marginTop: spacing.xs, color: colors.text }}>{t('common.reports', { n: item.reportersCount })}</Text>
              <Text style={styles.muted}>
                {[item.place, formatDistance(item.distanceMeters)].filter(Boolean).join(' · ')}
              </Text>
              {item.status !== 'ASSIGNED' ? (
                <Text style={{ marginTop: spacing.xs, color: colors.blue, fontWeight: '700' }}>
                  {t(`mission.steps.${item.status === 'DONE' ? 'DONE' : item.status === 'ON_SITE' ? 'ON_SITE' : 'EN_ROUTE'}`)}
                </Text>
              ) : null}
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}

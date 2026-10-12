import {
  api, AppButton, Banner, Card, categoryIcon, colors, EmptyState, type MyReport, radius, Screen, spacing,
  statusColor, StatusBadge, styles, timeAgo, useI18n, useQueuedJobs,
} from '@balagh/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Image, RefreshControl, Text, View } from 'react-native';

/**
 * « Mes signalements » (maquette 14-4) : statut en direct de chaque signalement,
 * et après résolution : photos avant / après + « vraiment résolu ? » pendant 72 h.
 */
export default function MyReportsScreen() {
  const { t, errorMessage } = useI18n();
  const queued = useQueuedJobs().filter((j) => j.kind === 'report');
  const [reports, setReports] = useState<MyReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await api.myReports());
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

  async function answer(report: MyReport, resolved: boolean) {
    setAnswering(report.incidentId);
    try {
      await api.feedback(report.incidentId, resolved);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setAnswering(null);
    }
  }

  return (
    <Screen title={t('reports.title')}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg }}
        data={reports}
        keyExtractor={(r) => r.reportId}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[colors.green]} />}
        ListHeaderComponent={
          <>
            {error ? <Banner tone="error" message={error} /> : null}
            {queued.map((job) => job.kind === 'report' ? (
              <Card key={job.id} accent={colors.gray}>
                <Text style={styles.title}>{categoryIcon[job.report.category]} {t(`category.${job.report.category}`)}</Text>
                <Text style={styles.muted}>{t('reports.pending')}</Text>
              </Card>
            ) : null)}
          </>
        }
        ListEmptyComponent={!loading && queued.length === 0 ? <EmptyState message={t('reports.empty')} /> : null}
        renderItem={({ item }) => (
          <Card accent={statusColor(item.status, item.priority)}>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text style={styles.title}>{categoryIcon[item.category]} {t(`category.${item.category}`)}</Text>
              <StatusBadge status={item.status} priority={item.priority} />
            </View>
            <Text style={styles.muted}>
              {[item.place, t('common.reports', { n: item.reportersCount }), timeAgo(item.createdAt, t)].filter(Boolean).join(' · ')}
            </Text>
            {item.description ? <Text style={{ marginTop: spacing.xs, color: colors.text }}>{item.description}</Text> : null}

            {item.status === 'RESOLVED' && (item.photoUrl || item.proofPhotoUrl) ? (
              <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.sm }]}>
                {[{ url: item.photoUrl, label: t('reports.before') }, { url: item.proofPhotoUrl, label: t('reports.after') }]
                  .map(({ url, label }) => url ? (
                    <View key={label} style={{ flex: 1 }}>
                      <Image source={{ uri: url }} style={{ height: 110, borderRadius: radius.sm, backgroundColor: colors.border }} />
                      <Text style={[styles.muted, { textAlign: 'center' }]}>{label}</Text>
                    </View>
                  ) : null)}
              </View>
            ) : null}

            {item.canGiveFeedback ? (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={{ fontWeight: '600', color: colors.text }}>{t('reports.resolvedQuestion')}</Text>
                <View style={[styles.row, { gap: spacing.sm }]}>
                  <AppButton label={t('reports.yes')} style={{ flex: 1 }} loading={answering === item.incidentId}
                             onPress={() => answer(item, true)} />
                  <AppButton label={t('reports.no')} variant="danger" style={{ flex: 1 }} disabled={answering === item.incidentId}
                             onPress={() => answer(item, false)} />
                </View>
              </View>
            ) : item.myFeedback != null ? (
              <Text style={[styles.muted, { marginTop: spacing.xs }]}>
                {item.myFeedback ? t('reports.myAnswer.yes') : t('reports.myAnswer.no')}
              </Text>
            ) : null}
          </Card>
        )}
      />
    </Screen>
  );
}

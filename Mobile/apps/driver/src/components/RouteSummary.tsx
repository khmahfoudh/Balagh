import { colors, formatDistance, formatDuration, type Route, type RouteState, spacing, styles, useI18n } from '@balagh/shared';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

/** « 🧭 4,3 km · 12 min en voiture », ou l'état du calcul. */
export function RouteSummary({ route, state, onRetry }: { route: Route | null; state: RouteState; onRetry: () => void }) {
  const { t } = useI18n();
  if (route) {
    return (
      <Text style={[styles.title, { marginTop: spacing.xs }]}>
        🧭 {t('route.summary', { d: formatDistance(route.distanceMeters), time: formatDuration(route.durationSeconds, t) })}
      </Text>
    );
  }
  if (state === 'loading') {
    return (
      <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.xs }]}>
        <ActivityIndicator color={colors.green} />
        <Text style={styles.muted}>{t('route.loading')}</Text>
      </View>
    );
  }
  if (state === 'noLocation') return <Text style={[styles.muted, { marginTop: spacing.xs }]}>{t('route.noLocation')}</Text>;
  if (state === 'error') {
    return (
      <Pressable onPress={onRetry} style={{ marginTop: spacing.xs }}>
        <Text style={styles.muted}>{t('route.unavailable')} <Text style={{ color: colors.green, fontWeight: '700' }}>{t('common.retry')}</Text></Text>
      </Pressable>
    );
  }
  return null;
}

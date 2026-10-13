import {
  api, AppButton, BalaghMap, Banner, categoryIcon, colors, distanceMeters, Loader, type MissionDetail, Screen,
  spacing, styles, useI18n, useRoute,
} from '@balagh/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { RouteSummary } from '../../components/RouteSummary';

/** À moins de 60 m (vol d'oiseau) de l'incident, le chauffeur est sur place. */
const ARRIVED_M = 60;

/**
 * Itinéraire dans l'application : trajet en voiture de la position du camion jusqu'à l'incident (OSRM,
 * données OpenStreetMap), recalculé en roulant, avec distance et durée restantes. « ◎ » centre la carte sur
 * le camion puis le suit. Le guidage vocal tour par tour reste dans Google Maps ou Waze.
 */
export default function ItineraryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, errorMessage } = useI18n();
  const [detail, setDetail] = useState<MissionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.mission(id).then(setDetail).catch((e) => setError(errorMessage(e)));
  }, [id, errorMessage]);

  const m = detail?.mission;
  const { route, state, position, retry } = useRoute(m ? { latitude: m.latitude, longitude: m.longitude } : null, true);

  if (!detail || !m) {
    return (
      <Screen title={t('route.title')}>
        {error ? <View style={{ padding: spacing.lg }}><Banner tone="error" message={error} /></View> : <Loader />}
      </Screen>
    );
  }

  const urgent = m.priority === 'URGENT';
  const remaining = position ? distanceMeters(position.latitude, position.longitude, m.latitude, m.longitude) : null;
  return (
    <Screen title={t('route.title')}>
      <View style={{ flex: 1 }}>
        <BalaghMap
          initialRegion={{ latitude: m.latitude, longitude: m.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
          showsUserLocation
          followUser
          route={route?.path}
          edgePadding={{ top: 112, right: 0, bottom: 150, left: 0 }}
          points={[{ id: m.id, latitude: m.latitude, longitude: m.longitude, color: urgent ? colors.red : colors.orange,
            urgentRadius: urgent ? 60 : undefined }]}
        />

        {/* En haut : destination et trajet restant */}
        <View style={{ position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md }}>
          <View style={[styles.card, { marginBottom: 0 }]}>
            <Text style={styles.title} numberOfLines={1}>{categoryIcon[m.category]} {t(`category.${m.category}`)}</Text>
            {m.place ? <Text style={styles.muted} numberOfLines={1}>{m.place}</Text> : null}
            {remaining != null && remaining <= ARRIVED_M
              ? <Text style={[styles.title, { color: colors.green, marginTop: spacing.xs }]}>{t('route.arrived')}</Text>
              : <RouteSummary route={route} state={state} onRetry={retry} />}
          </View>
        </View>

        {/* En bas : guidage vocal dans une autre application, retour à la mission */}
        <View style={{ position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md }}>
          <View style={[styles.row, { gap: spacing.sm }]}>
            <AppButton label={'🔊 ' + t('mission.openRoute')} variant="outline" style={{ flex: 1, backgroundColor: colors.white }}
                       onPress={() => Linking.openURL(detail.googleMapsUrl)} />
            <AppButton label={'🔊 ' + t('mission.openWaze')} variant="outline" style={{ flex: 1, backgroundColor: colors.white }}
                       onPress={() => Linking.openURL(detail.wazeUrl)} />
          </View>
          <AppButton label={t('route.back')} onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}

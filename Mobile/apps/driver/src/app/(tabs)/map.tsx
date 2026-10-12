import { BalaghMap, colors, NOUAKCHOTT, Screen, useI18n } from '@balagh/shared';
import { router } from 'expo-router';

import { useMissions } from '../../hooks/useMissions';

/** Carte des missions : rouge = urgente, orange = normale. Toucher un point ouvre la mission. */
export default function MissionsMapScreen() {
  const { t } = useI18n();
  const { missions, position } = useMissions();
  const initialRegion = position
    ? { latitude: position.latitude, longitude: position.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 }
    : NOUAKCHOTT;
  return (
    <Screen title={t('missions.mapTitle')}>
      <BalaghMap
        key={position ? 'located' : 'default'}
        initialRegion={initialRegion}
        showsUserLocation
        points={missions.map((m) => ({
          id: m.id,
          latitude: m.latitude,
          longitude: m.longitude,
          color: m.priority === 'URGENT' ? colors.red : colors.orange,
          title: t(`category.${m.category}`),
          description: m.place ?? undefined,
        }))}
        onPointPress={(id) => router.push(`/mission/${id}`)}
      />
    </Screen>
  );
}

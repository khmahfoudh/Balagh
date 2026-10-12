import {
  api, ApiError, AppButton, BalaghMap, Banner, categoryIcon, colors, distanceMeters, enqueue, formatDistance,
  getGpsFix, type MapIncident, newClientId, NOUAKCHOTT, regionToBox, type Region, Screen, spacing,
  statusColor, StatusBadge, styles, useI18n, useQueuedJobs,
} from '@balagh/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

/**
 * Carte « Autour de moi » (maquette 14-2) : incidents de la zone affichée (GET /map/incidents),
 * cercles rouges autour des urgences, bouton « + Signaler » toujours visible,
 * « Moi aussi je vois ce problème » sur un incident existant.
 */
export default function MapScreen() {
  const { t, errorMessage } = useI18n();
  const queued = useQueuedJobs();
  const [incidents, setIncidents] = useState<MapIncident[]>([]);
  const [selected, setSelected] = useState<MapIncident | null>(null);
  const [me, setMe] = useState<{ latitude: number; longitude: number } | null>(null);
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'warning'; text: string } | null>(null);
  const [meTooLoading, setMeTooLoading] = useState(false);
  const region = useRef<Region>(NOUAKCHOTT);

  useEffect(() => {
    getGpsFix(false)
      .then((fix) => {
        if (fix) {
          setMe(fix);
          setInitialRegion({ latitude: fix.latitude, longitude: fix.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 });
        } else {
          setMessage({ tone: 'warning', text: t('map.noLocation') });
          setInitialRegion(NOUAKCHOTT);
        }
      })
      .catch(() => setInitialRegion(NOUAKCHOTT));
  }, [t]);

  const load = useCallback(async () => {
    try {
      setIncidents(await api.mapIncidents(regionToBox(region.current)));
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  }, [errorMessage]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  async function meToo(incident: MapIncident) {
    setMeTooLoading(true);
    setMessage(null);
    const clientId = newClientId();
    try {
      const gps = await getGpsFix(true);
      if (!gps) throw new Error(t('report.permissionLocation'));
      try {
        const res = await api.meToo(incident.id, gps, clientId);
        setMessage({ tone: 'success', text: t('map.meTooDone') + ' ' + t('report.sentJoined', { n: res.reportersCount }) });
        load();
      } catch (e) {
        if (e instanceof ApiError && e.isNetwork) {
          await enqueue({ kind: 'meToo', incidentId: incident.id, gps, clientId });
          setMessage({ tone: 'warning', text: t('report.queued') });
        } else {
          throw e;
        }
      }
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    } finally {
      setMeTooLoading(false);
    }
  }

  const open = selected && selected.status !== 'RESOLVED' && selected.status !== 'REJECTED';
  return (
    <Screen title={t('map.title')}>
      <View style={{ flex: 1 }}>
        {initialRegion ? (
          <BalaghMap
            initialRegion={initialRegion}
            showsUserLocation
            points={incidents.map((i) => ({
              id: i.id,
              latitude: i.latitude,
              longitude: i.longitude,
              color: statusColor(i.status, i.priority),
              urgentRadius: i.priority === 'URGENT' && i.status !== 'RESOLVED' ? i.radiusM : undefined,
            }))}
            onRegionChangeComplete={(r) => {
              region.current = r;
              load();
            }}
            onPointPress={(id) => setSelected(incidents.find((i) => i.id === id) ?? null)}
          />
        ) : null}

        <View style={{ position: 'absolute', top: spacing.md, left: spacing.md, right: spacing.md }}>
          {queued.length > 0 ? <Banner tone="warning" message={t('common.offlinePending', { n: queued.length })} /> : null}
          {message ? <Banner tone={message.tone} message={message.text} /> : null}
        </View>

        {selected ? (
          <View style={{ position: 'absolute', left: spacing.md, right: spacing.md, bottom: 96 }}>
            <View style={[styles.card, { marginBottom: 0 }]}>
              <View style={[styles.row, { justifyContent: 'space-between' }]}>
                <Text style={styles.title}>{categoryIcon[selected.category]} {t(`category.${selected.category}`)}</Text>
                <StatusBadge status={selected.status} priority={selected.priority} />
              </View>
              <Text style={[styles.muted, { marginVertical: spacing.xs }]}>
                {t('common.reports', { n: selected.reportersCount })}
                {me ? ' · ' + t('map.distance', {
                  d: formatDistance(distanceMeters(me.latitude, me.longitude, selected.latitude, selected.longitude)),
                }) : ''}
              </Text>
              {open ? <AppButton label={t('map.meToo')} variant="outline" loading={meTooLoading} onPress={() => meToo(selected)} /> : null}
              <Pressable onPress={() => setSelected(null)}><Text style={[styles.muted, { textAlign: 'center' }]}>{t('common.close')}</Text></Pressable>
            </View>
          </View>
        ) : null}

        <View style={{ position: 'absolute', bottom: spacing.lg, alignSelf: 'center', width: 200 }}>
          <AppButton label={t('map.report')} variant="gold" onPress={() => router.push('/report')}
                     style={{ borderRadius: 30, minHeight: 56, shadowColor: colors.text, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 }} />
        </View>
      </View>
    </Screen>
  );
}

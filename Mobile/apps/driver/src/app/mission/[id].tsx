import {
  api, ApiError, AppButton, BalaghMap, Banner, capture, categoryIcon, colors, enqueue, Field, formatDistance,
  getGpsFix, type LocalFile, Loader, type MissionDetail, type MissionStatus, radius, Screen, spacing, styles,
  timeAgo, useI18n,
} from '@balagh/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, ScrollView, Text, View } from 'react-native';

const STEPS = ['ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'DONE'] as const;

/**
 * Détail d'une mission (maquettes 15-D2 et D3) :
 * photos des citoyens, itinéraire dans Google Maps ou Waze, boutons En route → Arrivé → Terminé.
 * Terminer exige la photo « après » (avec position GPS et heure). Hors ligne, les actions sont mises en file.
 */
export default function MissionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, errorMessage } = useI18n();
  const [detail, setDetail] = useState<MissionDetail | null>(null);
  const [status, setStatus] = useState<MissionStatus | null>(null);
  const [proof, setProof] = useState<LocalFile | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'warning'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const fix = await getGpsFix(false).catch(() => null);
      const d = await api.mission(id, fix?.latitude, fix?.longitude);
      setDetail(d);
      setStatus(d.mission.status);
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  }, [id, errorMessage]);

  useEffect(() => {
    load();
  }, [load]);

  /** Envoie l'étape ; sans réseau, la met en file et avance l'écran quand même. */
  async function advance(target: MissionStatus, extraNote?: string) {
    setBusy(true);
    setMessage(null);
    try {
      await api.setMissionStatus(id, target, extraNote);
      setStatus(target);
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) {
        await enqueue({ kind: 'missionStatus', missionId: id, status: target, note: extraNote });
        setStatus(target);
        setMessage({ tone: 'warning', text: t('mission.queued') });
      } else {
        setMessage({ tone: 'error', text: errorMessage(e) });
        throw e;
      }
    } finally {
      setBusy(false);
    }
  }

  async function takeProof() {
    try {
      const photo = await capture('photo');
      if (photo) setProof(photo);
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  }

  /** Photo « après » puis statut DONE : l'incident passe RÉSOLU et les citoyens sont notifiés. */
  async function finish() {
    if (!proof) return;
    setBusy(true);
    setMessage(null);
    const gps = (await getGpsFix(true).catch(() => null)) ?? undefined;
    try {
      try {
        await api.uploadProof(id, proof, gps);
      } catch (e) {
        if (!(e instanceof ApiError && e.isNetwork)) throw e;
        await enqueue({ kind: 'proof', missionId: id, photo: proof, gps });
        await enqueue({ kind: 'missionStatus', missionId: id, status: 'DONE', note: note.trim() || undefined });
        setStatus('DONE');
        setMessage({ tone: 'warning', text: t('mission.queued') });
        return;
      }
      await advance('DONE', note.trim() || undefined);
      setMessage({ tone: 'success', text: t('mission.finished') });
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!detail || !status) {
    return (
      <Screen title={t('mission.normal')}>
        {message ? <View style={{ padding: spacing.lg }}><Banner tone={message.tone} message={message.text} /></View> : <Loader />}
      </Screen>
    );
  }

  const m = detail.mission;
  const urgent = m.priority === 'URGENT';
  const stepIndex = STEPS.indexOf(status as (typeof STEPS)[number]);
  return (
    <Screen title={urgent ? t('mission.urgent') : t('mission.normal')}
            right={<Text style={{ color: colors.gold, fontSize: 22, fontWeight: '700' }}>{urgent ? 'عاجل' : 'مهمة'}</Text>}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <BalaghMap
          style={{ height: 190 }}
          initialRegion={{ latitude: m.latitude, longitude: m.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
          showsUserLocation
          points={[{ id: m.id, latitude: m.latitude, longitude: m.longitude, color: urgent ? colors.red : colors.orange,
            urgentRadius: urgent ? 60 : undefined }]}
        />

        <View style={{ padding: spacing.lg }}>
          {message ? <Banner tone={message.tone} message={message.text} /> : null}

          <Text style={styles.title}>{categoryIcon[m.category]} {t(`category.${m.category}`)}</Text>
          <Text style={styles.muted}>{[m.place, formatDistance(m.distanceMeters)].filter(Boolean).join(' · ')}</Text>
          <Text style={styles.muted}>
            {t('common.reports', { n: m.reportersCount })} · {t('mission.firstReport', { ago: timeAgo(m.firstReportedAt, t) })}
          </Text>
          {m.vehiclePlate ? <Text style={styles.muted}>🚛 {m.vehiclePlate} · {m.vehicleType}</Text> : null}

          {/* Étapes : Assignée → En route → Sur place → Fin */}
          <View style={[styles.row, { gap: 6, marginVertical: spacing.md, flexWrap: 'wrap' }]}>
            {STEPS.map((s, i) => (
              <View key={s} style={[styles.badge, { backgroundColor: i <= stepIndex ? colors.resolved : colors.border }]}>
                <Text style={[styles.badgeText, { color: i <= stepIndex ? colors.white : colors.muted }]}>{t(`mission.steps.${s}`)}</Text>
              </View>
            ))}
          </View>

          {detail.citizenPhotos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
              {detail.citizenPhotos.map((p) => (
                <Image key={p.id} source={{ uri: p.url }}
                       style={{ width: 110, height: 90, borderRadius: radius.sm, marginRight: spacing.sm, backgroundColor: colors.border }} />
              ))}
            </ScrollView>
          ) : null}
          {detail.citizenDescriptions.map((d, i) => <Text key={i} style={[styles.muted, { fontStyle: 'italic' }]}>« {d} »</Text>)}

          {status !== 'DONE' && status !== 'CANCELLED' ? (
            <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.md }]}>
              <AppButton label={t('mission.openRoute')} variant="outline" style={{ flex: 2 }}
                         onPress={() => Linking.openURL(detail.googleMapsUrl)} />
              <AppButton label={t('mission.openWaze')} variant="outline" style={{ flex: 1 }}
                         onPress={() => Linking.openURL(detail.wazeUrl)} />
            </View>
          ) : null}

          {status === 'ASSIGNED' ? (
            <AppButton label={t('mission.start')} loading={busy} onPress={() => advance('EN_ROUTE').catch(() => undefined)} />
          ) : null}
          {status === 'EN_ROUTE' ? (
            <AppButton label={t('mission.arrived')} loading={busy} onPress={() => advance('ON_SITE').catch(() => undefined)} />
          ) : null}

          {status === 'ON_SITE' ? (
            <View style={{ marginTop: spacing.md }}>
              <Text style={[styles.title, { marginBottom: spacing.sm }]}>{t('mission.finishTitle')}</Text>
              <Text style={{ fontWeight: '700', color: colors.text, marginBottom: spacing.xs }}>{t('mission.proof')}</Text>
              {proof ? (
                <Image source={{ uri: proof.uri }} style={{ height: 180, borderRadius: radius.md, marginBottom: spacing.sm }} />
              ) : null}
              <AppButton label={proof ? '📷 ' + t('report.takePhoto') : '📷 ' + t('mission.takeProof')} variant="outline" onPress={takeProof} />
              <Field label={t('mission.note')} placeholder={t('mission.notePlaceholder')} value={note} onChangeText={setNote} />
              <AppButton label={t('mission.done')} loading={busy} disabled={!proof} onPress={finish} />
              <Text style={[styles.muted, { textAlign: 'center' }]}>{t('mission.citizenNotified')}</Text>
            </View>
          ) : null}

          {status === 'DONE' ? (
            <>
              {detail.proof ? <Image source={{ uri: detail.proof.url }} style={{ height: 180, borderRadius: radius.md }} /> : null}
              <AppButton label={t('common.close')} onPress={() => router.back()} />
            </>
          ) : null}
          {status === 'CANCELLED' ? <Banner tone="warning" message={t('mission.cancelled')} /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

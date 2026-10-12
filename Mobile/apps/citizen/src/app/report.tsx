import {
  api, ApiError, AppButton, Banner, type Category, categoryIcon, capture, colors, enqueue, Field, getGpsFix,
  type GpsFix, type LocalFile, newClientId, radius, Screen, spacing, styles, useI18n,
} from '@balagh/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';

const CATEGORIES: Category[] = ['WASTE', 'STAGNANT_WATER', 'ROAD_HOLE'];
const MAX_MEDIA = 3;
const MAX_ACCURACY_M = 50;

/**
 * Nouveau signalement en moins de 30 secondes (maquette 14-3) :
 * catégorie → photo ou vidéo 15 s → GPS automatique → description facultative → Envoyer.
 * Sans réseau, le signalement est mis en file d'attente et envoyé plus tard.
 */
export default function NewReportScreen() {
  const { t, errorMessage } = useI18n();
  const [category, setCategory] = useState<Category | null>(null);
  const [media, setMedia] = useState<LocalFile[]>([]);
  const [gps, setGps] = useState<GpsFix | null>(null);
  const [locating, setLocating] = useState(true);
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function locate() {
    setLocating(true);
    try {
      const fix = await getGpsFix(true);
      if (!fix) setError(t('report.permissionLocation'));
      setGps(fix);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(kind: 'photo' | 'video') {
    setError(null);
    try {
      const file = await capture(kind);
      if (file) setMedia((list) => [...list, file].slice(0, MAX_MEDIA));
    } catch (e) {
      setError(e instanceof Error && e.message === 'CAMERA_PERMISSION' ? t('report.permissionCamera') : errorMessage(e));
    }
  }

  async function send() {
    if (!category) return setError(t('report.needCategory'));
    if (media.length === 0) return setError(t('report.needMedia'));
    if (!gps) return setError(t('report.needGps'));
    setSending(true);
    setError(null);
    const report = { category, gps, description: description.trim() || undefined, clientId: newClientId() };
    try {
      const res = await api.createReport(report, media);
      setDone(res.priority === 'URGENT'
        ? t('report.sentUrgent', { n: res.reportersCount })
        : res.newIncident ? t('report.sent') : t('report.sentJoined', { n: res.reportersCount }));
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) {
        await enqueue({ kind: 'report', report, media });
        setDone(t('report.queued'));
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <Screen title={t('report.title')}>
        <View style={{ padding: spacing.lg }}>
          <Banner tone="success" message={done} />
          <AppButton label={t('common.close')} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const inaccurate = gps != null && gps.accuracy > MAX_ACCURACY_M;
  return (
    <Screen title={t('report.title')}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {error ? <Banner tone="error" message={error} /> : null}

        <Text style={[styles.title, { marginBottom: spacing.sm }]}>{t('report.step1')}</Text>
        <View style={[styles.row, { gap: spacing.sm, marginBottom: spacing.lg }]}>
          {CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <Pressable key={c} onPress={() => setCategory(c)} accessibilityRole="button"
                         style={{ flex: 1, minHeight: 92, borderRadius: radius.md, borderWidth: 2, alignItems: 'center',
                           justifyContent: 'center', borderColor: active ? colors.green : colors.border,
                           backgroundColor: active ? colors.greenLight : colors.white }}>
                <Text style={{ fontSize: 30 }}>{categoryIcon[c]}</Text>
                <Text style={{ fontWeight: '700', color: active ? colors.green : colors.text }}>{t(`category.short.${c}`)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.title, { marginBottom: spacing.sm }]}>{t('report.step2')}</Text>
        <View style={[styles.row, { gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.sm }]}>
          {media.map((file, index) => (
            <Pressable key={file.uri} onLongPress={() => setMedia(media.filter((_, i) => i !== index))}>
              {file.type.startsWith('video') ? (
                <View style={{ width: 96, height: 96, borderRadius: radius.sm, backgroundColor: colors.text,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.white, fontSize: 28 }}>▶</Text>
                </View>
              ) : (
                <Image source={{ uri: file.uri }} style={{ width: 96, height: 96, borderRadius: radius.sm }} />
              )}
            </Pressable>
          ))}
        </View>
        {media.length < MAX_MEDIA ? (
          <View style={[styles.row, { gap: spacing.sm, marginBottom: spacing.lg }]}>
            <AppButton label={'📷 ' + t('report.takePhoto')} variant="outline" onPress={() => add('photo')} style={{ flex: 1 }} />
            <AppButton label={'🎥 ' + t('report.takeVideo')} variant="outline" onPress={() => add('video')} style={{ flex: 1 }} />
          </View>
        ) : null}

        <Text style={[styles.title, { marginBottom: spacing.sm }]}>{t('report.step3')}</Text>
        <View style={[styles.card, { backgroundColor: inaccurate ? '#FFF4DB' : colors.greenLight }]}>
          {locating ? (
            <Text style={styles.muted}>{t('report.locating')}</Text>
          ) : gps ? (
            <>
              <Text style={{ fontWeight: '700', color: inaccurate ? '#8A6100' : colors.greenDark }}>
                {inaccurate ? t('report.inaccurate', { m: gps.accuracy }) : t('report.position', { m: gps.accuracy })}
              </Text>
              <Text style={styles.muted}>{gps.latitude.toFixed(5)}, {gps.longitude.toFixed(5)}</Text>
            </>
          ) : (
            <Text style={styles.muted}>{t('report.needGps')}</Text>
          )}
          <AppButton label={t('report.refreshPosition')} variant="ghost" onPress={locate} />
        </View>

        <Field label={t('report.description')} placeholder={t('report.descriptionPlaceholder')} value={description}
               onChangeText={setDescription} multiline maxLength={500} />

        <AppButton label={t('report.send')} onPress={send} loading={sending}
                   disabled={!category || media.length === 0 || !gps || inaccurate} />
        <AppButton label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

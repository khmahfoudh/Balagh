import {
  api, AppButton, Banner, Field, type OtpSentResponse, OtpStep, Screen, spacing, styles, useAuth, useI18n,
} from '@balagh/shared';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

/** Inscription : nom, prénom, téléphone (+222), NNI, puis code SMS (maquette 14-1). */
export default function RegisterScreen() {
  const { t, lang, errorMessage } = useI18n();
  const { status } = useAuth();
  const [form, setForm] = useState({ lastName: '', firstName: '', phone: '', nni: '' });
  const [sent, setSent] = useState<OtpSentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'signedIn') return <Redirect href="/(tabs)" />;

  const update = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });
  const valid = form.lastName.trim() && form.firstName.trim() && form.phone.trim().length >= 8 && /^\d{10}$/.test(form.nni);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      setSent(await api.register({ ...form, preferredLang: lang }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title={t('auth.register.title')}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        {sent ? (
          <OtpStep sent={sent} onBack={() => setSent(null)} />
        ) : (
          <>
            <Text style={[styles.muted, { marginBottom: spacing.lg }]}>{t('auth.register.subtitle')}</Text>
            {error ? <Banner tone="error" message={error} /> : null}
            <Field label={t('auth.lastName')} value={form.lastName} onChangeText={update('lastName')} autoComplete="family-name" />
            <Field label={t('auth.firstName')} value={form.firstName} onChangeText={update('firstName')} autoComplete="given-name" />
            <Field label={t('auth.phone')} placeholder={t('auth.phonePlaceholder')} value={form.phone}
                   onChangeText={update('phone')} keyboardType="phone-pad" autoComplete="tel" />
            <Field label={t('auth.nni')} value={form.nni} onChangeText={update('nni')} keyboardType="number-pad"
                   maxLength={10} hint={t('auth.nniHint')} />
            <AppButton label={t('auth.getCode')} onPress={submit} loading={loading} disabled={!valid} />
            <AppButton variant="ghost" label={t('auth.haveAccount')} onPress={() => router.replace('/login')} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

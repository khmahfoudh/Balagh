import { type ReactNode, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { api } from '../api/endpoints';
import type { OtpSentResponse, TokenResponse } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { colors, spacing } from '../theme';
import { AppButton, Banner, Field, styles } from './ui';

/**
 * Saisie du code SMS (6 chiffres). Utilisée après l'inscription et à la connexion.
 * Sans fournisseur SMS (développement), le backend renvoie le code (devCode) : il est affiché et pré-rempli.
 */
export function OtpStep({ sent, onBack }: { sent: OtpSentResponse; onBack: () => void }) {
  const { t, errorMessage } = useI18n();
  const { signIn } = useAuth();
  const [current, setCurrent] = useState(sent);
  const [code, setCode] = useState(sent.devCode ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setLoading(true);
    setError(null);
    try {
      await signIn(await api.verifyOtp(current.phone, code.trim()));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      const again = await api.requestOtp(current.phone);
      setCurrent(again);
      if (again.devCode) setCode(again.devCode);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <View>
      <Text style={[styles.muted, { marginBottom: spacing.md }]}>{t('auth.codeSentTo', { phone: current.phone })}</Text>
      {current.devCode ? <Banner tone="warning" message={t('auth.devCode', { code: current.devCode })} /> : null}
      {error ? <Banner tone="error" message={error} /> : null}
      <Field label={t('auth.code')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6}
             autoFocus textContentType="oneTimeCode" autoComplete="sms-otp" />
      <AppButton label={t('auth.verify')} onPress={verify} loading={loading} disabled={code.trim().length !== 6} />
      <AppButton label={t('auth.resend')} variant="ghost" onPress={resend} />
      <AppButton label={t('auth.changeNumber')} variant="ghost" onPress={onBack} />
    </View>
  );
}

/**
 * Connexion par téléphone : code SMS (citoyen et chauffeur, cahier des charges §12).
 * allowPassword : connexion par mot de passe pour tester avec les comptes de démonstration.
 */
export function PhoneLogin({ title, subtitle, allowPassword, footer }: {
  title: string; subtitle?: string; allowPassword?: boolean; footer?: ReactNode;
}) {
  const { t, errorMessage, lang, setLang } = useI18n();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sms' | 'password'>('sms');
  const [sent, setSent] = useState<OtpSentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'sms') {
        setSent(await api.requestOtp(phone));
      } else {
        const response: TokenResponse = await api.login(phone, password);
        await signIn(response);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: spacing.xs }}>{title}</Text>
      {subtitle ? <Text style={[styles.muted, { marginBottom: spacing.lg }]}>{subtitle}</Text> : null}
      {sent ? (
        <OtpStep sent={sent} onBack={() => setSent(null)} />
      ) : (
        <View>
          {error ? <Banner tone="error" message={error} /> : null}
          <Field label={t('auth.phone')} placeholder={t('auth.phonePlaceholder')} value={phone}
                 onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
          {mode === 'password' ? (
            <Field label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry />
          ) : null}
          <AppButton label={mode === 'sms' ? t('auth.getCode') : t('auth.login')} onPress={submit} loading={loading}
                     disabled={phone.trim().length < 8 || (mode === 'password' && !password)} />
          {allowPassword ? (
            <AppButton variant="ghost" label={mode === 'sms' ? t('auth.withPassword') : t('auth.withSms')}
                       onPress={() => setMode(mode === 'sms' ? 'password' : 'sms')} />
          ) : null}
          {footer}
        </View>
      )}
      <AppButton variant="ghost" label={lang === 'fr' ? 'العربية' : 'Français'}
                 onPress={() => setLang(lang === 'fr' ? 'ar' : 'fr')} />
    </ScrollView>
  );
}

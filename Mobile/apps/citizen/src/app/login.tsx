import { AppButton, PhoneLogin, Screen, useAuth, useI18n } from '@balagh/shared';
import { Redirect, router } from 'expo-router';

export default function LoginScreen() {
  const { t } = useI18n();
  const { status } = useAuth();
  if (status === 'signedIn') return <Redirect href="/(tabs)" />;
  return (
    <Screen title={t('app.name')}>
      <PhoneLogin
        title={t('auth.welcome')}
        allowPassword={__DEV__}
        footer={<AppButton variant="outline" label={t('auth.noAccount')} onPress={() => router.push('/register')} />}
      />
    </Screen>
  );
}

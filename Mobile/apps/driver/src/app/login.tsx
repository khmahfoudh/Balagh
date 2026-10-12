import { PhoneLogin, Screen, useAuth, useI18n } from '@balagh/shared';
import { Redirect } from 'expo-router';

/** Le chauffeur se connecte avec le numéro invité par son responsable (code SMS). */
export default function LoginScreen() {
  const { t } = useI18n();
  const { status } = useAuth();
  if (status === 'signedIn') return <Redirect href="/(tabs)" />;
  return (
    <Screen title="Balagh · Chauffeur">
      <PhoneLogin title={t('auth.driverWelcome')} allowPassword={__DEV__} />
    </Screen>
  );
}

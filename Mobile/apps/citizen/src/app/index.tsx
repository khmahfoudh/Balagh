import { Loader, useAuth } from '@balagh/shared';
import { Redirect } from 'expo-router';

/** Aiguillage au démarrage : connecté → carte, sinon → connexion. */
export default function Index() {
  const { status } = useAuth();
  if (status === 'loading') return <Loader />;
  return <Redirect href={status === 'signedIn' ? '/(tabs)' : '/login'} />;
}

import { Loader, useAuth } from '@balagh/shared';
import { Redirect } from 'expo-router';

export default function Index() {
  const { status } = useAuth();
  if (status === 'loading') return <Loader />;
  return <Redirect href={status === 'signedIn' ? '/(tabs)' : '/login'} />;
}

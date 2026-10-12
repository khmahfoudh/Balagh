import * as SecureStore from 'expo-secure-store';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiError, configureApi, setTokens, type Tokens } from '../api/client';
import { api } from '../api/endpoints';
import type { ClientApp, Me, TokenResponse } from '../api/types';

const TOKENS_KEY = 'balagh.tokens';
const USER_KEY = 'balagh.user';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  user: Me | null;
  /** Après vérification du code SMS ou du mot de passe. */
  signIn: (response: TokenResponse) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const roleForApp: Record<ClientApp, string[]> = {
  CITIZEN: ['CITIZEN'],
  DRIVER: ['DRIVER'],
  DASHBOARD: ['AGENT', 'MANAGER', 'ADMIN', 'AUTHORITY'],
};

/**
 * Session : jetons conservés dans le stockage sécurisé du téléphone (expo-secure-store).
 * Connexion persistante ; hors ligne, l'utilisateur reste connecté avec son dernier profil connu.
 */
export function AuthProvider({ app, children }: { app: ClientApp; children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<Me | null>(null);

  const clearLocal = useCallback(async () => {
    setTokens(null);
    setUser(null);
    setStatus('signedOut');
    await SecureStore.deleteItemAsync(TOKENS_KEY).catch(() => undefined);
    await SecureStore.deleteItemAsync(USER_KEY).catch(() => undefined);
  }, []);

  useEffect(() => {
    configureApi({
      app,
      onTokens: (tokens: Tokens | null) => {
        if (tokens) {
          SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens)).catch(() => undefined);
        } else {
          clearLocal();
        }
      },
    });

    (async () => {
      const saved = await SecureStore.getItemAsync(TOKENS_KEY).catch(() => null);
      if (!saved) {
        setStatus('signedOut');
        return;
      }
      setTokens(JSON.parse(saved) as Tokens);
      try {
        const me = await api.me();
        if (!roleForApp[app].includes(me.role)) {
          await clearLocal();
          return;
        }
        setUser(me);
        setStatus('signedIn');
        SecureStore.setItemAsync(USER_KEY, JSON.stringify(me)).catch(() => undefined);
      } catch (error) {
        const cached = await SecureStore.getItemAsync(USER_KEY).catch(() => null);
        if (error instanceof ApiError && error.isNetwork && cached) {
          setUser(JSON.parse(cached) as Me);
          setStatus('signedIn');
        } else {
          await clearLocal();
        }
      }
    })();
  }, [app, clearLocal]);

  const signIn = useCallback(async (response: TokenResponse) => {
    const tokens = { accessToken: response.accessToken, refreshToken: response.refreshToken };
    setTokens(tokens);
    await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens));
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(response.user)).catch(() => undefined);
    setUser(response.user);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // déconnexion locale même sans réseau
    }
    await clearLocal();
  }, [clearLocal]);

  const refreshUser = useCallback(async () => {
    const me = await api.me();
    setUser(me);
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(me)).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ status, user, signIn, signOut, refreshUser }),
    [status, user, signIn, signOut, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return value;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiError, configureApi } from '../api/client';
import { ar, fr, type StringKey } from './strings';

export type Lang = 'fr' | 'ar';
const STORAGE_KEY = 'balagh.lang';
const dictionaries = { fr, ar };

interface I18nValue {
  lang: Lang;
  isRTL: boolean;
  setLang: (lang: Lang) => void;
  t: (key: StringKey, params?: Record<string, string | number>) => string;
  /** Message lisible d'une erreur API (traduit si le code est connu). */
  errorMessage: (error: unknown) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Langue arabe (droite à gauche) ou française, changement à chaud : les écrans lisent isRTL
 * pour aligner textes et rangées, sans redémarrer l'application.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('fr');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'fr' || saved === 'ar') setLangState(saved);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    configureApi({ getLanguage: () => lang });
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t = (key: StringKey, params?: Record<string, string | number>) => {
      let text = dictionaries[lang][key] ?? fr[key] ?? key;
      if (params) {
        for (const [name, v] of Object.entries(params)) {
          text = text.replace(`{${name}}`, String(v));
        }
      }
      return text;
    };
    const errorMessage = (error: unknown) => {
      if (error instanceof ApiError) {
        const key = `errors.${error.code}` as StringKey;
        return key in fr ? t(key) : error.message;
      }
      return error instanceof Error ? error.message : String(error);
    };
    return { lang, isRTL: lang === 'ar', setLang, t, errorMessage };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n doit être utilisé dans <I18nProvider>');
  return value;
}

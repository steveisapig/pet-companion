import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { i18n, getDeviceLanguage, initializeI18n } from '@/lib/i18n';
import { SUPPORTED_LANGUAGES, type AppLanguage } from '@/locales';

const LANGUAGE_STORAGE_KEY = 'app-language';
export type LanguagePreference = AppLanguage | 'system';

interface I18nContextValue {
  locale: AppLanguage;
  deviceLocale: AppLanguage;
  preference: LanguagePreference;
  isReady: boolean;
  setLanguagePreference: (nextPreference: LanguagePreference) => Promise<void>;
  supportedLanguages: readonly AppLanguage[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [deviceLocale, setDeviceLocale] = useState<AppLanguage>(getDeviceLanguage());
  const [locale, setLocaleState] = useState<AppLanguage>(deviceLocale);
  const [preference, setPreference] = useState<LanguagePreference>('system');
  const [isReady, setIsReady] = useState(false);

  const setLanguagePreference = useCallback(async (nextPreference: LanguagePreference) => {
    const nextDeviceLocale = getDeviceLanguage();
    const nextLocale = nextPreference === 'system' ? nextDeviceLocale : nextPreference;
    await initializeI18n();
    await i18n.changeLanguage(nextLocale);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextPreference);
    setDeviceLocale(nextDeviceLocale);
    setPreference(nextPreference);
    setLocaleState(nextLocale);
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      await initializeI18n();
      const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      const normalizedStored =
        stored === 'zh-CN' ? 'zhHans' : stored === 'zh-TW' ? 'zhHant' : stored;
      const nextDeviceLocale = getDeviceLanguage();
      const nextPreference: LanguagePreference =
        normalizedStored === 'system' || normalizedStored == null
          ? 'system'
          : normalizedStored && SUPPORTED_LANGUAGES.includes(normalizedStored as AppLanguage)
            ? (normalizedStored as AppLanguage)
            : 'system';
      const nextLocale = nextPreference === 'system' ? nextDeviceLocale : nextPreference;
      await i18n.changeLanguage(nextLocale);
      if (!mounted) return;
      setDeviceLocale(nextDeviceLocale);
      setPreference(nextPreference);
      setLocaleState(nextLocale);
      setIsReady(true);
    };

    load().catch((error) => {
      console.error('[i18n] initialization failed:', error);
      if (!mounted) return;
      const nextDeviceLocale = getDeviceLanguage();
      setDeviceLocale(nextDeviceLocale);
      setPreference('system');
      setLocaleState(nextDeviceLocale);
      setIsReady(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      deviceLocale,
      preference,
      isReady,
      setLanguagePreference,
      supportedLanguages: SUPPORTED_LANGUAGES,
    }),
    [deviceLocale, isReady, locale, preference, setLanguagePreference]
  );

  return (
    <I18nContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return value;
}

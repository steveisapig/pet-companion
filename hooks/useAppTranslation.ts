import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useI18n } from '@/providers/I18nProvider';

export function useAppTranslation() {
  const { t, i18n } = useTranslation('common');
  const { locale, deviceLocale, preference, isReady, setLanguagePreference, supportedLanguages } =
    useI18n();

  return useMemo(
    () => ({
      t,
      i18n,
      locale,
      deviceLocale,
      preference,
      isReady,
      setLanguagePreference,
      supportedLanguages,
    }),
    [t, i18n, locale, deviceLocale, preference, isReady, setLanguagePreference, supportedLanguages]
  );
}

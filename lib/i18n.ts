import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  DEFAULT_LANGUAGE,
  resources,
  SUPPORTED_LANGUAGES,
  type AppLanguage,
} from '@/locales';

function normalizeLocaleTag(tag?: string | null): AppLanguage {
  if (!tag) return DEFAULT_LANGUAGE;
  const normalized = tag.toLowerCase();

  if (normalized.startsWith('zh')) {
    if (
      normalized.includes('hant') ||
      normalized.includes('-tw') ||
      normalized.includes('-hk') ||
      normalized.includes('-mo')
    ) {
      return 'zhHant';
    }
    return 'zhHans';
  }

  const language = normalized.split('-')[0];
  return SUPPORTED_LANGUAGES.includes(language as AppLanguage)
    ? (language as AppLanguage)
    : DEFAULT_LANGUAGE;
}

function resolveLocaleTag(): string | null | undefined {
  return Intl.DateTimeFormat().resolvedOptions().locale;
}

export function getDeviceLanguage(): AppLanguage {
  return normalizeLocaleTag(resolveLocaleTag());
}

let initPromise: Promise<typeof i18n> | null = null;

export function initializeI18n(): Promise<typeof i18n> {
  if (i18n.isInitialized) {
    return Promise.resolve(i18n);
  }
  if (!initPromise) {
    initPromise = i18n.use(initReactI18next).init({
      resources,
      lng: DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      defaultNS: 'common',
      ns: ['common'],
      interpolation: {
        escapeValue: false,
      },
      compatibilityJSON: 'v4',
      returnNull: false,
    });
  }
  return initPromise;
}

export { i18n };

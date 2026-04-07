import { en } from '@/locales/en';
import { ja } from '@/locales/ja';
import { zhHans } from '@/locales/zhHans';
import { zhHant } from '@/locales/zhHant';

export const resources = {
  en,
  ja,
  zhHans,
  zhHant,
} as const;

export type AppLanguage = keyof typeof resources;

export const DEFAULT_LANGUAGE: AppLanguage = 'en';

export const SUPPORTED_LANGUAGES: AppLanguage[] = ['en', 'ja', 'zhHans', 'zhHant'];

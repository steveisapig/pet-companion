import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { ITEM_TYPE_TO_NUTRIENT, type NutrientSlug } from '@/constants/badge-types';
import type { PetPhoto } from '@/lib/supabase-photos';
import { supabase } from '@/lib/supabase';

const IS_DEV = Constants.expoConfig?.extra?.IS_DEV === true;
const CACHE_PREFIX = 'nutrition-window-analysis:v1';
const LAST_ANALYZED_PREFIX = 'nutrition-window-analysis:last-analyzed-at:v1';

export const NUTRITION_ANALYSIS_REQUIRED_PHOTOS = 10;
export const NUTRITION_ANALYSIS_DAYS = 5;
export const NUTRITION_ANALYSIS_COOLDOWN_DAYS = 3;

export interface NutritionWindowAnalysisSuccess {
  success: true;
  summary: string;
  missingNutrients: NutrientSlug[];
  suggestions: string[];
  photoCount: number;
  days: number;
  requiredPhotos: number;
  analyzedAt: string;
  cached?: boolean;
}

export type NutritionWindowFailureCode = 'AUTH_REQUIRED' | 'NOT_ENOUGH_PHOTOS';

export interface NutritionWindowAnalysisFailure {
  success: false;
  code?: NutritionWindowFailureCode;
  raw?: string;
  photoCount?: number;
  days?: number;
  requiredPhotos?: number;
}

export type NutritionWindowAnalysisResult =
  | NutritionWindowAnalysisSuccess
  | NutritionWindowAnalysisFailure;

interface CachedNutritionWindowAnalysis {
  photoSignature: string;
  analyzedAt: string;
  result: {
    summary: string;
    missingNutrients: NutrientSlug[];
    suggestions: string[];
    photoCount: number;
    days: number;
    requiredPhotos: number;
  };
}

function toNutrientSlugs(photos: PetPhoto[]): NutrientSlug[] {
  const slugs = photos
    .flatMap((photo) => photo.nutrients ?? [])
    .map((itemType) => ITEM_TYPE_TO_NUTRIENT[itemType])
    .filter((slug): slug is NutrientSlug => typeof slug === 'string');
  return [...new Set(slugs)];
}

function buildPhotoSignature(photos: PetPhoto[]): string {
  return photos
    .map(
      (photo) =>
        `${photo.id}:${photo.created_at}:${photo.calories ?? ''}:${(photo.nutrients ?? []).join('.')}`
    )
    .join('|');
}

function getCacheKey(userId: string, startIso: string, endIso: string): string {
  return `${CACHE_PREFIX}:${userId}:${startIso}:${endIso}`;
}

function getLastAnalyzedKey(userId: string): string {
  return `${LAST_ANALYZED_PREFIX}:${userId}`;
}

function buildSuccessResult(
  data: {
    summary: string;
    missingNutrients: NutrientSlug[];
    suggestions: string[];
    photoCount: number;
    days: number;
    requiredPhotos: number;
  },
  analyzedAt: string,
  cached = false
): NutritionWindowAnalysisSuccess {
  return {
    success: true,
    ...data,
    analyzedAt,
    cached,
  };
}

async function persistCachedAnalysis(
  params: {
    userId: string;
    photos: PetPhoto[];
    startIso: string;
    endIso: string;
  },
  result: NutritionWindowAnalysisSuccess
): Promise<void> {
  const payload: CachedNutritionWindowAnalysis = {
    photoSignature: buildPhotoSignature(params.photos),
    analyzedAt: result.analyzedAt,
    result: {
      summary: result.summary,
      missingNutrients: result.missingNutrients,
      suggestions: result.suggestions,
      photoCount: result.photoCount,
      days: result.days,
      requiredPhotos: result.requiredPhotos,
    },
  };
  await AsyncStorage.setItem(
    getCacheKey(params.userId, params.startIso, params.endIso),
    JSON.stringify(payload)
  );
  await AsyncStorage.setItem(getLastAnalyzedKey(params.userId), result.analyzedAt);
}

export async function getCachedNutritionWindowAnalysis(params: {
  userId: string;
  photos: PetPhoto[];
  startIso: string;
  endIso: string;
}): Promise<NutritionWindowAnalysisSuccess | null> {
  const raw = await AsyncStorage.getItem(
    getCacheKey(params.userId, params.startIso, params.endIso)
  );
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CachedNutritionWindowAnalysis;
    if (
      parsed.photoSignature !== buildPhotoSignature(params.photos) ||
      typeof parsed.analyzedAt !== 'string'
    ) {
      return null;
    }
    return buildSuccessResult(parsed.result, parsed.analyzedAt, true);
  } catch {
    return null;
  }
}

export async function getLastNutritionAnalysisAt(userId: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(getLastAnalyzedKey(userId));
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function makeDevAnalysis(photos: PetPhoto[]): NutritionWindowAnalysisResult {
  const photoCount = photos.length;
  if (photoCount < NUTRITION_ANALYSIS_REQUIRED_PHOTOS) {
    return {
      success: false,
      code: 'NOT_ENOUGH_PHOTOS',
      photoCount,
      days: NUTRITION_ANALYSIS_DAYS,
      requiredPhotos: NUTRITION_ANALYSIS_REQUIRED_PHOTOS,
      raw: `Add ${
        NUTRITION_ANALYSIS_REQUIRED_PHOTOS - photoCount
      } more photos to unlock the nutrition analysis.`,
    };
  }

  const seen = new Set(toNutrientSlugs(photos));
  const candidates: NutrientSlug[] = ['fiber', 'calcium', 'vitamin-d', 'omega-3', 'folate'];
  const missingNutrients = candidates.filter((slug) => !seen.has(slug)).slice(0, 3);

  return {
    success: true,
    summary:
      'Your recent meals show good consistency, but there may still be room to add more variety for a more balanced diet.',
    missingNutrients,
    suggestions: [
      'Try adding more varied meals across the week.',
      'Look for foods that add nutrients you have logged less often.',
      'A mix of vegetables, protein, and healthy fats can help round things out.',
    ],
    photoCount,
    days: NUTRITION_ANALYSIS_DAYS,
    requiredPhotos: NUTRITION_ANALYSIS_REQUIRED_PHOTOS,
    analyzedAt: new Date().toISOString(),
  };
}

async function logFunctionsInvokeError(error: unknown): Promise<void> {
  if (error == null || typeof error !== 'object') {
    console.error('[analyze-nutrition-window] error:', error);
    return;
  }
  const err = error as {
    message?: string;
    name?: string;
    context?: Response;
  };
  console.error('[analyze-nutrition-window] invoke error:', {
    name: err.name,
    message: err.message,
  });
  const res = err.context;
  if (!res || typeof res.clone !== 'function') return;
  try {
    const clone = res.clone();
    const text = await clone.text();
    console.error('[analyze-nutrition-window] HTTP error response:', {
      status: res.status,
      statusText: res.statusText,
      body: text,
    });
  } catch (readErr) {
    console.error('[analyze-nutrition-window] could not read error.context body:', readErr);
  }
}

export async function analyzeNutritionWindow(
  params: {
    userId: string;
    photos: PetPhoto[];
    startIso: string;
    endIso: string;
    forceRefresh?: boolean;
  },
  accessTokenFromAuth?: string | null
): Promise<NutritionWindowAnalysisResult> {
  if (!params.forceRefresh) {
    const cached = await getCachedNutritionWindowAnalysis(params);
    if (cached) return cached;
  }

  if (IS_DEV) {
    const result = makeDevAnalysis(params.photos);
    if (result.success) {
      await persistCachedAnalysis(params, result);
    }
    return result;
  }

  let token = accessTokenFromAuth;
  if (!token) {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token ?? undefined;
  }

  const headers: Record<string, string> =
    token && token.length > 0 ? { Authorization: `Bearer ${token}` } : {};

  try {
    const { data, error } = await supabase.functions.invoke('analyze-nutrition-window', {
      body: {
        startIso: params.startIso,
        endIso: params.endIso,
      },
      ...(Object.keys(headers).length > 0 && { headers }),
    });

    if (error) {
      await logFunctionsInvokeError(error);
      return { success: false, raw: error.message };
    }

    if (data?.success === true) {
      const result = buildSuccessResult(
        {
        summary: typeof data.summary === 'string' ? data.summary : '',
          missingNutrients: Array.isArray(data.missingNutrients)
            ? data.missingNutrients.filter(
                (slug: unknown): slug is NutrientSlug => typeof slug === 'string'
              )
            : [],
          suggestions: Array.isArray(data.suggestions)
            ? data.suggestions.filter((item: unknown): item is string => typeof item === 'string')
            : [],
          photoCount:
            typeof data.photoCount === 'number' ? data.photoCount : params.photos.length,
          days: typeof data.days === 'number' ? data.days : NUTRITION_ANALYSIS_DAYS,
          requiredPhotos:
            typeof data.requiredPhotos === 'number'
              ? data.requiredPhotos
              : NUTRITION_ANALYSIS_REQUIRED_PHOTOS,
        },
        new Date().toISOString()
      );
      await persistCachedAnalysis(params, result);
      return result;
    }

    return {
      success: false,
      code:
        data?.code === 'AUTH_REQUIRED'
          ? 'AUTH_REQUIRED'
          : data?.code === 'NOT_ENOUGH_PHOTOS'
            ? 'NOT_ENOUGH_PHOTOS'
            : undefined,
      raw: typeof data?.raw === 'string' ? data.raw : JSON.stringify(data ?? {}),
      photoCount: typeof data?.photoCount === 'number' ? data.photoCount : params.photos.length,
      days: typeof data?.days === 'number' ? data.days : NUTRITION_ANALYSIS_DAYS,
      requiredPhotos:
        typeof data?.requiredPhotos === 'number'
          ? data.requiredPhotos
          : NUTRITION_ANALYSIS_REQUIRED_PHOTOS,
    };
  } catch (e) {
    if (e instanceof FunctionsHttpError && e.context) {
      try {
        const errBody = await e.context.json();
        return {
          success: false,
          raw:
            typeof errBody?.error === 'string'
              ? errBody.error
              : typeof errBody?.details === 'string'
                ? errBody.details
                : JSON.stringify(errBody),
        };
      } catch {
        // ignore
      }
    }
    return { success: false, raw: e instanceof Error ? e.message : String(e) };
  }
}

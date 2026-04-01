/**
 * Call the analyze-photo Supabase Edge Function with an image.
 * In dev (IS_DEV), returns a dummy response without calling the Edge Function, but still enforces
 * rate limits and `record_user_llm_query` like production.
 */

import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { NUTRIENT_TO_ITEM_TYPE } from '@/constants/badge-types';
import {
  countUserLlmQueriesLast24h,
  isAtLlmQueryLimit,
  LLM_QUERY_LIMIT,
  recordUserLlmQuery,
} from '@/lib/user-llm-queries';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

const IS_DEV = Constants.expoConfig?.extra?.IS_DEV === true;

const ALL_NUTRIENT_SLUGS = Object.keys(NUTRIENT_TO_ITEM_TYPE);

const MOCK_CALORIE_OPTIONS = [
  90, 120, 150, 180, 200, 220, 250, 280, 300, 320, 350, 380, 420,
] as const;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandomSubset<T>(items: readonly T[], minCount: number, maxCount: number): T[] {
  const n = Math.min(items.length, randomInt(minCount, maxCount));
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function makeDummyAnalyzeResponse(): AnalyzePhotoSuccess {
  return {
    success: true,
    calorie: MOCK_CALORIE_OPTIONS[randomInt(0, MOCK_CALORIE_OPTIONS.length - 1)],
    nutrients: pickRandomSubset(ALL_NUTRIENT_SLUGS, 1, 5),
  };
}

export interface AnalyzePhotoSuccess {
  success: true;
  calorie: number;
  nutrients: string[];
}

export type AnalyzePhotoFailureCode = 'RATE_LIMIT' | 'AUTH_REQUIRED';

export interface AnalyzePhotoFailure {
  success: false;
  raw?: string;
  code?: AnalyzePhotoFailureCode;
}

export type AnalyzePhotoResult = AnalyzePhotoSuccess | AnalyzePhotoFailure;

/** Log Edge Function / HTTP error bodies (Supabase often hides them unless you read `context`). */
async function logFunctionsInvokeError(error: unknown): Promise<void> {
  if (error == null || typeof error !== 'object') {
    console.error('[analyze-photo] error:', error);
    return;
  }
  const err = error as {
    message?: string;
    name?: string;
    context?: Response;
  };
  console.error('[analyze-photo] invoke error:', {
    name: err.name,
    message: err.message,
  });
  const res = err.context;
  if (!res || typeof res.clone !== 'function') return;
  try {
    const clone = res.clone();
    const text = await clone.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    console.error('[analyze-photo] HTTP error response:', {
      status: res.status,
      statusText: res.statusText,
      body: parsed,
    });
  } catch (readErr) {
    console.error('[analyze-photo] could not read error.context body:', readErr);
  }
}

async function resolveUserIdFromSession(accessTokenFromAuth?: string | null): Promise<string | null> {
  let jwt = accessTokenFromAuth ?? null;
  if (!jwt) {
    const { data } = await supabase.auth.getSession();
    jwt = data.session?.access_token ?? null;
  }
  if (!jwt) return null;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(jwt);
  if (error || !user) return null;
  return user.id;
}

async function invokeAnalyzePhoto(
  body: { image?: string; imageUrl?: string },
  accessTokenFromAuth?: string | null
): Promise<AnalyzePhotoResult> {
  if (IS_DEV) {
    const userId = await resolveUserIdFromSession(accessTokenFromAuth);
    if (!userId) {
      return {
        success: false,
        code: 'AUTH_REQUIRED',
        raw: 'Sign in required for food analysis.',
      };
    }
    const queryCount = await countUserLlmQueriesLast24h(userId);
    if (isAtLlmQueryLimit(queryCount)) {
      return {
        success: false,
        code: 'RATE_LIMIT',
        raw: `Daily analysis limit reached (${LLM_QUERY_LIMIT} per 24 hours).`,
      };
    }
    const result = makeDummyAnalyzeResponse();
    await recordUserLlmQuery();
    return result;
  }

  let tokenSource: 'explicit' | 'session' | 'anon' = 'anon';
  let token = accessTokenFromAuth;
  if (token) {
    tokenSource = 'explicit';
  } else {
    const { data } = await supabase.auth.getSession();
    token = data?.session?.access_token ?? undefined;
    if (token) tokenSource = 'session';
  }
  if (!token) {
    token = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    tokenSource = 'anon';
  }
  const headers: Record<string, string> =
    token && token.length > 0 ? { Authorization: `Bearer ${token}` } : {};

  const imageLen = body.image?.length ?? 0;
  const hasUrl = Boolean(body.imageUrl);
  console.log('[analyze-photo] request:', {
    hasImage: imageLen > 0,
    imageBase64Length: imageLen,
    hasImageUrl: hasUrl,
    tokenSource,
  });

  try {
    const { data, error } = await supabase.functions.invoke('analyze-photo', {
      body,
      ...(Object.keys(headers).length > 0 && { headers }),
    });

    if (error) {
      await logFunctionsInvokeError(error);
      return { success: false, raw: error.message };
    }

    if (data?.success === true && Array.isArray(data.nutrients)) {
      return {
        success: true,
        calorie: typeof data.calorie === 'number' ? data.calorie : 0,
        nutrients: data.nutrients.filter((n: unknown) => typeof n === 'string'),
      };
    }

    console.error('[analyze-photo] unexpected response shape:', {
      success: (data as { success?: unknown })?.success,
      hasNutrientsArray: Array.isArray((data as { nutrients?: unknown })?.nutrients),
      dataPreview:
        typeof data === 'object' && data !== null
          ? JSON.stringify(data).slice(0, 800)
          : String(data),
    });

    const failureData = data as {
      success?: false;
      raw?: string;
      code?: string;
    };
    const code =
      failureData?.code === 'RATE_LIMIT'
        ? 'RATE_LIMIT'
        : failureData?.code === 'AUTH_REQUIRED'
          ? 'AUTH_REQUIRED'
          : undefined;

    return {
      success: false,
      raw: typeof failureData?.raw === 'string' ? failureData.raw : JSON.stringify(data ?? {}),
      ...(code && { code }),
    };
  } catch (e) {
    if (e instanceof FunctionsHttpError && e.context) {
      try {
        const errBody = await e.context.json();
        const msg = errBody?.error ?? errBody?.details ?? JSON.stringify(errBody);
        console.error('[analyze-photo] FunctionsHttpError body:', errBody);
        return { success: false, raw: typeof msg === 'string' ? msg : JSON.stringify(errBody) };
      } catch {
        try {
          const text = await e.context.text();
          console.error('[analyze-photo] FunctionsHttpError text:', text?.slice(0, 1200));
          return { success: false, raw: text || e.message };
        } catch {
          // ignore
        }
      }
    }
    console.error('[analyze-photo] exception:', e);
    return { success: false, raw: e instanceof Error ? e.message : String(e) };
  }
}

export async function analyzePhotoByUrl(
  imageUrl: string,
  accessTokenFromAuth?: string | null
): Promise<AnalyzePhotoResult> {
  return invokeAnalyzePhoto({ imageUrl }, accessTokenFromAuth);
}

/** Prefix so the Edge Function sets Claude `media_type` correctly (raw base64 used to default to JPEG). */
function base64WithDataUrlIfNeeded(base64: string): string {
  const b = base64.replace(/\s/g, '');
  if (b.startsWith('iVBORw0KGgo')) return `data:image/png;base64,${base64}`;
  if (b.startsWith('/9j/')) return `data:image/jpeg;base64,${base64}`;
  if (b.startsWith('R0lGOD')) return `data:image/gif;base64,${base64}`;
  return base64;
}

export async function analyzePhoto(
  localUri: string,
  accessTokenFromAuth?: string | null
): Promise<AnalyzePhotoResult> {
  // Payload size is mainly controlled by ImagePicker `quality` on camera/library (see app/camera.tsx).
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return invokeAnalyzePhoto({ image: base64WithDataUrlIfNeeded(base64) }, accessTokenFromAuth);
}

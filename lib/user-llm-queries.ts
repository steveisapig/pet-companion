import { supabase } from '@/lib/supabase';

const WINDOW_MS = 24 * 60 * 60 * 1000;

function parseLlmQueryLimit(): number {
  const raw = process.env.EXPO_PUBLIC_LLM_QUERY_LIMIT;
  const n = raw !== undefined && raw !== '' ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 10;
}

/** Max successful analyze-photo (LLM) calls per user per rolling 24h window (from `.env`). */
export const LLM_QUERY_LIMIT = parseLlmQueryLimit();

/**
 * Count rows in `user_llm_queries` for this user in the last 24 hours.
 * Requires an authenticated Supabase session (RLS).
 */
export async function countUserLlmQueriesLast24h(userId: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from('user_llm_queries')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);

  if (error) {
    console.error('[user-llm-queries] count error:', error);
    throw error;
  }
  return count ?? 0;
}

export function isAtLlmQueryLimit(count: number): boolean {
  return count >= LLM_QUERY_LIMIT;
}

/**
 * Record one successful LLM analysis via `record_user_llm_query()` RPC (uses JWT `auth.uid()` in DB).
 */
export async function recordUserLlmQuery(): Promise<void> {
  const { error } = await supabase.rpc('record_user_llm_query');
  if (error) {
    console.error('[user-llm-queries] recordUserLlmQuery error:', error);
  }
}

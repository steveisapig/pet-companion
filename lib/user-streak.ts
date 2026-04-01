/**
 * Photo streak: one row per (user, local calendar day) when at least one pet photo
 * was synced that day.
 */

import { supabase } from '@/lib/supabase';
import type { InsertUserStreak } from '@/lib/db/types';
import { getPetPhotosForLocalCalendarDay } from '@/lib/supabase-photos';
import { dbLog } from '@/lib/db/logger';

export function formatLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDaysLocal(d: Date, days: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + days);
  return x;
}

/**
 * After uploading a photo, re-fetch that day's photos; if there is at least one, insert `user_streak`.
 * Duplicate (user_id, date) is ignored (23505). Requires PRIMARY KEY (user_id, date) in Postgres.
 */
export async function recordStreakDayIfPhotoUploaded(
  userId: string,
  when: Date = new Date()
): Promise<void> {
  const photos = await getPetPhotosForLocalCalendarDay(userId, when);
  if (photos.length === 0) {
    return;
  }

  const dateStr = formatLocalDateString(when);

  const row: InsertUserStreak = { user_id: userId, date: dateStr };
  const { error } = await supabase.from('user_streak').insert(row);

  if (error) {
    const errBlob = `${error.message ?? ''}${(error as { details?: string }).details ?? ''}`;
    if (
      error.code === '23505' &&
      errBlob.includes('(user_id, date)')
    ) {
      dbLog('INSERT', 'user_streak', {
        params: { userId, dateStr },
        message: 'Streak day already recorded',
      });
      return;
    }
    dbLog('INSERT', 'user_streak', {
      params: { userId, dateStr },
      error,
      message: `Failed to record streak: ${error.message}`,
    });
    throw error;
  }

  dbLog('INSERT', 'user_streak', {
    params: { userId, dateStr },
    message: 'Recorded streak day (photo uploaded)',
  });
}

export async function fetchUserStreakDatesInRange(
  userId: string,
  startInclusive: string,
  endInclusive: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_streak')
    .select('date')
    .eq('user_id', userId)
    .gte('date', startInclusive)
    .lte('date', endInclusive)
    .order('date', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as { date: string }[];
  return rows.map((r) => r.date);
}

export async function fetchAllUserStreakDates(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_streak')
    .select('date')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as { date: string }[];
  return rows.map((r) => r.date);
}

/**
 * Consecutive days ending at the user's most recent streak day (gap breaks the count).
 */
export function computeStreakLengthFromDates(sortedUniqueAsc: string[]): number {
  if (sortedUniqueAsc.length === 0) return 0;
  const set = new Set(sortedUniqueAsc);
  const last = sortedUniqueAsc[sortedUniqueAsc.length - 1];
  let d = parseLocalDateString(last);
  let count = 0;
  while (true) {
    const key = formatLocalDateString(d);
    if (!set.has(key)) break;
    count++;
    d = addDaysLocal(d, -1);
  }
  return count;
}

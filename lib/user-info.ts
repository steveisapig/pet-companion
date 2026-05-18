import { supabase } from '@/lib/supabase';

/** 1–20 characters (Unicode code points), no whitespace */
export function isValidUsername(raw: string): boolean {
  const len = Array.from(raw).length;
  return len >= 1 && len <= 20 && !/\s/u.test(raw);
}

/** Strip leading @, lowercase, trim */
export function normaliseUsername(raw: string): string {
  return raw.replace(/^@+/, '').toLowerCase().trim();
}

/** Fetch the current user's stored username (null if not set yet) */
export async function getMyUsername(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_info')
    .select('username')
    .eq('user_id', userId)
    .maybeSingle();
  const row = data as { username: string } | null;
  return row?.username ?? null;
}

/**
 * Upsert username for the given user.
 * Returns null on success, or an error message string on failure.
 */
export async function setMyUsername(userId: string, username: string): Promise<string | null> {
  const normalised = normaliseUsername(username);
  if (!isValidUsername(normalised)) return 'Invalid username format';
  const { error } = await supabase
    .from('user_info')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert({ user_id: userId, username: normalised } as any, { onConflict: 'user_id' });
  if (error?.code === '23505') return 'Username already taken';
  if (error) return error.message;
  return null;
}

/** Returns true if the username is not already taken */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_info')
    .select('user_id')
    .eq('username', normaliseUsername(username))
    .maybeSingle();
  return data === null;
}

// ─── body profile ─────────────────────────────────────────────────────────────

export interface RemoteBodyProfile {
  sex: 'male' | 'female' | null;
  heightCm: number | null;
  weightKg: number | null;
  dailyCalorieGoal: number | null;
  calorieDirection: 'above' | 'below' | null;
  dietaryConditions: string[];
}

/** Upsert body-profile columns for the current user (best-effort, no throw). */
export async function saveBodyProfileToSupabase(
  userId: string,
  profile: RemoteBodyProfile,
): Promise<void> {
  await (supabase as any)
    .from('user_info')
    .upsert(
      {
        user_id: userId,
        sex: profile.sex,
        height_cm: profile.heightCm,
        weight_kg: profile.weightKg,
        daily_calorie_goal: profile.dailyCalorieGoal,
        // DB stores boolean: true = above, false = below
        calorie_direction: profile.calorieDirection === 'above',
        dietary_conditions: profile.dietaryConditions,
      },
      { onConflict: 'user_id' },
    )
    .then(({ error }: { error: unknown }) => {
      if (error) console.warn('[user-info] saveBodyProfile error:', error);
    });
}

/** Fetch body-profile columns for the current user. Returns null if no row. */
export async function getBodyProfileFromSupabase(
  userId: string,
): Promise<RemoteBodyProfile | null> {
  const { data } = await supabase
    .from('user_info')
    .select('sex, height_cm, weight_kg, daily_calorie_goal, calorie_direction, dietary_conditions')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    sex: string | null;
    height_cm: number | null;
    weight_kg: number | null;
    daily_calorie_goal: number | null;
    calorie_direction: boolean;
    dietary_conditions: string[] | null;
  };
  return {
    sex: (row.sex === 'male' || row.sex === 'female') ? row.sex : null,
    heightCm: row.height_cm ?? null,
    weightKg: row.weight_kg ?? null,
    dailyCalorieGoal: row.daily_calorie_goal ?? null,
    // Convert boolean back to string direction
    calorieDirection: row.calorie_direction ? 'above' : 'below',
    dietaryConditions: row.dietary_conditions ?? [],
  };
}

/** Look up a user by their handle. Returns { user_id, username } or null if not found. */
export async function lookupUserByUsername(
  username: string
): Promise<{ user_id: string; username: string } | null> {
  const { data } = await supabase
    .from('user_info')
    .select('user_id, username')
    .eq('username', normaliseUsername(username))
    .maybeSingle();
  return (data as { user_id: string; username: string } | null) ?? null;
}

import { supabase } from '@/lib/supabase';

/** 3–20 chars: lowercase letters, numbers, dots, underscores */
export function isValidUsername(raw: string): boolean {
  return /^[a-z0-9._]{3,20}$/.test(raw);
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

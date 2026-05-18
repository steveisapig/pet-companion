/**
 * Register an Expo push token for the current device and upsert it into
 * the `push_tokens` Supabase table.
 *
 * Called from NotificationsProvider once the user has granted permissions
 * and we have a userId. Only writes to the DB when the token has changed.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Notifications: Record<string, any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications');
} catch {
  // web or pre-build environment — push tokens unavailable
}

let lastRegisteredToken: string | null = null;

async function upsertToken(userId: string, token: string): Promise<void> {
  if (token === lastRegisteredToken) return;
  const { error } = await (supabase as any)
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) {
    console.warn('[push-tokens] upsert error:', error.message);
  } else {
    lastRegisteredToken = token;
    console.log('[push-tokens] Registered push token for', userId);
  }
}

export async function registerPushToken(userId: string): Promise<void> {
  if (!Notifications) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    console.warn('[push-tokens] No EAS projectId in app.json — push tokens unavailable');
    return;
  }
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token?.startsWith('ExponentPushToken[')) {
      console.warn('[push-tokens] Skipping non-Expo token (dev build or missing EAS projectId):', token?.slice(0, 24));
      return;
    }
    await upsertToken(userId, token);
  } catch (e) {
    console.warn('[push-tokens] registerPushToken error:', e);
  }
}

/**
 * Subscribe to Expo push token rotation events and update the DB whenever
 * the OS issues a new token. Returns a cleanup function to remove the listener.
 */
export function subscribePushTokenRefresh(userId: string): () => void {
  if (!Notifications) return () => {};
  const sub = Notifications.addPushTokenListener(({ data: token }: { data: string }) => {
    upsertToken(userId, token).catch((e) =>
      console.warn('[push-tokens] token refresh upsert error:', e),
    );
  });
  return () => sub.remove();
}

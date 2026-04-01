/**
 * Supabase OAuth callback handling (magic links, etc.).
 * Google sign-in uses native @react-native-google-signin in auth-native.ts.
 */

import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

function parseParamsFromUrl(url: string): {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
} {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const part =
    hashIndex >= 0
      ? url.slice(hashIndex + 1)
      : queryIndex >= 0
        ? url.slice(queryIndex + 1)
        : '';
  const params = new URLSearchParams(part);
  return {
    access_token: params.get('access_token') ?? undefined,
    refresh_token: params.get('refresh_token') ?? undefined,
    error: params.get('error') ?? undefined,
    error_description: params.get('error_description') ?? undefined,
  };
}

export async function createSessionFromUrl(url: string): Promise<void> {
  const { access_token, refresh_token, error, error_description } =
    parseParamsFromUrl(url);

  if (error) {
    throw new Error(error_description ?? error);
  }
  if (!access_token) return;

  const { error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token: refresh_token ?? '',
  });
  if (sessionError) throw sessionError;
}

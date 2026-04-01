/**
 * Native Google and Apple sign-in for iOS/Android.
 * Uses @react-native-google-signin and expo-apple-authentication with Supabase signInWithIdToken.
 *
 * Apple + Supabase (dashboard): enable the Apple provider. In Apple Developer → Identifiers →
 * Services ID (used for Sign in with Apple web), set Return URL to your project callback:
 * https://nscgjfevlpxxrfeztzwr.supabase.co/auth/v1/callback
 * Native iOS also needs the App ID with Sign in with Apple and the bundle ID as authorized in Supabase.
 *
 * @see https://supabase.com/docs/guides/auth/social-login/auth-apple
 * @see https://supabase.com/docs/guides/auth/social-login/auth-google?queryGroups=platform&platform=react-native
 */

import { Platform } from 'react-native';
import { GoogleSignin, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from '@/lib/supabase';

/** User closed the Apple sign-in sheet (not a failure). */
export const APPLE_SIGN_IN_CANCELLED_CODE = 'ERR_REQUEST_CANCELED' as const;

export function isAppleSignInCancelled(error: unknown): boolean {
  if (error == null) return false;
  const code = (error as { code?: string }).code;
  if (code === APPLE_SIGN_IN_CANCELLED_CODE) return true;
  return error instanceof Error && error.message === 'Apple sign-in was cancelled';
}

export async function signInWithGoogleNative(): Promise<boolean> {
  if (Platform.OS === 'web') {
    throw new Error('Google native sign-in is not available on web');
  }

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    throw new Error(
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is required. Add it to your .env'
    );
  }

  const config: { webClientId: string; iosClientId?: string } = { webClientId };
  if (Platform.OS === 'ios') {
    config.iosClientId =
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? webClientId;
    console.log('[Auth] iOS client ID:', config.iosClientId);
    const expectedScheme =
      'com.googleusercontent.apps.' +
      config.iosClientId.replace('.apps.googleusercontent.com', '');
    const envScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
    console.log(
      '[Auth] Expected URL scheme (must be in Info.plist):',
      expectedScheme
    );
    console.log('[Auth] EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME:', envScheme);
    if (envScheme && envScheme !== expectedScheme) {
      console.warn(
        '[Auth] Mismatch: EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME differs from expected scheme'
      );
    }
  }
  GoogleSignin.configure(config);

  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices();
    }
    const response = await GoogleSignin.signIn();
    if (isSuccessResponse(response) && response.data?.idToken) {
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.data.idToken,
      });
      if (error) throw error;
      return true;
    }
    return false;
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === statusCodes.IN_PROGRESS) {
      return false;
    }
    if (err?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Play services not available or outdated');
    }
    throw error;
  }
}

export async function signInWithAppleNative(): Promise<void> {
  if (Platform.OS !== 'ios') {
    throw new Error('Apple Sign-In is only available on iOS');
  }

  const AppleAuthentication = await import('expo-apple-authentication');

  let credential: { identityToken: string | null };
  try {
    credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === APPLE_SIGN_IN_CANCELLED_CODE) {
      const cancelled = new Error('Apple sign-in was cancelled');
      Object.assign(cancelled, { code: APPLE_SIGN_IN_CANCELLED_CODE });
      throw cancelled;
    }
    throw e;
  }

  const identityToken = credential.identityToken;
  if (!identityToken) {
    throw new Error('Apple sign-in did not return an identity token');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
  });

  if (error) throw error;
}

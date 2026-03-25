/**
 * Unit tests for native Google and Apple sign-in (auth-native.ts).
 * Mocks Platform, GoogleSignin, and supabase.
 */

import { signInWithGoogleNative, signInWithAppleNative } from '@/lib/auth-native';
import { supabase } from '@/lib/supabase';
import { Platform } from 'react-native';
import {
  GoogleSignin,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(undefined),
    signIn: jest.fn(),
  },
  isSuccessResponse: jest.fn(),
  statusCodes: {
    IN_PROGRESS: 'sign_in_in_progress',
    PLAY_SERVICES_NOT_AVAILABLE: 'play_services_not_available',
  },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: jest.fn(),
    },
  },
}));


jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: {
    FULL_NAME: 0,
    EMAIL: 1,
  },
}));

const mockSignInWithIdToken = supabase.auth.signInWithIdToken as jest.Mock;

describe('signInWithGoogleNative', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client-id.apps.googleusercontent.com',
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: 'ios-client-id.apps.googleusercontent.com',
    };
    (Platform as { OS: string }).OS = 'ios';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws on web platform', async () => {
    (Platform as { OS: string }).OS = 'web';

    await expect(signInWithGoogleNative()).rejects.toThrow(
      'Google native sign-in is not available on web'
    );

    expect(GoogleSignin.signIn).not.toHaveBeenCalled();
  });

  it('throws when EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing', async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

    await expect(signInWithGoogleNative()).rejects.toThrow(
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is required'
    );
  });

  it('returns true on successful sign-in with id token', async () => {
    const mockUser = { id: 'auth-uuid-123' };

    (isSuccessResponse as jest.Mock).mockReturnValue(true);
    (GoogleSignin.signIn as jest.Mock).mockResolvedValue({
      data: { idToken: 'mock-id-token' },
    });
    mockSignInWithIdToken.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    const result = await signInWithGoogleNative();

    expect(result).toBe(true);
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'mock-id-token',
    });
  });

  it('returns false when user cancels (no idToken)', async () => {
    (isSuccessResponse as jest.Mock).mockReturnValue(true);
    (GoogleSignin.signIn as jest.Mock).mockResolvedValue({
      data: {},
    });

    const result = await signInWithGoogleNative();

    expect(result).toBe(false);
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('returns false when sign-in is in progress', async () => {
    (isSuccessResponse as jest.Mock).mockReturnValue(false);
    (GoogleSignin.signIn as jest.Mock).mockRejectedValue({
      code: statusCodes.IN_PROGRESS,
    });

    const result = await signInWithGoogleNative();

    expect(result).toBe(false);
  });

  it('throws when Play Services not available on Android', async () => {
    (Platform as { OS: string }).OS = 'android';
    (GoogleSignin.signIn as jest.Mock).mockRejectedValue({
      code: statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
    });

    await expect(signInWithGoogleNative()).rejects.toThrow(
      'Play services not available or outdated'
    );
  });

});

describe('signInWithAppleNative', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = 'ios';
  });

  it('throws on non-iOS platform', async () => {
    (Platform as { OS: string }).OS = 'android';

    await expect(signInWithAppleNative()).rejects.toThrow(
      'Apple Sign-In is only available on iOS'
    );
  });

  // Note: Apple sign-in flow tests are omitted because auth-native uses dynamic
  // import('expo-apple-authentication') which requires Node ESM support.
});

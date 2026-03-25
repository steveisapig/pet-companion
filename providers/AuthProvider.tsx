import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import * as ExpoLinking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform, Linking } from 'react-native';
import { createSessionFromUrl } from '@/lib/auth-oauth';
import { signInWithGoogleNative, signInWithAppleNative } from '@/lib/auth-native';

export interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isSignedIn: boolean;
}

const TEST_USER_EMAIL = process.env.EXPO_PUBLIC_TEST_USER_EMAIL ?? 'test@test.com';
const TEST_USER_PASSWORD = process.env.EXPO_PUBLIC_TEST_USER_PASSWORD;

const hasSupabaseConfig = () =>
  !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

export type EmailSignUpResult = {
  /** True when Supabase requires email confirmation before a session exists */
  needsEmailConfirmation: boolean;
};

const AuthContext = createContext<AuthState & {
  signInWithGoogle: () => Promise<boolean>;
  signInWithApple: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signInWithDev: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<EmailSignUpResult>;
  signOut: () => Promise<void>;
}>({
  user: null,
  session: null,
  isLoading: true,
  isSignedIn: false,
  signInWithGoogle: async () => false,
  signInWithApple: async () => {},
  signInAnonymously: async () => {},
  signInWithDev: async () => {},
  signInWithEmail: async () => {},
  signUpWithEmail: async () => ({ needsEmailConfirmation: false }),
  signOut: async () => {},
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      setSession(null);
      setUser(null);
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        setUser(s?.user ?? null);
        setIsLoading(false);
      })
      .catch((e) => {
        console.error('[Auth] getSession failed:', e);
        setSession(null);
        setUser(null);
        setIsLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    const handleUrl = async (url: string | null) => {
      if (url && (url.includes('access_token=') || url.includes('#access_token'))) {
        try {
          await createSessionFromUrl(url);
        } catch (e) {
          console.error('[Auth] Failed to create session from URL:', e);
        }
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => {
      subscription.unsubscribe();
      sub.remove();
    };
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    try {
      return await signInWithGoogleNative();
    } catch (e) {
      console.error('[Auth] Google sign in error:', e);
      throw e;
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    try {
      if (Platform.OS !== 'ios') {
        throw new Error('Apple sign-in is only available on iOS.');
      }
      await signInWithAppleNative();
    } catch (e) {
      console.error('[Auth] Apple sign in error:', e);
      throw e;
    }
  }, []);

  const signInAnonymously = useCallback(async () => {
    if (!hasSupabaseConfig()) return;
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('[Auth] Anonymous sign in error:', error);
      throw error;
    }
  }, []);

  const signInWithDev = useCallback(async () => {
    if (!__DEV__ && process.env.EXPO_PUBLIC_ENABLE_DEV_LOGIN !== 'true') return;
    if (!TEST_USER_PASSWORD) {
      throw new Error('Set EXPO_PUBLIC_TEST_USER_PASSWORD in .env to use Dev login.');
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    if (error) {
      console.error('[Auth] Dev sign in error:', error);
      throw error;
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!hasSupabaseConfig()) return;
    const trimmed = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    if (error) {
      console.error('[Auth] Email sign in error:', error);
      throw error;
    }
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string): Promise<EmailSignUpResult> => {
      if (!hasSupabaseConfig()) {
        return { needsEmailConfirmation: false };
      }
      const trimmedEmail = email.trim().toLowerCase();

      /** Deep link for email confirmation (add same URL in Supabase Auth → URL Configuration). */
      let emailRedirectTo: string | undefined;
      try {
        emailRedirectTo = ExpoLinking.createURL('auth/callback');
      } catch {
        emailRedirectTo = undefined;
      }

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          ...(emailRedirectTo ? { emailRedirectTo } : {}),
        },
      });

      if (error) {
        console.error('[Auth] Email sign up error:', error.message, error);
        throw new Error(error.message);
      }

      // signUp must return a user row in auth.users (session may be null if Confirm email is on)
      if (!data.user) {
        const msg =
          'Sign up did not return a user. Check Supabase Dashboard → Authentication → Providers → Email is enabled.';
        console.error('[Auth] signUp missing user', data);
        throw new Error(msg);
      }

      if (__DEV__) {
        console.log('[Auth] Sign up created user in Supabase:', data.user.id, 'session:', !!data.session);
      }

      const needsEmailConfirmation = !data.session;
      return { needsEmailConfirmation };
    },
    []
  );

  const signOut = useCallback(async () => {
    if (!hasSupabaseConfig()) return;
    await supabase.auth.signOut();
  }, []);

  const value: AuthState & {
    signInWithGoogle: () => Promise<boolean>;
    signInWithApple: () => Promise<void>;
    signInAnonymously: () => Promise<void>;
    signInWithDev: () => Promise<void>;
    signInWithEmail: (email: string, password: string) => Promise<void>;
    signUpWithEmail: (email: string, password: string) => Promise<EmailSignUpResult>;
    signOut: () => Promise<void>;
  } = {
    user,
    session,
    isLoading,
    isSignedIn: !!user,
    signInWithGoogle,
    signInWithApple,
    signInAnonymously,
    signInWithDev,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

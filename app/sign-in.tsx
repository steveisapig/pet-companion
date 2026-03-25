import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Heart, Mail } from 'lucide-react-native';
import { statusCodes } from '@react-native-google-signin/google-signin';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';
import { checkSupabaseAuthHealth } from '@/lib/supabase-health';

const hasSupabaseConfig = () =>
  !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const TEST_USER_EMAIL = process.env.EXPO_PUBLIC_TEST_USER_EMAIL ?? 'test@test.com';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, signInWithDev } = useAuth();
  const [loading, setLoading] = useState<'google' | 'dev' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!__DEV__ || !hasSupabaseConfig()) return;
    checkSupabaseAuthHealth().then((result: { ok: boolean; status: number; error?: string }) => {
      const { ok, status, error: err } = result;
      console.log('[Auth] Supabase health:', ok ? `OK (${status})` : `FAIL status=${status}`, err ?? '');
    });
  }, []);

  const handleSignIn = async (
    fn: () => Promise<void | boolean>,
    provider: 'google' | 'dev'
  ) => {
    setError(null);
    setLoading(provider);
    try {
      const result = await fn();
      if (result !== false) router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setLoading(null);
    }
  };

  if (!hasSupabaseConfig()) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.content, { paddingTop: insets.top + 40 }]}>
          <Text style={styles.title}>Marumimi</Text>
          <Text style={styles.subtitle}>
            Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env
          </Text>
          <Pressable
            style={styles.guestBtn}
            onPress={() => router.replace('/')}
          >
            <Text style={styles.guestBtnText}>Continue without sync</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollInner,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Heart size={48} color={Colors.softOrange} />
          <Text style={styles.title}>Marumimi</Text>
          <Text style={styles.subtitle}>
            Sign in to access your virtual pet
          </Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.buttons}>
          <Pressable
            style={[styles.btn, styles.emailOptionBtn]}
            onPress={() => router.push('/email-auth')}
            disabled={!!loading}
            testID="sign-in-email-button"
          >
            <Mail size={20} color={Colors.softOrange} />
            <Text style={styles.emailOptionBtnText}>Sign in with email</Text>
          </Pressable>

          {(Platform.OS === 'ios' || Platform.OS === 'android') && (
            <Pressable
              style={[styles.btn, styles.googleBtn]}
              onPress={async () => {
                setError(null);
                setLoading('google');
                try {
                  const result = await signInWithGoogle();
                  if (result) router.replace('/');
                } catch (e: unknown) {
                  const err = e as { code?: string };
                  if (err?.code === statusCodes.IN_PROGRESS) {
                    // sign-in in progress
                  } else if (err?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                    setError('Play services not available or outdated');
                  } else {
                    setError(e instanceof Error ? e.message : 'Sign in failed');
                  }
                } finally {
                  setLoading(null);
                }
              }}
              disabled={!!loading}
            >
              {loading === 'google' ? (
                <ActivityIndicator color="#333" />
              ) : (
                <Text style={styles.googleBtnText}>Sign in with Google</Text>
              )}
            </Pressable>
          )}

          {(__DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_LOGIN === 'true') && (
            <Pressable
              style={[styles.btn, styles.devBtn]}
              onPress={() => handleSignIn(signInWithDev, 'dev')}
              disabled={!!loading}
            >
              {loading === 'dev' ? (
                <ActivityIndicator color="#666" />
              ) : (
                <Text style={styles.devBtnText}>Dev login ({TEST_USER_EMAIL})</Text>
              )}
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => router.push('/email-sign-up')}
          style={styles.signUpLinkWrap}
          hitSlop={12}
        >
          <Text style={styles.signUpLinkText}>
            Need an account?{' '}
            <Text style={styles.signUpLinkEmphasis}>Sign up</Text>
          </Text>
        </Pressable>

        <Text style={styles.hint}>
          Sign in with an existing account above, or create one with Sign up.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  scrollInner: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.darkBrown,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.brown,
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.darkBrown,
    marginBottom: 4,
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  sectionHint: {
    fontSize: 13,
    color: Colors.brown,
    opacity: 0.75,
    marginBottom: 16,
    textAlign: 'center',
  },
  sectionTitleSecondary: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.darkBrown,
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
    width: '100%',
  },
  signUpLinkWrap: {
    marginTop: 32,
    marginBottom: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  signUpLinkText: {
    fontSize: 15,
    color: Colors.brown,
    textAlign: 'center',
  },
  signUpLinkEmphasis: {
    fontWeight: '800',
    color: Colors.softOrange,
  },
  errorBox: {
    backgroundColor: 'rgba(244, 67, 54, 0.15)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  errorText: {
    color: '#C62828',
    fontSize: 14,
  },
  buttons: {
    gap: 12,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  googleBtn: {
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 16,
  },
  googleBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  emailOptionBtn: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 2,
    borderColor: Colors.softOrange,
    borderRadius: 16,
  },
  emailOptionBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.softOrange,
  },
  guestBtn: {
    backgroundColor: 'rgba(232, 152, 94, 0.2)',
    borderWidth: 2,
    borderColor: Colors.softOrange,
  },
  guestBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.softOrange,
  },
  devBtn: {
    backgroundColor: '#E8E8E8',
    borderWidth: 1,
    borderColor: '#CCC',
  },
  devBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  hint: {
    fontSize: 12,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
});

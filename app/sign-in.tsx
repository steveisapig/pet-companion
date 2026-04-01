import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  ScrollView,
  Image,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Mail } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { statusCodes } from '@react-native-google-signin/google-signin';
import Colors from '@/constants/colors';
import { PET_CONFIGS } from '@/constants/pets';
import { isAppleSignInCancelled } from '@/lib/auth-native';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useAuth } from '@/providers/AuthProvider';
import { checkSupabaseAuthHealth } from '@/lib/supabase-health';

const hasSupabaseConfig = () =>
  !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const TEST_USER_EMAIL = process.env.EXPO_PUBLIC_TEST_USER_EMAIL ?? 'test@test.com';

/** ~1.5²× original heart (48) */
const PET_HEADER_CAROUSEL_SIZE = 108;
const PET_CAROUSEL_INTERVAL_MS = 3200;

const PET_CAROUSEL_ITEMS = Object.values(PET_CONFIGS);

function PetHeaderCarousel() {
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    const len = PET_CAROUSEL_ITEMS.length;
    const id = setInterval(() => {
      const prev = indexRef.current;
      const next = (prev + 1) % len;
      indexRef.current = next;
      if (next === 0 && prev === len - 1) {
        scrollRef.current?.scrollTo({ x: 0, animated: false });
      } else {
        scrollRef.current?.scrollTo({
          x: next * PET_HEADER_CAROUSEL_SIZE,
          animated: true,
        });
      }
    }, PET_CAROUSEL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    indexRef.current =
      Math.round(x / PET_HEADER_CAROUSEL_SIZE + 0.01) % PET_CAROUSEL_ITEMS.length;
  };

  return (
    <View
      style={{
        width: PET_HEADER_CAROUSEL_SIZE,
        height: PET_HEADER_CAROUSEL_SIZE,
        overflow: 'hidden',
      }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        bounces={false}
      >
        {PET_CAROUSEL_ITEMS.map((pet) => (
          <View
            key={pet.id}
            style={{
              width: PET_HEADER_CAROUSEL_SIZE,
              height: PET_HEADER_CAROUSEL_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Image
              source={pet.image}
              style={{
                width: PET_HEADER_CAROUSEL_SIZE,
                height: PET_HEADER_CAROUSEL_SIZE,
              }}
              resizeMode="contain"
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Official multicolor Google “G” (viewBox 0 0 48 48) */
function GoogleLogoColor({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 5.99C44.01 38.96 48 32.29 48 24.55z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-5.99c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { signInWithGoogle, signInWithApple, signInWithDev } = useAuth();
  const [loading, setLoading] = useState<'google' | 'apple' | 'dev' | null>(null);
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
      setError(e instanceof Error ? e.message : t('auth.signIn.failed'));
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
            {t('auth.signIn.noSupabase')}
          </Text>
          <Pressable
            style={styles.guestBtn}
            onPress={() => router.replace('/')}
          >
            <Text style={styles.guestBtnText}>{t('auth.signIn.continueWithoutSync')}</Text>
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
          <PetHeaderCarousel />
          <Text style={styles.title}>Marumimi</Text>
          <Text style={styles.subtitle}>
            {t('auth.signIn.subtitle')}
          </Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.buttons}>
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
                    setError(t('auth.signIn.playServicesUnavailable'));
                  } else {
                    setError(e instanceof Error ? e.message : t('auth.signIn.failed'));
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
                <>
                  <GoogleLogoColor size={22} />
                  <Text style={styles.oauthBtnText}>{t('auth.signIn.withGoogle')}</Text>
                </>
              )}
            </Pressable>
          )}

          {Platform.OS === 'ios' && (
            <Pressable
              style={[styles.btn, styles.appleBtn]}
              onPress={async () => {
                setError(null);
                setLoading('apple');
                try {
                  await signInWithApple();
                  router.replace('/');
                } catch (e: unknown) {
                  if (isAppleSignInCancelled(e)) {
                    return;
                  }
                  setError(e instanceof Error ? e.message : t('auth.signIn.failed'));
                } finally {
                  setLoading(null);
                }
              }}
              disabled={!!loading && loading !== 'apple'}
              testID="sign-in-apple-button"
            >
              {loading === 'apple' ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={22} color="#FFF" />
                  <Text style={styles.appleBtnText}>{t('auth.signIn.withApple')}</Text>
                </>
              )}
            </Pressable>
          )}

          <Pressable
            style={[styles.btn, styles.emailOptionBtn]}
            onPress={() => router.push('/email-auth')}
            disabled={!!loading}
            testID="sign-in-email-button"
          >
            <Mail size={20} color={Colors.softOrange} />
            <Text style={styles.emailOptionBtnText}>{t('auth.signIn.withEmail')}</Text>
          </Pressable>

          {(__DEV__ || process.env.EXPO_PUBLIC_ENABLE_DEV_LOGIN === 'true') && (
            <Pressable
              style={[styles.btn, styles.devBtn]}
              onPress={() => handleSignIn(signInWithDev, 'dev')}
              disabled={!!loading}
            >
              {loading === 'dev' ? (
                <ActivityIndicator color="#666" />
              ) : (
                <Text style={styles.devBtnText}>{t('auth.signIn.devLogin', { email: TEST_USER_EMAIL })}</Text>
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
            {t('auth.signIn.needAccountPrefix')}
            <Text style={styles.signUpLinkEmphasis}>{t('auth.signIn.signUp')}</Text>
          </Text>
        </Pressable>

        <Text style={styles.hint}>
          {t('auth.signIn.hint')}
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
  /** Shared metrics with Google / email body text (16 / semibold) */
  oauthBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  appleBtn: {
    backgroundColor: '#000',
    borderRadius: 16,
  },
  appleBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
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

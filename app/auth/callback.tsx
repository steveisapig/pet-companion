/**
 * OAuth callback route. On web, this is where Supabase redirects after sign-in.
 * The AuthProvider handles the URL via WebBrowser.openAuthSessionAsync (mobile)
 * or via window.opener / redirect (web). This page is a fallback that redirects
 * to home when opened directly.
 */
import { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAppTranslation } from '@/hooks/useAppTranslation';

export default function AuthCallbackScreen() {
  const { t } = useAppTranslation();
  useEffect(() => {
    // If we land here directly (e.g. user bookmarked), redirect to home.
    // The actual OAuth flow is handled by AuthProvider + WebBrowser.
    const t = setTimeout(() => {
      router.replace('/');
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text style={styles.text}>{t('auth.callback.signingIn')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  text: {
    fontSize: 16,
    color: '#666',
  },
});

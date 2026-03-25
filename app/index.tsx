import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { usePet } from '@/providers/PetProvider';
import Colors from '@/constants/colors';

const hasSupabaseConfig = () =>
  !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

export default function IndexScreen() {
  const { isSignedIn, isLoading: authLoading } = useAuth();
  const { onboardingComplete, isLoading: petLoading } = usePet();

  useEffect(() => {
    if (authLoading || petLoading) return;

    if (hasSupabaseConfig() && !isSignedIn) {
      router.replace('/sign-in');
      return;
    }

    if (onboardingComplete) {
      router.replace('/pet');
    } else {
      router.replace('/onboarding');
    }
  }, [authLoading, petLoading, isSignedIn, onboardingComplete]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']}
        style={StyleSheet.absoluteFill}
      />
      <ActivityIndicator size="large" color={Colors.softOrange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
});

import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { usePet } from '@/providers/PetProvider';
import Colors from '@/constants/colors';

export default function IndexScreen() {
  const { onboardingComplete, isLoading } = usePet();

  useEffect(() => {
    if (isLoading) return;
    console.log('[Index] Onboarding complete:', onboardingComplete);
    if (onboardingComplete) {
      router.replace('/pet');
    } else {
      router.replace('/onboarding');
    }
  }, [isLoading, onboardingComplete]);

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

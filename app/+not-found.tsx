import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useAppTranslation } from '@/hooks/useAppTranslation';

export default function NotFoundScreen() {
  const { t } = useAppTranslation();
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🐾</Text>
      <Text style={styles.title}>{t('notFound.title')}</Text>
      <Text style={styles.subtitle}>{t('notFound.subtitle')}</Text>
      <Pressable style={styles.button} onPress={() => router.replace('/sign-in')}>
        <Text style={styles.buttonText}>{t('notFound.goHome')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF8F0',
    gap: 12,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.darkBrown,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.brown,
    opacity: 0.7,
  },
  button: {
    marginTop: 16,
    backgroundColor: Colors.softOrange,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#FFF',
  },
});

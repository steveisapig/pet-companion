import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, ChevronDown, Mail } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import type { AppLanguage } from '@/locales';
import type { LanguagePreference } from '@/providers/I18nProvider';
import { usePet } from '@/providers/PetProvider';
import PetPortrait from '@/components/PetPortrait';
import { PET_CONFIGS } from '@/constants/pets';
import {
  getFoodScannerEnabled,
  setFoodScannerEnabled,
} from '@/lib/camera-settings-storage';

const IS_DEV = Constants.expoConfig?.extra?.IS_DEV === true;

/**
 * Preset color palette for pet customization.
 * Only shown when EXPO_PUBLIC_IS_DEV=true.
 */
const PET_COLOR_PRESETS: { label: string; hex: string }[] = [
  { label: 'Warm Tan',    hex: '#D4A574' },
  { label: 'Soft Orange', hex: '#E8985E' },
  { label: 'Chestnut',    hex: '#8D6E63' },
  { label: 'Bubblegum',   hex: '#F48FB1' },
  { label: 'Lavender',    hex: '#CE93D8' },
  { label: 'Teal Mint',   hex: '#80CBC4' },
  { label: 'Sky Blue',    hex: '#81D4FA' },
  { label: 'Sage Green',  hex: '#A5D6A7' },
  { label: 'Soft Gold',   hex: '#FFCC80' },
  { label: 'Rose',        hex: '#EF9A9A' },
  { label: 'Cloud Gray',  hex: '#B0BEC5' },
  { label: 'Peach Coral', hex: '#FFAB91' },
];

function languageLabel(
  code: LanguagePreference,
  t: ReturnType<typeof useAppTranslation>['t']
) {
  if (code === 'system') return t('language.system', { defaultValue: 'Use device language' });
  if (code === 'ja') return t('language.japanese', { defaultValue: '日本語' });
  if (code === 'zhHans') return t('language.simplifiedChinese', { defaultValue: '简体中文' });
  if (code === 'zhHant') return t('language.traditionalChinese', { defaultValue: '繁體中文' });
  return t('language.english', { defaultValue: 'English' });
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t, preference, deviceLocale, setLanguagePreference } = useAppTranslation();
  const { petType, mood, petPrimaryColor, setPetPrimaryColor } = usePet();

  const options: LanguagePreference[] = ['system', 'en', 'ja', 'zhHans', 'zhHant'];

  const [foodScannerEnabled, setFoodScannerEnabledState] = useState(false);
  useEffect(() => {
    getFoodScannerEnabled().then(setFoodScannerEnabledState);
  }, []);

  const toggleFoodScanner = () => {
    const next = !foodScannerEnabled;
    setFoodScannerEnabledState(next);
    setFoodScannerEnabled(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.safeContent, { paddingTop: insets.top + 12 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.closeBtn} onPress={() => router.back()}>
            <ChevronDown size={24} color={Colors.darkBrown} />
          </Pressable>
          <Text style={styles.title}>{t('settings.title', { defaultValue: 'Settings' })}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Scrollable cards */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ── Pet Color (dev only) ───────────────────────────────── */}
          {IS_DEV && petType && (
            <View style={[styles.card, styles.cardSpacing]}>
              <Text style={styles.sectionTitle}>
                {t('settings.petColorSection', { defaultValue: 'Pet Color' })}
              </Text>
              <Text style={styles.sectionHint}>
                {t('settings.petColorHint', {
                  defaultValue:
                    'Choose a color for your pet. Full color rendering unlocks once split-layer art is added.',
                })}
              </Text>

              <View style={styles.colorPreviewRow}>
                <View
                  style={[
                    styles.colorPreviewCircle,
                    { borderColor: petPrimaryColor ?? PET_CONFIGS[petType].accentColor },
                  ]}
                >
                  <PetPortrait
                    petType={petType}
                    mood={mood}
                    primaryColor={petPrimaryColor}
                    style={styles.colorPreviewPet}
                  />
                </View>
                {petPrimaryColor && (
                  <Pressable
                    style={styles.resetColorBtn}
                    onPress={() => setPetPrimaryColor(null)}
                  >
                    <Text style={styles.resetColorBtnText}>
                      {t('settings.petColorReset', { defaultValue: 'Reset to default' })}
                    </Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.swatchGrid}>
                {PET_COLOR_PRESETS.map(({ label, hex }) => {
                  const isSelected = petPrimaryColor === hex;
                  return (
                    <Pressable
                      key={hex}
                      onPress={() => setPetPrimaryColor(hex)}
                      accessibilityLabel={label}
                      style={[
                        styles.swatch,
                        { backgroundColor: hex },
                        isSelected && styles.swatchSelected,
                      ]}
                    >
                      {isSelected && <Check size={14} color="#FFF" strokeWidth={3} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Language ──────────────────────────────────────────── */}
          <View style={[styles.card, styles.cardSpacing]}>
            <Text style={styles.sectionTitle}>
              {t('settings.languageSection', { defaultValue: 'Language' })}
            </Text>
            <Text style={styles.sectionHint}>
              {t('settings.languageHint', {
                defaultValue:
                  'Choose a language manually or follow the language set on your phone.',
              })}
            </Text>
            <Text style={styles.deviceHint}>
              {t('language.currentDevice', {
                language: languageLabel(deviceLocale as AppLanguage, t),
                defaultValue: 'Current phone language: {{language}}',
              })}
            </Text>

            <View style={styles.optionList}>
              {options.map((option) => {
                const selected = preference === option;
                return (
                  <Pressable
                    key={option}
                    style={[styles.optionRow, selected && styles.optionRowSelected]}
                    onPress={() => setLanguagePreference(option)}
                  >
                    <View style={styles.optionTextWrap}>
                      <Text style={styles.optionLabel}>{languageLabel(option, t)}</Text>
                      {option === 'system' && (
                        <Text style={styles.optionSubLabel}>
                          {t('language.followingDevice', {
                            defaultValue: 'Following your phone language',
                          })}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected && <Check size={16} color="#FFF" />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Food Scanner ─────────────────────────────────────── */}
          <View style={[styles.card, styles.cardSpacing]}>
            <Text style={styles.sectionTitle}>{t('settings.foodScanner')}</Text>
            <Text style={styles.sectionHint}>{t('settings.foodScannerHint')}</Text>
            <Pressable
              style={[styles.optionRow, foodScannerEnabled && styles.optionRowSelected]}
              onPress={toggleFoodScanner}
            >
              <Text style={styles.optionLabel}>{t('settings.foodScanner')}</Text>
              <View style={[styles.radio, foodScannerEnabled && styles.radioSelected]}>
                {foodScannerEnabled && <Check size={16} color="#FFF" />}
              </View>
            </Pressable>
          </View>

          {/* ── Contact ───────────────────────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {t('settings.contactSection', { defaultValue: 'Contact' })}
            </Text>
            <Text style={styles.sectionHint}>
              {t('settings.contactHint', { defaultValue: 'Have feedback or need help? Send us a message.' })}
            </Text>
            <Pressable
              style={styles.contactBtn}
              onPress={() => Linking.openURL('mailto:stephen.chalders@gmail.com')}
            >
              <Mail size={18} color={Colors.softOrange} />
              <Text style={styles.contactBtnText}>
                {t('settings.contactSendMessage', { defaultValue: 'Send a message' })}
              </Text>
            </Pressable>
          </View>
        </ScrollView>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeContent: { flex: 1, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.darkBrown, textAlign: 'center' },
  headerSpacer: { width: 36 },
  scrollContent: { paddingBottom: 16 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  cardSpacing: { marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.darkBrown, marginBottom: 8 },
  sectionHint: { fontSize: 14, lineHeight: 20, color: Colors.brown, marginBottom: 10 },
  deviceHint: { fontSize: 13, color: Colors.gray, marginBottom: 16 },
  optionList: { gap: 12 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: 16,
    backgroundColor: 'rgba(255,248,240,0.95)',
    borderWidth: 1.5, borderColor: 'rgba(212,165,116,0.2)',
  },
  optionRowSelected: {
    borderColor: Colors.softOrange,
    backgroundColor: 'rgba(244, 224, 199, 0.55)',
  },
  optionTextWrap: { flex: 1, paddingRight: 12 },
  optionLabel: { fontSize: 16, fontWeight: '600', color: Colors.darkBrown },
  optionSubLabel: { marginTop: 4, fontSize: 12, color: Colors.gray },
  radio: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: Colors.beige, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  radioSelected: { borderColor: Colors.softOrange, backgroundColor: Colors.softOrange },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: 16,
    backgroundColor: 'rgba(255,248,240,0.95)',
    borderWidth: 1.5, borderColor: 'rgba(212,165,116,0.2)',
  },
  contactBtnText: { fontSize: 15, fontWeight: '600', color: Colors.darkBrown },
  // Pet color (dev only)
  colorPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  colorPreviewCircle: {
    width: 88, height: 88, borderRadius: 44, borderWidth: 3,
    overflow: 'hidden', backgroundColor: 'rgba(255,248,240,0.9)',
  },
  colorPreviewPet: { width: 88, height: 88 },
  resetColorBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: Colors.beige, alignItems: 'center',
  },
  resetColorBtnText: { fontSize: 14, fontWeight: '600', color: Colors.brown },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 2,
  },
  swatchSelected: { borderWidth: 3, borderColor: '#FFF', shadowOpacity: 0.3, elevation: 4 },
});

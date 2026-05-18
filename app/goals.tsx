import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ArrowLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useAuth } from '@/providers/AuthProvider';
import { saveBodyProfile, getDailyCalorieGoalKcal } from '@/lib/onboarding-storage';
import { saveBodyProfileToSupabase, getBodyProfileFromSupabase } from '@/lib/user-info';

// ─── formula ──────────────────────────────────────────────────────────────────

function estimateTDEE(sex: 'male' | 'female', heightCm: number, weightKg: number): number {
  const age = 30;
  const bmr =
    sex === 'male'
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  return Math.round(bmr * 1.375);
}

function toCm(unit: 'cm' | 'ft', cm: string, ft: string, inVal: string): number {
  if (unit === 'cm') return parseFloat(cm) || 0;
  return (parseFloat(ft) || 0) * 30.48 + (parseFloat(inVal) || 0) * 2.54;
}

function toKg(unit: 'kg' | 'lbs', raw: string): number {
  const n = parseFloat(raw) || 0;
  return unit === 'kg' ? n : n * 0.453592;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── body fields ─────────────────────────────────────────────────────────
  const [sex, setSex] = useState<'male' | 'female' | null>(null);
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');
  const [heightCm, setHeightCm] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [weightRaw, setWeightRaw] = useState('');
  const [calorieStr, setCalorieStr] = useState('');
  const [calorieDirection, setCalorieDirection] = useState<'above' | 'below'>('below');
  const calorieUserEditedRef = useRef(false);

  // ── load existing profile ────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        let profile: {
          sex?: 'male' | 'female' | null;
          heightCm?: number | null;
          weightKg?: number | null;
          dailyCalorieGoal?: number | null;
          calorieDirection?: 'above' | 'below' | null;
        } | null = null;

        if (user?.id) {
          const remote = await getBodyProfileFromSupabase(user.id);
          if (remote) profile = {
            sex: remote.sex,
            heightCm: remote.heightCm,
            weightKg: remote.weightKg,
            dailyCalorieGoal: remote.dailyCalorieGoal,
            calorieDirection: remote.calorieDirection,
          };
        }

        if (!profile) {
          const { getBodyProfile } = await import('@/lib/onboarding-storage');
          const local = await getBodyProfile();
          if (local) profile = {
            sex: local.sex,
            heightCm: local.heightCm,
            weightKg: local.weightKg,
            dailyCalorieGoal: local.dailyCalorieEstimate,
            calorieDirection: local.calorieDirection,
          };
        }

        if (profile) {
          if (profile.sex) setSex(profile.sex);
          if (profile.heightCm) setHeightCm(String(Math.round(profile.heightCm)));
          if (profile.weightKg) setWeightRaw(String(Math.round(profile.weightKg * 10) / 10));
          if (profile.dailyCalorieGoal) {
            setCalorieStr(String(profile.dailyCalorieGoal));
            calorieUserEditedRef.current = true;
          }
          if (profile.calorieDirection) setCalorieDirection(profile.calorieDirection);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  // ── computed estimate ────────────────────────────────────────────────────
  const estimatedCalories = useMemo(() => {
    if (!sex) return null;
    const h = toCm(heightUnit, heightCm, heightFt, heightIn);
    const w = toKg(weightUnit, weightRaw);
    if (h < 50 || h > 280 || w < 20 || w > 500) return null;
    return estimateTDEE(sex, h, w);
  }, [sex, heightUnit, heightCm, heightFt, heightIn, weightUnit, weightRaw]);

  // Auto-populate calorie input with estimate if user hasn't manually set a value
  useEffect(() => {
    if (!calorieUserEditedRef.current && estimatedCalories !== null) {
      setCalorieStr(String(estimatedCalories));
    }
  }, [estimatedCalories]);

  const canSave = sex !== null;

  // ── save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const h = toCm(heightUnit, heightCm, heightFt, heightIn);
    const w = toKg(weightUnit, weightRaw);
    const calGoal = parseInt(calorieStr, 10) || estimatedCalories || (await getDailyCalorieGoalKcal());

    const localProfile = {
      sex: sex!,
      heightCm: h || 0,
      weightKg: w || 0,
      dailyCalorieEstimate: calGoal,
      calorieDirection,
      dietaryConditions: [],
    };

    await saveBodyProfile(localProfile);

    if (user?.id) {
      await saveBodyProfileToSupabase(user.id, {
        sex: sex,
        heightCm: h || null,
        weightKg: w || null,
        dailyCalorieGoal: calGoal,
        calorieDirection,
        dietaryConditions: [],
      });
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [canSave, sex, heightUnit, heightCm, heightFt, heightIn, weightUnit, weightRaw, calorieStr, estimatedCalories, calorieDirection, user?.id]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <LinearGradient colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color={Colors.softOrange} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={18} color="#FFF" />
          </Pressable>
          <Text style={styles.headerTitle}>{t('pet.goals.title')}</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionSubtitle}>{t('pet.goals.subtitle')}</Text>

          {!user && (
            <View style={styles.signInBanner}>
              <Text style={styles.signInBannerText}>{t('pet.goals.notLoggedIn')}</Text>
            </View>
          )}

          {/* ── Sex ──────────────────────────────────────────────────────── */}
          <Text style={styles.fieldLabel}>{t('onboarding.sex')}</Text>
          <View style={styles.sexRow}>
            {(['male', 'female'] as const).map((s) => (
              <Pressable
                key={s}
                style={[styles.sexBtn, sex === s && styles.sexBtnActive]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSex(s); }}
              >
                <Text style={[styles.sexBtnText, sex === s && styles.sexBtnTextActive]}>
                  {t(s === 'male' ? 'onboarding.male' : 'onboarding.female')}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── Height ───────────────────────────────────────────────────── */}
          <View style={styles.fieldHeaderRow}>
            <Text style={styles.fieldLabel}>{t('onboarding.height')}</Text>
            <View style={styles.unitToggle}>
              {(['cm', 'ft'] as const).map((u) => (
                <Pressable
                  key={u}
                  style={[styles.unitBtn, heightUnit === u && styles.unitBtnActive]}
                  onPress={() => setHeightUnit(u)}
                >
                  <Text style={[styles.unitBtnText, heightUnit === u && styles.unitBtnTextActive]}>{u}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {heightUnit === 'cm' ? (
            <TextInput
              style={styles.metricInput}
              placeholder="170"
              placeholderTextColor={Colors.gray}
              keyboardType="decimal-pad"
              value={heightCm}
              onChangeText={setHeightCm}
              returnKeyType="done"
            />
          ) : (
            <View style={styles.ftInRow}>
              <View style={styles.ftInField}>
                <TextInput
                  style={[styles.metricInput, styles.ftInInput]}
                  placeholder="5"
                  placeholderTextColor={Colors.gray}
                  keyboardType="number-pad"
                  value={heightFt}
                  onChangeText={setHeightFt}
                  returnKeyType="next"
                  maxLength={1}
                />
                <Text style={styles.ftInSuffix}>ft</Text>
              </View>
              <View style={styles.ftInField}>
                <TextInput
                  style={[styles.metricInput, styles.ftInInput]}
                  placeholder="7"
                  placeholderTextColor={Colors.gray}
                  keyboardType="number-pad"
                  value={heightIn}
                  onChangeText={setHeightIn}
                  returnKeyType="done"
                  maxLength={2}
                />
                <Text style={styles.ftInSuffix}>in</Text>
              </View>
            </View>
          )}

          {/* ── Weight ───────────────────────────────────────────────────── */}
          <View style={styles.fieldHeaderRow}>
            <Text style={styles.fieldLabel}>{t('onboarding.weight')}</Text>
            <View style={styles.unitToggle}>
              {(['kg', 'lbs'] as const).map((u) => (
                <Pressable
                  key={u}
                  style={[styles.unitBtn, weightUnit === u && styles.unitBtnActive]}
                  onPress={() => setWeightUnit(u)}
                >
                  <Text style={[styles.unitBtnText, weightUnit === u && styles.unitBtnTextActive]}>{u}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <TextInput
            style={styles.metricInput}
            placeholder={weightUnit === 'kg' ? '70' : '154'}
            placeholderTextColor={Colors.gray}
            keyboardType="decimal-pad"
            value={weightRaw}
            onChangeText={setWeightRaw}
            returnKeyType="done"
          />

          {/* ── Calorie goal ──────────────────────────────────────────────── */}
          {calorieStr !== '' && (
            <View style={styles.calorieCard}>
              <Text style={styles.calorieCardLabel}>{t('onboarding.dailyCalorieGoal')}</Text>

              <View style={styles.calorieInputRow}>
                <TextInput
                  style={styles.calorieInput}
                  value={calorieStr}
                  onChangeText={(v) => {
                    calorieUserEditedRef.current = true;
                    setCalorieStr(v.replace(/[^0-9]/g, ''));
                  }}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  maxLength={5}
                  selectTextOnFocus
                />
                <Text style={styles.calorieInputSuffix}>kcal / day</Text>
              </View>

              <View style={styles.calorieDirectionRow}>
                {(['below', 'above'] as const).map((dir) => (
                  <Pressable
                    key={dir}
                    style={[styles.dirBtn, calorieDirection === dir && styles.dirBtnActive]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCalorieDirection(dir); }}
                  >
                    <Text style={[styles.dirBtnText, calorieDirection === dir && styles.dirBtnTextActive]}>
                      {dir === 'below' ? t('onboarding.stayUnder') : t('onboarding.stayOver')}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {estimatedCalories !== null && parseInt(calorieStr, 10) !== estimatedCalories && (
                <Text style={styles.calorieDisclaimer}>
                  {t('onboarding.calorieGoalEstimate', { value: estimatedCalories.toLocaleString() })}
                </Text>
              )}
              <Text style={styles.calorieEditHint}>{t('onboarding.calorieEditHint')}</Text>

              {estimatedCalories !== null && parseInt(calorieStr, 10) !== estimatedCalories && (
                <Text style={styles.calorieDisclaimer}>
                  {t('onboarding.calorieGoalEstimate', { value: estimatedCalories.toLocaleString() })}
                </Text>
              )}
              {(estimatedCalories === null || parseInt(calorieStr, 10) === estimatedCalories) && (
                <Text style={styles.calorieDisclaimer}>{t('onboarding.calorieDisclaimer')}</Text>
              )}
            </View>
          )}

          {/* ── Save button ──────────────────────────────────────────────── */}
          <Pressable
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || !canSave}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>
                {saved ? t('pet.goals.saved') : t('pet.goals.save')}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(211, 211, 211)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.darkBrown, flex: 1, textAlign: 'center' },
  headerRight: { minWidth: 80 },

  scroll: { paddingHorizontal: 24, gap: 4 },

  sectionSubtitle: { fontSize: 14, color: Colors.brown, opacity: 0.7, marginBottom: 20, textAlign: 'center' },

  signInBanner: {
    backgroundColor: 'rgba(232,152,94,0.12)', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(232,152,94,0.25)',
  },
  signInBannerText: { fontSize: 13, color: Colors.brown, textAlign: 'center' },

  fieldLabel: {
    fontSize: 13, fontWeight: '700', color: Colors.gray,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 20,
  },
  fieldHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 20 },

  sexRow: { flexDirection: 'row', gap: 12 },
  sexBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    backgroundColor: Colors.cardBg, borderWidth: 2, borderColor: 'rgba(92,61,46,0.12)',
  },
  sexBtnActive: { backgroundColor: Colors.softOrange, borderColor: Colors.softOrange },
  sexBtnText: { fontSize: 16, fontWeight: '600', color: Colors.brown },
  sexBtnTextActive: { color: '#FFF' },

  unitToggle: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(92,61,46,0.15)' },
  unitBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  unitBtnActive: { backgroundColor: Colors.softOrange },
  unitBtnText: { fontSize: 13, fontWeight: '600', color: Colors.brown },
  unitBtnTextActive: { color: '#FFF' },

  metricInput: {
    backgroundColor: Colors.cardBg, borderRadius: 14, paddingHorizontal: 20,
    paddingVertical: 14, fontSize: 18, fontWeight: '600', color: Colors.darkBrown,
    borderWidth: 2, borderColor: 'rgba(92,61,46,0.12)', textAlign: 'center',
  },
  ftInRow: { flexDirection: 'row', gap: 12 },
  ftInField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  ftInInput: { flex: 1 },
  ftInSuffix: { fontSize: 15, fontWeight: '600', color: Colors.gray, minWidth: 20 },

  calorieCard: {
    marginTop: 16, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20,
    backgroundColor: 'rgba(232,152,94,0.08)', borderWidth: 1.5,
    borderColor: 'rgba(232,152,94,0.25)', alignItems: 'center', gap: 8,
  },
  calorieCardLabel: { fontSize: 12, fontWeight: '700', color: Colors.gray, textTransform: 'uppercase', letterSpacing: 0.8 },
  calorieInputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  calorieInput: {
    fontSize: 36, fontWeight: '800', color: Colors.softOrange, minWidth: 90, textAlign: 'center',
    borderWidth: 2, borderColor: Colors.softOrange, borderRadius: 14,
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  calorieInputSuffix: { fontSize: 14, fontWeight: '600', color: Colors.gray },
  calorieDirectionRow: { flexDirection: 'row', gap: 10 },
  dirBtn: {
    paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20,
    borderWidth: 1.5, borderColor: 'rgba(92,61,46,0.2)',
    backgroundColor: Colors.cardBg,
  },
  dirBtnActive: { backgroundColor: Colors.softOrange, borderColor: Colors.softOrange },
  dirBtnText: { fontSize: 14, fontWeight: '600', color: Colors.brown },
  dirBtnTextActive: { color: '#FFF' },
  calorieEditHint: { fontSize: 12, color: Colors.gray, textAlign: 'center' },
  calorieDisclaimer: { fontSize: 11, color: Colors.gray, fontStyle: 'italic', textAlign: 'center' },

  saveBtn: {
    backgroundColor: Colors.softOrange, paddingVertical: 16, borderRadius: 18,
    alignItems: 'center',
    shadowColor: Colors.softOrange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 5,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { fontSize: 17, fontWeight: '700', color: '#FFF' },
});

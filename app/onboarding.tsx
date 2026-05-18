import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, ChevronRight, Sparkles } from 'lucide-react-native';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useOnboarding } from '@/providers/OnboardingProvider';
import { getPetDescriptionKey, PET_CONFIGS, PetType } from '@/constants/pets';
import PetPortrait from '@/components/PetPortrait';
import { usePet } from '@/providers/PetProvider';
import { useAuth } from '@/providers/AuthProvider';
import {
  isValidUsername,
  normaliseUsername,
  checkUsernameAvailable,
  setMyUsername,
  saveBodyProfileToSupabase,
} from '@/lib/user-info';
import {
  setUsernamePromptDismissed,
  saveBodyProfile,
} from '@/lib/onboarding-storage';

// ─── calorie formula (Mifflin-St Jeor × lightly-active multiplier) ───────────

function estimateTDEE(sex: 'male' | 'female', heightCm: number, weightKg: number): number {
  const age = 30;
  const bmr =
    sex === 'male'
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  return Math.round(bmr * 1.375);
}

// ─── unit helpers ─────────────────────────────────────────────────────────────

function toCm(unit: 'cm' | 'ft', cm: string, ft: string, inVal: string): number {
  if (unit === 'cm') return parseFloat(cm) || 0;
  const feet = parseFloat(ft) || 0;
  const inches = parseFloat(inVal) || 0;
  return feet * 30.48 + inches * 2.54;
}

function toKg(unit: 'kg' | 'lbs', raw: string): number {
  const n = parseFloat(raw) || 0;
  return unit === 'kg' ? n : n * 0.453592;
}

// ─── types ────────────────────────────────────────────────────────────────────

const petTypes: PetType[] = ['mochi', 'nugget', 'cookie'];
type Step = 'select' | 'name' | 'body' | 'username';

// ─── component ────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { selectPet } = usePet();
  const { startOnboarding } = useOnboarding();
  const { user } = useAuth();

  // ── pet selection ──────────────────────────────────────────────────────────
  const [selectedPet, setSelectedPet] = useState<PetType>('mochi');
  const [petName, setPetName] = useState('');
  const [step, setStep] = useState<Step>('select');

  // ── body metrics ───────────────────────────────────────────────────────────
  const [sex, setSex] = useState<'male' | 'female' | null>(null);
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');
  const [heightCm, setHeightCm] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [weightRaw, setWeightRaw] = useState('');

  // ── calorie goal override ──────────────────────────────────────────────────
  const [calorieStr, setCalorieStr] = useState('');
  const [calorieDirection, setCalorieDirection] = useState<'above' | 'below'>('below');
  const calorieUserEditedRef = useRef(false);

  // ── username ───────────────────────────────────────────────────────────────
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  // ── animations ────────────────────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnims = useRef(petTypes.map(() => new Animated.Value(1))).current;
  const continueBtnFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(continueBtnFloat, { toValue: -5, duration: 1400, useNativeDriver: true }),
        Animated.timing(continueBtnFloat, { toValue: 0,  duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [continueBtnFloat]);

  const goToStep = useCallback((next: Step) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0,   duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -40, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      slideAnim.setValue(40);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start();
    });
  }, [fadeAnim, slideAnim]);

  // ── pet card press ─────────────────────────────────────────────────────────
  const handlePetSelect = useCallback((type: PetType, index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPet(type);
    Animated.sequence([
      Animated.timing(scaleAnims[index], { toValue: 0.92, duration: 80,  useNativeDriver: true }),
      Animated.spring(scaleAnims[index], { toValue: 1,    friction: 3, tension: 200, useNativeDriver: true }),
    ]).start();
  }, [scaleAnims]);

  // ── username availability check (debounced) ────────────────────────────────
  useEffect(() => {
    if (!usernameInput) { setUsernameAvailable(null); return; }
    const normalised = normaliseUsername(usernameInput);
    if (!isValidUsername(normalised)) { setUsernameAvailable(null); return; }
    setCheckingUsername(true);
    const id = setTimeout(() => {
      checkUsernameAvailable(normalised).then((ok) => {
        setUsernameAvailable(ok);
        setCheckingUsername(false);
      });
    }, 600);
    return () => clearTimeout(id);
  }, [usernameInput]);

  // ── computed calorie estimate ──────────────────────────────────────────────
  const estimatedCalories = useMemo(() => {
    if (!sex) return null;
    const h = toCm(heightUnit, heightCm, heightFt, heightIn);
    const w = toKg(weightUnit, weightRaw);
    if (h < 50 || h > 280 || w < 20 || w > 500) return null;
    return estimateTDEE(sex, h, w);
  }, [sex, heightUnit, heightCm, heightFt, heightIn, weightUnit, weightRaw]);

  // Auto-populate the calorie input with the estimate (until the user edits it manually)
  useEffect(() => {
    if (!calorieUserEditedRef.current && estimatedCalories !== null) {
      setCalorieStr(String(estimatedCalories));
    }
  }, [estimatedCalories]);

  const bodyComplete = useMemo(() => {
    if (!sex) return false;
    const h = toCm(heightUnit, heightCm, heightFt, heightIn);
    const w = toKg(weightUnit, weightRaw);
    return h >= 50 && h <= 280 && w >= 20 && w <= 500;
  }, [sex, heightUnit, heightCm, heightFt, heightIn, weightUnit, weightRaw]);

  // ── finish ─────────────────────────────────────────────────────────────────
  const handleFinish = useCallback(async (skipUsername = false) => {
    const name = petName.trim() || PET_CONFIGS[selectedPet].name;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await selectPet(selectedPet, name);
    if (!skipUsername && user?.id && usernameInput.trim()) {
      await setMyUsername(user.id, usernameInput).catch(() => {});
    }
    if (skipUsername) await setUsernamePromptDismissed();
    await startOnboarding();
    router.replace('/pet');
  }, [petName, selectedPet, usernameInput, user, selectPet, startOnboarding]);

  const config = PET_CONFIGS[selectedPet];

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

            {/* ── SELECT PET ─────────────────────────────────────────────── */}
            {step === 'select' && (
              <>
                <View style={styles.header}>
                  <View style={styles.sparkleRow}>
                    <Sparkles size={20} color={Colors.softOrange} />
                    <Text style={styles.subtitle}>{t('onboarding.chooseCompanion')}</Text>
                    <Sparkles size={20} color={Colors.softOrange} />
                  </View>
                  <Text style={styles.title}>{t('onboarding.whoWillBeYourFriend')}</Text>
                </View>

                <View style={styles.cardsContainer}>
                  {petTypes.map((type, index) => {
                    const pet = PET_CONFIGS[type];
                    const isSelected = selectedPet === type;
                    return (
                      <Animated.View key={type} style={[{ transform: [{ scale: scaleAnims[index] }] }]}>
                        <Pressable
                          onPress={() => handlePetSelect(type, index)}
                          style={[styles.petCard, isSelected && styles.petCardSelected, { borderColor: isSelected ? pet.accentColor : 'transparent' }]}
                          testID={`pet-card-${type}`}
                        >
                          <View style={[styles.petImageContainer, { backgroundColor: pet.color }]}>
                            <PetPortrait petType={type} mood="happy" primaryColor={null} style={styles.petImage} />
                          </View>
                          <View style={styles.petTextColumn}>
                            <Text style={styles.petName}>{pet.name}</Text>
                            <Text style={styles.petDesc}>{t(getPetDescriptionKey(type))}</Text>
                          </View>
                          {isSelected && (
                            <View style={[styles.selectedBadge, { backgroundColor: pet.accentColor }]}>
                              <Text style={styles.selectedBadgeText}>{t('onboarding.selected')}</Text>
                            </View>
                          )}
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </View>

                <Animated.View style={{ transform: [{ translateY: continueBtnFloat }] }}>
                  <Pressable
                    style={[styles.continueBtn, { backgroundColor: config.accentColor }]}
                    onPress={() => goToStep('name')}
                    testID="continue-button"
                  >
                    <Text style={styles.continueBtnText}>{t('onboarding.continue')}</Text>
                    <ChevronRight size={20} color="#FFF" />
                  </Pressable>
                </Animated.View>
              </>
            )}

            {/* ── NAME PET ───────────────────────────────────────────────── */}
            {step === 'name' && (
              <>
                <Pressable style={styles.backBtn} onPress={() => goToStep('select')}>
                  <ArrowLeft size={18} color="#FFF" />
                </Pressable>

                <View style={styles.header}>
                  <View style={styles.nameStepImageWrap}>
                    <PetPortrait petType={selectedPet} mood="happy" primaryColor={null} style={styles.nameStepImage} />
                  </View>
                  <Text style={styles.title}>{t('onboarding.nameYourPet')}</Text>
                  <Text style={styles.nameSubtitle}>{t('onboarding.nameSubtitle')}</Text>
                </View>

                <View style={styles.nameInputWrap}>
                  <TextInput
                    style={[styles.nameInput, { borderColor: config.accentColor }]}
                    placeholder={config.name}
                    placeholderTextColor={Colors.gray}
                    value={petName}
                    onChangeText={setPetName}
                    maxLength={20}
                    autoFocus
                    testID="pet-name-input"
                  />
                </View>

                <Animated.View style={{ transform: [{ translateY: continueBtnFloat }] }}>
                  <Pressable
                    style={[styles.continueBtn, { backgroundColor: config.accentColor }]}
                    onPress={() => goToStep('body')}
                    testID="finish-button"
                  >
                    <Text style={styles.continueBtnText}>{t('onboarding.continue')}</Text>
                    <ChevronRight size={20} color="#FFF" />
                  </Pressable>
                </Animated.View>
              </>
            )}

            {/* ── BODY METRICS ───────────────────────────────────────────── */}
            {step === 'body' && (
              <>
                <Pressable style={styles.backBtn} onPress={() => goToStep('name')}>
                  <ArrowLeft size={18} color="#FFF" />
                </Pressable>

                <View style={styles.header}>
                  <Text style={styles.title}>{t('onboarding.aboutYou')}</Text>
                  <Text style={styles.nameSubtitle}>{t('onboarding.aboutYouSubtitle')}</Text>
                </View>

                {/* Sex */}
                <Text style={styles.fieldLabel}>{t('onboarding.sex')}</Text>
                <View style={styles.sexRow}>
                  {(['male', 'female'] as const).map((s) => (
                    <Pressable
                      key={s}
                      style={[styles.sexBtn, sex === s && { backgroundColor: config.accentColor, borderColor: config.accentColor }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSex(s); }}
                    >
                      <Text style={[styles.sexBtnText, sex === s && styles.sexBtnTextActive]}>
                        {t(s === 'male' ? 'onboarding.male' : 'onboarding.female')}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Height */}
                <View style={styles.fieldHeaderRow}>
                  <Text style={styles.fieldLabel}>{t('onboarding.height')}</Text>
                  <View style={styles.unitToggle}>
                    {(['cm', 'ft'] as const).map((u) => (
                      <Pressable
                        key={u}
                        style={[styles.unitBtn, heightUnit === u && { backgroundColor: config.accentColor }]}
                        onPress={() => setHeightUnit(u)}
                      >
                        <Text style={[styles.unitBtnText, heightUnit === u && styles.unitBtnTextActive]}>{u}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {heightUnit === 'cm' ? (
                  <TextInput
                    style={[styles.metricInput, { borderColor: config.accentColor }]}
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
                        style={[styles.metricInput, styles.ftInInput, { borderColor: config.accentColor }]}
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
                        style={[styles.metricInput, styles.ftInInput, { borderColor: config.accentColor }]}
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

                {/* Weight */}
                <View style={styles.fieldHeaderRow}>
                  <Text style={styles.fieldLabel}>{t('onboarding.weight')}</Text>
                  <View style={styles.unitToggle}>
                    {(['kg', 'lbs'] as const).map((u) => (
                      <Pressable
                        key={u}
                        style={[styles.unitBtn, weightUnit === u && { backgroundColor: config.accentColor }]}
                        onPress={() => setWeightUnit(u)}
                      >
                        <Text style={[styles.unitBtnText, weightUnit === u && styles.unitBtnTextActive]}>{u}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <TextInput
                  style={[styles.metricInput, { borderColor: config.accentColor }]}
                  placeholder={weightUnit === 'kg' ? '70' : '154'}
                  placeholderTextColor={Colors.gray}
                  keyboardType="decimal-pad"
                  value={weightRaw}
                  onChangeText={setWeightRaw}
                  returnKeyType="done"
                />

                {/* Calorie goal card */}
                {calorieStr !== '' && (
                  <View style={[styles.calorieCard, { borderColor: config.accentColor }]}>
                    <Text style={styles.calorieCardLabel}>{t('onboarding.dailyCalorieGoal')}</Text>

                    <View style={styles.calorieInputRow}>
                      <TextInput
                        style={[styles.calorieInput, { color: config.accentColor, borderColor: config.accentColor }]}
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

                    <Text style={styles.calorieEditHint}>{t('onboarding.calorieEditHint')}</Text>

                    <View style={styles.calorieDirectionRow}>
                      {(['below', 'above'] as const).map((dir) => (
                        <Pressable
                          key={dir}
                          style={[
                            styles.dirBtn,
                            calorieDirection === dir && { backgroundColor: config.accentColor, borderColor: config.accentColor },
                          ]}
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
                    {(estimatedCalories === null || parseInt(calorieStr, 10) === estimatedCalories) && (
                      <Text style={styles.calorieDisclaimer}>{t('onboarding.calorieDisclaimer')}</Text>
                    )}
                  </View>
                )}

                <View style={styles.bodyBtnRow}>
                  <Animated.View style={[{ flex: 1 }, { transform: [{ translateY: continueBtnFloat }] }]}>
                    <Pressable
                      style={[styles.continueBtn, { backgroundColor: config.accentColor }, !bodyComplete && styles.continueBtnDisabled]}
                      onPress={async () => {
                        if (!bodyComplete || !sex) return;
                        const h = toCm(heightUnit, heightCm, heightFt, heightIn);
                        const w = toKg(weightUnit, weightRaw);
                        const calGoal = parseInt(calorieStr, 10) || estimatedCalories || 2000;
                        const profile = {
                          sex,
                          heightCm: h,
                          weightKg: w,
                          dailyCalorieEstimate: calGoal,
                          calorieDirection,
                          dietaryConditions: [],
                        };
                        await saveBodyProfile(profile);
                        if (user?.id) {
                          saveBodyProfileToSupabase(user.id, {
                            sex: profile.sex,
                            heightCm: profile.heightCm,
                            weightKg: profile.weightKg,
                            dailyCalorieGoal: profile.dailyCalorieEstimate,
                            calorieDirection: profile.calorieDirection,
                            dietaryConditions: [],
                          });
                        }
                        goToStep('username');
                      }}
                      disabled={!bodyComplete}
                    >
                      <Text style={styles.continueBtnText}>{t('onboarding.continue')}</Text>
                      <ChevronRight size={20} color="#FFF" />
                    </Pressable>
                  </Animated.View>
                </View>

                <Pressable style={styles.skipBtn} onPress={() => goToStep('username')}>
                  <Text style={styles.skipBtnText}>{t('onboarding.skipForNow')}</Text>
                </Pressable>
              </>
            )}

            {/* ── USERNAME ───────────────────────────────────────────────── */}
            {step === 'username' && (
              <>
                <Pressable style={styles.backBtn} onPress={() => goToStep('body')}>
                  <ArrowLeft size={18} color="#FFF" />
                </Pressable>

                <View style={styles.header}>
                  <Text style={styles.title}>{t('onboarding.chooseHandle')}</Text>
                  <Text style={styles.nameSubtitle}>{t('onboarding.handleSubtitle')}</Text>
                </View>

                <View style={styles.nameInputWrap}>
                  <View style={[styles.handleInputRow, { borderColor: config.accentColor }]}>
                    <Text style={[styles.handlePrefix, { color: config.accentColor }]}>@</Text>
                    <TextInput
                      style={styles.handleInput}
                      placeholder="yourhandle"
                      placeholderTextColor={Colors.gray}
                      value={usernameInput}
                      onChangeText={(v) => setUsernameInput(normaliseUsername(v))}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={20}
                      autoFocus
                    />
                  </View>
                  <View style={styles.handleStatus}>
                    {checkingUsername && <ActivityIndicator size="small" color={Colors.softOrange} />}
                    {!checkingUsername && usernameInput.length > 0 && !isValidUsername(usernameInput) && (
                      <Text style={styles.handleHint}>{t('onboarding.handleFormatHint')}</Text>
                    )}
                    {!checkingUsername && usernameAvailable === true && (
                      <Text style={styles.handleAvailable}>{t('onboarding.handleAvailable')}</Text>
                    )}
                    {!checkingUsername && usernameAvailable === false && (
                      <Text style={styles.handleTaken}>{t('onboarding.handleTaken')}</Text>
                    )}
                  </View>
                </View>

                <Animated.View style={{ transform: [{ translateY: continueBtnFloat }] }}>
                  <Pressable
                    style={[styles.continueBtn, { backgroundColor: config.accentColor }, !usernameAvailable && styles.continueBtnDisabled]}
                    onPress={() => handleFinish(false)}
                    disabled={!usernameAvailable}
                    testID="finish-button"
                  >
                    <Text style={styles.continueBtnText}>{t('onboarding.letsGo')}</Text>
                    <Sparkles size={20} color="#FFF" />
                  </Pressable>
                </Animated.View>

                <Pressable style={styles.skipBtn} onPress={() => handleFinish(true)}>
                  <Text style={styles.skipBtnText}>{t('onboarding.skipForNow')}</Text>
                </Pressable>
              </>
            )}

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { flex: 1, paddingHorizontal: 24 },

  header: { alignItems: 'center', marginBottom: 28 },
  sparkleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  subtitle: { fontSize: 12, fontWeight: '700', letterSpacing: 2, color: Colors.softOrange },
  title: { fontSize: 32, fontWeight: '800', color: Colors.darkBrown, textAlign: 'center', lineHeight: 40 },

  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(211,211,211,0.9)',
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'flex-start', marginBottom: 16,
  },

  // ── pet selection ──────────────────────────────────────────────────────────
  cardsContainer: { gap: 16, marginBottom: 32 },
  petCard: {
    backgroundColor: Colors.cardBg, borderRadius: 20, padding: 16,
    flexDirection: 'row', alignItems: 'center', borderWidth: 2.5,
    shadowColor: Colors.brown, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  petCardSelected: { shadowOpacity: 0.15, shadowRadius: 16, elevation: 6 },
  petImageContainer: { width: 80, height: 80, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  petImage: { width: 68, height: 68 },
  petTextColumn: { flex: 1, flexDirection: 'column', justifyContent: 'center', minWidth: 0 },
  petName: { fontSize: 18, fontWeight: '700', color: Colors.darkBrown, marginBottom: 10 },
  petDesc: { fontSize: 13, color: Colors.brown, opacity: 0.7, lineHeight: 18 },
  selectedBadge: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  selectedBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFF' },

  // ── shared ─────────────────────────────────────────────────────────────────
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 16, gap: 8,
    shadowColor: Colors.brown, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  continueBtnText: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  continueBtnDisabled: { opacity: 0.45 },
  skipBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  skipBtnText: { fontSize: 14, color: Colors.gray, textDecorationLine: 'underline' },

  // ── name step ──────────────────────────────────────────────────────────────
  nameStepImageWrap: { width: 140, height: 140, marginBottom: 16 },
  nameStepImage: { width: 140, height: 140 },
  nameSubtitle: { fontSize: 15, color: Colors.brown, opacity: 0.7, marginTop: 8, textAlign: 'center' },
  nameInputWrap: { marginBottom: 32 },
  nameInput: {
    backgroundColor: Colors.cardBg, borderRadius: 16, paddingHorizontal: 20,
    paddingVertical: 16, fontSize: 18, fontWeight: '600', color: Colors.darkBrown,
    borderWidth: 2, textAlign: 'center',
  },

  // ── body step ──────────────────────────────────────────────────────────────
  fieldLabel: { fontSize: 13, fontWeight: '700', color: Colors.gray, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  fieldHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 20 },
  sexRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  sexBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    backgroundColor: Colors.cardBg, borderWidth: 2, borderColor: 'rgba(92,61,46,0.12)',
  },
  sexBtnText: { fontSize: 16, fontWeight: '600', color: Colors.brown },
  sexBtnTextActive: { color: '#FFF' },
  unitToggle: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(92,61,46,0.15)' },
  unitBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  unitBtnText: { fontSize: 13, fontWeight: '600', color: Colors.brown },
  unitBtnTextActive: { color: '#FFF' },
  metricInput: {
    backgroundColor: Colors.cardBg, borderRadius: 14, paddingHorizontal: 20,
    paddingVertical: 14, fontSize: 18, fontWeight: '600', color: Colors.darkBrown,
    borderWidth: 2, textAlign: 'center',
  },
  ftInRow: { flexDirection: 'row', gap: 12 },
  ftInField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  ftInInput: { flex: 1 },
  ftInSuffix: { fontSize: 15, fontWeight: '600', color: Colors.gray, minWidth: 20 },
  calorieCard: {
    marginTop: 20, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20,
    backgroundColor: 'rgba(232,152,94,0.08)', borderWidth: 1.5,
    alignItems: 'center', gap: 8,
  },
  calorieCardLabel: { fontSize: 12, fontWeight: '700', color: Colors.gray, textTransform: 'uppercase', letterSpacing: 0.8 },
  calorieInputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  calorieInput: {
    fontSize: 36, fontWeight: '800', minWidth: 90, textAlign: 'center',
    borderWidth: 2, borderRadius: 14,
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  calorieInputSuffix: { fontSize: 14, fontWeight: '600', color: Colors.gray },
  calorieEditHint: { fontSize: 12, color: Colors.gray, textAlign: 'center' },
  calorieDirectionRow: { flexDirection: 'row', gap: 10 },
  dirBtn: {
    paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20,
    borderWidth: 1.5, borderColor: 'rgba(92,61,46,0.2)',
    backgroundColor: Colors.cardBg,
  },
  dirBtnText: { fontSize: 14, fontWeight: '600', color: Colors.brown },
  dirBtnTextActive: { color: '#FFF' },
  calorieDisclaimer: { fontSize: 11, color: Colors.gray, fontStyle: 'italic', textAlign: 'center' },
  bodyBtnRow: { marginTop: 28 },

  // ── username step ──────────────────────────────────────────────────────────
  handleInputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.cardBg,
    borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, borderWidth: 2, gap: 6,
  },
  handlePrefix: { fontSize: 22, fontWeight: '700' },
  handleInput: { flex: 1, fontSize: 18, fontWeight: '600', color: Colors.darkBrown },
  handleStatus: { minHeight: 22, marginTop: 8, alignItems: 'center' },
  handleHint: { fontSize: 13, color: Colors.gray, textAlign: 'center' },
  handleAvailable: { fontSize: 13, fontWeight: '600', color: '#4CAF50', textAlign: 'center' },
  handleTaken: { fontSize: 13, fontWeight: '600', color: '#E53935', textAlign: 'center' },
});

import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  Modal,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Polygon } from 'react-native-svg';
import {
  Camera,
  Flame,
  Images,
  Menu,
  LogOut,
  Package,
  RotateCcw,
  Settings,
  Star,
  Users,
} from 'lucide-react-native';
import { getNutrientDisplay } from '@/constants/badge-types';
import Colors from '@/constants/colors';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import {
  analyzeNutritionWindow,
  getCachedNutritionWindowAnalysis,
  getLastNutritionAnalysisAt,
  NUTRITION_ANALYSIS_COOLDOWN_DAYS,
  NUTRITION_ANALYSIS_DAYS,
  NUTRITION_ANALYSIS_REQUIRED_PHOTOS,
  type NutritionWindowAnalysisSuccess,
} from '@/lib/analyze-nutrition-window';
import {
  aggregateDailyNutrition,
  DAILY_CALORIE_GOAL_KCAL,
  formatNutrientChip,
} from '@/lib/daily-nutrition';
import { getPetPhotosForLocalCalendarDay, getPetPhotosInDateRange } from '@/lib/supabase-photos';
import { getMoodLabelKey, PET_CONFIGS, MOOD_CONFIG } from '@/constants/pets';
import PetPortrait from '@/components/PetPortrait';
import { useOnboarding } from '@/providers/OnboardingProvider';
import { usePet } from '@/providers/PetProvider';
import { useAuth } from '@/providers/AuthProvider';
import {
  getMyUsername,
  setMyUsername,
  isValidUsername,
  normaliseUsername,
  checkUsernameAvailable,
} from '@/lib/user-info';
import {
  getUsernamePromptDismissed,
  setUsernamePromptDismissed,
} from '@/lib/onboarding-storage';

const IS_DEV = process.env.EXPO_PUBLIC_IS_DEV === 'true';

const hasSupabaseConfig = () =>
  !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Onboarding pointer targets (see pet screen layout):
 * - Camera: `bottomActions` → full-width `actionBtn` + `cameraBtn` (Share a Moment).
 * - Album: `statsRow` → `albumBtn` (36×36), first control before level badge + gap.
 * - Menu: `topBarLeft` → `menuBtn` (36×36), first control.
 */
const TOP_BAR_HIT = 36;
/** Step 0 hint card — smaller bottom = card lower on screen */
const ONBOARD_STEP0_CARD_BOTTOM = 100;
/** Pixels between card bottom edge and triangle base (Share a moment step) */
const ONBOARD_STEP0_GAP_CARD_TO_TRIANGLE = 2;
/** Down-pointing triangle SVG height (tip at bottom) */
const ONBOARD_TRIANGLE_H = 11;
const ONBOARD_TRIANGLE_HALF_W = 9;
/** Steps 1–2: white card top (overlay y; below safeContent paddingTop) */
const ONBOARD_STEP12_CARD_TOP = 144;
/** Album icon center X: from content left; ~36px btn + gap + Lv badge right of it */
const ONBOARD_ALBUM_CENTER_X_OFFSET = 56;
/** Album / menu hit target half-size (36×36) */
const ONBOARD_CORNER_BTN_RADIUS = 18;
/** Card ↔ triangle and triangle ↔ target gaps (corner steps) */
const ONBOARD_GAP_COUPLE = 2;
/** Fixed diagonal offset from the corner target for steps 2–3; yields an exact 45° arrow. */
const ONBOARD_CORNER_TRIANGLE_OFFSET = 50;
/** Rotating the down-pointing triangle by ±135° makes the visual arrow exactly 45° diagonally. */
const ONBOARD_CORNER_TRIANGLE_ROT_DEG = 135;
/** Step 2 (album) onboarding arrow position tweak. */
const ONBOARD_STEP1_ARROW_OFFSET_X = 50;
const ONBOARD_STEP1_ARROW_OFFSET_Y = 20;
/** Step 3 (menu) onboarding arrow position tweak. */
const ONBOARD_STEP2_ARROW_OFFSET_X = -24;
const ONBOARD_STEP2_ARROW_OFFSET_Y = 24;

/** Small down-pointing SVG triangle (rotate for album / menu aim) */
function OnboardingTriangleDown({ color }: { color: string }) {
  const w = 18;
  const h = ONBOARD_TRIANGLE_H;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Polygon points={`0,0 ${w},0 ${w / 2},${h}`} fill={color} />
    </Svg>
  );
}

/** Album / menu tips: place the triangle tip on a fixed 45° diagonal from the target button. */
function computeCornerOnboardingGuide(
  btnCx: number,
  btnCy: number,
  cardCx: number,
  cardTopY: number,
  btnRadius: number,
  gapBtn: number,
  gapY: number
) {
  const horizontalDir = Math.sign(cardCx - btnCx) || 1;
  const baseOffset = btnRadius + gapBtn + ONBOARD_CORNER_TRIANGLE_OFFSET;
  let tipY = btnCy + baseOffset;

  /** Bottom of top-bar row; triangle view uses top = tipY - ONBOARD_TRIANGLE_H, so tipY must be ≥ this */
  const yMinTip = TOP_BAR_HIT + ONBOARD_TRIANGLE_H + gapY;
  const yMaxTip = cardTopY - gapY;
  tipY = Math.max(yMinTip, Math.min(yMaxTip, tipY));
  const tipX = btnCx + horizontalDir * (tipY - btnCy);

  const rot = horizontalDir > 0 ? ONBOARD_CORNER_TRIANGLE_ROT_DEG : -ONBOARD_CORNER_TRIANGLE_ROT_DEG;
  return { tipX, tipY, rot };
}

const REACTIONS = ['💕', '⭐', '🎵', '✨', '💖', '🌟'];

function getNutritionAnalysisWindow(now: Date = new Date()) {
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (NUTRITION_ANALYSIS_DAYS - 1),
    0,
    0,
    0,
    0
  );
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function formatAnalysisTimestamp(timestamp: string): string | null {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function hasNutritionCooldownElapsed(timestamp?: string | null): boolean {
  if (!timestamp) return true;
  const last = new Date(timestamp).getTime();
  if (Number.isNaN(last)) return true;
  return Date.now() - last >= NUTRITION_ANALYSIS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

export default function PetScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const tLoose = useCallback(
    (key: string, options?: Record<string, string>) =>
      String(t(key as never, options as never)),
    [t]
  );
  const nutritionAnalysisWindow = useMemo(() => getNutritionAnalysisWindow(), []);
  const {
    petType, petName, happiness, mood, userId,
    level, expProgress, justLeveledUp, clearLevelUp,
    petPrimaryColor,
    setPetPrimaryColor,
    username,
  } = usePet();

  const {
    data: todayPhotos,
    refetch: refetchTodayPhotos,
    isLoading: todayPhotosLoading,
  } = useQuery({
    queryKey: ['petPhotosToday', userId],
    queryFn: () => getPetPhotosForLocalCalendarDay(userId!),
    enabled: !!userId && hasSupabaseConfig(),
    staleTime: 30_000,
  });
  const {
    data: recentNutritionPhotos,
    refetch: refetchRecentNutritionPhotos,
    isLoading: recentNutritionPhotosLoading,
  } = useQuery({
    queryKey: [
      'petPhotosNutritionWindow',
      userId,
      nutritionAnalysisWindow.startIso,
      nutritionAnalysisWindow.endIso,
    ],
    queryFn: () =>
      getPetPhotosInDateRange(
        userId!,
        nutritionAnalysisWindow.startIso,
        nutritionAnalysisWindow.endIso
      ),
    enabled: !!userId && hasSupabaseConfig(),
    staleTime: 30_000,
  });

  useFocusEffect(
    useCallback(() => {
      if (userId && hasSupabaseConfig()) {
        refetchTodayPhotos();
        refetchRecentNutritionPhotos();
      }
    }, [userId, refetchTodayPhotos, refetchRecentNutritionPhotos])
  );

  const dailyNutrition = useMemo(
    () => aggregateDailyNutrition(todayPhotos ?? []),
    [todayPhotos]
  );
  const recentPhotoCount = recentNutritionPhotos?.length ?? 0;
  const canRunNutritionAnalysis =
    recentPhotoCount >= NUTRITION_ANALYSIS_REQUIRED_PHOTOS;
  const { signOut, session } = useAuth();
  const { step: onboardingStep, advanceStep, startOnboarding } = useOnboarding();

  // ── Username prompt ──────────────────────────────────────────────────────────
  // Start as true (hidden) until AsyncStorage confirms it hasn't been dismissed.
  const [usernamePromptSkipped, setUsernamePromptSkipped] = useState(true);
  useEffect(() => {
    getUsernamePromptDismissed().then((dismissed) => {
      if (!dismissed) setUsernamePromptSkipped(false);
    });
  }, []);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);

  const { data: myUsername, isSuccess: myUsernameLoaded } = useQuery({
    queryKey: ['myUsername', userId],
    queryFn: () => getMyUsername(userId!),
    enabled: !!userId && hasSupabaseConfig(),
    staleTime: Infinity,
  });

  const showUsernamePrompt =
    !usernamePromptSkipped &&
    !!userId &&
    hasSupabaseConfig() &&
    myUsernameLoaded &&
    myUsername === null;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!showUsernamePrompt) return;
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
  }, [usernameInput, showUsernamePrompt]);

  const handleSaveUsername = useCallback(async () => {
    if (!userId || !usernameInput.trim() || !usernameAvailable) return;
    setSavingUsername(true);
    const err = await setMyUsername(userId, usernameInput);
    setSavingUsername(false);
    if (err) {
      Alert.alert('Could not save', err);
      return;
    }
    queryClient.setQueryData(['myUsername', userId], normaliseUsername(usernameInput));
  }, [userId, usernameInput, usernameAvailable, queryClient]);

  // ─────────────────────────────────────────────────────────────────────────────

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const petScale = useRef(new Animated.Value(1)).current;
  const idleAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const expProgressAnim = useRef(new Animated.Value(0)).current;
  const levelUpScale = useRef(new Animated.Value(0)).current;
  const levelUpOpacity = useRef(new Animated.Value(0)).current;
  const onboardingArrowPulse = useRef(new Animated.Value(0)).current;
  const nutritionFlashAnim = useRef(new Animated.Value(0)).current;
  const menuSlideAnim = useRef(new Animated.Value(-180)).current;
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; x: number; anim: Animated.Value }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nutritionAnalysisVisible, setNutritionAnalysisVisible] = useState(false);
  const [nutritionAnalysisLoading, setNutritionAnalysisLoading] = useState(false);
  const [nutritionAnalysisError, setNutritionAnalysisError] = useState<string | null>(null);
  const [nutritionAnalysisResult, setNutritionAnalysisResult] =
    useState<NutritionWindowAnalysisSuccess | null>(null);
  const [lastNutritionAnalysisAt, setLastNutritionAnalysisAt] = useState<string | null>(null);
  const latestNutritionAnalysisAt =
    nutritionAnalysisResult?.analyzedAt ?? lastNutritionAnalysisAt;
  const nutritionAnalysisTimestamp = useMemo(
    () =>
      latestNutritionAnalysisAt
        ? formatAnalysisTimestamp(latestNutritionAnalysisAt)
        : null,
    [latestNutritionAnalysisAt]
  );
  const shouldShowFlashyNutritionButton =
    canRunNutritionAnalysis &&
    !recentNutritionPhotosLoading &&
    hasNutritionCooldownElapsed(latestNutritionAnalysisAt);
  const emojiIdRef = useRef(0);

  const config = petType ? PET_CONFIGS[petType] : PET_CONFIGS.mochi;
  const moodConfig = MOOD_CONFIG[mood];

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: happiness / 100,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [happiness, progressAnim]);

  useEffect(() => {
    Animated.timing(expProgressAnim, {
      toValue: expProgress,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [expProgress, expProgressAnim]);

  useEffect(() => {
    if (justLeveledUp) {
      levelUpScale.setValue(0);
      levelUpOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(levelUpScale, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
        Animated.timing(levelUpOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [justLeveledUp, levelUpScale, levelUpOpacity]);

  useEffect(() => {
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(idleAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(idleAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    );
    breathe.start();
    return () => breathe.stop();
  }, [idleAnim]);

  useEffect(() => {
    if (onboardingStep < 0 || onboardingStep > 2) return;
    onboardingArrowPulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(onboardingArrowPulse, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(onboardingArrowPulse, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [onboardingStep, onboardingArrowPulse]);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setLastNutritionAnalysisAt(null);
      return () => {
        active = false;
      };
    }

    getLastNutritionAnalysisAt(userId)
      .then((timestamp) => {
        if (!active) return;
        setLastNutritionAnalysisAt(timestamp);
      })
      .catch(() => {
        if (!active) return;
        setLastNutritionAnalysisAt(null);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    let active = true;

    if (!userId || !canRunNutritionAnalysis || !recentNutritionPhotos?.length) {
      setNutritionAnalysisResult(null);
      return () => {
        active = false;
      };
    }

    getCachedNutritionWindowAnalysis({
      userId,
      photos: recentNutritionPhotos,
      startIso: nutritionAnalysisWindow.startIso,
      endIso: nutritionAnalysisWindow.endIso,
    })
      .then((cached) => {
        if (!active) return;
        setNutritionAnalysisResult(cached);
      })
      .catch(() => {
        if (!active) return;
        setNutritionAnalysisResult(null);
      });

    return () => {
      active = false;
    };
  }, [
    userId,
    canRunNutritionAnalysis,
    recentNutritionPhotos,
    nutritionAnalysisWindow.startIso,
    nutritionAnalysisWindow.endIso,
  ]);

  useEffect(() => {
    if (!shouldShowFlashyNutritionButton) {
      nutritionFlashAnim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(nutritionFlashAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(nutritionFlashAnim, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shouldShowFlashyNutritionButton, nutritionFlashAnim]);

  const spawnEmoji = useCallback((x: number) => {
    const id = emojiIdRef.current++;
    const emoji = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
    const anim = new Animated.Value(0);
    setFloatingEmojis(prev => [...prev, { id, emoji, x, anim }]);
    Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true }).start(() => {
      setFloatingEmojis(prev => prev.filter(e => e.id !== id));
    });
  }, []);

  const handleTap = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const randomX = SCREEN_WIDTH * 0.2 + Math.random() * SCREEN_WIDTH * 0.6;
    spawnEmoji(randomX);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(petScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: -12, duration: 80, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(petScale, { toValue: 1, friction: 3, tension: 300, useNativeDriver: true }),
        Animated.spring(bounceAnim, { toValue: 0, friction: 3, tension: 300, useNativeDriver: true }),
      ]),
    ]).start();
  }, [petScale, bounceAnim, spawnEmoji]);

  const handleCamera = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onboardingStep === 0) await advanceStep();
    router.push('/camera');
  }, [onboardingStep, advanceStep]);

  const handleAlbum = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onboardingStep === 1) await advanceStep();
    router.push('/album');
  }, [onboardingStep, advanceStep]);

  const openMenu = useCallback(() => {
    menuSlideAnim.setValue(-180);
    setMenuOpen(true);
    Animated.timing(menuSlideAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  }, [menuSlideAnim]);

  const closeMenu = useCallback((onDone?: () => void) => {
    Animated.timing(menuSlideAnim, { toValue: -180, duration: 200, useNativeDriver: true })
      .start(() => {
        setMenuOpen(false);
        onDone?.();
      });
  }, [menuSlideAnim]);

  const handleInventory = useCallback(async () => {
    closeMenu();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onboardingStep === 2) await advanceStep();
    router.push('/inventory');
  }, [onboardingStep, advanceStep]);

  const handleItems = useCallback(() => {
    closeMenu(() => router.push('/items'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [closeMenu]);

  const handleStreak = useCallback(async () => {
    closeMenu(() => router.push('/streak'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [closeMenu]);

  const handleRestartOnboardingDev = useCallback(async () => {
    closeMenu();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await startOnboarding();
  }, [closeMenu, startOnboarding]);

  const handleLogOut = useCallback(async () => {
    closeMenu(async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await signOut();
      router.replace('/sign-in');
    });
  }, [closeMenu, signOut]);

  const handleGroup = useCallback(() => {
    closeMenu(() => router.push('/group'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [closeMenu]);

  const handleSettings = useCallback(async () => {
    closeMenu(() => router.push('/settings'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [closeMenu]);

  const closeNutritionAnalysis = useCallback(() => {
    setNutritionAnalysisVisible(false);
  }, []);

  const handleNutritionAnalysis = useCallback(async () => {
    if (!userId || !canRunNutritionAnalysis || !recentNutritionPhotos?.length) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNutritionAnalysisVisible(true);
    setNutritionAnalysisLoading(true);
    setNutritionAnalysisError(null);
    setNutritionAnalysisResult(null);

    const result = await analyzeNutritionWindow(
      {
        userId,
        photos: recentNutritionPhotos,
        startIso: nutritionAnalysisWindow.startIso,
        endIso: nutritionAnalysisWindow.endIso,
        forceRefresh: shouldShowFlashyNutritionButton,
      },
      session?.access_token ?? null
    );

    setNutritionAnalysisLoading(false);

    if (result.success) {
      setNutritionAnalysisResult(result);
      setLastNutritionAnalysisAt(result.analyzedAt);
      return;
    }

    if (result.code === 'NOT_ENOUGH_PHOTOS') {
      setNutritionAnalysisVisible(false);
      Alert.alert(
        tLoose('pet.nutritionAnalysis.notReadyTitle'),
        tLoose('pet.nutritionAnalysis.lockedHint', {
          count: String(result.requiredPhotos ?? NUTRITION_ANALYSIS_REQUIRED_PHOTOS),
          days: String(result.days ?? NUTRITION_ANALYSIS_DAYS),
          remaining: String(
            Math.max(
              0,
              (result.requiredPhotos ?? NUTRITION_ANALYSIS_REQUIRED_PHOTOS) -
                (result.photoCount ?? recentPhotoCount)
            )
          ),
        })
      );
      return;
    }

    setNutritionAnalysisError(
      result.code === 'AUTH_REQUIRED'
        ? tLoose('pet.nutritionAnalysis.signInRequired')
        : result.raw || tLoose('pet.nutritionAnalysis.errorBody')
    );
  }, [
    canRunNutritionAnalysis,
    userId,
    recentNutritionPhotos,
    nutritionAnalysisWindow.startIso,
    nutritionAnalysisWindow.endIso,
    session?.access_token,
    shouldShowFlashyNutritionButton,
    tLoose,
    recentPhotoCount,
  ]);

  const dismissLevelUp = useCallback(() => {
    Animated.timing(levelUpOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      clearLevelUp();
    });
  }, [clearLevelUp, levelUpOpacity]);

  const idleTranslateY = idleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });

  const sadScale = mood === 'sad' || mood === 'miserable' ? 0.92 : 1;
  const sadOpacity = mood === 'miserable' ? 0.7 : mood === 'sad' ? 0.85 : 1;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const expProgressWidth = expProgressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  /** Overlay content width (matches safeContent horizontal padding 20 + 20) */
  const onboardOverlayW = SCREEN_WIDTH - 40;
  /** Button centers in onboarding overlay coords (y=0 = top of topBar row) */
  const onboardAlbumCx = onboardOverlayW - ONBOARD_ALBUM_CENTER_X_OFFSET;
  const onboardAlbumCy = TOP_BAR_HIT / 2;
  const onboardMenuCx = TOP_BAR_HIT / 2;
  const onboardMenuCy = TOP_BAR_HIT / 2;
  const onboardCardMidX = onboardOverlayW / 2;
  /** Share a moment: tip bottom offset so card bottom → 2px → triangle base → 11px → tip (see ONBOARD_TRIANGLE_H) */
  const step0TriangleTipBottom =
    insets.bottom +
    ONBOARD_STEP0_CARD_BOTTOM -
    ONBOARD_STEP0_GAP_CARD_TO_TRIANGLE -
    ONBOARD_TRIANGLE_H;
  const onboardAlbumGuide = computeCornerOnboardingGuide(
    onboardAlbumCx,
    onboardAlbumCy,
    onboardCardMidX,
    ONBOARD_STEP12_CARD_TOP,
    ONBOARD_CORNER_BTN_RADIUS,
    ONBOARD_GAP_COUPLE,
    ONBOARD_GAP_COUPLE
  );
  const onboardAlbumGuideAdjusted = {
    ...onboardAlbumGuide,
    tipX: onboardAlbumGuide.tipX + ONBOARD_STEP1_ARROW_OFFSET_X,
    tipY: onboardAlbumGuide.tipY + ONBOARD_STEP1_ARROW_OFFSET_Y,
  };
  const onboardMenuGuide = computeCornerOnboardingGuide(
    onboardMenuCx,
    onboardMenuCy,
    onboardCardMidX,
    ONBOARD_STEP12_CARD_TOP,
    ONBOARD_CORNER_BTN_RADIUS,
    ONBOARD_GAP_COUPLE,
    ONBOARD_GAP_COUPLE
  );
  const onboardMenuGuideAdjusted = {
    ...onboardMenuGuide,
    tipX: onboardMenuGuide.tipX + ONBOARD_STEP2_ARROW_OFFSET_X,
    tipY: onboardMenuGuide.tipY + ONBOARD_STEP2_ARROW_OFFSET_Y,
  };
  const onboardAlbumTriangleRot = onboardAlbumGuideAdjusted.rot;
  const onboardMenuTriangleRot = onboardMenuGuideAdjusted.rot;
  const onboardPulse = 3.5;
  const albumHypot =
    Math.hypot(
      onboardAlbumCx - onboardAlbumGuideAdjusted.tipX,
      onboardAlbumCy - onboardAlbumGuideAdjusted.tipY
    ) || 1;
  const menuHypot =
    Math.hypot(
      onboardMenuCx - onboardMenuGuideAdjusted.tipX,
      onboardMenuCy - onboardMenuGuideAdjusted.tipY
    ) || 1;
  const albumPulseDx = ((onboardAlbumCx - onboardAlbumGuideAdjusted.tipX) / albumHypot) * onboardPulse;
  const albumPulseDy = ((onboardAlbumCy - onboardAlbumGuideAdjusted.tipY) / albumHypot) * onboardPulse;
  const menuPulseDx = ((onboardMenuCx - onboardMenuGuideAdjusted.tipX) / menuHypot) * onboardPulse;
  const menuPulseDy = ((onboardMenuCy - onboardMenuGuideAdjusted.tipY) / menuHypot) * onboardPulse;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={
          mood === 'miserable' ? ['#E8E0D8', '#D5CCC4', '#C8BFB7'] :
          mood === 'sad' ? ['#EDE5DD', '#E0D6CC', '#D5CCC4'] :
          ['#FFF8F0', '#FAF0E6', '#F5E6D3']
        }
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.safeContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <Pressable
              style={styles.menuBtn}
              onPress={openMenu}
              testID="menu-button"
            >
              <Menu size={22} color={Colors.darkBrown} />
            </Pressable>
            <View style={styles.nameTag}>
              <Text style={styles.petNameText}>{petName}</Text>
              <Text style={styles.moodText}>{moodConfig.emoji} {t(getMoodLabelKey(mood))}</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            {IS_DEV && shouldShowFlashyNutritionButton && (
              <Animated.View
                style={[
                  styles.nutritionTopRightWrap,
                  {
                    transform: [
                      {
                        scale: nutritionFlashAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.08],
                        }),
                      },
                    ],
                    opacity: nutritionFlashAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.92, 1],
                    }),
                  },
                ]}
              >
                <Pressable
                  style={styles.nutritionTopRightButton}
                  onPress={handleNutritionAnalysis}
                  disabled={nutritionAnalysisLoading}
                >
                  {nutritionAnalysisLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.nutritionTopRightButtonText}>
                      {tLoose('pet.nutritionAnalysis.flashButton')}
                    </Text>
                  )}
                </Pressable>
              </Animated.View>
            )}
            <Pressable style={styles.albumBtn} onPress={handleAlbum} testID="album-button">
              <Images size={18} color="#FFF" />
            </Pressable>
            <View style={[styles.statBadge, styles.levelBadge]}>
              <Text style={styles.levelText}>{t('pet.levelShort', { level: String(level) })}</Text>
            </View>
          </View>
        </View>

        <View style={styles.barSection}>
          <Text style={styles.barLabel}>{t('pet.experienceToNextLevel')}</Text>
          <View style={styles.xpBarContainer}>
            <View style={styles.xpBarBg}>
              <Animated.View
                style={[styles.xpBarFill, { width: expProgressWidth }]}
              />
            </View>
            <Text style={styles.xpLabel}>XP</Text>
          </View>
        </View>

        <View style={styles.barSection}>
          <Text style={styles.barLabel}>{t('pet.happiness')}</Text>
          <View style={styles.happinessBarContainer}>
            <View style={styles.happinessBarBg}>
              <Animated.View
                style={[
                  styles.happinessBarFill,
                  {
                    width: progressWidth,
                    backgroundColor: moodConfig.color,
                  },
                ]}
              />
            </View>
            <Text style={styles.happinessLabel}>{Math.round(happiness)}%</Text>
          </View>
        </View>

        {userId && hasSupabaseConfig() && (
          <View style={styles.barSection}>
            <Text style={styles.barLabel}>{t('pet.todayCalories')}</Text>
            {todayPhotosLoading ? (
              <ActivityIndicator size="small" color={Colors.softOrange} style={styles.dailyLoading} />
            ) : (
              <>
                <View style={styles.dailyCalRow}>
                  <Text style={styles.dailyCalMain}>
                    {dailyNutrition.totalCalories} / {DAILY_CALORIE_GOAL_KCAL} kcal
                  </Text>
                  <Text style={styles.dailyCalSub}>
                    {t('pet.caloriesRemaining', {
                      count: Math.max(0, DAILY_CALORIE_GOAL_KCAL - dailyNutrition.totalCalories),
                    })}
                  </Text>
                </View>
                <Text style={styles.barLabel}>{t('pet.todayNutrition')}</Text>
                <Text style={styles.dailySectionHint}>{t('pet.todayNutritionHint')}</Text>
                {dailyNutrition.nutrientItemTypesToday.length > 0 ? (
                  <View style={styles.nutrientChipWrap}>
                    {dailyNutrition.nutrientItemTypesToday.map((t: number) => {
                      const { label, emoji } = formatNutrientChip(t);
                      return (
                        <View key={t} style={styles.nutrientChip}>
                          <Text style={styles.nutrientChipText} numberOfLines={1}>
                            {emoji} {label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.dailyMuted}>
                    {t('pet.nutritionEmpty')}
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        <View style={styles.petArea}>
          {floatingEmojis.map(({ id, emoji, x, anim }) => (
            <Animated.Text
              key={id}
              style={[
                styles.floatingEmoji,
                {
                  left: x - 15,
                  opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }),
                  transform: [
                    { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -120] }) },
                    { scale: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1.2, 0.8] }) },
                  ],
                },
              ]}
            >
              {emoji}
            </Animated.Text>
          ))}

          <Pressable onPress={handleTap} testID="pet-tap-area">
            <Animated.View
              style={[
                styles.petImageWrap,
                {
                  transform: [
                    { translateY: Animated.add(bounceAnim, idleTranslateY) },
                    { scale: petScale.interpolate({
                      inputRange: [0.88, 1],
                      outputRange: [0.88 * sadScale, sadScale],
                    })},
                  ],
                  opacity: sadOpacity,
                },
              ]}
            >
              {(mood === 'sad' || mood === 'miserable') && (
                <View style={styles.sadOverlay}>
                  <Text style={styles.sadTear}>{mood === 'miserable' ? '😭' : '😢'}</Text>
                </View>
              )}
              <PetPortrait
                petType={petType ?? 'mochi'}
                mood={mood}
                primaryColor={petPrimaryColor}
                style={styles.petImage}
              />
            </Animated.View>
          </Pressable>

          <View style={styles.shadowEllipse} />

          <Text style={styles.tapHint}>
            {mood === 'miserable'
              ? t('pet.tapHint.miserable')
              : mood === 'sad'
                ? t('pet.tapHint.sad')
                : t('pet.tapHint.default')}
          </Text>

          {IS_DEV && <View style={styles.colorThemeRow}>
            {[
              { label: 'Original', color: null },
              { label: 'Red',      color: '#E57373' },
              { label: 'Green',    color: '#81C784' },
              { label: 'Blue',     color: '#64B5F6' },
            ].map(({ label, color }) => {
              const isActive = petPrimaryColor === color;
              return (
                <Pressable
                  key={label}
                  onPress={() => setPetPrimaryColor(color)}
                  style={[
                    styles.colorThemeBtn,
                    isActive && styles.colorThemeBtnActive,
                    color ? { backgroundColor: color } : styles.colorThemeBtnOriginal,
                  ]}
                >
                  <Text style={[
                    styles.colorThemeBtnLabel,
                    isActive && styles.colorThemeBtnLabelActive,
                    !color && styles.colorThemeBtnLabelOriginal,
                  ]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>}
        </View>

        {justLeveledUp && (
          <Modal visible transparent animationType="none">
            <Pressable style={styles.levelUpOverlay} onPress={dismissLevelUp}>
              <Animated.View
                style={[
                  styles.levelUpCard,
                  {
                    opacity: levelUpOpacity,
                    transform: [{ scale: levelUpScale }],
                  },
                ]}
              >
                <Text style={styles.levelUpEmoji}>🎉</Text>
                <Text style={styles.levelUpTitle}>{t('pet.levelUpTitle')}</Text>
                <Text style={styles.levelUpSubtitle}>{t('pet.levelUpSubtitle', { level: String(level) })}</Text>
                <Text style={styles.levelUpTap}>{t('pet.tapToContinue')}</Text>
              </Animated.View>
            </Pressable>
          </Modal>
        )}

        <Modal visible={nutritionAnalysisVisible} transparent animationType="fade">
          <Pressable style={styles.levelUpOverlay} onPress={closeNutritionAnalysis}>
            <Pressable style={styles.nutritionModalCard} onPress={() => {}}>
              <Text style={styles.nutritionModalEmoji}>🥗</Text>
              <Text style={styles.nutritionModalTitle}>
                {tLoose('pet.nutritionAnalysis.modalTitle')}
              </Text>
              <Text style={styles.nutritionModalSubtitle}>
                {tLoose('pet.nutritionAnalysis.modalSubtitle', {
                  days: String(NUTRITION_ANALYSIS_DAYS),
                })}
              </Text>
              {nutritionAnalysisTimestamp && (
                <Text style={styles.nutritionModalMeta}>
                  {tLoose('pet.nutritionAnalysis.lastAnalyzedAt', {
                    time: nutritionAnalysisTimestamp,
                  })}
                </Text>
              )}

              {nutritionAnalysisLoading ? (
                <View style={styles.nutritionModalLoading}>
                  <ActivityIndicator size="small" color={Colors.softOrange} />
                  <Text style={styles.nutritionModalLoadingText}>
                    {tLoose('pet.nutritionAnalysis.analyzing')}
                  </Text>
                </View>
              ) : nutritionAnalysisError ? (
                <Text style={styles.nutritionModalError}>{nutritionAnalysisError}</Text>
              ) : nutritionAnalysisResult ? (
                <View style={styles.nutritionModalContent}>
                  <Text style={styles.nutritionModalBody}>
                    {nutritionAnalysisResult.summary}
                  </Text>

                  <Text style={styles.nutritionModalSectionTitle}>
                    {tLoose('pet.nutritionAnalysis.missingTitle')}
                  </Text>
                  {nutritionAnalysisResult.missingNutrients.length > 0 ? (
                    <View style={styles.nutrientChipWrap}>
                      {nutritionAnalysisResult.missingNutrients.map((slug) => {
                        const { emoji, name } = getNutrientDisplay(slug);
                        return (
                          <View key={slug} style={styles.nutrientChip}>
                            <Text style={styles.nutrientChipText}>
                              {emoji} {name}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.dailyMuted}>
                      {tLoose('pet.nutritionAnalysis.noMissing')}
                    </Text>
                  )}

                  {nutritionAnalysisResult.suggestions.length > 0 && (
                    <>
                      <Text style={styles.nutritionModalSectionTitle}>
                        {tLoose('pet.nutritionAnalysis.suggestionsTitle')}
                      </Text>
                      <View style={styles.nutritionSuggestionList}>
                        {nutritionAnalysisResult.suggestions.map((suggestion, index) => (
                          <Text key={`${suggestion}-${index}`} style={styles.nutritionSuggestionText}>
                            • {suggestion}
                          </Text>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              ) : null}

              <Pressable
                style={styles.nutritionModalCloseButton}
                onPress={closeNutritionAnalysis}
              >
                <Text style={styles.nutritionModalCloseButtonText}>
                  {tLoose('pet.nutritionAnalysis.close')}
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={menuOpen} transparent animationType="none">
          <View style={styles.menuBackdrop}>
            {/* Slide-in drawer */}
            <Animated.View
              style={[styles.menuDrawer, { transform: [{ translateX: menuSlideAnim }], paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
            >
              {/* Nav items */}
              <View style={styles.menuItemList}>
                <Pressable style={styles.menuItem} onPress={handleInventory}>
                  <Package size={20} color={Colors.darkBrown} />
                  <Text style={styles.menuItemText}>{t('pet.menu.badges')}</Text>
                </Pressable>
                {__DEV__ && (
                  <Pressable style={styles.menuItem} onPress={handleItems}>
                    <Star size={20} color={Colors.darkBrown} />
                    <Text style={styles.menuItemText}>{t('pet.menu.items')}</Text>
                  </Pressable>
                )}
                <Pressable style={styles.menuItem} onPress={handleStreak}>
                  <Flame size={20} color={Colors.darkBrown} />
                  <Text style={styles.menuItemText}>{t('pet.menu.streak')}</Text>
                </Pressable>
                <Pressable style={styles.menuItem} onPress={handleGroup}>
                  <Users size={20} color={Colors.darkBrown} />
                  <Text style={styles.menuItemText}>{t('pet.menu.partner')}</Text>
                </Pressable>
                <Pressable style={styles.menuItem} onPress={handleSettings}>
                  <Settings size={20} color={Colors.darkBrown} />
                  <Text style={styles.menuItemText}>
                    {t('pet.menu.settings', { defaultValue: 'Settings' })}
                  </Text>
                </Pressable>
                {IS_DEV && (
                  <Pressable style={styles.menuItem} onPress={handleRestartOnboardingDev} testID="dev-restart-onboarding">
                    <RotateCcw size={20} color={Colors.darkBrown} />
                    <Text style={styles.menuItemText}>{t('pet.menu.replayOnboarding')}</Text>
                  </Pressable>
                )}
              </View>

              {/* Bottom: username + logout */}
              <View style={styles.menuDrawerBottom}>
                {username ? (
                  <Text
                    style={styles.menuUsernameText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    @{username}
                  </Text>
                ) : null}
                <Pressable style={styles.menuLogoutBtn} onPress={handleLogOut}>
                  <LogOut size={18} color="#E53935" />
                  <Text style={styles.menuLogoutText}>{t('pet.menu.logOut')}</Text>
                </Pressable>
              </View>
            </Animated.View>

            {/* Tap backdrop to close */}
            <Pressable style={styles.menuBackdropTap} onPress={() => closeMenu()} />
          </View>
        </Modal>

        {/* ── Username prompt gate ───────────────────────────────────────────── */}
        <Modal visible={showUsernamePrompt} transparent animationType="fade">
          <View style={styles.levelUpOverlay}>
            <View style={styles.usernameModalCard}>
              <Text style={styles.usernameModalTitle}>
                {t('onboarding.chooseHandle')}
              </Text>
              <Text style={styles.usernameModalSubtitle}>
                {t('onboarding.handleSubtitle')}
              </Text>

              <View style={styles.handleInputRow}>
                <Text style={styles.handlePrefix}>@</Text>
                <TextInput
                  style={styles.handleInput}
                  value={usernameInput}
                  onChangeText={(v) => {
                    setUsernameInput(v.toLowerCase().replace(/[^a-z0-9._]/g, ''));
                    setUsernameAvailable(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="your_handle"
                  placeholderTextColor={Colors.brown + '66'}
                  maxLength={20}
                />
              </View>

              {checkingUsername && (
                <ActivityIndicator size="small" color={Colors.softOrange} style={{ marginTop: 6 }} />
              )}
              {!checkingUsername && usernameAvailable === true && (
                <Text style={[styles.handleStatus, styles.handleAvailableText]}>
                  {t('onboarding.handleAvailable')}
                </Text>
              )}
              {!checkingUsername && usernameAvailable === false && (
                <Text style={[styles.handleStatus, styles.handleTakenText]}>
                  {t('onboarding.handleTaken')}
                </Text>
              )}
              {!checkingUsername && usernameAvailable === null && usernameInput.length > 0 && (
                <Text style={styles.handleHintText}>
                  {t('onboarding.handleFormatHint')}
                </Text>
              )}

              <Pressable
                style={[
                  styles.usernameModalBtn,
                  (usernameAvailable !== true || savingUsername) && styles.usernameModalBtnDisabled,
                ]}
                onPress={handleSaveUsername}
                disabled={usernameAvailable !== true || savingUsername}
              >
                {savingUsername
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={styles.usernameModalBtnText}>{t('onboarding.letsGo')}</Text>
                }
              </Pressable>

              <Pressable
                style={styles.usernameSkipBtn}
                onPress={() => {
                  setUsernamePromptDismissed();
                  setUsernamePromptSkipped(true);
                }}
              >
                <Text style={styles.usernameSkipText}>{t('onboarding.skipForNow')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <View style={styles.bottomActions}>
          <Pressable
            style={[styles.actionBtn, styles.groupBtn]}
            onPress={handleGroup}
            testID="group-button"
          >
            <Users size={22} color={Colors.darkBrown} />
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.cameraBtn]}
            onPress={handleCamera}
            testID="camera-button"
          >
            <Camera size={24} color="#FFF" />
            <Text style={styles.actionBtnText}>{t('pet.ctaShareMoment')}</Text>
          </Pressable>
        </View>

        {onboardingStep >= 0 && onboardingStep <= 2 && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <View
              style={[
                styles.onboardingCard,
                onboardingStep === 0 && {
                  position: 'absolute' as const,
                  bottom: insets.bottom + ONBOARD_STEP0_CARD_BOTTOM,
                  left: 20,
                  right: 20,
                },
                onboardingStep === 1 && {
                  position: 'absolute' as const,
                  top: ONBOARD_STEP12_CARD_TOP,
                  left: 20,
                  right: 20,
                },
                onboardingStep === 2 && {
                  position: 'absolute' as const,
                  top: ONBOARD_STEP12_CARD_TOP,
                  left: 20,
                  right: 20,
                },
              ]}
            >
              <Text style={styles.onboardingEmoji}>
                {onboardingStep === 0 ? '📸' : onboardingStep === 1 ? '🖼️' : '🏅'}
              </Text>
              <Text style={styles.onboardingTitle}>
                {onboardingStep === 0
                  ? t('pet.onboarding.shareTitle')
                  : onboardingStep === 1
                    ? t('pet.onboarding.albumTitle')
                    : t('pet.onboarding.badgesTitle')}
              </Text>
              <Text style={styles.onboardingHint}>
                {onboardingStep === 0
                  ? t('pet.onboarding.shareHint')
                  : onboardingStep === 1
                    ? t('pet.onboarding.albumHint')
                    : t('pet.onboarding.badgesHint')}
              </Text>
            </View>

            <View style={styles.onboardingArrowLayer} pointerEvents="none">
              {onboardingStep === 0 && (
                <Animated.View
                  style={[
                    styles.onboardingArrowAnchorBottom,
                    {
                      bottom: step0TriangleTipBottom,
                      transform: [
                        {
                          translateY: onboardingArrowPulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 5],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <OnboardingTriangleDown color={Colors.softOrange} />
                </Animated.View>
              )}
              {onboardingStep === 1 && (
                <Animated.View
                  style={[
                    styles.onboardingTriangleDirected,
                    {
                      left: onboardAlbumGuideAdjusted.tipX - ONBOARD_TRIANGLE_HALF_W,
                      top: onboardAlbumGuideAdjusted.tipY - ONBOARD_TRIANGLE_H,
                      transform: [
                        {
                          translateX: onboardingArrowPulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, albumPulseDx],
                          }),
                        },
                        {
                          translateY: onboardingArrowPulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, albumPulseDy],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.onboardingTriangleDirected,
                      {
                        transformOrigin: `${ONBOARD_TRIANGLE_HALF_W}px ${ONBOARD_TRIANGLE_H}px`,
                        transform: [{ rotate: `${onboardAlbumTriangleRot}deg` }],
                      },
                    ]}
                  >
                    <OnboardingTriangleDown color={Colors.softOrange} />
                  </View>
                </Animated.View>
              )}
              {onboardingStep === 2 && (
                <Animated.View
                  style={[
                    styles.onboardingTriangleDirected,
                    {
                      left: onboardMenuGuideAdjusted.tipX - ONBOARD_TRIANGLE_HALF_W,
                      top: onboardMenuGuideAdjusted.tipY - ONBOARD_TRIANGLE_H,
                      transform: [
                        {
                          translateX: onboardingArrowPulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, menuPulseDx],
                          }),
                        },
                        {
                          translateY: onboardingArrowPulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, menuPulseDy],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.onboardingTriangleDirected,
                      {
                        transformOrigin: `${ONBOARD_TRIANGLE_HALF_W}px ${ONBOARD_TRIANGLE_H}px`,
                        transform: [{ rotate: `${onboardMenuTriangleRot}deg` }],
                      },
                    ]}
                  >
                    <OnboardingTriangleDown color={Colors.softOrange} />
                  </View>
                </Animated.View>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 8,
  },
  topBarLeft: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  nameTag: {
    flex: 1,
  },
  petNameText: {
    fontSize: 26,
    fontWeight: '800' as const,
    color: Colors.darkBrown,
  },
  moodText: {
    fontSize: 14,
    color: Colors.brown,
    marginTop: 2,
    opacity: 0.8,
  },
  statsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  nutritionTopRightWrap: {
    alignSelf: 'center' as const,
  },
  nutritionTopRightButton: {
    backgroundColor: Colors.softGreen,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 34,
    justifyContent: 'center' as const,
    shadowColor: Colors.softGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  nutritionTopRightButtonText: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: '#FFF',
  },
  albumBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.softOrange,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    shadowColor: Colors.softOrange,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  statBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.darkBrown,
  },
  levelBadge: {
    backgroundColor: Colors.caramel,
  },
  levelText: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: '#FFF',
  },
  barSection: {
    marginBottom: 8,
  },
  barLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.brown,
    marginBottom: 4,
    opacity: 0.9,
  },
  dailySectionHint: {
    fontSize: 12,
    color: Colors.brown,
    opacity: 0.78,
    marginBottom: 8,
    lineHeight: 16,
  },
  xpBarContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 6,
  },
  xpBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 3,
    overflow: 'hidden' as const,
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: Colors.caramel,
    borderRadius: 3,
  },
  xpLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.brown,
    width: 24,
    textAlign: 'right' as const,
  },
  happinessBarContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 8,
  },
  happinessBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 5,
    overflow: 'hidden' as const,
  },
  happinessBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  happinessLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.brown,
    width: 36,
    textAlign: 'right' as const,
  },
  dailyLoading: {
    alignSelf: 'flex-start' as const,
    marginVertical: 8,
  },
  dailyCalRow: {
    marginBottom: 8,
  },
  dailyCalMain: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.darkBrown,
  },
  dailyCalSub: {
    fontSize: 12,
    color: Colors.brown,
    marginTop: 2,
    opacity: 0.85,
  },
  nutrientChipWrap: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginBottom: 8,
  },
  nutrientChip: {
    backgroundColor: 'rgba(232, 152, 94, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    maxWidth: '100%',
  },
  nutrientChipText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.darkBrown,
  },
  dailyMuted: {
    fontSize: 12,
    color: Colors.brown,
    opacity: 0.75,
    marginBottom: 4,
    lineHeight: 17,
  },
  petArea: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  petImageWrap: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.6,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  petImage: {
    width: '100%',
    height: '100%',
  },
  sadOverlay: {
    position: 'absolute' as const,
    top: -10,
    right: 10,
    zIndex: 10,
  },
  sadTear: {
    fontSize: 28,
  },
  shadowEllipse: {
    width: SCREEN_WIDTH * 0.35,
    height: 16,
    backgroundColor: 'rgba(92, 61, 46, 0.08)',
    borderRadius: 100,
    marginTop: -8,
  },
  tapHint: {
    fontSize: 14,
    color: Colors.brown,
    opacity: 0.5,
    marginTop: 16,
  },
  colorThemeRow: {
    flexDirection: 'row' as const,
    gap: 8,
    marginTop: 14,
  },
  colorThemeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorThemeBtnActive: {
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  colorThemeBtnOriginal: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderColor: 'rgba(212,165,116,0.4)',
  },
  colorThemeBtnLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  colorThemeBtnLabelActive: {
    fontWeight: '700' as const,
  },
  colorThemeBtnLabelOriginal: {
    color: Colors.darkBrown,
  },
  floatingEmoji: {
    position: 'absolute' as const,
    fontSize: 28,
    zIndex: 100,
  },
  bottomActions: {
    paddingTop: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
    paddingVertical: 16,
    borderRadius: 18,
  },
  groupBtn: {
    width: 54,
    flexShrink: 0,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1.5,
    borderColor: Colors.beige,
  },
  cameraBtn: {
    flex: 1,
    backgroundColor: Colors.softOrange,
    shadowColor: Colors.softOrange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  levelUpOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  nutritionModalCard: {
    width: '86%',
    maxWidth: 360,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  nutritionModalEmoji: {
    fontSize: 42,
    textAlign: 'center' as const,
    marginBottom: 10,
  },
  nutritionModalTitle: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.darkBrown,
    textAlign: 'center' as const,
  },
  nutritionModalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.brown,
    textAlign: 'center' as const,
    marginTop: 8,
  },
  nutritionModalMeta: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.brown,
    opacity: 0.78,
    textAlign: 'center' as const,
  },
  nutritionModalLoading: {
    paddingVertical: 28,
    alignItems: 'center' as const,
    gap: 10,
  },
  nutritionModalLoadingText: {
    fontSize: 14,
    color: Colors.brown,
    fontWeight: '600' as const,
  },
  nutritionModalContent: {
    marginTop: 18,
    gap: 12,
  },
  nutritionModalBody: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.darkBrown,
  },
  nutritionModalSectionTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.darkBrown,
  },
  nutritionSuggestionList: {
    gap: 8,
  },
  nutritionSuggestionText: {
    fontSize: 14,
    lineHeight: 19,
    color: Colors.brown,
  },
  nutritionModalError: {
    marginTop: 18,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.brown,
    textAlign: 'center' as const,
  },
  nutritionModalCloseButton: {
    marginTop: 18,
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: Colors.softOrange,
    alignItems: 'center' as const,
  },
  nutritionModalCloseButtonText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  levelUpCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center' as const,
    minWidth: 260,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  levelUpEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  levelUpTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.darkBrown,
    marginBottom: 8,
  },
  levelUpSubtitle: {
    fontSize: 16,
    color: Colors.brown,
    marginBottom: 16,
  },
  levelUpTap: {
    fontSize: 13,
    color: Colors.softOrange,
    fontWeight: '600' as const,
  },
  menuBackdrop: {
    flex: 1,
    flexDirection: 'row' as const,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  menuDrawer: {
    width: 200,
    backgroundColor: '#FFFAF5',
    flexDirection: 'column' as const,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  menuItemList: {
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 24,
    fontWeight: '600' as const,
    color: Colors.darkBrown,
  },
  menuDrawerBottom: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,165,116,0.25)',
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 10,
  },
  menuUsernameText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.brown,
  },
  menuLogoutBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(229,57,53,0.08)',
  },
  menuLogoutText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#E53935',
  },
  menuBackdropTap: {
    flex: 1,
  },
  onboardingCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  onboardingEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  onboardingTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.darkBrown,
    textAlign: 'center' as const,
    marginBottom: 8,
  },
  onboardingHint: {
    fontSize: 14,
    color: Colors.brown,
    opacity: 0.8,
    textAlign: 'center' as const,
  },
  onboardingArrowLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  /* Pin the icon so the arrowhead sits at the box corner aimed at the target */
  onboardingArrowAnchorBottom: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
  },
  onboardingTriangleDirected: {
    position: 'absolute' as const,
    width: 18,
    height: 11,
  },
  usernameModalCard: {
    width: '86%',
    maxWidth: 360,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'stretch' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  usernameModalTitle: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.darkBrown,
    textAlign: 'center' as const,
    marginBottom: 6,
  },
  usernameModalSubtitle: {
    fontSize: 14,
    color: Colors.brown,
    textAlign: 'center' as const,
    marginBottom: 20,
    lineHeight: 20,
  },
  handleInputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: 1.5,
    borderColor: Colors.beige,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFF9F4',
    marginBottom: 8,
  },
  handlePrefix: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.brown,
    marginRight: 2,
  },
  handleInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.darkBrown,
    paddingVertical: 12,
  },
  handleStatus: {
    fontSize: 13,
    fontWeight: '600' as const,
    marginBottom: 12,
  },
  handleAvailableText: {
    color: '#34A853',
  },
  handleTakenText: {
    color: '#EA4335',
  },
  handleHintText: {
    fontSize: 12,
    color: Colors.brown,
    opacity: 0.7,
    marginBottom: 12,
  },
  usernameModalBtn: {
    backgroundColor: Colors.softOrange,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center' as const,
    marginTop: 12,
  },
  usernameModalBtnDisabled: {
    opacity: 0.45,
  },
  usernameModalBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  usernameSkipBtn: {
    alignItems: 'center' as const,
    paddingVertical: 12,
    marginTop: 4,
  },
  usernameSkipText: {
    fontSize: 14,
    color: Colors.brown,
    textDecorationLine: 'underline' as const,
    opacity: 0.7,
  },
});

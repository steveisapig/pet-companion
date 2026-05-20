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
  PanResponder,
  ScrollView,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, router } from 'expo-router';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Polygon } from 'react-native-svg';
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
  Target,
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
  getDailyCalorieGoalKcal,
  getDailyCalorieDirection,
} from '@/lib/onboarding-storage';
import { fetchAllUserStreakDates, computeStreakLengthFromDates } from '@/lib/user-streak';
import { getMyPartnership, getPartnershipStreak, getMyPendingInvites } from '@/lib/partnerships';

const IS_DEV = Constants.expoConfig?.extra?.IS_DEV === true;

const DEV_SCENARIOS: { label: string; demo: string }[] = [
  { label: '❤️  Success: Loved (10/10)',      demo: 'loved' },
  { label: '😊  Success: Liked a lot (8/10)',  demo: 'liked_alot' },
  { label: '🙂  Success: Liked (5/10)',         demo: 'liked' },
  { label: '😐  Success: Disliked (2/10)',      demo: 'disliked' },
];

const hasSupabaseConfig = () =>
  !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Onboarding pointer targets (see pet screen layout):
 * - Camera: `bottomActions` → full-width `actionBtn` + `cameraBtn` (Share a Moment).
 * - Album: `statsRow` → `albumBtn` (36×36), first control before level badge + gap.
 * - Menu: `topBarLeft` → `menuBtn` (36×36), first control.
 */
const TOP_BAR_HIT = 36;
const SPOTLIGHT_PAD = 12;
/** borderRadius per onboarding step: [camera, album, menu, group] */
const STEP_BUTTON_RADIUS = [18, 18, 18, 18];
/** Group button center X for the step-3 onboarding arrow */
const ONBOARD_GROUP_BTN_CENTER_X = 20 + 54 / 2;

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const cr = Math.min(r, w / 2, h / 2);
  return [
    `M ${x + cr} ${y}`,
    `H ${x + w - cr}`,
    `A ${cr} ${cr} 0 0 1 ${x + w} ${y + cr}`,
    `V ${y + h - cr}`,
    `A ${cr} ${cr} 0 0 1 ${x + w - cr} ${y + h}`,
    `H ${x + cr}`,
    `A ${cr} ${cr} 0 0 1 ${x} ${y + h - cr}`,
    `V ${y + cr}`,
    `A ${cr} ${cr} 0 0 1 ${x + cr} ${y}`,
    'Z',
  ].join(' ');
}
/** Step 0 hint card — smaller bottom = card lower on screen */
const ONBOARD_STEP0_CARD_BOTTOM = 100;
/** Pixels between card bottom edge and triangle base (Share a moment step) */
const ONBOARD_STEP0_GAP_CARD_TO_TRIANGLE = 2;
/** Down-pointing triangle SVG height (tip at bottom) */
const ONBOARD_TRIANGLE_H = 11;
const ONBOARD_TRIANGLE_HALF_W = 9;
/** Steps 1–2: white card top (overlay y; below safeContent paddingTop) */
const ONBOARD_STEP12_CARD_TOP = 144;

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
    level, justLeveledUp, clearLevelUp,
    petPrimaryColor,
    setPetPrimaryColor,
    username,
    devResetToFirstLaunch,
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

  const { data: allStreakDates = [], refetch: refetchStreakDates } = useQuery({
    queryKey: ['userStreakAll', userId],
    queryFn: () => fetchAllUserStreakDates(userId!),
    enabled: !!userId && hasSupabaseConfig(),
    staleTime: 60_000,
  });

  useFocusEffect(
    useCallback(() => {
      getDailyCalorieGoalKcal().then(setCalorieGoal);
      getDailyCalorieDirection().then(setCalorieDirection);
      if (userId && hasSupabaseConfig()) {
        refetchTodayPhotos();
        refetchRecentNutritionPhotos();
        refetchStreakDates();
      }
    }, [userId, refetchTodayPhotos, refetchRecentNutritionPhotos, refetchStreakDates])
  );

  const dailyNutrition = useMemo(
    () => aggregateDailyNutrition(todayPhotos ?? []),
    [todayPhotos]
  );
  const recentPhotoCount = recentNutritionPhotos?.length ?? 0;
  const canRunNutritionAnalysis =
    recentPhotoCount >= NUTRITION_ANALYSIS_REQUIRED_PHOTOS;
  const { signOut, session } = useAuth();
  const { step: onboardingStep, advanceStep, startOnboarding, devRestartOnboarding } = useOnboarding();

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

  const personalStreak = useMemo(
    () => computeStreakLengthFromDates(allStreakDates),
    [allStreakDates],
  );

  const { data: petPagePartnership } = useQuery({
    queryKey: ['myPartnership', userId],
    queryFn: () => getMyPartnership(userId!),
    enabled: !!userId && hasSupabaseConfig(),
    staleTime: 60_000,
  });

  const { data: partnershipStreak = 0 } = useQuery({
    queryKey: ['partnershipStreak', petPagePartnership?.id],
    queryFn: () => getPartnershipStreak(petPagePartnership!.id),
    enabled: !!petPagePartnership?.id,
    staleTime: 60_000,
  });

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ['pendingInvites', userId],
    queryFn: () => getMyPendingInvites(userId!),
    enabled: !!userId,
    staleTime: 30_000,
  });
  const incomingInviteCount = pendingInvites.filter((i) => i.direction === 'incoming').length;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cameraButtonRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const albumButtonRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const menuButtonRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupButtonRef = useRef<any>(null);
  const [spotlightRect, setSpotlightRect] = useState<{ x: number; y: number; w: number; h: number; r: number } | null>(null);

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const petScale = useRef(new Animated.Value(1)).current;
  const idleAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const calorieProgressAnim = useRef(new Animated.Value(0)).current;
  const levelUpScale = useRef(new Animated.Value(0)).current;
  const levelUpOpacity = useRef(new Animated.Value(0)).current;
  const onboardingArrowPulse = useRef(new Animated.Value(0)).current;
  const nutritionFlashAnim = useRef(new Animated.Value(0)).current;
  const menuSlideAnim = useRef(new Animated.Value(-180)).current;
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; x: number; anim: Animated.Value }[]>([]);
  const [calorieGoal, setCalorieGoal] = useState(DAILY_CALORIE_GOAL_KCAL);
  const [calorieDirection, setCalorieDirection] = useState<'above' | 'below'>('below');
  const [menuOpen, setMenuOpen] = useState(false);
  const [devMenuVisible, setDevMenuVisible] = useState(false);
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
    const ratio = calorieGoal > 0 ? Math.min(dailyNutrition.totalCalories / calorieGoal, 1) : 0;
    Animated.timing(calorieProgressAnim, {
      toValue: ratio,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [dailyNutrition.totalCalories, calorieGoal, calorieProgressAnim]);

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
    if (onboardingStep < 0 || onboardingStep > 3) return;
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

  const measureSpotlight = useCallback((step: number) => {
    if (step < 0 || step > 3) { setSpotlightRect(null); return () => {}; }
    const refs = [cameraButtonRef, albumButtonRef, menuButtonRef, groupButtonRef];
    const id = setTimeout(() => {
      refs[step].current?.measureInWindow((x: number, y: number, w: number, h: number) => {
        if (w > 0 && h > 0) setSpotlightRect({ x, y, w, h, r: STEP_BUTTON_RADIUS[step] + SPOTLIGHT_PAD });
      });
    }, 100);
    return () => clearTimeout(id);
  }, [cameraButtonRef, albumButtonRef, menuButtonRef, groupButtonRef]);

  useEffect(() => {
    return measureSpotlight(onboardingStep);
  }, [onboardingStep, measureSpotlight]);

  useFocusEffect(useCallback(() => {
    return measureSpotlight(onboardingStep);
  }, [onboardingStep, measureSpotlight]));

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
    if (onboardingStep === 2) advanceStep();
  }, [menuSlideAnim, onboardingStep, advanceStep]);

  const closeMenu = useCallback((onDone?: () => void) => {
    Animated.timing(menuSlideAnim, { toValue: -180, duration: 200, useNativeDriver: true })
      .start(() => {
        setMenuOpen(false);
        onDone?.();
      });
  }, [menuSlideAnim]);

  const openMenuRef = useRef(openMenu);
  useEffect(() => { openMenuRef.current = openMenu; }, [openMenu]);
  const edgePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dx > 8 && Math.abs(gs.dy) < 40 && gs.moveX < 40,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 30) openMenuRef.current();
      },
    }),
  ).current;

  const handleInventory = useCallback(async () => {
    closeMenu();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/inventory');
  }, [closeMenu]);

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
    if (onboardingStep === 3) advanceStep();
    closeMenu(() => router.navigate('/group'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [closeMenu, onboardingStep, advanceStep]);

  const handleGoals = useCallback(() => {
    closeMenu(() => router.push('/goals'));
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

  const calorieProgressWidth = calorieProgressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });
  const calorieBarColor = (() => {
    const ratio = calorieGoal > 0 ? dailyNutrition.totalCalories / calorieGoal : 0;
    if (calorieDirection === 'above') {
      if (ratio >= 1)    return '#43A047';
      if (ratio >= 0.75) return '#FFA000';
      return '#E53935';
    } else {
      if (dailyNutrition.totalCalories > calorieGoal) return '#E53935';
      if (ratio >= 0.75) return '#43A047';
      return '#FFA000';
    }
  })();

  const happinessBarColor = (() => {
    if (happiness >= 70) return '#43A047';
    if (happiness >= 40) return '#FFA000';
    return '#E53935';
  })();

  /** Share a moment: tip bottom offset so card bottom → 2px → triangle base → 11px → tip (see ONBOARD_TRIANGLE_H) */
  const step0TriangleTipBottom =
    insets.bottom +
    ONBOARD_STEP0_CARD_BOTTOM -
    ONBOARD_STEP0_GAP_CARD_TO_TRIANGLE -
    ONBOARD_TRIANGLE_H;

  return (
    <View style={styles.container} {...edgePanResponder.panHandlers}>
      {(personalStreak > 0 || partnershipStreak > 0 || incomingInviteCount > 0) && (
        <View style={styles.streakSidebar} pointerEvents="box-none">
          {personalStreak > 0 && (
            <Pressable style={styles.streakPill} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/streak'); }}>
              <Text style={styles.streakPillEmoji}>🔥</Text>
              <Text style={styles.streakPillCount}>{personalStreak}</Text>
            </Pressable>
          )}
          {partnershipStreak > 0 && (
            <Pressable style={styles.streakPill} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.navigate('/group'); }}>
              <Text style={styles.streakPillEmoji}>🤝</Text>
              <Text style={styles.streakPillCount}>{partnershipStreak}</Text>
            </Pressable>
          )}
          {incomingInviteCount > 0 && (
            <Pressable style={[styles.streakPill, styles.invitePill]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.navigate({ pathname: '/group', params: { openInvites: '1' } }); }}>
              <Text style={styles.streakPillEmoji}>💌</Text>
              <Text style={styles.streakPillCount}>{incomingInviteCount}</Text>
            </Pressable>
          )}
        </View>
      )}
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
              ref={menuButtonRef}
              style={styles.menuBtn}
              onPress={openMenu}
              testID="menu-button"
            >
              <Menu size={18} color="#FFF" />
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
            <Pressable ref={albumButtonRef} style={styles.albumBtn} onPress={handleAlbum} testID="album-button">
              <Images size={22} color="#FFF" />
            </Pressable>
          </View>
        </View>

        {IS_DEV && (
          <Pressable
            style={[styles.devBtn, { position: 'absolute', top: insets.top + 14, alignSelf: 'center' }]}
            onPress={() => setDevMenuVisible(true)}
          >
            <Text style={styles.devBtnText}>DEV</Text>
          </Pressable>
        )}

        <View style={styles.barSection}>
          <View style={styles.barLabelRow}>
            <Text style={styles.barLabel}>{t('pet.happiness')}</Text>
            <Text style={styles.barLabelValue}>{Math.round(happiness)}%</Text>
          </View>
          <View style={styles.happinessBarBg}>
            <Animated.View
              style={[styles.happinessBarFill, { width: progressWidth, backgroundColor: happinessBarColor }]}
            />
          </View>
        </View>

        {userId && hasSupabaseConfig() && (
          <View style={styles.barSection}>
            <Text style={styles.barLabel}>{t('pet.todayCalories')}</Text>
            {todayPhotosLoading ? (
              <ActivityIndicator size="small" color={Colors.softOrange} style={styles.dailyLoading} />
            ) : (
              <>
                <View style={styles.barLabelRow}>
                  <Text style={styles.calorieEaten}>{dailyNutrition.totalCalories} <Text style={styles.calorieUnit}>{t('pet.kcalEaten')}</Text></Text>
                  {(() => {
                    const cal = dailyNutrition.totalCalories;
                    const remaining = calorieGoal - cal;
                    if (calorieDirection === 'below') {
                      return remaining > 0
                        ? <Text style={styles.calorieGoalText}>{t('pet.caloriesRemaining', { count: remaining })}</Text>
                        : <Text style={[styles.calorieGoalText, { color: '#E53935' }]}>{t('pet.caloriesOver', { count: cal - calorieGoal })}</Text>;
                    } else {
                      return cal >= calorieGoal
                        ? <Text style={[styles.calorieGoalText, { color: '#43A047' }]}>{t('pet.calorieGoalReached')}</Text>
                        : <Text style={styles.calorieGoalText}>{t('pet.caloriesToGo', { count: remaining })}</Text>;
                    }
                  })()}
                </View>
                <View style={styles.happinessBarBg}>
                  <Animated.View
                    style={[styles.happinessBarFill, { width: calorieProgressWidth, backgroundColor: calorieBarColor }]}
                  />
                </View>
                <Text style={[styles.barLabel, { marginTop: 14 }]}>{t('pet.todayNutrition')}</Text>
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
            {t(`pet.tapHint.${mood}`)}
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

        {IS_DEV && (
          <Modal visible={devMenuVisible} transparent animationType="fade" onRequestClose={() => setDevMenuVisible(false)}>
            <Pressable style={styles.devModalOverlay} onPress={() => setDevMenuVisible(false)}>
              <View style={styles.devModalCard}>
                <Text style={styles.devModalTitle}>🛠 Dev Mode</Text>
                <ScrollView style={styles.devModalScroll} showsVerticalScrollIndicator={false}>
                  {DEV_SCENARIOS.map(({ label, demo }) => (
                    <Pressable
                      key={demo}
                      style={styles.devModalItem}
                      onPress={() => { setDevMenuVisible(false); router.push(`/camera?demo=${demo}` as any); }}
                    >
                      <Text style={styles.devModalItemText}>{label}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    style={[styles.devModalItem, { marginTop: 8, backgroundColor: 'rgba(255,0,100,0.07)' }]}
                    onPress={() => { setDevMenuVisible(false); devRestartOnboarding(); }}
                  >
                    <Text style={styles.devModalItemText}>🔄  Restart onboarding (ephemeral)</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.devModalItem, { backgroundColor: 'rgba(255,0,100,0.07)' }]}
                    onPress={() => { setDevMenuVisible(false); devResetToFirstLaunch(); router.replace('/onboarding'); }}
                  >
                    <Text style={styles.devModalItemText}>🐣  Restart first launch (ephemeral)</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.devModalItem, { backgroundColor: 'rgba(0,100,255,0.07)' }]}
                    onPress={async () => {
                      try {
                        await Notifications.requestPermissionsAsync();
                        setDevMenuVisible(false);
                        // Background the app, then come back — notification fires immediately on return.
                        // Uses same content + data payload as notify-partner-photo edge function.
                        await Notifications.scheduleNotificationAsync({
                          content: {
                            title: '@devpartner shared a meal! 🍽️',
                            body: 'Tap to see what they ate.',
                            sound: true,
                            data: { screen: 'group' },
                          },
                          trigger: {
                            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                            seconds: 3,
                            repeats: false,
                          },
                        });
                      } catch (e) {
                        Alert.alert('Notification Error', String(e));
                      }
                    }}
                  >
                    <Text style={styles.devModalItemText}>🔔  Simulate partner notification</Text>
                  </Pressable>
                </ScrollView>
              </View>
            </Pressable>
          </Modal>
        )}

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
                {IS_DEV && (
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
                <Pressable style={styles.menuItem} onPress={handleGoals}>
                  <Target size={20} color={Colors.darkBrown} />
                  <Text style={styles.menuItemText}>{t('pet.menu.goals')}</Text>
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
            ref={groupButtonRef}
            style={[styles.actionBtn, styles.groupBtn]}
            onPress={handleGroup}
            testID="group-button"
          >
            <Users size={22} color={Colors.darkBrown} />
          </Pressable>
          <Pressable
            ref={cameraButtonRef}
            style={[styles.actionBtn, styles.cameraBtn]}
            onPress={handleCamera}
            testID="camera-button"
          >
            <Camera size={24} color="#FFF" />
            <Text style={styles.actionBtnText}>{t('pet.ctaShareMoment')}</Text>
          </Pressable>
        </View>

        {onboardingStep >= 0 && onboardingStep <= 3 && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {spotlightRect && (() => {
              const sx = Math.max(0, spotlightRect.x - SPOTLIGHT_PAD);
              const sy = Math.max(0, spotlightRect.y - SPOTLIGHT_PAD);
              const sw = spotlightRect.w + SPOTLIGHT_PAD * 2;
              const sh = spotlightRect.h + SPOTLIGHT_PAD * 2;
              const d = `M 0 0 H ${SCREEN_WIDTH} V ${SCREEN_HEIGHT} H 0 Z ${roundedRectPath(sx, sy, sw, sh, spotlightRect.r)}`;
              return (
                <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={StyleSheet.absoluteFill}>
                  <Path fillRule="evenodd" fill="rgba(0,0,0,0.65)" d={d} />
                </Svg>
              );
            })()}
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
                onboardingStep === 3 && {
                  position: 'absolute' as const,
                  bottom: insets.bottom + ONBOARD_STEP0_CARD_BOTTOM,
                  left: 20,
                  right: 20,
                },
              ]}
            >
              <Text style={styles.onboardingEmoji}>
                {onboardingStep === 0 ? '📸' : onboardingStep === 1 ? '🖼️' : onboardingStep === 2 ? '⚙️' : '🤝'}
              </Text>
              <Text style={styles.onboardingTitle}>
                {onboardingStep === 0
                  ? t('pet.onboarding.shareTitle')
                  : onboardingStep === 1
                    ? t('pet.onboarding.albumTitle')
                    : onboardingStep === 2
                      ? t('pet.onboarding.badgesTitle')
                      : t('pet.onboarding.partnerTitle')}
              </Text>
              <Text style={styles.onboardingHint}>
                {onboardingStep === 0
                  ? t('pet.onboarding.shareHint')
                  : onboardingStep === 1
                    ? t('pet.onboarding.albumHint')
                    : onboardingStep === 2
                      ? t('pet.onboarding.badgesHint')
                      : t('pet.onboarding.partnerHint')}
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
              {onboardingStep === 1 && spotlightRect && (
                <Animated.View
                  style={{
                    position: 'absolute' as const,
                    top: spotlightRect.y + spotlightRect.h + SPOTLIGHT_PAD + 2,
                    left: spotlightRect.x + spotlightRect.w / 2 - ONBOARD_TRIANGLE_HALF_W,
                    transform: [
                      { rotate: '180deg' },
                      {
                        translateY: onboardingArrowPulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -5],
                        }),
                      },
                    ],
                  }}
                >
                  <OnboardingTriangleDown color={Colors.softOrange} />
                </Animated.View>
              )}
              {onboardingStep === 2 && spotlightRect && (
                <Animated.View
                  style={{
                    position: 'absolute' as const,
                    top: spotlightRect.y + spotlightRect.h + SPOTLIGHT_PAD + 2,
                    left: spotlightRect.x + spotlightRect.w / 2 - ONBOARD_TRIANGLE_HALF_W,
                    transform: [
                      { rotate: '180deg' },
                      {
                        translateY: onboardingArrowPulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -5],
                        }),
                      },
                    ],
                  }}
                >
                  <OnboardingTriangleDown color={Colors.softOrange} />
                </Animated.View>
              )}
              {onboardingStep === 3 && (
                <Animated.View
                  style={{
                    position: 'absolute' as const,
                    bottom: step0TriangleTipBottom,
                    left: ONBOARD_GROUP_BTN_CENTER_X - ONBOARD_TRIANGLE_HALF_W,
                    transform: [{
                      translateY: onboardingArrowPulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 5],
                      }),
                    }],
                  }}
                >
                  <OnboardingTriangleDown color={Colors.softOrange} />
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
    backgroundColor: 'rgba(211, 211, 211)',
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
    width: 48,
    height: 48,
    borderRadius: 24,
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
  barLabelRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    marginBottom: 4,
  },
  barLabelValue: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.brown,
  },
  calorieEaten: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.darkBrown,
  },
  calorieUnit: {
    fontSize: 11,
    fontWeight: '500' as const,
    color: Colors.brown,
  },
  calorieGoalText: {
    fontSize: 11,
    fontWeight: '500' as const,
    color: Colors.brown,
    opacity: 0.7,
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
    width: 44,
    textAlign: 'right' as const,
  },
  happinessBarContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 8,
  },
  happinessBarBg: {
    width: '100%' as const,
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
  streakSidebar: {
    position: 'absolute' as const,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center' as const,
    gap: 8,
    zIndex: 10,
  },
  streakPill: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 8,
    alignItems: 'center' as const,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  streakPillEmoji: {
    fontSize: 18,
  },
  streakPillCount: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.darkBrown,
    marginTop: 2,
  },
  invitePill: {
    backgroundColor: 'rgba(255, 235, 240, 0.92)',
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
  // ── dev mode ────────────────────────────────────────────────────────────────
  devBtn: {
    backgroundColor: 'rgba(255,0,100,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,0,100,0.35)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  devBtnText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: 'rgb(200,0,80)',
    letterSpacing: 0.5,
  },
  devModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 32,
  },
  devModalCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    width: '100%' as const,
    gap: 4,
  },
  devModalScroll: {
    maxHeight: 420,
  },
  devModalTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.darkBrown,
    marginBottom: 12,
    textAlign: 'center' as const,
  },
  devModalItem: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(232,152,94,0.08)',
    marginBottom: 4,
  },
  devModalItemText: {
    fontSize: 14,
    color: Colors.darkBrown,
    fontWeight: '500' as const,
  },
});

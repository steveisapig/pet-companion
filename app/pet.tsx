import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Animated,
  Dimensions,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import {
  aggregateDailyNutrition,
  DAILY_CALORIE_GOAL_KCAL,
  formatNutrientChip,
} from '@/lib/daily-nutrition';
import { getPetPhotosForLocalCalendarDay } from '@/lib/supabase-photos';
import { PET_CONFIGS, MOOD_CONFIG, getPetImageForMood } from '@/constants/pets';
import { useOnboarding } from '@/providers/OnboardingProvider';
import { usePet } from '@/providers/PetProvider';
import { useAuth } from '@/providers/AuthProvider';

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
/** Horizontal nudge (px) toward screen center — pure X, does not re-slide along the diagonal */
const ONBOARD_CORNER_TRIANGLE_NUDGE_X = 0;
/** Vertical nudge (px): positive = lower on screen — pure Y, does not change X */
const ONBOARD_CORNER_TRIANGLE_NUDGE_Y = 72;

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

/**
 * Album / menu tips: place the triangle tip on the line from the button center to the top-center
 * of the white card. Y is clamped so the tip (and unrotated bbox above it) sits strictly *below*
 * the top-bar row (buttons live in 0..TOP_BAR_HIT) and above the white card top — i.e. in the gap
 * between the bar bottom and the card, not on the same row as the icons.
 */
function computeCornerOnboardingGuide(
  btnCx: number,
  btnCy: number,
  cardCx: number,
  cardTopY: number,
  btnRadius: number,
  gapBtn: number,
  gapY: number
) {
  const dx = cardCx - btnCx;
  const dy = cardTopY - btnCy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const distAlong = btnRadius + gapBtn;
  let tipX = btnCx + ux * distAlong;
  let tipY = btnCy + uy * distAlong;

  /** Bottom of top-bar row; triangle view uses top = tipY - ONBOARD_TRIANGLE_H, so tipY must be ≥ this */
  const yMinTip = TOP_BAR_HIT + ONBOARD_TRIANGLE_H + gapY;
  const yMaxTip = cardTopY - gapY;
  tipY = Math.max(yMinTip, Math.min(yMaxTip, tipY));
  if (Math.abs(cardTopY - btnCy) > 1e-6) {
    const t = (tipY - btnCy) / (cardTopY - btnCy);
    tipX = btnCx + t * (cardCx - btnCx);
  }
  /** Toward card top-center horizontally; +X if button is left of center (menu), −X if right (album) */
  tipX += Math.sign(cardCx - btnCx) * ONBOARD_CORNER_TRIANGLE_NUDGE_X;
  tipY += ONBOARD_CORNER_TRIANGLE_NUDGE_Y;
  tipY = Math.max(yMinTip, Math.min(yMaxTip, tipY));

  const rot =
    (Math.atan2(btnCy - tipY, btnCx - tipX) * 180) / Math.PI - 90;
  return { tipX, tipY, rot };
}

const REACTIONS = ['💕', '⭐', '🎵', '✨', '💖', '🌟'];

export default function PetScreen() {
  const insets = useSafeAreaInsets();
  const {
    petType, petName, happiness, mood, userId,
    level, expProgress, justLeveledUp, clearLevelUp,
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

  useFocusEffect(
    useCallback(() => {
      if (userId && hasSupabaseConfig()) refetchTodayPhotos();
    }, [userId, refetchTodayPhotos])
  );

  const dailyNutrition = useMemo(
    () => aggregateDailyNutrition(todayPhotos ?? []),
    [todayPhotos]
  );
  const { signOut } = useAuth();
  const { step: onboardingStep, advanceStep, startOnboarding } = useOnboarding();

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const petScale = useRef(new Animated.Value(1)).current;
  const idleAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const expProgressAnim = useRef(new Animated.Value(0)).current;
  const levelUpScale = useRef(new Animated.Value(0)).current;
  const levelUpOpacity = useRef(new Animated.Value(0)).current;
  const onboardingArrowPulse = useRef(new Animated.Value(0)).current;
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; x: number; anim: Animated.Value }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
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

  const handleInventory = useCallback(async () => {
    setMenuOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onboardingStep === 2) await advanceStep();
    router.push('/inventory');
  }, [onboardingStep, advanceStep]);

  const handleStreak = useCallback(async () => {
    setMenuOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/streak');
  }, []);

  const handleRestartOnboardingDev = useCallback(async () => {
    setMenuOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await startOnboarding();
  }, [startOnboarding]);

  const handleLogOut = useCallback(async () => {
    setMenuOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await signOut();
    router.replace('/sign-in');
  }, [signOut]);

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
  const onboardMenuGuide = computeCornerOnboardingGuide(
    onboardMenuCx,
    onboardMenuCy,
    onboardCardMidX,
    ONBOARD_STEP12_CARD_TOP,
    ONBOARD_CORNER_BTN_RADIUS,
    ONBOARD_GAP_COUPLE,
    ONBOARD_GAP_COUPLE
  );
  const onboardAlbumTriangleRot = onboardAlbumGuide.rot;
  const onboardMenuTriangleRot = onboardMenuGuide.rot;
  const onboardPulse = 3.5;
  const albumHypot =
    Math.hypot(onboardAlbumCx - onboardAlbumGuide.tipX, onboardAlbumCy - onboardAlbumGuide.tipY) || 1;
  const menuHypot =
    Math.hypot(onboardMenuCx - onboardMenuGuide.tipX, onboardMenuCy - onboardMenuGuide.tipY) || 1;
  const albumPulseDx = ((onboardAlbumCx - onboardAlbumGuide.tipX) / albumHypot) * onboardPulse;
  const albumPulseDy = ((onboardAlbumCy - onboardAlbumGuide.tipY) / albumHypot) * onboardPulse;
  const menuPulseDx = ((onboardMenuCx - onboardMenuGuide.tipX) / menuHypot) * onboardPulse;
  const menuPulseDy = ((onboardMenuCy - onboardMenuGuide.tipY) / menuHypot) * onboardPulse;

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
              onPress={() => setMenuOpen(true)}
              testID="menu-button"
            >
              <Menu size={22} color={Colors.darkBrown} />
            </Pressable>
            <View style={styles.nameTag}>
              <Text style={styles.petNameText}>{petName}</Text>
              <Text style={styles.moodText}>{moodConfig.emoji} {moodConfig.label}</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <Pressable style={styles.albumBtn} onPress={handleAlbum} testID="album-button">
              <Images size={18} color="#FFF" />
            </Pressable>
            <View style={[styles.statBadge, styles.levelBadge]}>
              <Text style={styles.levelText}>Lv {level}</Text>
            </View>
          </View>
        </View>

        <View style={styles.barSection}>
          <Text style={styles.barLabel}>Experience (to next level)</Text>
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
          <Text style={styles.barLabel}>Happiness</Text>
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
            <Text style={styles.barLabel}>Today&apos;s nutrition</Text>
            {todayPhotosLoading ? (
              <ActivityIndicator size="small" color={Colors.softOrange} style={styles.dailyLoading} />
            ) : (
              <>
                <View style={styles.dailyCalRow}>
                  <Text style={styles.dailyCalMain}>
                    {dailyNutrition.totalCalories} / {DAILY_CALORIE_GOAL_KCAL} kcal
                  </Text>
                  <Text style={styles.dailyCalSub}>
                    {Math.max(0, DAILY_CALORIE_GOAL_KCAL - dailyNutrition.totalCalories)} kcal remaining
                  </Text>
                </View>
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
                    Log food photos with &quot;Share a Moment&quot; to track nutrients and calories for today.
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
              <Image source={getPetImageForMood(config, mood)} style={styles.petImage} resizeMode="contain" />
            </Animated.View>
          </Pressable>

          <View style={styles.shadowEllipse} />

          <Text style={styles.tapHint}>
            {mood === 'miserable' ? 'Your pet needs attention...' :
             mood === 'sad' ? 'Tap to cheer up your friend!' :
             'Tap to play!'}
          </Text>
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
                <Text style={styles.levelUpTitle}>Level Up!</Text>
                <Text style={styles.levelUpSubtitle}>Your pet reached Level {level}!</Text>
                <Text style={styles.levelUpTap}>Tap to continue</Text>
              </Animated.View>
            </Pressable>
          </Modal>
        )}

        <Modal visible={menuOpen} transparent animationType="fade">
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
            <View style={[styles.menuPanel, { top: insets.top + 50 }]}>
              <Pressable style={styles.menuItem} onPress={handleInventory}>
                <Package size={20} color={Colors.darkBrown} />
                <Text style={styles.menuItemText}>Badges</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={handleStreak}>
                <Flame size={20} color={Colors.darkBrown} />
                <Text style={styles.menuItemText}>Streak</Text>
              </Pressable>
              {__DEV__ && (
                <Pressable style={styles.menuItem} onPress={handleRestartOnboardingDev} testID="dev-restart-onboarding">
                  <RotateCcw size={20} color={Colors.darkBrown} />
                  <Text style={styles.menuItemText}>Replay onboarding tips</Text>
                </Pressable>
              )}
              <Pressable style={styles.menuItem} onPress={handleLogOut}>
                <LogOut size={20} color={Colors.darkBrown} />
                <Text style={styles.menuItemText}>Log out</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>

        <View style={styles.bottomActions}>
          <Pressable
            style={[styles.actionBtn, styles.cameraBtn]}
            onPress={handleCamera}
            testID="camera-button"
          >
            <Camera size={24} color="#FFF" />
            <Text style={styles.actionBtnText}>Share a Moment</Text>
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
                  ? 'Share a photo with your pet!'
                  : onboardingStep === 1
                    ? 'Browse your photo album'
                    : 'Collect nutrient badges'}
              </Text>
              <Text style={styles.onboardingHint}>
                {onboardingStep === 0
                  ? 'Tap the button below'
                  : onboardingStep === 1
                    ? 'Tap the gallery icon (top right)'
                    : 'Open the menu (☰) and tap Badges'}
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
                      left: onboardAlbumGuide.tipX - ONBOARD_TRIANGLE_HALF_W,
                      top: onboardAlbumGuide.tipY - ONBOARD_TRIANGLE_H,
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
                      left: onboardMenuGuide.tipX - ONBOARD_TRIANGLE_HALF_W,
                      top: onboardMenuGuide.tipY - ONBOARD_TRIANGLE_H,
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
  floatingEmoji: {
    position: 'absolute' as const,
    fontSize: 28,
    zIndex: 100,
  },
  bottomActions: {
    paddingTop: 12,
  },
  actionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
    paddingVertical: 16,
    borderRadius: 18,
  },
  cameraBtn: {
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
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  menuPanel: {
    position: 'absolute' as const,
    left: 20,
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 8,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.darkBrown,
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
});

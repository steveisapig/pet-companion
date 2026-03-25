import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Animated,
  Dimensions,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Camera, Images, Menu, LogOut, Footprints, Package } from 'lucide-react-native';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { PET_CONFIGS, MOOD_CONFIG } from '@/constants/pets';
import { useOnboarding } from '@/providers/OnboardingProvider';
import { usePet } from '@/providers/PetProvider';
import { useAuth } from '@/providers/AuthProvider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const REACTIONS = ['💕', '⭐', '🎵', '✨', '💖', '🌟'];

export default function PetScreen() {
  const insets = useSafeAreaInsets();
  const {
    petType, petName, happiness, mood, photosCount,
    level, expProgress, justLeveledUp, clearLevelUp,
  } = usePet();
  const { signOut } = useAuth();
  const { step: onboardingStep, advanceStep } = useOnboarding();

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const petScale = useRef(new Animated.Value(1)).current;
  const idleAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const expProgressAnim = useRef(new Animated.Value(0)).current;
  const levelUpScale = useRef(new Animated.Value(0)).current;
  const levelUpOpacity = useRef(new Animated.Value(0)).current;
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

  const handleVirtualWalk = useCallback(async () => {
    setMenuOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/walk');
  }, []);

  const handleInventory = useCallback(async () => {
    setMenuOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onboardingStep === 2) await advanceStep();
    router.push('/inventory');
  }, [onboardingStep, advanceStep]);

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
              <Image source={config.image} style={styles.petImage} resizeMode="contain" />
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
              <Pressable style={styles.menuItem} onPress={handleVirtualWalk}>
                <Footprints size={20} color={Colors.darkBrown} />
                <Text style={styles.menuItemText}>Virtual Walk</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={handleInventory}>
                <Package size={20} color={Colors.darkBrown} />
                <Text style={styles.menuItemText}>Badges</Text>
              </Pressable>
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
                onboardingStep === 0 && { position: 'absolute' as const, bottom: insets.bottom + 100, left: 20, right: 20 },
                onboardingStep === 1 && { position: 'absolute' as const, top: insets.top + 80, left: 20, right: 20 },
                onboardingStep === 2 && { position: 'absolute' as const, top: insets.top + 80, left: 20, right: 20 },
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
});

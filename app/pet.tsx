import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Animated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Camera, Heart, Image as ImageIcon } from 'lucide-react-native';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { PET_CONFIGS, MOOD_CONFIG } from '@/constants/pets';
import { usePet } from '@/providers/PetProvider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const REACTIONS = ['💕', '⭐', '🎵', '✨', '💖', '🌟'];

export default function PetScreen() {
  const insets = useSafeAreaInsets();
  const {
    petType, petName, happiness, mood, photosCount, tapCount, tapPet,
  } = usePet();

  const bounceAnim = useRef(new Animated.Value(0)).current;
  const petScale = useRef(new Animated.Value(1)).current;
  const idleAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; x: number; anim: Animated.Value }[]>([]);
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

  const handleTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    tapPet();

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
  }, [tapPet, petScale, bounceAnim, spawnEmoji]);

  const handleCamera = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/camera');
  }, []);

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
          <View style={styles.nameTag}>
            <Text style={styles.petNameText}>{petName}</Text>
            <Text style={styles.moodText}>{moodConfig.emoji} {moodConfig.label}</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statBadge}>
              <ImageIcon size={14} color={Colors.softOrange} />
              <Text style={styles.statText}>{photosCount}</Text>
            </View>
            <View style={styles.statBadge}>
              <Heart size={14} color={Colors.blush} />
              <Text style={styles.statText}>{tapCount}</Text>
            </View>
          </View>
        </View>

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
    gap: 8,
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
});

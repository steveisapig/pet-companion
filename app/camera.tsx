import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { X, Check, Sparkles, ImagePlus } from 'lucide-react-native';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import PetPortrait from '@/components/PetPortrait';
import { analyzePhoto } from '@/lib/analyze-photo';
import {
  countUserLlmQueriesLast24h,
  isAtLlmQueryLimit,
  LLM_QUERY_LIMIT,
} from '@/lib/user-llm-queries';
import { usePet } from '@/providers/PetProvider';
import { useAuth } from '@/providers/AuthProvider';
import { uploadPetPhoto } from '@/lib/supabase-photos';
import { recordStreakDayIfPhotoUploaded } from '@/lib/user-streak';
import { consumePendingCameraUri, launchNativeGallery } from '@/lib/native-camera';

const hasSupabaseConfig = () =>
  !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { addPhoto, petName, petType, mood, userId, addBadges, petPrimaryColor } = usePet();
  const { user, session } = useAuth();

  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const successAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const jumpAnim = useRef(new Animated.Value(0)).current;

  // Read the URI captured by pet.tsx before navigation
  useEffect(() => {
    const uri = consumePendingCameraUri();
    if (!uri) {
      router.back();
    } else {
      setCapturedUri(uri);
    }
  }, []);

  // Success animation loop
  useEffect(() => {
    if (!showSuccess) { jumpAnim.setValue(0); return; }
    const hop = Animated.loop(
      Animated.sequence([
        Animated.timing(jumpAnim, { toValue: -32, duration: 260, useNativeDriver: true }),
        Animated.spring(jumpAnim, { toValue: 0, friction: 4, tension: 220, useNativeDriver: true }),
        Animated.delay(180),
      ])
    );
    hop.start();
    return () => hop.stop();
  }, [showSuccess, jumpAnim]);

  const handlePickFromGallery = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const uri = await launchNativeGallery();
    if (uri) setCapturedUri(uri);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (isConfirming) return;
    setIsConfirming(true);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addPhoto();
    setShowSuccess(true);
    Animated.parallel([
      Animated.spring(successAnim, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -15, duration: 150, useNativeDriver: true }),
        Animated.spring(bounceAnim, { toValue: 0, friction: 3, tension: 200, useNativeDriver: true }),
      ]),
    ]).start();

    if (!capturedUri || !hasSupabaseConfig()) return;

    (async () => {
      try {
        let nutrients: string[] = [];
        let calorie = 0;
        let cloudUploadDone = false;
        let skipAnalysis = false;

        if (user?.id) {
          try {
            const queryCount = await countUserLlmQueriesLast24h(user.id);
            if (isAtLlmQueryLimit(queryCount)) skipAnalysis = true;
          } catch (err) {
            console.error('[Camera] LLM rate limit check failed:', err);
          }
        }

        if (!skipAnalysis) {
          const result = await analyzePhoto(capturedUri, session?.access_token);
          if (result.success) {
            nutrients = result.nutrients;
            calorie = result.calorie;
            if (userId && result.nutrients.length > 0) await addBadges(nutrients);
          }
          if (userId && user?.id === userId) {
            await uploadPetPhoto(capturedUri, userId, result.success ? { nutrients, calorie } : undefined);
            cloudUploadDone = true;
          }
        } else if (userId && user?.id === userId) {
          await uploadPetPhoto(capturedUri, userId);
          cloudUploadDone = true;
        }

        if (cloudUploadDone && userId) {
          await recordStreakDayIfPhotoUploaded(userId, new Date()).catch((err) =>
            console.error('[Camera] streak update:', err)
          );
        }
      } catch (e) {
        console.error('[Camera] Background analysis/upload error:', e);
      }
    })();
  }, [isConfirming, addPhoto, addBadges, successAnim, bounceAnim, capturedUri, userId, user?.id, session]);

  const handleContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  // Blank while native camera is open (native UI covers our screen entirely)
  if (!capturedUri && !showSuccess) return null;

  // ── Success ────────────────────────────────────────────────────────────────
  if (showSuccess) {
    return (
      <View style={[styles.container, { backgroundColor: '#FFF8F0' }]}>
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}>
          <Animated.View style={{ transform: [{ translateY: jumpAnim }] }}>
            <PetPortrait petType={petType ?? 'mochi'} mood={mood} primaryColor={petPrimaryColor} style={styles.petImage} />
          </Animated.View>
          <Animated.View style={[styles.successContent, { transform: [{ scale: successAnim }, { translateY: bounceAnim }] }]}>
            <Sparkles size={48} color={Colors.softOrange} />
            <Text style={styles.successTitle}>{t('camera.lovedTitle', { name: petName })}</Text>
            <Text style={styles.successSubtitle}>{t('camera.happinessBoosted')}</Text>
          </Animated.View>
          <Pressable style={styles.continueBtn} onPress={handleContinue} testID="success-continue-button">
            <Text style={styles.continueBtnText}>{t('common.continue')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Image fills available space */}
      <View style={styles.previewContainer}>
        <Image source={{ uri: capturedUri! }} style={styles.previewImage} />
      </View>

      {/* X button pinned to top-left */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.closeBtn, { top: insets.top + 12, left: 16 }]}
        testID="close-camera"
      >
        <X size={22} color={Colors.darkBrown} />
      </Pressable>

      {/* Bottom action bar */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.previewHint}>{t('camera.previewHint', { name: petName })}</Text>
        <View style={styles.actions}>
          <Pressable style={styles.galleryBtn} onPress={handlePickFromGallery} testID="gallery-button">
            <ImagePlus size={20} color={Colors.brown} />
            <Text style={styles.galleryBtnText}>{t('camera.chooseFromGallery')}</Text>
          </Pressable>
          <Pressable style={styles.confirmBtn} onPress={handleConfirm} testID="confirm-button">
            <Check size={20} color="#FFF" />
            <Text style={styles.confirmBtnText}>{t('camera.shareNow')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeBtn: {
    position: 'absolute' as const,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    zIndex: 10,
  },
  previewContainer: {
    flex: 1,
  },
  previewImage: {
    flex: 1,
    width: '100%' as const,
    resizeMode: 'cover' as const,
  },
  actionBar: {
    backgroundColor: '#FFF8F0',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  previewHint: {
    fontSize: 15,
    color: Colors.brown,
    opacity: 0.7,
    textAlign: 'center' as const,
  },
  actions: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  galleryBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.beige,
  },
  galleryBtnText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.brown,
  },
  confirmBtn: {
    flex: 1.5,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 16,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  petImage: { width: 140, height: 140 },
  successContent: {
    alignItems: 'center' as const,
    gap: 16,
    marginTop: 8,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.darkBrown,
  },
  successSubtitle: {
    fontSize: 18,
    color: Colors.softOrange,
    fontWeight: '600' as const,
  },
  continueBtn: {
    marginTop: 28,
    alignSelf: 'stretch' as const,
    backgroundColor: Colors.softOrange,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center' as const,
    shadowColor: Colors.softOrange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  continueBtnText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#FFF',
  },
});

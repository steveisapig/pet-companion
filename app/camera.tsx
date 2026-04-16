import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Animated,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Camera, ImagePlus, X, Check, Sparkles } from 'lucide-react-native';
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

  useEffect(() => {
    if (!showSuccess) {
      jumpAnim.setValue(0);
      return;
    }
    const hop = Animated.loop(
      Animated.sequence([
        Animated.timing(jumpAnim, {
          toValue: -32,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.spring(jumpAnim, {
          toValue: 0,
          friction: 4,
          tension: 220,
          useNativeDriver: true,
        }),
        Animated.delay(180),
      ])
    );
    hop.start();
    return () => hop.stop();
  }, [showSuccess, jumpAnim]);

  const handleTakePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('camera.permissionNeeded'),
          t('camera.permissionBody')
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.92,
      });
      if (!result.canceled && result.assets[0]) {
        console.log('[Camera] Photo taken:', result.assets[0].uri);
        setCapturedUri(result.assets[0].uri);
      }
    } catch (e) {
      console.error('[Camera] Error taking photo:', e);
      Alert.alert(t('camera.errorTitle'), t('camera.takePhotoError'));
    }
  }, [t]);

  const handlePickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.75,
      });
      if (!result.canceled && result.assets[0]) {
        console.log('[Camera] Image picked:', result.assets[0].uri);
        setCapturedUri(result.assets[0].uri);
      }
    } catch (e) {
      console.error('[Camera] Error picking image:', e);
      Alert.alert(t('camera.errorTitle'), t('camera.pickImageError'));
    }
  }, [t]);

  const handleConfirm = useCallback(async () => {
    if (isConfirming) return;
    setIsConfirming(true);

    // Show success immediately — analysis runs in the background.
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

    // Fire-and-forget: analyze + upload in the background.
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
  }, [isConfirming, addPhoto, addBadges, successAnim, bounceAnim, capturedUri, userId, user?.id, session, t]);

  const handleContinueAfterSuccess = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleRetake = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCapturedUri(null);
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="close-camera">
            <X size={24} color={Colors.darkBrown} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('camera.headerTitle')}</Text>
          <View style={{ width: 40 }} />
        </View>

        {showSuccess ? (
          <View style={styles.successContainer}>
            <Animated.View
              style={[
                styles.petJumpWrap,
                { transform: [{ translateY: jumpAnim }] },
              ]}
            >
              <PetPortrait
                petType={petType ?? 'mochi'}
                mood={mood}
                primaryColor={petPrimaryColor}
                style={styles.petSuccessImage}
              />
            </Animated.View>
            <Animated.View style={[
              styles.successContent,
              {
                transform: [
                  { scale: successAnim },
                  { translateY: bounceAnim },
                ],
              },
            ]}>
              <Sparkles size={48} color={Colors.softOrange} />
              <Text style={styles.successTitle}>
                {t('camera.lovedTitle', { name: petName })}
              </Text>
              <Text style={styles.successSubtitle}>
                {t('camera.happinessBoosted')}
              </Text>
            </Animated.View>
            <Pressable
              style={styles.continueBtn}
              onPress={handleContinueAfterSuccess}
              testID="success-continue-button"
            >
              <Text style={styles.continueBtnText}>{t('common.continue')}</Text>
            </Pressable>
          </View>
        ) : capturedUri ? (
          <View style={styles.previewContainer}>
            <View style={styles.previewImageWrap}>
              <Image source={{ uri: capturedUri }} style={styles.previewImage} />
            </View>
            <Text style={styles.previewHint}>{t('camera.previewHint', { name: petName })}</Text>
            <View style={styles.previewActions}>
              <Pressable style={styles.retakeBtn} onPress={handleRetake} testID="retake-button">
                <X size={20} color={Colors.brown} />
                <Text style={styles.retakeBtnText}>{t('common.retake')}</Text>
              </Pressable>
              <Pressable
                style={styles.confirmBtn}
                onPress={handleConfirm}
                testID="confirm-button"
              >
                <Check size={20} color="#FFF" />
                <Text style={styles.confirmBtnText}>{t('camera.shareNow')}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.captureContainer}>
            <View style={styles.placeholderImage}>
              <Camera size={64} color={Colors.caramel} strokeWidth={1.2} />
              <Text style={styles.placeholderText}>{t('camera.capturePrompt', { name: petName })}</Text>
            </View>

            <View style={styles.captureActions}>
              <Pressable style={styles.captureBtn} onPress={handleTakePhoto} testID="take-photo-button">
                <Camera size={24} color="#FFF" />
                <Text style={styles.captureBtnText}>{t('camera.takePhoto')}</Text>
              </Pressable>
              <Pressable style={styles.galleryBtn} onPress={handlePickImage} testID="pick-image-button">
                <ImagePlus size={24} color="#FFF" />
                <Text style={styles.galleryBtnText}>{t('camera.chooseFromGallery')}</Text>
              </Pressable>
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 24,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.darkBrown,
  },
  captureContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    gap: 40,
  },
  placeholderImage: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 24,
    paddingVertical: 48,
    paddingHorizontal: 32,
    borderWidth: 2,
    borderColor: Colors.beige,
    borderStyle: 'dashed' as const,
  },
  placeholderText: {
    fontSize: 16,
    color: Colors.brown,
    textAlign: 'center' as const,
    marginTop: 16,
    lineHeight: 24,
    opacity: 0.7,
  },
  captureActions: {
    gap: 12,
  },
  captureBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
    backgroundColor: Colors.softOrange,
    paddingVertical: 16,
    borderRadius: 18,
    shadowColor: Colors.softOrange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  captureBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  galleryBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
    backgroundColor: Colors.softOrange,
    paddingVertical: 16,
    borderRadius: 18,
    shadowColor: Colors.softOrange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  galleryBtnText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  previewContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 24,
  },
  previewImageWrap: {
    borderRadius: 24,
    overflow: 'hidden' as const,
    shadowColor: Colors.brown,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  previewImage: {
    width: 280,
    height: 280,
    borderRadius: 24,
  },
  previewHint: {
    fontSize: 16,
    color: Colors.brown,
    opacity: 0.7,
  },
  previewActions: {
    flexDirection: 'row' as const,
    gap: 12,
    width: '100%',
  },
  retakeBtn: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.beige,
  },
  retakeBtnText: {
    fontSize: 15,
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
  successContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  petJumpWrap: {
    marginBottom: 4,
  },
  petSuccessImage: {
    width: 140,
    height: 140,
  },
  successContent: {
    alignItems: 'center' as const,
    gap: 16,
  },
  continueBtn: {
    marginTop: 28,
    alignSelf: 'stretch' as const,
    backgroundColor: Colors.softOrange,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
  rewardRow: {
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  badgeList: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  calorieText: {
    fontSize: 12,
    color: Colors.brown,
    opacity: 0.8,
  },
  rewardLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.brown,
  },
  rewardItem: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.darkBrown,
  },
});

import React, { useCallback, useState, useRef } from 'react';
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
import { usePet } from '@/providers/PetProvider';

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { addPhoto, petName } = usePet();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const successAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  const handleTakePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required to take photos for your pet.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        console.log('[Camera] Photo taken:', result.assets[0].uri);
        setCapturedUri(result.assets[0].uri);
      }
    } catch (e) {
      console.error('[Camera] Error taking photo:', e);
      Alert.alert('Error', 'Could not take photo. Please try again.');
    }
  }, []);

  const handlePickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        console.log('[Camera] Image picked:', result.assets[0].uri);
        setCapturedUri(result.assets[0].uri);
      }
    } catch (e) {
      console.error('[Camera] Error picking image:', e);
      Alert.alert('Error', 'Could not pick image. Please try again.');
    }
  }, []);

  const handleConfirm = useCallback(() => {
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

    setTimeout(() => {
      router.back();
    }, 1800);
  }, [addPhoto, successAnim, bounceAnim]);

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

      <View style={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="close-camera">
            <X size={24} color={Colors.darkBrown} />
          </Pressable>
          <Text style={styles.headerTitle}>Share a Moment</Text>
          <View style={{ width: 40 }} />
        </View>

        {showSuccess ? (
          <View style={styles.successContainer}>
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
              <Text style={styles.successTitle}>{petName} loved it!</Text>
              <Text style={styles.successSubtitle}>Happiness boosted! +15 ✨</Text>
            </Animated.View>
          </View>
        ) : capturedUri ? (
          <View style={styles.previewContainer}>
            <View style={styles.previewImageWrap}>
              <Image source={{ uri: capturedUri }} style={styles.previewImage} />
            </View>
            <Text style={styles.previewHint}>Share this with {petName}?</Text>
            <View style={styles.previewActions}>
              <Pressable style={styles.retakeBtn} onPress={handleRetake} testID="retake-button">
                <X size={20} color={Colors.brown} />
                <Text style={styles.retakeBtnText}>Retake</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleConfirm} testID="confirm-button">
                <Check size={20} color="#FFF" />
                <Text style={styles.confirmBtnText}>Share!</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.captureContainer}>
            <View style={styles.placeholderImage}>
              <Camera size={64} color={Colors.caramel} strokeWidth={1.2} />
              <Text style={styles.placeholderText}>Capture a moment from{'\n'}your day for {petName}</Text>
            </View>

            <View style={styles.captureActions}>
              <Pressable style={styles.captureBtn} onPress={handleTakePhoto} testID="take-photo-button">
                <Camera size={24} color="#FFF" />
                <Text style={styles.captureBtnText}>Take Photo</Text>
              </Pressable>
              <Pressable style={styles.galleryBtn} onPress={handlePickImage} testID="pick-image-button">
                <ImagePlus size={24} color={Colors.softOrange} />
                <Text style={styles.galleryBtnText}>Choose from Gallery</Text>
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
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.beige,
  },
  galleryBtnText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.softOrange,
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
    backgroundColor: Colors.softGreen,
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
  },
  successContent: {
    alignItems: 'center' as const,
    gap: 16,
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
});

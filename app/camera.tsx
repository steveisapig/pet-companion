import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  Alert,
  Linking,
  ActivityIndicator,
  PanResponder,
  Image,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { X, Check, Sparkles, ImagePlus, RotateCcw, RotateCw, ArrowLeft } from 'lucide-react-native';

import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import PetPortrait from '@/components/PetPortrait';
import { analyzePhoto } from '@/lib/analyze-photo';
import {
  countUserLlmQueriesLast24h,
  isAtLlmQueryLimit,
} from '@/lib/user-llm-queries';
import { usePet } from '@/providers/PetProvider';
import { useAuth } from '@/providers/AuthProvider';
import { uploadPetPhoto } from '@/lib/supabase-photos';
import { recordStreakDayIfPhotoUploaded } from '@/lib/user-streak';

// ─── helpers ──────────────────────────────────────────────────────────────────

const hasSupabaseConfig = () =>
  !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

/** Bakes rotation + crop into a new JPEG file and returns its URI.
 *  Returns the original URI unchanged if no edits are needed. */
async function applyImageEdits(
  uri: string,
  deg: number,
  box: CropBox,
  natural: { w: number; h: number } | null,
): Promise<string> {
  const hasCrop = box.l > 0.005 || box.t > 0.005 || box.r < 0.995 || box.b < 0.995;
  if (deg === 0 && !hasCrop) return uri;

  const actions: Parameters<typeof manipulateAsync>[1] = [];

  if (deg !== 0) actions.push({ rotate: deg });

  if (hasCrop && natural) {
    const swapped = deg % 180 !== 0;
    const rotW = swapped ? natural.h : natural.w;
    const rotH = swapped ? natural.w : natural.h;
    const cropParams = {
      originX: Math.round(box.l * rotW),
      originY: Math.round(box.t * rotH),
      width:   Math.max(1, Math.round((box.r - box.l) * rotW)),
      height:  Math.max(1, Math.round((box.b - box.t) * rotH)),
    };
    console.log('[applyImageEdits] crop params', cropParams, 'natural', natural, 'box', box, 'deg', deg);
    actions.push({ crop: cropParams });
  }

  const result = await manipulateAsync(uri, actions, { compress: 0.92, format: SaveFormat.JPEG });
  return result.uri;
}

/** Returns the rect (within a container of size cW×cH) where an image with
 *  natural size natW×natH would be displayed using resizeMode="contain",
 *  accounting for the logical rotation applied via CSS transform. */
function getImgRect(
  cW: number, cH: number,
  natW: number, natH: number,
  rotDeg: number,
): { x: number; y: number; w: number; h: number } {
  const swapped = rotDeg % 180 !== 0;
  const eW = swapped ? natH : natW;
  const eH = swapped ? natW : natH;
  const ar  = eW / eH;
  const cAr = cW / cH;
  let w: number, h: number;
  if (ar > cAr) { w = cW; h = cW / ar; }
  else           { h = cH; w = cH * ar; }
  return { x: (cW - w) / 2, y: (cH - h) / 2, w, h };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/**
 * Returns the absolute-position style for the Animated.Image element so that,
 * after the CSS rotation transform is applied, the image visually lands exactly
 * at `imgRect` inside the container.
 *
 * For 0° / 180°: element size = imgRect size, positioned at imgRect origin.
 * For 90° / 270°: the element is transposed (width ↔ height) and centered on
 *   the imgRect center.  After the 90°/270° CSS rotation the visual is correct.
 */
function computedImgStyle(
  imgRect: { x: number; y: number; w: number; h: number },
  rotDeg: number,
): object {
  const swapped = rotDeg % 180 !== 0;
  if (!swapped) {
    return { position: 'absolute' as const, left: imgRect.x, top: imgRect.y, width: imgRect.w, height: imgRect.h };
  }
  const elemW = imgRect.h;
  const elemH = imgRect.w;
  const cx = imgRect.x + imgRect.w / 2;
  const cy = imgRect.y + imgRect.h / 2;
  return { position: 'absolute' as const, left: cx - elemW / 2, top: cy - elemH / 2, width: elemW, height: elemH };
}

// ─── types ────────────────────────────────────────────────────────────────────

type Phase  = 'capture' | 'preview' | 'success';
type CropBox = { l: number; t: number; r: number; b: number };
const FULL_BOX: CropBox = { l: 0, t: 0, r: 1, b: 1 };

// ─── component ────────────────────────────────────────────────────────────────

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { addPhoto, petName, petType, mood, userId, addBadges, petPrimaryColor } = usePet();
  const { user, session } = useAuth();

  const [phase, setPhase]               = useState<Phase>('capture');
  const [capturedUri, setCapturedUri]   = useState<string | null>(null);
  const [isCapturing, setIsCapturing]   = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // ── zoom & focus (capture phase) ────────────────────────────────────────────
  const [zoom, setZoom]           = useState(0);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const zoomBase       = useRef(0);
  const focusOpacity   = useRef(new Animated.Value(0)).current;
  const focusRingScale = useRef(new Animated.Value(1)).current;
  const cameraRef      = useRef<CameraView>(null);

  // ── success animations ───────────────────────────────────────────────────────
  const successAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim  = useRef(new Animated.Value(0)).current;
  const jumpAnim    = useRef(new Animated.Value(0)).current;

  // ── preview: rotation ────────────────────────────────────────────────────────
  const [rotDeg, setRotDeg]   = useState(0);   // 0 / 90 / 180 / 270 (display state)
  const rotTarget              = useRef(0);      // accumulated animated target
  const rotAnim                = useRef(new Animated.Value(0)).current;
  const [isRotating, setIsRotating] = useState(false);
  const rotDegRef              = useRef(0);      // for PanResponder callbacks

  // ── preview: crop ────────────────────────────────────────────────────────────
  const [cropBox, setCropBox]       = useState<CropBox>(FULL_BOX);
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [previewLayout, setPreviewLayout] = useState<{ w: number; h: number } | null>(null);

  // refs for PanResponder (avoids stale closures)
  const cropBoxRef      = useRef<CropBox>(FULL_BOX);
  const imgNaturalRef   = useRef<{ w: number; h: number } | null>(null);
  const previewLayoutRef = useRef<{ w: number; h: number } | null>(null);
  const dragStartRef    = useRef<CropBox>(FULL_BOX);

  const setBox = (box: CropBox) => { cropBoxRef.current = box; setCropBox(box); };

  // ── permissions ──────────────────────────────────────────────────────────────
  const [permission, requestPermission] = useCameraPermissions();
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, []);

  // ── reset preview state when entering preview ─────────────────────────────
  useEffect(() => {
    if (phase !== 'preview') return;
    rotTarget.current = 0;
    rotDegRef.current = 0;
    rotAnim.setValue(0);
    setRotDeg(0);
    setIsRotating(false);
    setBox(FULL_BOX);
    setImgNatural(null);
    imgNaturalRef.current = null;
  }, [phase]);

  // ── fallback: re-measure image dimensions if imgNatural is missing ────────
  // onLoad may not re-fire after the app returns from background (cached URI).
  useEffect(() => {
    if (phase !== 'preview' || !capturedUri || imgNatural) return;
    Image.getSize(
      capturedUri,
      (w, h) => { imgNaturalRef.current = { w, h }; setImgNatural({ w, h }); },
      () => {},
    );
  }, [phase, capturedUri, imgNatural]);

  // ── success hop animation ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'success') { jumpAnim.setValue(0); return; }
    const hop = Animated.loop(
      Animated.sequence([
        Animated.timing(jumpAnim, { toValue: -32, duration: 260, useNativeDriver: true }),
        Animated.spring(jumpAnim, { toValue: 0, friction: 4, tension: 220, useNativeDriver: true }),
        Animated.delay(180),
      ])
    );
    hop.start();
    return () => hop.stop();
  }, [phase]);

  // ── PanResponders for crop corners ───────────────────────────────────────────
  const updateCorner = (corner: string, dx: number, dy: number) => {
    const layout  = previewLayoutRef.current;
    const natural = imgNaturalRef.current;
    if (!layout || !natural) return;
    const rect = getImgRect(layout.w, layout.h, natural.w, natural.h, rotDegRef.current);
    const dfx  = dx / rect.w;
    const dfy  = dy / rect.h;
    const { l, t, r, b } = dragStartRef.current;
    const minF = 50 / Math.min(rect.w, rect.h);
    let nl = l, nt = t, nr = r, nb = b;
    switch (corner) {
      case 'tl': nl = clamp(l + dfx, 0, r - minF); nt = clamp(t + dfy, 0, b - minF); break;
      case 'tr': nr = clamp(r + dfx, l + minF, 1); nt = clamp(t + dfy, 0, b - minF); break;
      case 'bl': nl = clamp(l + dfx, 0, r - minF); nb = clamp(b + dfy, t + minF, 1); break;
      case 'br': nr = clamp(r + dfx, l + minF, 1); nb = clamp(b + dfy, t + minF, 1); break;
    }
    setBox({ l: nl, t: nt, r: nr, b: nb });
  };

  const makePan = (corner: string) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => { dragStartRef.current = { ...cropBoxRef.current }; },
      onPanResponderMove: (_, gs) => updateCorner(corner, gs.dx, gs.dy),
    });

  const tlPan = useRef(makePan('tl'));
  const trPan = useRef(makePan('tr'));
  const blPan = useRef(makePan('bl'));
  const brPan = useRef(makePan('br'));

  // ── rotate ────────────────────────────────────────────────────────────────────
  const doRotate = useCallback((delta: number) => {
    if (isRotating) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRotating(true);
    rotTarget.current += delta;
    Animated.timing(rotAnim, {
      toValue: rotTarget.current,
      duration: 350,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      const deg = ((rotTarget.current % 360) + 360) % 360;
      rotDegRef.current = deg;
      setRotDeg(deg);
      setIsRotating(false);
      setBox({ ...FULL_BOX });
    });
  }, [isRotating, rotAnim]);


  // ── capture ───────────────────────────────────────────────────────────────────
  const handleCapture = useCallback(async () => {
    if (isCapturing || !cameraRef.current) return;
    setIsCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.92 });
      if (photo?.uri) { setCapturedUri(photo.uri); setPhase('preview'); }
    } catch (e) {
      console.error('[Camera] capture error:', e);
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  const handlePickFromGallery = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status === 'denied') {
      Alert.alert(
        t('camera.photoPermissionTitle'),
        t('camera.photoPermissionMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('camera.openSettings'), onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      // Culprit #1 & #3: log what ImagePicker reports vs the URI it gives us
      console.log('[Gallery] ImagePicker asset:', {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        type: asset.type,
        exif: (asset as any).exif?.Orientation ?? 'n/a',
      });
      setCapturedUri(asset.uri);
      setPhase('preview');
    }
  }, [t]);

  // ── confirm ───────────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addPhoto();
    setPhase('success');
    Animated.parallel([
      Animated.spring(successAnim, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -15, duration: 150, useNativeDriver: true }),
        Animated.spring(bounceAnim, { toValue: 0, friction: 3, tension: 200, useNativeDriver: true }),
      ]),
    ]).start();

    if (!capturedUri || !hasSupabaseConfig()) return;

    // Snapshot edit state now (refs are stable across the async gap)
    const editDeg = ((rotTarget.current % 360) + 360) % 360;
    const editBox = { ...cropBoxRef.current };
    const editNatural = imgNaturalRef.current;

    console.log('[Camera] Share pressed — edit state:', {
      rotationDeg: editDeg,
      cropBox: editBox,
      naturalSize: editNatural,
    });

    (async () => {
      try {
        // Bake crop/rotation into the file before uploading
        let uploadUri = capturedUri;
        try {
          uploadUri = await applyImageEdits(capturedUri, editDeg, editBox, editNatural);
        } catch (e) {
          console.error('[Camera] apply edits on confirm:', e);
        }

        // Log the dimensions of the file that will be sent to the edge function
        await new Promise<void>((resolve) => {
          Image.getSize(
            uploadUri,
            (w, h) => {
              console.log('[Camera] File sent to edge function:', {
                uri: uploadUri,
                width: w,
                height: h,
                sameAsOriginal: uploadUri === capturedUri,
              });
              resolve();
            },
            (err) => {
              console.warn('[Camera] Could not measure upload file:', err);
              resolve();
            },
          );
        });

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
          const result = await analyzePhoto(uploadUri, session?.access_token);
          if (result.success) {
            nutrients = result.nutrients;
            calorie   = result.calorie;
            if (userId && result.nutrients.length > 0) await addBadges(nutrients);
          }
          if (userId && user?.id === userId) {
            await uploadPetPhoto(uploadUri, userId, result.success ? { nutrients, calorie } : undefined);
            cloudUploadDone = true;
          }
        } else if (userId && user?.id === userId) {
          await uploadPetPhoto(uploadUri, userId);
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

  // ── camera gestures (capture phase) ──────────────────────────────────────────
  const showFocusRing = useCallback((screenX: number, screenY: number) => {
    setFocusPoint({ x: screenX, y: screenY });
    focusOpacity.setValue(1);
    focusRingScale.setValue(1.5);
    Animated.parallel([
      Animated.spring(focusRingScale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(800),
        Animated.timing(focusOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start(() => setFocusPoint(null));
  }, [focusOpacity, focusRingScale]);

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => { zoomBase.current = zoom; })
    .onUpdate((e) => {
      setZoom(Math.min(1, Math.max(0, zoomBase.current + (e.scale - 1) * 0.4)));
    });

  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e) => {
      try { (cameraRef.current as any)?.focus?.({ x: e.x, y: e.y }); } catch {}
      showFocusRing(e.x, e.y);
    });

  const cameraGestures = Gesture.Simultaneous(pinchGesture, tapGesture);

  // ════════════════════════════════════════════════════════════════════════════
  // SUCCESS
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === 'success') {
    return (
      <View style={[styles.container, { backgroundColor: '#FFF8F0' }]}>
        <View style={styles.successPage}>
          <View style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, flex: 1 }}>
            <Animated.View style={{ alignSelf: 'center', transform: [{ translateY: jumpAnim }] }}>
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
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PREVIEW — inline crop & rotate
  // ════════════════════════════════════════════════════════════════════════════
  if (phase === 'preview' && capturedUri) {
    // Compute crop-overlay rect once layout + natural size are known
    let imgRect: { x: number; y: number; w: number; h: number } | null = null;
    if (previewLayout && imgNatural) {
      imgRect = getImgRect(previewLayout.w, previewLayout.h, imgNatural.w, imgNatural.h, rotDeg);
    }

    const boxL = imgRect ? imgRect.x + cropBox.l * imgRect.w : 0;
    const boxT = imgRect ? imgRect.y + cropBox.t * imgRect.h : 0;
    const boxR = imgRect ? imgRect.x + cropBox.r * imgRect.w : 0;
    const boxB = imgRect ? imgRect.y + cropBox.b * imgRect.h : 0;

    const rotInterp = rotAnim.interpolate({
      inputRange: [-3600, 3600],
      outputRange: ['-3600deg', '3600deg'],
    });

    return (
      <View style={styles.previewContainer}>

        {/* Safe-area top spacer */}
        <View style={{ height: insets.top + 8 }} />

        {/* Image area — fills all remaining space above the bottom bar */}
        <View
          style={[
            { flex: 1, zIndex: 1 },
            isRotating && { overflow: 'hidden' },
          ]}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            previewLayoutRef.current = { w: width, h: height };
            setPreviewLayout({ w: width, h: height });
          }}
        >
            {/* Image: when static use computed position matching imgRect exactly;
                during animation fall back to absoluteFill so the rotation plays smoothly */}
            <Animated.Image
              source={{ uri: capturedUri }}
              style={[
                (!isRotating && imgRect && imgRect.w > 1)
                  ? computedImgStyle(imgRect, rotDeg)
                  : StyleSheet.absoluteFill,
                { transform: [{ rotate: rotInterp }] },
              ]}
              resizeMode="contain"
              onLoad={(e) => {
                const { width, height } = (e.nativeEvent as any).source;
                // Use Image.getSize for actual pixel dimensions — onLoad returns display/logical
                // pixels which may be scaled down (e.g. 909 instead of 1320 for a gallery PNG).
                Image.getSize(
                  capturedUri!,
                  (gsW, gsH) => {
                    console.log('[Preview] dimensions — onLoad:', { width, height }, 'getSize:', { gsW, gsH });
                    imgNaturalRef.current = { w: gsW, h: gsH };
                    setImgNatural({ w: gsW, h: gsH });
                  },
                  (err) => {
                    console.warn('[Preview] Image.getSize error, falling back to onLoad:', err);
                    imgNaturalRef.current = { w: width, h: height };
                    setImgNatural({ w: width, h: height });
                  },
                );
              }}
            />

            {/* Crop overlay — hidden while rotating or image not yet fully measured */}
            {!isRotating && imgRect && imgRect.w > 1 && imgRect.h > 1 && (
              <>
                {/* Dim outside crop box */}
                <View style={[styles.cropDim, { left: 0,    top: 0,    right: 0,    height: boxT }]} pointerEvents="none" />
                <View style={[styles.cropDim, { left: 0,    top: boxB, right: 0,    bottom: 0 }]}   pointerEvents="none" />
                <View style={[styles.cropDim, { left: 0,    top: boxT, width: boxL, height: boxB - boxT }]} pointerEvents="none" />
                <View style={[styles.cropDim, { left: boxR, top: boxT, right: 0,    height: boxB - boxT }]} pointerEvents="none" />

                {/* Crop border + rule-of-thirds grid */}
                <View style={[styles.cropBorder, { left: boxL, top: boxT, width: boxR - boxL, height: boxB - boxT }]} pointerEvents="none">
                  <View style={styles.gridLineH1} />
                  <View style={styles.gridLineH2} />
                  <View style={styles.gridLineV1} />
                  <View style={styles.gridLineV2} />
                </View>

                {/* Corner handles: touch area CENTERED on the corner point; dot centered within */}
                <View style={[styles.cropHandleTouch, { left: boxL - HIT/2, top: boxT - HIT/2 }]} {...tlPan.current.panHandlers}><View style={styles.cropHandleDot} /></View>
                <View style={[styles.cropHandleTouch, { left: boxR - HIT/2, top: boxT - HIT/2 }]} {...trPan.current.panHandlers}><View style={styles.cropHandleDot} /></View>
                <View style={[styles.cropHandleTouch, { left: boxL - HIT/2, top: boxB - HIT/2 }]} {...blPan.current.panHandlers}><View style={styles.cropHandleDot} /></View>
                <View style={[styles.cropHandleTouch, { left: boxR - HIT/2, top: boxB - HIT/2 }]} {...brPan.current.panHandlers}><View style={styles.cropHandleDot} /></View>
              </>
            )}

        </View>{/* end image area */}

        {/* ── Bottom bar ────────────────────────────────────────────────── */}
        <View style={[styles.bottomBar, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.rotateBar}>
            <Pressable
              style={[styles.rotateBtn, isRotating && styles.rotateBtnDisabled]}
              onPress={() => doRotate(-90)}
              disabled={isRotating}
              testID="rotate-left-button"
            >
              <RotateCcw size={22} color="#FFF" />
            </Pressable>
            <Pressable
              style={[styles.rotateBtn, isRotating && styles.rotateBtnDisabled]}
              onPress={() => doRotate(90)}
              disabled={isRotating}
              testID="rotate-right-button"
            >
              <RotateCw size={22} color="#FFF" />
            </Pressable>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.previewSecBtn} onPress={() => setPhase('capture')} testID="back-to-camera-button">
              <ArrowLeft size={18} color="#FFF" />
              <Text style={styles.previewSecBtnText}>{t('common.back')}</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, isConfirming && { opacity: 0.6 }]}
              onPress={handleConfirm}
              disabled={isConfirming || isRotating}
              testID="confirm-button"
            >
              {isConfirming
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Check size={18} color="#FFF" />}
              <Text style={styles.confirmBtnText}>{t('camera.shareNow')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CAPTURE — live camera
  // ════════════════════════════════════════════════════════════════════════════
  if (permission && !permission.granted && !permission.canAskAgain) {
    return (
      <View style={[styles.container, styles.permissionContainer]}>
        <Text style={styles.permissionTitle}>{t('camera.permissionNeeded')}</Text>
        <Text style={styles.permissionBody}>{t('camera.permissionBody')}</Text>
        <Pressable style={styles.settingsBtn} onPress={() => Linking.openSettings()}>
          <Text style={styles.settingsBtnText}>{t('camera.openSettings')}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 8 }}>
          <Text style={{ color: Colors.brown, textDecorationLine: 'underline' }}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" zoom={zoom} />

      <GestureDetector gesture={cameraGestures}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>

      {focusPoint && (
        <Animated.View
          pointerEvents="none"
          style={[styles.focusRing, {
            left: focusPoint.x - 32, top: focusPoint.y - 32,
            opacity: focusOpacity,
            transform: [{ scale: focusRingScale }],
          }]}
        />
      )}

      <Pressable
        onPress={() => router.back()}
        style={[styles.overlayBtn, styles.overlayBtnDark, { top: insets.top + 12, left: 16 }]}
        testID="close-camera"
      >
        <X size={22} color="#FFF" />
      </Pressable>

      <View style={[styles.captureBar, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable style={styles.galleryThumbBtn} onPress={handlePickFromGallery} testID="gallery-button">
          <ImagePlus size={26} color="#FFF" />
        </Pressable>
        <Pressable style={styles.shutterBtn} onPress={handleCapture} disabled={isCapturing} testID="shutter-button">
          {isCapturing
            ? <ActivityIndicator color="#FFF" size="small" />
            : <View style={styles.shutterInner} />}
        </Pressable>
        <View style={styles.captureBarSpacer} />
      </View>
    </View>
  );
}

// ─── constants ────────────────────────────────────────────────────────────────
const HIT = 44; // touch-target size for crop corner handles
const DOT = 16; // visual dot size for crop corner handles

// ─── styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // ── overlay button ─────────────────────────────────────────────────────────
  overlayBtn: {
    position: 'absolute', width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  overlayBtnDark:  { backgroundColor: 'rgba(0,0,0,0.50)' },

  // ── focus ring ─────────────────────────────────────────────────────────────
  focusRing: {
    position: 'absolute', width: 64, height: 64, borderRadius: 32,
    borderWidth: 2, borderColor: '#FFD700', zIndex: 20,
  },

  // ── capture bar ────────────────────────────────────────────────────────────
  captureBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 40, paddingTop: 20,
  },
  galleryThumbBtn: {
    width: 52, height: 52, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  shutterBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#FFF',
    justifyContent: 'center', alignItems: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFF' },
  captureBarSpacer: { width: 52 },

  // ── preview container ──────────────────────────────────────────────────────
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Top section: holds the image area + rotate bar; fills all space above action bar
  previewTop: {
    flex: 1,
  },



  // ── crop overlay ───────────────────────────────────────────────────────────
  cropDim: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cropBorder: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  gridLineH1: {
    position: 'absolute', left: 0, right: 0, top: '33.33%',
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.35)',
  },
  gridLineH2: {
    position: 'absolute', left: 0, right: 0, top: '66.66%',
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.35)',
  },
  gridLineV1: {
    position: 'absolute', top: 0, bottom: 0, left: '33.33%',
    width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.35)',
  },
  gridLineV2: {
    position: 'absolute', top: 0, bottom: 0, left: '66.66%',
    width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.35)',
  },
  // Large transparent hit area — centered on the corner point
  cropHandleTouch: {
    position: 'absolute',
    width: HIT, height: HIT,
    alignItems: 'center', justifyContent: 'center',
  },
  // Small visible dot — centered inside the touch area by the flex parent
  cropHandleDot: {
    width: DOT, height: DOT, borderRadius: DOT / 2,
    backgroundColor: '#FFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5, shadowRadius: 2, elevation: 4,
  },

  // ── bottom bar ─────────────────────────────────────────────────────────────
  bottomBar: {
    backgroundColor: '#000',
  },
  rotateBar: {
    flexDirection: 'row', justifyContent: 'center', gap: 32,
    paddingBottom: 32,
  },
  rotateBtn: {
    alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 8, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rotateBtnDisabled: { opacity: 0.35 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },

  previewSecBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 14, borderRadius: 14,
  },
  previewSecBtnText: { fontSize: 13, fontWeight: '600', color: '#FFF' },

  applyBtn: {
    paddingHorizontal: 18, paddingVertical: 14, borderRadius: 14,
    backgroundColor: Colors.softOrange, justifyContent: 'center', alignItems: 'center',
  },
  applyBtnDisabled: { opacity: 0.5 },
  applyBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },

  confirmBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#4CAF50', paddingVertical: 14, borderRadius: 14,
  },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  // ── success ────────────────────────────────────────────────────────────────
  successPage:    { flex: 1, paddingHorizontal: 20 },
  petImage:       { width: 140, height: 140 },
  successContent: { alignItems: 'center', gap: 16, marginTop: 8 },
  successTitle:   { fontSize: 28, fontWeight: '800', color: Colors.darkBrown },
  successSubtitle:{ fontSize: 18, color: Colors.softOrange, fontWeight: '600' },
  continueBtn: {
    marginTop: 28, alignSelf: 'stretch', backgroundColor: Colors.softOrange,
    paddingVertical: 16, borderRadius: 18, alignItems: 'center',
    shadowColor: Colors.softOrange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 5,
  },
  continueBtnText: { fontSize: 17, fontWeight: '700', color: '#FFF' },

  // ── permission ─────────────────────────────────────────────────────────────
  permissionContainer: {
    backgroundColor: '#FFF8F0', justifyContent: 'center',
    alignItems: 'center', padding: 32, gap: 16,
  },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: Colors.darkBrown, textAlign: 'center' },
  permissionBody: { fontSize: 15, color: Colors.brown, textAlign: 'center', lineHeight: 22 },
  settingsBtn: {
    backgroundColor: Colors.softOrange, paddingVertical: 14,
    paddingHorizontal: 32, borderRadius: 16,
  },
  settingsBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});

import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  Modal,
  ScrollView,
  TextInput,
  Dimensions,
} from 'react-native';
import type {
  PanGestureHandlerGestureEvent,
  PanGestureHandlerStateChangeEvent,
  PinchGestureHandlerGestureEvent,
  PinchGestureHandlerStateChangeEvent,
  TapGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { Gesture, GestureDetector, GestureHandlerRootView, TapGestureHandler, PanGestureHandler, PinchGestureHandler, State } from 'react-native-gesture-handler';
import { Image as ExpoImage } from 'expo-image';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { BlurView } from 'expo-blur';
import { X, Check, ImagePlus, RotateCcw, RotateCw, ArrowLeft, Heart, Users, Download } from 'lucide-react-native';
import Svg, { Defs, RadialGradient as SvgRadialGradient, Stop, Circle as SvgCircle, Path as SvgPath } from 'react-native-svg';

const AnimatedSvgPath = Animated.createAnimatedComponent(SvgPath);

import { router, useLocalSearchParams } from 'expo-router';
import Colors from '@/constants/colors';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import PetPortrait from '@/components/PetPortrait';
import { analyzePhoto } from '@/lib/analyze-photo';
import { applyFoodOutline, cropFood, blurBackground, getContourPaths, ContourResult } from '@/lib/native-segmentation';
import { getFoodScannerEnabled } from '@/lib/camera-settings-storage';
import {
  countUserLlmQueriesLast24h,
  isAtLlmQueryLimit,
} from '@/lib/user-llm-queries';
import { ITEM_TYPE_EMOJI, nutrientToItemType, getNutrientDisplay } from '@/constants/badge-types';
import { usePet } from '@/providers/PetProvider';
import { useAuth } from '@/providers/AuthProvider';
import { uploadPetPhoto, updatePetPhotoCalories } from '@/lib/supabase-photos';
import { Slider } from '@miblanchard/react-native-slider';
import { recordStreakDayIfPhotoUploaded } from '@/lib/user-streak';
import { getMyPartnership, checkAndRecordGoalHit } from '@/lib/partnerships';
import { supabase } from '@/lib/supabase';
import { savePhotoToDevice } from '@/lib/photo-album';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── helpers ──────────────────────────────────────────────────────────────────

const hasSupabaseConfig = () =>
  !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

// Gallery photos can be 10–15 MB; cap before sending to the edge function.
const MAX_ANALYSIS_SIDE = 1280;

/** Bakes resize + rotation + crop into a new JPEG file and returns its URI.
 *  Returns the original URI unchanged only when there are no edits and the image is small. */
async function applyImageEdits(
  uri: string,
  deg: number,
  box: CropBox,
  natural: { w: number; h: number } | null,
): Promise<string> {
  const hasCrop = box.l > 0.005 || box.t > 0.005 || box.r < 0.995 || box.b < 0.995;
  const needsResize = natural ? Math.max(natural.w, natural.h) > MAX_ANALYSIS_SIDE : false;
  if (deg === 0 && !hasCrop && !needsResize) return uri;

  const actions: Parameters<typeof manipulateAsync>[1] = [];

  if (needsResize && natural) {
    const scale = MAX_ANALYSIS_SIDE / Math.max(natural.w, natural.h);
    actions.push({ resize: { width: Math.round(natural.w * scale) } });
  }

  if (deg !== 0) actions.push({ rotate: deg });

  if (hasCrop && natural) {
    const swapped = deg % 180 !== 0;
    const scaleFactor = needsResize ? MAX_ANALYSIS_SIDE / Math.max(natural.w, natural.h) : 1;
    const scaledW = Math.round(natural.w * scaleFactor);
    const scaledH = Math.round(natural.h * scaleFactor);
    const rotW = swapped ? scaledH : scaledW;
    const rotH = swapped ? scaledW : scaledH;
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

// ─── zoom presets ─────────────────────────────────────────────────────────────

const ZOOM_PRESETS = [
  { label: '0.5×', value: 0 },
  { label: '1×',   value: 0.10 },
  { label: '1.5×', value: 0.15 },
  { label: '2×',   value: 0.20 },
] as const;

// ─── types ────────────────────────────────────────────────────────────────────

type Phase  = 'capture' | 'preview' | 'analyzing' | 'success';
type CropBox = { l: number; t: number; r: number; b: number };
const FULL_BOX: CropBox = { l: 0, t: 0, r: 1, b: 1 };

const SPARKLE_DEFS = [
  { angle: 0,   startDist: 100, endDist: 140, color: '#FFB3C6', size: 6 },
  { angle: 30,  startDist: 120, endDist: 158, color: '#C3B1E1', size: 5 },
  { angle: 60,  startDist: 90,  endDist: 132, color: '#B5EAD7', size: 7 },
  { angle: 90,  startDist: 110, endDist: 150, color: '#FFF5BA', size: 5 },
  { angle: 120, startDist: 95,  endDist: 138, color: '#FFB3C6', size: 6 },
  { angle: 150, startDist: 115, endDist: 158, color: '#C3B1E1', size: 8 },
  { angle: 180, startDist: 105, endDist: 148, color: '#B5EAD7', size: 5 },
  { angle: 210, startDist: 125, endDist: 165, color: '#FFF5BA', size: 7 },
  { angle: 240, startDist: 100, endDist: 140, color: '#FFB3C6', size: 5 },
  { angle: 270, startDist: 110, endDist: 152, color: '#C3B1E1', size: 6 },
  { angle: 300, startDist: 90,  endDist: 132, color: '#B5EAD7', size: 8 },
  { angle: 330, startDist: 122, endDist: 162, color: '#FFF5BA', size: 5 },
] as const;

function getReactionTitle(
  healthScore: number,
  petName: string,
  t: (key: string, opts?: object) => string,
): string {
  if (healthScore <= 2) return t('camera.reactionScore.disliked', { name: petName });
  if (healthScore <= 5) return t('camera.reactionScore.liked', { name: petName });
  if (healthScore <= 8) return t('camera.reactionScore.likedAlot', { name: petName });
  return t('camera.reactionScore.loved', { name: petName });
}

// ─── full-screen image viewer ─────────────────────────────────────────────────

const DISMISS_DIST     = 100;
const DISMISS_VELOCITY = 700;

function FullScreenViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const committed    = useRef({ scale: 1, tx: 0, ty: 0 });
  const panBase      = useRef({ tx: 0, ty: 0 });
  const imgNat       = useRef<{ w: number; h: number } | null>(null);
  const isZoomedRef  = useRef(false);

  const baseScale    = useRef(new Animated.Value(1)).current;
  const pinchScale   = useRef(new Animated.Value(1)).current;
  const scale        = useMemo(() => Animated.multiply(baseScale, pinchScale), [baseScale, pinchScale]);
  const txAnim       = useRef(new Animated.Value(0)).current;
  const tyAnim       = useRef(new Animated.Value(0)).current;
  const bgOpacity    = useRef(new Animated.Value(1)).current;

  const doubleTapRef = useRef<TapGestureHandler>(null);
  const singleTapRef = useRef<TapGestureHandler>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    const result = await savePhotoToDevice(uri);
    setIsSaving(false);
    if (!result.success) Alert.alert('Failed to save', result.error ?? 'Could not save photo.');
  }, [uri, isSaving]);

  const maxOffset = (s: number) => {
    const nat = imgNat.current;
    const fit = (nat && nat.w > 0 && nat.h > 0)
      ? Math.min(SCREEN_WIDTH / nat.w, SCREEN_HEIGHT / nat.h)
      : 1;
    const imgW = nat ? nat.w * fit : SCREEN_WIDTH;
    const imgH = nat ? nat.h * fit : SCREEN_HEIGHT;
    return {
      maxTx: Math.max(0, (imgW * s - SCREEN_WIDTH)  / 2),
      maxTy: Math.max(0, (imgH * s - SCREEN_HEIGHT) / 2),
    };
  };

  const commitOffset = (tx: number, ty: number, s: number) => {
    const { maxTx, maxTy } = maxOffset(s);
    committed.current.tx = Math.max(-maxTx, Math.min(maxTx, tx));
    committed.current.ty = Math.max(-maxTy, Math.min(maxTy, ty));
    txAnim.setValue(committed.current.tx);
    tyAnim.setValue(committed.current.ty);
  };

  const onPinchEvent = useCallback(
    (e: PinchGestureHandlerGestureEvent) => {
      // Allow reducing below 1x only when starting from 1x (not while zoomed in)
      const minScale = committed.current.scale > 1 ? 1 : 0.05;
      const liveScale = Math.max(minScale, Math.min(committed.current.scale * e.nativeEvent.scale, 4));
      pinchScale.setValue(liveScale / committed.current.scale);
      if (liveScale < 1) {
        bgOpacity.setValue(liveScale);
        txAnim.setValue(0);
        tyAnim.setValue(0);
      } else {
        const { maxTx, maxTy } = maxOffset(liveScale);
        txAnim.setValue(Math.max(-maxTx, Math.min(maxTx, committed.current.tx)));
        tyAnim.setValue(Math.max(-maxTy, Math.min(maxTy, committed.current.ty)));
      }
    },
    [pinchScale, txAnim, tyAnim, bgOpacity],
  );

  const onPinchStateChange = useCallback(
    (e: PinchGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.oldState !== State.ACTIVE) return;
      const minScale = committed.current.scale > 1 ? 1 : 0.05;
      const next = Math.max(minScale, Math.min(committed.current.scale * e.nativeEvent.scale, 4));
      pinchScale.setValue(1);

      if (next < 0.6) {
        // Dismiss: shrink to nothing and fade out
        committed.current = { scale: next, tx: 0, ty: 0 };
        baseScale.setValue(next);
        isZoomedRef.current = false;
        Animated.parallel([
          Animated.timing(baseScale, { toValue: 0,   duration: 200, useNativeDriver: false }),
          Animated.timing(bgOpacity, { toValue: 0,   duration: 180, useNativeDriver: false }),
        ]).start(() => onClose());
      } else if (next < 1) {
        // Spring back to 1x
        committed.current = { scale: 1, tx: 0, ty: 0 };
        baseScale.setValue(next);
        isZoomedRef.current = false;
        Animated.parallel([
          Animated.spring(baseScale, { toValue: 1, useNativeDriver: false, friction: 7, tension: 120 }),
          Animated.spring(bgOpacity, { toValue: 1, useNativeDriver: false, friction: 7, tension: 120 }),
        ]).start();
      } else {
        committed.current.scale = next;
        baseScale.setValue(next);
        if (next <= 1) {
          committed.current.tx = 0;
          committed.current.ty = 0;
          txAnim.setValue(0);
          tyAnim.setValue(0);
          isZoomedRef.current = false;
        } else {
          commitOffset(committed.current.tx, committed.current.ty, next);
          isZoomedRef.current = true;
        }
      }
    },
    [baseScale, pinchScale, txAnim, tyAnim, bgOpacity, onClose],
  );

  const onDoubleTap = useCallback(
    (e: TapGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state !== State.ACTIVE) return;
      if (committed.current.scale > 1) {
        committed.current = { scale: 1, tx: 0, ty: 0 };
        isZoomedRef.current = false;
        Animated.parallel([
          Animated.spring(baseScale, { toValue: 1, useNativeDriver: false, friction: 7, tension: 120 }),
          Animated.spring(txAnim,    { toValue: 0, useNativeDriver: false, friction: 7, tension: 120 }),
          Animated.spring(tyAnim,    { toValue: 0, useNativeDriver: false, friction: 7, tension: 120 }),
        ]).start();
      } else {
        committed.current = { scale: 2, tx: 0, ty: 0 };
        isZoomedRef.current = true;
        Animated.spring(baseScale, { toValue: 2, useNativeDriver: false, friction: 7, tension: 120 }).start();
      }
    },
    [baseScale, txAnim, tyAnim],
  );

  const onSingleTap = useCallback(
    (e: TapGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state !== State.ACTIVE) return;
      if (isZoomedRef.current) return;
      const nat = imgNat.current;
      if (!nat || nat.w === 0 || nat.h === 0) return;
      const fit = Math.min(SCREEN_WIDTH / nat.w, SCREEN_HEIGHT / nat.h);
      const renderedW = nat.w * fit;
      const renderedH = nat.h * fit;
      const imgLeft = (SCREEN_WIDTH  - renderedW) / 2;
      const imgTop  = (SCREEN_HEIGHT - renderedH) / 2;
      const { x, y } = e.nativeEvent;
      if (x < imgLeft || x > imgLeft + renderedW || y < imgTop || y > imgTop + renderedH) {
        onClose();
      }
    },
    [onClose],
  );

  const onPanEvent = useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      const dx = e.nativeEvent.translationX;
      const dy = e.nativeEvent.translationY;
      if (isZoomedRef.current) {
        const { maxTx, maxTy } = maxOffset(committed.current.scale);
        txAnim.setValue(Math.max(-maxTx, Math.min(maxTx, panBase.current.tx + dx)));
        tyAnim.setValue(Math.max(-maxTy, Math.min(maxTy, panBase.current.ty + dy)));
      } else {
        txAnim.setValue(dx);
        tyAnim.setValue(dy);
        const dist = Math.sqrt(dx * dx + dy * dy);
        bgOpacity.setValue(Math.max(0, 1 - dist / 220));
      }
    },
    [txAnim, tyAnim, bgOpacity],
  );

  const onPanStateChange = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      if (isZoomedRef.current) {
        if (e.nativeEvent.state === State.BEGAN) {
          panBase.current = { tx: committed.current.tx, ty: committed.current.ty };
        } else if (e.nativeEvent.oldState === State.ACTIVE) {
          commitOffset(
            panBase.current.tx + e.nativeEvent.translationX,
            panBase.current.ty + e.nativeEvent.translationY,
            committed.current.scale,
          );
        }
      } else if (e.nativeEvent.oldState === State.ACTIVE) {
        const dx    = e.nativeEvent.translationX;
        const dy    = e.nativeEvent.translationY;
        const dist  = Math.sqrt(dx * dx + dy * dy);
        const speed = Math.sqrt(e.nativeEvent.velocityX ** 2 + e.nativeEvent.velocityY ** 2);

        if (dist > DISMISS_DIST || speed > DISMISS_VELOCITY) {
          const flyFactor = 600 / Math.max(dist, 1);
          Animated.parallel([
            Animated.timing(txAnim,    { toValue: dx * flyFactor, duration: 220, useNativeDriver: false }),
            Animated.timing(tyAnim,    { toValue: dy * flyFactor, duration: 220, useNativeDriver: false }),
            Animated.timing(bgOpacity, { toValue: 0,              duration: 180, useNativeDriver: false }),
          ]).start(() => onClose());
        } else {
          Animated.parallel([
            Animated.spring(txAnim,    { toValue: 0, useNativeDriver: false, friction: 7, tension: 120 }),
            Animated.spring(tyAnim,    { toValue: 0, useNativeDriver: false, friction: 7, tension: 120 }),
            Animated.spring(bgOpacity, { toValue: 1, useNativeDriver: false, friction: 7, tension: 120 }),
          ]).start();
        }
      }
    },
    [txAnim, tyAnim, bgOpacity, onClose],
  );

  return (
    <GestureHandlerRootView style={fsStyles.overlay}>
      <Animated.View style={[StyleSheet.absoluteFill, fsStyles.backdrop, { opacity: bgOpacity }]} />
      <TapGestureHandler ref={singleTapRef} numberOfTaps={1} onHandlerStateChange={onSingleTap}>
        <TapGestureHandler ref={doubleTapRef} numberOfTaps={2} onHandlerStateChange={onDoubleTap}>
          <PanGestureHandler
            onGestureEvent={onPanEvent}
            onHandlerStateChange={onPanStateChange}
            minPointers={1}
            maxPointers={1}
          >
            <PinchGestureHandler
              onGestureEvent={onPinchEvent}
              onHandlerStateChange={onPinchStateChange}
            >
              <Animated.View
                style={[fsStyles.imageContainer, { transform: [{ translateX: txAnim }, { translateY: tyAnim }, { scale }] }]}
              >
                <ExpoImage
                  source={{ uri }}
                  style={fsStyles.image}
                  contentFit="contain"
                  onLoad={(e) => { imgNat.current = { w: e.source.width, h: e.source.height }; }}
                />
              </Animated.View>
            </PinchGestureHandler>
          </PanGestureHandler>
        </TapGestureHandler>
      </TapGestureHandler>
      <Pressable style={fsStyles.downloadBtn} onPress={handleSave} disabled={isSaving} hitSlop={12}>
        {isSaving
          ? <ActivityIndicator size="small" color="#FFF" />
          : <Download size={22} color="#FFF" />
        }
      </Pressable>
    </GestureHandlerRootView>
  );
}

const fsStyles = StyleSheet.create({
  overlay:        { flex: 1 },
  backdrop:       { backgroundColor: 'rgba(0,0,0,0.92)' },
  imageContainer: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  image:          { width: '100%', height: '100%' },
  downloadBtn: {
    position: 'absolute',
    top: 52,
    right: 24,
    padding: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 20,
  },
});

// ─── component ────────────────────────────────────────────────────────────────

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { t, locale } = useAppTranslation();
  const { addPhoto, petName, petType, mood, userId, addBadges, petPrimaryColor } = usePet();
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const { demo } = useLocalSearchParams<{ demo?: string }>();

  const [phase, setPhase]               = useState<Phase>('capture');
  const [capturedUri, setCapturedUri]   = useState<string | null>(null);
  const [displayUri, setDisplayUri]     = useState<string | null>(null);
  const [displayCalorieStr, setDisplayCalorieStr] = useState('');
  const originalCalorieRef = useRef(0);
  const [isCapturing, setIsCapturing]   = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ calories: number; nutrients: string[]; healthScore: number; reason?: string } | null>(null);
  const [portionFraction, setPortionFraction] = useState(1.0);
  const uploadedPhotoIdRef = useRef<number | null>(null);
  const portionFractionRef = useRef(1.0);
  const displayCalorieRef = useRef('');

  // ── zoom & focus (capture phase) ────────────────────────────────────────────
  const [zoom, setZoom]             = useState(0.05);
  const [activePreset, setActivePreset] = useState(1); // index into ZOOM_PRESETS; 1 = '1×'
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const zoomBase       = useRef(0);
  const focusOpacity   = useRef(new Animated.Value(0)).current;
  const focusRingScale = useRef(new Animated.Value(1)).current;
  const cameraRef      = useRef<CameraView>(null);

  // ── partnership (reuses cached query from group.tsx) ────────────────────────
  const { data: activePartnership } = useQuery({
    queryKey: ['myPartnership', userId],
    queryFn: () => getMyPartnership(userId!),
    enabled: !!userId,
    staleTime: 30_000,
    gcTime: 24 * 60 * 60 * 1000,
  });

  // ── success animations ───────────────────────────────────────────────────────
  const successAnim      = useRef(new Animated.Value(0)).current;
  const bounceAnim       = useRef(new Animated.Value(0)).current;
  const jumpAnim         = useRef(new Animated.Value(0)).current;
  const wiggleAnim       = useRef(new Animated.Value(0)).current;
  const heartAnim1       = useRef(new Animated.Value(0)).current;
  const heartAnim2       = useRef(new Animated.Value(0)).current;
  const heartAnim3       = useRef(new Animated.Value(0)).current;
  const heartAnim4       = useRef(new Animated.Value(0)).current;
  const heartAnim5       = useRef(new Animated.Value(0)).current;
  const heartAnim6       = useRef(new Animated.Value(0)).current;
  const heartAnim7       = useRef(new Animated.Value(0)).current;
  const heartAnim8       = useRef(new Animated.Value(0)).current;
  const loveSwayAnim     = useRef(new Animated.Value(0)).current;
  const loveModeRef      = useRef(false);
  const sparkleRotAnim   = useRef(new Animated.Value(0)).current;
  const partnerBannerAnim = useRef(new Animated.Value(0)).current;

  // ── food scanner ────────────────────────────────────────────────────────────
  const scanAnim = useRef(new Animated.Value(-35)).current;
  const flyScaleAnim = useRef(new Animated.Value(1)).current;
  const flyTranslateYAnim = useRef(new Animated.Value(0)).current;
  const flyOpacityAnim = useRef(new Animated.Value(1)).current;
  const bgDissolveAnim = useRef(new Animated.Value(1)).current;
  const sparkleAnim    = useRef(new Animated.Value(0)).current;
  const stickerAnim    = useRef(new Animated.Value(0)).current;
  const haloAnim       = useRef(new Animated.Value(0)).current;
  const scanContainerRef = useRef<{ top: number; height: number } | null>(null);
  const [scanPhase, setScanPhase] = useState<null | 'scanning' | 'outline' | 'crop' | 'dissolving' | 'flying'>(null);
  const [outlineUri, setOutlineUri] = useState<string | null>(null);
  const [croppedOverlayUri, setCroppedOverlayUri] = useState<string | null>(null);
  const [savePreviewUri, setSavePreviewUri]       = useState<string | null>(null);
  const [fullScreenUri, setFullScreenUri]         = useState<string | null>(null);
  const [contourResult, setContourResult]         = useState<ContourResult | null>(null);
  const contourAnimsRef = useRef<Animated.Value[]>([]);
  const getOrCreateContourAnim = (i: number): Animated.Value => {
    while (contourAnimsRef.current.length <= i) {
      contourAnimsRef.current.push(new Animated.Value(0));
    }
    return contourAnimsRef.current[i];
  };
  const [foodScannerEnabled, setFoodScannerEnabled] = useState(false);

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

  // ── success animations ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'success') {
      jumpAnim.setValue(0);
      wiggleAnim.setValue(0);
      loveSwayAnim.setValue(0);
      heartAnim1.setValue(0); heartAnim2.setValue(0); heartAnim3.setValue(0);
      heartAnim4.setValue(0); heartAnim5.setValue(0); heartAnim6.setValue(0);
      heartAnim7.setValue(0); heartAnim8.setValue(0);
      sparkleRotAnim.setValue(0);
      partnerBannerAnim.setValue(0);
      return;
    }

    const floatHeart = (anim: Animated.Value, delay: number, duration = 1100) => {
      anim.setValue(0);
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
          Animated.delay(300),
        ])
      );
    };

    const spin = Animated.loop(
      Animated.timing(sparkleRotAnim, { toValue: 1, duration: loveModeRef.current ? 2000 : 3200, useNativeDriver: true })
    );
    const banner = Animated.spring(partnerBannerAnim, { toValue: 1, friction: 7, tension: 100, useNativeDriver: true });

    if (loveModeRef.current) {
      // Happy hops with a gentle sway
      const hop = Animated.loop(Animated.sequence([
        Animated.timing(jumpAnim, { toValue: -48, duration: 240, useNativeDriver: true }),
        Animated.spring(jumpAnim, { toValue: 0, friction: 4, tension: 220, useNativeDriver: true }),
        Animated.delay(200),
      ]));
      const wiggle = Animated.loop(Animated.sequence([
        Animated.delay(180),
        Animated.timing(wiggleAnim, { toValue: 10, duration: 80, useNativeDriver: true }),
        Animated.timing(wiggleAnim, { toValue: -10, duration: 80, useNativeDriver: true }),
        Animated.timing(wiggleAnim, { toValue: 6,  duration: 70, useNativeDriver: true }),
        Animated.timing(wiggleAnim, { toValue: 0,  duration: 70, useNativeDriver: true }),
        Animated.delay(220),
      ]));
      const sway = Animated.loop(Animated.sequence([
        Animated.timing(loveSwayAnim, { toValue: 8, duration: 320, useNativeDriver: true }),
        Animated.timing(loveSwayAnim, { toValue: -8, duration: 320, useNativeDriver: true }),
      ]));
      const hearts = [
        floatHeart(heartAnim1, 0, 900),   floatHeart(heartAnim2, 160, 1000),
        floatHeart(heartAnim3, 320, 850),  floatHeart(heartAnim4, 480, 950),
        floatHeart(heartAnim5, 640, 1050), floatHeart(heartAnim6, 800, 900),
        floatHeart(heartAnim7, 960, 1000), floatHeart(heartAnim8, 1120, 850),
      ];
      hop.start(); wiggle.start(); sway.start(); spin.start(); banner.start();
      hearts.forEach(h => h.start());
      return () => { hop.stop(); wiggle.stop(); sway.stop(); spin.stop(); hearts.forEach(h => h.stop()); };
    }

    // Normal success: bigger hop with side wiggle
    const hop = Animated.loop(
      Animated.sequence([
        Animated.timing(jumpAnim, { toValue: -36, duration: 220, useNativeDriver: true }),
        Animated.spring(jumpAnim, { toValue: 0, friction: 4, tension: 200, useNativeDriver: true }),
        Animated.delay(240),
      ])
    );
    const wiggle = Animated.loop(
      Animated.sequence([
        Animated.delay(200),
        Animated.timing(wiggleAnim, { toValue: 9,  duration: 75, useNativeDriver: true }),
        Animated.timing(wiggleAnim, { toValue: -9, duration: 75, useNativeDriver: true }),
        Animated.timing(wiggleAnim, { toValue: 6,  duration: 65, useNativeDriver: true }),
        Animated.timing(wiggleAnim, { toValue: 0,  duration: 65, useNativeDriver: true }),
        Animated.delay(260),
      ])
    );
    const h1 = floatHeart(heartAnim1, 0);
    const h2 = floatHeart(heartAnim2, 380);
    const h3 = floatHeart(heartAnim3, 740);

    hop.start(); wiggle.start(); h1.start(); h2.start(); h3.start(); spin.start(); banner.start();
    return () => { hop.stop(); wiggle.stop(); h1.stop(); h2.stop(); h3.stop(); spin.stop(); };
  }, [phase, jumpAnim, wiggleAnim, loveSwayAnim, heartAnim1, heartAnim2, heartAnim3, heartAnim4, heartAnim5, heartAnim6, heartAnim7, heartAnim8, sparkleRotAnim, partnerBannerAnim]);

  // ── analyzing animations (gentle bob while waiting) ──────────────────────────
  useEffect(() => {
    if (phase !== 'analyzing') return;
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(jumpAnim, { toValue: -18, duration: 380, useNativeDriver: true }),
        Animated.spring(jumpAnim, { toValue: 0, friction: 5, tension: 180, useNativeDriver: true }),
        Animated.delay(320),
      ])
    );
    const sway = Animated.loop(
      Animated.sequence([
        Animated.delay(180),
        Animated.timing(wiggleAnim, { toValue: 4,  duration: 130, useNativeDriver: true }),
        Animated.timing(wiggleAnim, { toValue: -4, duration: 130, useNativeDriver: true }),
        Animated.timing(wiggleAnim, { toValue: 0,  duration: 110, useNativeDriver: true }),
        Animated.delay(380),
      ])
    );
    bob.start(); sway.start();
    return () => { bob.stop(); sway.stop(); };
  }, [phase, jumpAnim, wiggleAnim]);

  // ── demo mode (dev only) ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!demo) return;
    const ALL_NUTRIENTS = ['protein', 'fiber', 'vitamin-c', 'calcium', 'iron', 'vitamin-d', 'omega-3'];
    const healthScore = Math.floor(Math.random() * 10) + 1;
    const calories    = Math.floor(Math.random() * 800) + 100;
    const nutrients   = ALL_NUTRIENTS.filter(() => Math.random() < 0.45);
    const data = { healthScore, calories, nutrients, reason: '' };
    setAnalysisResult(data);
    setDisplayCalorieStr(String(calories));
    displayCalorieRef.current = String(calories);
    originalCalorieRef.current = calories;
    loveModeRef.current = healthScore > 8;
    setPhase('success');
  // startSuccessAnimations runs via the phase useEffect; no need to call it here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getFoodScannerEnabled().then(setFoodScannerEnabled);
  }, []);

  // Trigger stroke-draw animation when the outline phase starts
  useEffect(() => {
    if (scanPhase !== 'outline' || !contourResult || contourResult.paths.length === 0) return;
    const pr = previewLayoutRef.current;
    const nat = imgNaturalRef.current;
    if (!pr || !nat) return;
    const rect = getImgRect(pr.w, pr.h, nat.w, nat.h, rotDegRef.current);
    const cb = cropBoxRef.current;
    const svgW = (cb.r - cb.l) * rect.w;
    const svgH = (cb.b - cb.t) * rect.h;
    const scaleX = contourResult.imageWidth  > 0 ? svgW / contourResult.imageWidth  : 1;
    const scaleY = contourResult.imageHeight > 0 ? svgH / contourResult.imageHeight : 1;
    // Use the smaller scale (contain behaviour) to match SVG preserveAspectRatio
    const scale = Math.min(scaleX, scaleY);

    contourResult.paths.forEach((path, i) => {
      const displayLength = path.length * scale;
      const anim = getOrCreateContourAnim(i);
      anim.setValue(displayLength);
      Animated.timing(anim, {
        toValue: 0,
        duration: Math.min(600, Math.max(300, displayLength * 0.6)),
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
    });
  }, [scanPhase, contourResult]);

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
  const startSuccessAnimations = useCallback(() => {
    Animated.parallel([
      Animated.spring(successAnim, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -15, duration: 150, useNativeDriver: true }),
        Animated.spring(bounceAnim, { toValue: 0, friction: 3, tension: 200, useNativeDriver: true }),
      ]),
    ]).start();
  }, [successAnim, bounceAnim]);

  const handleConfirm = useCallback(async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addPhoto();

    // Reset per-share state
    setPortionFraction(1.0);
    portionFractionRef.current = 1.0;
    uploadedPhotoIdRef.current = null;
    uploadedPhotoIdRef.current = null;
    setDisplayUri(null);

    if (!capturedUri || !hasSupabaseConfig()) {
      const ALL_NUTRIENTS = ['protein', 'fiber', 'vitamin-c', 'calcium', 'iron', 'vitamin-d', 'omega-3'];
      const healthScore = Math.floor(Math.random() * 10) + 1;
      const calories    = Math.floor(Math.random() * 800) + 100;
      const nutrients   = ALL_NUTRIENTS.filter(() => Math.random() < 0.45);
      setAnalysisResult({ calories, nutrients, healthScore, reason: '' });
      setDisplayCalorieStr(String(calories));
      displayCalorieRef.current = String(calories);
      originalCalorieRef.current = calories;
      loveModeRef.current = healthScore > 8;
      setPhase('success');
      startSuccessAnimations();
      setIsConfirming(false);
      return;
    }

    const editDeg = ((rotTarget.current % 360) + 360) % 360;
    const editBox = { ...cropBoxRef.current };
    const editNatural = imgNaturalRef.current;

    let uploadUri = capturedUri;
    let analysisUri = capturedUri;

    // ── Inner helpers ────────────────────────────────────────────────────────
    const doAnalysis = async (uri: string) => {
      let skip = false;
      if (user?.id) {
        try {
          const { data: row } = await supabase
            .from('user_info').select('is_admin').eq('user_id', user.id).maybeSingle();
          const isAdmin = (row as { is_admin?: boolean } | null)?.is_admin === true;
          if (!isAdmin) {
            const count = await countUserLlmQueriesLast24h(user.id);
            if (isAtLlmQueryLimit(count)) skip = true;
          }
        } catch (err) { console.error('[Camera] LLM rate limit check failed:', err); }
      }
      if (skip) return { nutrients: [] as string[], calorie: 0, healthScore: 0, reason: undefined };
      const result = await analyzePhoto(uri, session?.access_token, locale);
      if (result.success) return { nutrients: result.nutrients, calorie: result.calorie, healthScore: result.healthScore, reason: result.reason };
      return { nutrients: [] as string[], calorie: 0, healthScore: 0, reason: undefined };
    };

    const doBgUpload = (bgUploadUri: string, bgNutrients: string[], bgCalorie: number) => {
      (async () => {
        try {
          if (userId && user?.id === userId && bgNutrients.length > 0) {
            await addBadges(bgNutrients);
          }
          let cloudUploadDone = false;
          if (userId && user?.id === userId) {
            const uploaded = await uploadPetPhoto(
              bgUploadUri, userId,
              bgNutrients.length > 0 || bgCalorie > 0 ? { nutrients: bgNutrients, calorie: bgCalorie } : undefined,
            );
            uploadedPhotoIdRef.current = uploaded.id;
            cloudUploadDone = true;
            queryClient.setQueryData<import('@/lib/supabase-photos').PetPhoto[]>(
              ['albumPhotos', userId], (prev) => [uploaded, ...(prev ?? [])],
            );
            const pendingCalorie = parseInt(displayCalorieRef.current, 10);
            if (!isNaN(pendingCalorie) && pendingCalorie !== bgCalorie) {
              await updatePetPhotoCalories(uploaded.id, pendingCalorie)
                .catch((e) => console.warn('[Camera] calorie update after upload:', e));
            }
          }
          if (cloudUploadDone && userId) {
            await recordStreakDayIfPhotoUploaded(userId, new Date())
              .catch((err) => console.error('[Camera] streak update:', err));
            console.log('[notify-partner-photo] activePartnership:', JSON.stringify(activePartnership ?? null));
            console.log('[notify-partner-photo] session present:', !!session, '| access_token present:', !!session?.access_token);
            if (activePartnership) {
              supabase.functions.invoke('notify-partner-photo', {
                headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
              })
                .then(({ data, error }) => {
                  if (error) console.warn('[notify-partner-photo] invoke error:', error);
                  else console.log('[notify-partner-photo] response:', JSON.stringify(data));
                })
                .catch((err: unknown) => console.warn('[notify-partner-photo] invoke threw:', err));
            } else {
              console.log('[notify-partner-photo] skipped — no active partnership');
            }
            if (activePartnership && userId) {
              checkAndRecordGoalHit(activePartnership, userId)
                .catch((e) => console.warn('[Camera] goal hit check:', e));
            }
          }
        } catch (e) { console.error('[Camera] Background upload/badges error:', e); }
      })();
    };

    try {
      if (foodScannerEnabled) {
        // ── Compute scan bounds from the user's crop box ──────────────────────
        let scanTop = 0;
        let scanBottom = previewLayoutRef.current?.h ?? 700;
        if (previewLayoutRef.current && editNatural) {
          const rect = getImgRect(
            previewLayoutRef.current.w, previewLayoutRef.current.h,
            editNatural.w, editNatural.h, editDeg,
          );
          scanTop    = rect.y + editBox.t * rect.h;
          scanBottom = rect.y + editBox.b * rect.h;
        }
        const scanH = scanBottom - scanTop;
        scanContainerRef.current = { top: scanTop, height: scanH };

        // Step 1: scan animation clipped to crop-box bounds, coords relative to container
        setScanPhase('scanning');
        scanAnim.setValue(-35);
        const scanDone = new Promise<void>(res =>
          Animated.timing(scanAnim, {
            toValue: scanH + 35,
            duration: 900,
            easing: Easing.linear,
            useNativeDriver: true,
          }).start(() => res())
        );
        const [, { outlined, cropped, blurred, contours }] = await Promise.all([
          scanDone,
          (async () => {
            try { uploadUri = await applyImageEdits(capturedUri, editDeg, editBox, editNatural); }
            catch (e) { console.error('[Camera] apply edits (scanner):', e); }
            const [outl, crop, blurred, contours] = await Promise.all([
              applyFoodOutline(uploadUri),
              cropFood(uploadUri),
              blurBackground(uploadUri),
              getContourPaths(uploadUri),
            ]);
            return { outlined: outl, cropped: crop, blurred, contours };
          })(),
        ]);

        // Step 2: draw white outline (~650ms — allows stroke animation to complete)
        setOutlineUri(outlined);
        setCroppedOverlayUri(cropped);
        setContourResult(contours.paths.length > 0 ? contours : null);
        setScanPhase('outline');
        await new Promise<void>(res => setTimeout(res, 650));

        // Step 3: reveal isolated food on blurred background — fire analysis NOW
        analysisUri = cropped !== uploadUri ? cropped : uploadUri;
        bgDissolveAnim.setValue(1);
        setSavePreviewUri(blurred !== uploadUri ? blurred : null);
        setScanPhase('crop');
        const analysisPromise = doAnalysis(analysisUri);

        // 3-part crop-reveal animation
        sparkleAnim.setValue(0); stickerAnim.setValue(0); haloAnim.setValue(0);
        Animated.parallel([
          Animated.timing(sparkleAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(100),
            Animated.timing(stickerAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(300),
            Animated.timing(haloAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          ]),
        ]).start();

        await new Promise<void>(res => setTimeout(res, 800));

        // Step 4: fly food toward success box (blurred background stays visible)
        setScanPhase('dissolving'); // keep for croppedOverlayUri visibility condition
        flyScaleAnim.setValue(1);
        flyTranslateYAnim.setValue(0);
        flyOpacityAnim.setValue(1);
        setScanPhase('flying');
        const flyH = previewLayoutRef.current?.h ?? 700;
        const flyW = previewLayoutRef.current?.w ?? 393;
        const imgNat = imgNaturalRef.current ?? { w: flyW, h: flyH };
        const flyImgRect = getImgRect(flyW, flyH, imgNat.w, imgNat.h, ((rotTarget.current % 360) + 360) % 360);
        const cb = cropBoxRef.current;
        const flyCropRect = {
          x: flyImgRect.x + cb.l * flyImgRect.w,
          y: flyImgRect.y + cb.t * flyImgRect.h,
          w: (cb.r - cb.l) * flyImgRect.w,
          h: (cb.b - cb.t) * flyImgRect.h,
        };
        const flyTargetScale = 160 / flyCropRect.w;
        const flyTargetY = 196 - (flyCropRect.y + flyCropRect.h / 2);
        await new Promise<void>(res =>
          Animated.parallel([
            Animated.timing(flyScaleAnim, { toValue: flyTargetScale, duration: 650, useNativeDriver: true }),
            Animated.timing(flyTranslateYAnim, { toValue: flyTargetY, duration: 650, useNativeDriver: true }),
            Animated.timing(flyOpacityAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
          ]).start(() => res())
        );

        setScanPhase(null);
        // Show the blurred-background composite on the success screen
        const saveUri = blurred !== uploadUri ? blurred : uploadUri;
        setSavePreviewUri(null);
        setDisplayUri(saveUri);

        // Await analysis (likely already done during the 1.1s of crop+fly)
        const { nutrients, calorie, healthScore, reason } = await analysisPromise;
        setAnalysisResult({ calories: calorie, nutrients, healthScore, reason });
        setDisplayCalorieStr(String(calorie));
        displayCalorieRef.current = String(calorie);
        originalCalorieRef.current = calorie;
        loveModeRef.current = healthScore > 8;
        setPhase('success');
        startSuccessAnimations();
        doBgUpload(saveUri, nutrients, calorie);

      } else {
        // ── Non-scanner: existing analyzing-page flow ─────────────────────────
        setPhase('analyzing');
        try {
          uploadUri = await applyImageEdits(capturedUri, editDeg, editBox, editNatural);
        } catch (e) {
          console.error('[Camera] apply edits on confirm:', e);
        }
        setDisplayUri(uploadUri);
        analysisUri = uploadUri;
        applyFoodOutline(uploadUri).then(outlined => {
          if (outlined !== uploadUri) setDisplayUri(outlined);
        });

        const { nutrients, calorie, healthScore, reason } = await doAnalysis(analysisUri);
        setAnalysisResult({ calories: calorie, nutrients, healthScore, reason });
        setDisplayCalorieStr(String(calorie));
        displayCalorieRef.current = String(calorie);
        originalCalorieRef.current = calorie;
        loveModeRef.current = healthScore > 8;
        setPhase('success');
        startSuccessAnimations();
        doBgUpload(uploadUri, nutrients, calorie);
      }
    } catch (e) {
      console.error('[Camera] Analysis error:', e);
      setScanPhase(null);
      setAnalysisResult({ calories: 0, nutrients: [], healthScore: 0 });
      setDisplayCalorieStr('0');
      displayCalorieRef.current = '0';
      loveModeRef.current = false;
      setPhase('success');
      startSuccessAnimations();
    } finally {
      setIsConfirming(false);
    }
  }, [isConfirming, addPhoto, addBadges, startSuccessAnimations, capturedUri, userId, user?.id, session, queryClient, activePartnership, locale, foodScannerEnabled]);

  const handleContinue = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const photoId = uploadedPhotoIdRef.current;
    const finalCalorie = parseInt(displayCalorieRef.current, 10);
    if (photoId && !isNaN(finalCalorie) && finalCalorie !== originalCalorieRef.current) {
      await updatePetPhotoCalories(photoId, finalCalorie)
        .catch((e) => console.warn('[Camera] calorie update on continue:', e));
    }
    router.back();
  }, []);

  // ── camera gestures (capture phase) ──────────────────────────────────────────
  const showFocusRing = useCallback((screenX: number, screenY: number) => {
    setFocusPoint({ x: screenX, y: screenY });
    focusOpacity.setValue(1);
    focusRingScale.setValue(1.25);
    Animated.parallel([
      Animated.spring(focusRingScale, { toValue: 1, friction: 8, tension: 160, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(1500),
        Animated.timing(focusOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start(() => setFocusPoint(null));
  }, [focusOpacity, focusRingScale]);

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => { zoomBase.current = zoom; })
    .onUpdate((e) => {
      setZoom(Math.min(1, Math.max(0, zoomBase.current + (e.scale - 1) * 0.4)));
      setActivePreset(-1);
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
    const loveMode = (analysisResult?.healthScore ?? 0) > 8;

    const makeHeartStyle = (anim: Animated.Value, xOffset: number, rise = 90) => ({
      transform: [
        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -rise] }) },
        { translateX: xOffset },
      ],
      opacity: anim.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
    });

    // Love overlay: hearts scattered across the full screen
    const makeLoveHeartStyle = (anim: Animated.Value, rise: number) => ({
      opacity: anim.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 1, 1, 0] }),
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -rise] }) }],
    });

    const petTransform = loveMode
      ? [{ translateY: jumpAnim }, { translateX: loveSwayAnim }, { rotate: wiggleAnim.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] }) }]
      : [{ translateY: jumpAnim }, { rotate: wiggleAnim.interpolate({ inputRange: [-9, 9], outputRange: ['-9deg', '9deg'] }) }];

    return (
      <View style={[styles.container, { backgroundColor: '#FFF8F0' }]}>
        <ScrollView
          contentContainerStyle={[styles.successScroll, { paddingTop: insets.top + 24, paddingBottom: 24 }]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Pet with hop + wiggle */}
          <View style={[styles.petWrap, loveMode && { height: 140 }]}>
            <Animated.View style={{ alignSelf: 'center', transform: petTransform }}>
              <PetPortrait petType={petType ?? 'mochi'} mood={mood} primaryColor={petPrimaryColor} style={styles.petImage} />
            </Animated.View>

            {/* Floating hearts near pet */}
            <Animated.View style={[styles.floatingHeart, makeHeartStyle(heartAnim1, -28)]} pointerEvents="none">
              <Heart size={20} color="#FF6B9D" fill="#FF6B9D" />
            </Animated.View>
            <Animated.View style={[styles.floatingHeart, makeHeartStyle(heartAnim2, 8)]} pointerEvents="none">
              <Heart size={14} color={Colors.softOrange} fill={Colors.softOrange} />
            </Animated.View>
            <Animated.View style={[styles.floatingHeart, makeHeartStyle(heartAnim3, 32)]} pointerEvents="none">
              <Heart size={18} color="#FF6B9D" fill="#FF6B9D" />
            </Animated.View>
          </View>

          {/* Food image — tap to view full screen */}
          {displayUri && (
            <Pressable style={styles.foodImageBox} onPress={() => setFullScreenUri(displayUri)}>
              <Image source={{ uri: displayUri }} style={styles.successFoodImage} resizeMode="contain" />
            </Pressable>
          )}

          {/* AI disclaimer */}
          {analysisResult && (
            <Text style={styles.aiDisclaimer}>{t('camera.aiDisclaimer')}</Text>
          )}

          {/* Reaction block — bordered row, left 75% text, right 25% rating */}
          <Animated.View style={[styles.reactionBlock, { transform: [{ scale: successAnim }, { translateY: bounceAnim }] }]}>
            <Text style={styles.reactionText}>
              <Text style={styles.reactionTitle}>
                {analysisResult
                  ? getReactionTitle(analysisResult.healthScore, petName, t)
                  : t('camera.lovedTitle', { name: petName })}
              </Text>
              {analysisResult?.reason ? `  ${analysisResult.reason}` : ''}
            </Text>
            {analysisResult && (
              <Text style={styles.healthScoreText}>{analysisResult.healthScore}/10 ⭐</Text>
            )}
          </Animated.View>

          {/* Portion slider */}
          {analysisResult && analysisResult.calories > 0 && (
            <View style={styles.portionSection}>
              <View style={styles.portionHeader}>
                <Text style={styles.portionLabel}>{t('camera.portionLabel')}</Text>
                <Text style={styles.portionValue}>{Math.round(portionFraction * 100)}%</Text>
              </View>
              <Slider
                containerStyle={styles.portionSlider}
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                value={portionFraction}
                minimumTrackTintColor={Colors.softOrange}
                maximumTrackTintColor="rgba(232,152,94,0.25)"
                thumbTintColor={Colors.softOrange}
                onValueChange={([v]) => {
                  portionFractionRef.current = v;
                  setPortionFraction(v);
                  if (analysisResult?.calories) {
                    const val = String(Math.round(analysisResult.calories * v));
                    displayCalorieRef.current = val;
                    setDisplayCalorieStr(val);
                  }
                }}
                onSlidingComplete={([v]) => {
                  portionFractionRef.current = v;
                  setPortionFraction(v);
                }}
              />
            </View>
          )}

          {/* Nutrition section */}
          {analysisResult && (
            <View style={styles.nutritionSection}>
              <View style={styles.nutritionNutrientsCol}>
                <Text style={styles.nutritionLabel}>{t('camera.nutrientsLabel')}</Text>
                {analysisResult.nutrients.length > 0 ? (
                  <View style={styles.nutrientPills}>
                    {analysisResult.nutrients.map((n) => {
                      const { emoji, name } = getNutrientDisplay(n);
                      return (
                        <View key={n} style={styles.nutrientPill}>
                          <Text style={styles.nutrientEmoji}>{emoji}</Text>
                          <Text style={styles.nutrientName}>{name}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.calorieText}>—</Text>
                )}
              </View>
              <View style={styles.nutritionCaloriesCol}>
                <Text style={styles.nutritionLabel}>{t('camera.caloriesLabel')}</Text>
                <View style={styles.calorieInputRow}>
                  {parseInt(displayCalorieStr, 10) !== originalCalorieRef.current && (
                    <Pressable
                      onPress={() => {
                        const orig = originalCalorieRef.current;
                        const val = String(orig);
                        displayCalorieRef.current = val;
                        setDisplayCalorieStr(val);
                        portionFractionRef.current = 1.0;
                        setPortionFraction(1.0);
                        if (analysisResult) setAnalysisResult({ ...analysisResult, calories: orig });
                      }}
                      hitSlop={8}
                    >
                      <RotateCcw size={13} color={Colors.softOrange} />
                    </Pressable>
                  )}
                  <TextInput
                    style={styles.calorieInput}
                    value={displayCalorieStr}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/[^0-9]/g, '');
                      displayCalorieRef.current = cleaned;
                      setDisplayCalorieStr(cleaned);
                      portionFractionRef.current = 1.0;
                      setPortionFraction(1.0);
                      const parsed = parseInt(cleaned, 10);
                      if (!isNaN(parsed) && analysisResult) {
                        setAnalysisResult({ ...analysisResult, calories: parsed });
                      }
                    }}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    maxLength={5}
                    selectTextOnFocus
                  />
                  <Text style={styles.calorieUnit}>{t('camera.caloriesUnit')}</Text>
                </View>
                <Text style={styles.caloriesEditHint}>{t('camera.caloriesEditHint')}</Text>
              </View>
            </View>
          )}

          {!analysisResult && (
            <Text style={styles.nutritionHint}>{t('camera.nutritionInGallery')}</Text>
          )}

        </ScrollView>

        {/* Love mode — full-screen heart burst overlay */}
        {loveMode && (
          <View style={styles.loveOverlay} pointerEvents="none">
            <Animated.View style={[styles.loveHeart, { left: '8%',  bottom: '18%' }, makeLoveHeartStyle(heartAnim4, 160)]}>
              <Heart size={28} color="#FF6B9D" fill="#FF6B9D" />
            </Animated.View>
            <Animated.View style={[styles.loveHeart, { left: '20%', bottom: '45%' }, makeLoveHeartStyle(heartAnim5, 200)]}>
              <Heart size={18} color={Colors.softOrange} fill={Colors.softOrange} />
            </Animated.View>
            <Animated.View style={[styles.loveHeart, { right: '8%', bottom: '20%' }, makeLoveHeartStyle(heartAnim6, 180)]}>
              <Heart size={24} color="#FF6B9D" fill="#FF6B9D" />
            </Animated.View>
            <Animated.View style={[styles.loveHeart, { right: '18%', bottom: '50%' }, makeLoveHeartStyle(heartAnim7, 220)]}>
              <Heart size={20} color={Colors.softOrange} fill={Colors.softOrange} />
            </Animated.View>
            <Animated.View style={[styles.loveHeart, { left: '42%', bottom: '12%' }, makeLoveHeartStyle(heartAnim8, 140)]}>
              <Heart size={16} color="#FF6B9D" fill="#FF6B9D" />
            </Animated.View>
          </View>
        )}

        {/* Partner banner — fixed just above Continue */}
        {activePartnership && (
          <Animated.View style={[
            styles.partnerBanner,
            {
              opacity: partnerBannerAnim,
              transform: [{ translateY: partnerBannerAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            },
          ]}>
            <Users size={16} color={Colors.softOrange} />
            <Text style={styles.partnerBannerText}>{t('camera.partnerWillSee')}</Text>
          </Animated.View>
        )}

        {/* Continue button — fixed at bottom regardless of scroll content */}
        <View style={[styles.continueBtnContainer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={styles.continueBtn} onPress={handleContinue} testID="success-continue-button">
            <Text style={styles.continueBtnText}>{t('common.continue')}</Text>
          </Pressable>
        </View>

        {/* Full-screen image viewer */}
        <Modal visible={!!fullScreenUri} transparent animationType="fade" onRequestClose={() => setFullScreenUri(null)}>
          {fullScreenUri && <FullScreenViewer uri={fullScreenUri} onClose={() => setFullScreenUri(null)} />}
        </Modal>
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

            {/* Crop overlay — hidden while rotating or image not yet measured */}
            {!isRotating && imgRect && imgRect.w > 1 && imgRect.h > 1 && (
              <>
                {/* Dim outside crop box — fully black during scanning */}
                <View style={[styles.cropDim, !!scanPhase && styles.cropDimScan, { left: 0,    top: 0,    right: 0,    height: boxT }]} pointerEvents="none" />
                <View style={[styles.cropDim, !!scanPhase && styles.cropDimScan, { left: 0,    top: boxB, right: 0,    bottom: 0 }]}   pointerEvents="none" />
                <View style={[styles.cropDim, !!scanPhase && styles.cropDimScan, { left: 0,    top: boxT, width: boxL, height: boxB - boxT }]} pointerEvents="none" />
                <View style={[styles.cropDim, !!scanPhase && styles.cropDimScan, { left: boxR, top: boxT, right: 0,    height: boxB - boxT }]} pointerEvents="none" />

                {/* Crop border + rule-of-thirds grid */}
                <View
                  style={[
                    styles.cropBorder,
                    { left: boxL, top: boxT, width: boxR - boxL, height: boxB - boxT },
                  ]}
                  pointerEvents="none"
                >
                  {!scanPhase && <View style={styles.gridLineH1} />}
                  {!scanPhase && <View style={styles.gridLineH2} />}
                  {!scanPhase && <View style={styles.gridLineV1} />}
                  {!scanPhase && <View style={styles.gridLineV2} />}
                </View>

                {/* Corner handle dots — hidden during scanning */}
                {!scanPhase && (
                  <>
                    <View style={[styles.cropHandleTouch, { left: boxL - HIT/2, top: boxT - HIT/2 }]} {...tlPan.current.panHandlers}><View style={styles.cropHandleDot} /></View>
                    <View style={[styles.cropHandleTouch, { left: boxR - HIT/2, top: boxT - HIT/2 }]} {...trPan.current.panHandlers}><View style={styles.cropHandleDot} /></View>
                    <View style={[styles.cropHandleTouch, { left: boxL - HIT/2, top: boxB - HIT/2 }]} {...blPan.current.panHandlers}><View style={styles.cropHandleDot} /></View>
                    <View style={[styles.cropHandleTouch, { left: boxR - HIT/2, top: boxB - HIT/2 }]} {...brPan.current.panHandlers}><View style={styles.cropHandleDot} /></View>
                  </>
                )}
              </>
            )}

            {/* ── Scanner animation overlay — clipped to crop-box bounds ── */}
            {scanPhase === 'scanning' && scanContainerRef.current && (
              <View
                style={{
                  position: 'absolute', left: 0, right: 0,
                  top: scanContainerRef.current.top,
                  height: scanContainerRef.current.height,
                  overflow: 'hidden',
                }}
                pointerEvents="none"
              >
                <Animated.View
                  style={[styles.scannerGroup, { transform: [{ translateY: scanAnim }] }]}
                >
                  <View style={styles.scannerGlowTop} />
                  <View style={styles.scannerLine} />
                  <View style={styles.scannerGlowBottom} />
                </Animated.View>
              </View>
            )}

            {/* Outline phase: stroke-draw animation (SVG) or static fallback */}
            {scanPhase === 'outline' && imgRect && (
              contourResult && contourResult.paths.length > 0 ? (
                <Svg
                  style={{ position: 'absolute', left: boxL, top: boxT }}
                  width={boxR - boxL}
                  height={boxB - boxT}
                  viewBox={`0 0 ${contourResult.imageWidth} ${contourResult.imageHeight}`}
                  preserveAspectRatio="xMidYMid meet"
                  pointerEvents="none"
                >
                  {contourResult.paths.map((path, i) => (
                    <AnimatedSvgPath
                      key={i}
                      d={path.d}
                      stroke="#FFFFFF"
                      strokeWidth={Math.max(2, contourResult.imageWidth * 0.004)}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={path.length}
                      strokeDashoffset={getOrCreateContourAnim(i)}
                    />
                  ))}
                </Svg>
              ) : outlineUri ? (
                <View
                  style={{ position: 'absolute', left: boxL, top: boxT, width: boxR - boxL, height: boxB - boxT }}
                  pointerEvents="none"
                >
                  <Image source={{ uri: outlineUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
                </View>
              ) : null
            )}

            {/* Background layer — real composite (permanent) or BlurView fallback */}
            {(scanPhase === 'crop' || scanPhase === 'dissolving' || scanPhase === 'flying') && imgRect && (
              savePreviewUri ? (
                <View
                  style={{
                    position: 'absolute',
                    left: boxL,
                    top: boxT,
                    width: boxR - boxL,
                    height: boxB - boxT,
                  }}
                  pointerEvents="none"
                >
                  <Image source={{ uri: savePreviewUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
                </View>
              ) : (
                <Animated.View
                  style={[
                    {
                      position: 'absolute',
                      left: boxL,
                      top: boxT,
                      width: boxR - boxL,
                      height: boxB - boxT,
                      overflow: 'hidden',
                    },
                    { opacity: bgDissolveAnim },
                  ]}
                  pointerEvents="none"
                >
                  <BlurView intensity={90} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill} />
                </Animated.View>
              )
            )}

            {/* Isolated food item — shown during crop + dissolving + flying */}
            {(scanPhase === 'crop' || scanPhase === 'dissolving' || scanPhase === 'flying') && croppedOverlayUri && (
              <View
                style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}
                pointerEvents="none"
              >
                {/* Warm halo — radial gradient blooms behind the food during crop/dissolving */}
                {(scanPhase === 'crop' || scanPhase === 'dissolving') && (
                  <Animated.View
                    style={[
                      styles.scannerHalo,
                      {
                        transform: [{ scale: haloAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.6] }) }],
                        opacity: haloAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.7, 0.5] }),
                      },
                    ]}
                  >
                    <Svg width={280} height={280}>
                      <Defs>
                        <SvgRadialGradient id="halo" cx="50%" cy="50%" r="50%">
                          <Stop offset="0%" stopColor="#FFF4D6" stopOpacity="1" />
                          <Stop offset="60%" stopColor="#FFF4D6" stopOpacity="0.55" />
                          <Stop offset="100%" stopColor="#FFF4D6" stopOpacity="0" />
                        </SvgRadialGradient>
                      </Defs>
                      <SvgCircle cx="140" cy="140" r="140" fill="url(#halo)" />
                    </Svg>
                  </Animated.View>
                )}

                {/* Sparkles — scattered pastel dots that drift outward */}
                {(scanPhase === 'crop' || scanPhase === 'dissolving') && (
                  <View style={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0 }}>
                    {SPARKLE_DEFS.map((def, i) => {
                      const rad = def.angle * Math.PI / 180;
                      const cos = Math.cos(rad);
                      const sin = Math.sin(rad);
                      return (
                        <Animated.View
                          key={i}
                          style={{
                            position: 'absolute',
                            width: def.size,
                            height: def.size,
                            borderRadius: def.size / 2,
                            backgroundColor: def.color,
                            left: -def.size / 2,
                            top: -def.size / 2,
                            transform: [
                              { translateX: sparkleAnim.interpolate({ inputRange: [0, 1], outputRange: [cos * def.startDist, cos * def.endDist] }) },
                              { translateY: sparkleAnim.interpolate({ inputRange: [0, 1], outputRange: [sin * def.startDist, sin * def.endDist] }) },
                            ],
                            opacity: sparkleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                          }}
                        />
                      );
                    })}
                  </View>
                )}

                {/* Fly group: positioned over the crop-box rect so food aligns with the uploaded image */}
                <Animated.View
                  style={{
                    position: 'absolute',
                    left: imgRect ? boxL : 0,
                    top: imgRect ? boxT : 0,
                    width: imgRect ? boxR - boxL : '85%',
                    height: imgRect ? boxB - boxT : '85%',
                    transform: [
                      { scale: scanPhase === 'flying' ? flyScaleAnim : (1 as number) },
                      { translateY: scanPhase === 'flying' ? flyTranslateYAnim : (0 as number) },
                    ],
                    opacity: scanPhase === 'flying' ? flyOpacityAnim : (1 as number),
                  }}
                >
                  {/* White sticker border — tinted silhouette, slightly larger, draws on */}
                  <Animated.Image
                    source={{ uri: croppedOverlayUri }}
                    tintColor="#FFFFFF"
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        transform: [
                          { scale: stickerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96 * 1.04, 1.04] }) },
                        ],
                        opacity: stickerAnim,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowRadius: 8,
                        shadowOpacity: 0.15,
                      },
                    ]}
                    resizeMode="contain"
                  />
                  {/* Food image */}
                  <Animated.Image
                    source={{ uri: croppedOverlayUri }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                  />
                </Animated.View>
              </View>
            )}

        </View>{/* end image area */}

        {/* ── Bottom bar — hidden (but space-reserved) during scanning ─── */}
        <View
          style={[styles.bottomBar, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }, !!scanPhase && { opacity: 0 }]}
          pointerEvents={scanPhase ? 'none' : 'auto'}
        >
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

      {/* ── Top black bar ──────────────────────────────────────────────────── */}
      <View style={[styles.cameraTopBar, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.topBarBtn}
          testID="close-camera"
        >
          <X size={22} color="#FFF" />
        </Pressable>
      </View>

      {/* ── Camera viewport — 3:4 portrait ratio ───────────────────────────── */}
      <View style={styles.cameraViewport}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" zoom={zoom} />
        <GestureDetector gesture={cameraGestures}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>
        {focusPoint && (
          <Animated.View
            pointerEvents="none"
            style={[styles.focusRing, {
              left: focusPoint.x - 40, top: focusPoint.y - 40,
              opacity: focusOpacity,
              transform: [{ scale: focusRingScale }],
            }]}
          />
        )}

        {/* ── Zoom preset buttons ──────────────────────────────────────────── */}
        <View style={styles.zoomPresets} pointerEvents="box-none">
          {ZOOM_PRESETS.map((preset, i) => {
            const active = activePreset === i;
            return (
              <Pressable
                key={preset.label}
                style={[styles.zoomPresetBtn, active && styles.zoomPresetBtnActive]}
                onPress={() => {
                  setZoom(preset.value);
                  setActivePreset(i);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Text style={[styles.zoomPresetText, active && styles.zoomPresetTextActive]}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Bottom black bar ───────────────────────────────────────────────── */}
      <View style={[styles.captureBar, { paddingBottom: insets.bottom + 16 }]}>
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
const DOT = 32; // visual dot size for crop corner handles

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
    position: 'absolute', width: 80, height: 80, borderRadius: 1,
    borderWidth: 1.5, borderColor: '#FFD60A', zIndex: 20,
  },

  // ── top bar ────────────────────────────────────────────────────────────────
  cameraTopBar: {
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },

  // ── camera viewport ────────────────────────────────────────────────────────
  cameraViewport: {
    width: '100%',
    aspectRatio: 3 / 4,  // portrait 4:3 ratio
    overflow: 'hidden',
  },

  // ── zoom presets ───────────────────────────────────────────────────────────
  zoomPresets: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  zoomPresetBtn: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  zoomPresetBtnActive: {
    backgroundColor: 'rgba(255,214,10,0.92)',
  },
  zoomPresetText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  zoomPresetTextActive: {
    color: '#000',
  },

  // ── capture bar ────────────────────────────────────────────────────────────
  captureBar: {
    flex: 1,
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
  cropDimScan: {
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  cropBorder: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  cropBorderIdentified: {
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    shadowOpacity: 1,
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
  successScroll:  { paddingHorizontal: 20, gap: 14, alignItems: 'center' },
  aiDisclaimer: {
    alignSelf: 'stretch', fontSize: 12, color: Colors.gray,
    textAlign: 'center', fontStyle: 'italic',
  },
  nutritionHint: {
    marginTop: 14, fontSize: 13, color: Colors.gray,
    textAlign: 'center', lineHeight: 18,
  },
  caloriesEditHint: {
    fontSize: 10, color: Colors.brown, opacity: 0.55,
    textAlign: 'center',
  },
  petWrap: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 100,
  },
  petImage:       { width: 120, height: 120 },
  floatingHeart: {
    position: 'absolute',
    bottom: 110,
  },
  loveOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  loveHeart: {
    position: 'absolute',
  },
  reactionBlock: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, gap: 8,
    backgroundColor: 'rgba(232,152,94,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(232,152,94,0.25)',
  },
  reactionText: { flex: 3, fontSize: 14, fontStyle: 'italic', color: Colors.darkBrown, lineHeight: 20 },
  reactionTitle: { fontWeight: '700', fontStyle: 'italic' },
  partnerBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 8, marginHorizontal: 20, marginBottom: 8,
    paddingVertical: 12, paddingHorizontal: 20, borderRadius: 16,
    backgroundColor: 'rgba(232,152,94,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(232,152,94,0.25)',
  },
  partnerBannerText: {
    fontSize: 15, fontWeight: '600', color: Colors.darkBrown,
  },
  continueBtnContainer: {
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: '#FFF8F0',
  },
  portionSection: {
    alignSelf: 'stretch', gap: 4,
  },
  portionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  portionLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.gray,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  portionValue: {
    fontSize: 13, fontWeight: '700', color: Colors.softOrange,
  },
  portionSlider: {
    alignSelf: 'stretch', height: 40, marginHorizontal: -8,
  },
  continueBtn: {
    alignSelf: 'stretch', backgroundColor: Colors.softOrange,
    paddingVertical: 16, borderRadius: 18, alignItems: 'center',
    shadowColor: Colors.softOrange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 5,
  },
  continueBtnText: { fontSize: 17, fontWeight: '700', color: '#FFF' },

  // ── nutrition (success screen) ─────────────────────────────────────────────
  foodImageBox: {
    alignSelf: 'center',
    padding: 8, borderRadius: 16, marginBottom: 10,
    backgroundColor: 'rgba(232,152,94,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(232,152,94,0.25)',
    overflow: 'hidden',
  },
  successFoodImage: {
    width: 120, height: 120, borderRadius: 10,
    borderWidth: 2.5, borderColor: '#FFFFFF',
  },
  healthScoreText: {
    flex: 1, fontSize: 14, fontWeight: '700', fontStyle: 'italic',
    color: Colors.softOrange, textAlign: 'right',
  },
  nutritionSection: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16,
    backgroundColor: 'rgba(232,152,94,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(232,152,94,0.25)',
  },
  nutritionNutrientsCol: { flex: 3, gap: 6 },
  nutritionCaloriesCol:  { flex: 1, gap: 6, alignItems: 'flex-end' },
  nutritionGroup: {
    gap: 6,
  },
  nutritionLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.gray,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  calorieText: {
    fontSize: 16, fontWeight: '700', color: Colors.darkBrown,
  },
  calorieInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  calorieInput: {
    fontSize: 16, fontWeight: '700', color: Colors.darkBrown,
    minWidth: 48, textAlign: 'center',
    borderWidth: 1.5, borderColor: Colors.softOrange, borderRadius: 8,
    backgroundColor: 'rgba(232,152,94,0.07)',
    paddingHorizontal: 8, paddingVertical: 3,
  },
  calorieUnit: {
    fontSize: 13, color: Colors.darkBrown, opacity: 0.6,
  },
  nutrientPills: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  nutrientPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 20,
    backgroundColor: 'rgba(232,152,94,0.22)',
  },
  nutrientEmoji: {
    fontSize: 16,
  },
  nutrientName: {
    fontSize: 13, fontWeight: '500', color: Colors.darkBrown,
  },

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
  scannerGroup: { position: 'absolute', left: 0, right: 0 },
  scannerGlowTop: { height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  scannerLine: {
    height: 3,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    shadowOpacity: 1,
  },
  scannerGlowBottom: { height: 32, backgroundColor: 'rgba(255,255,255,0.1)' },
  scannerCropImage: { width: '85%', height: '85%' },
  scannerHalo: {
    position: 'absolute',
    width: 280,
    height: 280,
  },
});

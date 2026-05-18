/**
 * Reusable full-screen photo gallery modal.
 *
 * Features:
 *  - Horizontal paging (swipe left/right between photos)
 *  - Swipe up/down to dismiss (or fast flick)
 *  - Close (X) button
 *  - Page indicator (N / total)
 *  - Optional save-to-device button
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Animated,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import type {
  PanGestureHandlerGestureEvent,
  PanGestureHandlerStateChangeEvent,
  PinchGestureHandlerGestureEvent,
  PinchGestureHandlerStateChangeEvent,
  TapGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler,
  TapGestureHandler,
  FlatList as GalleryFlatList,
  State,
} from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download } from 'lucide-react-native';
import type { PetPhoto } from '@/lib/supabase-photos';
import { savePhotoToDevice } from '@/lib/photo-album';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

/** Vertical drag threshold to dismiss */
const DISMISS_DRAG_PX = 110;
/** Fast vertical flick threshold (px/s) */
const DISMISS_VELOCITY_Y = 700;

function photoKey(p: PetPhoto): string {
  return `${p.id}-${p.url}`;
}

// ─── ZoomableImage ────────────────────────────────────────────────────────────

function ZoomableImage({
  item,
  listRef,
  onZoomChange,
  onClose,
}: {
  item: PetPhoto;
  listRef: React.RefObject<GalleryFlatList<PetPhoto>>;
  onZoomChange?: (zoomed: boolean) => void;
  onClose?: () => void;
}) {
  // Authoritative committed state — single source of truth for scale + offset
  const committed = useRef({ scale: 1, tx: 0, ty: 0 });
  // Snapshot of committed offset taken at the START of each pan gesture
  const panBase = useRef({ tx: 0, ty: 0 });

  const baseScale  = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale      = useMemo(() => Animated.multiply(baseScale, pinchScale), [baseScale, pinchScale]);
  const txAnim     = useRef(new Animated.Value(0)).current;
  const tyAnim     = useRef(new Animated.Value(0)).current;
  const imgNat     = useRef<{ w: number; h: number } | null>(null);

  const doubleTapRef = useRef<TapGestureHandler>(null);
  const singleTapRef = useRef<TapGestureHandler>(null);
  const panRef       = useRef<PanGestureHandler>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  const notifyZoom = useCallback((zoomed: boolean) => {
    setIsZoomed(zoomed);
    onZoomChange?.(zoomed);
  }, [onZoomChange]);

  // maxOffsetX = max(0, (scaledW - viewportW) / 2)
  // maxOffsetY = max(0, (scaledH - viewportH) / 2)
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

  // Clamp tx/ty to bounds for `s`, write both the ref and the animated value
  const commitOffset = (tx: number, ty: number, s: number) => {
    const { maxTx, maxTy } = maxOffset(s);
    committed.current.tx = Math.max(-maxTx, Math.min(maxTx, tx));
    committed.current.ty = Math.max(-maxTy, Math.min(maxTy, ty));
    txAnim.setValue(committed.current.tx);
    tyAnim.setValue(committed.current.ty);
  };

  // ── Pinch ──────────────────────────────────────────────────────────────────

  const onPinchEvent = useCallback(
    (e: PinchGestureHandlerGestureEvent) => {
      // Allow reducing below 1x only when starting from 1x (not while zoomed in)
      const minScale = committed.current.scale > 1 ? 1 : 0.05;
      const liveScale = Math.max(minScale, Math.min(committed.current.scale * e.nativeEvent.scale, 4));
      pinchScale.setValue(liveScale / committed.current.scale);
      if (liveScale < 1) {
        txAnim.setValue(0);
        tyAnim.setValue(0);
      } else {
        // Re-clamp offset every frame — shrinking scale tightens the bounds
        const { maxTx, maxTy } = maxOffset(liveScale);
        txAnim.setValue(Math.max(-maxTx, Math.min(maxTx, committed.current.tx)));
        tyAnim.setValue(Math.max(-maxTy, Math.min(maxTy, committed.current.ty)));
      }
    },
    [pinchScale, txAnim, tyAnim],
  );

  const onPinchStateChange = useCallback(
    (e: PinchGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.oldState !== State.ACTIVE) return;
      const minScale = committed.current.scale > 1 ? 1 : 0.05;
      const next = Math.max(minScale, Math.min(committed.current.scale * e.nativeEvent.scale, 4));
      pinchScale.setValue(1);

      if (next < 0.6) {
        committed.current = { scale: next, tx: 0, ty: 0 };
        baseScale.setValue(next);
        notifyZoom(false);
        Animated.timing(baseScale, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => onClose?.());
      } else if (next < 1) {
        committed.current = { scale: 1, tx: 0, ty: 0 };
        baseScale.setValue(next);
        notifyZoom(false);
        Animated.spring(baseScale, { toValue: 1, useNativeDriver: false, friction: 7, tension: 120 }).start();
      } else {
        committed.current.scale = next;
        baseScale.setValue(next);
        if (next <= 1) {
          committed.current.tx = 0;
          committed.current.ty = 0;
          txAnim.setValue(0);
          tyAnim.setValue(0);
          notifyZoom(false);
        } else {
          commitOffset(committed.current.tx, committed.current.ty, next);
          notifyZoom(true);
        }
      }
    },
    [baseScale, pinchScale, txAnim, tyAnim, notifyZoom, onClose],
  );

  // ── Double-tap ─────────────────────────────────────────────────────────────

  const onDoubleTap = useCallback(
    (e: TapGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state !== State.ACTIVE) return;
      if (committed.current.scale > 1) {
        committed.current = { scale: 1, tx: 0, ty: 0 };
        notifyZoom(false);
        Animated.parallel([
          Animated.spring(baseScale, { toValue: 1, useNativeDriver: false, friction: 7, tension: 120 }),
          Animated.spring(txAnim,    { toValue: 0, useNativeDriver: false, friction: 7, tension: 120 }),
          Animated.spring(tyAnim,    { toValue: 0, useNativeDriver: false, friction: 7, tension: 120 }),
        ]).start();
      } else {
        committed.current = { scale: 2, tx: 0, ty: 0 };
        notifyZoom(true);
        Animated.spring(baseScale, { toValue: 2, useNativeDriver: false, friction: 7, tension: 120 }).start();
      }
    },
    [baseScale, txAnim, tyAnim, notifyZoom],
  );

  // ── Pan ────────────────────────────────────────────────────────────────────

  const onPanEvent = useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      const { maxTx, maxTy } = maxOffset(committed.current.scale);
      txAnim.setValue(Math.max(-maxTx, Math.min(maxTx, panBase.current.tx + e.nativeEvent.translationX)));
      tyAnim.setValue(Math.max(-maxTy, Math.min(maxTy, panBase.current.ty + e.nativeEvent.translationY)));
    },
    [txAnim, tyAnim],
  );

  const onPanStateChange = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state === State.BEGAN) {
        // Snapshot committed offset so translationX/Y are additive from here
        panBase.current = { tx: committed.current.tx, ty: committed.current.ty };
      } else if (e.nativeEvent.oldState === State.ACTIVE) {
        // Commit and sync — ensures txAnim always matches committed.tx
        commitOffset(
          panBase.current.tx + e.nativeEvent.translationX,
          panBase.current.ty + e.nativeEvent.translationY,
          committed.current.scale,
        );
      }
    },
    [txAnim, tyAnim],
  );

  // ── Single-tap outside image to close ──────────────────────────────────────

  const onSingleTap = useCallback(
    (e: TapGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state !== State.ACTIVE) return;
      if (isZoomed) return;
      const nat = imgNat.current;
      if (!nat || nat.w === 0 || nat.h === 0) return;
      const fit = Math.min(SCREEN_WIDTH / nat.w, SCREEN_HEIGHT / nat.h);
      const renderedW = nat.w * fit;
      const renderedH = nat.h * fit;
      const imgLeft = (SCREEN_WIDTH  - renderedW) / 2;
      const imgTop  = (SCREEN_HEIGHT - renderedH) / 2;
      const { x, y } = e.nativeEvent;
      if (x < imgLeft || x > imgLeft + renderedW || y < imgTop || y > imgTop + renderedH) {
        onClose?.();
      }
    },
    [isZoomed, onClose],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <TapGestureHandler ref={singleTapRef} numberOfTaps={1} onHandlerStateChange={onSingleTap}>
      <TapGestureHandler
        ref={doubleTapRef}
        numberOfTaps={2}
        onHandlerStateChange={onDoubleTap}
      >
        <PanGestureHandler
          ref={panRef}
          enabled={isZoomed}
          onGestureEvent={onPanEvent}
          onHandlerStateChange={onPanStateChange}
          minPointers={1}
          maxPointers={1}
        >
          <PinchGestureHandler
            onGestureEvent={onPinchEvent}
            onHandlerStateChange={onPinchStateChange}
            simultaneousHandlers={listRef}
          >
            <Animated.View
              style={[
                styles.page,
                { transform: [{ translateX: txAnim }, { translateY: tyAnim }, { scale }] },
              ]}
            >
              <Image
                source={{ uri: item.url }}
                style={styles.pageImage}
                contentFit="contain"
                placeholder={BLURHASH}
                transition={200}
                onLoad={(e) => { imgNat.current = { w: e.source.width, h: e.source.height }; }}
              />
            </Animated.View>
          </PinchGestureHandler>
        </PanGestureHandler>
      </TapGestureHandler>
    </TapGestureHandler>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  photos: PetPhoto[];
  /** null = closed; number = index to open at */
  initialIndex: number | null;
  onClose: () => void;
}

export default function PhotoGalleryModal({
  photos,
  initialIndex,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const galleryRef = useRef<GalleryFlatList<PetPhoto>>(null);
  const dragY = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [galleryScrollEnabled, setGalleryScrollEnabled] = useState(true);

  const onItemZoomChange = useCallback((zoomed: boolean) => {
    setGalleryScrollEnabled(!zoomed);
  }, []);

  const dragScale = useMemo(
    () =>
      dragY.interpolate({
        inputRange: [-300, 0, 300],
        outputRange: [0.92, 1, 0.92],
        extrapolate: 'clamp',
      }),
    [dragY],
  );

  // Reset drag and active index each time the gallery opens.
  useEffect(() => {
    if (initialIndex !== null) {
      dragY.setValue(0);
      setActiveIndex(initialIndex);
    }
  }, [initialIndex, dragY]);

  const onGestureEvent = useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      dragY.setValue(e.nativeEvent.translationY);
    },
    [dragY],
  );

  const onHandlerStateChange = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state !== State.END) return;
      const { translationY, velocityY } = e.nativeEvent;
      const dismiss =
        Math.abs(translationY) > DISMISS_DRAG_PX ||
        Math.abs(velocityY) > DISMISS_VELOCITY_Y;
      if (dismiss) {
        const target = translationY >= 0 ? SCREEN_HEIGHT : -SCREEN_HEIGHT;
        Animated.timing(dragY, {
          toValue: target,
          duration: 240,
          useNativeDriver: true,
        }).start(() => {
          dragY.setValue(0);
          onClose();
        });
      } else {
        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
          friction: 7,
          tension: 120,
        }).start();
      }
    },
    [dragY, onClose],
  );

  const handleSave = useCallback(async () => {
    const photo = photos[activeIndex];
    if (!photo) return;
    setIsSaving(true);
    try {
      const result = await savePhotoToDevice(photo.url);
      if (result.success) {
        Alert.alert('Saved', 'Photo saved to your device.');
      } else {
        Alert.alert('Failed to save', result.error ?? 'Could not save photo.');
      }
    } finally {
      setIsSaving(false);
    }
  }, [activeIndex, photos]);

  return (
    <Modal
      visible={initialIndex !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.backdrop}>
          {initialIndex !== null && photos.length > 0 && (
            <PanGestureHandler
              simultaneousHandlers={galleryRef}
              activeOffsetY={[-12, 12]}
              failOffsetX={[-36, 36]}
              maxPointers={1}
              onGestureEvent={onGestureEvent}
              onHandlerStateChange={onHandlerStateChange}
            >
              <View style={styles.inner}>
                <Animated.View
                  style={[
                    styles.draggable,
                    { transform: [{ translateY: dragY }, { scale: dragScale }] },
                  ]}
                >
                  <GalleryFlatList
                    ref={galleryRef}
                    key={
                      photos[initialIndex]
                        ? photoKey(photos[initialIndex])
                        : 'closed'
                    }
                    data={photos}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={photoKey}
                    getItemLayout={(_, index) => ({
                      length: SCREEN_WIDTH,
                      offset: SCREEN_WIDTH * index,
                      index,
                    })}
                    initialScrollIndex={Math.min(initialIndex, photos.length - 1)}
                    scrollEnabled={galleryScrollEnabled}
                    onMomentumScrollEnd={(e) => {
                      const idx = Math.round(
                        e.nativeEvent.contentOffset.x / SCREEN_WIDTH,
                      );
                      setActiveIndex(Math.max(0, Math.min(idx, photos.length - 1)));
                      setGalleryScrollEnabled(true);
                    }}
                    onScrollToIndexFailed={({ index }) => {
                      setTimeout(() => {
                        galleryRef.current?.scrollToOffset({
                          offset: index * SCREEN_WIDTH,
                          animated: false,
                        });
                      }, 100);
                    }}
                    renderItem={({ item }) => (
                      <ZoomableImage item={item} listRef={galleryRef} onZoomChange={onItemZoomChange} onClose={onClose} />
                    )}
                    style={styles.list}
                  />
                </Animated.View>

                {/* Download */}
                <Pressable
                  style={[styles.saveBtn, { top: insets.top + 12 }]}
                  onPress={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Download size={24} color="#fff" />
                  )}
                </Pressable>

                {/* Page indicator */}
                <View style={[styles.pageIndicatorWrap, { bottom: insets.bottom + 20 }]}>
                  <View style={styles.pageIndicator}>
                    <Text style={styles.pageIndicatorText}>
                      {activeIndex + 1} / {photos.length}
                    </Text>
                  </View>
                </View>
              </View>
            </PanGestureHandler>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.97)' },
  inner: { flex: 1 },
  draggable: { flex: 1 },
  list: { flex: 1 },
  page: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  pageImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  saveBtn: {
    position: 'absolute',
    zIndex: 20,
    right: 24,
    padding: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pageIndicatorWrap: {
    position: 'absolute',
    zIndex: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pageIndicator: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  pageIndicatorText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

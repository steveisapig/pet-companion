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
} from 'react-native-gesture-handler';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  FlatList as GalleryFlatList,
  State,
} from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Download } from 'lucide-react-native';
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

interface Props {
  photos: PetPhoto[];
  /** null = closed; number = index to open at */
  initialIndex: number | null;
  onClose: () => void;
  /** Show the save-to-device button. Default false. */
  showSave?: boolean;
}

export default function PhotoGalleryModal({
  photos,
  initialIndex,
  onClose,
  showSave = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const galleryRef = useRef<GalleryFlatList<PetPhoto>>(null);
  const dragY = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

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
                    onMomentumScrollEnd={(e) => {
                      const idx = Math.round(
                        e.nativeEvent.contentOffset.x / SCREEN_WIDTH,
                      );
                      setActiveIndex(Math.max(0, Math.min(idx, photos.length - 1)));
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
                      <View style={styles.page}>
                        <Image
                          source={{ uri: item.url }}
                          style={styles.pageImage}
                          contentFit="contain"
                          placeholder={BLURHASH}
                          transition={200}
                        />
                      </View>
                    )}
                    style={styles.list}
                  />
                </Animated.View>

                {/* Close */}
                <Pressable
                  style={[styles.closeBtn, { top: insets.top + 12 }]}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={26} color="#fff" />
                </Pressable>

                {/* Optional save */}
                {showSave && (
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
                )}

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
  closeBtn: {
    position: 'absolute',
    zIndex: 20,
    left: 16,
    padding: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
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

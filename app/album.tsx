import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  SectionList,
  Dimensions,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Alert,
  Animated,
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
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Download, LayoutGrid, List, X } from 'lucide-react-native';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { usePet } from '@/providers/PetProvider';
import { getPetPhotos, type PetPhoto } from '@/lib/supabase-photos';
import { getAlbumPhotos, savePhotoToDevice } from '@/lib/photo-album';
import { getItemTypeDisplay } from '@/constants/badge-types';

const hasSupabaseConfig = () =>
  !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLS = 3;
const GAP = 8;
const SIZE = (SCREEN_WIDTH - 40 - GAP * (COLS - 1)) / COLS;
const blurhash = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

/** Release past this vertical distance dismisses the viewer */
const GALLERY_DISMISS_DRAG_PX = 110;
/** Fast vertical flick also dismisses (PanGestureHandler velocityY ≈ px/s) */
const GALLERY_DISMISS_VELOCITY_Y = 700;

type AlbumViewMode = 'list' | 'grid';

function photoKey(p: PetPhoto): string {
  return `${p.id}-${p.url}`;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayTitle(
  iso: string,
  t: (key: 'album.photosTitle' | 'album.today' | 'album.yesterday') => string
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('album.photosTitle');
  const now = new Date();
  if (isSameCalendarDay(d, now)) return t('album.today');
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (isSameCalendarDay(d, y)) return t('album.yesterday');
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function groupPhotosByDay(
  photos: PetPhoto[],
  t: (key: 'album.photosTitle' | 'album.today' | 'album.yesterday') => string
): { title: string; data: PetPhoto[] }[] {
  const sorted = [...photos].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const sections: { title: string; data: PetPhoto[] }[] = [];
  let currentTitle: string | null = null;
  let currentSection: PetPhoto[] = [];

  for (const p of sorted) {
    const title = formatDayTitle(p.created_at, t);
    if (title !== currentTitle) {
      if (currentSection.length && currentTitle !== null) {
        sections.push({ title: currentTitle, data: currentSection });
      }
      currentTitle = title;
      currentSection = [p];
    } else {
      currentSection.push(p);
    }
  }
  if (currentSection.length && currentTitle !== null) {
    sections.push({ title: currentTitle, data: currentSection });
  }
  return sections;
}

function formatPhotoTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function NutrientChips({ itemTypes }: { itemTypes: number[] | null }) {
  const { t } = useAppTranslation();
  if (!itemTypes || itemTypes.length === 0) {
    return <Text style={styles.metaMuted}>{t('album.noNutrientsLogged')}</Text>;
  }
  return (
    <View style={styles.chipRow}>
      {itemTypes.map((t, i) => {
        const info = getItemTypeDisplay(t);
        if (!info) return null;
        return (
          <View key={`${t}-${i}`} style={styles.chip}>
            <Text style={styles.chipEmoji}>{info.emoji}</Text>
            <Text style={styles.chipName} numberOfLines={1}>
              {info.name}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function AlbumScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { userId } = usePet();
  /** null = gallery closed; number = scroll index when opened */
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  /** Index of photo currently centered (updates when user swipes) */
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<AlbumViewMode>('list');
  const galleryRef = useRef<GalleryFlatList<PetPhoto>>(null);
  const galleryDragY = useRef(new Animated.Value(0)).current;

  const galleryDragScale = useMemo(
    () =>
      galleryDragY.interpolate({
        inputRange: [-300, 0, 300],
        outputRange: [0.92, 1, 0.92],
        extrapolate: 'clamp',
      }),
    [galleryDragY]
  );

  const { data: photos = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['albumPhotos', userId],
    queryFn: async (): Promise<PetPhoto[]> => {
      if (hasSupabaseConfig() && userId) {
        return getPetPhotos(userId);
      }
      const assets = await getAlbumPhotos();
      return assets.map((a) => ({
        id: 0,
        user_id: '',
        pet_id: 0,
        storage_path: '',
        created_at: a.creationTime?.toString() ?? '',
        nutrients: null,
        calories: null,
        url: a.uri,
      }));
    },
    staleTime: 60 * 1000,
  });

  const openGallery = useCallback(
    (photo: PetPhoto) => {
      const i = photos.findIndex((p) => photoKey(p) === photoKey(photo));
      if (i < 0) return;
      setGalleryIndex(i);
      setActiveGalleryIndex(i);
    },
    [photos]
  );

  const closeGallery = useCallback(() => {
    galleryDragY.setValue(0);
    setGalleryIndex(null);
  }, [galleryDragY]);

  useEffect(() => {
    if (galleryIndex !== null) {
      galleryDragY.setValue(0);
    }
  }, [galleryIndex, galleryDragY]);

  /**
   * Native horizontal FlatList wins the JS responder over parent PanResponder, so drag never fired.
   * PanGestureHandler + simultaneousHandlers (gallery list ref) lets vertical pan and horizontal paging coexist.
   */
  const onGalleryGestureEvent = useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      galleryDragY.setValue(e.nativeEvent.translationY);
    },
    [galleryDragY]
  );

  const onGalleryHandlerStateChange = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state !== State.END) return;
      const { translationY, velocityY } = e.nativeEvent;
      const dismiss =
        Math.abs(translationY) > GALLERY_DISMISS_DRAG_PX ||
        Math.abs(velocityY) > GALLERY_DISMISS_VELOCITY_Y;
      if (dismiss) {
        const target = translationY >= 0 ? SCREEN_HEIGHT : -SCREEN_HEIGHT;
        Animated.timing(galleryDragY, {
          toValue: target,
          duration: 240,
          useNativeDriver: true,
        }).start(() => {
          galleryDragY.setValue(0);
          setGalleryIndex(null);
        });
      } else {
        Animated.spring(galleryDragY, {
          toValue: 0,
          useNativeDriver: true,
          friction: 7,
          tension: 120,
        }).start();
      }
    },
    [galleryDragY]
  );

  const handleSaveToPhotos = useCallback(async () => {
    if (galleryIndex === null || photos.length === 0) return;
    const photo = photos[activeGalleryIndex];
    if (!photo) return;
    setIsSaving(true);
    try {
      const result = await savePhotoToDevice(photo.url);
      if (result.success) {
        Alert.alert(t('album.savedTitle'), t('album.savedBody'));
      } else {
        Alert.alert(t('album.saveFailedTitle'), result.error ?? t('album.saveFailedBody'));
      }
    } finally {
      setIsSaving(false);
    }
  }, [activeGalleryIndex, galleryIndex, photos, t]);

  const sections = useMemo(() => groupPhotosByDay(photos, t), [photos, t]);

  const refreshControl = (
    <RefreshControl
      refreshing={isFetching && !isLoading}
      onRefresh={() => refetch()}
      tintColor={Colors.softOrange}
    />
  );

  const renderListItem = useCallback(
    ({ item }: { item: PetPhoto }) => (
      <Pressable style={styles.listRow} onPress={() => openGallery(item)}>
        <Image
          source={{ uri: item.url }}
          style={styles.listThumb}
          contentFit="cover"
          placeholder={blurhash}
          transition={200}
        />
        <View style={styles.listBody}>
          <Text style={styles.listTime}>{formatPhotoTime(item.created_at)}</Text>
          <NutrientChips itemTypes={item.nutrients} />
          <Text style={styles.caloriesLine}>
            {item.calories != null ? `${item.calories} cal` : '—'}
          </Text>
        </View>
      </Pressable>
    ),
    [openGallery]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
    ),
    []
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft size={24} color={Colors.darkBrown} />
            <Text style={styles.backText}>{t('common.back')}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Marumimi</Text>
          <View style={styles.headerRight}>
            <Pressable
              style={styles.viewToggle}
              onPress={() => setViewMode((m) => (m === 'list' ? 'grid' : 'list'))}
              accessibilityRole="button"
              accessibilityLabel={viewMode === 'list' ? t('album.showPhotoGrid') : t('album.showListByDay')}
            >
              {viewMode === 'list' ? (
                <LayoutGrid size={22} color={Colors.darkBrown} />
              ) : (
                <List size={22} color={Colors.darkBrown} />
              )}
            </Pressable>
          </View>
        </View>

        {isLoading && photos.length === 0 ? (
          viewMode === 'list' ? (
            <View style={styles.skeletonList}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={styles.skeletonListRow} />
              ))}
            </View>
          ) : (
            <View style={styles.skeletonGrid}>
              {Array.from({ length: 12 }).map((_, i) => (
                <View key={i} style={styles.skeletonCell} />
              ))}
            </View>
          )
        ) : photos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>{t('album.emptyTitle')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('album.emptySubtitle')}
            </Text>
          </View>
        ) : viewMode === 'list' ? (
          <SectionList
            sections={sections}
            keyExtractor={(item) => `${item.id}-${item.url}`}
            renderItem={renderListItem}
            renderSectionHeader={renderSectionHeader}
            stickySectionHeadersEnabled
            contentContainerStyle={styles.listContent}
            SectionSeparatorComponent={() => <View style={styles.sectionSpacer} />}
            refreshControl={refreshControl}
            initialNumToRender={12}
          />
        ) : (
          <FlatList
            data={photos}
            keyExtractor={(item) => `${item.id}-${item.url}`}
            numColumns={COLS}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews
            refreshControl={refreshControl}
            renderItem={({ item }) => (
              <Pressable style={styles.photoWrap} onPress={() => openGallery(item)}>
                <Image
                  source={{ uri: item.url }}
                  style={styles.photo}
                  contentFit="cover"
                  placeholder={blurhash}
                  transition={200}
                />
              </Pressable>
            )}
          />
        )}

        <Modal
          visible={galleryIndex !== null}
          transparent
          animationType="fade"
          onRequestClose={closeGallery}
        >
          <GestureHandlerRootView style={styles.gestureRoot}>
            <View style={styles.fullScreenBackdrop}>
              {galleryIndex !== null && photos.length > 0 && (
                <PanGestureHandler
                  simultaneousHandlers={galleryRef}
                  activeOffsetY={[-12, 12]}
                  failOffsetX={[-36, 36]}
                  onGestureEvent={onGalleryGestureEvent}
                  onHandlerStateChange={onGalleryHandlerStateChange}
                >
                  <View style={styles.galleryModalInner}>
                    <Animated.View
                      style={[
                        styles.galleryDraggableShell,
                        {
                          transform: [{ translateY: galleryDragY }, { scale: galleryDragScale }],
                        },
                      ]}
                    >
                      <GalleryFlatList
                        ref={galleryRef}
                        key={
                          galleryIndex !== null && photos[galleryIndex]
                            ? photoKey(photos[galleryIndex])
                            : 'closed'
                        }
                        data={photos}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={(item) => photoKey(item)}
                        getItemLayout={(_, index) => ({
                          length: SCREEN_WIDTH,
                          offset: SCREEN_WIDTH * index,
                          index,
                        })}
                        initialScrollIndex={Math.min(galleryIndex, photos.length - 1)}
                        onMomentumScrollEnd={(e) => {
                          const x = e.nativeEvent.contentOffset.x;
                          const idx = Math.round(x / SCREEN_WIDTH);
                          setActiveGalleryIndex(
                            Math.max(0, Math.min(idx, photos.length - 1))
                          );
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
                          <View style={styles.galleryPage}>
                            <Image
                              source={{ uri: item.url }}
                              style={styles.galleryImage}
                              contentFit="contain"
                              placeholder={blurhash}
                              transition={200}
                            />
                          </View>
                        )}
                        style={styles.galleryList}
                      />
                    </Animated.View>
                    <Pressable
                      style={[styles.modalCloseBtn, { top: insets.top + 12 }]}
                      onPress={closeGallery}
                      accessibilityRole="button"
                      accessibilityLabel={t('album.closeViewer')}
                    >
                      <X size={26} color="#fff" />
                    </Pressable>
                    <Pressable
                      style={[styles.saveButton, { top: insets.top + 12 }]}
                      onPress={handleSaveToPhotos}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Download size={24} color="#fff" />
                      )}
                    </Pressable>
                    <View style={[styles.pageIndicatorWrap, { bottom: insets.bottom + 20 }]}>
                      <View style={styles.pageIndicator}>
                        <Text style={styles.pageIndicatorText}>
                          {activeGalleryIndex + 1} / {photos.length}
                        </Text>
                      </View>
                    </View>
                  </View>
                </PanGestureHandler>
              )}
            </View>
          </GestureHandlerRootView>
        </Modal>
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
    marginBottom: 16,
  },
  backBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minWidth: 80,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.darkBrown,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.darkBrown,
    flex: 1,
    textAlign: 'center' as const,
  },
  headerRight: {
    minWidth: 80,
    alignItems: 'flex-end' as const,
  },
  viewToggle: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  skeletonGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: GAP,
  },
  skeletonList: {
    gap: 12,
  },
  skeletonListRow: {
    height: 88,
    borderRadius: 12,
    backgroundColor: 'rgba(232, 152, 94, 0.15)',
  },
  skeletonCell: {
    width: SIZE,
    height: SIZE,
    borderRadius: 12,
    backgroundColor: 'rgba(232, 152, 94, 0.15)',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.darkBrown,
  },
  emptySubtitle: {
    fontSize: 15,
    color: Colors.brown,
    textAlign: 'center' as const,
    opacity: 0.8,
  },
  listContent: {
    paddingBottom: 24,
  },
  sectionSpacer: {
    height: 4,
  },
  sectionHeader: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
    paddingTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.brown,
    opacity: 0.9,
  },
  listRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(92, 61, 46, 0.08)',
  },
  listThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  listBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  listTime: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.caramel,
  },
  metaMuted: {
    fontSize: 13,
    color: Colors.gray,
    fontStyle: 'italic' as const,
  },
  chipRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(232, 152, 94, 0.18)',
    maxWidth: '100%',
  },
  chipEmoji: {
    fontSize: 12,
  },
  chipName: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.darkBrown,
    flexShrink: 1,
  },
  caloriesLine: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.softOrange,
    marginTop: 2,
  },
  grid: {
    paddingBottom: 24,
  },
  row: {
    gap: GAP,
    marginBottom: GAP,
  },
  photoWrap: {
    width: SIZE,
    height: SIZE,
    borderRadius: 12,
    overflow: 'hidden' as const,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  gestureRoot: {
    flex: 1,
  },
  fullScreenBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.97)',
  },
  galleryModalInner: {
    flex: 1,
  },
  galleryDraggableShell: {
    flex: 1,
  },
  galleryList: {
    flex: 1,
  },
  galleryPage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: '#000',
  },
  galleryImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  modalCloseBtn: {
    position: 'absolute' as const,
    zIndex: 20,
    left: 16,
    padding: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  saveButton: {
    position: 'absolute' as const,
    zIndex: 20,
    right: 24,
    padding: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pageIndicatorWrap: {
    position: 'absolute' as const,
    zIndex: 20,
    left: 0,
    right: 0,
    alignItems: 'center' as const,
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
    fontWeight: '600' as const,
  },
});

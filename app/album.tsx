import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  SectionList,
  ScrollView,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, LayoutGrid, List } from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import PhotoGalleryModal from '@/components/PhotoGalleryModal';
import Colors from '@/constants/colors';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { usePet } from '@/providers/PetProvider';
import { getPetPhotos, type PetPhoto } from '@/lib/supabase-photos';
import { getAlbumPhotos } from '@/lib/photo-album';
import { getItemTypeDisplay } from '@/constants/badge-types';

const hasSupabaseConfig = () =>
  !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLS = 3;
const GAP = 8;
const SIZE = (SCREEN_WIDTH - 40 - GAP * (COLS - 1)) / COLS;
const blurhash = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

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
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<AlbumViewMode>('list');

  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: photos = [], isLoading, refetch } = useQuery({
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
      if (i >= 0) setGalleryIndex(i);
    },
    [photos],
  );

  const sections = useMemo(() => groupPhotosByDay(photos, t), [photos, t]);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={handleRefresh}
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
          <ScrollView
            style={styles.flex1}
            contentContainerStyle={styles.emptyContainer}
            refreshControl={refreshControl}
          >
            <Text style={styles.emptyTitle}>{t('album.emptyTitle')}</Text>
            <Text style={styles.emptySubtitle}>{t('album.emptySubtitle')}</Text>
          </ScrollView>
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

        <PhotoGalleryModal
          photos={photos}
          initialIndex={galleryIndex}
          onClose={() => setGalleryIndex(null)}
          showSave
        />
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
  flex1: { flex: 1 },
  emptyContainer: {
    flexGrow: 1,
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
});

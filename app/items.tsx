import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { NUTRIENT_TO_ITEM_TYPE, ITEM_TYPE_EMOJI } from '@/constants/badge-types';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { usePet } from '@/providers/PetProvider';
import { getBadgeCount } from '@/lib/badges';

// All nutrients ordered by item_type (0–16)
const ALL_NUTRIENTS = (
  Object.entries(NUTRIENT_TO_ITEM_TYPE) as [string, number][]
)
  .sort((a, b) => a[1] - b[1])
  .map(([slug, itemType]) => ({ slug, itemType }));

const TOTAL = ALL_NUTRIENTS.length;
const GAP = 10;
const COLS = 3;
const H_PADDING = 20;

export default function ItemsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();

  if (!__DEV__) {
    return null;
  }
  const { badges, petName } = usePet();
  const { width: screenWidth } = useWindowDimensions();

  const cardSize = (screenWidth - H_PADDING * 2 - GAP * (COLS - 1)) / COLS;

  const collectedCount = useMemo(
    () => ALL_NUTRIENTS.filter(({ slug }) => getBadgeCount(badges, slug) > 0).length,
    [badges],
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.safeContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerSide, styles.headerSideZ]}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <ChevronLeft size={24} color={Colors.darkBrown} />
            </Pressable>
          </View>
          <Text style={styles.title} pointerEvents="none">
            {t('items.title')}
          </Text>
          <View style={[styles.headerSide, styles.headerSideEnd, styles.headerSideZ]}>
            <View style={styles.collectedPill}>
              <Text style={styles.collectedPillText}>{collectedCount}/{TOTAL}</Text>
            </View>
          </View>
        </View>

        {/* Pet name subtitle */}
        <Text style={styles.subtitle}>
          {t('items.subtitle', { name: petName ?? '…' })}
        </Text>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        >
          <View style={[styles.grid, { gap: GAP }]}>
            {ALL_NUTRIENTS.map(({ slug, itemType }) => {
              const count = getBadgeCount(badges, slug);
              const collected = count > 0;
              const emoji = ITEM_TYPE_EMOJI[itemType] ?? '🏅';
              // Use the t() key directly from common.nutrients
              const name = t(`nutrients.${slug}` as any);

              return (
                <View
                  key={slug}
                  style={[
                    styles.card,
                    { width: cardSize },
                    !collected && styles.cardUncollected,
                  ]}
                >
                  {/* Emoji */}
                  <Text style={[styles.cardEmoji, !collected && styles.cardEmojiDim]}>
                    {emoji}
                  </Text>

                  {/* Name */}
                  <Text
                    style={[styles.cardName, !collected && styles.cardNameDim]}
                    numberOfLines={2}
                  >
                    {name}
                  </Text>

                  {/* Count badge */}
                  {collected ? (
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>×{count}</Text>
                    </View>
                  ) : (
                    <View style={styles.countBadgeEmpty}>
                      <Text style={styles.countBadgeEmptyText}>—</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {collectedCount === 0 && (
            <View style={styles.emptyBanner}>
              <Text style={styles.emptyEmoji}>🎁</Text>
              <Text style={styles.emptyText}>{t('items.empty')}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeContent: { flex: 1, paddingHorizontal: H_PADDING },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    minHeight: 40,
  },
  headerSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerSideEnd: { justifyContent: 'flex-end' },
  headerSideZ: { zIndex: 1 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontSize: 22,
    fontWeight: '800',
    color: Colors.darkBrown,
    textAlign: 'center',
    lineHeight: 40,
    zIndex: 0,
  },
  collectedPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: Colors.caramel,
  },
  collectedPillText: { fontSize: 14, fontWeight: '800', color: '#FFF' },

  subtitle: {
    fontSize: 13,
    color: Colors.brown,
    opacity: 0.75,
    marginBottom: 16,
  },

  // ── Grid ────────────────────────────────────────────────────────────────────
  scrollContent: { paddingBottom: 24 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  // ── Item card ───────────────────────────────────────────────────────────────
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: GAP,
  },
  cardUncollected: {
    backgroundColor: 'rgba(220,210,200,0.35)',
    shadowOpacity: 0,
    elevation: 0,
  },

  cardEmoji: { fontSize: 32 },
  cardEmojiDim: { opacity: 0.3 },

  cardName: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.darkBrown,
    textAlign: 'center',
    lineHeight: 14,
  },
  cardNameDim: { opacity: 0.4 },

  countBadge: {
    backgroundColor: Colors.caramel,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  countBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },

  countBadgeEmpty: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countBadgeEmptyText: { fontSize: 12, color: Colors.brown, opacity: 0.3 },

  // ── Empty state ─────────────────────────────────────────────────────────────
  emptyBanner: {
    marginTop: 32,
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 16,
    padding: 24,
  },
  emptyEmoji: { fontSize: 40 },
  emptyText: {
    fontSize: 14,
    color: Colors.brown,
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.8,
  },
});

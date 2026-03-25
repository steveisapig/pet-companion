import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { formatNutrientName, getNutrientEmoji } from '@/constants/badges';
import { usePet } from '@/providers/PetProvider';
import { getBadgeCount, getTotalBadgeCount } from '@/lib/badges';

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const { badges } = usePet();
  const totalCount = getTotalBadgeCount(badges);
  const nutrientKeys = Object.keys(badges).sort();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.safeContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.header, totalCount > 0 && styles.headerNoSubtitle]}>
          <View style={[styles.headerSide, styles.headerSideZ]}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <ChevronLeft size={24} color={Colors.darkBrown} />
            </Pressable>
          </View>
          <Text style={styles.title} pointerEvents="none">
            Badges
          </Text>
          <View style={[styles.headerSide, styles.headerSideEnd, styles.headerSideZ]}>
            <View style={styles.totalCounter} accessibilityLabel={`${totalCount} badges collected`}>
              <Text style={styles.totalCounterText}>{totalCount}</Text>
            </View>
          </View>
        </View>

        {totalCount === 0 && (
          <Text style={styles.subtitle}>
            No badges yet. Share food photos or go on a Virtual Walk to earn nutrient badges!
          </Text>
        )}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            nutrientKeys.length === 0 && styles.scrollContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grid}>
            {nutrientKeys.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🏅</Text>
                <Text style={styles.emptyText}> 
                  Earn badges two ways:{'\n'}
                  • Share food photos — we analyze nutrients and award badges{'\n'}
                  • Virtual Walk — tap spots to discover nutrient badges
                </Text>
              </View>
            ) : (
              nutrientKeys.map((nutrient) => {
                const count = getBadgeCount(badges, nutrient);
                return (
                  <View key={nutrient} style={styles.badgeCard}>
                    <Text style={styles.badgeEmoji}>{getNutrientEmoji(nutrient)}</Text>
                    <Text style={styles.badgeName} numberOfLines={1}>
                      {formatNutrientName(nutrient)}
                    </Text>
                    <View style={[styles.countBadge, count === 0 && styles.countBadgeEmpty]}>
                      <Text style={[styles.countText, count > 0 && styles.countTextFilled]}>{count}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    position: 'relative' as const,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' as const,
    marginBottom: 8,
    minHeight: 40,
  },
  headerNoSubtitle: {
    marginBottom: 16,
  },
  headerSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSideEnd: {
    justifyContent: 'flex-end',
  },
  headerSideZ: {
    zIndex: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    fontSize: 22,
    fontWeight: '800',
    color: Colors.darkBrown,
    textAlign: 'center',
    lineHeight: 40,
    zIndex: 0,
  },
  totalCounter: {
    minWidth: 36,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: Colors.caramel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalCounterText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.brown,
    marginBottom: 20,
    opacity: 0.9,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  scrollContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center' as const,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center' as const,
    alignContent: 'flex-start' as const,
  },
  emptyState: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.brown,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.9,
  },
  badgeCard: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  badgeEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  badgeName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.darkBrown,
    textAlign: 'center',
  },
  countBadge: {
    marginTop: 8,
    backgroundColor: Colors.caramel,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countBadgeEmpty: {
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  countText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.darkBrown,
  },
  countTextFilled: {
    color: '#FFF',
  },
});

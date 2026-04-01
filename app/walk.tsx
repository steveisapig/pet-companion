import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Animated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { PET_CONFIGS, getPetImageForMood } from '@/constants/pets';
import { getPlaceNameKey, PLACE_DEFS, type PlaceId } from '@/constants/items';
import { WALK_NUTRIENTS, formatNutrientName, getNutrientEmoji } from '@/constants/badges';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { usePet } from '@/providers/PetProvider';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const WALK_AREA_WIDTH = SCREEN_WIDTH - 40;
const WALK_AREA_HEIGHT = SCREEN_HEIGHT * 0.45;

const PLACES: PlaceId[] = ['park', 'beach', 'forest', 'city', 'garden'];

export default function WalkScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { petType, level, mood, addBadges } = usePet();
  const [selectedPlace, setSelectedPlace] = useState<PlaceId>('park');
  const [foundBadge, setFoundBadge] = useState<{ emoji: string; name: string; isFound: boolean } | null>(null);
  const foundBannerOpacity = useRef(new Animated.Value(1)).current;
  const foundBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bounceAnim = useRef(new Animated.Value(0)).current;

  const CENTER_X = WALK_AREA_WIDTH / 2 - 60;
  const CENTER_Y = WALK_AREA_HEIGHT / 2 - 60;

  const config = petType ? PET_CONFIGS[petType] : PET_CONFIGS.mochi;
  const place = PLACE_DEFS[selectedPlace];

  const handleSpotTap = useCallback(
    (_spotIndex: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (foundBannerTimeoutRef.current) {
        clearTimeout(foundBannerTimeoutRef.current);
        foundBannerTimeoutRef.current = null;
      }
      const placeDef = PLACE_DEFS[selectedPlace];
      const chance = Math.min(0.95, placeDef.baseFindChance + Math.min(level - 1, 10) * 0.02);
      const found = Math.random() < chance;
      if (found) {
        const nutrient = WALK_NUTRIENTS[Math.floor(Math.random() * WALK_NUTRIENTS.length)];
        addBadges([nutrient]);
        setFoundBadge({ emoji: getNutrientEmoji(nutrient), name: formatNutrientName(nutrient), isFound: true });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setFoundBadge({ emoji: '🔍', name: t('walk.emptySpot'), isFound: false });
      }
      foundBannerOpacity.setValue(1);
      foundBannerTimeoutRef.current = setTimeout(() => {
        foundBannerTimeoutRef.current = null;
        Animated.timing(foundBannerOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => setFoundBadge(null));
      }, 1000);
    },
    [selectedPlace, level, addBadges, foundBannerOpacity, t]
  );

  useEffect(() => {
    return () => {
      if (foundBannerTimeoutRef.current) {
        clearTimeout(foundBannerTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -6, duration: 250, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ])
    );
    bounce.start();
    return () => bounce.stop();
  }, [bounceAnim]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={place.colors}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.safeContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={Colors.darkBrown} />
          </Pressable>
          <Text style={styles.title}>{t('walk.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.placeSelector}>
          <Text style={styles.placeLabel}>{t('walk.choosePlace')}</Text>
          <View style={styles.placeRow}>
            {PLACES.map((id) => (
              <Pressable
                key={id}
                style={[
                  styles.placeChip,
                  selectedPlace === id && styles.placeChipSelected,
                ]}
                onPress={() => setSelectedPlace(id)}
              >
                <Text style={styles.placeEmoji}>{PLACE_DEFS[id].emoji}</Text>
                <Text
                  style={[
                    styles.placeName,
                    selectedPlace === id && styles.placeNameSelected,
                  ]}
                >
                  {t(getPlaceNameKey(id))}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.walkArea, { width: WALK_AREA_WIDTH, height: WALK_AREA_HEIGHT }]}>
          {place.scenery.map((s, i) => (
            <View
              key={i}
              style={[
                styles.sceneryItem,
                {
                  left: s.x * WALK_AREA_WIDTH - (s.size ?? 24) / 2,
                  top: s.y * WALK_AREA_HEIGHT - (s.size ?? 24) / 2,
                },
              ]}
            >
              <Text style={[styles.sceneryEmoji, { fontSize: s.size ?? 24 }]}>{s.emoji}</Text>
            </View>
          ))}

          {place.spots.map((spot, i) => (
              <Pressable
                key={i}
                style={[
                  styles.spotMarker,
                  {
                    left: spot.x * WALK_AREA_WIDTH - 20,
                    top: spot.y * WALK_AREA_HEIGHT - 20,
                  },
                ]}
                onPress={() => handleSpotTap(i)}
              >
                <Text style={styles.spotEmoji}>{spot.emoji}</Text>
              </Pressable>
            ))}

          <Animated.View
              style={[
                styles.petWrap,
                {
                  transform: [
                    { translateX: CENTER_X },
                    { translateY: Animated.add(CENTER_Y, bounceAnim) },
                  ],
                },
              ]}
            >
              <Image source={getPetImageForMood(config, mood)} style={styles.petImage} resizeMode="contain" />
            </Animated.View>

          {foundBadge && (
            <Animated.View
              style={[
                styles.foundBanner,
                {
                  opacity: foundBannerOpacity,
                  backgroundColor: foundBadge.isFound ? 'rgba(76, 175, 80, 0.9)' : 'rgba(158, 158, 158, 0.9)',
                },
              ]}
            >
              <Text style={styles.foundEmoji}>{foundBadge.emoji}</Text>
              <Text style={styles.foundText}>{foundBadge.name}</Text>
            </Animated.View>
          )}
        </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
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
    fontSize: 18,
    fontWeight: '700',
    color: Colors.darkBrown,
  },
  headerSpacer: {
    width: 36,
  },
  placeSelector: {
    marginBottom: 20,
  },
  placeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brown,
    marginBottom: 8,
  },
  placeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  placeChipSelected: {
    backgroundColor: Colors.caramel,
  },
  placeEmoji: {
    fontSize: 18,
  },
  placeName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.darkBrown,
  },
  placeNameSelected: {
    color: '#FFF',
  },
  walkArea: {
    alignSelf: 'center',
    position: 'relative',
    borderRadius: 20,
    overflow: 'hidden',
  },
  sceneryItem: {
    position: 'absolute',
  },
  sceneryEmoji: {
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  spotMarker: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotEmoji: {
    fontSize: 22,
  },
  petWrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  petImage: {
    width: '100%',
    height: '100%',
  },
  foundBanner: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  foundEmoji: {
    fontSize: 28,
  },
  foundText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});

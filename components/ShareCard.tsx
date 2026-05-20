import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import PetPortrait from '@/components/PetPortrait';
import Colors from '@/constants/colors';
import { getNutrientDisplay } from '@/constants/badge-types';
import type { PetType } from '@/constants/pets';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_HEIGHT = SCREEN_WIDTH * 1.2;
const FOOD_HEIGHT = CARD_HEIGHT * 0.66;
const BOTTOM_HEIGHT = CARD_HEIGHT * 0.34;

interface ShareCardProps {
  foodUri: string;
  petType: PetType;
  petPrimaryColor: string | null;
  petName: string;
  reactionTitle: string;
  reactionReason: string;
  calories: number;
  nutrients: string[];
  style?: object;
}

const ShareCard = React.forwardRef<View, ShareCardProps>(
  ({ foodUri, petType, petPrimaryColor, petName, reactionTitle, reactionReason, calories, nutrients, style }, ref) => {
    const displayNutrients = nutrients.slice(0, 8);

    return (
      <View ref={ref} collapsable={false} style={[styles.card, style]}>
        {/* Food photo — top 66% */}
        <Image
          source={{ uri: foodUri }}
          style={styles.foodImage}
          resizeMode="cover"
        />

        {/* Info section — bottom 34%, orange background */}
        <View style={styles.bottom}>
          {/* Pet portrait */}
          <View style={styles.portraitWrap}>
            <PetPortrait
              petType={petType}
              mood="happy"
              primaryColor={petPrimaryColor}
              style={styles.portrait}
            />
          </View>

          {/* Text column */}
          <View style={styles.textCol}>
            <Text style={styles.reactionTitle} numberOfLines={1}>{reactionTitle}</Text>
            {!!reactionReason && (
              <Text style={styles.reactionReason} numberOfLines={2}>{reactionReason}</Text>
            )}
            {calories > 0 && (
              <Text style={styles.calories}>🔥 {calories} kcal</Text>
            )}
            {displayNutrients.length > 0 && (
              <View style={styles.nutrientRow}>
                {displayNutrients.map((n) => {
                  const { emoji } = getNutrientDisplay(n);
                  return (
                    <Text key={n} style={styles.nutrientEmoji}>{emoji}</Text>
                  );
                })}
              </View>
            )}
          </View>

          {/* Branding */}
          <Text style={styles.branding}>Marumimi</Text>
        </View>
      </View>
    );
  }
);

ShareCard.displayName = 'ShareCard';
export default ShareCard;

const styles = StyleSheet.create({
  card: {
    width: SCREEN_WIDTH,
    height: CARD_HEIGHT,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  foodImage: {
    width: SCREEN_WIDTH,
    height: FOOD_HEIGHT,
  },
  bottom: {
    width: SCREEN_WIDTH,
    height: BOTTOM_HEIGHT,
    backgroundColor: Colors.softOrange,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  portraitWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginRight: 12,
    flexShrink: 0,
  },
  portrait: {
    width: 64,
    height: 64,
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  reactionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  reactionReason: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 16,
  },
  calories: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginTop: 2,
  },
  nutrientRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    marginTop: 2,
  },
  nutrientEmoji: {
    fontSize: 16,
  },
  branding: {
    position: 'absolute',
    bottom: 10,
    right: 14,
    fontSize: 11,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '600',
  },
});

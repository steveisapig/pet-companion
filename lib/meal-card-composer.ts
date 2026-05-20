import { requireOptionalNativeModule } from 'expo-modules-core';
import { Image } from 'react-native';
import { getNutrientDisplay } from '@/constants/badge-types';
import type { PetType } from '@/constants/pets';

const NativeMealCardComposer = requireOptionalNativeModule('MealCardComposer');

const PET_IMAGES: Record<PetType, ReturnType<typeof require>> = {
  mochi:  require('@/assets/images/pet-mochi.png'),
  nugget: require('@/assets/images/pet-nugget.png'),
  cookie: require('@/assets/images/pet-cookie.png'),
};

export interface MealCardOptions {
  foodUri: string;
  petType: PetType;
  petColor: string | null;
  reactionTitle: string;
  reactionReason: string;
  calories: number;
  nutrients: string[];
}

export async function composeMealCard(opts: MealCardOptions): Promise<string | null> {
  if (!NativeMealCardComposer) {
    console.warn('[MealCard] MealCardComposer module not available');
    return null;
  }

  const petSource = Image.resolveAssetSource(PET_IMAGES[opts.petType] ?? PET_IMAGES.mochi as any);
  const nutrientEmojis = opts.nutrients.slice(0, 8).map(n => getNutrientDisplay(n).emoji).join(' ');

  try {
    return await NativeMealCardComposer.compose({
      foodUri:        opts.foodUri,
      petImageUri:    petSource.uri,
      reactionTitle:  opts.reactionTitle,
      reactionReason: opts.reactionReason,
      calories:       opts.calories,
      nutrients:      nutrientEmojis,
      petColor:       opts.petColor ?? '#E8985E',
    });
  } catch (e) {
    console.warn('[MealCard] compose error:', e);
    return null;
  }
}

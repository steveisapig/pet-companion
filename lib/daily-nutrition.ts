/**
 * Aggregate nutrients and calories from pet photos for a calendar day,
 * and compute which nutrients (from the app's full set) are still missing.
 */

import {
  NUTRIENT_TO_ITEM_TYPE,
  getNutrientDisplay,
  itemTypeToNutrient,
} from '@/constants/badge-types';
import type { PetPhoto } from '@/lib/supabase-photos';

/** Reasonable default daily calorie target for display (not medical advice). */
export const DAILY_CALORIE_GOAL_KCAL = 2000;

const ALL_NUTRIENT_SLUGS = Object.keys(NUTRIENT_TO_ITEM_TYPE) as string[];

export interface DailyNutritionSummary {
  totalCalories: number;
  /** Unique item_types seen in any photo today */
  nutrientItemTypesToday: number[];
  /** Slugs from NUTRIENT_TO_ITEM_TYPE not logged today */
  missingNutrientSlugs: string[];
}

export function aggregateDailyNutrition(photos: PetPhoto[]): DailyNutritionSummary {
  let totalCalories = 0;
  const seenTypes = new Set<number>();

  for (const p of photos) {
    const c = p.calories;
    if (c != null && Number.isFinite(c)) totalCalories += Math.round(c);
    if (p.nutrients && p.nutrients.length > 0) {
      for (const t of p.nutrients) seenTypes.add(t);
    }
  }

  const missingNutrientSlugs = ALL_NUTRIENT_SLUGS.filter((slug) => {
    const t = NUTRIENT_TO_ITEM_TYPE[slug];
    return t !== undefined && !seenTypes.has(t);
  });

  return {
    totalCalories,
    nutrientItemTypesToday: [...seenTypes].sort((a, b) => a - b),
    missingNutrientSlugs,
  };
}

export function formatNutrientChip(itemType: number): { label: string; emoji: string } {
  const slug = itemTypeToNutrient(itemType);
  if (slug) {
    const d = getNutrientDisplay(slug);
    return { label: d.name, emoji: d.emoji };
  }
  return { label: '?', emoji: '🏅' };
}

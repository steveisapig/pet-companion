import { NUTRIENT_TO_ITEM_TYPE } from '@/constants/badge-types';

export type PhotoRatingTier = 'little' | 'like' | 'love';

export interface PhotoRatingResult {
  score: number;
  tier: PhotoRatingTier;
  message: string;
}

/** Distinct nutrients the analyzer can return (same universe as badges). */
const MAX_NUTRIENTS = Object.keys(NUTRIENT_TO_ITEM_TYPE).length;

/**
 * Pet reaction 0–10 from how many nutrients were identified in the food photo.
 * More nutrients → higher score (linear up to MAX_NUTRIENTS).
 */
export function photoRatingFromNutrientCount(nutrientCount: number): PhotoRatingResult {
  const n = Math.max(0, Math.min(nutrientCount, MAX_NUTRIENTS));
  const score =
    MAX_NUTRIENTS === 0 ? 0 : Math.min(10, Math.round((n / MAX_NUTRIENTS) * 10));

  if (score <= 2) {
    return {
      score,
      tier: 'little',
      message: 'likes it a little',
    };
  }
  if (score <= 6) {
    return {
      score,
      tier: 'like',
      message: 'likes it',
    };
  }
  return {
    score,
    tier: 'love',
    message: 'is very happy',
  };
}

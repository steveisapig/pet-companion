/**
 * Badge display helpers. Uses badge-types mapping for known nutrients.
 */

import { getNutrientDisplay } from '@/constants/badge-types';

export { WALK_NUTRIENTS } from '@/constants/badge-types';

/** Format nutrient slug to display name */
export function formatNutrientName(slug: string): string {
  return getNutrientDisplay(slug).name;
}

/** Emoji for nutrient */
export function getNutrientEmoji(slug: string): string {
  return getNutrientDisplay(slug).emoji;
}

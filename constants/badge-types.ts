/**
 * Mapping between nutrient slugs and item_type (integer) for user_badges table.
 * Primary key is (user_id, item_type). This allows stable storage and retrieval
 * with user-readable names via the display mapping.
 */

import { i18n } from '@/lib/i18n';

export const NUTRIENT_TO_ITEM_TYPE = {
  'vitamin-c': 0,
  'vitamin-d': 1,
  'vitamin-a': 2,
  'vitamin-b12': 3,
  'vitamin-b6': 4,
  'vitamin-e': 5,
  'vitamin-k': 6,
  'omega-3': 7,
  'omega-6': 8,
  iron: 9,
  zinc: 10,
  calcium: 11,
  magnesium: 12,
  potassium: 13,
  protein: 14,
  fiber: 15,
  folate: 16,
} as const;

export type NutrientSlug = keyof typeof NUTRIENT_TO_ITEM_TYPE;

export const ITEM_TYPE_TO_NUTRIENT: Record<number, string> = Object.fromEntries(
  Object.entries(NUTRIENT_TO_ITEM_TYPE).map(([k, v]) => [v, k])
);

export interface BadgeDisplay {
  name: string;
  emoji: string;
}

export const ITEM_TYPE_EMOJI: Record<number, string> = {
  0: '🍊',
  1: '☀️',
  2: '🥕',
  3: '🥩',
  4: '🥔',
  5: '🥜',
  6: '🥬',
  7: '🐟',
  8: '🌻',
  9: '🔩',
  10: '⚙️',
  11: '🥛',
  12: '🥬',
  13: '🍌',
  14: '🥩',
  15: '🌾',
  16: '🥬',
};

/** Convert nutrient slug to item_type; returns null if unknown */
export function nutrientToItemType(slug: string): number | null {
  const normalized = slug.toLowerCase().trim().replace(/\s+/g, '-') as NutrientSlug;
  const t = NUTRIENT_TO_ITEM_TYPE[normalized];
  return t !== undefined ? t : null;
}

/** Convert item_type to nutrient slug; returns null if unknown */
export function itemTypeToNutrient(itemType: number): string | null {
  return ITEM_TYPE_TO_NUTRIENT[itemType] ?? null;
}

/** Get display info for item_type */
export function getItemTypeDisplay(itemType: number): BadgeDisplay | null {
  const slug = itemTypeToNutrient(itemType);
  if (slug == null) return null;
  return getNutrientDisplay(slug);
}

/** Get display info for nutrient slug (uses mapping, fallback for unknown) */
export function getNutrientDisplay(slug: string): BadgeDisplay {
  const itemType = nutrientToItemType(slug);
  if (itemType !== null) {
    const emoji = ITEM_TYPE_EMOJI[itemType];
    const normalizedSlug = itemTypeToNutrient(itemType) as NutrientSlug | null;
    if (emoji && normalizedSlug) {
      return {
        name: i18n.t(getNutrientTranslationKey(normalizedSlug)),
        emoji,
      };
    }
  }
  const fallback = slug.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(' ');
  return { name: fallback, emoji: '🏅' };
}

/** Nutrients that can be found on a Virtual Walk (must be in NUTRIENT_TO_ITEM_TYPE) */
export const WALK_NUTRIENTS = [
  'vitamin-c',
  'zinc',
  'protein',
  'fiber',
  'iron',
  'calcium',
  'vitamin-d',
  'omega-3',
  'magnesium',
  'potassium',
] as const;

function getNutrientTranslationKey(slug: NutrientSlug): `nutrients.${NutrientSlug}` {
  return `nutrients.${slug}`;
}

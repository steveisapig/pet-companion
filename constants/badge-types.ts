/**
 * Mapping between nutrient slugs and item_type (integer) for user_badges table.
 * Primary key is (user_id, item_type). This allows stable storage and retrieval
 * with user-readable names via the display mapping.
 */

export const NUTRIENT_TO_ITEM_TYPE: Record<string, number> = {
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
};

export const ITEM_TYPE_TO_NUTRIENT: Record<number, string> = Object.fromEntries(
  Object.entries(NUTRIENT_TO_ITEM_TYPE).map(([k, v]) => [v, k])
);

export interface BadgeDisplay {
  name: string;
  emoji: string;
}

/** item_type -> user-readable name and emoji */
export const ITEM_TYPE_DISPLAY: Record<number, BadgeDisplay> = {
  0: { name: 'Vitamin C', emoji: '🍊' },
  1: { name: 'Vitamin D', emoji: '☀️' },
  2: { name: 'Vitamin A', emoji: '🥕' },
  3: { name: 'Vitamin B12', emoji: '🥩' },
  4: { name: 'Vitamin B6', emoji: '🥔' },
  5: { name: 'Vitamin E', emoji: '🥜' },
  6: { name: 'Vitamin K', emoji: '🥬' },
  7: { name: 'Omega-3', emoji: '🐟' },
  8: { name: 'Omega-6', emoji: '🌻' },
  9: { name: 'Iron', emoji: '🔩' },
  10: { name: 'Zinc', emoji: '⚙️' },
  11: { name: 'Calcium', emoji: '🥛' },
  12: { name: 'Magnesium', emoji: '🥬' },
  13: { name: 'Potassium', emoji: '🍌' },
  14: { name: 'Protein', emoji: '🥩' },
  15: { name: 'Fiber', emoji: '🌾' },
  16: { name: 'Folate', emoji: '🥬' },
};

/** Convert nutrient slug to item_type; returns null if unknown */
export function nutrientToItemType(slug: string): number | null {
  const normalized = slug.toLowerCase().trim().replace(/\s+/g, '-');
  const t = NUTRIENT_TO_ITEM_TYPE[normalized];
  return t !== undefined ? t : null;
}

/** Convert item_type to nutrient slug; returns null if unknown */
export function itemTypeToNutrient(itemType: number): string | null {
  return ITEM_TYPE_TO_NUTRIENT[itemType] ?? null;
}

/** Get display info for item_type */
export function getItemTypeDisplay(itemType: number): BadgeDisplay | null {
  return ITEM_TYPE_DISPLAY[itemType] ?? null;
}

/** Get display info for nutrient slug (uses mapping, fallback for unknown) */
export function getNutrientDisplay(slug: string): BadgeDisplay {
  const itemType = nutrientToItemType(slug);
  if (itemType !== null) {
    const d = ITEM_TYPE_DISPLAY[itemType];
    if (d) return d;
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

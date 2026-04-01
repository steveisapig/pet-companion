import { supabaseGetUserBadges, supabaseAddUserBadges } from '@/lib/db/supabase-api';
import { itemTypeToNutrient } from '@/constants/badge-types';

/** Badges = Record<nutrient slug, quantity> */
export type Badges = Record<string, number>;

export function createEmptyBadges(): Badges {
  return {};
}

export async function loadBadges(userId: string | null): Promise<Badges> {
  if (userId === null) return createEmptyBadges();
  try {
    const rows = await supabaseGetUserBadges(userId);
    const badges: Badges = {};
    for (const row of rows) {
      const nutrient = itemTypeToNutrient(row.item_type);
      if (nutrient) badges[nutrient] = row.quantity;
    }
    return badges;
  } catch (e) {
    console.error('[Badges] Failed to load:', e);
    return createEmptyBadges();
  }
}

export async function addBadgesToSupabase(userId: string, nutrients: string[]): Promise<void> {
  await supabaseAddUserBadges(userId, nutrients);
}

export function getBadgeCount(badges: Badges, nutrient: string): number {
  return badges[nutrient] ?? 0;
}

export function getTotalBadgeCount(badges: Badges): number {
  return Object.values(badges).reduce((sum, q) => sum + q, 0);
}

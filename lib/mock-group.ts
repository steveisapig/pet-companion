/**
 * Mock group initiative state — stored in AsyncStorage.
 * No Supabase calls; purely local so the UI flow can be built and iterated on.
 * Replace with real Supabase tables when ready.
 *
 * Partner list is modelled as MockPartner[] so that expanding to groups of 3+
 * (or multiple separate partners) is a data-layer change only — no UI refactor needed.
 * Today the app enforces a max of 1 partner; the cap lives in one place (MAX_PARTNERS).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@pet_companion/mock_group';

/** Maximum number of partners allowed in a group right now. Raise to support larger groups. */
export const MAX_PARTNERS = 1;

export type GroupGoalType =
  | 'nutrients'     // Eat enough distinct nutrients each day
  | 'calories'      // Reach a combined daily calorie target
  | 'consistency'   // Both log at least one meal every day
  | 'protein';      // Combined protein servings per day

export interface MockPartner {
  id: string;
  name: string;
  petType: 'mochi' | 'nugget' | 'cookie';
  /** Simulated calories logged today */
  todayCalories: number;
  /** Simulated distinct nutrient count today */
  todayNutrients: number;
  /** Simulated days logged in a row */
  streakDays: number;
}

export interface MockGroup {
  inviteCode: string;
  /**
   * List of partners in the group.
   * Currently capped at MAX_PARTNERS (1); structured as an array so the data
   * schema supports larger groups without a migration when the cap is raised.
   */
  partners: MockPartner[];
  goalType: GroupGoalType;
  /** Target value — meaning depends on goalType */
  goalValue: number;
  createdAt: string;
}

export const DUMMY_PARTNER: MockPartner = {
  id: 'dummy-user-001',
  name: 'Alex',
  petType: 'nugget',
  todayCalories: 820,
  todayNutrients: 4,
  streakDays: 5,
};

export const GOAL_DEFAULTS: Record<GroupGoalType, number> = {
  nutrients: 8,      // 8 distinct nutrients per day combined
  calories: 3000,    // 3000 kcal combined per day
  consistency: 7,    // 7-day streak
  protein: 6,        // 6 protein-rich foods combined per day
};

function randomCode(): string {
  const words = ['MOCHI', 'NUGGET', 'COOKIE', 'PAWS', 'FEAST', 'SNACK'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${num}`;
}

export async function getGroup(): Promise<MockGroup | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MockGroup;
    // Migrate legacy saves that stored a single `partner` field
    if (!parsed.partners && (parsed as unknown as { partner: MockPartner }).partner) {
      parsed.partners = [(parsed as unknown as { partner: MockPartner }).partner];
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveGroup(group: MockGroup): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(group));
}

export async function clearGroup(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export function generateInviteCode(): string {
  return randomCode();
}

/** Returns true if the group has reached the partner cap. */
export function isGroupFull(group: MockGroup): boolean {
  return group.partners.length >= MAX_PARTNERS;
}

export async function createGroupWithDummy(goalType: GroupGoalType): Promise<MockGroup> {
  const group: MockGroup = {
    inviteCode: generateInviteCode(),
    partners: [DUMMY_PARTNER],
    goalType,
    goalValue: GOAL_DEFAULTS[goalType],
    createdAt: new Date().toISOString(),
  };
  await saveGroup(group);
  return group;
}

export async function createGroupWithCode(
  inviteCode: string,
  goalType: GroupGoalType
): Promise<MockGroup> {
  const group: MockGroup = {
    inviteCode,
    partners: [{ ...DUMMY_PARTNER, name: 'Friend' }],
    goalType,
    goalValue: GOAL_DEFAULTS[goalType],
    createdAt: new Date().toISOString(),
  };
  await saveGroup(group);
  return group;
}

/** Add a partner to an existing group (respects MAX_PARTNERS cap). */
export async function addPartnerToGroup(
  group: MockGroup,
  partner: MockPartner
): Promise<MockGroup | null> {
  if (isGroupFull(group)) return null;
  const updated: MockGroup = { ...group, partners: [...group.partners, partner] };
  await saveGroup(updated);
  return updated;
}

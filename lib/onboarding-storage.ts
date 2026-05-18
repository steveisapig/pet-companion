import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_STEP_KEY = '@pet_companion/onboarding_step';
const USERNAME_PROMPT_DISMISSED_KEY = '@pet_companion/username_prompt_dismissed';
const BODY_PROFILE_KEY = '@pet_companion/body_profile';

// ─── Body profile ─────────────────────────────────────────────────────────────

export interface BodyProfile {
  sex: 'male' | 'female';
  heightCm: number;
  weightKg: number;
  dailyCalorieEstimate: number;
  calorieDirection: 'above' | 'below';
  dietaryConditions: string[];
}

export async function saveBodyProfile(profile: BodyProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(BODY_PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.error('[Onboarding] Failed to save body profile:', e);
  }
}

export async function getBodyProfile(): Promise<BodyProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(BODY_PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BodyProfile;
  } catch {
    return null;
  }
}

/** Returns the user's daily calorie goal, or 2000 if not set. */
export async function getDailyCalorieGoalKcal(): Promise<number> {
  const profile = await getBodyProfile();
  return profile?.dailyCalorieEstimate ?? 2000;
}

/** Returns whether the user's goal is to stay above or below their calorie target. Defaults to 'below'. */
export async function getDailyCalorieDirection(): Promise<'above' | 'below'> {
  const profile = await getBodyProfile();
  return profile?.calorieDirection ?? 'below';
}

/** -1 = finished, 0 = share a photo (camera), 1 = photo album, 2 = badges */
export type OnboardingStep = -1 | 0 | 1 | 2 | 3;

export async function getOnboardingStep(): Promise<OnboardingStep> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_STEP_KEY);
    if (raw === null) return -1;
    const n = parseInt(raw, 10);
    if (n >= -1 && n <= 3) return n as OnboardingStep;
    return -1;
  } catch {
    return -1;
  }
}

export async function setOnboardingStep(step: OnboardingStep): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_STEP_KEY, String(step));
  } catch (e) {
    console.error('[Onboarding] Failed to save step:', e);
  }
}

export async function getUsernamePromptDismissed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(USERNAME_PROMPT_DISMISSED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setUsernamePromptDismissed(): Promise<void> {
  try {
    await AsyncStorage.setItem(USERNAME_PROMPT_DISMISSED_KEY, '1');
  } catch (e) {
    console.error('[Onboarding] Failed to save username prompt dismissed:', e);
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_STEP_KEY = '@pet_companion/onboarding_step';

/** -1 = finished, 0 = share a photo (camera), 1 = photo album, 2 = badges */
export type OnboardingStep = -1 | 0 | 1 | 2;

export async function getOnboardingStep(): Promise<OnboardingStep> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_STEP_KEY);
    if (raw === null) return -1;
    const n = parseInt(raw, 10);
    if (n >= -1 && n <= 2) return n as OnboardingStep;
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

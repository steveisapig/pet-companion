import AsyncStorage from '@react-native-async-storage/async-storage';

const FOOD_SCANNER_KEY = '@pet_companion/food_scanner_enabled';

export async function getFoodScannerEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(FOOD_SCANNER_KEY);
    return val === null ? true : val === '1';
  } catch {
    return true;
  }
}

export async function setFoodScannerEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(FOOD_SCANNER_KEY, enabled ? '1' : '0');
  } catch (e) {
    console.error('[FoodScanner] Failed to save setting:', e);
  }
}

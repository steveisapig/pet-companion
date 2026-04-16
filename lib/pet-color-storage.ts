import AsyncStorage from '@react-native-async-storage/async-storage';

const PET_COLOR_KEY = '@pet_companion/pet_primary_color';

export async function getPetPrimaryColor(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PET_COLOR_KEY);
  } catch {
    return null;
  }
}

export async function savePetPrimaryColor(color: string | null): Promise<void> {
  try {
    if (color === null) {
      await AsyncStorage.removeItem(PET_COLOR_KEY);
    } else {
      await AsyncStorage.setItem(PET_COLOR_KEY, color);
    }
  } catch (e) {
    console.error('[PetColor] Failed to save color:', e);
  }
}

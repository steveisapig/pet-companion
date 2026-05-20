import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@pet_companion/partner_order';

export async function loadPartnerOrder(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function savePartnerOrder(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(ids));
  } catch (e) {
    console.error('[PartnerOrder] Failed to save:', e);
  }
}

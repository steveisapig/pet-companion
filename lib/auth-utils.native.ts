/** Native: use expo-linking (avoids expo-auth-session/expo-crypto native module) */
import * as Linking from 'expo-linking';

export function getRedirectUri(): string {
  return Linking.createURL('auth/callback', { scheme: 'rork-app' });
}

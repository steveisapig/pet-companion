/** Web: avoid expo-auth-session/expo-crypto (no native modules on web) */
export function getRedirectUri(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  return '/auth/callback';
}

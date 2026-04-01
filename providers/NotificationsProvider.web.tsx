import type { ReactNode } from 'react';

/**
 * Web: `expo-notifications` is not used; avoid importing native notification modules.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { usePet } from '@/providers/PetProvider';
import {
  requestNotificationPermissions,
  scheduleHappinessNotifications,
  cancelAllNotifications,
} from '@/lib/notifications';

/**
 * Handles notification permission requests and scheduling.
 * Must be rendered inside PetProvider so it can read pet state.
 * The notification handler itself is registered at module level in
 * lib/notifications.native.ts — that file is imported transitively when this
 * provider mounts on native, satisfying the "before any notification arrives"
 * requirement without any explicit setup call needed here.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { petName, happiness, onboardingComplete } = usePet();

  const permissionsRequestedRef = useRef(false);
  useEffect(() => {
    if (!onboardingComplete || permissionsRequestedRef.current) return;
    permissionsRequestedRef.current = true;
    requestNotificationPermissions();
  }, [onboardingComplete]);

  useEffect(() => {
    if (!onboardingComplete) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        scheduleHappinessNotifications(petName, happiness);
      } else if (nextState === 'active') {
        cancelAllNotifications();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [onboardingComplete, petName, happiness]);

  return <>{children}</>;
}

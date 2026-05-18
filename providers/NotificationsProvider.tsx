import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { usePet } from '@/providers/PetProvider';
import {
  requestNotificationPermissions,
  scheduleHappinessNotifications,
  cancelAllNotifications,
} from '@/lib/notifications';
import { registerPushToken, subscribePushTokenRefresh } from '@/lib/push-tokens';

/**
 * Handles notification permission requests and scheduling.
 * Must be rendered inside PetProvider so it can read pet state.
 * The notification handler itself is registered at module level in
 * lib/notifications.native.ts — that file is imported transitively when this
 * provider mounts on native, satisfying the "before any notification arrives"
 * requirement without any explicit setup call needed here.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { petName, happiness, onboardingComplete, userId } = usePet();

  const permissionsRequestedRef = useRef(false);
  useEffect(() => {
    if (!onboardingComplete || permissionsRequestedRef.current) return;
    permissionsRequestedRef.current = true;
    requestNotificationPermissions().then(() => {
      if (userId) registerPushToken(userId);
    });
  }, [onboardingComplete, userId]);

  useEffect(() => {
    if (!onboardingComplete || !userId) return;
    return subscribePushTokenRefresh(userId);
  }, [onboardingComplete, userId]);

  useEffect(() => {
    if (!onboardingComplete) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        scheduleHappinessNotifications(petName, happiness);
      } else if (nextState === 'active') {
        cancelAllNotifications();
        if (userId) registerPushToken(userId);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [onboardingComplete, petName, happiness, userId]);

  return <>{children}</>;
}

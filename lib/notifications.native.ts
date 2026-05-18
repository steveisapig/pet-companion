/**
 * Local notifications (iOS / Android). Loads `expo-notifications` via require() so Metro
 * does not treat a type-only import as a hard dependency edge that breaks some setups.
 */

import { i18n, initializeI18n } from '@/lib/i18n';

let Notifications: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (e) {
  console.warn('[Notifications] expo-notifications unavailable (rebuild native app after adding the plugin):', e);
}

const NOTIFICATION_THRESHOLDS = [
  {
    happiness: 50,
    title: (name: string) => i18n.t('notifications.hungryTitle', { name }),
    body: () => i18n.t('notifications.hungryBody'),
  },
  {
    happiness: 30,
    title: (name: string) => i18n.t('notifications.lonelyTitle', { name }),
    body: () => i18n.t('notifications.lonelyBody'),
  },
  {
    happiness: 15,
    title: (name: string) => i18n.t('notifications.needsYouTitle', { name }),
    body: () => i18n.t('notifications.needsYouBody'),
  },
];

const MINUTES_PER_POINT = 30;
const HAPPINESS_ID_PREFIX = 'happiness_';

async function cancelHappinessNotifications(): Promise<void> {
  const scheduled: { identifier: string }[] =
    await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(HAPPINESS_ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    console.warn('[Notifications] requestPermissions error:', e);
    return false;
  }
}

export async function scheduleHappinessNotifications(petName: string, currentHappiness: number) {
  if (!Notifications) return;
  try {
    await initializeI18n();
    await cancelHappinessNotifications();

    const name = petName || i18n.t('notifications.fallbackPetName');
    const now = Date.now();
    const DATE = Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date';

    for (const threshold of NOTIFICATION_THRESHOLDS) {
      if (currentHappiness <= threshold.happiness) continue;

      const pointsUntilThreshold = currentHappiness - threshold.happiness;
      const triggerTime = new Date(now + pointsUntilThreshold * MINUTES_PER_POINT * 60 * 1000);

      await Notifications.scheduleNotificationAsync({
        identifier: `${HAPPINESS_ID_PREFIX}${threshold.happiness}`,
        content: {
          title: threshold.title(name),
          body: threshold.body(),
          sound: true,
        },
        trigger: {
          type: DATE,
          date: triggerTime,
        },
      });
    }
  } catch (e) {
    console.warn('[Notifications] scheduling error:', e);
  }
}

export async function cancelAllNotifications() {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn('[Notifications] cancel error:', e);
  }
}

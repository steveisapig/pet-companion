/**
 * Local notifications (iOS / Android). Loads `expo-notifications` via require() so Metro
 * does not treat a type-only import as a hard dependency edge that breaks some setups.
 */

let Notifications: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
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
    title: (name: string) => `${name} is getting hungry 🍽️`,
    body: () => 'Snap a meal photo to keep your pet happy!',
  },
  {
    happiness: 30,
    title: (name: string) => `${name} is lonely... 😕`,
    body: () => "Your pet hasn't eaten in a while. Share a meal!",
  },
  {
    happiness: 15,
    title: (name: string) => `${name} needs you! 😢`,
    body: () => 'Your pet is really sad. Come back and share a photo!',
  },
];

const MINUTES_PER_POINT = 30;

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
    await Notifications.cancelAllScheduledNotificationsAsync();

    const name = petName || 'Your pet';
    const now = Date.now();
    const DATE = Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date';

    for (const threshold of NOTIFICATION_THRESHOLDS) {
      if (currentHappiness <= threshold.happiness) continue;

      const pointsUntilThreshold = currentHappiness - threshold.happiness;
      const triggerTime = new Date(now + pointsUntilThreshold * MINUTES_PER_POINT * 60 * 1000);

      await Notifications.scheduleNotificationAsync({
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

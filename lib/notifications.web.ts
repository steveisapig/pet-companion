/** Web: stub implementations — notifications are not available on web */

export async function requestNotificationPermissions(): Promise<boolean> {
  return false;
}

export async function scheduleHappinessNotifications(
  _petName: string,
  _currentHappiness: number,
) {}

export async function cancelAllNotifications() {}

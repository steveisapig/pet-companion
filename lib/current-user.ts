/**
 * Stores the current auth user id (uuid) for dev login.
 * When set, pet-service and other sync logic use this instead of Supabase Auth.
 */
let devUserId: string | null = null;

export function setDevUserId(id: string | null): void {
  devUserId = id;
}

export function getDevUserId(): string | null {
  return devUserId;
}

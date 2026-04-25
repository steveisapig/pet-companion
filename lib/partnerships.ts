/**
 * Supabase read/write layer for the partnerships, partnership_members,
 * and partnership_invites tables.
 *
 * All functions accept an explicit userId (from usePet / useAuth) so they
 * work uniformly whether called from a hook or a one-off effect.
 */

import { supabase } from '@/lib/supabase';
import { lookupUserByUsername } from '@/lib/user-info';
import { SMALLINT_TO_PET_TYPE } from '@/lib/db/types';
import type { PartnershipGoalType, CaloriesDirection } from '@/lib/db/types';
import type { PetType } from '@/constants/pets';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s = supabase as any;

// ─── Public types ─────────────────────────────────────────────────────────────

export type { PartnershipGoalType, CaloriesDirection };

export const GOAL_DEFAULTS: Record<PartnershipGoalType, number> = {
  nutrients: 8,
  calories: 3000,
  variety: 10,
};

export interface PartnerInfo {
  userId: string;
  /** null if the partner has not set a handle yet */
  username: string | null;
  /** null if the partner's pet could not be fetched from the DB */
  petName: string | null;
  petType: PetType;
}

export interface ActivePartnership {
  id: string;
  goalType: PartnershipGoalType;
  goalValue: number;
  caloriesDirection: CaloriesDirection | null;
  /** ISO timestamp when the partnership was created (used to scope photo queries) */
  createdAt: string;
  partner: PartnerInfo;
}

export interface PendingInvite {
  id: string;
  fromUserId: string;
  /** null if the sender has no handle yet */
  fromUsername: string | null;
  toUserId: string;
  /** null if the recipient has no handle yet */
  toUsername: string | null;
  goalType: PartnershipGoalType;
  goalValue: number;
  caloriesDirection: CaloriesDirection | null;
  createdAt: string;
  direction: 'incoming' | 'outgoing';
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Fetch the calling user's active partnership (first one found) plus partner
 * details. Returns null if the user is not in any partnership.
 */
export async function getMyPartnership(myUserId: string): Promise<ActivePartnership | null> {
  // 1. Find all partnership IDs this user belongs to
  const { data: memberRows } = await s
    .from('partnership_members')
    .select('partnership_id')
    .eq('user_id', myUserId);

  if (!memberRows?.length) return null;
  const partnershipIds = (memberRows as { partnership_id: string }[]).map((r) => r.partnership_id);

  // 2. Fetch the first active partnership (status = 1) among those IDs
  const { data: partnership } = await s
    .from('partnerships')
    .select('id, goal_type, goal_value, calories_direction, created_at')
    .in('id', partnershipIds)
    .eq('status', 1)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!partnership) return null;

  // 3. Find the partner's user_id
  const { data: allMembers } = await s
    .from('partnership_members')
    .select('user_id')
    .eq('partnership_id', partnership.id);

  const partnerUserId = (allMembers as { user_id: string }[] | null)
    ?.find((m) => m.user_id !== myUserId)?.user_id;

  if (!partnerUserId) return null;

  // 4. Fetch partner username from user_info (publicly readable)
  const { data: partnerUserInfo } = await s
    .from('user_info')
    .select('username')
    .eq('user_id', partnerUserId)
    .maybeSingle();

  // 5. Fetch partner's pet name + type (readable after pets_select_public policy)
  const { data: partnerPet } = await s
    .from('pets')
    .select('name, pet_type')
    .eq('user_id', partnerUserId)
    .maybeSingle();

  const petType: PetType =
    (SMALLINT_TO_PET_TYPE as Record<number, PetType>)[
      (partnerPet as { pet_type: number } | null)?.pet_type ?? -1
    ] ?? 'mochi';

  return {
    id: partnership.id,
    goalType: partnership.goal_type as PartnershipGoalType,
    goalValue: partnership.goal_value as number,
    caloriesDirection: (partnership.calories_direction ?? null) as CaloriesDirection | null,
    createdAt: partnership.created_at as string,
    partner: {
      userId: partnerUserId,
      username: (partnerUserInfo as { username: string } | null)?.username ?? null,
      petName: (partnerPet as { name: string } | null)?.name ?? null,
      petType,
    },
  };
}

/**
 * Fetch all pending invites for the calling user — both incoming and outgoing.
 * Attaches usernames from user_info for the other party on each invite.
 */
export async function getMyPendingInvites(myUserId: string): Promise<PendingInvite[]> {
  const { data, error } = await s
    .from('partnership_invites')
    .select('*')
    .or(`from_user_id.eq.${myUserId},to_user_id.eq.${myUserId}`)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error || !data?.length) return [];

  // Collect other-party user_ids to batch-fetch their usernames
  const otherIds = new Set<string>();
  for (const inv of data as { from_user_id: string; to_user_id: string }[]) {
    if (inv.from_user_id !== myUserId) otherIds.add(inv.from_user_id);
    if (inv.to_user_id !== myUserId) otherIds.add(inv.to_user_id);
  }

  const usernameMap = new Map<string, string>();
  if (otherIds.size > 0) {
    const { data: infos } = await s
      .from('user_info')
      .select('user_id, username')
      .in('user_id', [...otherIds]);
    for (const info of (infos ?? []) as { user_id: string; username: string }[]) {
      usernameMap.set(info.user_id, info.username);
    }
  }

  return (data as {
    id: string;
    from_user_id: string;
    to_user_id: string;
    goal_type: string;
    goal_value: number;
    calories_direction: string | null;
    created_at: string;
  }[]).map((inv) => ({
    id: inv.id,
    fromUserId: inv.from_user_id,
    fromUsername: usernameMap.get(inv.from_user_id) ?? null,
    toUserId: inv.to_user_id,
    toUsername: usernameMap.get(inv.to_user_id) ?? null,
    goalType: inv.goal_type as PartnershipGoalType,
    goalValue: inv.goal_value,
    caloriesDirection: (inv.calories_direction ?? null) as CaloriesDirection | null,
    createdAt: inv.created_at,
    direction: inv.from_user_id === myUserId ? 'outgoing' : 'incoming',
  }));
}

// ─── Partner lookup ───────────────────────────────────────────────────────────

/**
 * Look up a user by their @handle and fetch their pet details in one go.
 * Returns null if no user exists with that handle.
 * Pet details (name, type) fall back to safe defaults if the pets table is
 * not yet readable (requires the pets_select_public policy from migration
 * 20260423010000).
 */
export async function lookupPartnerByHandle(
  handle: string,
): Promise<{ userId: string; username: string; petName: string; petType: PetType } | null> {
  const userInfo = await lookupUserByUsername(handle);
  if (!userInfo) return null;

  const { data: petRow } = await s
    .from('pets')
    .select('name, pet_type')
    .eq('user_id', userInfo.user_id)
    .maybeSingle();

  return {
    userId: userInfo.user_id,
    username: userInfo.username,
    petName: (petRow as { name: string } | null)?.name ?? userInfo.username,
    petType: (SMALLINT_TO_PET_TYPE as Record<number, PetType>)[
      (petRow as { pet_type: number } | null)?.pet_type ?? -1
    ] ?? 'mochi',
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Send a partnership invite to another user.
 * Returns null on success, an error message string on failure.
 */
export async function sendInvite(
  fromUserId: string,
  toUserId: string,
  goalType: PartnershipGoalType,
  goalValue: number,
  caloriesDirection?: CaloriesDirection,
): Promise<string | null> {
  const { error } = await s.from('partnership_invites').insert({
    from_user_id: fromUserId,
    to_user_id: toUserId,
    goal_type: goalType,
    goal_value: goalValue,
    calories_direction: caloriesDirection ?? null,
  });
  if (error?.code === 'P0001') return 'You already have 2 pending invites. Cancel one first.';
  if (error?.code === '23505') return 'You already have a pending invite to this person.';
  if (error) return error.message;
  return null;
}

/**
 * Cancel a pending invite you sent.
 * Returns null on success, an error message string on failure.
 */
export async function cancelInvite(inviteId: string): Promise<string | null> {
  const { error } = await s
    .from('partnership_invites')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) return error.message;
  return null;
}

/**
 * Decline an incoming invite.
 * Returns null on success, an error message string on failure.
 */
export async function declineInvite(inviteId: string): Promise<string | null> {
  const { error } = await s
    .from('partnership_invites')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) return error.message;
  return null;
}

/**
 * Accept an incoming invite via the accept_partnership_invite RPC.
 * The RPC atomically marks the invite accepted, creates the partnership row,
 * and adds both users to partnership_members.
 *
 * Returns { partnershipId } on success, { error } on failure.
 */
export async function acceptInvite(
  inviteId: string,
): Promise<{ partnershipId: string } | { error: string }> {
  const { data, error } = await s.rpc('accept_partnership_invite', {
    p_invite_id: inviteId,
  });
  if (error) return { error: error.message };
  return { partnershipId: data as string };
}

/**
 * Leave a partnership by marking it inactive (status = 0).
 * Membership rows are preserved for audit purposes; status = 1 is the only
 * value treated as an active partnership in all queries.
 * RLS (partnerships_update_member) ensures only current members can call this.
 * Returns null on success, an error message string on failure.
 */
export async function leavePartnership(
  partnershipId: string,
  // myUserId is no longer needed for the query — RLS enforces membership.
  // Kept in the signature to avoid a breaking change at call sites.
  _myUserId: string,
): Promise<string | null> {
  const { error } = await s
    .from('partnerships')
    .update({ status: 0, updated_at: new Date().toISOString() })
    .eq('id', partnershipId);
  if (error) return error.message;
  return null;
}

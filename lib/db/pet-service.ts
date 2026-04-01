import type { PetType } from '@/constants/pets';
import { DECAY_RATE_PER_HOUR, MIN_HAPPINESS } from '@/constants/pets';
import { PET_TYPE_TO_SMALLINT, SMALLINT_TO_PET_TYPE } from '@/lib/db/types';
import { supabase } from '@/lib/supabase';
import { getDevUserId } from '@/lib/current-user';
import {
  supabaseGetPetMetadata,
  supabaseGetPet,
  supabaseInsertPet,
  supabaseInsertPetMetadata,
  supabaseUpdatePet,
  supabaseUpdatePetMetadata,
} from './supabase-api';

export interface PetServiceState {
  petType: PetType | null;
  happiness: number;
  lastInteractionTime: number;
  photosCount: number;
  petName: string;
  onboardingComplete: boolean;
  userId: string | null;
}

const BASE_HAPPINESS = 80;

const hasSupabaseConfig = () =>
  !!(
    process.env.EXPO_PUBLIC_SUPABASE_URL &&
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );

/** Returns the current auth user id (uuid) from Supabase Auth, or null if not signed in. */
async function getAuthUserId(): Promise<string | null> {
  if (__DEV__) {
    const devId = getDevUserId();
    if (devId !== null) return devId;
  }
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Load pet state from Supabase. */
export async function loadPetState(): Promise<PetServiceState> {
  try {
    if (!hasSupabaseConfig()) {
      return defaultState(null);
    }

    const authUserId = await getAuthUserId();
    if (authUserId === null) {
      return defaultState(null);
    }

    const pet = await supabaseGetPet(authUserId);
    const petMetadata = pet ? await supabaseGetPetMetadata(pet.pet_id) : null;

    if (pet && petMetadata) {
      const petType = SMALLINT_TO_PET_TYPE[pet.pet_type] ?? null;
      const lastInteractedTs = new Date(petMetadata.last_interacted).getTime();
      const hoursSinceLastInteraction = (Date.now() - lastInteractedTs) / (1000 * 60 * 60);
      const decay = Math.floor(hoursSinceLastInteraction * DECAY_RATE_PER_HOUR);
      const happiness = Math.max(MIN_HAPPINESS, BASE_HAPPINESS - decay);
      const exp = petMetadata.experience ?? 0;
      const photosCount = Math.floor(exp / 15);

      return {
        petType,
        happiness,
        lastInteractionTime: Date.now(),
        photosCount,
        petName: pet.name,
        onboardingComplete: true,
        userId: authUserId,
      };
    }

    if (pet && !petMetadata) {
      return {
        petType: SMALLINT_TO_PET_TYPE[pet.pet_type] ?? null,
        happiness: BASE_HAPPINESS,
        lastInteractionTime: Date.now(),
        photosCount: 0,
        petName: pet.name,
        onboardingComplete: true,
        userId: authUserId,
      };
    }

    return defaultState(authUserId);
  } catch (e) {
    console.error('[PetService] Failed to load state:', e);
    return defaultState(null);
  }
}

function defaultState(userId: string | null): PetServiceState {
  return {
    petType: null,
    happiness: 70,
    lastInteractionTime: Date.now(),
    photosCount: 0,
    petName: '',
    onboardingComplete: false,
    userId,
  };
}

/** Save/update pet state to Supabase. */
export async function savePetState(state: PetServiceState): Promise<PetServiceState> {
  if (!state.userId || !state.onboardingComplete) return state;

  const experience = state.photosCount * 15;

  try {
    if (hasSupabaseConfig()) {
      const authUserId = await getAuthUserId();
      if (authUserId !== null && authUserId === state.userId) {
        const pet = await supabaseGetPet(authUserId);
        if (!pet) return state;
        await supabaseUpdatePetMetadata(pet.pet_id, {
          experience,
          last_interacted: new Date(state.lastInteractionTime).toISOString(),
        });
      }
    }
  } catch (e) {
    console.error('[PetService] Failed to save state:', e);
  }
  return state;
}

/** Create pet in Supabase when user completes onboarding. */
export async function selectPet(
  type: PetType,
  name: string
): Promise<PetServiceState> {
  const typeNum = PET_TYPE_TO_SMALLINT[type];

  if (!hasSupabaseConfig()) {
    throw new Error('Supabase is not configured. Cannot create pet.');
  }

  const authUserId = await getAuthUserId();
  if (authUserId === null) {
    throw new Error('User must be signed in to create a pet.');
  }

  const existingPet = await supabaseGetPet(authUserId);
  if (existingPet) {
    await supabaseUpdatePet(authUserId, { pet_type: typeNum, name });
    await supabaseUpdatePetMetadata(existingPet.pet_id, {
      experience: 0,
      last_interacted: new Date().toISOString(),
    });
    return {
      petType: type,
      happiness: BASE_HAPPINESS,
      lastInteractionTime: Date.now(),
      photosCount: 0,
      petName: name,
      onboardingComplete: true,
      userId: authUserId,
    };
  }

  const createdPet = await supabaseInsertPet({
    user_id: authUserId,
    pet_type: typeNum,
    name,
  });
  await supabaseInsertPetMetadata({
    pet_id: createdPet.pet_id,
    experience: 0,
    last_interacted: new Date().toISOString(),
  });

  return {
    petType: type,
    happiness: BASE_HAPPINESS,
    lastInteractionTime: Date.now(),
    photosCount: 0,
    petName: name,
    onboardingComplete: true,
    userId: authUserId,
  };
}

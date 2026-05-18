import { useEffect, useCallback, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import {
  PetType,
  getMoodFromHappiness,
  getLevelFromExperience,
  getExpForLevel,
  getExpProgressInLevel,
  PHOTO_HAPPINESS_BOOST,
  MAX_HAPPINESS,
  MIN_HAPPINESS,
} from '@/constants/pets';
import {
  loadPetState as loadFromDb,
  savePetState as saveToDb,
  selectPet as selectPetInDb,
  type PetServiceState,
} from '@/lib/db/pet-service';
import {
  loadBadges,
  addBadgesToSupabase,
  type Badges,
} from '@/lib/badges';
import { useAuth } from '@/providers/AuthProvider';
import {
  getPetPrimaryColor,
  savePetPrimaryColor,
} from '@/lib/pet-color-storage';
import { getMyUsername } from '@/lib/user-info';

interface PetState extends Omit<PetServiceState, 'userId'> {
  userId: string | null;
}

const DEFAULT_STATE: PetState = {
  petType: null,
  happiness: 70,
  lastInteractionTime: Date.now(),
  photosCount: 0,
  petName: '',
  onboardingComplete: false,
  userId: null,
};

async function loadPetState(): Promise<PetState> {
  const state = await loadFromDb();
  return {
    ...state,
    userId: state.userId,
  };
}

async function savePetState(state: PetState): Promise<PetState> {
  await saveToDb({
    ...state,
    userId: state.userId,
  });
  return state;
}

const PET_LOADING_FALLBACK = {
  petType: null as import('@/constants/pets').PetType | null,
  petName: '',
  userId: null as string | null,
  happiness: 70,
  mood: 'happy' as ReturnType<typeof import('@/constants/pets').getMoodFromHappiness>,
  photosCount: 0,
  experience: 0,
  level: 1,
  expProgress: 0,
  expForNextLevel: 15,
  justLeveledUp: false,
  clearLevelUp: () => {},
  onboardingComplete: false,
  isLoading: true,
  badges: {} as import('@/lib/badges').Badges,
  topNutrientBadge: null as { itemType: number; count: number } | null,
  addBadges: async (_nutrients: string[]) => {},
  selectPet: async (_type: import('@/constants/pets').PetType, _name: string) => {},
  addPhoto: () => {},
  petPrimaryColor: null as string | null,
  setPetPrimaryColor: (_color: string | null) => {},
  username: null as string | null,
  devResetToFirstLaunch: () => {},
};

const [PetProvider, _usePetRaw] = createContextHook(() => {
  const queryClient = useQueryClient();
  const { isSignedIn, user } = useAuth();
  const [petState, setPetState] = useState<PetState>(DEFAULT_STATE);
  const decayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const userIdKey = user?.id ?? null;
  const stateQuery = useQuery({
    queryKey: ['petState', isSignedIn, userIdKey],
    queryFn: loadPetState,
    staleTime: Infinity,
  });

  const userId = stateQuery.data?.userId ?? null;
  const badgesQuery = useQuery({
    queryKey: ['petBadges', userId],
    queryFn: () => loadBadges(userId),
    staleTime: Infinity,
    enabled: stateQuery.isSuccess,
  });

  const [badges, setBadges] = useState<Badges>({});
  const [petPrimaryColor, setPetPrimaryColorState] = useState<string | null>(null);

  useEffect(() => {
    getPetPrimaryColor().then(setPetPrimaryColorState);
  }, []);

  const setPetPrimaryColor = useCallback((color: string | null) => {
    setPetPrimaryColorState(color);
    savePetPrimaryColor(color);
  }, []);

  const usernameQuery = useQuery({
    queryKey: ['myUsername', userId],
    queryFn: () => getMyUsername(userId!),
    enabled: !!userId,
    staleTime: Infinity,
  });
  const username = usernameQuery.data ?? null;

  const saveMutation = useMutation({
    mutationFn: savePetState,
    onSuccess: (data) => {
      queryClient.setQueryData(['petState', isSignedIn, userIdKey], data);
    },
  });

  const { mutate: saveState } = saveMutation;

  useEffect(() => {
    if (stateQuery.data) {
      setPetState(stateQuery.data);
    }
  }, [stateQuery.data]);

  useEffect(() => {
    if (badgesQuery.data) {
      setBadges(badgesQuery.data);
    }
  }, [badgesQuery.data]);

  useEffect(() => {
    if (!petState.onboardingComplete) return;

    decayIntervalRef.current = setInterval(() => {
      setPetState(prev => {
        const newHappiness = Math.max(MIN_HAPPINESS, prev.happiness - 1);
        if (newHappiness !== prev.happiness) {
          console.log(`[PetProvider] Decay tick: ${prev.happiness} -> ${newHappiness}`);
          const updated = { ...prev, happiness: newHappiness };
          saveState(updated);
          return updated;
        }
        return prev;
      });
    }, 30 * 60 * 1000);

    return () => {
      if (decayIntervalRef.current) {
        clearInterval(decayIntervalRef.current);
      }
    };
  }, [petState.onboardingComplete, saveState]);

  const updateAndSave = useCallback((updater: (prev: PetState) => PetState) => {
    setPetState(prev => {
      const next = updater(prev);
      saveState(next);
      return next;
    });
  }, [saveState]);

  const selectPet = useCallback(async (type: PetType, name: string) => {
    console.log(`[PetProvider] Pet selected: ${type}, name: ${name}`);
    try {
      const newState = await selectPetInDb(type, name);
      setPetState({
        ...newState,
        userId: newState.userId,
      });
      saveState({
        ...newState,
        userId: newState.userId,
      });
      queryClient.setQueryData(['petState', isSignedIn, userIdKey], newState);
    } catch (e) {
      console.error('[PetProvider] Failed to select pet:', e);
      updateAndSave(prev => ({
        ...prev,
        petType: type,
        petName: name,
        onboardingComplete: true,
        happiness: 80,
        lastInteractionTime: Date.now(),
      }));
    }
  }, [saveState, queryClient, isSignedIn, userIdKey, updateAndSave]);

  const addPhoto = useCallback(() => {
    console.log('[PetProvider] Photo added!');
    setPetState((prev) => {
      const prevExperience = prev.photosCount * 15;
      const prevLevel = getLevelFromExperience(prevExperience);
      const nextPhotosCount = prev.photosCount + 1;
      const nextExperience = nextPhotosCount * 15;
      const nextLevel = getLevelFromExperience(nextExperience);

      const next = {
        ...prev,
        happiness: Math.min(MAX_HAPPINESS, prev.happiness + PHOTO_HAPPINESS_BOOST),
        photosCount: nextPhotosCount,
        lastInteractionTime: Date.now(),
      };

      if (nextLevel > prevLevel) {
        setJustLeveledUp(true);
      }

      saveState(next);
      return next;
    });
  }, [saveState]);

  /** Experience comes from photos only; taps do not grant XP */
  const experience = petState.photosCount * 15;
  const level = getLevelFromExperience(experience);
  const expProgress = getExpProgressInLevel(experience);
  const expForNextLevel = getExpForLevel(level + 1) - getExpForLevel(level);

  const [justLeveledUp, setJustLeveledUp] = useState(false);

  const clearLevelUp = useCallback(() => {
    setJustLeveledUp(false);
  }, []);

  const addBadges = useCallback(async (nutrients: string[]) => {
    const uid = petState.userId ?? user?.id ?? null;
    if (uid === null || nutrients.length === 0) return;
    try {
      await addBadgesToSupabase(uid, nutrients);
      await queryClient.invalidateQueries({ queryKey: ['petBadges', uid] });
    } catch (e) {
      console.error('[PetProvider] Failed to add badges:', e);
    }
  }, [queryClient, petState.userId, user?.id]);

  const mood = getMoodFromHappiness(petState.happiness);
  const isLoading = stateQuery.isLoading;

  // Get top nutrient badge for sharing
  const topNutrientBadge = Object.entries(badges)
    .map(([itemTypeStr, count]) => ({
      itemType: parseInt(itemTypeStr, 10),
      count,
    }))
    .sort((a, b) => b.count - a.count)[0] ?? null;

  const devResetToFirstLaunch = useCallback(() => {
    // Memory-only: no db write, so the real pet data is untouched on next launch
    setPetState(prev => ({ ...prev, onboardingComplete: false }));
  }, []);

  return {
    petType: petState.petType,
    petName: petState.petName,
    userId: petState.userId,
    happiness: petState.happiness,
    mood,
    photosCount: petState.photosCount,
    experience,
    level,
    expProgress,
    expForNextLevel,
    justLeveledUp,
    clearLevelUp,
    onboardingComplete: petState.onboardingComplete,
    isLoading,
    badges,
    topNutrientBadge,
    addBadges,
    selectPet,
    addPhoto,
    petPrimaryColor,
    setPetPrimaryColor,
    username,
    devResetToFirstLaunch,
  };
});

export { PetProvider };

/** Safe wrapper — returns a loading fallback during Fast Refresh / provider initialization. */
export function usePet() {
  return _usePetRaw() ?? PET_LOADING_FALLBACK;
}

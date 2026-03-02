import { useEffect, useCallback, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import {
  PetType,
  getMoodFromHappiness,
  DECAY_RATE_PER_HOUR,
  PHOTO_HAPPINESS_BOOST,
  TAP_HAPPINESS_BOOST,
  MAX_HAPPINESS,
  MIN_HAPPINESS,
} from '@/constants/pets';

interface PetState {
  petType: PetType | null;
  happiness: number;
  lastInteractionTime: number;
  photosCount: number;
  tapCount: number;
  petName: string;
  onboardingComplete: boolean;
}

const DEFAULT_STATE: PetState = {
  petType: null,
  happiness: 70,
  lastInteractionTime: Date.now(),
  photosCount: 0,
  tapCount: 0,
  petName: '',
  onboardingComplete: false,
};

const STORAGE_KEY = 'pet_state';

async function loadPetState(): Promise<PetState> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as PetState;
      const now = Date.now();
      const hoursSinceLastInteraction = (now - parsed.lastInteractionTime) / (1000 * 60 * 60);
      const decay = Math.floor(hoursSinceLastInteraction * DECAY_RATE_PER_HOUR);
      const newHappiness = Math.max(MIN_HAPPINESS, parsed.happiness - decay);
      console.log(`[PetProvider] Loaded state. Hours since last: ${hoursSinceLastInteraction.toFixed(1)}, decay: ${decay}, happiness: ${parsed.happiness} -> ${newHappiness}`);
      return { ...parsed, happiness: newHappiness, lastInteractionTime: now };
    }
  } catch (e) {
    console.error('[PetProvider] Failed to load state:', e);
  }
  return DEFAULT_STATE;
}

async function savePetState(state: PetState): Promise<PetState> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    console.log('[PetProvider] State saved:', state.happiness);
  } catch (e) {
    console.error('[PetProvider] Failed to save state:', e);
  }
  return state;
}

export const [PetProvider, usePet] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [petState, setPetState] = useState<PetState>(DEFAULT_STATE);
  const decayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stateQuery = useQuery({
    queryKey: ['petState'],
    queryFn: loadPetState,
    staleTime: Infinity,
  });

  const saveMutation = useMutation({
    mutationFn: savePetState,
    onSuccess: (data) => {
      queryClient.setQueryData(['petState'], data);
    },
  });

  const { mutate: saveState } = saveMutation;

  useEffect(() => {
    if (stateQuery.data) {
      setPetState(stateQuery.data);
    }
  }, [stateQuery.data]);

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

  const selectPet = useCallback((type: PetType, name: string) => {
    console.log(`[PetProvider] Pet selected: ${type}, name: ${name}`);
    updateAndSave(prev => ({
      ...prev,
      petType: type,
      petName: name,
      onboardingComplete: true,
      happiness: 80,
      lastInteractionTime: Date.now(),
    }));
  }, [updateAndSave]);

  const tapPet = useCallback(() => {
    console.log('[PetProvider] Pet tapped!');
    updateAndSave(prev => ({
      ...prev,
      happiness: Math.min(MAX_HAPPINESS, prev.happiness + TAP_HAPPINESS_BOOST),
      tapCount: prev.tapCount + 1,
      lastInteractionTime: Date.now(),
    }));
  }, [updateAndSave]);

  const addPhoto = useCallback(() => {
    console.log('[PetProvider] Photo added!');
    updateAndSave(prev => ({
      ...prev,
      happiness: Math.min(MAX_HAPPINESS, prev.happiness + PHOTO_HAPPINESS_BOOST),
      photosCount: prev.photosCount + 1,
      lastInteractionTime: Date.now(),
    }));
  }, [updateAndSave]);

  const mood = getMoodFromHappiness(petState.happiness);
  const isLoading = stateQuery.isLoading;

  return {
    petType: petState.petType,
    petName: petState.petName,
    happiness: petState.happiness,
    mood,
    photosCount: petState.photosCount,
    tapCount: petState.tapCount,
    onboardingComplete: petState.onboardingComplete,
    isLoading,
    selectPet,
    tapPet,
    addPhoto,
  };
});

export type PetType = 'mochi' | 'nugget' | 'cookie';

export type MoodLevel = 'ecstatic' | 'happy' | 'content' | 'neutral' | 'sad' | 'miserable';

export interface PetConfig {
  id: PetType;
  name: string;
  description: string;
  image: any;
  color: string;
  accentColor: string;
}

export const PET_CONFIGS: Record<PetType, PetConfig> = {
  mochi: {
    id: 'mochi',
    name: 'Mochi',
    description: 'A soft, squishy little friend who loves cuddles',
    image: require('@/assets/images/pet-mochi.png'),
    color: '#FFF8F0',
    accentColor: '#D4A574',
  },
  nugget: {
    id: 'nugget',
    name: 'Nugget',
    description: 'A warm, golden buddy full of energy',
    image: require('@/assets/images/pet-nugget.png'),
    color: '#FFF3E0',
    accentColor: '#E8985E',
  },
  cookie: {
    id: 'cookie',
    name: 'Cookie',
    description: 'A sweet adventurer who always finds treats',
    image: require('@/assets/images/pet-cookie.png'),
    color: '#FFF8F0',
    accentColor: '#8D6E63',
  },
};

export const MOOD_CONFIG: Record<MoodLevel, { emoji: string; label: string; color: string }> = {
  ecstatic: { emoji: '✨', label: 'Ecstatic!', color: '#FFD700' },
  happy: { emoji: '😊', label: 'Happy', color: '#A8D5A2' },
  content: { emoji: '🙂', label: 'Content', color: '#B7C9A8' },
  neutral: { emoji: '😐', label: 'Okay', color: '#D4A574' },
  sad: { emoji: '😢', label: 'Sad', color: '#A8C4D4' },
  miserable: { emoji: '😭', label: 'Miserable', color: '#9E9E9E' },
};

export const HAPPINESS_THRESHOLDS: Record<MoodLevel, number> = {
  ecstatic: 90,
  happy: 70,
  content: 50,
  neutral: 30,
  sad: 15,
  miserable: 0,
};

export function getMoodFromHappiness(happiness: number): MoodLevel {
  if (happiness >= HAPPINESS_THRESHOLDS.ecstatic) return 'ecstatic';
  if (happiness >= HAPPINESS_THRESHOLDS.happy) return 'happy';
  if (happiness >= HAPPINESS_THRESHOLDS.content) return 'content';
  if (happiness >= HAPPINESS_THRESHOLDS.neutral) return 'neutral';
  if (happiness >= HAPPINESS_THRESHOLDS.sad) return 'sad';
  return 'miserable';
}

export const DECAY_RATE_PER_HOUR = 2;
export const PHOTO_HAPPINESS_BOOST = 15;
export const TAP_HAPPINESS_BOOST = 3;
export const MAX_HAPPINESS = 100;
export const MIN_HAPPINESS = 0;

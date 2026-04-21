export type PetType = 'mochi' | 'nugget' | 'cookie';

export type MoodLevel = 'ecstatic' | 'happy' | 'content' | 'neutral' | 'sad' | 'miserable';

export interface PetConfig {
  id: PetType;
  name: string;
  description: string;
  image: any;
  /** Shown when mood is sad / miserable; omit if no separate asset (e.g. Nugget) */
  imageSad?: any;
  color: string;
  accentColor: string;

  /**
   * Multi-layer (Option C) assets. When provided, PetPortrait renders these
   * instead of `image` / `imageSad`.
   *
   * Required art spec:
   *   bodyImage      – grayscale/white body-only PNG (transparent bg). Receives
   *                    tintColor = user's chosen primaryColor at runtime.
   *   detailImage    – eyes, mouth, outlines only PNG (transparent bg). Rendered
   *                    on top with no tint so details stay crisp.
   *   bodyImageSad   – body layer for sad/miserable moods (optional; falls back
   *                    to bodyImage if omitted).
   *   detailImageSad – detail layer for sad/miserable moods (falls back to
   *                    detailImage if omitted).
   *
   * Until these assets are delivered, PetPortrait falls back to `image` /
   * `imageSad` and shows a soft color aura behind the pet to preview the
   * chosen color.
   */
  bodyImage?: any;
  detailImage?: any;
  bodyImageSad?: any;
  detailImageSad?: any;
}

export const PET_CONFIGS: Record<PetType, PetConfig> = {
  mochi: {
    id: 'mochi',
    name: 'Mochi',
    description: 'A soft, squishy little friend who loves cuddles',
    image: require('@/assets/images/pet-mochi.png'),
    imageSad: require('@/assets/images/sad-mochi.png'),
    color: '#FFF8F0',
    accentColor: '#D4A574',
  },
  nugget: {
    id: 'nugget',
    name: 'Nugget',
    description: 'A warm, golden buddy full of energy',
    image: require('@/assets/images/pet-nugget.png'),
    imageSad: require('@/assets/images/sad-nugget.png'),
    color: '#FFF3E0',
    accentColor: '#E8985E',
  },
  cookie: {
    id: 'cookie',
    name: 'Cookie',
    description: 'A sweet adventurer who always finds treats',
    image: require('@/assets/images/pet-cookie.png'),
    imageSad: require('@/assets/images/sad-cookie.png'),
    color: '#FFF8F0',
    accentColor: '#8D6E63',
  },
};

/** Pet portrait for the current mood; use `imageSad` when present for sad / miserable. */
export function getPetImageForMood(config: PetConfig, mood: MoodLevel): any {
  if ((mood === 'sad' || mood === 'miserable') && config.imageSad != null) {
    return config.imageSad;
  }
  return config.image;
}

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

export function getPetDescriptionKey(type: PetType): `pets.${PetType}.description` {
  return `pets.${type}.description`;
}

export function getMoodLabelKey(mood: MoodLevel): `pet.moods.${MoodLevel}` {
  return `pet.moods.${mood}`;
}

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

/** Leveling: experience required increases exponentially */
export const LEVEL_EXP_BASE = 50;
export const LEVEL_EXP_MULTIPLIER = 1.5;

/** Total experience required to reach a level. Level 1 = 0, Level 2 = 50, Level 3 = 125, etc. */
export function getExpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(LEVEL_EXP_BASE * (Math.pow(LEVEL_EXP_MULTIPLIER, level - 1) - 1) / (LEVEL_EXP_MULTIPLIER - 1));
}

/** Get current level from total experience */
export function getLevelFromExperience(experience: number): number {
  let level = 1;
  while (getExpForLevel(level + 1) <= experience) {
    level++;
  }
  return level;
}

/** Experience progress within current level (0–1) */
export function getExpProgressInLevel(experience: number): number {
  const level = getLevelFromExperience(experience);
  const expForCurrent = getExpForLevel(level);
  const expForNext = getExpForLevel(level + 1);
  const expInLevel = experience - expForCurrent;
  const expNeeded = expForNext - expForCurrent;
  return expNeeded > 0 ? expInLevel / expNeeded : 1;
}

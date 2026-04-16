export type PhotoRatingTier = 'little' | 'like' | 'love';

export interface PhotoRatingResult {
  tier: PhotoRatingTier;
}

/**
 * Maps a healthScore (0–10, as rated by the LLM) to a pet reaction tier.
 */
export function photoRatingFromHealthScore(healthScore: number): PhotoRatingResult {
  const score = Math.max(0, Math.min(10, Math.round(healthScore)));

  if (score <= 2) {
    return { tier: 'little' };
  }
  if (score <= 6) {
    return { tier: 'like' };
  }
  return { tier: 'love' };
}

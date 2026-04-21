import React, { useState } from 'react';
import { View, Image, StyleSheet, Image as RNImage, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Image as SvgImage, Defs, Filter, FeColorMatrix, G } from 'react-native-svg';
import { PET_CONFIGS, getPetImageForMood, type MoodLevel, type PetType } from '@/constants/pets';

// ─── Hue math ─────────────────────────────────────────────────────────────────

/**
 * Approximate dominant body hue (°) for each pet's default coloring.
 * Used to compute the delta so the target color looks natural.
 */
const PET_BASE_HUES: Record<PetType, number> = {
  mochi: 30,   // warm tan  #D4A574
  nugget: 28,  // golden    #E8985E
  cookie: 15,  // brown     #8D6E63
};

function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h =
    max === r ? ((g - b) / d) % 6 :
    max === g ? (b - r) / d + 2 :
                (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PetPortraitProps {
  petType: PetType;
  mood: MoodLevel;
  /**
   * Hex colour string. When provided the pet image is hue-rotated + saturated
   * to match the target colour using an SVG FeColorMatrix filter chain
   * (react-native-svg, already bundled — no new native dependency).
   * When null/undefined the original image renders with no overhead.
   */
  primaryColor?: string | null;
  style?: StyleProp<ViewStyle>;
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center';
}

interface Size { width: number; height: number }

export default function PetPortrait({
  petType,
  mood,
  primaryColor,
  style,
}: PetPortraitProps) {
  const [size, setSize] = useState<Size | null>(null);

  const config = PET_CONFIGS[petType];
  const imageSource = getPetImageForMood(config, mood);

  // Fast path: no colour applied — plain RN Image, zero overhead.
  if (!primaryColor) {
    return (
      <View style={[styles.container, style]}>
        <Image source={imageSource} style={[StyleSheet.absoluteFill, styles.image]} resizeMode="contain" />
      </View>
    );
  }

  // Compute hue rotation delta (target hue − pet's natural hue).
  const hueDelta = hexToHue(primaryColor) - PET_BASE_HUES[petType];

  // Resolve the require() asset to a URI that SvgImage can consume.
  const resolved = RNImage.resolveAssetSource(imageSource);
  const filterId = `hue-${petType}-${primaryColor.replace('#', '')}`;

  return (
    <View
      style={[styles.container, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setSize({ width, height });
      }}
    >
      {/* Show plain image until layout dimensions are known (prevents blank flash) */}
      {!size ? (
        <Image source={imageSource} style={[StyleSheet.absoluteFill, styles.image]} resizeMode="contain" />
      ) : (
        <Svg width={size.width} height={size.height}>
          <Defs>
            {/* colorInterpolationFilters="sRGB" gives perceptually accurate hue shifts */}
            <Filter id={filterId} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <FeColorMatrix type="hueRotate" values={String(hueDelta)} in="SourceGraphic" result="hueShifted" />
              <FeColorMatrix type="saturate" values="1.5" in="hueShifted" />
            </Filter>
          </Defs>
          {/* filter must be on a G wrapper — not directly on SvgImage */}
          <G filter={`url(#${filterId})`}>
            <SvgImage
              href={resolved.uri}
              x={0}
              y={0}
              width={size.width}
              height={size.height}
              preserveAspectRatio="xMidYMid meet"
            />
          </G>
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

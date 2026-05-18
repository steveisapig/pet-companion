import React, { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Colors from '@/constants/colors';

const COLS = 4;
const ROWS = 3;
const FRAME_COUNT = 12;

const sprite = require('@/assets/animations/cookie-sprite3.png');

interface Props {
  style?: StyleProp<ViewStyle>;
  fps?: number;
}

export default function CookieSpriteAnimation({ style, fps = 10 }: Props) {
  const [frame, setFrame] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setFrame(f => (f + 1) % FRAME_COUNT);
    }, 1000 / fps);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fps]);

  const col = frame % COLS;
  const row = Math.floor(frame / COLS);

  return (
    <View
      style={[styles.container, style]}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setSize({ width, height });
      }}
    >
      {size && (
        <Image
          source={sprite}
          style={{
            width: size.width * COLS,
            height: size.height * ROWS,
            marginLeft: -col * size.width,
            marginTop: -row * size.height,
          }}
          resizeMode="stretch"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: Colors.cream,
  },
});

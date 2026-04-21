import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import Colors from '@/constants/colors';

// expo-network requires a compiled native module; gracefully skip if unavailable
// (e.g. Expo Go without a matching native build).
let Network: typeof import('expo-network') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Network = require('expo-network');
} catch {
  Network = null;
}

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!Network) return;

    // Check initial state
    Network.getNetworkStateAsync().then((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
      slideAnim.setValue(offline ? 1 : 0);
    }).catch(() => {});

    // Listen for changes
    let sub: { remove: () => void } | null = null;
    try {
      sub = Network.addNetworkStateListener((state) => {
        const offline = state.isConnected === false || state.isInternetReachable === false;
        setIsOffline(offline);
        Animated.spring(slideAnim, {
          toValue: offline ? 1 : 0,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }).start();
      });
    } catch {
      // Listener not available
    }

    return () => sub?.remove();
  }, [slideAnim]);

  if (!isOffline) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          opacity: slideAnim,
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-40, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.text}>📡 No internet — showing cached data</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: Colors.darkBrown,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
});

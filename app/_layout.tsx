import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import OfflineBanner from "@/components/OfflineBanner";

// Stale AsyncStorage session: GoTrue logs then clears the session; not actionable in dev UI.
if (__DEV__) {
  LogBox.ignoreLogs([
    "Invalid Refresh Token: Refresh Token Not Found",
    "AuthApiError: Invalid Refresh Token: Refresh Token Not Found",
  ]);
}
import { AuthProvider } from "@/providers/AuthProvider";
import { I18nProvider } from "@/providers/I18nProvider";
import { OnboardingProvider } from "@/providers/OnboardingProvider";
import { PetProvider } from "@/providers/PetProvider";
import { NotificationsProvider } from "@/providers/NotificationsProvider";
import { initializeI18n } from "@/lib/i18n";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Serve cached data for 5 minutes before background-refetching
      staleTime: 5 * 60 * 1000,
      // Keep unused cache entries for 24 hours so they survive offline sessions
      gcTime: 24 * 60 * 60 * 1000,
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: '@pet_companion/query-cache',
  // Exclude album photos — they contain image URLs and can be large
  serialize: (cache) => {
    const filtered = {
      ...cache,
      clientState: {
        ...cache.clientState,
        queries: cache.clientState.queries.filter(
          (q) => q.queryKey[0] !== 'albumPhotos'
        ),
      },
    };
    return JSON.stringify(filtered);
  },
});

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="email-auth" />
      <Stack.Screen name="email-sign-up" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="pet" />
      <Stack.Screen name="walk" />
      <Stack.Screen name="inventory" />
      <Stack.Screen name="items" />
      <Stack.Screen name="streak" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="camera" options={{ gestureEnabled: false }} />
      <Stack.Screen name="album" />
      <Stack.Screen name="group" />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initializeI18n()
      .catch((e) => console.error('[i18n] init error:', e))
      .finally(() => {
        console.log('Supabase URL:', process.env.EXPO_PUBLIC_SUPABASE_URL);
        fetch('https://nscgjfevlpxxrfeztzwr.supabase.co/auth/v1/health')
          .then(async (r) => {
            console.log('[Supabase health] status:', r.status);
            const text = await r.text();
            console.log('[Supabase health] body:', text || '(empty)');
            try {
              return text ? JSON.parse(text) : null;
            } catch {
              return text;
            }
          })
          .then((data) => data != null && console.log('[Supabase health] parsed:', data))
          .catch((e) => console.error('[Supabase health] error:', e))
          .finally(() => SplashScreen.hideAsync());
      });
  }, []);

  return (
    <I18nProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            <AuthProvider>
              <PetProvider>
                <NotificationsProvider>
                  <OnboardingProvider>
                    <RootLayoutNav />
                  </OnboardingProvider>
                </NotificationsProvider>
              </PetProvider>
            </AuthProvider>
            <OfflineBanner />
          </View>
        </GestureHandlerRootView>
      </PersistQueryClientProvider>
    </I18nProvider>
  );
}

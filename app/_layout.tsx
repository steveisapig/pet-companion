import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/providers/AuthProvider";
import { OnboardingProvider } from "@/providers/OnboardingProvider";
import { PetProvider } from "@/providers/PetProvider";
import { setupNotificationHandler } from "@/lib/notifications";

setupNotificationHandler();

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

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
      <Stack.Screen name="camera" options={{ presentation: "modal" }} />
      <Stack.Screen name="album" />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
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
      .catch((e) => console.error('[Supabase health] error:', e));
    SplashScreen.hideAsync();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <PetProvider>
            <OnboardingProvider>
              <RootLayoutNav />
            </OnboardingProvider>
          </PetProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

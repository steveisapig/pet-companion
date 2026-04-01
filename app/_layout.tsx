import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

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
      <Stack.Screen name="streak" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="camera" options={{ presentation: "modal" }} />
      <Stack.Screen name="album" />
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
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AuthProvider>
            <PetProvider>
              <NotificationsProvider>
                <OnboardingProvider>
                  <RootLayoutNav />
                </OnboardingProvider>
              </NotificationsProvider>
            </PetProvider>
          </AuthProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </I18nProvider>
  );
}

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { DataProvider } from "@/lib/DataContext";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { isAuthenticated, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inSignIn = segments[0] === "sign-in";
    if (!isAuthenticated && !inSignIn) {
      router.replace("/sign-in");
    }
  }, [isAuthenticated, loading, segments]);

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add-member" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="add-event" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="add-group" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="add-transaction" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="add-loan" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="account-settings" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="event-detail" options={{ headerShown: false }} />
      <Stack.Screen name="member-detail" options={{ headerShown: false }} />
      <Stack.Screen name="group-detail" options={{ headerShown: false }} />
      <Stack.Screen name="loan-detail" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView>
          <KeyboardProvider>
            <DataProvider>
              <AuthProvider>
                <RootLayoutNav />
              </AuthProvider>
            </DataProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

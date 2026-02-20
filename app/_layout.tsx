import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
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
    const inLogin = (segments[0] as string) === "sign-in";
    if (!isAuthenticated && !inLogin) {
      router.replace("/sign-in" as any);
      return;
    }
    if (isAuthenticated && inLogin) {
      router.replace("/" as any);
    }
  }, [isAuthenticated, loading, segments]);

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add-member" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="add-event" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="add-group" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="add-transaction" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="add-loan" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="account-settings" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="event-detail" options={{ headerShown: false }} />
      <Stack.Screen name="member-detail" options={{ headerShown: false }} />
      <Stack.Screen name="member-change-approvals" options={{ headerShown: false }} />
      <Stack.Screen name="group-detail" options={{ headerShown: false }} />
      <Stack.Screen name="loan-detail" options={{ headerShown: false }} />
      <Stack.Screen name="qr-scanner" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="member-card" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="data-management" options={{ headerShown: false }} />
      <Stack.Screen name="phone-transfer" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="member-data-management" options={{ headerShown: false }} />
      <Stack.Screen name="import-members" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="members" options={{ headerShown: false }} />
      <Stack.Screen name="events" options={{ headerShown: false }} />
      <Stack.Screen name="loans" options={{ headerShown: false }} />
      <Stack.Screen name="expense-claims" options={{ headerShown: false }} />
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
        <GestureHandlerRootView style={{ flex: 1 }}>
            <DataProvider>
              <AuthProvider>
                <RootLayoutNav />
              </AuthProvider>
            </DataProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { DataProvider } from "@/lib/DataContext";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import Colors from "@/constants/colors";
import { checkForAppUpdate, getCurrentAppVersion, type AppUpdateInfo } from "@/lib/app-update";
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
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

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

  useEffect(() => {
    const checkUpdateOnLaunch = async () => {
      if (loading || !isAuthenticated) return;
      const now = Date.now();
      const lastCheckedAt = Number((await AsyncStorage.getItem("@app_update_last_checked_at")) || 0);
      if (lastCheckedAt && now - lastCheckedAt < 3 * 60 * 60 * 1000) {
        return;
      }
      const info = await checkForAppUpdate();
      await AsyncStorage.setItem("@app_update_last_checked_at", String(now));
      if (!info.ok || !info.hasUpdate || !info.latestVersion || !info.downloadUrl) return;
      const skippedVersion = String((await AsyncStorage.getItem("@app_update_skipped_version")) || "");
      if (!info.force && skippedVersion && skippedVersion === info.latestVersion) return;
      setUpdateInfo(info);
      setShowUpdateModal(true);
    };
    void checkUpdateOnLaunch();
  }, [loading, isAuthenticated]);

  const handleUpdateNow = async () => {
    if (!updateInfo?.downloadUrl) return;
    try {
      await Linking.openURL(updateInfo.downloadUrl);
    } catch {
      // ignore
    }
  };

  const handleUpdateLater = () => {
    setShowUpdateModal(false);
  };

  const handleSkipThisVersion = async () => {
    if (updateInfo?.latestVersion) {
      await AsyncStorage.setItem("@app_update_skipped_version", updateInfo.latestVersion);
    }
    setShowUpdateModal(false);
  };

  return (
    <>
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

      <Modal
        transparent
        animationType="fade"
        visible={showUpdateModal}
        onRequestClose={handleUpdateLater}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update Available</Text>
            <Text style={styles.modalText}>Current: {getCurrentAppVersion()}</Text>
            <Text style={styles.modalText}>Latest: {updateInfo?.latestVersion || "-"}</Text>
            {updateInfo?.notes ? <Text style={styles.modalNotes}>{updateInfo.notes}</Text> : null}

            <View style={styles.modalActions}>
              {!updateInfo?.force && (
                <Pressable style={styles.btnGhost} onPress={() => void handleSkipThisVersion()}>
                  <Text style={styles.btnGhostText}>Skip</Text>
                </Pressable>
              )}
              {!updateInfo?.force && (
                <Pressable style={styles.btnGhost} onPress={handleUpdateLater}>
                  <Text style={styles.btnGhostText}>Later</Text>
                </Pressable>
              )}
              <Pressable style={styles.btnPrimary} onPress={() => void handleUpdateNow()}>
                <Text style={styles.btnPrimaryText}>Update Now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
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

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 14,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    color: Colors.light.text,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  modalText: {
    fontSize: 13,
    color: Colors.light.text,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
  },
  modalNotes: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  modalActions: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  btnGhost: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  btnGhostText: {
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  btnPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: Colors.light.tint,
  },
  btnPrimaryText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 12,
  },
});

import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
const APP_UPDATE_LAST_CHECKED_KEY = "@app_update_last_checked_at";
const APP_UPDATE_SKIPPED_VERSION_KEY = "@app_update_skipped_version";
const UPDATE_CHECK_MIN_INTERVAL_MS = 5 * 60 * 1000;
const UPDATE_BACKGROUND_RECHECK_MS = 10 * 60 * 1000;

function normalizeUpdateDownloadUrl(rawUrl: string): string {
  const text = String(rawUrl || "").trim();
  if (!text) return "";
  try {
    const u = new URL(text);
    const host = u.hostname.toLowerCase();
    if (host === "github.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      const blobIdx = parts.indexOf("blob");
      if (parts.length >= 5 && blobIdx === 2) {
        const owner = parts[0];
        const repo = parts[1];
        const branch = parts[3];
        const filePath = parts.slice(4).join("/");
        return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
      }
      if (u.searchParams.get("raw") !== "1") {
        u.searchParams.set("raw", "1");
      }
      return u.toString();
    }
    return u.toString();
  } catch {
    return text;
  }
}

function RootLayoutNav() {
  const { isAuthenticated, loading, recordActivity } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updatingNow, setUpdatingNow] = useState(false);
  const [updateProgressText, setUpdateProgressText] = useState("");
  const updateCheckInFlightRef = useRef(false);
  const lastActiveCheckAtRef = useRef(0);

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
  }, [isAuthenticated, loading, segments, router]);

  useEffect(() => {
    if (loading || Platform.OS === "web") return;

    const checkForUpdateNow = async (force = false) => {
      if (updateCheckInFlightRef.current) return;
      updateCheckInFlightRef.current = true;
      try {
        const now = Date.now();
        if (!force) {
          const lastCheckedAt = Number((await AsyncStorage.getItem(APP_UPDATE_LAST_CHECKED_KEY)) || 0);
          if (lastCheckedAt && now - lastCheckedAt < UPDATE_CHECK_MIN_INTERVAL_MS) return;
        }

        const info = await checkForAppUpdate();
        await AsyncStorage.setItem(APP_UPDATE_LAST_CHECKED_KEY, String(now));
        if (!info.ok || !info.hasUpdate || !info.latestVersion || !info.downloadUrl) return;

        const skippedVersion = String((await AsyncStorage.getItem(APP_UPDATE_SKIPPED_VERSION_KEY)) || "");
        if (!info.force && skippedVersion && skippedVersion === info.latestVersion) return;

        setUpdateInfo(info);
        setShowUpdateModal(true);
      } finally {
        updateCheckInFlightRef.current = false;
      }
    };

    void checkForUpdateNow(true);

    const timer = setInterval(() => {
      void checkForUpdateNow(false);
    }, UPDATE_BACKGROUND_RECHECK_MS);

    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const now = Date.now();
      if (now - lastActiveCheckAtRef.current < 15_000) return;
      lastActiveCheckAtRef.current = now;
      void checkForUpdateNow(true);
    });

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [loading]);

  useEffect(() => {
    if (!isAuthenticated) return;
    recordActivity();
  }, [segments, isAuthenticated, recordActivity]);

  useEffect(() => {
    if (!isAuthenticated || Platform.OS !== "web") return;
    const onActivity = () => recordActivity();
    if (typeof window !== "undefined") {
      window.addEventListener("click", onActivity);
      window.addEventListener("keydown", onActivity);
      window.addEventListener("mousemove", onActivity);
      window.addEventListener("touchstart", onActivity);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("click", onActivity);
        window.removeEventListener("keydown", onActivity);
        window.removeEventListener("mousemove", onActivity);
        window.removeEventListener("touchstart", onActivity);
      }
    };
  }, [isAuthenticated, recordActivity]);

  const handleUpdateNow = async () => {
    if (!updateInfo?.downloadUrl) return;
    if (updatingNow) return;
    try {
      const normalizedUrl = normalizeUpdateDownloadUrl(updateInfo.downloadUrl);
      if (Platform.OS !== "android") {
        await Linking.openURL(normalizedUrl);
        return;
      }

      setUpdatingNow(true);
      setUpdateProgressText("Update APK ကို download လုပ်နေပါသည်...");
      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
      if (!baseDir) throw new Error("storage_unavailable");

      const fileUri = `${baseDir}orghub-update-${String(updateInfo.latestVersion || "latest")}.apk`;
      try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch {}
      const downloadResult = await FileSystem.downloadAsync(normalizedUrl, fileUri);
      if (!downloadResult?.uri || (downloadResult.status && downloadResult.status >= 400)) {
        throw new Error(`download_failed_${downloadResult?.status || "unknown"}`);
      }
      const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri, { size: true });
      if (!fileInfo.exists || Number(fileInfo.size || 0) < 5 * 1024 * 1024) {
        throw new Error("downloaded_apk_invalid_or_too_small");
      }

      setUpdateProgressText("Install prompt ကိုဖွင့်နေပါသည်...");
      const contentUri = await FileSystem.getContentUriAsync(downloadResult.uri);
      let installStarted = false;
      try {
        await IntentLauncher.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
          data: contentUri,
          type: "application/vnd.android.package-archive",
          flags: 1 | 2 | 268435456,
          extra: {
            "android.intent.extra.NOT_UNKNOWN_SOURCE": true,
            "android.intent.extra.RETURN_RESULT": false,
          },
        } as any);
        installStarted = true;
      } catch {
        try {
          await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
            data: contentUri,
            type: "application/vnd.android.package-archive",
            flags: 1 | 2 | 268435456,
          });
          installStarted = true;
        } catch {}
      }
      if (!installStarted) {
        throw new Error("install_intent_failed");
      }
      setShowUpdateModal(false);
    } catch (error: any) {
      Alert.alert(
        "Update မလုပ်နိုင်သေးပါ",
        "Auto install မဖြစ်သေးပါ။ Download link ကို browser ဖြင့်ဖွင့်ပေးပါမည်။"
      );
      try {
        await Linking.openURL(normalizeUpdateDownloadUrl(updateInfo.downloadUrl));
      } catch {}
      console.log("update_now_error", String(error?.message || error));
    } finally {
      setUpdatingNow(false);
      setUpdateProgressText("");
    }
  };

  const handleUpdateLater = () => {
    setShowUpdateModal(false);
  };

  const handleSkipThisVersion = async () => {
    if (updateInfo?.latestVersion) {
      await AsyncStorage.setItem(APP_UPDATE_SKIPPED_VERSION_KEY, updateInfo.latestVersion);
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
        <Stack.Screen name="member-payment-requests" options={{ headerShown: false }} />
        <Stack.Screen name="members" options={{ headerShown: false }} />
        <Stack.Screen name="events" options={{ headerShown: false }} />
        <Stack.Screen name="messages" options={{ headerShown: false }} />
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
            {updatingNow ? (
              <View style={styles.updateProgressRow}>
                <ActivityIndicator size="small" color={Colors.light.tint} />
                <Text style={styles.updateProgressText}>{updateProgressText || "Updating..."}</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              {!updateInfo?.force && !updatingNow && (
                <Pressable style={styles.btnGhost} onPress={() => void handleSkipThisVersion()}>
                  <Text style={styles.btnGhostText}>Skip</Text>
                </Pressable>
              )}
              {!updateInfo?.force && !updatingNow && (
                <Pressable style={styles.btnGhost} onPress={handleUpdateLater}>
                  <Text style={styles.btnGhostText}>Later</Text>
                </Pressable>
              )}
              <Pressable style={[styles.btnPrimary, updatingNow && { opacity: 0.7 }]} disabled={updatingNow} onPress={() => void handleUpdateNow()}>
                <Text style={styles.btnPrimaryText}>{updatingNow ? "Updating..." : "Update Now"}</Text>
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
  updateProgressRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  updateProgressText: {
    color: Colors.light.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
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

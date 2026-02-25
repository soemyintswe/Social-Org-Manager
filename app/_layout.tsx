import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from "react";
import * as Application from "expo-application";
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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import FloatingTabMenu from "@/components/FloatingTabMenu";
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
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_GRANT_WRITE_URI_PERMISSION = 2;
const FLAG_ACTIVITY_NEW_TASK = 268435456;

function buildUpdateDownloadUrlCandidates(rawUrl: string): string[] {
  const text = String(rawUrl || "").trim();
  if (!text) return [];
  try {
    const u = new URL(text);
    const host = u.hostname.toLowerCase();
    const candidates: string[] = [];

    if (host === "github.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 5) {
        const owner = parts[0];
        const repo = parts[1];
        const blobIdx = parts.indexOf("blob");
        const rawIdx = parts.indexOf("raw");
        if (blobIdx === 2 || rawIdx === 2) {
          const branch = parts[3];
          const filePath = parts.slice(4).join("/");
          candidates.push(`https://media.githubusercontent.com/media/${owner}/${repo}/${branch}/${filePath}`);
          candidates.push(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`);
        }
      }
      if (u.searchParams.get("raw") !== "1") u.searchParams.set("raw", "1");
      candidates.push(u.toString());
    } else if (host === "raw.githubusercontent.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 4) {
        const owner = parts[0];
        const repo = parts[1];
        const branch = parts[2];
        const filePath = parts.slice(3).join("/");
        candidates.push(`https://media.githubusercontent.com/media/${owner}/${repo}/${branch}/${filePath}`);
      }
      candidates.push(u.toString());
    } else {
      candidates.push(u.toString());
    }

    return Array.from(new Set(candidates.filter(Boolean)));
  } catch {
    return [text];
  }
}

function isLikelyGitLfsPointer(content: string): boolean {
  const text = String(content || "").trim();
  return text.startsWith("version https://git-lfs.github.com/spec/v1") && text.includes("oid sha256:");
}

async function openUnknownSourcesSettings(): Promise<boolean> {
  const appId = String((Application as any).applicationId || "").trim();
  if (!appId) return false;
  try {
    await IntentLauncher.startActivityAsync("android.settings.MANAGE_UNKNOWN_APP_SOURCES", {
      data: `package:${appId}`,
      flags: FLAG_ACTIVITY_NEW_TASK,
    });
    return true;
  } catch {
    return false;
  }
}

async function tryOpenInstaller(contentUri: string, fileUri: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    await IntentLauncher.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
      data: contentUri,
      type: "application/vnd.android.package-archive",
      flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_GRANT_WRITE_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
      extra: {
        "android.intent.extra.NOT_UNKNOWN_SOURCE": true,
        "android.intent.extra.RETURN_RESULT": false,
      },
    } as any);
    return { ok: true };
  } catch (e: any) {
    const firstReason = String(e?.message || "install_package_failed");
    try {
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        type: "application/vnd.android.package-archive",
        flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_GRANT_WRITE_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
      } as any);
      return { ok: true };
    } catch (e2: any) {
      const secondReason = String(e2?.message || "view_content_uri_failed");
      try {
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: fileUri,
          type: "application/vnd.android.package-archive",
          flags: FLAG_ACTIVITY_NEW_TASK,
        } as any);
        return { ok: true };
      } catch (e3: any) {
        const thirdReason = String(e3?.message || "view_file_uri_failed");
        try {
          await Linking.openURL(contentUri);
          return { ok: true };
        } catch (e4: any) {
          const fourthReason = String(e4?.message || "linking_open_failed");
          return { ok: false, reason: `${firstReason} | ${secondReason} | ${thirdReason} | ${fourthReason}` };
        }
      }
    }
  }
}

function RootLayoutNav() {
  const { isAuthenticated, loading, recordActivity, currentUser, currentMember } = useAuth();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const router = useRouter();
  const inLogin = (segments[0] as string) === "sign-in";
  const topIdentityName = String(currentMember?.name || currentUser?.displayName || "").trim();
  const topIdentityMemberId = String(currentMember?.id || currentUser?.memberId || "").trim();
  const topIdentityText = topIdentityName && topIdentityMemberId
    ? `${topIdentityName} (${topIdentityMemberId})`
    : (topIdentityName || topIdentityMemberId);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updatingNow, setUpdatingNow] = useState(false);
  const [updateProgressText, setUpdateProgressText] = useState("");
  const [updateProgressRatio, setUpdateProgressRatio] = useState<number>(0);
  const updateCheckInFlightRef = useRef(false);
  const lastActiveCheckAtRef = useRef(0);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated && !inLogin) {
      router.replace("/sign-in" as any);
      return;
    }
    if (isAuthenticated && inLogin) {
      router.replace("/" as any);
    }
  }, [isAuthenticated, loading, inLogin, router]);

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
      const candidateUrls = buildUpdateDownloadUrlCandidates(updateInfo.downloadUrl);
      if (Platform.OS !== "android") {
        if (candidateUrls[0]) await Linking.openURL(candidateUrls[0]);
        return;
      }

      setUpdatingNow(true);
      setUpdateProgressText("Update APK ကို download လုပ်နေပါသည်...");
      setUpdateProgressRatio(0);
      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
      if (!baseDir) throw new Error("storage_unavailable");

      const fileUri = `${baseDir}orghub-update-${String(updateInfo.latestVersion || "latest")}-${Date.now()}.apk`;
      let downloadedUri = "";
      let usedCandidate = "";
      let lastDownloadError = "";
      for (const candidateUrl of candidateUrls) {
        try {
          setUpdateProgressRatio(0);
          try {
            await FileSystem.deleteAsync(fileUri, { idempotent: true });
          } catch {}

          const downloadResumable = FileSystem.createDownloadResumable(
            candidateUrl,
            fileUri,
            {},
            (progress: any) => {
              const written = Number(progress?.totalBytesWritten || 0);
              const total = Number(progress?.totalBytesExpectedToWrite || 0);
              if (total > 0) {
                const ratio = Math.max(0, Math.min(1, written / total));
                setUpdateProgressRatio(ratio);
                setUpdateProgressText(
                  `Update APK ကို download လုပ်နေပါသည်... ${(written / (1024 * 1024)).toFixed(1)}MB / ${(total / (1024 * 1024)).toFixed(1)}MB`
                );
              } else {
                setUpdateProgressText(
                  `Update APK ကို download လုပ်နေပါသည်... ${(written / (1024 * 1024)).toFixed(1)}MB`
                );
              }
            }
          );
          const downloadResult = await downloadResumable.downloadAsync();
          if (!downloadResult?.uri || (downloadResult.status && downloadResult.status >= 400)) {
            lastDownloadError = `download_failed_${downloadResult?.status || "unknown"}`;
            continue;
          }

          const fileInfo: any = await FileSystem.getInfoAsync(downloadResult.uri);
          const size = Number(fileInfo?.size || 0);
          if (!fileInfo.exists || size <= 0) {
            lastDownloadError = "downloaded_file_missing";
            continue;
          }

          // GitHub LFS pointer file (text) ကိုမှတ်မိလျှင် နောက် candidate ကို try လုပ်ပါ။
          if (size < 1024 * 1024) {
            const maybeText = await FileSystem.readAsStringAsync(downloadResult.uri);
            if (isLikelyGitLfsPointer(maybeText)) {
              lastDownloadError = "downloaded_lfs_pointer_instead_of_apk";
              continue;
            }
          }

          if (size < 5 * 1024 * 1024) {
            lastDownloadError = "downloaded_apk_invalid_or_too_small";
            continue;
          }

          downloadedUri = downloadResult.uri;
          usedCandidate = candidateUrl;
          setUpdateProgressRatio(1);
          break;
        } catch (err: any) {
          lastDownloadError = String(err?.message || "download_candidate_failed");
        }
      }
      if (!downloadedUri) throw new Error(lastDownloadError || "download_failed_all_candidates");

      setUpdateProgressText("Install prompt ကိုဖွင့်နေပါသည်...");
      const contentUri = await FileSystem.getContentUriAsync(downloadedUri);
      const installResult = await tryOpenInstaller(contentUri, downloadedUri);
      if (!installResult.ok) {
        throw new Error(`install_intent_failed:${installResult.reason || "unknown"}`);
      }
      console.log("update_now_download_url_used", usedCandidate);
      setShowUpdateModal(false);
    } catch (error: any) {
      const errText = String(error?.message || error || "");
      const openedSettings = await openUnknownSourcesSettings();
      Alert.alert(
        "Update မလုပ်နိုင်သေးပါ",
        openedSettings
          ? "Install permission (Unknown sources) ကို Allow လုပ်ပြီး ပြန် Update လုပ်ပေးပါ။"
          : "Auto install မဖြစ်သေးပါ။ Download link ကို browser ဖြင့်ဖွင့်ပေးပါမည်။"
      );
      try {
        const fallbackUrls = buildUpdateDownloadUrlCandidates(updateInfo.downloadUrl);
        if (fallbackUrls[0]) await Linking.openURL(fallbackUrls[0]);
      } catch {}
      console.log("update_now_error", errText);
    } finally {
      setUpdatingNow(false);
      setUpdateProgressText("");
      setUpdateProgressRatio(0);
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
      <View style={styles.rootShell}>
        {isAuthenticated && !inLogin ? (
          <View style={[styles.topIdentityBar, { paddingTop: insets.top + 4 }]}>
            <View style={styles.topIdentityRow}>
              <Pressable
                style={styles.topIdentityIconBtn}
                onPress={() => router.replace("/" as any)}
                accessibilityRole="button"
                accessibilityLabel="Home"
              >
                <Ionicons name="home" size={19} color="#fff" />
              </Pressable>

              <Text style={styles.topIdentityText} numberOfLines={1}>
                {topIdentityText || "အသုံးပြုသူ"}
              </Text>

              <FloatingTabMenu mode="topbar" containerStyle={styles.topIdentityMenuWrap} />
            </View>
          </View>
        ) : null}

        <View style={styles.stackHost}>
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
        </View>
      </View>

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
              <>
                <View style={styles.updateProgressRow}>
                  <ActivityIndicator size="small" color={Colors.light.tint} />
                  <Text style={styles.updateProgressText}>{updateProgressText || "Updating..."}</Text>
                </View>
                <View style={styles.updateProgressTrack}>
                  <View
                    style={[
                      styles.updateProgressFill,
                      { width: `${Math.max(4, Math.round(updateProgressRatio * 100))}%` },
                    ]}
                  />
                </View>
                <Text style={styles.updateProgressPercent}>{Math.round(updateProgressRatio * 100)}%</Text>
              </>
            ) : null}

            <View style={styles.modalActions}>
              {updatingNow && (
                <Pressable style={styles.btnGhost} onPress={handleUpdateLater}>
                  <Text style={styles.btnGhostText}>Hide</Text>
                </Pressable>
              )}
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
  rootShell: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  stackHost: {
    flex: 1,
  },
  topIdentityBar: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    backgroundColor: "#ECFEFF",
    borderBottomWidth: 1,
    borderBottomColor: "#BAE6FD",
  },
  topIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topIdentityIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  topIdentityMenuWrap: {
    width: 36,
  },
  topIdentityText: {
    fontSize: 13,
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    textAlign: "center",
  },
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
  updateProgressTrack: {
    marginTop: 8,
    width: "100%",
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
  },
  updateProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: Colors.light.tint,
  },
  updateProgressPercent: {
    marginTop: 4,
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
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

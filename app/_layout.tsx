import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  ActivityIndicator,
  Alert,
  AppState,
  InteractionManager,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import orgStorage, { persistOrgStorageContext, restoreOrgStorageContext } from "../lib/org-storage";
import { ErrorBoundary } from "../components/ErrorBoundary";
import FloatingTabMenu from "../components/FloatingTabMenu";
import { getAppVariant, isCentralAdminVariant, isOrgClientVariant } from "../lib/app-variant";
import { queryClient } from "../lib/query-client";
import { DataProvider } from "../lib/DataContext";
import { AuthProvider, useAuth } from "../lib/AuthContext";
import Colors from "../constants/colors";
import { checkForAppUpdate, getCurrentAppVersion, getCurrentBuildNumber, type AppUpdateInfo } from "../lib/app-update";
import { initializeRemoteConfig, prewarmOrgScopedRemoteConfig, setActiveOrgId } from "../lib/remote-config";
import { verifyDeviceAuthorization } from "../lib/device-authorization";
import { ensureOrgLicenseActive, hydrateRegistryManagedConfig } from "../lib/org-registry";
import {
  checkCloudSyncHealth,
  checkLanSyncHealth,
  getAccountSettings,
  getMembers,
  getEffectiveSyncRuntimeConfig,
  pullCloudSnapshotToLocalDetailed,
  pullLanSnapshotToLocalDetailed,
  pushCloudSnapshotFromLocalDetailed,
  pushLanSnapshotFromLocalDetailed,
  saveAccountSettings,
} from "../lib/storage-service";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

const AsyncStorage = orgStorage;

SplashScreen.preventAutoHideAsync();

const APP_UPDATE_LAST_CHECKED_KEY = "@app_update_last_checked_at";
const APP_UPDATE_SKIPPED_VERSION_KEY = "@app_update_skipped_version";
const APP_UPDATE_RESUME_STATE_KEY = "@app_update_download_state";
const GLOBAL_UPDATE_TRIGGER_FN = "__orghub_trigger_app_update_now";
const UPDATE_CHECK_MIN_INTERVAL_MS = 5 * 60 * 1000;
const UPDATE_BACKGROUND_RECHECK_MS = 10 * 60 * 1000;
const UPDATE_INITIAL_CHECK_DELAY_MS = 4500;
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_GRANT_WRITE_URI_PERMISSION = 2;
const FLAG_ACTIVITY_NEW_TASK = 268435456;

function logTaskError(label: string, error: unknown): void {
  const reason = String((error as any)?.message || error || "unknown");
  console.log(`Error running ${label} task:`, reason);
}

function scheduleDeferredTask(input: {
  label: string;
  delayMs: number;
  run: () => Promise<void> | void;
}): () => void {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let interactionTask: { cancel?: () => void } | null = null;

  interactionTask = InteractionManager.runAfterInteractions(() => {
    timer = setTimeout(() => {
      if (disposed) return;
      Promise.resolve(input.run()).catch((error) => {
        if (!disposed) logTaskError(input.label, error);
      });
    }, Math.max(0, Number(input.delayMs) || 0));
  });

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    if (interactionTask?.cancel) interactionTask.cancel();
  };
}

function getUpdateSkipToken(info: Pick<AppUpdateInfo, "latestVersion" | "latestBuildNumber" | "publishedAt">): string {
  const version = String(info.latestVersion || "").trim();
  const build = String(info.latestBuildNumber || "").trim();
  const publishedAt = String(info.publishedAt || "").trim();
  return `${version}|${build}|${publishedAt}`;
}

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

type UpdateResumeState = {
  url: string;
  fileUri: string;
  resumeData: string;
  latestVersion: string;
  latestBuildNumber?: string;
  updatedAt: string;
};

async function loadUpdateResumeState(): Promise<UpdateResumeState | null> {
  try {
    const raw = await AsyncStorage.getItem(APP_UPDATE_RESUME_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.url || !parsed?.fileUri || !parsed?.resumeData || !parsed?.latestVersion) return null;
    return parsed as UpdateResumeState;
  } catch {
    return null;
  }
}

async function saveUpdateResumeState(state: UpdateResumeState): Promise<void> {
  try {
    await AsyncStorage.setItem(APP_UPDATE_RESUME_STATE_KEY, JSON.stringify(state));
  } catch {}
}

async function clearUpdateResumeState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(APP_UPDATE_RESUME_STATE_KEY);
  } catch {}
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
  const appVariant = getAppVariant();
  const orgClientVariant = isOrgClientVariant();
  const centralAdminVariant = isCentralAdminVariant();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const router = useRouter();
  const rootSegment = String(segments[0] || "");
  const childSegment = String(segments[1] || "");
  const webPathname =
    Platform.OS === "web" && typeof window !== "undefined"
      ? String(window.location.pathname || "").trim().toLowerCase()
      : "";
  const webSystemPath =
    !!webPathname &&
    (webPathname === "/system" || webPathname === "/system/" || webPathname.endsWith("/system") || webPathname.endsWith("/system/"));
  const webAdminLoginPath =
    !!webPathname &&
    (webPathname === "/admin-sign-in" ||
      webPathname === "/admin-sign-in/" ||
      webPathname.endsWith("/admin-sign-in") ||
      webPathname.endsWith("/admin-sign-in/"));
  const webAdminUsersPath =
    !!webPathname &&
    (webPathname === "/admin-users" ||
      webPathname === "/admin-users/" ||
      webPathname.endsWith("/admin-users") ||
      webPathname.endsWith("/admin-users/"));
  const routeReady = Boolean(rootSegment) || webSystemPath || webAdminLoginPath || webAdminUsersPath;
  const inLogin = rootSegment === "sign-in";
  const inAdminLogin = rootSegment === "admin-sign-in";
  const inAdminUsersRoute = rootSegment === "admin-users";
  const inAnyLogin = inLogin || inAdminLogin;
  const inOrgIdRoute = rootSegment === "[orgId]";
  const inOrgConnect = rootSegment === "org-connect";
  const inSystemRoute = (rootSegment === "(tabs)" && childSegment === "system") || rootSegment === "system";
  const isAdminEntryRoute =
    inAdminLogin || inAdminUsersRoute || inSystemRoute || webSystemPath || webAdminLoginPath || webAdminUsersPath;
  const isSystemAdmin = currentUser?.systemRole === "admin";
  const isLocalhost =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
  const isDesktopElectronWeb =
    Platform.OS === "web" &&
    typeof navigator !== "undefined" &&
    /electron/i.test(String(navigator.userAgent || ""));
  const allowOrgConnect =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    (new URLSearchParams(window.location.search || "").get("orgConnect") === "1" ||
      (() => {
        try {
          return (
            window.sessionStorage?.getItem("@orghub_org_connect_override") === "1" ||
            window.localStorage?.getItem("@orghub_org_connect_override") === "1"
          );
        } catch {
          return false;
        }
      })());
  const canViewOrgConnect = isSystemAdmin || allowOrgConnect;
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
  const [deviceAuthChecked, setDeviceAuthChecked] = useState(false);
  const [deviceAuthorized, setDeviceAuthorized] = useState(true);
  const [deviceAuthReason, setDeviceAuthReason] = useState("");
  const [deviceAuthHash, setDeviceAuthHash] = useState("");
  const [licenseChecked, setLicenseChecked] = useState(false);
  const [licenseAllowed, setLicenseAllowed] = useState(true);
  const [licenseReason, setLicenseReason] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [licenseStatus, setLicenseStatus] = useState("");
  const shouldShowLicenseModal =
    isAuthenticated &&
    licenseChecked &&
    !licenseAllowed &&
    !inAnyLogin &&
    !inAdminLogin &&
    !isSystemAdmin;
  const [orgSetupRequired, setOrgSetupRequired] = useState<boolean | null>(null);
  const updateCheckInFlightRef = useRef(false);
  const lastActiveCheckAtRef = useRef(0);
  const updateDownloadRef = useRef<FileSystem.DownloadResumable | null>(null);
  const updateDownloadUrlRef = useRef("");
  const updateDownloadFileRef = useRef("");
  const autoSyncRunningRef = useRef(false);
  const lastAutoSyncAtRef = useRef(0);

  useEffect(() => {
    let active = true;
    const loadOrgSetup = async () => {
      try {
        let settings = await getAccountSettings();
        const desktopOrgBound =
          Platform.OS === "web" &&
          typeof window !== "undefined" &&
          (() => {
            try {
              return (
                window.sessionStorage?.getItem("@orghub_desktop_org_bound_v1") === "1" ||
                window.localStorage?.getItem("@orghub_desktop_org_bound_v1") === "1"
              );
            } catch {
              return false;
            }
          })();
        const requiresDesktopRebind = isDesktopElectronWeb && orgClientVariant && !desktopOrgBound;
        if (!String(settings.orgId || "").trim()) {
          let hintedOrgId = "";
          try {
            const restored = await restoreOrgStorageContext();
            hintedOrgId = String(restored?.orgId || "").trim().toUpperCase();
          } catch {}
          if (!hintedOrgId && Platform.OS === "web" && typeof window !== "undefined") {
            try {
              hintedOrgId = String(
                window.sessionStorage?.getItem("@orghub_active_org_id") ||
                window.sessionStorage?.getItem("@orghub_last_connected_org_id") ||
                window.localStorage?.getItem("@orghub_active_org_id") ||
                window.localStorage?.getItem("@orghub_last_connected_org_id") ||
                ""
              )
                .trim()
                .toUpperCase();
            } catch {}
          }

          if (hintedOrgId) {
            const nextSettings = {
              ...settings,
              orgId: hintedOrgId,
              orgSetupAt: settings.orgSetupAt || new Date().toISOString(),
              orgSetupCompleted: true,
            };
            await saveAccountSettings(nextSettings);
            settings = nextSettings;
            if (requiresDesktopRebind && Platform.OS === "web" && typeof window !== "undefined") {
              try {
                window.sessionStorage?.setItem("@orghub_desktop_org_bound_v1", "1");
                window.localStorage?.setItem("@orghub_desktop_org_bound_v1", "1");
              } catch {}
            }
          } else {
            const legacyMembers = await getMembers().catch(() => [] as any[]);
            if (Array.isArray(legacyMembers) && legacyMembers.length > 0) {
              const legacyOrgId = "ORG000";
              const nextSettings = {
                ...settings,
                orgId: legacyOrgId,
                orgName: settings.orgName || "My Organization",
                orgSetupAt: settings.orgSetupAt || new Date().toISOString(),
                orgSetupCompleted: true,
              };
              await saveAccountSettings(nextSettings);
              settings = nextSettings;
            }
          }
        }
        const resolvedOrgId = String(settings.orgId || "").trim().toUpperCase();
        if (resolvedOrgId === "ORG000") {
          try {
            await orgStorage.removeItem("@orghub_login_guard");
          } catch {}
        }
        const orgId = resolvedOrgId;
        const hasOrgId = Boolean(orgId);
        // Org ID exists means setup is complete for current route gating.
        // Contact fields can be completed later in Account Settings.
        if (!active) return;
        setOrgSetupRequired(!hasOrgId);
      } catch {
        if (!active) return;
        setOrgSetupRequired(true);
      }
    };
    void loadOrgSetup();
    return () => {
      active = false;
    };
  }, [inOrgConnect, isAuthenticated, isDesktopElectronWeb, orgClientVariant]);

  useEffect(() => {
    if (loading) return;
    if (orgSetupRequired === null) return;
    if (!routeReady) return;
    if (orgClientVariant && isAdminEntryRoute) {
      if (isAuthenticated && !inAnyLogin) {
        router.replace("/" as any);
      } else if (!inLogin) {
        router.replace("/sign-in" as any);
      }
      return;
    }
    if (centralAdminVariant && !isAdminEntryRoute) {
      router.replace(isAuthenticated && isSystemAdmin ? ("/system" as any) : ("/admin-sign-in" as any));
      return;
    }

    if (orgSetupRequired) {
      if (!isAdminEntryRoute && !isSystemAdmin && !isLocalhost && !inOrgIdRoute) {
        if (!inOrgConnect) {
          router.replace("/org-connect" as any);
        }
        return;
      }
    }

    if (!isAuthenticated && !inAnyLogin && !inOrgIdRoute && !inOrgConnect) {
      if (isAdminEntryRoute) {
        router.replace("/admin-sign-in" as any);
      } else {
        router.replace("/sign-in" as any);
      }
      return;
    }
    if (isAuthenticated && (inAnyLogin || inOrgIdRoute)) {
      if (allowOrgConnect) return;
      router.replace(isSystemAdmin ? ("/system" as any) : ("/" as any));
    }
  }, [isAuthenticated, isLocalhost, isSystemAdmin, isAdminEntryRoute, loading, inAnyLogin, inOrgIdRoute, inOrgConnect, orgSetupRequired, router, allowOrgConnect, routeReady, orgClientVariant, centralAdminVariant, inLogin]);

  useEffect(() => {
    if (loading || !isAuthenticated || !isSystemAdmin || inAnyLogin) return;
    if (centralAdminVariant) return;
    const isAdminHome = rootSegment === "(tabs)" && (!childSegment || childSegment === "index");
    const isAdminSystem = rootSegment === "(tabs)" && childSegment === "system";
    const isAdminUsers = rootSegment === "admin-users";
    const isAdminAccountSettings = rootSegment === "account-settings";
    const isAdminDataManagement = rootSegment === "data-management";
    const isAdminPhoneTransfer = rootSegment === "phone-transfer";
    const isAdminMemberDataManagement = rootSegment === "member-data-management";
    const isAdminImportMembers = rootSegment === "import-members";
    if (
      isAdminHome ||
      isAdminSystem ||
      isAdminUsers ||
      isAdminAccountSettings ||
      isAdminDataManagement ||
      isAdminPhoneTransfer ||
      isAdminMemberDataManagement ||
      isAdminImportMembers
    ) return;
    if (inOrgConnect && canViewOrgConnect) return;
    router.replace("/" as any);
  }, [rootSegment, childSegment, loading, isAuthenticated, isSystemAdmin, inAnyLogin, router, inOrgConnect, canViewOrgConnect, centralAdminVariant]);

  useEffect(() => {
    if (loading || Platform.OS === "web") return;
    let disposed = false;
    let intervalTimer: ReturnType<typeof setInterval> | null = null;
    let initialTimer: ReturnType<typeof setTimeout> | null = null;
    let interactionTask: { cancel?: () => void } | null = null;

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

        const skippedToken = String((await AsyncStorage.getItem(APP_UPDATE_SKIPPED_VERSION_KEY)) || "");
        if (!info.force && skippedToken && skippedToken === getUpdateSkipToken(info)) return;

        setUpdateInfo(info);
        setShowUpdateModal(true);
      } catch (error) {
        logTaskError("app update check", error);
      } finally {
        updateCheckInFlightRef.current = false;
      }
    };
    const startBackgroundRecheck = () => {
      if (intervalTimer) return;
      intervalTimer = setInterval(() => {
        void checkForUpdateNow(false);
      }, UPDATE_BACKGROUND_RECHECK_MS);
    };
    interactionTask = InteractionManager.runAfterInteractions(() => {
      initialTimer = setTimeout(() => {
        if (disposed) return;
        void checkForUpdateNow(true);
        startBackgroundRecheck();
      }, UPDATE_INITIAL_CHECK_DELAY_MS);
    });

    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const now = Date.now();
      if (now - lastActiveCheckAtRef.current < 15_000) return;
      lastActiveCheckAtRef.current = now;
      void checkForUpdateNow(true);
    });

    
    return () => {
      disposed = true;
      if (initialTimer) clearTimeout(initialTimer);
      if (intervalTimer) clearInterval(intervalTimer);
      if (interactionTask?.cancel) interactionTask.cancel();
      sub.remove();
    };
  }, [loading]);

  const runAutoSync = async () => {
    if (Platform.OS === "web") return;
    if (isSystemAdmin) return;
    if (licenseChecked && !licenseAllowed) return;
    if (autoSyncRunningRef.current) return;
    const now = Date.now();
    if (now - lastAutoSyncAtRef.current < 30_000) return;
    autoSyncRunningRef.current = true;
    try {
      const runtimeConfig = await getEffectiveSyncRuntimeConfig();
      const lanEnabled = runtimeConfig.lan.enabled;
      const cloudEnabled = runtimeConfig.cloud.enabled;

      if (lanEnabled) {
        const lanHealth = await checkLanSyncHealth();
        if (lanHealth.ok) {
          await pullLanSnapshotToLocalDetailed();
          await pushLanSnapshotFromLocalDetailed();
        }
      }
      if (cloudEnabled) {
        const cloudHealth = await checkCloudSyncHealth();
        if (cloudHealth.ok) {
          await pullCloudSnapshotToLocalDetailed();
          await pushCloudSnapshotFromLocalDetailed();
        }
      }
    } catch (error) {
      logTaskError("auto sync", error);
    } finally {
      autoSyncRunningRef.current = false;
      lastAutoSyncAtRef.current = Date.now();
    }
  };

  useEffect(() => {
    if (loading || orgSetupRequired !== false || !isAuthenticated || inLogin || isSystemAdmin) return;
    return scheduleDeferredTask({
      label: "auto sync",
      delayMs: 2500,
      run: runAutoSync,
    });
  }, [loading, orgSetupRequired, isAuthenticated, inLogin, isSystemAdmin]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (!showUpdateModal || updatingNow || !updateInfo?.downloadUrl) return;
        void loadUpdateResumeState().then((resume) => {
          if (!resume) return;
          if (String(resume.latestVersion || "") !== String(updateInfo?.latestVersion || "")) return;
          void handleUpdateNow();
        });
        return;
      }
      if (state !== "background" && state !== "inactive") return;
      if (!updatingNow) return;
      const download = updateDownloadRef.current;
      if (!download) return;
      const url = updateDownloadUrlRef.current;
      const fileUri = updateDownloadFileRef.current;
      if (!url || !fileUri) return;
      void download
        .pauseAsync()
        .then((resumeData: any) => {
          if (!resumeData || !updateInfo?.latestVersion) return;
          return saveUpdateResumeState({
            url,
            fileUri,
            resumeData,
            latestVersion: String(updateInfo.latestVersion || ""),
            latestBuildNumber: String(updateInfo.latestBuildNumber || ""),
            updatedAt: new Date().toISOString(),
          });
        })
        .catch(() => {});
    });
    return () => {
      sub.remove();
    };
  }, [updatingNow, updateInfo, showUpdateModal]);

  useEffect(() => {
    const initRemoteConfig = async () => {
      const result = await initializeRemoteConfig(__DEV__ ? 0 : 3600000);
      if (!result.ok) {
        if (Platform.OS !== "web") {
          console.log("Firebase Remote Config initialization failed", result.reason || "unknown");
        }
        return;
      }
      console.log(result.fetched ? "Firebase Remote Config fetched and activated" : "Firebase Remote Config already activated");
    };
    const cleanup = scheduleDeferredTask({
      label: "remote config",
      delayMs: 3000,
      run: initRemoteConfig,
    });
    return cleanup;
  }, []);

  useEffect(() => {
    let disposed = false;
    const runDeviceAuthorizationCheck = async () => {
      const result = await verifyDeviceAuthorization();
      if (disposed) return;
      setDeviceAuthChecked(true);
      setDeviceAuthorized(result.authorized);
      setDeviceAuthReason(String(result.reason || ""));
      setDeviceAuthHash(String(result.deviceHash || ""));
    };
    const cleanup = scheduleDeferredTask({
      label: "device authorization",
      delayMs: 6000,
      run: runDeviceAuthorizationCheck,
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const shouldRunLicenseCheck =
      orgSetupRequired === false &&
      isAuthenticated &&
      !isSystemAdmin;
    if (!shouldRunLicenseCheck) {
      setLicenseChecked(false);
      setLicenseAllowed(true);
      setLicenseReason("");
      setLicenseExpiry("");
      setLicenseStatus("");
    }
    const runLicenseCheck = async (force = false) => {
      try {
        if (!shouldRunLicenseCheck) return;
        const settings = await getAccountSettings();
        const orgId = String(settings?.orgId || "").trim();
        if (!orgId) {
          setLicenseChecked(true);
          setLicenseAllowed(true);
          return;
        }
        const result = await ensureOrgLicenseActive({ orgId, forceOnlineCheck: force });
        if (disposed) return;
        setLicenseChecked(true);
        setLicenseAllowed(result.allowed);
        setLicenseReason(String(result.reason || ""));
        setLicenseExpiry(String(result.expiryDate || ""));
        setLicenseStatus(String(result.status || ""));
      } catch {
        if (!disposed) {
          setLicenseChecked(true);
        }
      }
    };
    const cleanup = scheduleDeferredTask({
      label: "license check",
      delayMs: 4500,
      run: () => runLicenseCheck(false),
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void runLicenseCheck(true);
      }
    });
    return () => {
      disposed = true;
      cleanup();
      sub.remove();
    };
  }, [orgSetupRequired, isAuthenticated, isSystemAdmin]);

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

  const handleUpdateNow = useCallback(async (overrideInfo?: AppUpdateInfo | null) => {
    const targetInfo = overrideInfo || updateInfo;
    if (!targetInfo?.downloadUrl) return;
    if (updatingNow) return;
    let downloadedUriForFallback = "";
    try {
      const candidateUrls = buildUpdateDownloadUrlCandidates(targetInfo.downloadUrl);
      if (Platform.OS !== "android") {
        if (candidateUrls[0]) await Linking.openURL(candidateUrls[0]);
        return;
      }

      setUpdatingNow(true);
      setUpdateProgressText("Update APK ကို download လုပ်နေပါသည်...");
      setUpdateProgressRatio(0);
      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
      if (!baseDir) throw new Error("storage_unavailable");

      const fileUri = `${baseDir}orghub-update-${String(targetInfo.latestVersion || "latest")}-${Date.now()}.apk`;
      const resumeState = await loadUpdateResumeState();
      let resumeUrl = "";
      let resumeData = "";
      let resumeFileUri = "";
      if (resumeState && String(resumeState.latestVersion || "") === String(targetInfo.latestVersion || "")) {
        const fileInfo = await FileSystem.getInfoAsync(resumeState.fileUri);
        if (fileInfo?.exists && Number(fileInfo?.size || 0) > 0) {
          resumeUrl = String(resumeState.url || "");
          resumeData = String(resumeState.resumeData || "");
          resumeFileUri = String(resumeState.fileUri || "");
        } else {
          await clearUpdateResumeState();
        }
      }
      const orderedCandidates = resumeUrl
        ? [resumeUrl, ...candidateUrls.filter((item) => item !== resumeUrl)]
        : candidateUrls;
      let downloadedUri = "";
      let usedCandidate = "";
      let lastDownloadError = "";
      for (const candidateUrl of orderedCandidates) {
        try {
          setUpdateProgressRatio(0);
          const useResume = Boolean(resumeData && resumeUrl && candidateUrl === resumeUrl);
          const targetFileUri = useResume ? resumeFileUri : fileUri;
          if (!useResume) {
            try {
              await FileSystem.deleteAsync(targetFileUri, { idempotent: true });
            } catch {}
            await clearUpdateResumeState();
          }

          const downloadResumable = FileSystem.createDownloadResumable(
            candidateUrl,
            targetFileUri,
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
            },
            useResume ? resumeData : undefined
          );
          updateDownloadRef.current = downloadResumable;
          updateDownloadUrlRef.current = candidateUrl;
          updateDownloadFileRef.current = targetFileUri;

          const downloadResult = useResume
            ? await downloadResumable.resumeAsync()
            : await downloadResumable.downloadAsync();
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
          downloadedUriForFallback = downloadedUri;
          usedCandidate = candidateUrl;
          setUpdateProgressRatio(1);
          updateDownloadRef.current = null;
          updateDownloadUrlRef.current = "";
          updateDownloadFileRef.current = "";
          await clearUpdateResumeState();
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
      let manualFallbackText = "";
      if (downloadedUriForFallback) {
        manualFallbackText = `\n\nAPK ဖိုင်လမ်းကြောင်း:\n${downloadedUriForFallback}`;
      }
      Alert.alert(
        "Update မလုပ်နိုင်သေးပါ",
        openedSettings
          ? `Install permission (Unknown sources) ကို Allow လုပ်ပြီး ပြန် Update လုပ်ပေးပါ။${manualFallbackText}`
          : `Auto install မဖြစ်သေးပါ။ Manual Install လုပ်နိုင်ရန် APK link/browser ကိုဖွင့်ပေးပါမည်။${manualFallbackText}`
      );
      try {
        if (downloadedUriForFallback && (await Sharing.isAvailableAsync())) {
          await Sharing.shareAsync(downloadedUriForFallback, {
            mimeType: "application/vnd.android.package-archive",
            dialogTitle: "Downloaded APK ကို Share / Manual Install လုပ်ရန်",
            UTI: "public.data",
          });
        }
      } catch {}
      try {
        const fallbackUrls = buildUpdateDownloadUrlCandidates(targetInfo.downloadUrl);
        if (fallbackUrls[0]) await Linking.openURL(fallbackUrls[0]);
      } catch {}
      console.log("update_now_error", errText);
    } finally {
      setUpdatingNow(false);
      setUpdateProgressText("");
      setUpdateProgressRatio(0);
      updateDownloadRef.current = null;
      updateDownloadUrlRef.current = "";
      updateDownloadFileRef.current = "";
    }
  }, [updateInfo, updatingNow]);

  useEffect(() => {
    const globalAny = globalThis as any;
    const handler = (info?: AppUpdateInfo | null) => {
      const nextInfo = info || updateInfo;
      if (nextInfo) {
        setUpdateInfo(nextInfo);
        setShowUpdateModal(true);
      }
      return handleUpdateNow(nextInfo || null);
    };
    globalAny[GLOBAL_UPDATE_TRIGGER_FN] = handler;
    return () => {
      if (globalAny[GLOBAL_UPDATE_TRIGGER_FN] === handler) {
        delete globalAny[GLOBAL_UPDATE_TRIGGER_FN];
      }
    };
  }, [updateInfo, handleUpdateNow]);

  const handleUpdateLater = () => {
    setShowUpdateModal(false);
  };

  const handleSkipThisVersion = async () => {
    if (updateInfo?.latestVersion) {
      await AsyncStorage.setItem(APP_UPDATE_SKIPPED_VERSION_KEY, getUpdateSkipToken(updateInfo));
    }
    setShowUpdateModal(false);
  };

  if (loading) {
    const loadingText =
      inOrgConnect && allowOrgConnect
        ? "အသင်းအဖွဲ့သစ်ဖြင့် ချိတ်ဆက်နိုင်ရန် ဆောင်ရွက်နေပါသည်။"
        : "လုပ်ဆောင်နေပါတယ် ခေတ္တစောင့်ပါ။";
    return (
      <View style={styles.appLoadingShell}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.appLoadingText}>{loadingText}</Text>
        <View style={styles.appLoadingTrack}>
          <View style={styles.appLoadingFill} />
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={styles.rootShell}>
        {isAuthenticated && !inAnyLogin ? (
          <View style={[styles.topIdentityBar, { paddingTop: insets.top + 4 }]}>
            <View style={styles.topIdentityRow}>
              <Pressable
                style={styles.topIdentityIconBtn}
                onPress={() =>
                  router.replace({ pathname: "/" as any, params: { scrollToTop: Date.now().toString() } } as any)
                }
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
            <Stack.Screen name="org-connect" options={{ headerShown: false }} />
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            <Stack.Screen name="admin-sign-in" options={{ headerShown: false }} />
            <Stack.Screen name="admin-users" options={{ headerShown: false }} />
            <Stack.Screen name="[orgId]" options={{ headerShown: false }} />
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
            <Stack.Screen name="requests" options={{ headerShown: false }} />
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
            <Stack.Screen name="audit-change-requests" options={{ headerShown: false }} />
            <Stack.Screen name="members" options={{ headerShown: false }} />
            <Stack.Screen name="events" options={{ headerShown: false }} />
            <Stack.Screen name="messages" options={{ headerShown: false }} />
            <Stack.Screen name="notifications" options={{ headerShown: false }} />
            <Stack.Screen name="loans" options={{ headerShown: false }} />
            <Stack.Screen name="expense-claims" options={{ headerShown: false }} />
            <Stack.Screen name="monthly-fees" options={{ headerShown: false }} />
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
            <Text style={styles.modalText}>Variant: {appVariant}</Text>
            <Text style={styles.modalText}>Current: {getCurrentAppVersion()} ({getCurrentBuildNumber() || "-"})</Text>
            <Text style={styles.modalText}>Latest: {updateInfo?.latestVersion || "-"} ({updateInfo?.latestBuildNumber || "-"})</Text>
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

      <Modal transparent animationType="fade" visible={deviceAuthChecked && !deviceAuthorized}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Device Authorization Required</Text>
            <Text style={styles.modalText}>
              This device is not authorized to use this app.
            </Text>
            {deviceAuthReason ? (
              <Text style={styles.modalText}>Reason: {deviceAuthReason}</Text>
            ) : null}
            {deviceAuthHash ? (
              <Text style={styles.modalNotes}>Device Hash: {deviceAuthHash}</Text>
            ) : null}
            <Text style={styles.modalNotes}>
              Share the device hash with the app owner to approve this device.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={shouldShowLicenseModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>License Inactive</Text>
            <Text style={styles.modalText}>This organization license is not active.</Text>
            {licenseStatus ? (
              <Text style={styles.modalText}>Status: {licenseStatus}</Text>
            ) : null}
            {licenseExpiry ? (
              <Text style={styles.modalText}>Expiry: {licenseExpiry}</Text>
            ) : null}
            {licenseReason ? (
              <Text style={styles.modalNotes}>Reason: {licenseReason}</Text>
            ) : null}
            <Text style={styles.modalNotes}>
              Please contact the system administrator to renew or re-activate the license.
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

function OrgBootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        let urlOrgId = "";
        let lastConnectedOrgId = "";
        if (Platform.OS === "web" && typeof window !== "undefined") {
          try {
            const params = new URLSearchParams(window.location.search || "");
            const fromQuery = String(params.get("orgId") || "").trim();
            const isOrgConnect = String(params.get("orgConnect") || "").trim() === "1";
            lastConnectedOrgId = String(
              window.sessionStorage?.getItem("@orghub_last_connected_org_id") ||
              window.localStorage?.getItem("@orghub_last_connected_org_id") ||
              ""
            ).trim();
            if (isOrgConnect && fromQuery) {
              urlOrgId = fromQuery;
              try {
                window.sessionStorage?.setItem("@orghub_last_connected_org_id", fromQuery);
                window.localStorage?.setItem("@orghub_last_connected_org_id", fromQuery);
              } catch {}
            }
          } catch {}
        }
        const restored = await restoreOrgStorageContext();
        const settings = await getAccountSettings();
        const fallbackOrgId = String(settings?.orgId || "").trim();
        const fallbackEmail = String(settings?.orgEmail || "").trim();
        const orgId = String(urlOrgId || restored?.orgId || fallbackOrgId || lastConnectedOrgId).trim();
        const orgEmail = String(restored?.orgEmail || fallbackEmail).trim();
        await persistOrgStorageContext({ orgId, orgEmail });
        if (orgId && !fallbackOrgId) {
          await saveAccountSettings({
            ...settings,
            orgId,
            orgEmail: orgEmail || settings.orgEmail,
            orgSetupAt: settings.orgSetupAt || new Date().toISOString(),
            orgSetupCompleted: true,
          });
        }
        setActiveOrgId(orgId || null);
        prewarmOrgScopedRemoteConfig(orgId || null, orgEmail || undefined);
        await hydrateRegistryManagedConfig(orgId || null);
      } catch {
        // No-op: allow app to continue even if org settings are missing.
      } finally {
        if (active) setReady(true);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <View style={styles.appLoadingShell}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.appLoadingText}>Org registry ကိုစစ်ဆေးနေပါတယ်…</Text>
        <View style={styles.appLoadingTrack}>
          <View style={styles.appLoadingFill} />
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const webFontMap =
    Platform.OS === "web"
      ? {
          Inter_400Regular: require("../assets/fonts/Inter_400Regular.ttf"),
          Inter_500Medium: require("../assets/fonts/Inter_500Medium.ttf"),
          Inter_600SemiBold: require("../assets/fonts/Inter_600SemiBold.ttf"),
          Inter_700Bold: require("../assets/fonts/Inter_700Bold.ttf"),
          Ionicons: require("../assets/fonts/Ionicons.ttf"),
          Feather: require("../assets/fonts/Feather.ttf"),
        }
      : {
          Inter_400Regular,
          Inter_500Medium,
          Inter_600SemiBold,
          Inter_700Bold,
          ...Ionicons.font,
          ...Feather.font,
        };

  const [fontsLoaded, fontError] = useFonts(webFontMap);
  const [fontsTimedOut, setFontsTimedOut] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError || fontsTimedOut) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, fontsTimedOut]);

  useEffect(() => {
    const timer = setTimeout(() => setFontsTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  const fontsReady = fontsLoaded || !!fontError || fontsTimedOut;
  if (!fontsReady) {
    return (
      <View style={styles.appLoadingShell}>
        <Text style={styles.appLoadingTitle}>Social Org Manager</Text>
        <Text style={styles.appLoadingText}>Loading… ခေတ္တစောင့်ပေးပါ။</Text>
        <View style={styles.appLoadingTrack}>
          <View style={styles.appLoadingFill} />
        </View>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <OrgBootstrap>
            <DataProvider>
              <AuthProvider>
                <RootLayoutNav />
              </AuthProvider>
            </DataProvider>
          </OrgBootstrap>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  appLoadingShell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 24,
  },
  appLoadingTitle: {
    fontSize: 20,
    color: Colors.light.text,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  appLoadingText: {
    marginTop: 10,
    fontSize: 14,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  appLoadingTrack: {
    marginTop: 12,
    width: 240,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  appLoadingFill: {
    width: "62%",
    height: "100%",
    borderRadius: 999,
    backgroundColor: Colors.light.tint,
  },
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

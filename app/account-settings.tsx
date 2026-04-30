import React, { useCallback, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import QRCode from "react-native-qrcode-svg";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import type { AccountSettings } from "@/lib/types";
import { normalizeOrgPosition } from "@/lib/types";
import {
  checkCloudSyncHealth,
  getEffectiveSyncRuntimeConfig,
  pullCloudSnapshotToLocalDetailed,
  checkLanSyncHealth,
  pullLanSnapshotToLocalDetailed,
  pushCloudSnapshotFromLocalDetailed,
  pushLanSnapshotFromLocalDetailed,
} from "@/lib/storage";
import {
  DEFAULT_CLOUD_SYNC_ENDPOINT,
  DEFAULT_CLOUD_SYNC_FOLDER_NAME,
  DEFAULT_LAN_SYNC_URL,
} from "@/lib/sync-defaults";
import { getManagedSyncLockdownEnabled } from "@/lib/remote-config";
import { checkForAppUpdate, getCurrentAppVersion, getCurrentBuildNumber } from "@/lib/app-update";

const PENDING_LAN_URL_KEY = "@orghub_pending_lan_url";
const LAN_QR_PREFIX = "ORGHUB_LAN:";

const normalizeUrl = (raw: string): string => {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
};

const encodeLanShareId = (url: string): string => {
  const normalized = normalizeUrl(url);
  if (!normalized) return "";
  const stripped = normalized.replace(/^https?:\/\//i, "");
  const encoded = stripped
    .replace(/\./g, "-")
    .replace(/:/g, "_")
    .replace(/\//g, "~");
  return `LAN-${encoded}`;
};

const decodeLanShareId = (input: string): string => {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const cleaned = raw.toUpperCase().startsWith("LAN-") ? raw.slice(4) : raw;
  if (!cleaned) return "";
  const restored = cleaned
    .replace(/~/g, "/")
    .replace(/_/g, ":")
    .replace(/-/g, ".");
  return normalizeUrl(restored);
};

export default function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { accountSettings, updateAccountSettings, refreshData, createDirectChatThread, sendChatMessage } = useData();
  const { can, currentUser, verifyCurrentPassword, changePassword, resetPassword } = useAuth();
  const canManageSystem = can("system.manage");
  const canEditReceivingAccounts = normalizeOrgPosition(currentUser?.orgPosition || "") === "treasurer";
  
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPasswordValid, setCurrentPasswordValid] = useState<boolean | null>(null);
  const [currentPasswordTouched, setCurrentPasswordTouched] = useState(false);
  const [checkingCurrentPassword, setCheckingCurrentPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [generatedResetPassword, setGeneratedResetPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [syncServerUrl, setSyncServerUrl] = useState(accountSettings.syncServerUrl || DEFAULT_LAN_SYNC_URL);
  const [syncEnabled, setSyncEnabled] = useState(accountSettings.syncEnabled !== false);
  const [cloudSyncEndpoint, setCloudSyncEndpoint] = useState(accountSettings.cloudSyncEndpoint || DEFAULT_CLOUD_SYNC_ENDPOINT);
  const [receivingBankName, setReceivingBankName] = useState(accountSettings.receivingBankName || "");
  const [receivingBankAccountNumber, setReceivingBankAccountNumber] = useState(accountSettings.receivingBankAccountNumber || "");
  const [receivingBankAccountName, setReceivingBankAccountName] = useState(accountSettings.receivingBankAccountName || "");
  const [receivingKbzPayPhone, setReceivingKbzPayPhone] = useState(accountSettings.receivingKbzPayPhone || "");
  const [receivingKbzPayAccountName, setReceivingKbzPayAccountName] = useState(accountSettings.receivingKbzPayAccountName || "");
  const [receivingKbzPayMmqr, setReceivingKbzPayMmqr] = useState(accountSettings.receivingKbzPayMmqr || "");
  const [receivingWavePayPhone, setReceivingWavePayPhone] = useState(accountSettings.receivingWavePayPhone || "");
  const [receivingWavePayAccountName, setReceivingWavePayAccountName] = useState(accountSettings.receivingWavePayAccountName || "");
  const [receivingWavePayMmqr, setReceivingWavePayMmqr] = useState(accountSettings.receivingWavePayMmqr || "");
  const [receivingAyaPayPhone, setReceivingAyaPayPhone] = useState(accountSettings.receivingAyaPayPhone || "");
  const [receivingAyaPayAccountName, setReceivingAyaPayAccountName] = useState(accountSettings.receivingAyaPayAccountName || "");
  const [receivingAyaPayMmqr, setReceivingAyaPayMmqr] = useState(accountSettings.receivingAyaPayMmqr || "");
  const [syncing, setSyncing] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [showLanQr, setShowLanQr] = useState(false);
  const [lanShareIdInput, setLanShareIdInput] = useState("");
  const [syncConfigSummary, setSyncConfigSummary] = useState<{
    lanSource: "managed_remote_config" | "local_settings" | "default";
    cloudSource: "managed_remote_config" | "local_settings" | "default";
    lanUrl: string;
    lanEnabled: boolean;
    cloudEndpoint: string;
    cloudEnabled: boolean;
    cloudHasApiKey: boolean;
  }>({
    lanSource: "default",
    cloudSource: "default",
    lanUrl: "",
    lanEnabled: false,
    cloudEndpoint: "",
    cloudEnabled: false,
    cloudHasApiKey: false,
  });
  const managedSyncLockdown = getManagedSyncLockdownEnabled();

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const generateSecureResetPassword = (): string => {
    const uuid = Crypto.randomUUID().replace(/-/g, "").toUpperCase();
    const token = uuid.slice(0, 4);
    const numericSeed = parseInt(uuid.slice(4, 8), 16);
    const suffix = 100 + (Number.isFinite(numericSeed) ? numericSeed % 900 : 0);
    return `ORG${token}${suffix}`;
  };

  const syncSourceLabel = (source: "managed_remote_config" | "local_settings" | "default"): string => {
    if (source === "managed_remote_config") return "Firebase Remote Config";
    if (source === "local_settings") return "Local Account Settings";
    return "Default Value";
  };

  const summarizeEndpointForDisplay = (endpoint: string): string => {
    const raw = String(endpoint || "").trim();
    if (!raw) return "Not configured";
    try {
      const parsed = new URL(raw);
      return `${parsed.origin}/...`;
    } catch {
      return "Configured";
    }
  };

  const hasLanSyncConfigured = syncConfigSummary.lanEnabled && !!normalizeUrl((syncConfigSummary.lanUrl || syncServerUrl || DEFAULT_LAN_SYNC_URL));
  const hasCloudSyncConfigured = syncConfigSummary.cloudEnabled && !!String(syncConfigSummary.cloudEndpoint || cloudSyncEndpoint || "").trim();
  const storageModeLabel = hasLanSyncConfigured && hasCloudSyncConfigured
    ? "Online + Offline (LAN + Cloud Sync)"
    : hasLanSyncConfigured
    ? "Online + Offline (LAN Sync)"
    : hasCloudSyncConfigured
    ? "Online + Offline (Cloud Sync)"
    : "Offline (Local)";

  React.useEffect(() => {
    setSyncServerUrl(accountSettings.syncServerUrl || DEFAULT_LAN_SYNC_URL);
    setSyncEnabled(accountSettings.syncEnabled !== false);
    setCloudSyncEndpoint(accountSettings.cloudSyncEndpoint || DEFAULT_CLOUD_SYNC_ENDPOINT);
    setReceivingBankName(accountSettings.receivingBankName || "");
    setReceivingBankAccountNumber(accountSettings.receivingBankAccountNumber || "");
    setReceivingBankAccountName(accountSettings.receivingBankAccountName || "");
    setReceivingKbzPayPhone(accountSettings.receivingKbzPayPhone || "");
    setReceivingKbzPayAccountName(accountSettings.receivingKbzPayAccountName || "");
    setReceivingKbzPayMmqr(accountSettings.receivingKbzPayMmqr || "");
    setReceivingWavePayPhone(accountSettings.receivingWavePayPhone || "");
    setReceivingWavePayAccountName(accountSettings.receivingWavePayAccountName || "");
    setReceivingWavePayMmqr(accountSettings.receivingWavePayMmqr || "");
    setReceivingAyaPayPhone(accountSettings.receivingAyaPayPhone || "");
    setReceivingAyaPayAccountName(accountSettings.receivingAyaPayAccountName || "");
    setReceivingAyaPayMmqr(accountSettings.receivingAyaPayMmqr || "");
  }, [
    accountSettings.syncServerUrl,
    accountSettings.syncEnabled,
    accountSettings.cloudSyncEndpoint,
    accountSettings.receivingBankName,
    accountSettings.receivingBankAccountNumber,
    accountSettings.receivingBankAccountName,
    accountSettings.receivingKbzPayPhone,
    accountSettings.receivingKbzPayAccountName,
    accountSettings.receivingKbzPayMmqr,
    accountSettings.receivingWavePayPhone,
    accountSettings.receivingWavePayAccountName,
    accountSettings.receivingWavePayMmqr,
    accountSettings.receivingAyaPayPhone,
    accountSettings.receivingAyaPayAccountName,
    accountSettings.receivingAyaPayMmqr,
  ]);

  React.useEffect(() => {
    let active = true;
    const loadEffectiveSyncConfig = async () => {
      try {
        const resolved = await getEffectiveSyncRuntimeConfig();
        if (!active) return;
        setSyncConfigSummary({
          lanSource: resolved.lan.source,
          cloudSource: resolved.cloud.source,
          lanUrl: resolved.lan.url,
          lanEnabled: resolved.lan.enabled,
          cloudEndpoint: resolved.cloud.endpoint,
          cloudEnabled: resolved.cloud.enabled,
          cloudHasApiKey: resolved.cloud.hasApiKey,
        });
      } catch {
        // keep existing summary state
      }
    };
    void loadEffectiveSyncConfig();
    return () => {
      active = false;
    };
  }, [accountSettings]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const loadPendingLanUrl = async () => {
        try {
          const pending = await AsyncStorage.getItem(PENDING_LAN_URL_KEY);
          if (!active || !pending) return;
          await AsyncStorage.removeItem(PENDING_LAN_URL_KEY);
          const normalized = normalizeUrl(pending);
          if (normalized) {
            setSyncServerUrl(normalized);
            setSyncEnabled(true);
            Alert.alert("LAN URL", "QR မှ ရယူထားသော LAN URL ကို ထည့်ပြီးပါပြီ။ Save ကိုနှိပ်ပါ။");
          }
        } catch {
          // ignore
        }
      };
      void loadPendingLanUrl();
      return () => {
        active = false;
      };
    }, [])
  );

  const getReceivingValuesForSave = () => {
    if (canEditReceivingAccounts) {
      return {
        receivingBankName: receivingBankName.trim(),
        receivingBankAccountNumber: receivingBankAccountNumber.trim(),
        receivingBankAccountName: receivingBankAccountName.trim(),
        receivingKbzPayPhone: receivingKbzPayPhone.trim(),
        receivingKbzPayAccountName: receivingKbzPayAccountName.trim(),
        receivingKbzPayMmqr: receivingKbzPayMmqr.trim(),
        receivingWavePayPhone: receivingWavePayPhone.trim(),
        receivingWavePayAccountName: receivingWavePayAccountName.trim(),
        receivingWavePayMmqr: receivingWavePayMmqr.trim(),
        receivingAyaPayPhone: receivingAyaPayPhone.trim(),
        receivingAyaPayAccountName: receivingAyaPayAccountName.trim(),
        receivingAyaPayMmqr: receivingAyaPayMmqr.trim(),
      };
    }
    return {
      receivingBankName: accountSettings.receivingBankName || "",
      receivingBankAccountNumber: accountSettings.receivingBankAccountNumber || "",
      receivingBankAccountName: accountSettings.receivingBankAccountName || "",
      receivingKbzPayPhone: accountSettings.receivingKbzPayPhone || "",
      receivingKbzPayAccountName: accountSettings.receivingKbzPayAccountName || "",
      receivingKbzPayMmqr: accountSettings.receivingKbzPayMmqr || "",
      receivingWavePayPhone: accountSettings.receivingWavePayPhone || "",
      receivingWavePayAccountName: accountSettings.receivingWavePayAccountName || "",
      receivingWavePayMmqr: accountSettings.receivingWavePayMmqr || "",
      receivingAyaPayPhone: accountSettings.receivingAyaPayPhone || "",
      receivingAyaPayAccountName: accountSettings.receivingAyaPayAccountName || "",
      receivingAyaPayMmqr: accountSettings.receivingAyaPayMmqr || "",
    };
  };

  const getSyncValuesForSave = (): Pick<
    AccountSettings,
    | "syncServerUrl"
    | "syncEnabled"
    | "cloudSyncEnabled"
    | "cloudSyncProvider"
    | "cloudSyncEndpoint"
    | "cloudSyncApiKey"
    | "cloudSyncGoogleAccountEmail"
    | "cloudSyncFolderName"
  > => {
    const normalizedUrl = normalizeUrl(syncServerUrl || DEFAULT_LAN_SYNC_URL);
    return {
      syncServerUrl: normalizedUrl,
      syncEnabled,
      cloudSyncEnabled: accountSettings.cloudSyncEnabled === true,
      cloudSyncProvider: "google_drive_apps_script",
      cloudSyncEndpoint: String(accountSettings.cloudSyncEndpoint || ""),
      cloudSyncApiKey: String(accountSettings.cloudSyncApiKey || ""),
      cloudSyncGoogleAccountEmail: String(accountSettings.cloudSyncGoogleAccountEmail || ""),
      cloudSyncFolderName: String(accountSettings.cloudSyncFolderName || DEFAULT_CLOUD_SYNC_FOLDER_NAME),
    };
  };

  const lanSharePayload = useMemo(() => {
    const normalized = normalizeUrl(syncServerUrl || DEFAULT_LAN_SYNC_URL);
    if (!normalized) return "";
    return `${LAN_QR_PREFIX}${normalized}`;
  }, [syncServerUrl]);

  const lanShareId = useMemo(
    () => encodeLanShareId(syncServerUrl || DEFAULT_LAN_SYNC_URL),
    [syncServerUrl]
  );

  const handleApplyLanShareId = () => {
    const resolved = decodeLanShareId(lanShareIdInput);
    if (!resolved) {
      Alert.alert("မမှန်ကန်ပါ", "LAN Share ID ကိုစစ်ဆေးပါ။");
      return;
    }
    setSyncServerUrl(resolved);
    setSyncEnabled(true);
    Alert.alert("LAN URL", "LAN Share ID မှ URL ကို ထည့်ပြီးပါပြီ။ Save ကိုနှိပ်ပါ။");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const receiving = getReceivingValuesForSave();
      const syncValues = getSyncValuesForSave();
      await updateAccountSettings({
        ...accountSettings,
        openingBalanceCash: accountSettings.openingBalanceCash,
        openingBalanceBank: accountSettings.openingBalanceBank,
        currency: accountSettings.currency || "MMK",
        ...syncValues,
        ...receiving,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert("Error", "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const confirmMismatch = useMemo(() => {
    if (!confirmPassword.trim()) return false;
    return newPassword.trim() !== confirmPassword.trim();
  }, [newPassword, confirmPassword]);

  const canEditNewPassword = currentPasswordValid === true;
  const canSubmitPasswordChange = useMemo(() => {
    return (
      canEditNewPassword &&
      !changingPassword &&
      newPassword.trim().length > 0 &&
      confirmPassword.trim().length > 0 &&
      !confirmMismatch
    );
  }, [canEditNewPassword, changingPassword, newPassword, confirmPassword, confirmMismatch]);

  const runCurrentPasswordCheck = async () => {
    const raw = currentPassword.trim();
    setCurrentPasswordTouched(true);
    if (!raw) {
      setCurrentPasswordValid(null);
      return false;
    }

    setCheckingCurrentPassword(true);
    try {
      const ok = await verifyCurrentPassword(raw);
      setCurrentPasswordValid(ok);
      if (!ok) {
        setNewPassword("");
        setConfirmPassword("");
      }
      return ok;
    } finally {
      setCheckingCurrentPassword(false);
    }
  };

  const handleChangePassword = async () => {
    if (changingPassword) return;
    const currentOk = await runCurrentPasswordCheck();
    if (!currentOk) {
      Alert.alert("Current Password မှားနေပါသည်", "မှန်ကန်သော Current Password ကိုအရင်ဖြည့်ပါ။");
      return;
    }
    if (!newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert("လိုအပ်ချက်", "New Password နှင့် Confirm Password ကိုဖြည့်ပါ။");
      return;
    }
    if (confirmMismatch) {
      Alert.alert("မကိုက်ညီပါ", "New Password နှင့် Confirm Password ကိုက်ညီရပါမည်။");
      return;
    }

    setChangingPassword(true);
    try {
      const ok = await changePassword(currentPassword.trim(), newPassword.trim());
      if (!ok) {
        Alert.alert("မအောင်မြင်ပါ", "Current Password မှားနေပါသည် သို့မဟုတ် ပြောင်းလဲမှု မအောင်မြင်ပါ။");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setCurrentPasswordTouched(false);
      setCurrentPasswordValid(null);
      Alert.alert("အောင်မြင်ပါသည်", "Password ပြောင်းလဲပြီးပါပြီ။");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleAdminReset = async () => {
    if (resettingPassword) return;
    if (!resetIdentifier.trim()) {
      Alert.alert("လိုအပ်ချက်", "Member ID / ID### / Phone / Email / Admin တစ်ခုခု ထည့်ပါ။");
      return;
    }

    const nextPassword =
      generatedResetPassword.trim() || generateSecureResetPassword();

    setResettingPassword(true);
    try {
      const result = await resetPassword(resetIdentifier.trim(), nextPassword);
      if (!result.ok) {
        Alert.alert("မတွေ့ပါ", "ဖော်ပြထားသည့် user ကိုမတွေ့ပါ သို့မဟုတ် reset မအောင်မြင်ပါ။");
        return;
      }
      const targetUserId = String(result.userId || "").trim();
      const targetName = String(result.displayName || targetUserId || "-").trim();
      const targetPhone = String(result.phone || "").trim();
      const issuedPassword = String(result.password || nextPassword).trim();
      const messageBody =
        `Password Reset အသိပေးချက်\n` +
        `Username: ${targetUserId}\n` +
        `Temporary Password: ${issuedPassword}\n` +
        `Login ဝင်ပြီးနောက် ကိုယ်ပိုင် Password ကို ချက်ချင်းပြောင်းပါ။`;

      setResetIdentifier("");
      setGeneratedResetPassword("");
      const actionButtons: any[] = [
        {
          text: "Copy",
          onPress: () => {
            void Clipboard.setStringAsync(messageBody);
          },
        },
      ];
      if (targetUserId && currentUser?.id) {
        actionButtons.push({
          text: "App Message ပို့မည်",
          onPress: () => {
            void (async () => {
              try {
                const thread = await createDirectChatThread({
                  userAId: currentUser.id,
                  userBId: targetUserId,
                  createdByUserId: currentUser.id,
                });
                await sendChatMessage({
                  threadId: thread.id,
                  senderUserId: currentUser.id,
                  senderMemberId: currentUser.memberId,
                  senderDisplayName: currentUser.displayName,
                  text: messageBody,
                });
                Alert.alert("ပို့ပြီးပါပြီ", "App Message ဖြင့် password အသစ်ပေးပို့ပြီးပါပြီ။");
              } catch {
                Alert.alert("မအောင်မြင်ပါ", "App Message မပို့နိုင်ပါ။");
              }
            })();
          },
        });
      }
      if (targetPhone) {
        actionButtons.push({
          text: "Phone Message ပို့မည်",
          onPress: () => {
            void Linking.openURL(`sms:${targetPhone}?body=${encodeURIComponent(messageBody)}`).catch(() => {
              Alert.alert("မအောင်မြင်ပါ", "Phone Message app မဖွင့်နိုင်ပါ။");
            });
          },
        });
      }
      Alert.alert(
        "Reset ပြီးပါပြီ",
        `${targetName} အတွက် password အသစ်သတ်မှတ်ပြီးပါပြီ။\n\nUsername: ${targetUserId}\nTemporary Password: ${issuedPassword}`,
        [
          ...actionButtons,
          { text: "ပိတ်မည်", style: "cancel" },
        ]
      );
    } finally {
      setResettingPassword(false);
    }
  };

  const handleSyncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const receiving = getReceivingValuesForSave();
      const syncValues = getSyncValuesForSave();
      await updateAccountSettings({
        ...accountSettings,
        openingBalanceCash: accountSettings.openingBalanceCash,
        openingBalanceBank: accountSettings.openingBalanceBank,
        currency: accountSettings.currency || "MMK",
        ...syncValues,
        ...receiving,
      });
      const runtimeConfig = await getEffectiveSyncRuntimeConfig();
      const runtimeLanEnabled = runtimeConfig.lan.enabled;
      const runtimeCloudEnabled = runtimeConfig.cloud.enabled;
      const runtimeLanUrl = normalizeUrl(runtimeConfig.lan.url || syncValues.syncServerUrl || DEFAULT_LAN_SYNC_URL);

      if (runtimeLanEnabled && runtimeLanUrl) {
        const health = await checkLanSyncHealth();
        if (!health.ok) {
          Alert.alert(
            "Sync Error",
            `Server မချိတ်ဆက်နိုင်ပါ\nURL: ${runtimeLanUrl}\nReason: ${health.reason || "unknown"}${health.status ? ` (${health.status})` : ""}\n\nComputer server run နေ/မနေ၊ Phone/Computer Wi-Fi တူ/မတူ၊ firewall ကို စစ်ပါ။`
          );
        }        
      }

      let cloudHealthLine = "Cloud: Disabled";
      if (runtimeCloudEnabled) {
        const cloudHealth = await checkCloudSyncHealth();
        cloudHealthLine = cloudHealth.ok
          ? "Cloud Health: OK"
          : `Cloud Health: Fail (${cloudHealth.reason || "unknown"}${cloudHealth.status ? `/${cloudHealth.status}` : ""})`;
      }

      const pullLan = runtimeLanEnabled
        ? await pullLanSnapshotToLocalDetailed()
        : ({ ok: false, reason: "disabled_or_empty_url" } as const);
      const pullCloud = runtimeCloudEnabled
        ? await pullCloudSnapshotToLocalDetailed()
        : ({ ok: false, reason: "cloud_disabled_or_empty_endpoint" } as const);

      const pushLan = runtimeLanEnabled
        ? await pushLanSnapshotFromLocalDetailed()
        : ({ ok: false, reason: "disabled_or_empty_url" } as const);
      const pushCloud = runtimeCloudEnabled
        ? await pushCloudSnapshotFromLocalDetailed()
        : ({ ok: false, reason: "cloud_disabled_or_empty_endpoint" } as const);

      const asSyncLine = (
        prefix: string,
        result: { ok: boolean; changed?: boolean; reason?: string; status?: number },
        action: "pull" | "push"
      ): string => {
        if (String(result.reason || "").includes("disabled_or_empty")) {
          return `${prefix}: Skip (disabled)`;
        }
        if (action === "pull") {
          return result.ok
            ? `${prefix}: ${result.changed ? "OK" : `Skip (${result.reason || "no_change"})`}`
            : `${prefix}: Fail (${result.reason || "unknown"}${result.status ? `/${result.status}` : ""})`;
        }
        return result.ok
          ? `${prefix}: OK`
          : `${prefix}: Fail (${result.reason || "unknown"}${result.status ? `/${result.status}` : ""})`;
      };

      const lanPullLine = asSyncLine("LAN Pull", pullLan, "pull");
      const lanPushLine = asSyncLine("LAN Push", pushLan, "push");
      const cloudPullLine = asSyncLine("Cloud Pull", pullCloud, "pull");
      const cloudPushLine = asSyncLine("Cloud Push", pushCloud, "push");
      const authHintNeeded = [pullCloud.reason, pushCloud.reason].some((r) => String(r || "").includes("unauthorized"));
      const authHint = authHintNeeded
        ? "\nHint: Cloud API Key ကို Google Apps Script ထဲက API_KEY နဲ့ တိတိကျကျတူအောင် ပြန်စစ်ပါ။ API_KEY မသုံးရင် နှစ်ဖက်လုံးအလွတ်ထားပါ။"
        : "";

      await refreshData({ skipPull: true });
      Alert.alert("Sync", `${lanPullLine}\n${lanPushLine}\n${cloudPullLine}\n${cloudPushLine}\n${cloudHealthLine}${authHint}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleCheckForUpdate = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const currentVersion = getCurrentAppVersion();
      const currentBuild = getCurrentBuildNumber() || "-";
      const info = await checkForAppUpdate();
      if (!info.ok) {
        Alert.alert(
          "Check for Update",
          `Update စစ်ဆေးမရပါ။\nReason: ${info.reason || "unknown"}`
        );
        return;
      }

      if (!info.hasUpdate || !info.downloadUrl) {
        Alert.alert(
          "Latest Version",
          `Current: ${currentVersion} (${currentBuild})\nဒီဗားရှင်းသည် နောက်ဆုံးဖြစ်ပါသည်။`
        );
        return;
      }

      Alert.alert(
        "Update Available",
        `Current: ${currentVersion} (${currentBuild})\nLatest: ${info.latestVersion || "-"} (${info.latestBuildNumber || "-"})`,
        [
          { text: "Later", style: "cancel" },
          {
            text: "Update Now",
            onPress: () => {
              void Linking.openURL(String(info.downloadUrl || "").trim());
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(
        "Check for Update",
        `Update စစ်ဆေးမရပါ။\nReason: ${String(error?.message || "unknown")}`
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 + webTopInset }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Ionicons name="close" size={26} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Account Settings</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.saveBtn, saving && { opacity: 0.4 }]}>Save</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 60 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.storageCard}>
          <View style={styles.storageIcon}>
            <Ionicons
              name={hasLanSyncConfigured || hasCloudSyncConfigured ? "cloud-done" : "cloud-offline"}
              size={24}
              color={hasLanSyncConfigured || hasCloudSyncConfigured ? "#16A34A" : "#F59E0B"}
            />
          </View>
          <View style={styles.storageTextContainer}>
            <Text style={styles.storageTitle}>Storage: {storageModeLabel}</Text>
            <Text style={styles.storageDesc}>
              LAN Sync သို့မဟုတ် Google Drive Cloud Sync ကို Enable လုပ်ပါက အချက်အလက်များ မျှဝေညှိနှိုင်းနိုင်ပါမည်။
            </Text>
          </View>
        </View>
        <View style={styles.syncRow}>
          <Pressable style={styles.checkUpdateBtn} onPress={() => void handleCheckForUpdate()} disabled={checkingUpdate}>
            <Ionicons name={checkingUpdate ? "time-outline" : "download-outline"} size={18} color="#fff" />
            <Text style={styles.checkUpdateText}>{checkingUpdate ? "Checking..." : "Check for Update"}</Text>
          </Pressable>
        </View>
        <>
          <Text style={styles.label}>LAN Sync Server URL</Text>
          <TextInput
            style={styles.input}
            value={syncServerUrl}
            onChangeText={setSyncServerUrl}
            placeholder="ဥပမာ - http://192.168.1.100:5000"
            autoCapitalize="none"
          />
          <View style={styles.lanActionRow}>
            <Pressable style={styles.lanActionBtn} onPress={() => setShowLanQr(true)} disabled={!lanSharePayload}>
              <Ionicons name="qr-code-outline" size={16} color={Colors.light.text} />
              <Text style={styles.lanActionText}>Show LAN QR</Text>
            </Pressable>
            <Pressable
              style={styles.lanActionBtn}
              onPress={() => router.push({ pathname: "/qr-scanner", params: { mode: "lan_sync" } } as any)}
            >
              <Ionicons name="scan-outline" size={16} color={Colors.light.text} />
              <Text style={styles.lanActionText}>Scan LAN QR</Text>
            </Pressable>
          </View>
          <View style={styles.lanIdRow}>
            <Text style={styles.lanIdLabel}>Current LAN ID</Text>
            <Pressable
              onPress={() => {
                if (lanShareId) {
                  void Clipboard.setStringAsync(lanShareId);
                  Alert.alert("Copied", "LAN ID ကို Copy လုပ်ပြီးပါပြီ။");
                }
              }}
            >
              <Text style={styles.lanIdValue}>{lanShareId || "-"}</Text>
            </Pressable>
          </View>
          <Text style={styles.label}>LAN Share ID</Text>
          <TextInput
            style={styles.input}
            value={lanShareIdInput}
            onChangeText={setLanShareIdInput}
            placeholder={lanShareId ? `ဥပမာ - ${lanShareId}` : "LAN-xxxx"}
            autoCapitalize="none"
          />
          <Pressable style={styles.lanApplyBtn} onPress={handleApplyLanShareId}>
            <Text style={styles.lanApplyText}>Apply LAN ID</Text>
          </Pressable>
          <View style={styles.syncRow}>
            <Pressable
              style={[styles.syncToggleBtn, syncEnabled && styles.syncToggleBtnActive]}
              onPress={() => setSyncEnabled((v) => !v)}
            >
              <Ionicons name={syncEnabled ? "checkmark-circle" : "ellipse-outline"} size={18} color={syncEnabled ? "#fff" : Colors.light.text} />
              <Text style={[styles.syncToggleText, syncEnabled && styles.syncToggleTextActive]}>
                {syncEnabled ? "LAN Sync Enabled" : "LAN Sync Disabled"}
              </Text>
            </Pressable>
            <Pressable style={styles.syncNowBtn} onPress={() => void handleSyncNow()} disabled={syncing}>
              {syncing ? (
                <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              ) : (
                <Ionicons name="sync-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
              )}
              <Text style={styles.syncNowText}>{syncing ? "Syncing..." : "Sync Now"}</Text>
            </Pressable>
          </View>

          <View style={styles.securityCard}>
            <Text style={styles.sectionTitle}>Managed Sync Configuration</Text>
            <Text style={styles.sectionDesc}>
              Cloud Sync ကို UI မှမပြင်ဘဲ Firebase Remote Config မှတစ်ဆင့်သာ ဗဟိုထိန်းချုပ်ပါသည် (read-only)။
            </Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Managed Lockdown</Text>
              <Text style={styles.summaryValue}>{managedSyncLockdown ? "Enabled" : "Disabled"}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>LAN Source</Text>
              <Text style={styles.summaryValue}>{syncSourceLabel(syncConfigSummary.lanSource)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>LAN Runtime</Text>
              <Text style={styles.summaryValue}>{syncConfigSummary.lanEnabled ? "Enabled" : "Disabled"}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>LAN URL</Text>
              <Text style={styles.summaryValue}>{summarizeEndpointForDisplay(syncConfigSummary.lanUrl)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Cloud Source</Text>
              <Text style={styles.summaryValue}>{syncSourceLabel(syncConfigSummary.cloudSource)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Cloud Runtime</Text>
              <Text style={styles.summaryValue}>{syncConfigSummary.cloudEnabled ? "Enabled" : "Disabled"}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Cloud Endpoint</Text>
              <Text style={styles.summaryValue}>{summarizeEndpointForDisplay(syncConfigSummary.cloudEndpoint)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Cloud API Key</Text>
              <Text style={styles.summaryValue}>{syncConfigSummary.cloudHasApiKey ? "Configured" : "Not configured"}</Text>
            </View>
          </View>
        </>

        <Modal visible={showLanQr} transparent animationType="fade" onRequestClose={() => setShowLanQr(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.sectionTitle}>LAN Share QR</Text>
              {lanSharePayload ? (
                <>
                  <View style={styles.qrBox}>
                    <QRCode value={lanSharePayload} size={180} />
                  </View>
                  <Text style={styles.qrHint}>QR ကို scan လုပ်ပြီး LAN URL ကို Auto fill လုပ်နိုင်ပါတယ်။</Text>
                  <Text style={styles.qrMeta}>URL: {normalizeUrl(syncServerUrl || DEFAULT_LAN_SYNC_URL)}</Text>
                  <Text style={styles.qrMeta}>ID: {lanShareId || "-"}</Text>
                </>
              ) : (
                <Text style={styles.sectionDesc}>LAN URL မရှိသေးပါ။</Text>
              )}
              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalGhostBtn}
                  onPress={() => {
                    if (lanShareId) {
                      void Clipboard.setStringAsync(lanShareId);
                      Alert.alert("Copied", "LAN ID ကို Copy လုပ်ပြီးပါပြီ။");
                    }
                  }}
                >
                  <Text style={styles.modalGhostText}>Copy ID</Text>
                </Pressable>
                <Pressable
                  style={styles.modalGhostBtn}
                  onPress={() => {
                    const url = normalizeUrl(syncServerUrl || DEFAULT_LAN_SYNC_URL);
                    if (url) {
                      void Clipboard.setStringAsync(url);
                      Alert.alert("Copied", "LAN URL ကို Copy လုပ်ပြီးပါပြီ။");
                    }
                  }}
                >
                  <Text style={styles.modalGhostText}>Copy URL</Text>
                </Pressable>
                <Pressable style={styles.modalPrimaryBtn} onPress={() => setShowLanQr(false)}>
                  <Text style={styles.modalPrimaryText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {canEditReceivingAccounts && (
          <View style={styles.securityCard}>
            <Text style={styles.sectionTitle}>Payment Receiving Accounts</Text>
            <Text style={styles.sectionDesc}>
              ဘဏ္ဍာရေးမှူး လက်ခံမည့် Bank/Mobile Wallet အကောင့်များကို သတ်မှတ်ပြီး Wallet app မှ static MMQR payload ကိုပါ ထည့်ပေးပါ။
            </Text>

            <Text style={styles.label}>Bank Name</Text>
            <TextInput style={styles.input} value={receivingBankName} onChangeText={setReceivingBankName} placeholder="ဥပမာ - KBZ Bank" />
            <Text style={styles.label}>Bank Account Number</Text>
            <TextInput style={styles.input} value={receivingBankAccountNumber} onChangeText={setReceivingBankAccountNumber} placeholder="Account Number" />
            <Text style={styles.label}>Bank Account Name</Text>
            <TextInput style={styles.input} value={receivingBankAccountName} onChangeText={setReceivingBankAccountName} placeholder="Account Name" />

            <Text style={styles.label}>KBZ Pay Phone</Text>
            <TextInput style={styles.input} value={receivingKbzPayPhone} onChangeText={setReceivingKbzPayPhone} placeholder="09xxxxxxxxx" keyboardType="phone-pad" />
            <Text style={styles.label}>KBZ Pay Account Name</Text>
            <TextInput style={styles.input} value={receivingKbzPayAccountName} onChangeText={setReceivingKbzPayAccountName} placeholder="Account Name" />
            <Text style={styles.label}>KBZ Pay MMQR Payload (Raw)</Text>
            <TextInput
              style={[styles.input, { minHeight: 72, textAlignVertical: "top" }]}
              value={receivingKbzPayMmqr}
              onChangeText={setReceivingKbzPayMmqr}
              placeholder="static MMQR payload သို့မဟုတ် template ({AMOUNT}/{AMOUNT_2DP}/{AMOUNT_CENTS})"
              multiline
            />
            <Text style={styles.sectionDesc}>
              KBZ proprietary static QR အတွက် amount auto-fill မရနိုင်ပါ။ Template token ပါသည့် payload (ဥပမာ {"{AMOUNT_2DP}"}) ရှိမှ amount ကို QR ထဲထည့်နိုင်ပါသည်။
            </Text>

            <Text style={styles.label}>Wave Pay Phone</Text>
            <TextInput style={styles.input} value={receivingWavePayPhone} onChangeText={setReceivingWavePayPhone} placeholder="09xxxxxxxxx" keyboardType="phone-pad" />
            <Text style={styles.label}>Wave Pay Account Name</Text>
            <TextInput style={styles.input} value={receivingWavePayAccountName} onChangeText={setReceivingWavePayAccountName} placeholder="Account Name" />
            <Text style={styles.label}>Wave Pay MMQR Payload (Raw)</Text>
            <TextInput
              style={[styles.input, { minHeight: 72, textAlignVertical: "top" }]}
              value={receivingWavePayMmqr}
              onChangeText={setReceivingWavePayMmqr}
              placeholder="Wallet app မှ ထုတ်ယူထားသော static MMQR string ကို paste လုပ်ပါ"
              multiline
            />

            <Text style={styles.label}>AYA Pay Phone</Text>
            <TextInput style={styles.input} value={receivingAyaPayPhone} onChangeText={setReceivingAyaPayPhone} placeholder="09xxxxxxxxx" keyboardType="phone-pad" />
            <Text style={styles.label}>AYA Pay Account Name</Text>
            <TextInput style={styles.input} value={receivingAyaPayAccountName} onChangeText={setReceivingAyaPayAccountName} placeholder="Account Name" />
            <Text style={styles.label}>AYA Pay MMQR Payload (Raw)</Text>
            <TextInput
              style={[styles.input, { minHeight: 72, textAlignVertical: "top" }]}
              value={receivingAyaPayMmqr}
              onChangeText={setReceivingAyaPayMmqr}
              placeholder="Wallet app မှ ထုတ်ယူထားသော static MMQR string ကို paste လုပ်ပါ"
              multiline
            />
          </View>
        )}

        {canManageSystem && (
          <Pressable
            style={styles.dataManagementBtn}
            onPress={() => router.push("/data-management")}
          >
            <Ionicons name="server-outline" size={20} color={Colors.light.text} />
            <Text style={styles.dataManagementText}>System & Data Management (Backup/Restore)</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.light.textSecondary} />
          </Pressable>
        )}

        {canManageSystem && (
          <Pressable
            style={styles.dataManagementBtn}
            onPress={() => router.push("/phone-transfer")}
          >
            <Ionicons name="phone-portrait-outline" size={20} color={Colors.light.text} />
            <Text style={styles.dataManagementText}>Phone-to-Phone Transfer (Nearby/QR)</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.light.textSecondary} />
          </Pressable>
        )}

        <View style={styles.securityCard}>
          <Text style={styles.sectionTitle}>Security</Text>
          <Text style={styles.sectionDesc}>သင့်အကောင့် Password ကို ဒီနေရာမှာပြောင်းနိုင်ပါသည်။</Text>

          <Text style={styles.label}>Current Password</Text>
          <View style={[styles.passwordInputWrap, currentPasswordTouched && currentPasswordValid === false && styles.inputErrorBorder]}>
            <TextInput
              style={styles.passwordInput}
              secureTextEntry={!showCurrentPassword}
              value={currentPassword}
              onChangeText={(value) => {
                setCurrentPassword(value);
                setCurrentPasswordTouched(false);
                setCurrentPasswordValid(null);
              }}
              onBlur={() => {
                void runCurrentPasswordCheck();
              }}
              onSubmitEditing={() => {
                void runCurrentPasswordCheck();
              }}
              placeholder="Current password"
              returnKeyType="done"
            />
            <Pressable style={styles.eyeBtn} onPress={() => setShowCurrentPassword((prev) => !prev)}>
              <Ionicons name={showCurrentPassword ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.light.textSecondary} />
            </Pressable>
          </View>
          {checkingCurrentPassword ? <Text style={styles.helperText}>စစ်ဆေးနေပါသည်...</Text> : null}
          {!checkingCurrentPassword && currentPasswordTouched && currentPasswordValid === false ? (
            <Text style={styles.errorText}>Current Password မှားနေပါသည်။</Text>
          ) : null}
          {!checkingCurrentPassword && currentPasswordTouched && currentPasswordValid === true ? (
            <Text style={styles.successText}>Current Password မှန်ကန်ပါသည်။ New Password ဖြည့်နိုင်ပါပြီ။</Text>
          ) : null}

          <Text style={styles.label}>New Password</Text>
          <View style={[styles.passwordInputWrap, !canEditNewPassword && styles.inputDisabled]}>
            <TextInput
              style={styles.passwordInput}
              secureTextEntry={!showNewPassword}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={canEditNewPassword ? "New password" : "Current Password အရင်စစ်ပါ"}
              editable={canEditNewPassword}
            />
            <Pressable style={styles.eyeBtn} onPress={() => setShowNewPassword((prev) => !prev)} disabled={!canEditNewPassword}>
              <Ionicons name={showNewPassword ? "eye-off-outline" : "eye-outline"} size={20} color={canEditNewPassword ? Colors.light.textSecondary : "#94A3B8"} />
            </Pressable>
          </View>

          <Text style={styles.label}>Confirm New Password</Text>
          <View
            style={[
              styles.passwordInputWrap,
              !canEditNewPassword && styles.inputDisabled,
              canEditNewPassword && confirmMismatch && styles.inputErrorBorder,
            ]}
          >
            <TextInput
              style={styles.passwordInput}
              secureTextEntry={!showConfirmPassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={canEditNewPassword ? "Confirm new password" : "Current Password အရင်စစ်ပါ"}
              editable={canEditNewPassword}
            />
            <Pressable style={styles.eyeBtn} onPress={() => setShowConfirmPassword((prev) => !prev)} disabled={!canEditNewPassword}>
              <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={canEditNewPassword ? Colors.light.textSecondary : "#94A3B8"} />
            </Pressable>
          </View>
          {canEditNewPassword && confirmMismatch ? (
            <Text style={styles.errorText}>Confirm New Password မကိုက်ညီပါ။</Text>
          ) : null}

          <Pressable
            style={[styles.passwordBtn, !canSubmitPasswordChange && styles.passwordBtnDisabled]}
            onPress={handleChangePassword}
            disabled={!canSubmitPasswordChange}
          >
            <Text style={styles.passwordBtnText}>{changingPassword ? "Updating..." : "Change My Password"}</Text>
          </Pressable>
        </View>

        {currentUser?.systemRole === "admin" && (
          <View style={styles.adminCard}>
            <Text style={styles.sectionTitle}>Admin Password Reset</Text>
            <Text style={styles.sectionDesc}>
              Member ID / ID### / Username / Phone / Email / Admin ဖြင့် user ကိုရှာပြီး temporary password အသစ်သတ်မှတ်နိုင်ပါသည်။
            </Text>

            <TextInput
              style={styles.input}
              value={resetIdentifier}
              onChangeText={setResetIdentifier}
              placeholder="ဥပမာ - ရဆသ-001 / ID001 / 09xxxxxxxxx / user@mail.com / Admin"
            />

            <TextInput
              style={styles.input}
              value={generatedResetPassword}
              onChangeText={setGeneratedResetPassword}
              placeholder="Temporary Password (မဖြည့်လျှင် auto-generate)"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Pressable style={styles.adminResetBtn} onPress={handleAdminReset} disabled={resettingPassword}>
              <Text style={styles.passwordBtnText}>{resettingPassword ? "Resetting..." : "Generate / Reset Password"}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  saveBtn: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
  form: {
    padding: 20,
    paddingBottom: 60,
  },
  infoCard: {
    flexDirection: "row",
    backgroundColor: Colors.light.tintLight,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    alignItems: "flex-start",
    marginBottom: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    lineHeight: 19,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
    marginBottom: 6,
    marginTop: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  lanActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  lanActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingVertical: 10,
  },
  lanActionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  lanIdRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingHorizontal: 2,
  },
  lanIdLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  lanIdValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
  lanApplyBtn: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: "#0EA5E9",
    alignItems: "center",
    paddingVertical: 10,
  },
  lanApplyText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    position: 'relative'
  },
  dropdownText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
  },
  dataManagementBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 12,
  },
  dataManagementText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  passwordInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: "hidden",
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
  },
  eyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputDisabled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
  },
  inputErrorBorder: {
    borderColor: "#EF4444",
  },
  helperText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 6,
    marginBottom: 2,
    fontFamily: "Inter_400Regular",
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    marginTop: 6,
    marginBottom: 2,
    fontFamily: "Inter_500Medium",
  },
  successText: {
    fontSize: 12,
    color: "#059669",
    marginTop: 6,
    marginBottom: 2,
    fontFamily: "Inter_500Medium",
  },
  securityCard: {
    marginTop: 24,
    borderRadius: 12,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
  },
  adminCard: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FDBA74",
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginBottom: 12,
  },
  passwordBtn: {
    marginTop: 14,
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 12,
  },
  passwordBtnDisabled: {
    opacity: 0.45,
  },
  adminResetBtn: {
    marginTop: 12,
    backgroundColor: "#EA580C",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 12,
  },
  passwordBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  storageCard: {
    flexDirection: "row",
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#FDBA74",
    alignItems: "center",
    gap: 12,
  },
  storageIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFEDD5",
    justifyContent: "center",
    alignItems: "center",
  },
  storageTextContainer: {
    flex: 1,
  },
  storageTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#9A3412",
    marginBottom: 2,
  },
  storageDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#9A3412",
    lineHeight: 18,
  },
  syncRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
  },
  syncToggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingVertical: 11,
  },
  syncToggleBtnActive: {
    backgroundColor: "#16A34A",
    borderColor: "#16A34A",
  },
  syncToggleBtnDisabled: {
    opacity: 0.55,
  },
  syncToggleText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  syncToggleTextActive: {
    color: "#fff",
  },
  syncNowBtn: {
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 14,
    paddingVertical: 11,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  syncNowText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  checkUpdateBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 14,
    paddingVertical: 11,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  checkUpdateText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2FF",
    gap: 12,
  },
  summaryLabel: {
    flex: 1,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  summaryValue: {
    flex: 1,
    textAlign: "right",
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  qrBox: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  qrHint: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginBottom: 8,
    fontFamily: "Inter_400Regular",
  },
  qrMeta: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 14,
  },
  modalGhostBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  modalGhostText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  modalPrimaryBtn: {
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modalPrimaryText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});

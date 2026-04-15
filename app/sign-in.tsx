import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/AuthContext";
import { getCurrentAppVersion } from "../lib/app-update";
import { useData } from "../lib/DataContext";
import { clearOrgScopedStorage, persistOrgStorageContext, restoreOrgStorageContext } from "../lib/org-storage";
import { prewarmOrgScopedRemoteConfig, setActiveOrgId } from "../lib/remote-config";
import { ensureChairAccountFromRegistry } from "../lib/storage-service";
import { getAccountSettings, saveAccountSettings } from "../lib/storage-service";
import { fetchOrgRegistryEntry } from "../lib/org-registry";
import { setEmptyOrgState } from "../lib/storage-service";

const INACTIVE_STATUS_SENTENCE: Record<string, string> = {
  "နုတ်ထွက်": "နှုတ်ထွက်ထားပါသည်။",
  "ကွယ်လွန်": "ကွယ်လွန်ထားပါသည်။",
  "ထုတ်ပယ်": "ထုတ်ပယ်ခံထားရပါသည်။",
  "ဆိုင်းငံ့": "ဆိုင်းငံ့ထားပါသည်။",
  "လျှောက်ထားဆဲ": "လျှောက်ထားဆဲဖြစ်ပါသည်။",
};
const LOGIN_DENIED_SUFFIX = "Login ဝင်ခွင့်မရှိပါ။";

export default function SignInScreen() {
  const { attemptLogin, checkUsernameStatus, getLoginLockInfo, loading, resetPassword } = useAuth();
  const { refreshData } = useData();
  const router = useRouter();
  const params = useLocalSearchParams();
  const appVersion = getCurrentAppVersion();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameValid, setUsernameValid] = useState<boolean | null>(null);
  const [usernameStatusMessage, setUsernameStatusMessage] = useState("");
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordValid, setPasswordValid] = useState<boolean | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [resettingForgot, setResettingForgot] = useState(false);
  const [lockRemainingMs, setLockRemainingMs] = useState(0);
  const [showFullGuide, setShowFullGuide] = useState(false);
  const [orgHydrating, setOrgHydrating] = useState(false);
  const passwordInputRef = useRef<TextInput>(null);

  const canSubmit = useMemo(() => {
    return (
      !loading &&
      !isSigningIn &&
      !orgHydrating &&
      lockRemainingMs <= 0 &&
      username.trim().length > 0 &&
      password.trim().length > 0
    );
  }, [loading, isSigningIn, orgHydrating, lockRemainingMs, username, password]);

  const lockMessage = useMemo(() => {
    if (lockRemainingMs <= 0) return "";
    const totalMinutes = Math.ceil(lockRemainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours} နာရီ ${minutes} မိနစ်`;
    return `${minutes} မိနစ်`;
  }, [lockRemainingMs]);

  const validateUsername = async (): Promise<{ ok: boolean; message?: string }> => {
    const raw = username.trim();
    setUsernameTouched(true);
    setUsernameStatusMessage("");
    if (!raw) {
      setUsernameValid(null);
      return { ok: false };
    }
    if (raw.toLowerCase() === "admin") {
      const msg = "Admin login ကို ဤစာမျက်နှာတွင် မဝင်နိုင်ပါ။ Admin Login စာမျက်နှာကို အသုံးပြုပါ။";
      setUsernameValid(false);
      setUsernameStatusMessage(msg);
      return { ok: false, message: msg };
    }
    setCheckingUsername(true);
    try {
      const result = await checkUsernameStatus(raw);
      setUsernameValid(result.canLogin);
      if (!result.exists) return { ok: false };
      if (!result.canLogin) {
        const statusLabel = String(result.memberStatusLabel || "").trim();
        const name = String(result.memberName || raw).trim();
        const statusSentence = INACTIVE_STATUS_SENTENCE[statusLabel] || `${statusLabel} ဖြစ်ပါသည်။`;
        const msg = `${name} သည် ${statusSentence} ${LOGIN_DENIED_SUFFIX}`;
        setUsernameStatusMessage(msg);
        return { ok: false, message: msg };
      }
      return { ok: true };
    } finally {
      setCheckingUsername(false);
    }
  };

  useEffect(() => {
    let active = true;
    const refreshLock = async () => {
      const info = await getLoginLockInfo();
      if (!active) return;
      setLockRemainingMs(info.remainingMs);
    };
    void refreshLock();

    const timer = setInterval(() => {
      setLockRemainingMs((prev) => Math.max(0, prev - 1000));
    }, 1000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [getLoginLockInfo]);

  useEffect(() => {
    const orgConnectMode = String(params?.orgConnect || "").trim() === "1";
    const hasParamOrgId = String(params?.orgId || "").trim().length > 0;
    if (!orgConnectMode && !hasParamOrgId) return;
    let active = true;
    const hydrateOrgContext = async () => {
      setOrgHydrating(true);
      try {
        const restored = await restoreOrgStorageContext();
        let settings = await getAccountSettings();
        const paramOrgId = String(params?.orgId || "").trim();
        let fallbackOrgId = "";
        if (!paramOrgId && Platform.OS === "web") {
          try {
            fallbackOrgId = String(
              window.sessionStorage?.getItem("@orghub_last_connected_org_id") ||
              window.localStorage?.getItem("@orghub_last_connected_org_id") ||
              ""
            ).trim();
          } catch {}
        }
        const orgId = String(paramOrgId || fallbackOrgId || restored?.orgId || settings.orgId || "").trim();
        const orgEmail = String(restored?.orgEmail || settings.orgEmail || "").trim();
        if (orgId) {
          if (orgConnectMode) {
            await clearOrgScopedStorage(orgId);
            await setEmptyOrgState(true);
          }
          await persistOrgStorageContext({ orgId, orgEmail });
          setActiveOrgId(orgId);
          prewarmOrgScopedRemoteConfig(orgId, orgEmail || undefined);
          let didSave = false;
          const registry = await fetchOrgRegistryEntry(orgId);
          if (registry.ok && registry.entry) {
            const entry = registry.entry;
            await ensureChairAccountFromRegistry({
              chairName: entry.chair.name,
              chairEmail: entry.chair.email,
              chairPhone: entry.chair.phone,
              chairPassword: entry.chair.password,
            });
            settings = {
              ...settings,
              orgId,
              orgEmail: orgEmail || entry.org.email || settings.orgEmail,
              orgPhone: entry.org.phone || settings.orgPhone,
              orgName: entry.org.name || settings.orgName,
              orgSetupAt: settings.orgSetupAt || new Date().toISOString(),
              orgSetupCompleted: true,
              cloudSyncEndpoint: entry.technical.managed_cloud_sync_endpoint || settings.cloudSyncEndpoint,
              cloudSyncEnabled: entry.technical.managed_cloud_sync_enabled ?? settings.cloudSyncEnabled,
              cloudSyncProvider: "google_drive_apps_script",
              cloudSyncApiKey: entry.technical.managed_cloud_sync_api_key || settings.cloudSyncApiKey,
              cloudSyncGoogleAccountEmail: entry.technical.managed_cloud_sync_account_email || settings.cloudSyncGoogleAccountEmail,
              cloudSyncFolderName: entry.technical.managed_cloud_sync_folder_name || settings.cloudSyncFolderName,
            };
            await saveAccountSettings(settings);
            didSave = true;
          }
          if (!didSave && orgId !== String(settings.orgId || "").trim()) {
            settings = {
              ...settings,
              orgId,
              orgEmail: orgEmail || settings.orgEmail,
              orgSetupAt: settings.orgSetupAt || new Date().toISOString(),
              orgSetupCompleted: true,
            };
            await saveAccountSettings(settings);
            if (Platform.OS === "web" && typeof window !== "undefined") {
              try {
                const reloadKey = "@orghub_force_org_reload";
                const last = window.localStorage?.getItem(reloadKey) || "";
                if (last !== orgId) {
                  window.localStorage?.setItem(reloadKey, orgId);
                  window.sessionStorage?.setItem("@orghub_last_connected_org_id", orgId);
                  window.location.reload();
                  return;
                }
              } catch {}
            }
          }
        }
        await refreshData({ skipPull: true, markLocalMutation: false });
        if (Platform.OS === "web" && typeof window !== "undefined") {
          try {
            window.localStorage?.removeItem("@orghub_force_org_reload");
          } catch {}
        }
      } catch {
        // ignore
      } finally {
        if (active) setOrgHydrating(false);
      }
    };
    void hydrateOrgContext();
    return () => {
      active = false;
    };
  }, [params?.orgConnect, params?.orgId, refreshData]);

  const handleSignIn = async () => {
    if (!canSubmit) return;
    const usernameCheck = await validateUsername();
    if (!usernameCheck.ok) {
      setPasswordTouched(false);
      setPasswordValid(null);
      if (usernameCheck.message) {
        Alert.alert("ဝင်ရောက်ခွင့်မရှိပါ", usernameCheck.message);
      } else {
        Alert.alert("Username မမှန်ကန်ပါ", "သတ်မှတ်ထားသော username ကို မှန်ကန်စွာထည့်ပါ။");
      }
      return;
    }
    setIsSigningIn(true);
    try {
      const result = await attemptLogin(username.trim(), password.trim());
      if (result.ok) {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          try {
            window.sessionStorage?.removeItem("@orghub_org_connect_override");
            window.localStorage?.removeItem("@orghub_org_connect_override");
          } catch {}
        }
        router.replace("/" as any);
      } else if (result.reason === "license_denied") {
        const expiry = String((result as any).licenseExpiry || "").trim();
        const status = String((result as any).licenseStatus || "").trim();
        const reason = String((result as any).licenseReason || "").trim();
        const parts = [
          "Organization license is not active.",
          status ? `Status: ${status}` : "",
          expiry ? `Expiry: ${expiry}` : "",
          reason ? `Reason: ${reason}` : "",
        ].filter(Boolean);
        Alert.alert("License Blocked", parts.join("\n"));
      } else if (result.reason === "locked") {
        const remaining = result.remainingMs || 0;
        setLockRemainingMs(remaining);
        Alert.alert("ယာယီပိတ်ထားပါသည်", `Login အကြိမ်ကြိမ်မှားနေသောကြောင့် ${Math.ceil(remaining / 60000)} မိနစ်ခန့် ထပ်မံကြိုးစားခွင့်ပိတ်ထားပါသည်။`);
      } else if (result.reason === "invalid_username") {
        setUsernameTouched(true);
        setUsernameValid(false);
        setPasswordTouched(false);
        setPasswordValid(null);
        Alert.alert("Username မမှန်ကန်ပါ", "User account ကိုမတွေ့ပါ။");
      } else if (result.reason === "inactive_member") {
        setPasswordTouched(false);
        setPasswordValid(null);
        const statusLabel = String(result.memberStatusLabel || "").trim();
        const name = String(result.memberName || username || "ဤအသင်းဝင်").trim();
        const statusSentence = INACTIVE_STATUS_SENTENCE[statusLabel] || `${statusLabel} ဖြစ်ပါသည်။`;
        Alert.alert("ဝင်ရောက်ခွင့်မရှိပါ", `${name} သည် ${statusSentence} ${LOGIN_DENIED_SUFFIX}`);
      } else if (result.reason === "admin_login_only") {
        setUsernameTouched(true);
        setUsernameValid(false);
        setPasswordTouched(false);
        setPasswordValid(null);
        Alert.alert("ဝင်ရောက်ခွင့်မရှိပါ", "Admin account အတွက် Admin Login စာမျက်နှာကို အသုံးပြုပါ။");
      } else {
        setPasswordTouched(true);
        setPasswordValid(false);
        Alert.alert("Password မမှန်ကန်ပါ", "Password ကိုပြန်စစ်ပြီး ထပ်မံကြိုးစားပါ။");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "အကောင့်ဝင်ရာတွင် ပြဿနာရှိနေပါသည်။");
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleForgotPassword = async () => {
    if (resettingForgot) return;
    if (!forgotIdentifier.trim()) {
      Alert.alert("လိုအပ်ချက်", "Member ID / Phone / Email တစ်ခုခု ထည့်ပါ။");
      return;
    }

    setResettingForgot(true);
    try {
      const result = await resetPassword(forgotIdentifier.trim());
      if (!result.ok) {
        Alert.alert("မတွေ့ပါ", "ဖော်ပြထားသည့် user ကိုမတွေ့ပါ သို့မဟုတ် reset မအောင်မြင်ပါ။");
        return;
      }

      const targetUserId = String(result.userId || "").trim();
      const targetName = String(result.displayName || targetUserId || "-").trim();
      const targetPhone = String(result.phone || "").trim();
      const targetEmail = String(result.email || "").trim();
      const issuedPassword = String(result.password || "").trim();
      const messageBody =
        `Password Reset အသိပေးချက်\n` +
        `Username: ${targetUserId}\n` +
        `Temporary Password: ${issuedPassword}\n` +
        `Login ဝင်ပြီးနောက် ကိုယ်ပိုင် Password ကို ချက်ချင်းပြောင်းပါ။`;

      let emailSent = false;
      if (Platform.OS !== "web") {
        if (targetEmail) {
          try {
            await Linking.openURL(
              `mailto:${targetEmail}?subject=${encodeURIComponent("Password Reset")}&body=${encodeURIComponent(messageBody)}`
            );
            emailSent = true;
          } catch {
            emailSent = false;
          }
        }
        if (!emailSent && targetPhone) {
          try {
            const separator = Platform.OS === "ios" ? "&" : "?";
            await Linking.openURL(`sms:${targetPhone}${separator}body=${encodeURIComponent(messageBody)}`);
          } catch {
            // ignore
          }
        }
      }

      const actionButtons: any[] = [
        {
          text: "Copy",
          onPress: async () => {
            const Clipboard = await import("expo-clipboard");
            await Clipboard.setStringAsync(messageBody);
          },
        },
      ];
      if (targetEmail) {
        actionButtons.push({
          text: "Email ပို့မည်",
          onPress: () => {
            void Linking.openURL(
              `mailto:${targetEmail}?subject=${encodeURIComponent("Password Reset")}&body=${encodeURIComponent(messageBody)}`
            ).catch(() => {
              Alert.alert("မအောင်မြင်ပါ", "Email app မဖွင့်နိုင်ပါ။");
            });
          },
        });
      }
      if (targetPhone) {
        actionButtons.push({
          text: "SMS ပို့မည်",
          onPress: () => {
            const separator = Platform.OS === "ios" ? "&" : "?";
            void Linking.openURL(`sms:${targetPhone}${separator}body=${encodeURIComponent(messageBody)}`).catch(() => {
              Alert.alert("မအောင်မြင်ပါ", "Phone Message app မဖွင့်နိုင်ပါ။");
            });
          },
        });
      }

      Alert.alert(
        "Reset ပြီးပါပြီ",
        `${targetName} အတွက် password အသစ်သတ်မှတ်ပြီးပါပြီ။\n\nUsername: ${targetUserId}\nTemporary Password: ${issuedPassword}`,
        [...actionButtons, { text: "ပိတ်မည်", style: "cancel" }]
      );

      setShowForgotModal(false);
      setForgotIdentifier("");
    } finally {
      setResettingForgot(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={["#0F766E", "#115E59"]} style={styles.heroCard}>
            <View style={styles.logoContainer}>
              <Image source={require("../assets/images/icon.png")} style={styles.logoImage} />
            </View>
            <Text style={styles.appName}>Social Org Manager</Text>
            <Text style={styles.title}>User Login</Text>
            <Text style={styles.subtitle}>လုံခြုံစွာ ဝင်ရောက်ရန် Username နှင့် Password ဖြည့်ပါ။</Text>
            <Text style={styles.versionText}>Version {appVersion}</Text>
          </LinearGradient>

          <View style={styles.formCard}>
            {orgHydrating ? (
              <View style={styles.orgHydrateBanner}>
                <Text style={styles.orgHydrateText}>ORG ချိတ်ဆက်မှုကို ပြန်စစ်ဆေးနေပါသည်… ခဏစောင့်ပါ။</Text>
              </View>
            ) : null}
            <Text style={styles.label}>Username</Text>
            <TextInput
              value={username}
              onChangeText={(value) => {
                setUsername(value);
                setUsernameTouched(false);
                setUsernameValid(null);
                setUsernameStatusMessage("");
              }}
              placeholder="Username"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              onBlur={() => {
                void validateUsername();
              }}
              style={styles.input}
            />
            {checkingUsername ? <Text style={styles.helperText}>Username စစ်ဆေးနေပါသည်...</Text> : null}
            {!checkingUsername && usernameTouched && usernameValid === false ? (
              <Text style={styles.errorText}>{usernameStatusMessage || "Username မမှန်ကန်ပါ။"}</Text>
            ) : null}
            {!checkingUsername && usernameTouched && usernameValid === true ? (
              <Text style={styles.successText}>Username မှန်ကန်ပါသည်။</Text>
            ) : null}

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                ref={passwordInputRef}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setPasswordTouched(false);
                  setPasswordValid(null);
                }}
                placeholder="Password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  void handleSignIn();
                }}
                style={styles.passwordInput}
              />
              <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            {passwordTouched && passwordValid === false ? (
              <Text style={styles.errorText}>Password မမှန်ကန်ပါ။</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.submitButton, !canSubmit && styles.submitDisabled]}
              onPress={handleSignIn}
              disabled={!canSubmit}
            >
              <Text style={styles.submitText}>{isSigningIn ? "Logging in..." : "Login"}</Text>
            </TouchableOpacity>
            <Pressable style={styles.forgotBtn} onPress={() => setShowForgotModal(true)}>
              <Text style={styles.forgotBtnText}>Password မေ့နေပါသလား?</Text>
            </Pressable>
            <Pressable style={styles.adminLoginBtn} onPress={() => router.push("/admin-sign-in" as any)}>
              <Text style={styles.adminLoginBtnText}>System Admin Login</Text>
            </Pressable>
            {lockRemainingMs > 0 ? (
              <Text style={styles.lockText}>ယာယီပိတ်ထားပါသည်။ ထပ်မံကြိုးစားရန် ကျန်ချိန်: {lockMessage}</Text>
            ) : null}

            <View style={styles.guideCard}>
              <Text style={styles.guideTitle}>App အသုံးပြုနည်း</Text>
              <Text style={styles.guideText}>
                Login, Dashboard, Members, Finance, Sync/Backup စသည့် အဓိက feature များကို Read More... မှာ အသေးစိတ်ကြည့်နိုင်ပါသည်။
              </Text>
              {!showFullGuide ? (
                <TouchableOpacity style={styles.guideToggleBtn} onPress={() => setShowFullGuide(true)}>
                  <Text style={styles.guideToggleText}>Read More...</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={styles.guideSectionTitle}>1) Login / Account</Text>
                  <Text style={styles.guideText}>1.1 အဖွဲ့အစည်းမှ သတ်မှတ်ထားသော Username ဖြင့် ဝင်ရောက်ပါ။</Text>
                  <Text style={styles.guideText}>1.2 Member Status သည် Active မဟုတ်ပါက Login ဝင်ခွင့်မရှိပါ။</Text>
                  <Text style={styles.guideText}>1.3 Password မေ့လျှင် Account Settings မှ Reset workflow ကိုအသုံးပြုပါ။</Text>

                  <Text style={styles.guideSectionTitle}>2) Dashboard</Text>
                  <Text style={styles.guideText}>2.1 အသင်းဝင်, ငွေစာရင်း, ချေးငွေ, Event နှင့် Message အနှစ်ချုပ်ကို Dashboard တွင်ကြည့်နိုင်ပါသည်။</Text>
                  <Text style={styles.guideText}>2.2 အမြန်လုပ်ဆောင်ချက်များမှ Sync Now, Messages, သတင်းပို့ရန်, ငွေတောင်းခံရန် စသည့်ခလုတ်များကိုနှိပ်ပြီး တိုက်ရိုက်ဝင်ရောက်နိုင်ပါသည်။</Text>

                  <Text style={styles.guideSectionTitle}>3) Members</Text>
                  <Text style={styles.guideText}>3.1 Member စာရင်းတွင် အခြေခံအချက်အလက်များကြည့်ရှုနိုင်ပြီး မိမိ profile ကိုပြင်ဆင်နိုင်ပါသည်။</Text>
                  <Text style={styles.guideText}>3.2 Profile Photo, Occupation နှင့် Family Member အချက်အလက်များကိုဖြည့်သွင်းနိုင်ပါသည်။</Text>
                  <Text style={styles.guideText}>3.3 MemberID / Position / Status / Status Date ပြင်ဆင်မှုများသည် လုပ်ပိုင်ခွင့်အလိုက် approval flow ဖြင့်ဆောင်ရွက်ပါသည်။</Text>

                  <Text style={styles.guideSectionTitle}>4) Events / News</Text>
                  <Text style={styles.guideText}>4.1 သတင်းပို့ရန်ကိုနှိပ်လျှင် Events Page သို့ဝင်ပြီး Event အသစ်တင်နိုင်ပါသည်။</Text>
                  <Text style={styles.guideText}>4.2 Event တိုင်းတွင် read status, reactions, comments, replies နှင့် mentions အသိပေးချက်များရရှိနိုင်ပါသည်။</Text>

                  <Text style={styles.guideSectionTitle}>5) Finance / Payments</Text>
                  <Text style={styles.guideText}>5.1 လစဉ်ကြေး, လှူဒါန်းငွေ, ချေးငွေဆပ်, အတိုးဆပ် စသည့် payment request များကို category ချိတ်ဆက်ပြီး အသုံးပြုနိုင်ပါသည်။</Text>
                  <Text style={styles.guideText}>5.2 ပြေစာပုံတင်ခြင်း, Wallet App ဖွင့်ခြင်း နှင့် ဘဏ္ဍာရေးမှူးစစ်ဆေးအတည်ပြုပြီးမှ ရငွေစာရင်းသို့သွင်းသည့် workflow ကိုအသုံးပြုပါ။</Text>

                  <Text style={styles.guideSectionTitle}>6) Messages</Text>
                  <Text style={styles.guideText}>6.1 Member အချင်းချင်း chat, group chat, image ပို့ခြင်းများလုပ်နိုင်ပါသည်။</Text>
                  <Text style={styles.guideText}>6.2 Mention/tag reply များအတွက် notification badge နှင့် unread count ကိုတွေ့ရပါမည်။</Text>

                  <Text style={styles.guideSectionTitle}>7) Sync / Backup / Restore</Text>
                  <Text style={styles.guideText}>7.1 Sync Now ကိုနှိပ်လျှင် LAN Pull/Push + Cloud Pull/Push ကိုအလိုအလျောက်လုပ်ဆောင်ပါသည် (Enable လုပ်ထားသည့် setting အလိုက်)။</Text>
                  <Text style={styles.guideText}>7.2 Backup/Restore တွင် Member, Events, Finance, Chat နှင့် Settings အချက်အလက်များအပါအဝင် စနစ်တကျသိမ်းဆည်း/ပြန်လည်ထည့်သွင်းနိုင်ပါသည်။</Text>

                  <Text style={styles.guideSectionTitle}>8) App Update</Text>
                  <Text style={styles.guideText}>8.1 App ဖွင့်ချိန်တွင် update ရှိ/မရှိကိုအလိုအလျောက်စစ်ပါသည်။</Text>
                  <Text style={styles.guideText}>8.2 Update ရှိပါက Update Now နှိပ်ပြီး APK auto-download နှင့် install prompt ဖြင့် update ဆက်လုပ်နိုင်ပါသည်။</Text>

                  <Text style={styles.guideSectionTitle}>9) Security</Text>
                  <Text style={styles.guideText}>9.1 အချိန်ကာလတစ်ခု မအသုံးပြုပါက auto logout ဖြစ်နိုင်ပြီး refresh/open ပြုလုပ်သည့်အခြေအနေတွင် session policy အတိုင်းလုပ်ဆောင်ပါသည်။</Text>
                  <Text style={styles.guideText}>9.2 မိမိ account အချက်အလက်များကို logout မထွက်မချင်း ကာကွယ်အသုံးပြုရန်အကြံပြုပါသည်။</Text>
                  <TouchableOpacity style={styles.guideToggleBtn} onPress={() => setShowFullGuide(false)}>
                    <Text style={styles.guideToggleText}>Show Less</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
          <Modal
            visible={showForgotModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowForgotModal(false)}
          >
            <View style={styles.modalOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowForgotModal(false)} />
              <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                <Text style={styles.modalTitle}>Password ပြန်လည်သတ်မှတ်ရန်</Text>
                <Text style={styles.modalDesc}>Member ID / Phone / Email ဖြင့် အတည်ပြုပါ။</Text>
                <TextInput
                  style={styles.modalInput}
                  value={forgotIdentifier}
                  onChangeText={setForgotIdentifier}
                  placeholder="ဥပမာ - ID001 / 09xxxxxxxxx / user@mail.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.modalActions}>
                  <Pressable style={styles.modalCancelBtn} onPress={() => setShowForgotModal(false)}>
                    <Text style={styles.modalCancelText}>ပိတ်မည်</Text>
                  </Pressable>
                  <Pressable style={styles.modalConfirmBtn} onPress={handleForgotPassword} disabled={resettingForgot}>
                    <Text style={styles.modalConfirmText}>{resettingForgot ? "လုပ်ဆောင်နေသည်..." : "Reset"}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
          <View style={styles.ownerFooter}>
            <Text style={styles.ownerFooterText}>Project Owner & Developer: MR. SOE MYINT SWE</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ECFDF5" },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 18, justifyContent: "center" },
  heroCard: { borderRadius: 20, padding: 22, marginBottom: 16 },
  logoContainer: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    overflow: "hidden",
  },
  logoImage: { width: 48, height: 48, borderRadius: 24 },
  appName: { color: "rgba(255,255,255,0.9)", fontSize: 14, marginBottom: 4 },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 19 },
  versionText: { color: "rgba(255,255,255,0.95)", fontSize: 12, marginTop: 10, fontWeight: "600" },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  label: { fontSize: 13, color: "#334155", fontWeight: "600", marginBottom: 8, marginTop: 6 },
  input: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0F172A",
  },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    overflow: "hidden",
  },
  passwordInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A" },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  submitButton: {
    marginTop: 16,
    backgroundColor: "#0F766E",
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 13,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  forgotBtn: { marginTop: 10, alignItems: "center" },
  forgotBtnText: { color: "#0F766E", fontSize: 13, fontWeight: "600" },
  adminLoginBtn: { marginTop: 8, alignItems: "center" },
  adminLoginBtnText: { color: "#0369A1", fontSize: 13, fontWeight: "700" },
  helperText: { marginTop: 6, color: "#64748B", fontSize: 12 },
  errorText: { marginTop: 6, color: "#DC2626", fontSize: 12, fontWeight: "600" },
  successText: { marginTop: 6, color: "#059669", fontSize: 12, fontWeight: "600" },
  lockText: { marginTop: 10, color: "#B45309", fontSize: 12, fontWeight: "600", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalContent: { width: "100%", maxWidth: 420, backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A", marginBottom: 6 },
  modalDesc: { fontSize: 12, color: "#475569", marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  modalCancelBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  modalCancelText: { color: "#64748B", fontWeight: "600" },
  modalConfirmBtn: { backgroundColor: "#0F766E", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  modalConfirmText: { color: "#fff", fontWeight: "700" },
  guideCard: { marginTop: 12, borderRadius: 12, padding: 12, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#CBD5E1" },
  guideTitle: { color: "#0F172A", fontWeight: "700", marginBottom: 6, fontSize: 13 },
  guideSectionTitle: { color: "#0F172A", fontWeight: "700", marginTop: 8, marginBottom: 4, fontSize: 12 },
  guideText: { color: "#334155", fontSize: 12, lineHeight: 18 },
  guideToggleBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#99F6E4",
    backgroundColor: "#F0FDFA",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  guideToggleText: { color: "#0F766E", fontSize: 12, fontWeight: "700" },
  ownerFooter: {
    marginTop: 12,
    alignItems: "center",
  },
  ownerFooterText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});

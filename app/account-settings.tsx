import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import {
  checkLanSyncHealth,
  pullLanSnapshotToLocalDetailed,
  pushLanSnapshotFromLocalDetailed,
} from "@/lib/storage";

const DEFAULT_LAN_SYNC_URL = "http://192.168.99.9:5000";

export default function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { accountSettings, updateAccountSettings, refreshData } = useData();
  const { can, currentUser, verifyCurrentPassword, changePassword, resetPassword } = useAuth();
  const canManageSystem = can("system.manage");
  
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
  const [changingPassword, setChangingPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [syncServerUrl, setSyncServerUrl] = useState(accountSettings.syncServerUrl || DEFAULT_LAN_SYNC_URL);
  const [syncEnabled, setSyncEnabled] = useState(accountSettings.syncEnabled !== false);
  const [receivingBankName, setReceivingBankName] = useState(accountSettings.receivingBankName || "");
  const [receivingBankAccountNumber, setReceivingBankAccountNumber] = useState(accountSettings.receivingBankAccountNumber || "");
  const [receivingBankAccountName, setReceivingBankAccountName] = useState(accountSettings.receivingBankAccountName || "");
  const [receivingKbzPayPhone, setReceivingKbzPayPhone] = useState(accountSettings.receivingKbzPayPhone || "");
  const [receivingKbzPayAccountName, setReceivingKbzPayAccountName] = useState(accountSettings.receivingKbzPayAccountName || "");
  const [receivingWavePayPhone, setReceivingWavePayPhone] = useState(accountSettings.receivingWavePayPhone || "");
  const [receivingWavePayAccountName, setReceivingWavePayAccountName] = useState(accountSettings.receivingWavePayAccountName || "");
  const [receivingAyaPayPhone, setReceivingAyaPayPhone] = useState(accountSettings.receivingAyaPayPhone || "");
  const [receivingAyaPayAccountName, setReceivingAyaPayAccountName] = useState(accountSettings.receivingAyaPayAccountName || "");
  const [syncing, setSyncing] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const normalizeUrl = (raw: string): string => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    return withProtocol.replace(/\/+$/, "");
  };

  React.useEffect(() => {
    setSyncServerUrl(accountSettings.syncServerUrl || DEFAULT_LAN_SYNC_URL);
    setSyncEnabled(accountSettings.syncEnabled !== false);
    setReceivingBankName(accountSettings.receivingBankName || "");
    setReceivingBankAccountNumber(accountSettings.receivingBankAccountNumber || "");
    setReceivingBankAccountName(accountSettings.receivingBankAccountName || "");
    setReceivingKbzPayPhone(accountSettings.receivingKbzPayPhone || "");
    setReceivingKbzPayAccountName(accountSettings.receivingKbzPayAccountName || "");
    setReceivingWavePayPhone(accountSettings.receivingWavePayPhone || "");
    setReceivingWavePayAccountName(accountSettings.receivingWavePayAccountName || "");
    setReceivingAyaPayPhone(accountSettings.receivingAyaPayPhone || "");
    setReceivingAyaPayAccountName(accountSettings.receivingAyaPayAccountName || "");
  }, [
    accountSettings.syncServerUrl,
    accountSettings.syncEnabled,
    accountSettings.receivingBankName,
    accountSettings.receivingBankAccountNumber,
    accountSettings.receivingBankAccountName,
    accountSettings.receivingKbzPayPhone,
    accountSettings.receivingKbzPayAccountName,
    accountSettings.receivingWavePayPhone,
    accountSettings.receivingWavePayAccountName,
    accountSettings.receivingAyaPayPhone,
    accountSettings.receivingAyaPayAccountName,
  ]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const normalizedUrl = normalizeUrl(syncServerUrl || DEFAULT_LAN_SYNC_URL);
      await updateAccountSettings({
        ...accountSettings,
        openingBalanceCash: accountSettings.openingBalanceCash,
        openingBalanceBank: accountSettings.openingBalanceBank,
        currency: accountSettings.currency || "MMK",
        syncServerUrl: normalizedUrl,
        syncEnabled,
        receivingBankName: receivingBankName.trim(),
        receivingBankAccountNumber: receivingBankAccountNumber.trim(),
        receivingBankAccountName: receivingBankAccountName.trim(),
        receivingKbzPayPhone: receivingKbzPayPhone.trim(),
        receivingKbzPayAccountName: receivingKbzPayAccountName.trim(),
        receivingWavePayPhone: receivingWavePayPhone.trim(),
        receivingWavePayAccountName: receivingWavePayAccountName.trim(),
        receivingAyaPayPhone: receivingAyaPayPhone.trim(),
        receivingAyaPayAccountName: receivingAyaPayAccountName.trim(),
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

    setResettingPassword(true);
    try {
      const ok = await resetPassword(resetIdentifier.trim());
      if (!ok) {
        Alert.alert("မတွေ့ပါ", "ဖော်ပြထားသည့် user ကိုမတွေ့ပါ သို့မဟုတ် reset မအောင်မြင်ပါ။");
        return;
      }
      Alert.alert("Reset ပြီးပါပြီ", "Target account အတွက် default password သို့ပြန်ထားပြီးပါပြီ။");
      setResetIdentifier("");
    } finally {
      setResettingPassword(false);
    }
  };

  const handleSyncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const normalizedUrl = normalizeUrl(syncServerUrl || DEFAULT_LAN_SYNC_URL);
      await updateAccountSettings({
        ...accountSettings,
        openingBalanceCash: accountSettings.openingBalanceCash,
        openingBalanceBank: accountSettings.openingBalanceBank,
        currency: accountSettings.currency || "MMK",
        syncServerUrl: normalizedUrl,
        syncEnabled,
        receivingBankName: receivingBankName.trim(),
        receivingBankAccountNumber: receivingBankAccountNumber.trim(),
        receivingBankAccountName: receivingBankAccountName.trim(),
        receivingKbzPayPhone: receivingKbzPayPhone.trim(),
        receivingKbzPayAccountName: receivingKbzPayAccountName.trim(),
        receivingWavePayPhone: receivingWavePayPhone.trim(),
        receivingWavePayAccountName: receivingWavePayAccountName.trim(),
        receivingAyaPayPhone: receivingAyaPayPhone.trim(),
        receivingAyaPayAccountName: receivingAyaPayAccountName.trim(),
      });
      if (syncEnabled && normalizedUrl) {
        const health = await checkLanSyncHealth();
        if (!health.ok) {
          Alert.alert(
            "Sync Error",
            `Server မချိတ်ဆက်နိုင်ပါ\nURL: ${normalizedUrl}\nReason: ${health.reason || "unknown"}${health.status ? ` (${health.status})` : ""}\n\nComputer server run နေ/မနေ၊ Phone/Computer Wi-Fi တူ/မတူ၊ firewall ကို စစ်ပါ။`
          );
          return;
        }        
      }
      const pull = await pullLanSnapshotToLocalDetailed();

      let pushLine = "Push: Skip";
      if (!pull.ok) {
        pushLine = "Push: Skip (pull fail)";
      } else {
        const push = await pushLanSnapshotFromLocalDetailed();
        pushLine = push.ok
          ? "Push: OK"
          : `Push: Fail (${push.reason || "unknown"}${push.status ? `/${push.status}` : ""})`;
      }

      const pullLine = pull.ok
        ? `Pull: ${pull.changed ? "OK" : `Skip (${pull.reason || "no_change"})`}`
        : `Pull: Fail (${pull.reason || "unknown"}${pull.status ? `/${pull.status}` : ""})`;

      await refreshData({ skipPull: true });
      Alert.alert("Sync", `${pullLine}\n${pushLine}`);
    } finally {
      setSyncing(false);
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
            <Ionicons name={syncEnabled ? "cloud-done" : "cloud-offline"} size={24} color={syncEnabled ? "#16A34A" : "#F59E0B"} />
          </View>
          <View style={styles.storageTextContainer}>
            <Text style={styles.storageTitle}>Storage: {syncEnabled ? "Online + Offline (LAN Sync)" : "Offline (Local)"}</Text>
            <Text style={styles.storageDesc}>
              LAN Sync URL သတ်မှတ်ပြီး Enable လုပ်ပါက Computer/Mobile တို့တွင် အချက်အလက်များ အလိုအလျောက်ညှိနှိုင်းသွားပါမည်။
            </Text>
          </View>
        </View>
        <Text style={styles.label}>LAN Sync Server URL</Text>
        <TextInput
          style={styles.input}
          value={syncServerUrl}
          onChangeText={setSyncServerUrl}
          placeholder="ဥပမာ - http://192.168.1.100:5000"
          autoCapitalize="none"
        />
        <View style={styles.syncRow}>
          <Pressable style={[styles.syncToggleBtn, syncEnabled && styles.syncToggleBtnActive]} onPress={() => setSyncEnabled((v) => !v)}>
            <Ionicons name={syncEnabled ? "checkmark-circle" : "ellipse-outline"} size={18} color={syncEnabled ? "#fff" : Colors.light.text} />
            <Text style={[styles.syncToggleText, syncEnabled && styles.syncToggleTextActive]}>
              {syncEnabled ? "LAN Sync Enabled" : "LAN Sync Disabled"}
            </Text>
          </Pressable>
          <Pressable style={styles.syncNowBtn} onPress={() => void handleSyncNow()} disabled={syncing}>
            <Text style={styles.syncNowText}>{syncing ? "Syncing..." : "Sync Now"}</Text>
          </Pressable>
        </View>

        <View style={styles.securityCard}>
          <Text style={styles.sectionTitle}>Payment Receiving Accounts</Text>
          <Text style={styles.sectionDesc}>
            ဘဏ္ဍာရေးမှူး လက်ခံမည့် Bank နှင့် Mobile Wallet အကောင့်များကို သတ်မှတ်ပါ။
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

          <Text style={styles.label}>Wave Pay Phone</Text>
          <TextInput style={styles.input} value={receivingWavePayPhone} onChangeText={setReceivingWavePayPhone} placeholder="09xxxxxxxxx" keyboardType="phone-pad" />
          <Text style={styles.label}>Wave Pay Account Name</Text>
          <TextInput style={styles.input} value={receivingWavePayAccountName} onChangeText={setReceivingWavePayAccountName} placeholder="Account Name" />

          <Text style={styles.label}>AYA Pay Phone</Text>
          <TextInput style={styles.input} value={receivingAyaPayPhone} onChangeText={setReceivingAyaPayPhone} placeholder="09xxxxxxxxx" keyboardType="phone-pad" />
          <Text style={styles.label}>AYA Pay Account Name</Text>
          <TextInput style={styles.input} value={receivingAyaPayAccountName} onChangeText={setReceivingAyaPayAccountName} placeholder="Account Name" />
        </View>

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
              Member ID / ID### / Phone / Email / Admin ဖြင့် user ကိုရှာပြီး default password သို့ reset လုပ်နိုင်ပါသည်။
            </Text>

            <TextInput
              style={styles.input}
              value={resetIdentifier}
              onChangeText={setResetIdentifier}
              placeholder="ဥပမာ - ရဆသ-001 / ID001 / 09xxxxxxxxx / user@mail.com / Admin"
            />

            <Pressable style={styles.adminResetBtn} onPress={handleAdminReset} disabled={resettingPassword}>
              <Text style={styles.passwordBtnText}>{resettingPassword ? "Resetting..." : "Reset Password to Default"}</Text>
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
    justifyContent: "center",
    alignItems: "center",
  },
  syncNowText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
});

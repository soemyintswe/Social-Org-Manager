import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AccessDenied from "../components/AccessDenied";
import Colors from "../constants/colors";
import { useAuth } from "../lib/AuthContext";
import { useData } from "../lib/DataContext";
import { setUserPassword } from "../lib/storage-service";
import type { AdminAccountStatus, UserAccount } from "../lib/types";

type AdminFormState = {
  loginId: string;
  displayName: string;
  email: string;
  phone: string;
  address: string;
  appointedAt: string;
  status: AdminAccountStatus;
  statusNote: string;
  password: string;
  confirmPassword: string;
};

const STATUS_OPTIONS: { value: AdminAccountStatus; label: string; color: string; bg: string }[] = [
  { value: "active", label: "လက်ရှိ", color: "#166534", bg: "#DCFCE7" },
  { value: "suspended", label: "ရပ်ဆိုင်း", color: "#92400E", bg: "#FEF3C7" },
  { value: "terminated", label: "ထုတ်ပယ်", color: "#991B1B", bg: "#FEE2E2" },
];

function normalizeLoginId(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

function normalizeOptional(raw: string): string | undefined {
  const value = String(raw || "").trim();
  return value ? value : undefined;
}

function resolveAdminStatus(user?: Partial<UserAccount> | null): AdminAccountStatus {
  const raw = String(user?.adminStatus || "").trim().toLowerCase();
  if (raw === "terminated") return "terminated";
  if (raw === "suspended") return "suspended";
  if (raw === "active") return "active";
  return user?.isActive ? "active" : "suspended";
}

function statusMeta(status: AdminAccountStatus) {
  return STATUS_OPTIONS.find((row) => row.value === status) || STATUS_OPTIONS[0];
}

function formatDateLabel(raw?: string | null): string {
  const value = String(raw || "").trim();
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildEmptyForm(): AdminFormState {
  return {
    loginId: "",
    displayName: "",
    email: "",
    phone: "",
    address: "",
    appointedAt: "",
    status: "active",
    statusNote: "",
    password: "",
    confirmPassword: "",
  };
}

function initialsFor(user: Pick<UserAccount, "displayName" | "id">): string {
  const source = String(user.displayName || user.id || "").trim();
  if (!source) return "A";
  const chunks = source.split(/\s+/).filter(Boolean);
  if (chunks.length === 1) return chunks[0].slice(0, 2).toUpperCase();
  return `${chunks[0][0] || ""}${chunks[1][0] || ""}`.toUpperCase();
}

export default function AdminUsersScreen() {
  const insets = useSafeAreaInsets();
  const { can, currentUser } = useAuth();
  const { users, upsertUserAccount, removeUserAccount } = useData() as any;
  const canManageSystem = can("system.manage");

  const [editingUserId, setEditingUserId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<AdminFormState>(buildEmptyForm());
  const [showFormPassword, setShowFormPassword] = React.useState(false);
  const [showFormConfirmPassword, setShowFormConfirmPassword] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [searchText, setSearchText] = React.useState("");
  const [statusChangingId, setStatusChangingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const [resetUserId, setResetUserId] = React.useState<string | null>(null);
  const [resetPassword, setResetPassword] = React.useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = React.useState("");
  const [showResetPassword, setShowResetPassword] = React.useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);

  const adminUsers = React.useMemo<UserAccount[]>(() => {
    const list = Array.isArray(users) ? users : [];
    return list
      .filter((user: UserAccount) => user?.systemRole === "admin")
      .slice()
      .sort((left, right) => {
        const leftName = String(left.displayName || left.id || "").toLowerCase();
        const rightName = String(right.displayName || right.id || "").toLowerCase();
        return leftName.localeCompare(rightName);
      });
  }, [users]);

  const filteredAdminUsers = React.useMemo(() => {
    const needle = normalizeLoginId(searchText);
    if (!needle) return adminUsers;
    return adminUsers.filter((user) => {
      const bag = [
        user.id,
        user.displayName,
        user.email,
        user.phone,
        user.address,
        user.statusNote,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return bag.includes(needle);
    });
  }, [adminUsers, searchText]);

  const activeAdminCount = React.useMemo(() => {
    return adminUsers.filter((user) => resolveAdminStatus(user) === "active").length;
  }, [adminUsers]);

  const handleStartCreate = () => {
    setEditingUserId(null);
    setForm(buildEmptyForm());
    setShowFormPassword(false);
    setShowFormConfirmPassword(false);
  };

  const handleStartEdit = (user: UserAccount) => {
    setEditingUserId(user.id);
    setForm({
      loginId: user.id,
      displayName: user.displayName || "",
      email: user.email || "",
      phone: user.phone || "",
      address: user.address || "",
      appointedAt: String(user.appointedAt || "").trim(),
      status: resolveAdminStatus(user),
      statusNote: String(user.statusNote || "").trim(),
      password: "",
      confirmPassword: "",
    });
    setShowFormPassword(false);
    setShowFormConfirmPassword(false);
  };

  const handleSave = async () => {
    if (!canManageSystem || saving) return;
    const normalizedId = normalizeLoginId(form.loginId);
    const creating = !editingUserId;

    if (!normalizedId) {
      Alert.alert("လိုအပ်ချက်", "Username / Email ကိုဖြည့်ပါ။");
      return;
    }
    if (!/^[a-z0-9._@-]+$/i.test(normalizedId)) {
      Alert.alert("မမှန်ကန်ပါ", "Username/Email တွင် a-z, 0-9 နှင့် . _ @ - သာသုံးပါ။");
      return;
    }
    if (creating && normalizedId === "admin") {
      Alert.alert("မပြုလုပ်နိုင်ပါ", "admin username ကို legacy account အတွက် reserved ထားပါသည်။");
      return;
    }
    if (form.appointedAt && !/^\d{4}-\d{2}-\d{2}$/.test(form.appointedAt.trim())) {
      Alert.alert("မမှန်ကန်ပါ", "ခန့်အပ်သည့်နေ့ကို YYYY-MM-DD ပုံစံဖြင့်ထည့်ပါ။");
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      Alert.alert("မမှန်ကန်ပါ", "Email format ကိုပြန်စစ်ပါ။");
      return;
    }

    const password = String(form.password || "").trim();
    const confirmPassword = String(form.confirmPassword || "").trim();
    if (creating && !password) {
      Alert.alert("လိုအပ်ချက်", "Password ကိုဖြည့်ပါ။");
      return;
    }
    if (password && password.length < 4) {
      Alert.alert("မမှန်ကန်ပါ", "Password အနည်းဆုံး ၄ လုံးထည့်ပါ။");
      return;
    }
    if (password && password !== confirmPassword) {
      Alert.alert("မမှန်ကန်ပါ", "Password နှင့် Confirm Password မတူညီပါ။");
      return;
    }

    const existingDuplicate = adminUsers.find(
      (user) => normalizeLoginId(user.id) === normalizedId && normalizeLoginId(user.id) !== normalizeLoginId(editingUserId || "")
    );
    if (existingDuplicate) {
      Alert.alert("ရှိပြီးသား", `${normalizedId} account ရှိပြီးသားဖြစ်နေပါသည်။`);
      return;
    }

    const existing = adminUsers.find((user) => normalizeLoginId(user.id) === normalizeLoginId(editingUserId || normalizedId));
    const now = new Date().toISOString();
    const nextUser: UserAccount = {
      ...(existing || {}),
      id: normalizedId,
      displayName: normalizeOptional(form.displayName) || normalizedId,
      systemRole: "admin",
      isActive: form.status === "active",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      email: normalizeOptional(form.email),
      phone: normalizeOptional(form.phone),
      address: normalizeOptional(form.address),
      appointedAt: normalizeOptional(form.appointedAt),
      statusNote: normalizeOptional(form.statusNote),
      adminStatus: form.status,
      lastPasswordResetAt: password ? now : existing?.lastPasswordResetAt,
    };

    try {
      setSaving(true);
      await upsertUserAccount(nextUser);
      if (password) {
        await setUserPassword(nextUser.id, password);
      }
      Alert.alert("အောင်မြင်ပါသည်", creating ? "Admin user ထည့်ပြီးပါပြီ။" : "Admin profile ကိုပြင်ဆင်ပြီးပါပြီ။");
      handleStartCreate();
    } catch {
      Alert.alert("အမှား", "Admin account သိမ်းဆည်းရာတွင် အမှားဖြစ်နေပါသည်။");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user: UserAccount) => {
    if (!canManageSystem || statusChangingId) return;
    const currentStatus = resolveAdminStatus(user);
    const nextStatus: AdminAccountStatus = currentStatus === "active" ? "suspended" : "active";
    try {
      setStatusChangingId(user.id);
      await upsertUserAccount({
        ...user,
        adminStatus: nextStatus,
        isActive: nextStatus === "active",
        updatedAt: new Date().toISOString(),
      });
      Alert.alert("အောင်မြင်ပါသည်", nextStatus === "active" ? "Admin account ကို ပြန်ဖွင့်ပြီးပါပြီ။" : "Admin account ကို ရပ်ဆိုင်းပြီးပါပြီ။");
    } catch {
      Alert.alert("အမှား", "Status ပြောင်းရာတွင် အမှားဖြစ်နေပါသည်။");
    } finally {
      setStatusChangingId(null);
    }
  };

  const confirmDelete = async (user: UserAccount): Promise<boolean> => {
    const text = `${user.id} account ကို ဖျက်မည်လား?`;
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
      return window.confirm(text);
    }
    return await new Promise<boolean>((resolve) => {
      Alert.alert("Admin ဖျက်မည်", text, [
        { text: "မဖျက်ပါ", style: "cancel", onPress: () => resolve(false) },
        { text: "ဖျက်မည်", style: "destructive", onPress: () => resolve(true) },
      ]);
    });
  };

  const handleDelete = async (user: UserAccount) => {
    if (!canManageSystem || deletingId) return;
    const targetId = normalizeLoginId(user.id);
    const myId = normalizeLoginId(String(currentUser?.id || ""));
    if (targetId === "admin") {
      Alert.alert("မပြုလုပ်နိုင်ပါ", "Legacy admin account ကို မဖျက်နိုင်ပါ။");
      return;
    }
    if (targetId === myId) {
      Alert.alert("မပြုလုပ်နိုင်ပါ", "လက်ရှိ login ဝင်ထားသော admin account ကို မဖျက်နိုင်ပါ။");
      return;
    }
    if (resolveAdminStatus(user) === "active" && activeAdminCount <= 1) {
      Alert.alert("မပြုလုပ်နိုင်ပါ", "အနည်းဆုံး active admin တစ်ဦးထားရန်လိုအပ်ပါသည်။");
      return;
    }
    const confirmed = await confirmDelete(user);
    if (!confirmed) return;

    try {
      setDeletingId(user.id);
      await removeUserAccount(user.id);
      Alert.alert("အောင်မြင်ပါသည်", "Admin account ကို ဖျက်ပြီးပါပြီ။");
    } catch {
      Alert.alert("အမှား", "Admin account ဖျက်ရာတွင် အမှားဖြစ်နေပါသည်။");
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenResetPassword = (userId: string) => {
    setResetUserId(userId);
    setResetPassword("");
    setResetConfirmPassword("");
    setShowResetPassword(false);
    setShowResetConfirmPassword(false);
  };

  const handleSubmitResetPassword = async () => {
    if (!resetUserId || resetting) return;
    const password = String(resetPassword || "").trim();
    const confirmPassword = String(resetConfirmPassword || "").trim();
    if (!password) {
      Alert.alert("လိုအပ်ချက်", "Reset password ကိုဖြည့်ပါ။");
      return;
    }
    if (password.length < 4) {
      Alert.alert("မမှန်ကန်ပါ", "Password အနည်းဆုံး ၄ လုံးထည့်ပါ။");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("မမှန်ကန်ပါ", "Password နှင့် Confirm Password မတူညီပါ။");
      return;
    }
    const targetUser = adminUsers.find((user) => normalizeLoginId(user.id) === normalizeLoginId(resetUserId));
    if (!targetUser) {
      Alert.alert("မတွေ့ပါ", "Admin user ကို မတွေ့ပါ။");
      return;
    }
    try {
      setResetting(true);
      const now = new Date().toISOString();
      await setUserPassword(targetUser.id, password);
      await upsertUserAccount({
        ...targetUser,
        updatedAt: now,
        lastPasswordResetAt: now,
      });
      Alert.alert("အောင်မြင်ပါသည်", "Password reset ပြုလုပ်ပြီးပါပြီ။");
      setResetUserId(null);
      setResetPassword("");
      setResetConfirmPassword("");
    } catch {
      Alert.alert("အမှား", "Password reset လုပ်ရာတွင် အမှားဖြစ်နေပါသည်။");
    } finally {
      setResetting(false);
    }
  };

  if (!canManageSystem || currentUser?.systemRole !== "admin") {
    return (
      <AccessDenied
        title="Admin User Management"
        message="ဤစာမျက်နှာကို System Admin များသာ စီမံနိုင်ပါသည်။"
      />
    );
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 16 }]}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(36, insets.bottom + 24) }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Admin User Management</Text>
      <Text style={styles.subtitle}>
        Admin profile များကို သီးခြားစီ စီမံနိုင်ပါသည်။ Status, contact info, password reset နှင့် account control များကိုတစ်နေရာတည်းမှာ စီမံနိုင်သည်။
      </Text>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={styles.cardTitle}>{editingUserId ? "Edit Admin Profile" : "Create Admin Profile"}</Text>
            <Text style={styles.cardHint}>Username/Email ဖြင့်ဝင်ရောက်ပြီး Profile အချက်အလက်များကို ထည့်သွင်းထားနိုင်သည်။</Text>
          </View>
          {editingUserId ? (
            <Pressable style={styles.ghostButton} onPress={handleStartCreate}>
              <Text style={styles.ghostButtonText}>အသစ်ထည့်ရန်</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.fieldLabel}>Username / Email</Text>
        <TextInput
          style={[styles.input, editingUserId ? styles.inputReadonly : null]}
          value={form.loginId}
          onChangeText={(value) => setForm((prev) => ({ ...prev, loginId: value }))}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!editingUserId}
          placeholder="admin2 or admin2@example.com"
        />
        {editingUserId ? <Text style={styles.helperText}>လက်ရှိ account username/email ကို ပြန်မပြောင်းရန် fix ထားသည်။</Text> : null}

        <Text style={styles.fieldLabel}>Display Name</Text>
        <TextInput
          style={styles.input}
          value={form.displayName}
          onChangeText={(value) => setForm((prev) => ({ ...prev, displayName: value }))}
          autoCapitalize="words"
          autoCorrect={false}
          placeholder="ဥပမာ - Central Admin (Finance)"
        />

        <View style={styles.rowTwo}>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={form.email}
              onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="admin@example.com"
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>ဖုန်းနံပါတ်</Text>
            <TextInput
              style={styles.input}
              value={form.phone}
              onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value }))}
              keyboardType="phone-pad"
              placeholder="09xxxxxxxxx"
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>လိပ်စာ</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={form.address}
          onChangeText={(value) => setForm((prev) => ({ ...prev, address: value }))}
          multiline
          placeholder="လိပ်စာ"
        />

        <View style={styles.rowTwo}>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>စတင်ခန့်သည့်နေ့ (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={form.appointedAt}
              onChangeText={(value) => setForm((prev) => ({ ...prev, appointedAt: value }))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="2026-04-27"
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>Account Status</Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((option) => {
                const selected = form.status === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.statusBtn, selected ? styles.statusBtnActive : null]}
                    onPress={() => setForm((prev) => ({ ...prev, status: option.value }))}
                  >
                    <Text style={[styles.statusBtnText, selected ? styles.statusBtnTextActive : null]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <Text style={styles.fieldLabel}>Status Note</Text>
        <TextInput
          style={styles.input}
          value={form.statusNote}
          onChangeText={(value) => setForm((prev) => ({ ...prev, statusNote: value }))}
          placeholder="Status note (optional)"
        />

        <Text style={styles.fieldLabel}>
          {editingUserId ? "Password (မပြောင်းဘဲထားနိုင်သည်)" : "Password"}
        </Text>
        <View style={styles.passwordWrap}>
          <TextInput
            style={styles.passwordInput}
            value={form.password}
            onChangeText={(value) => setForm((prev) => ({ ...prev, password: value }))}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showFormPassword}
            placeholder={editingUserId ? "အသစ်ပြောင်းမည်ဆိုရင်ထည့်ပါ" : "Admin password"}
          />
          <Pressable style={styles.eyeBtn} onPress={() => setShowFormPassword((prev) => !prev)}>
            <Ionicons name={showFormPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#64748B" />
            <Text style={styles.eyeText}>{showFormPassword ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>

        <Text style={styles.fieldLabel}>Confirm Password</Text>
        <View style={styles.passwordWrap}>
          <TextInput
            style={styles.passwordInput}
            value={form.confirmPassword}
            onChangeText={(value) => setForm((prev) => ({ ...prev, confirmPassword: value }))}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showFormConfirmPassword}
            placeholder="Confirm password"
          />
          <Pressable style={styles.eyeBtn} onPress={() => setShowFormConfirmPassword((prev) => !prev)}>
            <Ionicons name={showFormConfirmPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#64748B" />
            <Text style={styles.eyeText}>{showFormConfirmPassword ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>

        <Pressable style={[styles.primaryBtn, saving ? styles.disabled : null]} onPress={() => void handleSave()} disabled={saving}>
          <Text style={styles.primaryBtnText}>{saving ? "Saving..." : editingUserId ? "Update Admin Profile" : "Create Admin Profile"}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={styles.cardTitle}>Admin Profiles</Text>
            <Text style={styles.cardHint}>
              Active admin များကို share စီမံနိုင်ပြီး password reset, status control, profile update များပြုလုပ်နိုင်သည်။
            </Text>
          </View>
          <Pressable style={styles.ghostButton} onPress={() => router.push("/system" as any)}>
            <Text style={styles.ghostButtonText}>System Page</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Search by username, name, email, phone..."
        />

        <View style={[styles.profileCard, styles.legacyCard]}>
          <View style={styles.profileTop}>
            <View style={[styles.avatar, styles.avatarLegacy]}>
              <Text style={styles.avatarText}>SA</Text>
            </View>
            <View style={styles.profileMeta}>
              <Text style={styles.profileName}>System Legacy Admin</Text>
              <Text style={styles.profileId}>admin</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: "#DBEAFE" }]}>
              <Text style={[styles.statusPillText, { color: "#1E3A8A" }]}>Legacy</Text>
            </View>
          </View>
          <Text style={styles.legacyHint}>
            ဒီ account သည် legacy system account ဖြစ်ပြီး remove/edit မလုပ်နိုင်ပါ။ Password ပြောင်းလိုပါက Account Settings - Change Password ကိုသုံးပါ။
          </Text>
        </View>

        {filteredAdminUsers.length === 0 ? (
          <Text style={styles.emptyText}>Admin user မရှိသေးပါ။</Text>
        ) : (
          filteredAdminUsers.map((user) => {
            const status = resolveAdminStatus(user);
            const statusInfo = statusMeta(status);
            const isCurrentUser = normalizeLoginId(String(currentUser?.id || "")) === normalizeLoginId(user.id);
            const isProcessingStatus = statusChangingId === user.id;
            const isDeleting = deletingId === user.id;

            return (
              <View key={user.id} style={styles.profileCard}>
                <View style={styles.profileTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initialsFor(user)}</Text>
                  </View>
                  <View style={styles.profileMeta}>
                    <Text style={styles.profileName}>{user.displayName || user.id}</Text>
                    <Text style={styles.profileId}>{user.id}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: statusInfo.bg }]}>
                    <Text style={[styles.statusPillText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                  </View>
                </View>

                <View style={styles.infoGrid}>
                  <View style={styles.infoCell}>
                    <Text style={styles.infoLabel}>Email</Text>
                    <Text style={styles.infoValue}>{user.email || "-"}</Text>
                  </View>
                  <View style={styles.infoCell}>
                    <Text style={styles.infoLabel}>ဖုန်းနံပါတ်</Text>
                    <Text style={styles.infoValue}>{user.phone || "-"}</Text>
                  </View>
                  <View style={styles.infoCell}>
                    <Text style={styles.infoLabel}>ခန့်အပ်သည့်နေ့</Text>
                    <Text style={styles.infoValue}>{formatDateLabel(user.appointedAt || user.createdAt)}</Text>
                  </View>
                  <View style={styles.infoCell}>
                    <Text style={styles.infoLabel}>Password Reset</Text>
                    <Text style={styles.infoValue}>{formatDateLabel(user.lastPasswordResetAt)}</Text>
                  </View>
                </View>

                <Text style={styles.addressLabel}>လိပ်စာ</Text>
                <Text style={styles.addressValue}>{user.address || "-"}</Text>
                {user.statusNote ? (
                  <>
                    <Text style={styles.addressLabel}>Status Note</Text>
                    <Text style={styles.addressValue}>{user.statusNote}</Text>
                  </>
                ) : null}

                <View style={styles.actionRow}>
                  <Pressable style={styles.actionBtn} onPress={() => handleStartEdit(user)}>
                    <Text style={styles.actionBtnText}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.actionBtn} onPress={() => handleOpenResetPassword(user.id)}>
                    <Text style={styles.actionBtnText}>Reset Password</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, isProcessingStatus ? styles.disabled : null]}
                    onPress={() => void handleToggleStatus(user)}
                    disabled={isProcessingStatus}
                  >
                    <Text style={styles.actionBtnText}>
                      {isProcessingStatus ? "Processing..." : status === "active" ? "Suspend" : "Activate"}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtnDanger, (isDeleting || isCurrentUser) ? styles.disabled : null]}
                    onPress={() => void handleDelete(user)}
                    disabled={isDeleting || isCurrentUser}
                  >
                    <Text style={styles.actionBtnDangerText}>
                      {isDeleting ? "Removing..." : isCurrentUser ? "Current Account" : "Remove"}
                    </Text>
                  </Pressable>
                </View>

                {resetUserId === user.id ? (
                  <View style={styles.resetBox}>
                    <Text style={styles.resetTitle}>Reset Password: {user.id}</Text>
                    <View style={styles.passwordWrap}>
                      <TextInput
                        style={styles.passwordInput}
                        value={resetPassword}
                        onChangeText={setResetPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry={!showResetPassword}
                        placeholder="New password"
                      />
                      <Pressable style={styles.eyeBtn} onPress={() => setShowResetPassword((prev) => !prev)}>
                        <Ionicons name={showResetPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#64748B" />
                        <Text style={styles.eyeText}>{showResetPassword ? "Hide" : "Show"}</Text>
                      </Pressable>
                    </View>
                    <View style={styles.passwordWrap}>
                      <TextInput
                        style={styles.passwordInput}
                        value={resetConfirmPassword}
                        onChangeText={setResetConfirmPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry={!showResetConfirmPassword}
                        placeholder="Confirm new password"
                      />
                      <Pressable style={styles.eyeBtn} onPress={() => setShowResetConfirmPassword((prev) => !prev)}>
                        <Ionicons name={showResetConfirmPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#64748B" />
                        <Text style={styles.eyeText}>{showResetConfirmPassword ? "Hide" : "Show"}</Text>
                      </Pressable>
                    </View>
                    <View style={styles.resetActionRow}>
                      <Pressable style={styles.ghostButton} onPress={() => setResetUserId(null)}>
                        <Text style={styles.ghostButtonText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.primaryBtnSmall, resetting ? styles.disabled : null]}
                        onPress={() => void handleSubmitResetPassword()}
                        disabled={resetting}
                      >
                        <Text style={styles.primaryBtnText}>{resetting ? "Resetting..." : "Confirm Reset"}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    paddingHorizontal: 18,
    gap: 14,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 14,
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  cardHint: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    maxWidth: 760,
  },
  fieldLabel: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: Colors.light.text,
  },
  inputReadonly: {
    opacity: 0.7,
  },
  helperText: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  textarea: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  rowTwo: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  col: {
    flex: 1,
    minWidth: 220,
    gap: 4,
  },
  statusRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 2,
  },
  statusBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusBtnActive: {
    borderColor: Colors.light.tint,
    backgroundColor: "#E6F4F1",
  },
  statusBtnText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_600SemiBold",
  },
  statusBtnTextActive: {
    color: Colors.light.tint,
  },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    backgroundColor: Colors.light.background,
    overflow: "hidden",
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: Colors.light.text,
  },
  eyeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  eyeText: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_700Bold",
  },
  primaryBtn: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
  },
  primaryBtnSmall: {
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  ghostButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  ghostButtonText: {
    fontSize: 12,
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
  },
  disabled: {
    opacity: 0.55,
  },
  profileCard: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    padding: 12,
    gap: 8,
  },
  legacyCard: {
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  profileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#0EA5A4",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLegacy: {
    backgroundColor: "#2563EB",
  },
  avatarText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  profileMeta: {
    flex: 1,
  },
  profileName: {
    fontSize: 15,
    color: Colors.light.text,
    fontFamily: "Inter_700Bold",
  },
  profileId: {
    marginTop: 1,
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  infoCell: {
    minWidth: 150,
    flex: 1,
    gap: 2,
  },
  infoLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_600SemiBold",
  },
  infoValue: {
    fontSize: 13,
    color: Colors.light.text,
  },
  addressLabel: {
    marginTop: 2,
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_600SemiBold",
  },
  addressValue: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.light.text,
  },
  actionRow: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  actionBtnText: {
    fontSize: 12,
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
  },
  actionBtnDanger: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  actionBtnDangerText: {
    fontSize: 12,
    color: "#B91C1C",
    fontFamily: "Inter_700Bold",
  },
  resetBox: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BAE6FD",
    backgroundColor: "#ECFEFF",
    padding: 10,
    gap: 8,
  },
  resetTitle: {
    fontSize: 13,
    color: Colors.light.text,
    fontFamily: "Inter_700Bold",
  },
  resetActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  legacyHint: {
    fontSize: 12,
    lineHeight: 18,
    color: "#1E3A8A",
  },
});

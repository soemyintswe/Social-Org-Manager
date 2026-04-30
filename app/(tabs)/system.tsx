import React from "react";
import { StyleSheet, Text, View, Pressable, Alert, Platform, ScrollView, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import { clearAllLocalDataKeepSystemConfig } from "@/lib/storage";
import { checkForAppUpdate, getCurrentAppVersion, getCurrentBuildNumber } from "@/lib/app-update";
import { ORG_POSITION_LABELS, type OrgPosition } from "@/lib/types";

export default function SystemScreen() {
  const insets = useSafeAreaInsets();
  const { refreshData, users, createInitialOrgUserAccount } = useData() as any;
  const { can } = useAuth();
  const canManageSystem = can("system.manage");
  const currentVersion = getCurrentAppVersion();
  const currentBuild = getCurrentBuildNumber();
  const [initialUsername, setInitialUsername] = React.useState("");
  const [initialDisplayName, setInitialDisplayName] = React.useState("");
  const [initialPassword, setInitialPassword] = React.useState("");
  const [initialConfirmPassword, setInitialConfirmPassword] = React.useState("");
  const [initialOrgPosition, setInitialOrgPosition] = React.useState<OrgPosition>("chairperson");
  const [creatingInitialUser, setCreatingInitialUser] = React.useState(false);
  const systemInfo = {
    releaseDate: "2026-02-21",
    developer: "MR. SOE MYINT SWE",
    packageId: "com.soemyintswe.orghub",
    copyright: "Copyright (c) 2026 Social Org Manager. All rights reserved.",
  };
  const initialOrgUser = React.useMemo(
    () => (users || []).find((user: any) => user?.systemRole === "org_user" && !String(user?.memberId || "").trim()),
    [users]
  );
  const initialOrgRoleOptions: OrgPosition[] = [
    "chairperson",
    "vice_chairperson",
    "secretary",
    "joint_secretary",
    "treasurer",
    "auditor",
    "committee_member",
    "patron",
    "member",
  ];

  const mapInitialUserError = (error: unknown): string => {
    const code = String((error as any)?.message || error || "").trim().toLowerCase();
    const messages: Record<string, string> = {
      username_required: "Username ထည့်ပါ။",
      display_name_required: "အမည်ထည့်ပါ။",
      password_required: "Password ထည့်ပါ။",
      username_exists: "Username တူနေပါသည်။ အခြား username သုံးပါ။",
      initial_org_user_exists: "ကနဦး User Account တစ်ခု ရှိပြီးသားဖြစ်ပါသည်။",
    };
    return messages[code] || "ကနဦး User Account ဖန်တီးရာတွင် အမှားဖြစ်နေပါသည်။";
  };

  const handleCreateInitialUser = async () => {
    if (!canManageSystem || creatingInitialUser) return;
    const username = initialUsername.trim();
    const displayName = initialDisplayName.trim();
    const password = initialPassword.trim();
    const confirmPassword = initialConfirmPassword.trim();

    if (!username || !displayName || !password) {
      Alert.alert("လိုအပ်ချက်", "Username၊ အမည် နှင့် Password ကိုဖြည့်ပါ။");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("လိုအပ်ချက်", "Password နှင့် Confirm Password မကိုက်ညီပါ။");
      return;
    }

    try {
      setCreatingInitialUser(true);
      const created = await createInitialOrgUserAccount({
        username,
        displayName,
        password,
        orgPosition: initialOrgPosition,
      });
      setInitialUsername("");
      setInitialDisplayName("");
      setInitialPassword("");
      setInitialConfirmPassword("");
      Alert.alert(
        "အောင်မြင်ပါသည်",
        `ကနဦး User Account ဖန်တီးပြီးပါပြီ။\n\nUsername: ${created.id}\nRole: ${ORG_POSITION_LABELS[created.orgPosition || "member"]}\n\nဤ account ဖြင့် login ဝင်ပြီး အသင်းကိစ္စအဝဝကို ဆက်လက်စီမံနိုင်ပါသည်။`
      );
    } catch (error) {
      Alert.alert("အမှား", mapInitialUserError(error));
    } finally {
      setCreatingInitialUser(false);
    }
  };

  const handleSystemReset = () => {
    if (Platform.OS === "web") {
      if (window.confirm("System Reset သတိပေးချက်\n\nဤလုပ်ဆောင်ချက်သည် အသင်းဝင်များ၊ ငွေစာရင်းများ၊ မှတ်တမ်းများ အားလုံးကို အပြီးတိုင် ဖျက်ဆီးပါမည်။ ပြန်ယူ၍ မရနိုင်ပါ။ ဆက်လုပ်မည်လား။")) {
        if (window.confirm("နောက်ဆုံးအဆင့် အတည်ပြုခြင်း\n\nတကယ်ဖျက်မည်မှာ သေချာပါသလား။")) {
          clearAllLocalDataKeepSystemConfig().then(async () => {
            window.alert("အောင်မြင်ပါသည်\nSystem Reset ပြုလုပ်ပြီးပါပြီ။");
            window.location.href = "/";
          });
        }
      }
      return;
    }

    Alert.alert(
      "System Reset သတိပေးချက်",
      "ဤလုပ်ဆောင်ချက်သည် အသင်းဝင်များ၊ ငွေစာရင်းများ၊ မှတ်တမ်းများ အားလုံးကို အပြီးတိုင် ဖျက်ဆီးပါမည်။ ပြန်ယူ၍ မရနိုင်ပါ။ ဆက်လုပ်မည်လား။",
      [
        { text: "မဖျက်ပါ", style: "cancel" },
        {
          text: "အတည်ပြုသည်",
          style: "destructive",
          onPress: () => {
            Alert.alert("နောက်ဆုံးအဆင့် အတည်ပြုခြင်း", "တကယ်ဖျက်မည်မှာ သေချာပါသလား။", [
              { text: "မဖျက်ပါ", style: "cancel" },
              {
                text: "ဖျက်မည်",
                style: "destructive",
                onPress: async () => {
                  await clearAllLocalDataKeepSystemConfig();
                  if (refreshData) await refreshData();
                  setTimeout(() => {
                    Alert.alert("အောင်မြင်ပါသည်", "System Reset ပြုလုပ်ပြီးပါပြီ။");
                  }, 100);
                },
              },
            ]);
          },
        },
      ]
    );
  };

  const handleCheckForUpdate = async () => {
    const info = await checkForAppUpdate();
    if (!info.ok) {
      Alert.alert("Update Check", `Update စစ်ဆေးရာတွင် မအောင်မြင်ပါ။\nReason: ${info.reason || "unknown"}`);
      return;
    }
    const latestBuild = String(info.latestBuildNumber || "-");
    if (!info.hasUpdate) {
      Alert.alert(
        "Update Check",
        `အသစ်မရှိသေးပါ။\nCurrent Version: ${currentVersion} (${currentBuild || "-"})\nLatest: ${info.latestVersion || "-"} (${latestBuild})`
      );
      return;
    }
    Alert.alert(
      "Update Available",
      `Current: ${currentVersion} (${currentBuild || "-"})\nLatest: ${info.latestVersion} (${latestBuild})\n\n${info.notes || ""}`,
      [
        { text: "Later", style: "cancel" },
        {
          text: "Update Now",
          onPress: () => {
            if (info.downloadUrl) {
              void Linking.openURL(info.downloadUrl);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 20 }]}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>System Management</Text>
      <Text style={styles.subtitle}>Manage your data and settings</Text>

      {canManageSystem ? (
        <View style={styles.menuContainer}>
          <View style={styles.bootstrapCard}>
            <Text style={styles.bootstrapTitle}>ကနဦး User Account</Text>
            <Text style={styles.bootstrapDesc}>
              System Admin သည် system setup ပြီးနောက် အသင်းကိစ္စအဝဝကို စီမံမည့် ပထမဆုံး org user account တစ်ခုကိုသာ တည်ဆောက်နိုင်ပါသည်။
            </Text>
            {initialOrgUser ? (
              <View style={styles.bootstrapSummary}>
                <Text style={styles.bootstrapSummaryLine}>Username: {initialOrgUser.id}</Text>
                <Text style={styles.bootstrapSummaryLine}>အမည်: {initialOrgUser.displayName}</Text>
                <Text style={styles.bootstrapSummaryLine}>Role: {ORG_POSITION_LABELS[initialOrgUser.orgPosition || "member"]}</Text>
                <Text style={styles.bootstrapHint}>ပြန်လည် password reset လုပ်လိုပါက Account Settings မှ Admin Password Reset ကိုသုံးပါ။</Text>
              </View>
            ) : (
              <View style={styles.bootstrapForm}>
                <Text style={styles.fieldLabel}>Username</Text>
                <TextInput
                  style={styles.input}
                  value={initialUsername}
                  onChangeText={setInitialUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="ဥပမာ - chair001"
                />
                <Text style={styles.fieldLabel}>အမည်</Text>
                <TextInput
                  style={styles.input}
                  value={initialDisplayName}
                  onChangeText={setInitialDisplayName}
                  placeholder="ဥပမာ - ဦးစိုးမြင့်ဆွေ"
                />
                <Text style={styles.fieldLabel}>Role</Text>
                <View style={styles.roleGrid}>
                  {initialOrgRoleOptions.map((position) => {
                    const active = initialOrgPosition === position;
                    return (
                      <Pressable
                        key={position}
                        style={[styles.roleChip, active && styles.roleChipActive]}
                        onPress={() => setInitialOrgPosition(position)}
                      >
                        <Text style={[styles.roleChipText, active && styles.roleChipTextActive]}>
                          {ORG_POSITION_LABELS[position]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={initialPassword}
                  onChangeText={setInitialPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Password"
                />
                <Text style={styles.fieldLabel}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  value={initialConfirmPassword}
                  onChangeText={setInitialConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Confirm Password"
                />
                <Pressable style={styles.bootstrapButton} onPress={() => void handleCreateInitialUser()} disabled={creatingInitialUser}>
                  <Text style={styles.bootstrapButtonText}>{creatingInitialUser ? "လုပ်ဆောင်နေသည်..." : "ကနဦး User Account ဖန်တီးမည်"}</Text>
                </Pressable>
              </View>
            )}
          </View>

          <Pressable
            style={[styles.menuItem, { backgroundColor: Colors.light.tint }]}
            onPress={() => router.push("/data-management")}
          >
            <View style={styles.iconBox}>
              <Ionicons name="settings-outline" size={24} color="#fff" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuTitle}>Data & Backup</Text>
              <Text style={styles.menuDesc}>Import, Export and Restore Data</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
          </Pressable>

          <Pressable
            style={[styles.menuItem, { backgroundColor: "#2563EB" }]}
            onPress={() => void handleCheckForUpdate()}
          >
            <View style={styles.iconBox}>
              <Ionicons name="download-outline" size={24} color="#fff" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuTitle}>Check App Update</Text>
              <Text style={styles.menuDesc}>Latest version ရှိ/မရှိ စစ်ဆေးမည်</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
          </Pressable>

          <Pressable
            style={[styles.menuItem, { backgroundColor: "#EF4444" }]}
            onPress={handleSystemReset}
          >
            <View style={styles.iconBox}>
              <Ionicons name="trash-outline" size={24} color="#fff" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuTitle}>System Reset</Text>
              <Text style={styles.menuDesc}>Delete all data permanently</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
      ) : (
        <View style={styles.infoSection}>
          <Text style={styles.sectionHeader}>About</Text>
          <Text style={styles.guideText}>
            ဒီစာမျက်နှာတွင် App Version နှင့် System Information များကို ကြည့်ရှုနိုင်ပါသည်။
          </Text>
        </View>
      )}

      <View style={styles.infoSection}>
        <Text style={styles.sectionHeader}>System Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>App Version</Text>
          <Text style={styles.infoValue}>{currentVersion}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Build Number</Text>
          <Text style={styles.infoValue}>{currentBuild || "-"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Release Date</Text>
          <Text style={styles.infoValue}>{systemInfo.releaseDate}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Developer</Text>
          <Text style={styles.infoValue}>{systemInfo.developer}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Package ID</Text>
          <Text style={styles.infoValue}>{systemInfo.packageId}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Technology</Text>
          <Text style={styles.infoValue}>React Native / Expo / Gemini AI / OpenAI GPT-5 Codex</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Copyright</Text>
          <Text style={styles.infoValue}>{systemInfo.copyright}</Text>
        </View>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.sectionHeader}>အသုံးပြုနည်း လမ်းညွှန် (User Guide)</Text>
        <Text style={styles.guideText}>
          ၁။ <Text style={{ fontWeight: "bold" }}>Login ဝင်ခြင်း</Text>: Member ID (ID001), Full Name, Phone, Email သို့မဟုတ် Admin account ဖြင့် ဝင်ရောက်နိုင်ပါသည်။{"\n\n"}
          ၂။ <Text style={{ fontWeight: "bold" }}>Dashboard</Text>: အသင်းဝင်အရေအတွက်၊ ငွေစာရင်းအနှစ်ချုပ်၊ ချေးငွေလက်ကျန်၊ Event/Message unread count နှင့် အမြန်လုပ်ဆောင်ချက်များကို ကြည့်နိုင်ပါသည်။{"\n\n"}
          ၃။ <Text style={{ fontWeight: "bold" }}>အမြန်လုပ်ဆောင်ချက်များ</Text>: Sync Now, Messages, သတင်းပို့ရန်, ငွေတောင်းခံရန်, လစဉ်ကြေးပေးသွင်းရန်, လှူဒါန်းရန်, ချေးငွေဆပ်ရန်, အတိုးဆပ်ရန် စသည့်လုပ်ဆောင်ချက်များကို တိုက်ရိုက်နှိပ်ပြီး အသုံးပြုနိုင်ပါသည်။{"\n\n"}
          ၄။ <Text style={{ fontWeight: "bold" }}>Members</Text>: အသင်းဝင်စာရင်းကြည့်ရှုခြင်း၊ ကိုယ်ပိုင် profile ပြင်ဆင်ခြင်း၊ profile ပုံတင်ခြင်း၊ မိသားစုဝင်အချက်အလက် ဖြည့်ခြင်းများ ဆောင်ရွက်နိုင်ပါသည်။{"\n\n"}
          ၅။ <Text style={{ fontWeight: "bold" }}>Member Change Approval</Text>: MemberID/Position/Status/Status Date ကဲ့သို့ အရေးကြီးအချက်များကို proposal + approval workflow ဖြင့် ဥက္ကဌ/ဒုဥက္ကဌ အတည်ပြုမှ အသက်ဝင်ပါသည်။{"\n\n"}
          ၆။ <Text style={{ fontWeight: "bold" }}>Events (သတင်းပို့ရန်)</Text>: Events စာရင်းတွင် သတင်းအသစ်တင်ခြင်း၊ ဖတ်ရှုမှုအခြေအနေ၊ reaction, comment, reply နှင့် mention notification များကို စီမံနိုင်ပါသည်။{"\n\n"}
          ၇။ <Text style={{ fontWeight: "bold" }}>Messages</Text>: Member to Member chat သို့မဟုတ် Group chat တွင် message, image ပို့ခြင်းနှင့် unread badge ကြည့်ရှုနိုင်ပါသည်။{"\n\n"}
          ၈။ <Text style={{ fontWeight: "bold" }}>Finance</Text>: ရငွေ/သုံးငွေ/လွှဲငွေ စာရင်းသွင်းခြင်း၊ receipt/remark ဖြည့်ခြင်း၊ payment request workflow ဖြင့် ဘဏ္ဍာရေးမှူးထံ စစ်ဆေးအတည်ပြုတင်သွင်းနိုင်ပါသည်။{"\n\n"}
          ၉။ <Text style={{ fontWeight: "bold" }}>Loans</Text>: ချေးငွေထုတ်ပေးခြင်း၊ ပြန်ဆပ်ငွေတင်ခြင်း၊ အတိုး/ကျန်ငွေကို member အလိုက်စစ်ဆေးနိုင်ပါသည်။{"\n\n"}
          ၁၀။ <Text style={{ fontWeight: "bold" }}>Reports</Text>: လအလိုက်၊ နှစ်အလိုက်၊ category အလိုက် ငွေစာရင်းရှင်းတမ်းများနှင့် audit/report export များကို ပြုလုပ်နိုင်ပါသည်။{"\n\n"}
          ၁၁။ <Text style={{ fontWeight: "bold" }}>Sync (LAN + Cloud)</Text>: Sync Now နှိပ်လျှင် pull/push ကို တစ်ခါတည်းလုပ်ဆောင်ပြီး LAN/Cloud setting အလိုက် data update ကို တစ်ပြိုင်တည်းညှိပေးပါသည်။{"\n\n"}
          ၁၂။ <Text style={{ fontWeight: "bold" }}>Backup / Restore</Text>: JSON backup export လုပ်ခြင်း၊ restore (merge/replace) ပြုလုပ်ခြင်းဖြင့် data လုံခြုံစွာ သိမ်းဆည်းနိုင်ပါသည်။{"\n\n"}
          ၁၃။ <Text style={{ fontWeight: "bold" }}>App Update</Text>: App ဖွင့်ချိန်တွင် update ရှိ/မရှိ စစ်ပြီး update ရှိလျှင် Update Now ဖြင့် APK download + install prompt ဖြင့် update ဆက်လုပ်နိုင်ပါသည်။{"\n\n"}
          ၁၄။ <Text style={{ fontWeight: "bold" }}>Security & Roles</Text>: Role-based access control ဖြင့် member/committee/admin အလိုက် မတူညီသောလုပ်ပိုင်ခွင့်များကို အလိုအလျောက်ကန့်သတ်ထားပါသည်။
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>© 2024 OrgHub Manager</Text>
        <Text style={styles.footerSubText}>Created by MR. SOE MYINT SWE</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 20 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 4 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginBottom: 30 },
  menuContainer: { gap: 16 },
  bootstrapCard: { backgroundColor: Colors.light.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.light.border, padding: 18 },
  bootstrapTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 6 },
  bootstrapDesc: { fontSize: 13, lineHeight: 20, color: Colors.light.textSecondary, marginBottom: 14 },
  bootstrapForm: { gap: 8 },
  bootstrapSummary: { backgroundColor: Colors.light.tintLight, borderRadius: 12, padding: 14, gap: 6 },
  bootstrapSummaryLine: { fontSize: 14, color: Colors.light.text, fontFamily: "Inter_600SemiBold" },
  bootstrapHint: { marginTop: 6, fontSize: 12, lineHeight: 18, color: Colors.light.textSecondary },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginTop: 2 },
  input: {
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.light.text,
  },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  roleChipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  roleChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  roleChipTextActive: { color: "#fff" },
  bootstrapButton: {
    marginTop: 8,
    backgroundColor: Colors.light.tint,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  bootstrapButtonText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 20, borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  iconBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center", marginRight: 16 },
  menuTextContainer: { flex: 1 },
  menuTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#fff", marginBottom: 4 },
  menuDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.9)" },
  infoSection: { marginTop: 30, backgroundColor: Colors.light.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: Colors.light.border },
  sectionHeader: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 15 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  infoLabel: { fontSize: 14, color: Colors.light.textSecondary },
  infoValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  guideText: { fontSize: 14, lineHeight: 22, color: Colors.light.text },
  footer: { marginTop: 40, alignItems: "center", opacity: 0.5, marginBottom: 20 },
  footerText: { fontSize: 12, fontWeight: "600" },
  footerSubText: { fontSize: 10, marginTop: 2 },
});

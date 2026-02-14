import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  ToastAndroid,
  Modal,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import * as store from "@/lib/storage";
import { normalizeMemberStatus, type Member } from "@/lib/types";
import { normalizeDateText, splitPhoneNumbers } from "@/lib/member-utils";

const MEMBER_AUTO_BACKUP_FILE = "members_auto_backup.json";
const LEGACY_AUTO_BACKUP_FILE = "auto_backup.json";
const AVATAR_COLORS = ["#0D9488", "#F43F5E", "#8B5CF6", "#F59E0B", "#3B82F6", "#10B981"];

type ParseResult =
  | { ok: true; members: Member[] }
  | { ok: false; message: string };

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractRawMembers(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return null;

  const payload = parsed as Record<string, unknown>;
  if (Array.isArray(payload.members)) return payload.members as unknown[];

  const encodedMembers = payload["@orghub_members"];
  if (typeof encodedMembers === "string") {
    const nested = safeJsonParse(encodedMembers);
    if (Array.isArray(nested)) return nested;
  }
  if (Array.isArray(encodedMembers)) return encodedMembers as unknown[];

  return null;
}

function normalizeMember(raw: unknown, index: number): Member | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const fallbackColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const nowIso = new Date().toISOString();
  const today = new Date().toLocaleDateString("en-GB");

  const id =
    typeof obj.id === "string" && obj.id.trim()
      ? obj.id.trim()
      : `imported-${Date.now()}-${index}`;
  const name =
    typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : `Member ${index + 1}`;
  const primaryPhoneInput =
    typeof obj.phone === "string"
      ? obj.phone
      : typeof obj.primaryPhone === "string"
      ? obj.primaryPhone
      : "";
  const secondaryPhoneInput =
    typeof obj.secondaryPhone === "string"
      ? obj.secondaryPhone
      : typeof obj.phone2 === "string"
      ? obj.phone2
      : "";
  const { primaryPhone, secondaryPhone } = splitPhoneNumbers(primaryPhoneInput, secondaryPhoneInput);
  const status = normalizeMemberStatus(obj.status);
  const statusDate = normalizeDateText(
    typeof obj.statusDate === "string"
      ? obj.statusDate
      : typeof obj.resignDate === "string"
      ? obj.resignDate
      : ""
  );
  const statusReason =
    typeof obj.statusReason === "string"
      ? obj.statusReason.trim()
      : typeof obj.resignReason === "string"
      ? obj.resignReason.trim()
      : "";
  const joinDate =
    normalizeDateText(typeof obj.joinDate === "string" ? obj.joinDate : "") || today;
  const createdAt =
    typeof obj.createdAt === "string" && obj.createdAt.trim() ? obj.createdAt : nowIso;
  const color =
    typeof obj.color === "string" && obj.color.trim()
      ? obj.color
      : typeof obj.avatarColor === "string" && obj.avatarColor.trim()
      ? obj.avatarColor
      : fallbackColor;
  const avatarColor =
    typeof obj.avatarColor === "string" && obj.avatarColor.trim() ? obj.avatarColor : color;
  const role = typeof obj.role === "string" && obj.role.trim() ? obj.role : "member";

  const normalizedMember: Member = {
    ...(obj as Partial<Member>),
    id,
    name,
    phone: primaryPhone,
    email:
      typeof obj.email === "string"
        ? obj.email.trim()
        : typeof obj["e-mail"] === "string"
        ? (obj["e-mail"] as string).trim()
        : typeof obj.mail === "string"
        ? (obj.mail as string).trim()
        : "",
    dob: normalizeDateText(typeof obj.dob === "string" ? obj.dob : ""),
    joinDate,
    status,
    statusDate,
    resignDate: statusDate,
    statusReason,
    createdAt,
    color,
    avatarColor,
    role,
  };

  if (secondaryPhone) {
    (normalizedMember as any).secondaryPhone = secondaryPhone;
  }
  if (!normalizedMember.email) delete (normalizedMember as any).email;
  if (!statusDate) {
    delete (normalizedMember as any).statusDate;
    delete (normalizedMember as any).resignDate;
  }
  if (!statusReason) delete (normalizedMember as any).statusReason;

  return normalizedMember;
}

function parseMembersFromText(text: string): ParseResult {
  const parsed = safeJsonParse(text);
  if (!parsed) {
    return { ok: false, message: "JSON format မမှန်ပါ။" };
  }

  const rawMembers = extractRawMembers(parsed);
  if (!rawMembers) {
    return {
      ok: false,
      message: "Member data မတွေ့ပါ။ member backup file သို့မဟုတ် full backup file တစ်ခုလိုအပ်ပါသည်။",
    };
  }

  const normalizedMembers = rawMembers
    .map((item, idx) => normalizeMember(item, idx))
    .filter((member): member is Member => Boolean(member));

  const uniqueById = new Map<string, Member>();
  for (const member of normalizedMembers) {
    uniqueById.set(member.id, member);
  }
  const members = Array.from(uniqueById.values());

  if (!members.length) {
    return { ok: false, message: "အသုံးပြုနိုင်သော Member data မရှိပါ။" };
  }

  return { ok: true, members };
}

function buildMemberBackupText(members: Member[]): string {
  return JSON.stringify(
    {
      type: "member_backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      count: members.length,
      members,
    },
    null,
    2
  );
}

export default function MemberDataManagementScreen() {
  const insets = useSafeAreaInsets();
  const { members, refreshData } = useData();
  const [backupText, setBackupText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState(false);

  const preview = useMemo(() => {
    if (!backupText.trim()) return { count: 0, error: "" };
    const parsed = parseMembersFromText(backupText);
    if (!parsed.ok) return { count: 0, error: parsed.message };
    return { count: parsed.members.length, error: "" };
  }, [backupText]);

  const showMessage = (title: string, message: string) => {
    if (Platform.OS === "web") {
      alert(`${title}\n${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  const saveAutoBackupSnapshot = async () => {
    if (Platform.OS === "web") return;
    const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    if (!directory) return;
    const latestMembers = await store.getMembers();
    await FileSystem.writeAsStringAsync(
      directory + MEMBER_AUTO_BACKUP_FILE,
      buildMemberBackupText(latestMembers)
    );
  };

  const handleBackup = async () => {
    if (processing || importing) return;
    setProcessing(true);

    try {
      const backupString = buildMemberBackupText(members);
      setBackupText(backupString);

      if (!members.length) {
        showMessage("No Data", "Member စာရင်းမရှိသေးပါ။");
        return;
      }

      if (Platform.OS === "web") {
        const timestamp = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
        const blob = new Blob([backupString], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `members_backup_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage("Backup Complete", "Member backup file ကို download လုပ်ပြီးပါပြီ။");
        return;
      }

      const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!directory) {
        showMessage("Error", "File သိမ်းရန် directory မတွေ့ပါ။");
        return;
      }

      const timestamp = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
      const fileUri = directory + `members_backup_${timestamp}.json`;
      await FileSystem.writeAsStringAsync(fileUri, backupString);
      await FileSystem.writeAsStringAsync(directory + MEMBER_AUTO_BACKUP_FILE, backupString);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/json",
          dialogTitle: "Member Backup ဖိုင်သိမ်းမည့်နေရာရွေးပါ",
          UTI: "public.json",
        });
      } else {
        showMessage("Saved", "Member backup file ကို local storage ထဲသိမ်းပြီးပါပြီ။");
      }
    } catch (error) {
      console.error("Member backup error:", error);
      showMessage("Error", "Member backup ပြုလုပ်ရာတွင် အမှားရှိနေပါသည်။");
    } finally {
      setProcessing(false);
    }
  };

  const handleRestoreAuto = async () => {
    if (processing || importing) return;
    if (Platform.OS === "web") {
      showMessage("Not Available", "Web မှာ Local Auto-Backup restore မရပါ။");
      return;
    }

    setProcessing(true);
    try {
      const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!directory) {
        showMessage("Error", "Local backup directory မတွေ့ပါ။");
        return;
      }

      const candidates = [
        directory + MEMBER_AUTO_BACKUP_FILE,
        directory + LEGACY_AUTO_BACKUP_FILE,
      ];

      for (const fileUri of candidates) {
        const info = await FileSystem.getInfoAsync(fileUri);
        if (!info.exists) continue;

        const content = await FileSystem.readAsStringAsync(fileUri);
        const parsed = parseMembersFromText(content);
        if (!parsed.ok) continue;

        setBackupText(buildMemberBackupText(parsed.members));
        showMessage(
          "Loaded",
          `Auto-Backup မှ Member ${parsed.members.length} ယောက်ကိုဖတ်ပြီးပါပြီ။ Restore သို့မဟုတ် Import ဆက်လုပ်နိုင်ပါသည်။`
        );
        return;
      }

      showMessage("Not Found", "Restore လုပ်ရန် Member Auto-Backup file မတွေ့ပါ။");
    } catch (error) {
      console.error("Restore auto backup error:", error);
      showMessage("Error", "Auto-Backup ဖိုင်ဖတ်မရနိုင်ပါ။");
    } finally {
      setProcessing(false);
    }
  };

  const handlePickFile = async () => {
    if (processing || importing) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      let content = "";

      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        content = await response.text();
      } else {
        content = await FileSystem.readAsStringAsync(asset.uri);
      }

      setBackupText(content);
      const parsed = parseMembersFromText(content);
      if (parsed.ok) {
        showMessage(
          "File Loaded",
          `Member ${parsed.members.length} ယောက်ပါဝင်သော backup ကို ဖွင့်ပြီးပါပြီ။`
        );
      } else {
        showMessage("File Loaded", "ဖိုင်ကိုဖတ်ပြီးပါပြီ။ Member data စစ်ဆေးပြီး action ရွေးပါ။");
      }
    } catch (error) {
      console.error("Pick file error:", error);
      showMessage("Error", "ဖိုင်ဖွင့်မရနိုင်ပါ။");
    }
  };

  const handlePaste = async () => {
    if (processing || importing) return;
    const text = await Clipboard.getStringAsync();
    if (!text.trim()) {
      showMessage("Clipboard Empty", "Clipboard ထဲတွင်စာသားမရှိပါ။");
      return;
    }

    setBackupText(text);
    if (Platform.OS === "android") {
      ToastAndroid.show("Pasted from Clipboard", ToastAndroid.SHORT);
    } else {
      showMessage("Pasted", "Clipboard မှစာသားထည့်ပြီးပါပြီ။");
    }
  };

  const applyReplaceRestore = async () => {
    const parsed = parseMembersFromText(backupText);
    if (!parsed.ok) {
      showMessage("Invalid Backup", parsed.message);
      return;
    }

    const run = async () => {
      setImporting(true);
      try {
        await store.saveMembers(parsed.members);
        await refreshData();
        await saveAutoBackupSnapshot();
        showMessage("Success", `Member ${parsed.members.length} ယောက်ကို Restore လုပ်ပြီးပါပြီ။`);
      } catch (error) {
        console.error("Replace restore error:", error);
        showMessage("Error", "Restore မအောင်မြင်ပါ။");
      } finally {
        setImporting(false);
      }
    };

    const confirmMessage =
      "လက်ရှိ Member စာရင်းအားလုံးကို backup ထဲက Member data ဖြင့် အစားထိုးပါမည်။ သေချာပါသလား။";

    if (Platform.OS === "web") {
      if (confirm(confirmMessage)) {
        await run();
      }
      return;
    }

    Alert.alert("Confirm Restore", confirmMessage, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restore",
        style: "destructive",
        onPress: () => {
          void run();
        },
      },
    ]);
  };

  const applyImportMerge = async () => {
    const parsed = parseMembersFromText(backupText);
    if (!parsed.ok) {
      showMessage("Invalid Backup", parsed.message);
      return;
    }

    const run = async () => {
      setImporting(true);
      try {
        await store.importMembers(parsed.members);
        await refreshData();
        await saveAutoBackupSnapshot();
        showMessage(
          "Success",
          `Member ${parsed.members.length} ယောက်ကို Import လုပ်ပြီးပါပြီ (ID တူပါက update လုပ်ပါသည်)။`
        );
      } catch (error) {
        console.error("Merge import error:", error);
        showMessage("Error", "Import မအောင်မြင်ပါ။");
      } finally {
        setImporting(false);
      }
    };

    const confirmMessage =
      "Backup ထဲက Member data ကို လက်ရှိစာရင်းထဲသို့ ထည့်သွင်းပါမည် (ID တူပါက update လုပ်မည်)။ ဆက်လုပ်မည်လား။";

    if (Platform.OS === "web") {
      if (confirm(confirmMessage)) {
        await run();
      }
      return;
    }

    Alert.alert("Confirm Import", confirmMessage, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Import",
        onPress: () => {
          void run();
        },
      },
    ]);
  };

  const busy = processing || importing;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Member Data Tools</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.instruction}>Member သီးသန့် Backup / Restore / Import</Text>

          <View style={styles.autoBackupCard}>
            <Text style={styles.cardTitle}>Local Auto Backup (Members)</Text>
            <Text style={styles.cardDesc}>
              Member auto-backup ဖိုင်မှ ပြန်ဖတ်နိုင်ပါသည်။ Member-only ဖိုင်မရှိပါက existing auto-backup မှ Member
              data ကို ခွဲထုတ်ဖတ်ပါမည်။
            </Text>
            <Pressable style={styles.restoreAutoBtn} onPress={handleRestoreAuto} disabled={busy}>
              <Text style={styles.restoreAutoText}>Restore from Auto-Backup</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#6366F1", marginBottom: 15, opacity: busy ? 0.7 : 1 }]}
            onPress={handleBackup}
            disabled={busy}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.btnText}>Backup Members (Share / Save to Drive)</Text>
            </View>
          </Pressable>

          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: "#8B5CF6", flex: 1, opacity: busy ? 0.7 : 1 }]}
              onPress={handlePickFile}
              disabled={busy}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="document-text-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={[styles.btnText, { fontSize: 14 }]}>Select File</Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.actionBtn, { backgroundColor: "#059669", flex: 1, opacity: busy ? 0.7 : 1 }]}
              onPress={handlePaste}
              disabled={busy}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="clipboard-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={[styles.btnText, { fontSize: 14 }]}>Paste Text</Text>
              </View>
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            multiline
            placeholder="Member backup JSON ကို ဒီမှာ paste လုပ်ပါ (သို့) အပေါ်ကခလုတ်ဖြင့် ဖိုင်ရွေးပါ..."
            value={backupText}
            onChangeText={setBackupText}
            textAlignVertical="top"
          />

          {backupText.trim().length > 0 ? (
            <Text style={[styles.previewText, preview.error ? styles.previewError : undefined]}>
              {preview.error || `Detected Members: ${preview.count}`}
            </Text>
          ) : null}

          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#F59E0B", marginBottom: 10, opacity: busy ? 0.7 : 1 }]}
            onPress={applyReplaceRestore}
            disabled={busy}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="download-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.btnText}>Restore Members (Replace All)</Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#0EA5A4", opacity: busy ? 0.7 : 1 }]}
            onPress={applyImportMerge}
            disabled={busy}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="add-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.btnText}>Import Members (Add / Update by ID)</Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#64748B", marginTop: 15 }]}
            onPress={() => router.back()}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="arrow-back" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.btnText}>Members သို့ ပြန်သွားရန်</Text>
            </View>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal transparent animationType="fade" visible={busy} onRequestClose={() => {}}>
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.light.tint} />
            <Text style={styles.loadingText}>Processing Member Data...</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  backBtn: { padding: 4 },
  content: { padding: 20, flexGrow: 1 },
  instruction: {
    fontSize: 14,
    color: Colors.light.text,
    marginBottom: 12,
    fontFamily: "Inter_400Regular",
  },
  input: {
    flex: 1,
    minHeight: 220,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 12,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 12,
  },
  actionBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  autoBackupCard: {
    backgroundColor: Colors.light.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 20,
  },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text, marginBottom: 8 },
  cardDesc: { fontSize: 12, color: Colors.light.textSecondary, marginBottom: 10, lineHeight: 18 },
  restoreAutoBtn: {
    backgroundColor: Colors.light.background,
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  restoreAutoText: { color: Colors.light.text, fontSize: 13, fontFamily: "Inter_500Medium" },
  previewText: {
    fontSize: 12,
    color: Colors.light.tint,
    marginBottom: 12,
    fontFamily: "Inter_500Medium",
  },
  previewError: {
    color: "#EF4444",
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingBox: {
    width: "84%",
    maxWidth: 320,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
});

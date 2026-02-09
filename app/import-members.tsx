import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { importMembers, randomColor, clearAllData, exportData, restoreData } from "@/lib/storage";
import { useData } from "@/lib/DataContext";
import { Member } from "@/lib/types";

export default function ImportMembersScreen() {
  const insets = useSafeAreaInsets();
  const { refreshData } = useData() as any;
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [backupText, setBackupText] = useState("");

  // CSV Parser (Quotes ထဲရှိ Newline များကိုပါ ထည့်သွင်းစဉ်းစားပေးသည်)
  const parseCSV = (text: string) => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && nextChar === "\n") i++;
        currentRow.push(currentCell.trim());
        if (currentRow.length > 0) rows.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
    }
    return rows;
  };

  const handleImport = async () => {
    if (!csvText.trim()) {
      Alert.alert("သတိပေးချက်", "CSV စာသား ထည့်သွင်းပေးပါ။");
      return;
    }

    setImporting(true);
    try {
      const rows = parseCSV(csvText);
      const parsedMembers: Member[] = [];
      
      // Header ပါရင် ကျော်မယ် (ပထမဆုံး cell က "စဉ်" သို့မဟုတ် "No" ဖြစ်နေရင်)
      const startIndex = rows.length > 0 && (rows[0][0]?.includes("စဉ်") || rows[0][0]?.toLowerCase().includes("no")) ? 1 : 0;

      for (let i = startIndex; i < rows.length; i++) {
        const cols = rows[i];
        // CSV Format: စဉ်, အမည်, မွေးသက္ကရာဇ်, NRC, ဖုန်းနံပါတ်, နေရပ်လိပ်စာ, အသင်းဝင်သည့်နေ့, နှုတ်ထွက်သည့်နေ့, အသင်းဝင်အမှတ်
        // Index: 0, 1, 2, 3, 4, 5, 6, 7, 8

        if (cols.length < 2) continue;

        const name = cols[1] || "Unknown";
        // ID ကို Column 8 (အသင်းဝင်အမှတ်) ကယူမယ်၊ မရှိရင် Column 0 (စဉ်) ကယူမယ်
        const memberId = cols[8] || cols[0] || Date.now().toString();

        const newMember: any = {
          id: memberId,
          name: name,
          dob: cols[2] || "",
          nrc: cols[3] || "",
          phone: cols[4] || "",
          address: cols[5] || "",
          joinDate: cols[6] || new Date().toISOString(),
          resignDate: cols[7] || "",
          avatarColor: randomColor(),
          role: "member",
        };
        parsedMembers.push(newMember);
      }

      if (parsedMembers.length > 0) {
        await importMembers(parsedMembers);
        if (refreshData) await refreshData();

        if (Platform.OS === "web") {
          window.alert(`အောင်မြင်ပါသည်\n${parsedMembers.length} ဦး ထည့်သွင်းပြီးပါပြီ။`);
          window.location.href = "/members";
        } else {
          Alert.alert("အောင်မြင်ပါသည်", `${parsedMembers.length} ဦး ထည့်သွင်းပြီးပါပြီ။`, [
            { text: "OK", onPress: () => router.back() },
          ]);
        }
      } else {
        Alert.alert("အမှား", "ထည့်သွင်းစရာ အချက်အလက် ရှာမတွေ့ပါ။ Format မှန်ကန်ကြောင်း စစ်ဆေးပါ။");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("အမှား", "ထည့်သွင်းရာတွင် အဆင်မပြေပါ။");
    } finally {
      setImporting(false);
    }
  };

  const handleBackup = async () => {
    try {
      const data = await exportData();
      setBackupText(data);
      Alert.alert("Backup Ready", "အချက်အလက်များကို အောက်ပါကွက်လပ်တွင် ဖော်ပြထားပါသည်။ Copy ကူးယူ၍ သိမ်းဆည်းထားနိုင်ပါသည်။", [
        {
          text: "Share/Copy",
          onPress: async () => {
            await Share.share({ message: data });
          },
        },
        { text: "OK" },
      ]);
    } catch (e) {
      Alert.alert("Error", "Backup ပြုလုပ်မရနိုင်ပါ။");
    }
  };

  const handleRestore = async () => {
    if (!backupText.trim()) {
      Alert.alert("သတိပေးချက်", "Restore လုပ်ရန် Backup စာသားများကို ကွက်လပ်တွင် ထည့်ပါ။");
      return;
    }

    Alert.alert("အတည်ပြုရန်", "လက်ရှိအချက်အလက်များအားလုံး ပျက်စီးပြီး Backup အချက်အလက်များဖြင့် အစားထိုးပါမည်။ သေချာပါသလား။", [
      { text: "မလုပ်ပါ", style: "cancel" },
      {
        text: "Restore လုပ်မည်",
        style: "destructive",
        onPress: async () => {
          setImporting(true);
          const success = await restoreData(backupText);
          if (success) {
            if (refreshData) await refreshData();
            if (Platform.OS === "web") {
              window.alert("အောင်မြင်ပါသည်\nအချက်အလက်များကို ပြန်လည်ထည့်သွင်းပြီးပါပြီ။");
              window.location.href = "/members";
            } else {
              Alert.alert("အောင်မြင်ပါသည်", "အချက်အလက်များကို ပြန်လည်ထည့်သွင်းပြီးပါပြီ။");
            }
          } else {
            Alert.alert("အမှား", "Restore မအောင်မြင်ပါ။ Format မှားယွင်းနေနိုင်ပါသည်။");
          }
          setImporting(false);
        },
      },
    ]);
  };

  const handleClear = () => {
    if (Platform.OS === "web") {
      if (window.confirm("System Reset သတိပေးချက်\n\nဤလုပ်ဆောင်ချက်သည် အသင်းဝင်များ၊ ငွေစာရင်းများ၊ မှတ်တမ်းများ အားလုံးကို အပြီးတိုင် ဖျက်ဆီးပါမည်။ ပြန်ယူ၍ မရနိုင်ပါ။ ဆက်လုပ်မည်လား။")) {
        if (window.confirm("နောက်ဆုံးအဆင့် အတည်ပြုခြင်း\n\nတကယ်ဖျက်မည်မှာ သေချာပါသလား။")) {
          clearAllData().then(async () => {
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
            // Second Confirmation
            Alert.alert("နောက်ဆုံးအဆင့် အတည်ပြုခြင်း", "တကယ်ဖျက်မည်မှာ သေချာပါသလား။", [
              { text: "မဖျက်ပါ", style: "cancel" },
              { text: "ဖျက်မည်", style: "destructive", onPress: async () => {
                await clearAllData();
                if (refreshData) await refreshData();
                setTimeout(() => {
                  Alert.alert("အောင်မြင်ပါသည်", "System Reset ပြုလုပ်ပြီးပါပြီ။");
                }, 100);
              }}
            ]);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>System & Data Management</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.instruction}>
            CSV Import / Backup Restore ပြုလုပ်ရန် ဤနေရာတွင် စာသားထည့်ပါ-
          </Text>
          <View style={styles.formatBox}>
            <Text style={styles.format}>
              စဉ်, အမည်, မွေးသက္ကရာဇ်, NRC, ဖုန်း, လိပ်စာ, ဝင်နေ့, ထွက်နေ့, ID
            </Text>
            <Text style={styles.example}>
              ဥပမာ - ၁, ဦးမောင်မောင်, ၁၃၂၉, ..., ရဆသ-001
            </Text>
          </View>

          <TextInput
            style={styles.input}
            multiline
            placeholder="CSV Data သို့မဟုတ် Backup Code ကို ဒီမှာ Paste လုပ်ပါ..."
            value={csvText || backupText}
            onChangeText={(text) => {
              setCsvText(text);
              setBackupText(text);
            }}
            textAlignVertical="top"
            placeholderTextColor={Colors.light.textSecondary}
          />

          <View style={styles.btnRow}>
            <Pressable style={[styles.actionBtn, { backgroundColor: Colors.light.tint }]} onPress={handleImport} disabled={importing}>
              {importing ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>CSV Import</Text>}
            </Pressable>
            
            <Pressable style={[styles.actionBtn, { backgroundColor: "#6366F1" }]} onPress={handleBackup} disabled={importing}>
              <Text style={styles.btnText}>Backup</Text>
            </Pressable>
          </View>

          <Pressable style={[styles.actionBtn, { backgroundColor: "#F59E0B", marginTop: 10 }]} onPress={handleRestore} disabled={importing}>
            <Text style={styles.btnText}>Restore from Backup</Text>
          </Pressable>

          <View style={styles.divider} />

          <Text style={[styles.instruction, { color: "#EF4444", marginTop: 10 }]}>
            Danger Zone (သတိထားရန်)
          </Text>

          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#EF4444" }]}
            onPress={handleClear}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="trash-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.btnText}>System Reset (Delete All)</Text>
            </View>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
  instruction: { fontSize: 14, color: Colors.light.text, marginBottom: 12, fontFamily: "Inter_400Regular", lineHeight: 20 },
  formatBox: { backgroundColor: Colors.light.surface, padding: 12, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: Colors.light.border },
  format: { fontSize: 13, color: Colors.light.tint, marginBottom: 6, fontFamily: "Inter_600SemiBold" },
  example: { fontSize: 12, color: Colors.light.textSecondary, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  input: {
    flex: 1,
    minHeight: 200,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    gap: 10, // If using React Native >= 0.71, otherwise use marginRight on children
  },
  importBtn: {
    backgroundColor: Colors.light.tint,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  importBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 20,
    borderRadius: 1,
  },
});
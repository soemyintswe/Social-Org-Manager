import React, { useState } from "react";
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
  Share,
} from "react-native";
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { clearAllData, exportData, restoreData } from "@/lib/storage";
import { useData } from "@/lib/DataContext";

export default function DataManagementScreen() {
  const insets = useSafeAreaInsets();
  const { refreshData } = useData() as any;
  const [importing, setImporting] = useState(false);
  const [backupText, setBackupText] = useState("");

  const handleBackup = async () => {
    let dataString = "";
    try {
      const data = await exportData();
      dataString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

      if (dataString === "{}" || dataString === "[]") {
        Alert.alert("No Data", "သိမ်းဆည်းစရာ အချက်အလက် မရှိပါ။ Restore အရင်လုပ်ပါ။");
        return;
      }
      
      if (Platform.OS === 'web') {
        const blob = new Blob([dataString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `orghub_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      
      if (directory) {
        try {
          const fileName = `orghub_backup_${new Date().toISOString().split('T')[0]}.json`;
          const fileUri = directory + fileName;

          await FileSystem.writeAsStringAsync(fileUri, dataString, {
            encoding: FileSystem.EncodingType.UTF8,
          });

          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'application/json',
              dialogTitle: 'Backup File ကို သိမ်းဆည်းပါ',
              UTI: 'public.json',
            });
            return;
          }
        } catch (err) {
          console.warn("File save failed, falling back to text share:", err);
        }
      }

      // Fallback to text share
      setBackupText(dataString);
      Alert.alert("Backup Ready", "ဖိုင်သိမ်းဆည်းမရနိုင်ပါ။ Text ကို Copy/Share လုပ်၍ သိမ်းဆည်းနိုင်ပါသည်။", [
        {
          text: "Share Text",
          onPress: async () => {
            await Share.share({ message: dataString });
          },
        },
        { text: "OK" },
      ]);
    } catch (e: any) {
      console.warn("Backup Error:", e);
      Alert.alert("Error", "Backup ပြုလုပ်မရနိုင်ပါ။");
    }
  };

  const handleRestore = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!window.confirm("လက်ရှိအချက်အလက်များအားလုံး ပျက်စီးပြီး Backup ဖိုင်မှ အချက်အလက်များဖြင့် အစားထိုးပါမည်။ သေချာပါသလား။")) {
          return;
        }

        setImporting(true);
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const content = ev.target?.result as string;
          if (content) {
            const success = await restoreData(content);
            if (success) {
              if (refreshData) await refreshData();
              window.alert("အောင်မြင်ပါသည်\nအချက်အလက်များကို ပြန်လည်ထည့်သွင်းပြီးပါပြီ။");
              window.location.href = "/members";
            } else {
              window.alert("အမှား\nRestore မအောင်မြင်ပါ။ Format မှားယွင်းနေနိုင်ပါသည်။");
            }
          }
          setImporting(false);
        };
        reader.readAsText(file);
      };
      input.click();
      return;
    }

    // Mobile Restore Options
    if (!backupText.trim()) {
      Alert.alert("Restore Options", "Backup ဖိုင်ကို ရွေးချယ်မလား (သို့) Text ထည့်မလား?", [
        {
          text: "Select File",
          onPress: async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({
                type: 'application/json',
                copyToCacheDirectory: true
              });
              
              if (result.canceled) return;
              
              const file = result.assets[0];
              const content = await FileSystem.readAsStringAsync(file.uri);
              
              setImporting(true);
              const success = await restoreData(content);
              if (success) {
                if (refreshData) await refreshData();
                Alert.alert("အောင်မြင်ပါသည်", "အချက်အလက်များကို ပြန်လည်ထည့်သွင်းပြီးပါပြီ။");
              } else {
                Alert.alert("အမှား", "Restore မအောင်မြင်ပါ။ Format မှားယွင်းနေနိုင်ပါသည်။");
              }
              setImporting(false);
            } catch (e) {
              Alert.alert("Error", "ဖိုင်ဖတ်မရပါ။ Text ထည့်သွင်းနည်းကို အသုံးပြုပါ။");
            }
          }
        },
        { text: "Use Text Input", onPress: () => {} }, // Do nothing, let user type
        { text: "Cancel", style: "cancel" }
      ]);
      return;
    }

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
        <Text style={styles.headerTitle}>System Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.instruction}>Full System Backup & Restore</Text>
          <TextInput
            style={styles.input}
            multiline
            placeholder="Backup Code ကို ဒီမှာ Paste လုပ်ပါ..."
            value={backupText}
            onChangeText={setBackupText}
            textAlignVertical="top"
            placeholderTextColor={Colors.light.textSecondary}
          />
          <View style={styles.btnRow}>
            <Pressable style={[styles.actionBtn, { backgroundColor: "#6366F1" }]} onPress={handleBackup} disabled={importing}>
              <Text style={styles.btnText}>{Platform.OS === 'web' ? "Download Backup File" : "Backup"}</Text>
            </Pressable>
          </View>
          <Pressable style={[styles.actionBtn, { backgroundColor: "#F59E0B", marginTop: 10 }]} onPress={handleRestore} disabled={importing}>
            <Text style={styles.btnText}>{Platform.OS === 'web' ? "Restore from File" : "Restore from Backup Text"}</Text>
          </Pressable>
          <View style={styles.divider} />
          <Text style={[styles.instruction, { color: "#EF4444", marginTop: 10 }]}>Danger Zone (သတိထားရန်)</Text>
          <Pressable style={[styles.actionBtn, { backgroundColor: "#EF4444" }]} onPress={handleClear}>
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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.surface },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  backBtn: { padding: 4 },
  content: { padding: 20, flexGrow: 1 },
  instruction: { fontSize: 14, color: Colors.light.text, marginBottom: 12, fontFamily: "Inter_400Regular", lineHeight: 20 },
  input: { flex: 1, minHeight: 200, backgroundColor: Colors.light.surface, borderRadius: 12, padding: 16, fontSize: 14, color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border, marginBottom: 20 },
  btnRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10 },
  actionBtn: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1, backgroundColor: Colors.light.border, marginVertical: 20, borderRadius: 1 },
});
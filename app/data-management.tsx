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
  ActivityIndicator,
} from "react-native";
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Clipboard from 'expo-clipboard';
import Colors from "@/constants/colors";
import { clearAllData, exportData, restoreData } from "@/lib/storage";
import { useData } from "@/lib/DataContext";

export default function DataManagementScreen() {
  const insets = useSafeAreaInsets();
  const { refreshData } = useData() as any;
  const [importing, setImporting] = useState(false);
  const [backupText, setBackupText] = useState("");
  const [processing, setProcessing] = useState(false);

  const handleBackup = async () => {
    if (processing) return;
    setProcessing(true);
    
    try {
      const data = await exportData();
      const dataString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

      if (!data || dataString === "{}" || dataString === "[]") {
        const msg = "သိမ်းဆည်းစရာ အချက်အလက် မရှိပါ။";
        Platform.OS === 'web' ? alert(msg) : Alert.alert("No Data", msg);
        setProcessing(false);
        return;
      }

      // ၁။ Unicode စာသားများကို Textbox ထဲ အမြဲအသင့်ထည့်ပေးထားမည်
      setBackupText(dataString);

      if (Platform.OS === 'web') {
        try {
          // ၂။ ဒေါင်းလုဒ်ဆွဲရန် အရင်ကြိုးစားမည် (UTF-8 Encoding ပါဝင်သည်)
          const blob = new Blob([dataString], { type: 'application/json;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `orghub_backup_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          alert("Backup File (.json) ကို ဒေါင်းလုဒ်ဆွဲပြီးပါပြီ။");
        } catch (webErr) {
          // ၃။ ဒေါင်းမရလျှင် Share Screen (Telegram/Gmail/Notes) ကို တိုက်ရိုက်ဖွင့်ပေးမည်
          if (navigator.share) {
            await navigator.share({
              title: 'OrgHub Backup Data',
              text: dataString,
            }).catch(async () => {
              // Share Menu ပိတ်သွားလျှင် သို့မဟုတ် မရလျှင် Clipboard သို့ အလိုအလျောက်ကူးပေးမည်
              await Clipboard.setStringAsync(dataString);
              alert("ဒေါင်းလုဒ်နှင့် Share မရသဖြင့် အချက်အလက်များကို Clipboard သို့ Copy ကူးပေးလိုက်ပါသည်။ Notes ထဲတွင် Paste လုပ်သိမ်းပါ။");
            });
          } else {
            await Clipboard.setStringAsync(dataString);
            alert("Share စနစ်အားမပေးသဖြင့် အချက်အလက်များကို Copy ကူးပေးလိုက်ပါသည်။");
          }
        }
        setProcessing(false);
        return;
      }

      // Native Mobile (Expo Go) အတွက် ပုံမှန် Sharing စနစ်
      // @ts-ignore
      const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (directory) {
        const fileName = `orghub_backup_${new Date().toISOString().split('T')[0]}.json`;
        const fileUri = directory + fileName;
        // @ts-ignore
        await FileSystem.writeAsStringAsync(fileUri, dataString, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        }
      }
    } catch (e) {
      console.error("Backup Error:", e);
      alert("Backup ပြုလုပ်ရာတွင် အမှားတစ်ခုရှိနေပါသည်။");
    }
    setProcessing(false);
  };

  const handleRestore = async () => {
    if (!backupText.trim()) {
      alert("Restore လုပ်ရန် အပေါ်ရှိ အကွက်ထဲတွင် Backup စာသားများကို Paste လုပ်ပေးပါ။");
      return;
    }

    const confirmMsg = "လက်ရှိအချက်အလက်များ အားလုံးပျက်စီးသွားပါမည်။ သေချာပါသလား။";
    const proceed = Platform.OS === 'web' ? confirm(confirmMsg) : true;

    if (proceed) {
      if (Platform.OS !== 'web') {
        Alert.alert("Confirm", confirmMsg, [
          { text: "Cancel", style: "cancel" },
          { text: "Restore", style: "destructive", onPress: async () => performRestore() }
        ]);
      } else {
        performRestore();
      }
    }
  };

  const performRestore = async () => {
    setImporting(true);
    const success = await restoreData(backupText);
    if (success) {
      if (refreshData) await refreshData();
      alert("အောင်မြင်ပါသည်\nအချက်အလက်များ ပြန်လည်ထည့်သွင်းပြီးပါပြီ။");
      router.replace("/members");
    } else {
      alert("အမှား\nစာသားများ မပြည့်စုံသဖြင့် Restore မအောင်မြင်ပါ။");
    }
    setImporting(false);
  };

  const handleClear = () => {
    const msg = "အချက်အလက်အားလုံးကို ဖျက်ဆီးပါမည်။ ပြန်ယူ၍ မရနိုင်ပါ။ သေချာပါသလား။";
    if (Platform.OS === 'web') {
      if (confirm(msg)) {
        clearAllData().then(() => {
          alert("Reset ပြီးပါပြီ။");
          router.replace("/");
        });
      }
    } else {
      Alert.alert("Warning", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete All", style: "destructive", onPress: async () => {
          await clearAllData();
          if (refreshData) await refreshData();
          router.replace("/");
        }}
      ]);
    }
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
          <Text style={styles.instruction}>Data Backup & Restore System</Text>
          
          <Pressable 
            style={[styles.actionBtn, { backgroundColor: "#6366F1", marginBottom: 15 }]} 
            onPress={handleBackup} 
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="cloud-upload-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.btnText}>Backup (Download/Share)</Text>
              </View>
            )}
          </Pressable>

          <TextInput
            style={styles.input}
            multiline
            placeholder="Restore လုပ်ရန် Backup စာသားများကို ဒီမှာ Paste လုပ်ပါ..."
            value={backupText}
            onChangeText={setBackupText}
            textAlignVertical="top"
          />

          <Pressable 
            style={[styles.actionBtn, { backgroundColor: "#F59E0B" }]} 
            onPress={handleRestore} 
            disabled={importing}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="download-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.btnText}>Restore from Textbox</Text>
            </View>
          </Pressable>

          <View style={styles.divider} />
          <Pressable style={[styles.actionBtn, { backgroundColor: "#EF4444" }]} onPress={handleClear}>
            <Text style={styles.btnText}>System Reset (Delete All)</Text>
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
  instruction: { fontSize: 14, color: Colors.light.text, marginBottom: 12, fontFamily: "Inter_400Regular" },
  input: { flex: 1, minHeight: 250, backgroundColor: Colors.light.surface, borderRadius: 12, padding: 16, fontSize: 12, color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border, marginBottom: 20 },
  actionBtn: { paddingVertical: 16, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  divider: { height: 1, backgroundColor: Colors.light.border, marginVertical: 30 },
});
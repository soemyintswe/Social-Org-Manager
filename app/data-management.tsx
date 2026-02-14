import React, { useState, useEffect } from "react";
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
  Switch,
  ToastAndroid,
  Modal,
} from "react-native";
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as Updates from 'expo-updates';
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { clearAllData, exportData, restoreData } from "@/lib/storage";
import { useData } from "@/lib/DataContext";
import FloatingTabMenu from "@/components/FloatingTabMenu";

export default function DataManagementScreen() {
  const insets = useSafeAreaInsets();
  const { refreshData } = useData() as any;
  const [importing, setImporting] = useState(false);
  const [backupText, setBackupText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [isAutoBackup, setIsAutoBackup] = useState(false);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);

  useEffect(() => {
    checkAutoBackupStatus();
  }, []);

  const checkAutoBackupStatus = async () => {
    const enabled = await AsyncStorage.getItem("@auto_backup_enabled");
    setIsAutoBackup(enabled === "true");
    
    if (Platform.OS !== 'web') {
      const fileUri = FileSystem.documentDirectory + 'auto_backup.json';
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) {
        setLastBackupDate(new Date(info.modificationTime * 1000).toLocaleString());
      }
    }
  };

  const toggleAutoBackup = async (value: boolean) => {
    setIsAutoBackup(value);
    await AsyncStorage.setItem("@auto_backup_enabled", value.toString());
  };

  const handleRestoreAuto = async () => {
    if (Platform.OS === 'web') {
      alert("Auto Backup feature is not available on web.");
      return;
    }

    try {
      const fileUri = FileSystem.documentDirectory + 'auto_backup.json';
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists) {
        Alert.alert("Not Found", "Auto Backup ဖိုင် မရှိသေးပါ။");
        return;
      }
      
      const content = await FileSystem.readAsStringAsync(fileUri);
      setBackupText(content);
      Alert.alert("Loaded", "Auto Backup ဖိုင်ကို ဖတ်ပြီးပါပြီ။ Restore ခလုတ်နှိပ်၍ ဆက်လက်လုပ်ဆောင်ပါ။");
    } catch {
      Alert.alert("Error", "ဖိုင်ဖတ်မရနိုင်ပါ။");
    }
  };

  const handleBackup = async () => {
    if (processing) return;
    setProcessing(true);
    
    try {
      let data: any = await exportData();
      // exportData က string ပြန်ပေးခဲ့ရင် object ပြောင်းမည်
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch {}
      }

      // Events နှင့် Custom Categories များကို သီးသန့်ဆွဲထုတ်ပြီး ပေါင်းထည့်မည်
      const eventsStr = await AsyncStorage.getItem("@org_events");
      const customCatsStr = await AsyncStorage.getItem("@custom_categories");
      
      // Data အားလုံးပေါင်းစပ်ခြင်း
      const fullBackup = { ...data, events: eventsStr ? JSON.parse(eventsStr) : [], customCategories: customCatsStr ? JSON.parse(customCatsStr) : [] };
      const dataString = JSON.stringify(fullBackup, null, 2);

      if (!data || dataString === "{}" || dataString === "[]") {
        const msg = "သိမ်းဆည်းစရာ အချက်အလက် မရှိပါ။";
        if (Platform.OS === 'web') {
          alert(msg);
        } else {
          Alert.alert("No Data", msg);
        }
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
          const timestamp = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').slice(0, 19);
          a.download = `orghub_backup_${timestamp}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          alert("Backup File (.json) ကို ဒေါင်းလုဒ်ဆွဲပြီးပါပြီ။");
        } catch {
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
        const timestamp = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').slice(0, 19);
        const fileName = `orghub_backup_${timestamp}.json`;
        const fileUri = directory + fileName;
        // @ts-ignore
        await FileSystem.writeAsStringAsync(fileUri, dataString, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/json',
            dialogTitle: 'Backup ဖိုင်သိမ်းမည့်နေရာရွေးပါ (Google Drive/Telegram)',
            UTI: 'public.json'
          });
        }
      }
    } catch (e) {
      console.error("Backup Error:", e);
      alert("Backup ပြုလုပ်ရာတွင် အမှားတစ်ခုရှိနေပါသည်။");
    }
    setProcessing(false);
  };

  const handlePickFile = async () => {
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
        content = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      }

      setBackupText(content);
      const msg = "ဖိုင်ထဲမှ အချက်အလက်များကို ထည့်သွင်းပြီးပါပြီ။ Restore ခလုတ်နှိပ်၍ ဆက်လက်လုပ်ဆောင်ပါ။";
      if (Platform.OS === "web") {
        alert(msg);
      } else {
        Alert.alert("File Loaded", msg);
      }
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "ဖိုင်ဖွင့်မရနိုင်ပါ။");
    }
  };

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setBackupText(text);
      if (Platform.OS === 'android') {
        ToastAndroid.show("Pasted from Clipboard", ToastAndroid.SHORT);
      }
    }
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
    
    // Events နှင့် Custom Categories များကို သီးသန့်ပြန်ထည့်မည်
    try {
      const parsed = JSON.parse(backupText);
      if (parsed.events) {
        await AsyncStorage.setItem("@org_events", JSON.stringify(parsed.events));
      }
      if (parsed.customCategories) {
        await AsyncStorage.setItem("@custom_categories", JSON.stringify(parsed.customCategories));
      }
    } catch (e) { console.log("Extra data restore error", e); }

    const success = await restoreData(backupText);
    if (success) {
      if (refreshData) await refreshData();
      
      if (Platform.OS === 'web') {
        alert("အောင်မြင်ပါသည်\nအချက်အလက်များ ပြန်လည်ထည့်သွင်းပြီးပါပြီ။");
        window.location.reload();
      } else {
        Alert.alert(
          "Success",
          "အချက်အလက်များ ပြန်လည်ထည့်သွင်းပြီးပါပြီ။ App ကို Restart ပြုလုပ်ပါမည်။",
          [{ 
            text: "OK", 
            onPress: async () => {
              try {
                await Updates.reloadAsync();
              } catch {
                router.replace("/");
              }
            } 
          }]
        );
      }
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
        <Pressable onPress={() => router.replace("/")} style={[styles.backBtn, { marginLeft: 130 }]}>
          <Ionicons name="home" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { flex: 1, textAlign: 'center' }]}>System Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.instruction}>Data Backup & Restore System</Text>
          
          <View style={styles.autoBackupCard}>
             <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                <Text style={styles.cardTitle}>Local Auto Backup</Text>
                <Switch value={isAutoBackup} onValueChange={toggleAutoBackup} trackColor={{ false: "#767577", true: Colors.light.tint }} />
             </View>
             <Text style={styles.cardDesc}>
               ဖွင့်ထားပါက အချက်အလက်ပြောင်းလဲတိုင်း ဖုန်းထဲတွင် အလိုအလျောက် သိမ်းဆည်းပေးပါမည်။
             </Text>
             {lastBackupDate && <Text style={styles.lastBackup}>Last saved: {lastBackupDate}</Text>}
             
             <Pressable style={styles.restoreAutoBtn} onPress={handleRestoreAuto}>
                <Text style={styles.restoreAutoText}>Restore from Auto-Backup</Text>
             </Pressable>
          </View>

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
                <Text style={styles.btnText}>Backup (Share / Save to Drive)</Text>
              </View>
            )}
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <Pressable 
              style={[styles.actionBtn, { backgroundColor: "#8B5CF6", flex: 1 }]} 
              onPress={handlePickFile}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="document-text-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={[styles.btnText, { fontSize: 14 }]}>Select File</Text>
              </View>
            </Pressable>

            <Pressable 
              style={[styles.actionBtn, { backgroundColor: "#059669", flex: 1 }]} 
              onPress={handlePaste}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="clipboard-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={[styles.btnText, { fontSize: 14 }]}>Paste Text</Text>
              </View>
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            multiline
            placeholder="Restore လုပ်ရန် Backup စာသားများကို ဒီမှာ Paste လုပ်ပါ (သို့မဟုတ်) အပေါ်ကခလုတ်ဖြင့် ဖိုင်ရွေးပါ..."
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
              <Text style={styles.btnText}>Restore Data</Text>
            </View>
          </Pressable>

          <View style={styles.divider} />
          <Pressable style={[styles.actionBtn, { backgroundColor: "#EF4444" }]} onPress={handleClear}>
            <Text style={styles.btnText}>System Reset (Delete All)</Text>
          </Pressable>

          <Pressable 
            style={[styles.actionBtn, { backgroundColor: "#64748B", marginTop: 15 }]} 
            onPress={() => router.replace("/")}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="home" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.btnText}>Dashboard သို့ပြန်သွားရန်</Text>
            </View>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        transparent={true}
        animationType="fade"
        visible={importing}
        onRequestClose={() => {}}
      >
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.light.tint} />
            <Text style={styles.loadingText}>Restoring Data...</Text>
            <Text style={styles.loadingSubText}>Please wait while we process your backup file.</Text>
          </View>
        </View>
      </Modal>

      <FloatingTabMenu />
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
  autoBackupCard: { backgroundColor: Colors.light.surface, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, marginBottom: 20 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  cardDesc: { fontSize: 12, color: Colors.light.textSecondary, marginBottom: 10, lineHeight: 18 },
  lastBackup: { fontSize: 11, color: Colors.light.tint, marginBottom: 10, fontStyle: 'italic' },
  restoreAutoBtn: { backgroundColor: Colors.light.background, padding: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Colors.light.border },
  restoreAutoText: { color: Colors.light.text, fontSize: 13, fontFamily: "Inter_500Medium" },
  loadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingBox: {
    width: "86%",
    maxWidth: 360,
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
    fontSize: 16,
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  loadingSubText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
});

import React from "react";
import { StyleSheet, Text, View, Pressable, Alert, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { clearAllData } from "@/lib/storage";

export default function SystemScreen() {
  const insets = useSafeAreaInsets();
  const { refreshData } = useData() as any;

  const handleSystemReset = () => {
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
              {
                text: "ဖျက်မည်",
                style: "destructive",
                onPress: async () => {
                  await clearAllData();
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

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 20 }]}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>System Management</Text>
      <Text style={styles.subtitle}>Manage your data and settings</Text>

      <View style={styles.menuContainer}>
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

      <View style={styles.infoSection}>
        <Text style={styles.sectionHeader}>System Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>App Version</Text>
          <Text style={styles.infoValue}>1.0.0 (Beta)</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Developer</Text>
          <Text style={styles.infoValue}>MR. SOE MYINT SWE</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Technology</Text>
          <Text style={styles.infoValue}>React Native / Expo / Gemini AI</Text>
        </View>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.sectionHeader}>အသုံးပြုနည်း လမ်းညွှန် (User Guide)</Text>
        <Text style={styles.guideText}>
          ၁။ <Text style={{fontWeight: 'bold'}}>Dashboard</Text>: အသင်းဝင်၊ ငွေစာရင်းနှင့် ချေးငွေ အနှစ်ချုပ်များကို ကြည့်ရှုနိုင်ပါသည်။{"\n\n"}
          ၂။ <Text style={{fontWeight: 'bold'}}>ငွေစာရင်း</Text>: ဝင်ငွေ/ထွက်ငွေ၊ ဘဏ်သွင်း/ထုတ် နှင့် ချေးငွေများကို စာရင်းသွင်းနိုင်ပါသည်။{"\n\n"}
          ၃။ <Text style={{fontWeight: 'bold'}}>အစီရင်ခံစာ</Text>: လအလိုက်၊ နှစ်အလိုက် ငွေစာရင်းရှင်းတမ်းများနှင့် အသင်းဝင်ကြေး ပေးသွင်းမှုများကို စစ်ဆေးနိုင်ပါသည်။{"\n\n"}
          ၄။ <Text style={{fontWeight: 'bold'}}>System</Text>: အချက်အလက်များကို Backup လုပ်ခြင်း၊ ပြန်လည်ထည့်သွင်းခြင်း (Restore) နှင့် System Reset ပြုလုပ်ခြင်းများ ဆောင်ရွက်နိုင်ပါသည်။
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
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
          onPress={() => router.push("/import-members")}
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
});
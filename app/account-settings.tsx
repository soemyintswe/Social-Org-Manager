import React, { useState } from "react";
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

export default function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { accountSettings, updateAccountSettings } = useData();
  
  const [saving, setSaving] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAccountSettings({
        openingBalanceCash: accountSettings.openingBalanceCash,
        openingBalanceBank: accountSettings.openingBalanceBank,
        currency: accountSettings.currency || "MMK",
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert("Error", "Failed to save settings");
    } finally {
      setSaving(false);
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
            <Ionicons name="cloud-offline" size={24} color="#F59E0B" />
          </View>
          <View style={styles.storageTextContainer}>
            <Text style={styles.storageTitle}>Storage: Offline (Local)</Text>
            <Text style={styles.storageDesc}>
              အချက်အလက်များကို ဤစက်ထဲတွင်သာ သိမ်းဆည်းထားပါသည်။ အခြားစက်နှင့် ချိတ်ဆက်အသုံးပြုလိုပါက Backup/Restore ပြုလုပ်ရန် လိုအပ်ပါသည်။
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.dataManagementBtn}
          onPress={() => router.push("/data-management")}
        >
          <Ionicons name="server-outline" size={20} color={Colors.light.text} />
          <Text style={styles.dataManagementText}>System & Data Management (Backup/Restore)</Text>
          <Ionicons name="chevron-forward" size={20} color={Colors.light.textSecondary} />
        </Pressable>
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
});

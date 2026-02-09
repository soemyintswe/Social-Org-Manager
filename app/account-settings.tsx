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

  const [cashBalance, setCashBalance] = useState(accountSettings.openingBalanceCash.toString());
  const [bankBalance, setBankBalance] = useState(accountSettings.openingBalanceBank.toString());
  const [asOfDate, setAsOfDate] = useState(accountSettings.asOfDate);
  const [saving, setSaving] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAccountSettings({
        openingBalanceCash: parseFloat(cashBalance) || 0,
        openingBalanceBank: parseFloat(bankBalance) || 0,
        asOfDate: (asOfDate || "").trim(),
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
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.light.tint} />
          <Text style={styles.infoText}>
            Set your opening balances. All transactions will be calculated from these values to determine your closing balances.
          </Text>
        </View>

        <Text style={styles.label}>Opening Cash Balance</Text>
        <TextInput
          style={styles.input}
          value={cashBalance}
          onChangeText={setCashBalance}
          placeholder="0.00"
          placeholderTextColor={Colors.light.textSecondary}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Opening Bank Balance</Text>
        <TextInput
          style={styles.input}
          value={bankBalance}
          onChangeText={setBankBalance}
          placeholder="0.00"
          placeholderTextColor={Colors.light.textSecondary}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>As Of Date (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={asOfDate}
          onChangeText={setAsOfDate}
          placeholder="2026-01-01"
          placeholderTextColor={Colors.light.textSecondary}
        />
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
});

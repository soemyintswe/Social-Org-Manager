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
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";

export default function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { accountSettings, updateAccountSettings } = useData();
  
  const parseDateString = (dateString: string): Date => {
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return new Date();
    }
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  };
  
  const formatDateDisplay = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };
  
  const [cashBalance, setCashBalance] = useState(accountSettings.openingBalanceCash.toString());
  const [bankBalance, setBankBalance] = useState(accountSettings.openingBalanceBank.toString());
  const [asOfDate, setAsOfDate] = useState<Date>(parseDateString(accountSettings.asOfDate));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
        setShowDatePicker(false);
    }
    if (selectedDate) {
        setAsOfDate(selectedDate);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAccountSettings({
        openingBalanceCash: parseFloat(cashBalance) || 0,
        openingBalanceBank: parseFloat(bankBalance) || 0,
        asOfDate: `${asOfDate.getFullYear()}-${String(asOfDate.getMonth() + 1).padStart(2, '0')}-${String(asOfDate.getDate()).padStart(2, '0')}`,
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

        <Text style={styles.label}>As Of Date</Text>
        {Platform.OS === 'web' ? (
            <View style={styles.dropdown}>
                {React.createElement('input', {
                    type: 'date',
                    value: `${asOfDate.getFullYear()}-${String(asOfDate.getMonth() + 1).padStart(2, '0')}-${String(asOfDate.getDate()).padStart(2, '0')}`,
                    onChange: (event: any) => {
                        if (event.target.value) {
                            const [y, m, d] = event.target.value.split('-');
                            setAsOfDate(new Date(+y, +m - 1, +d));
                        }
                    },
                    style: {
                        width: '100%',
                        border: 'none',
                        outline: 'none',
                        backgroundColor: 'transparent',
                        fontSize: 16,
                        color: Colors.light.text,
                        fontFamily: 'inherit'
                    } as any
                })}
            </View>
        ) : (
            <>
                <Pressable style={styles.dropdown} onPress={() => setShowDatePicker(true)}>
                    <Text style={styles.dropdownText}>{formatDateDisplay(asOfDate)}</Text>
                    <Ionicons name="calendar-outline" size={20} color={Colors.light.textSecondary} />
                </Pressable>
                {showDatePicker && <DateTimePicker 
                  value={asOfDate} 
                  mode="date" 
                  display="default" 
                  onChange={handleDateChange} 
                />}
            </>
        )}
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
});

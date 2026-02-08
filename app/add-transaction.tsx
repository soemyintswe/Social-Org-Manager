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
import {
  TransactionType,
  TransactionCategory,
  PaymentMethod,
  CATEGORY_LABELS,
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
} from "@/lib/types";
import { generateReceiptNumber } from "@/lib/storage";

export default function AddTransactionScreen() {
  const insets = useSafeAreaInsets();
  const { addTransaction, members } = useData();
  const [txnType, setTxnType] = useState<TransactionType>("income");
  const [category, setCategory] = useState<TransactionCategory>("monthly_fee");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [memberId, setMemberId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const categories = txnType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const canSave = amount.trim().length > 0 && parseFloat(amount) > 0 && date.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date.trim())) {
      Alert.alert("Invalid Date", "Please enter date in YYYY-MM-DD format");
      return;
    }
    setSaving(true);
    try {
      await addTransaction({
        type: txnType,
        category,
        amount: parseFloat(amount),
        memberId: memberId || undefined,
        description: description.trim(),
        date: date.trim(),
        paymentMethod,
        receiptNumber: generateReceiptNumber(),
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert("Error", "Failed to save transaction");
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
        <Text style={styles.headerTitle}>New Transaction</Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSave || saving}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.saveBtn, (!canSave || saving) && { opacity: 0.4 }]}>Save</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>Type</Text>
        <View style={styles.typeRow}>
          <Pressable
            onPress={() => {
              setTxnType("income");
              setCategory("monthly_fee");
            }}
            style={[styles.typeChip, txnType === "income" && styles.typeChipIncome]}
          >
            <Ionicons name="arrow-down" size={16} color={txnType === "income" ? "#fff" : Colors.light.success} />
            <Text style={[styles.typeChipText, txnType === "income" && { color: "#fff" }]}>Income</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setTxnType("expense");
              setCategory("welfare_health");
            }}
            style={[styles.typeChip, txnType === "expense" && styles.typeChipExpense]}
          >
            <Ionicons name="arrow-up" size={16} color={txnType === "expense" ? "#fff" : Colors.light.accent} />
            <Text style={[styles.typeChipText, txnType === "expense" && { color: "#fff" }]}>Expense</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Category</Text>
        <View style={styles.categoryWrap}>
          {categories.map((cat) => (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat)}
              style={[styles.catChip, category === cat && styles.catChipActive]}
            >
              <Text style={[styles.catChipText, category === cat && styles.catChipTextActive]}>
                {CATEGORY_LABELS[cat]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Amount *</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor={Colors.light.textSecondary}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Date * (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="2026-02-06"
          placeholderTextColor={Colors.light.textSecondary}
        />

        <Text style={styles.label}>Payment Method</Text>
        <View style={styles.typeRow}>
          <Pressable
            onPress={() => setPaymentMethod("cash")}
            style={[styles.methodChip, paymentMethod === "cash" && styles.methodChipActive]}
          >
            <Ionicons name="cash-outline" size={16} color={paymentMethod === "cash" ? "#fff" : Colors.light.text} />
            <Text style={[styles.methodChipText, paymentMethod === "cash" && { color: "#fff" }]}>Cash</Text>
          </Pressable>
          <Pressable
            onPress={() => setPaymentMethod("bank")}
            style={[styles.methodChip, paymentMethod === "bank" && styles.methodChipActive]}
          >
            <Ionicons name="business-outline" size={16} color={paymentMethod === "bank" ? "#fff" : Colors.light.text} />
            <Text style={[styles.methodChipText, paymentMethod === "bank" && { color: "#fff" }]}>Bank</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Member (optional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberScroll}>
          <Pressable
            onPress={() => setMemberId("")}
            style={[styles.memberChip, !memberId && styles.memberChipActive]}
          >
            <Text style={[styles.memberChipText, !memberId && styles.memberChipTextActive]}>None</Text>
          </Pressable>
          {members.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setMemberId(m.id)}
              style={[styles.memberChip, memberId === m.id && styles.memberChipActive]}
            >
              <Text style={[styles.memberChipText, memberId === m.id && styles.memberChipTextActive]}>
                {m.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="Optional note..."
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
  typeRow: {
    flexDirection: "row",
    gap: 10,
  },
  typeChip: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  typeChipIncome: {
    backgroundColor: Colors.light.success,
    borderColor: Colors.light.success,
  },
  typeChipExpense: {
    backgroundColor: Colors.light.accent,
    borderColor: Colors.light.accent,
  },
  typeChipText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  categoryWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  catChipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  catChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  catChipTextActive: {
    color: "#fff",
  },
  methodChip: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  methodChipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  methodChipText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  memberScroll: {
    flexGrow: 0,
  },
  memberChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginRight: 8,
  },
  memberChipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  memberChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  memberChipTextActive: {
    color: "#fff",
  },
});

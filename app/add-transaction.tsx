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

  const handleTypeChange = (type: TransactionType) => {
    setTxnType(type);
  setCategory(type === "income" ? ("monthly_fee" as TransactionCategory) : ("general_expense" as TransactionCategory));
  };

  const canSave = amount.trim().length > 0 && parseFloat(amount) > 0 && date.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;

    setSaving(true);
    try {
      const now = new Date().toISOString();

      // Error ကို ဖြေရှင်းရန် createdAt ကို ထည့်သွင်းလိုက်ပြီး memberId ကို string အဖြစ် သေချာစေခြင်း
      await addTransaction({
        type: txnType,
        category,
        amount: parseFloat(amount),
        memberId: memberId || "", // undefined မဖြစ်စေရန်
        description: description.trim(),
        date,
        paymentMethod,
        receiptNumber: generateReceiptNumber(),
        createdAt: now, // ဒီနေရာမှာ createdAt လိုအပ်နေခြင်းဖြစ်ပါသည်
      });

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "ငွေစာရင်း သိမ်းဆည်း၍ မရပါ။");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 || webTopInset }]}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>New Transaction</Text>
        <Pressable 
          onPress={handleSave} 
          disabled={!canSave || saving}
          style={({ pressed }) => [{ opacity: !canSave || saving ? 0.5 : pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.saveBtn}>{saving ? "Saving..." : "Save"}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.form}>
        <View style={styles.typeRow}>
          <Pressable
            onPress={() => handleTypeChange("income")}
            style={[styles.typeBtn, txnType === "income" && styles.typeBtnIncome]}
          >
            <Text style={[styles.typeBtnText, txnType === "income" && styles.typeBtnTextActive]}>
              Income
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleTypeChange("expense")}
            style={[styles.typeBtn, txnType === "expense" && styles.typeBtnExpense]}
          >
            <Text style={[styles.typeBtnText, txnType === "expense" && styles.typeBtnTextActive]}>
              Expense
            </Text>
          </Pressable>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Category</Text>
          <View style={styles.catGrid}>
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
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Date</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={date}
            onChangeText={setDate}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Payment Method</Text>
          <View style={styles.typeRow}>
            <Pressable
              style={[styles.methodChip, paymentMethod === "cash" && styles.methodChipActive]}
              onPress={() => setPaymentMethod("cash")}
            >
              <Ionicons name="cash-outline" size={20} color={paymentMethod === "cash" ? "#fff" : Colors.light.text} />
              <Text style={[styles.methodChipText, paymentMethod === "cash" && { color: "#fff" }]}>Cash</Text>
            </Pressable>
            <Pressable
              style={[styles.methodChip, paymentMethod === "bank" && styles.methodChipActive]}
              onPress={() => setPaymentMethod("bank")}
            >
              <Ionicons name="card-outline" size={20} color={paymentMethod === "bank" ? "#fff" : Colors.light.text} />
              <Text style={[styles.methodChipText, paymentMethod === "bank" && { color: "#fff" }]}>Bank</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Related Member (Optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberScroll}>
            <Pressable
              onPress={() => setMemberId("")}
              style={[styles.memberChip, memberId === "" && styles.memberChipActive]}
            >
              <Text style={[styles.memberChipText, memberId === "" && styles.memberChipTextActive]}>None</Text>
            </Pressable>
            {members.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => setMemberId(m.id)}
                style={[styles.memberChip, memberId === m.id && styles.memberChipActive]}
              >
                <Text style={[styles.memberChipText, memberId === m.id && styles.memberChipTextActive]}>{m.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, { height: 100 }]}
            placeholder="Notes..."
            multiline
            value={description}
            onChangeText={setDescription}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, backgroundColor: Colors.light.surface },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  saveBtn: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.tint },
  form: { padding: 20 },
  typeRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  typeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  typeBtnIncome: { backgroundColor: "#10B981", borderColor: "#10B981" },
  typeBtnExpense: { backgroundColor: "#EF4444", borderColor: "#EF4444" },
  typeBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  typeBtnTextActive: { color: "#fff" },
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginBottom: 8, textTransform: "uppercase" },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  catChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  catChipText: { fontSize: 13, color: Colors.light.text },
  catChipTextActive: { color: "#fff" },
  input: { backgroundColor: Colors.light.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border },
  methodChip: { flex: 1, flexDirection: "row", paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border, alignItems: "center", justifyContent: "center", gap: 6 },
  methodChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  methodChipText: { fontSize: 14, color: Colors.light.text },
  memberScroll: { flexGrow: 0 },
  memberChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border, marginRight: 8 },
  memberChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  memberChipText: { fontSize: 13, color: Colors.light.text },
  memberChipTextActive: { color: "#fff" },
});
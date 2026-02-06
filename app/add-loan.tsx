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
import { generateReceiptNumber } from "@/lib/storage";

export default function AddLoanScreen() {
  const insets = useSafeAreaInsets();
  const { addLoan, addTransaction, members } = useData();
  const [memberId, setMemberId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank">("cash");
  const [saving, setSaving] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const canSave =
    memberId.length > 0 &&
    principal.trim().length > 0 &&
    parseFloat(principal) > 0 &&
    interestRate.trim().length > 0 &&
    issueDate.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(issueDate.trim())) {
      Alert.alert("Invalid Date", "Please enter date in YYYY-MM-DD format");
      return;
    }
    setSaving(true);
    try {
      const loan = await addLoan({
        memberId,
        principalAmount: parseFloat(principal),
        interestRate: parseFloat(interestRate),
        issueDate: issueDate.trim(),
        status: "active",
        description: description.trim(),
      });

      await addTransaction({
        type: "expense",
        category: "loan_issued",
        amount: parseFloat(principal),
        memberId,
        description: `Loan issued - ${description.trim() || "Loan"}`,
        date: issueDate.trim(),
        paymentMethod,
        receiptNumber: generateReceiptNumber(),
        loanId: loan.id,
      });

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert("Error", "Failed to save loan");
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
        <Text style={styles.headerTitle}>Issue Loan</Text>
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
        <Text style={styles.label}>Member *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberScroll}>
          {members.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setMemberId(m.id)}
              style={[styles.memberChip, memberId === m.id && styles.memberChipActive]}
            >
              <Text style={[styles.memberChipText, memberId === m.id && styles.memberChipTextActive]}>
                {m.firstName} {m.lastName}
              </Text>
            </Pressable>
          ))}
          {members.length === 0 && (
            <Text style={styles.noMembers}>Add members first</Text>
          )}
        </ScrollView>

        <Text style={styles.label}>Principal Amount *</Text>
        <TextInput
          style={styles.input}
          value={principal}
          onChangeText={setPrincipal}
          placeholder="0.00"
          placeholderTextColor={Colors.light.textSecondary}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Monthly Interest Rate (%) *</Text>
        <TextInput
          style={styles.input}
          value={interestRate}
          onChangeText={setInterestRate}
          placeholder="2.0"
          placeholderTextColor={Colors.light.textSecondary}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Issue Date * (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={issueDate}
          onChangeText={setIssueDate}
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

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="Purpose of loan..."
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
  memberScroll: { flexGrow: 0 },
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
  memberChipTextActive: { color: "#fff" },
  noMembers: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  typeRow: {
    flexDirection: "row",
    gap: 10,
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
});

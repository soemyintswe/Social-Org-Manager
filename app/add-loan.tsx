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
    if (!canSave) return;

    setSaving(true);
    try {
      const amountValue = parseFloat(principal);
      const now = new Date().toISOString();

      // နာမည် နှစ်မျိုးလုံးထည့်ပေးခြင်းဖြင့် TypeScript Error ကို ကျော်ဖြတ်ပါမည်
      const loanData: any = {
        memberId,
        amount: amountValue,
        principalAmount: amountValue,
        interestRate: parseFloat(interestRate),
        startDate: issueDate,
        issueDate: issueDate,
        status: "active",
        description: description.trim(),
        createdAt: now,
      };

      const newLoan = await addLoan(loanData);

      await addTransaction({
        type: "expense",
        category: "loan_issued",
        amount: amountValue,
        memberId,
        description: `Loan issued to ${members.find(m => m.id === memberId)?.name || 'Member'}`,
        date: issueDate,
        paymentMethod,
        receiptNumber: generateReceiptNumber(),
        loanId: newLoan.id,
        createdAt: now,
      });

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "ချေးငွေစာရင်း သိမ်းဆည်း၍ မရပါ။");
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
        <Text style={styles.headerTitle}>New Loan</Text>
        <Pressable 
          onPress={handleSave} 
          disabled={!canSave || saving}
          style={({ pressed }) => [{ opacity: !canSave || saving ? 0.5 : pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.saveBtn}>{saving ? "Saving..." : "Save"}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Select Member</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberScroll}>
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
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Principal Amount</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            keyboardType="numeric"
            value={principal}
            onChangeText={setPrincipal}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Interest Rate (%)</Text>
          <TextInput
            style={styles.input}
            placeholder="0.0"
            keyboardType="numeric"
            value={interestRate}
            onChangeText={setInterestRate}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Issue Date</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={issueDate}
            onChangeText={setIssueDate}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Payment Method</Text>
          <View style={styles.typeRow}>
            {["cash", "bank"].map((method) => (
              <Pressable
                key={method}
                style={[styles.methodChip, paymentMethod === method && styles.methodChipActive]}
                onPress={() => setPaymentMethod(method as any)}
              >
                <Text style={[styles.methodText, paymentMethod === method && styles.methodTextActive]}>
                  {method.charAt(0).toUpperCase() + method.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
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
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginBottom: 8, textTransform: "uppercase" },
  input: { backgroundColor: Colors.light.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border },
  memberScroll: { flexDirection: "row" },
  memberChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border, marginRight: 8 },
  memberChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  memberChipText: { fontSize: 13, color: Colors.light.text },
  memberChipTextActive: { color: "#fff" },
  typeRow: { flexDirection: "row", gap: 10 },
  methodChip: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  methodChipActive: { backgroundColor: Colors.light.tintLight, borderColor: Colors.light.tint },
  methodText: { fontSize: 14, color: Colors.light.text },
  methodTextActive: { color: Colors.light.tint, fontWeight: "600" },
});
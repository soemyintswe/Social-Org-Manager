import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { generateReceiptNumber } from "@/lib/storage";

export default function LoanDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { 
    loans, 
    members, 
    transactions, 
    getLoanOutstanding, 
    getLoanInterestDue, 
    editLoan,
    addTransaction, 
    removeLoan 
  } = useData();

  const loan = loans?.find((l) => l.id === id);
  const member = members?.find((m) => m.id === loan?.memberId);
  const loanRepayments = useMemo(() => 
    transactions?.filter((t) => t.loanId === id && t.type === "income") || [],
    [transactions, id],
  );

  const [showRepayment, setShowRepayment] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");
  const [repayMethod, setRepayMethod] = useState<"cash" | "bank">("cash");
  const [showInterestSettings, setShowInterestSettings] = useState(false);
  const [interestSuspended, setInterestSuspended] = useState(Boolean((loan as any)?.interestSuspended));
  const [interestRateOverride, setInterestRateOverride] = useState(String((loan as any)?.interestRateOverride ?? ""));
  const [interestDiscountPercent, setInterestDiscountPercent] = useState(String((loan as any)?.interestDiscountPercent ?? ""));
  const [interestDiscountAmount, setInterestDiscountAmount] = useState(String((loan as any)?.interestDiscountAmount ?? ""));
  const [interestWaivedAmount, setInterestWaivedAmount] = useState(String((loan as any)?.interestWaivedAmount ?? ""));
  const [interestAdjustmentNote, setInterestAdjustmentNote] = useState(String((loan as any)?.interestAdjustmentNote ?? ""));
  const [saving, setSaving] = useState(false);

  if (!loan) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text>Loan record not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: Colors.light.tint }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const outstanding = getLoanOutstanding(loan.id);
  const interestDue = getLoanInterestDue(loan.id);
  const baseRate = Number((loan as any)?.interestRate || 0);
  const overrideRateNum = Number(interestRateOverride);
  const effectiveRate = Number.isFinite(overrideRateNum) && overrideRateNum >= 0 ? overrideRateNum : baseRate;
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const handleRepayment = async () => {
    const amount = parseFloat(repayAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Error", "မှန်ကန်သော ငွေပမာဏကို ရိုက်ထည့်ပါ။");
      return;
    }

    setSaving(true);
    try {
      await addTransaction({
        type: "income",
        category: "loan_repayment",
        amount: amount,
        memberId: loan.memberId,
        loanId: loan.id,
        date: new Date().toISOString().split("T")[0],
        paymentMethod: repayMethod,
        description: `Loan repayment from ${member?.name || "Member"}`,
        receiptNumber: generateReceiptNumber(),
        createdAt: new Date().toISOString(),
      });

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRepayment(false);
      setRepayAmount("");
      Alert.alert("Success", "ပေးဆပ်မှု မှတ်တမ်းတင်ပြီးပါပြီ။");
    } catch (err) {
      Alert.alert("Error", "သိမ်းဆည်း၍ မရပါ။");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete Loan", "ဤချေးငွေမှတ်တမ်းကို ဖျက်ရန် သေချာပါသလား?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await removeLoan(loan.id);
          router.back();
        },
      },
    ]);
  };

  const toNumberOrUndefined = (value: string) => {
    if (String(value ?? "").trim() === "") return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  };

  const saveInterestSettings = async () => {
    setSaving(true);
    try {
      await editLoan(loan.id, {
        interestSuspended,
        interestRateOverride: toNumberOrUndefined(interestRateOverride),
        interestDiscountPercent: toNumberOrUndefined(interestDiscountPercent),
        interestDiscountAmount: toNumberOrUndefined(interestDiscountAmount),
        interestWaivedAmount: toNumberOrUndefined(interestWaivedAmount),
        interestAdjustmentNote: String(interestAdjustmentNote || "").trim(),
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowInterestSettings(false);
      Alert.alert("အောင်မြင်ပါသည်", "အတိုးသတ်မှတ်ချက်များကို သိမ်းပြီးပါပြီ။");
    } catch {
      Alert.alert("အမှား", "အတိုးသတ်မှတ်ချက် သိမ်းဆည်း၍ မရပါ။");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 || webTopInset }]}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Loan Details</Text>
        <Pressable onPress={handleDelete}>
          <Ionicons name="trash-outline" size={24} color="#EF4444" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Borrower</Text>
          <Text style={styles.borrowerName}>{member?.name || "Unknown Member"}</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Principal</Text>
              <Text style={styles.statValue}>{(loan as any).principal || (loan as any).amount || (loan as any).principalAmount || 0} MMK</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Interest Rate</Text>
              <Text style={styles.statValue}>{effectiveRate}%</Text>
            </View>
          </View>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>အရင်းပြန်ဆပ်ရန်ကျန်ငွေ</Text>
          <Text style={styles.balanceValue}>{outstanding.toLocaleString()} MMK</Text>
          <Text style={styles.interestHint}>အတိုးဆပ်ရန်ကျန်ငွေ: {interestDue.toLocaleString()} MMK</Text>
          <Text style={styles.interestHint}>
            အတိုးအခြေအနေ: {interestSuspended ? "ဆိုင်းငံ့ထား" : "လက်ရှိတွက်ချက်နေ"}
          </Text>

          <Pressable style={styles.repayBtn} onPress={() => setShowRepayment(true)}>
            <Text style={styles.repayBtnText}>Make Repayment</Text>
          </Pressable>
          <Pressable style={[styles.repayBtn, { marginTop: 10 }]} onPress={() => setShowInterestSettings((prev) => !prev)}>
            <Text style={styles.repayBtnText}>အတိုးသတ်မှတ်ချက် ပြင်မည်</Text>
          </Pressable>
        </View>

        {showInterestSettings && (
          <View style={styles.repayForm}>
            <Text style={styles.formTitle}>အတိုးသတ်မှတ်ချက်</Text>
            <Pressable style={[styles.methodOption, interestSuspended && styles.methodActive]} onPress={() => setInterestSuspended((prev) => !prev)}>
              <Text>{interestSuspended ? "အတိုးဆိုင်းငံ့ထားသည်" : "အတိုးတွက်ချက်နေသည်"}</Text>
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="အတိုးနှုန်းအသစ် (%) - လျှော့သတ်မှတ်လိုပါက"
              keyboardType="numeric"
              value={interestRateOverride}
              onChangeText={setInterestRateOverride}
            />
            <TextInput
              style={styles.input}
              placeholder="အတိုးလျှော့ရာခိုင်နှုန်း (%)"
              keyboardType="numeric"
              value={interestDiscountPercent}
              onChangeText={setInterestDiscountPercent}
            />
            <TextInput
              style={styles.input}
              placeholder="အတိုးလျှော့ပမာဏ (MMK)"
              keyboardType="numeric"
              value={interestDiscountAmount}
              onChangeText={setInterestDiscountAmount}
            />
            <TextInput
              style={styles.input}
              placeholder="အတိုးလျှော်ပစ်ပမာဏ (MMK)"
              keyboardType="numeric"
              value={interestWaivedAmount}
              onChangeText={setInterestWaivedAmount}
            />
            <TextInput
              style={[styles.input, { minHeight: 70 }]}
              placeholder="သတ်မှတ်ချက်မှတ်ချက်"
              multiline
              value={interestAdjustmentNote}
              onChangeText={setInterestAdjustmentNote}
            />
            <View style={styles.formActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowInterestSettings(false)}>
                <Text>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={saveInterestSettings} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {showRepayment && (
          <View style={styles.repayForm}>
            <Text style={styles.formTitle}>Add Repayment</Text>
            <TextInput
              style={styles.input}
              placeholder="Amount"
              keyboardType="numeric"
              value={repayAmount}
              onChangeText={setRepayAmount}
            />
            <View style={styles.methodRow}>
              <Pressable 
                style={[styles.methodOption, repayMethod === "cash" && styles.methodActive]} 
                onPress={() => setRepayMethod("cash")}
              >
                <Text>Cash</Text>
              </Pressable>
              <Pressable 
                style={[styles.methodOption, repayMethod === "bank" && styles.methodActive]} 
                onPress={() => setRepayMethod("bank")}
              >
                <Text>Bank</Text>
              </Pressable>
            </View>
            <View style={styles.formActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowRepayment(false)}>
                <Text>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={handleRepayment} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>History</Text>
        {loanRepayments.map((t) => (
          <View key={t.id} style={styles.historyItem}>
            <View>
              <Text style={styles.historyDate}>{t.date}</Text>
              <Text style={styles.historyMethod}>{t.paymentMethod.toUpperCase()}</Text>
            </View>
            <Text style={styles.historyAmount}>-{t.amount.toLocaleString()} MMK</Text>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center", padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, backgroundColor: Colors.light.surface },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  content: { padding: 20 },
  card: { backgroundColor: Colors.light.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.light.border },
  cardLabel: { fontSize: 12, color: Colors.light.textSecondary, textTransform: "uppercase" },
  borrowerName: { fontSize: 20, fontWeight: "700", color: Colors.light.text, marginVertical: 8 },
  statsGrid: { flexDirection: "row", marginTop: 12, gap: 20 },
  statBox: { flex: 1 },
  statLabel: { fontSize: 11, color: Colors.light.textSecondary },
  statValue: { fontSize: 15, fontWeight: "600", color: Colors.light.text },
  balanceCard: { backgroundColor: Colors.light.tint, borderRadius: 16, padding: 20, alignItems: "center", marginBottom: 20 },
  balanceLabel: { color: "rgba(255,255,255,0.8)", fontSize: 14 },
  balanceValue: { color: "#fff", fontSize: 28, fontWeight: "800", marginVertical: 8 },
  interestHint: { color: "rgba(255,255,255,0.9)", fontSize: 13, marginBottom: 16 },
  repayBtn: { backgroundColor: "#fff", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  repayBtnText: { color: Colors.light.tint, fontWeight: "700" },
  repayForm: { backgroundColor: Colors.light.surface, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: Colors.light.border },
  formTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  input: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 8, padding: 12, marginBottom: 12 },
  methodRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  methodOption: { flex: 1, padding: 10, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 8, alignItems: "center" },
  methodActive: { backgroundColor: Colors.light.tintLight, borderColor: Colors.light.tint },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
  cancelBtn: { padding: 10 },
  saveBtn: { backgroundColor: Colors.light.tint, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  saveBtnText: { color: "#fff", fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  historyItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  historyDate: { fontSize: 14, color: Colors.light.text },
  historyMethod: { fontSize: 11, color: Colors.light.textSecondary },
  historyAmount: { fontSize: 15, fontWeight: "600", color: "#10B981" },
});

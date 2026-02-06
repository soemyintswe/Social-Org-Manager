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
  const { loans, members, transactions, getLoanOutstanding, getLoanInterestDue, addTransaction, editLoan, removeLoan } = useData();

  const loan = loans.find((l) => l.id === id);
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const [showRepayment, setShowRepayment] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");
  const [repayMethod, setRepayMethod] = useState<"cash" | "bank">("cash");
  const [repayDate, setRepayDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  if (!loan) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyText}>Loan not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const member = members.find((m) => m.id === loan.memberId);
  const memberName = member ? `${member.firstName} ${member.lastName}` : "Unknown";
  const outstanding = getLoanOutstanding(loan.id);
  const interestDue = getLoanInterestDue(loan.id);

  const repayments = transactions
    .filter((t) => t.loanId === loan.id && t.category === "loan_repayment")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalRepaid = repayments.reduce((s, t) => s + t.amount, 0);

  const handleRepay = async () => {
    const amt = parseFloat(repayAmount);
    if (!amt || amt <= 0) {
      Alert.alert("Invalid Amount", "Enter a valid repayment amount");
      return;
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(repayDate.trim())) {
      Alert.alert("Invalid Date", "Please enter date in YYYY-MM-DD format");
      return;
    }
    setSaving(true);
    try {
      await addTransaction({
        type: "income",
        category: "loan_repayment",
        amount: amt,
        memberId: loan.memberId,
        description: `Loan repayment - ${memberName}`,
        date: repayDate.trim(),
        paymentMethod: repayMethod,
        receiptNumber: generateReceiptNumber(),
        loanId: loan.id,
      });

      const newOutstanding = outstanding - amt;
      if (newOutstanding <= 0) {
        await editLoan(loan.id, { status: "paid" });
      }

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRepayment(false);
      setRepayAmount("");
    } catch {
      Alert.alert("Error", "Failed to record repayment");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete Loan", "This will remove the loan record. Transaction history will remain.", [
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

  const monthsSinceIssue = Math.max(
    0,
    (new Date().getFullYear() - new Date(loan.issueDate).getFullYear()) * 12 +
      (new Date().getMonth() - new Date(loan.issueDate).getMonth())
  );

  const totalInterestAccrued = loan.principalAmount * (loan.interestRate / 100) * monthsSinceIssue;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 + webTopInset }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
            <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
          </Pressable>
          <Pressable onPress={handleDelete} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
            <Ionicons name="trash-outline" size={22} color={Colors.light.accent} />
          </Pressable>
        </View>

        <View style={styles.loanHeader}>
          <View style={[styles.loanAvatar, { backgroundColor: member?.avatarColor || Colors.light.tint }]}>
            <Ionicons name="wallet" size={28} color="#fff" />
          </View>
          <Text style={styles.loanMember}>{memberName}</Text>
          <View style={[styles.statusBadge, loan.status === "active" ? styles.statusActive : styles.statusPaid]}>
            <Text style={[styles.statusText, loan.status === "active" ? styles.statusActiveText : styles.statusPaidText]}>
              {loan.status === "active" ? "Active" : "Paid Off"}
            </Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Principal</Text>
            <Text style={styles.summaryValue}>${loan.principalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Interest Rate</Text>
            <Text style={styles.summaryValue}>{loan.interestRate}% / month</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Months Since Issue</Text>
            <Text style={styles.summaryValue}>{monthsSinceIssue}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Interest Accrued</Text>
            <Text style={[styles.summaryValue, { color: Colors.light.warning }]}>
              ${totalInterestAccrued.toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Repaid</Text>
            <Text style={[styles.summaryValue, { color: Colors.light.success }]}>
              ${totalRepaid.toFixed(2)}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.outstandingRow]}>
            <Text style={styles.outstandingLabel}>Outstanding Balance</Text>
            <Text style={styles.outstandingValue}>${outstanding.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Monthly Interest Due</Text>
            <Text style={[styles.summaryValue, { color: Colors.light.accent }]}>
              ${interestDue.toFixed(2)}
            </Text>
          </View>
        </View>

        {loan.description ? (
          <View style={styles.descCard}>
            <Text style={styles.descLabel}>Description</Text>
            <Text style={styles.descText}>{loan.description}</Text>
          </View>
        ) : null}

        {loan.status === "active" && (
          <>
            {showRepayment ? (
              <View style={styles.repayForm}>
                <Text style={styles.repayTitle}>Record Repayment</Text>
                <Text style={styles.formLabel}>Amount</Text>
                <TextInput
                  style={styles.formInput}
                  value={repayAmount}
                  onChangeText={setRepayAmount}
                  placeholder="0.00"
                  placeholderTextColor={Colors.light.textSecondary}
                  keyboardType="decimal-pad"
                  autoFocus
                />
                <Text style={styles.formLabel}>Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.formInput}
                  value={repayDate}
                  onChangeText={setRepayDate}
                  placeholder="2026-02-06"
                  placeholderTextColor={Colors.light.textSecondary}
                />
                <Text style={styles.formLabel}>Method</Text>
                <View style={styles.methodRow}>
                  <Pressable
                    onPress={() => setRepayMethod("cash")}
                    style={[styles.methodChip, repayMethod === "cash" && styles.methodActive]}
                  >
                    <Text style={[styles.methodText, repayMethod === "cash" && { color: "#fff" }]}>Cash</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setRepayMethod("bank")}
                    style={[styles.methodChip, repayMethod === "bank" && styles.methodActive]}
                  >
                    <Text style={[styles.methodText, repayMethod === "bank" && { color: "#fff" }]}>Bank</Text>
                  </Pressable>
                </View>
                <View style={styles.repayActions}>
                  <Pressable
                    onPress={() => setShowRepayment(false)}
                    style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleRepay}
                    disabled={saving}
                    style={({ pressed }) => [styles.repayBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.repayBtnText}>{saving ? "Saving..." : "Record Payment"}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setShowRepayment(true)}
                style={({ pressed }) => [styles.addRepayBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="add-circle-outline" size={20} color={Colors.light.tint} />
                <Text style={styles.addRepayText}>Record Repayment</Text>
              </Pressable>
            )}
          </>
        )}

        <Text style={styles.sectionTitle}>Repayment History</Text>
        {repayments.length === 0 ? (
          <View style={styles.emptyRepayments}>
            <Text style={styles.emptyRepaymentsText}>No repayments recorded</Text>
          </View>
        ) : (
          repayments.map((r) => (
            <View key={r.id} style={styles.repayRow}>
              <View style={styles.repayInfo}>
                <Text style={styles.repayDate}>
                  {new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </Text>
                <Text style={styles.repayReceipt}>{r.receiptNumber}</Text>
              </View>
              <View style={styles.repayRight}>
                <Text style={styles.repayAmount}>${r.amount.toFixed(2)}</Text>
                <Text style={styles.repayMethod}>{r.paymentMethod.toUpperCase()}</Text>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  loanHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  loanAvatar: {
    width: 70,
    height: 70,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  loanMember: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusActive: { backgroundColor: "#3B82F6" + "15" },
  statusPaid: { backgroundColor: Colors.light.success + "15" },
  statusText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statusActiveText: { color: "#3B82F6" },
  statusPaidText: { color: Colors.light.success },
  summaryCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  outstandingRow: {
    borderBottomWidth: 0,
    paddingTop: 12,
  },
  outstandingLabel: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  outstandingValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.accent,
  },
  descCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  descLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  descText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
  },
  addRepayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.light.tintLight,
    marginBottom: 20,
  },
  addRepayText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
  repayForm: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  repayTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
    marginTop: 10,
    marginBottom: 4,
  },
  formInput: {
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  methodRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  methodChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
  },
  methodActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  methodText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  repayActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.light.background,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  repayBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
  },
  repayBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 12,
  },
  emptyRepayments: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
  },
  emptyRepaymentsText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  repayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  repayInfo: {},
  repayDate: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  repayReceipt: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  repayRight: {
    alignItems: "flex-end",
  },
  repayAmount: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.light.success,
  },
  repayMethod: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginBottom: 12,
  },
  backLink: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
});

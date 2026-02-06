import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { Transaction, Loan, CATEGORY_LABELS } from "@/lib/types";

type Tab = "transactions" | "loans";

function BalanceCard({ label, amount, icon, color }: {
  label: string;
  amount: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={[styles.balanceCard, { borderLeftColor: color }]}>
      <View style={[styles.balanceIcon, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.balanceLabel}>{label}</Text>
      <Text style={[styles.balanceAmount, { color }]}>
        {amount < 0 ? "-" : ""}${Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </Text>
    </View>
  );
}

function TransactionRow({ txn, memberName, onDelete }: {
  txn: Transaction;
  memberName: string;
  onDelete: () => void;
}) {
  const isIncome = txn.type === "income";
  return (
    <Pressable
      style={styles.txnRow}
      onLongPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert("Delete Transaction", `Remove receipt ${txn.receiptNumber}?`, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: onDelete },
        ]);
      }}
    >
      <View style={[styles.txnIcon, { backgroundColor: isIncome ? Colors.light.success + "15" : Colors.light.accent + "15" }]}>
        <Ionicons
          name={isIncome ? "arrow-down" : "arrow-up"}
          size={18}
          color={isIncome ? Colors.light.success : Colors.light.accent}
        />
      </View>
      <View style={styles.txnInfo}>
        <Text style={styles.txnCategory} numberOfLines={1}>{CATEGORY_LABELS[txn.category]}</Text>
        <Text style={styles.txnDesc} numberOfLines={1}>
          {memberName ? memberName + " - " : ""}{txn.description || txn.receiptNumber}
        </Text>
        <Text style={styles.txnDate}>
          {new Date(txn.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {" "}
          <Text style={styles.txnMethod}>{txn.paymentMethod.toUpperCase()}</Text>
        </Text>
      </View>
      <Text style={[styles.txnAmount, isIncome ? styles.incomeText : styles.expenseText]}>
        {isIncome ? "+" : "-"}${txn.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </Text>
    </Pressable>
  );
}

function LoanRow({ loan, memberName, outstanding, onPress }: {
  loan: Loan;
  memberName: string;
  outstanding: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.loanRow, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <View style={[styles.loanIcon, { backgroundColor: loan.status === "active" ? "#3B82F6" + "15" : Colors.light.success + "15" }]}>
        <Ionicons
          name={loan.status === "active" ? "wallet-outline" : "checkmark-circle-outline"}
          size={20}
          color={loan.status === "active" ? "#3B82F6" : Colors.light.success}
        />
      </View>
      <View style={styles.loanInfo}>
        <Text style={styles.loanName} numberOfLines={1}>{memberName}</Text>
        <Text style={styles.loanDesc} numberOfLines={1}>
          Principal: ${loan.principalAmount.toLocaleString()} @ {loan.interestRate}%/mo
        </Text>
        <Text style={styles.loanDate}>
          {new Date(loan.issueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </Text>
      </View>
      <View style={styles.loanRight}>
        <Text style={styles.loanOutstanding}>${outstanding.toFixed(2)}</Text>
        <View style={[styles.loanStatusBadge, loan.status === "active" ? styles.loanActive : styles.loanPaid]}>
          <Text style={[styles.loanStatusText, loan.status === "active" ? styles.loanActiveText : styles.loanPaidText]}>
            {loan.status === "active" ? "Active" : "Paid"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function FinanceScreen() {
  const insets = useSafeAreaInsets();
  const { transactions, loans, members, removeTransaction, getCashBalance, getBankBalance, getTotalBalance, getLoanOutstanding, loading } = useData();
  const [activeTab, setActiveTab] = useState<Tab>("transactions");

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const getMemberName = (id?: string) => {
    if (!id) return "";
    const m = members.find((m) => m.id === id);
    return m ? `${m.firstName} ${m.lastName}` : "";
  };

  const sortedTxns = useMemo(
    () => [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactions]
  );

  const sortedLoans = useMemo(
    () => [...loans].sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;
      return new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime();
    }),
    [loans]
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 + webTopInset }]}>
        <Text style={styles.headerTitle}>Finance</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push("/account-settings")}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="settings-outline" size={22} color={Colors.light.text} />
          </Pressable>
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (activeTab === "transactions") {
                router.push("/add-transaction");
              } else {
                router.push("/add-loan");
              }
            }}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="add" size={24} color={Colors.light.surface} />
          </Pressable>
        </View>
      </View>

      <View style={styles.balanceRow}>
        <BalanceCard label="Cash" amount={getCashBalance()} icon="cash-outline" color={Colors.light.success} />
        <BalanceCard label="Bank" amount={getBankBalance()} icon="business-outline" color="#3B82F6" />
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total Balance</Text>
        <Text style={styles.totalAmount}>
          ${getTotalBalance().toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </Text>
      </View>

      <View style={styles.tabRow}>
        <Pressable
          onPress={() => setActiveTab("transactions")}
          style={[styles.tab, activeTab === "transactions" && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === "transactions" && styles.tabTextActive]}>
            Transactions
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("loans")}
          style={[styles.tab, activeTab === "loans" && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === "loans" && styles.tabTextActive]}>
            Loans
          </Text>
        </Pressable>
      </View>

      {activeTab === "transactions" ? (
        <FlatList
          data={sortedTxns}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TransactionRow
              txn={item}
              memberName={getMemberName(item.memberId)}
              onDelete={() => removeTransaction(item.id)}
            />
          )}
          contentContainerStyle={[styles.list, sortedTxns.length === 0 && styles.center]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={40} color={Colors.light.textSecondary} />
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptyText}>Tap + to record your first transaction</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={sortedLoans}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LoanRow
              loan={item}
              memberName={getMemberName(item.memberId)}
              outstanding={getLoanOutstanding(item.id)}
              onPress={() => router.push({ pathname: "/loan-detail", params: { id: item.id } })}
            />
          )}
          contentContainerStyle={[styles.list, sortedLoans.length === 0 && styles.center]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="wallet-outline" size={40} color={Colors.light.textSecondary} />
              <Text style={styles.emptyTitle}>No loans yet</Text>
              <Text style={styles.emptyText}>Tap + to issue a new loan</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center", flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    justifyContent: "center",
    alignItems: "center",
  },
  balanceRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  balanceCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
  },
  balanceIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  balanceLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  balanceAmount: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  totalLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  totalAmount: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    backgroundColor: Colors.light.border,
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: Colors.light.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  tabTextActive: {
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 100,
  },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  txnIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  txnInfo: { flex: 1 },
  txnCategory: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  txnDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  txnDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  txnMethod: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
  txnAmount: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  incomeText: { color: Colors.light.success },
  expenseText: { color: Colors.light.accent },
  loanRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  loanIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  loanInfo: { flex: 1 },
  loanName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  loanDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  loanDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  loanRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  loanOutstanding: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  loanStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  loanActive: { backgroundColor: "#3B82F6" + "15" },
  loanPaid: { backgroundColor: Colors.light.success + "15" },
  loanStatusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  loanActiveText: { color: "#3B82F6" },
  loanPaidText: { color: Colors.light.success },
  emptyState: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
});

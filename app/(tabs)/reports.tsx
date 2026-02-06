import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { CATEGORY_LABELS, TransactionCategory, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/types";

const PERIOD_OPTIONS = [
  { label: "1M", months: 1 },
  { label: "3M", months: 3 },
  { label: "4M", months: 4 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
];

type ReportTab = "summary" | "fees";

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { transactions, members, accountSettings, loading } = useData();
  const [period, setPeriod] = useState(3);
  const [reportTab, setReportTab] = useState<ReportTab>("summary");

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - period);
    return d;
  }, [period]);

  const filteredTxns = useMemo(
    () => transactions.filter((t) => new Date(t.date) >= cutoffDate),
    [transactions, cutoffDate]
  );

  const totalIncome = useMemo(
    () => filteredTxns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
    [filteredTxns]
  );

  const totalExpense = useMemo(
    () => filteredTxns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    [filteredTxns]
  );

  const incomeByCategory = useMemo(() => {
    const map: Partial<Record<TransactionCategory, number>> = {};
    filteredTxns
      .filter((t) => t.type === "income")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return map;
  }, [filteredTxns]);

  const expenseByCategory = useMemo(() => {
    const map: Partial<Record<TransactionCategory, number>> = {};
    filteredTxns
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return map;
  }, [filteredTxns]);

  const openingBalance = accountSettings.openingBalanceCash + accountSettings.openingBalanceBank;
  const closingBalance = openingBalance +
    transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0) -
    transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const feeMonths = useMemo(() => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 0; i < period; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return months.reverse();
  }, [period]);

  const feeData = useMemo(() => {
    const feeTxns = transactions.filter((t) => t.category === "monthly_fee" && t.type === "income");
    return members.map((m) => {
      const monthlyStatus: Record<string, number> = {};
      feeMonths.forEach((month) => {
        const paid = feeTxns
          .filter((t) => {
            const txMonth = t.date.substring(0, 7);
            return t.memberId === m.id && txMonth === month;
          })
          .reduce((s, t) => s + t.amount, 0);
        monthlyStatus[month] = paid;
      });
      return { member: m, monthlyStatus };
    });
  }, [members, transactions, feeMonths]);

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
        <Text style={styles.headerTitle}>Reports</Text>
      </View>

      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map((opt) => (
          <Pressable
            key={opt.months}
            onPress={() => setPeriod(opt.months)}
            style={[styles.periodChip, period === opt.months && styles.periodChipActive]}
          >
            <Text style={[styles.periodText, period === opt.months && styles.periodTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.reportTabRow}>
        <Pressable
          onPress={() => setReportTab("summary")}
          style={[styles.reportTab, reportTab === "summary" && styles.reportTabActive]}
        >
          <Text style={[styles.reportTabText, reportTab === "summary" && styles.reportTabTextActive]}>
            Summary
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setReportTab("fees")}
          style={[styles.reportTab, reportTab === "fees" && styles.reportTabActive]}
        >
          <Text style={[styles.reportTabText, reportTab === "fees" && styles.reportTabTextActive]}>
            Fee Tracking
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {reportTab === "summary" ? (
          <>
            <View style={styles.balanceSummary}>
              <View style={styles.balanceSummaryRow}>
                <Text style={styles.balanceSummaryLabel}>Opening Balance</Text>
                <Text style={styles.balanceSummaryValue}>
                  ${openingBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.balanceSummaryRow}>
                <Text style={styles.balanceSummaryLabel}>Total Income ({period}M)</Text>
                <Text style={[styles.balanceSummaryValue, { color: Colors.light.success }]}>
                  +${totalIncome.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.balanceSummaryRow}>
                <Text style={styles.balanceSummaryLabel}>Total Expense ({period}M)</Text>
                <Text style={[styles.balanceSummaryValue, { color: Colors.light.accent }]}>
                  -${totalExpense.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={[styles.balanceSummaryRow, styles.closingRow]}>
                <Text style={styles.closingLabel}>Closing Balance</Text>
                <Text style={styles.closingValue}>
                  ${closingBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Income Breakdown</Text>
            <View style={styles.breakdownCard}>
              {INCOME_CATEGORIES.map((cat) => {
                const amt = incomeByCategory[cat] || 0;
                if (amt === 0) return null;
                return (
                  <View key={cat} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{CATEGORY_LABELS[cat]}</Text>
                    <Text style={[styles.breakdownValue, { color: Colors.light.success }]}>
                      ${amt.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                );
              })}
              {Object.keys(incomeByCategory).length === 0 && (
                <Text style={styles.noData}>No income in this period</Text>
              )}
            </View>

            <Text style={styles.sectionTitle}>Expense Breakdown</Text>
            <View style={styles.breakdownCard}>
              {EXPENSE_CATEGORIES.map((cat) => {
                const amt = expenseByCategory[cat] || 0;
                if (amt === 0) return null;
                return (
                  <View key={cat} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{CATEGORY_LABELS[cat]}</Text>
                    <Text style={[styles.breakdownValue, { color: Colors.light.accent }]}>
                      ${amt.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                );
              })}
              {Object.keys(expenseByCategory).length === 0 && (
                <Text style={styles.noData}>No expenses in this period</Text>
              )}
            </View>

            <Text style={styles.sectionTitle}>Cash vs Bank</Text>
            <View style={styles.breakdownCard}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Cash Income</Text>
                <Text style={[styles.breakdownValue, { color: Colors.light.success }]}>
                  ${filteredTxns.filter((t) => t.type === "income" && t.paymentMethod === "cash").reduce((s, t) => s + t.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Bank Income</Text>
                <Text style={[styles.breakdownValue, { color: Colors.light.success }]}>
                  ${filteredTxns.filter((t) => t.type === "income" && t.paymentMethod === "bank").reduce((s, t) => s + t.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Cash Expense</Text>
                <Text style={[styles.breakdownValue, { color: Colors.light.accent }]}>
                  ${filteredTxns.filter((t) => t.type === "expense" && t.paymentMethod === "cash").reduce((s, t) => s + t.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Bank Expense</Text>
                <Text style={[styles.breakdownValue, { color: Colors.light.accent }]}>
                  ${filteredTxns.filter((t) => t.type === "expense" && t.paymentMethod === "bank").reduce((s, t) => s + t.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.feeNote}>
              Monthly fee payments by member for the last {period} months
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.tableHeader}>
                  <View style={styles.tableNameCol}>
                    <Text style={styles.tableHeaderText}>Member</Text>
                  </View>
                  {feeMonths.map((month) => (
                    <View key={month} style={styles.tableMonthCol}>
                      <Text style={styles.tableHeaderText}>
                        {new Date(month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.tableTotalCol}>
                    <Text style={styles.tableHeaderText}>Total</Text>
                  </View>
                </View>
                {feeData.map((row) => {
                  const total = Object.values(row.monthlyStatus).reduce((s, v) => s + v, 0);
                  return (
                    <View key={row.member.id} style={styles.tableRow}>
                      <View style={styles.tableNameCol}>
                        <Text style={styles.tableName} numberOfLines={1}>
                          {row.member.firstName} {row.member.lastName}
                        </Text>
                      </View>
                      {feeMonths.map((month) => {
                        const paid = row.monthlyStatus[month] || 0;
                        return (
                          <View key={month} style={styles.tableMonthCol}>
                            {paid > 0 ? (
                              <View style={styles.paidBadge}>
                                <Text style={styles.paidText}>${paid}</Text>
                              </View>
                            ) : (
                              <View style={styles.unpaidBadge}>
                                <Ionicons name="close" size={12} color={Colors.light.accent} />
                              </View>
                            )}
                          </View>
                        );
                      })}
                      <View style={styles.tableTotalCol}>
                        <Text style={styles.tableTotalValue}>${total}</Text>
                      </View>
                    </View>
                  );
                })}
                {members.length === 0 && (
                  <View style={styles.noDataRow}>
                    <Text style={styles.noData}>No members to display</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center", flex: 1 },
  header: {
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  periodRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  periodChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.light.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  periodChipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  periodText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
  },
  periodTextActive: {
    color: "#fff",
  },
  reportTabRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    backgroundColor: Colors.light.border,
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  reportTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  reportTabActive: {
    backgroundColor: Colors.light.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  reportTabText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  reportTabTextActive: {
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  balanceSummary: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  balanceSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  balanceSummaryLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  balanceSummaryValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  closingRow: {
    borderBottomWidth: 0,
    paddingTop: 12,
  },
  closingLabel: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  closingValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.tint,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 10,
  },
  breakdownCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
  },
  breakdownValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  noData: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    paddingVertical: 8,
  },
  feeNote: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  tableHeaderText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    textAlign: "center",
  },
  tableNameCol: {
    width: 120,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  tableMonthCol: {
    width: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  tableTotalCol: {
    width: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  tableRow: {
    flexDirection: "row",
    backgroundColor: Colors.light.surface,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  tableName: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  paidBadge: {
    backgroundColor: Colors.light.success + "15",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  paidText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.success,
  },
  unpaidBadge: {
    backgroundColor: Colors.light.accent + "10",
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  tableTotalValue: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  noDataRow: {
    paddingVertical: 20,
    alignItems: "center",
  },
});

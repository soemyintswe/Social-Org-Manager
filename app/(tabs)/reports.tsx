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
import DateTimePicker from "@react-native-community/datetimepicker";
import { CATEGORY_LABELS } from "@/lib/types"; // မသုံးတဲ့ types တွေကို ဖယ်ထုတ်လိုက်သည်

const PERIOD_OPTIONS = [
  { label: "ယခုလ", months: 0 },
  { label: "၃ လ", months: 3 },
  { label: "၆ လ", months: 6 },
  { label: "၁ နှစ်", months: 12 },
];

type ReportTab = "income_expense" | "loans" | "funds" | "fees";

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { transactions, members, loading, refreshData, accountSettings, loans, getLoanOutstanding } = useData() as any;
  
  // Default to Current Year Jan 1 to Today (or end of current month)
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1));
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  
  const [reportTab, setReportTab] = useState<ReportTab>("income_expense");

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const handlePeriodSelect = (months: number) => {
    const year = new Date().getFullYear();
    if (months === 0) {
      const now = new Date();
      setStartDate(new Date(now.getFullYear(), now.getMonth(), 1));
      setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else {
      setStartDate(new Date(year, 0, 1));
      setEndDate(new Date(year, months, 0));
    }
  };

  const formatDateBtn = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const filteredTxns = useMemo(
    () => transactions.filter((t: any) => {
      const d = new Date(t.date);
      const start = new Date(startDate); start.setHours(0,0,0,0);
      const end = new Date(endDate); end.setHours(23,59,59,999);
      return d >= start && d <= end;
    }),
    [transactions, startDate, endDate]
  );

  // Income / Expense Stats
  const incomeExpenseStats = useMemo(() => {
    const income = filteredTxns
      .filter((t: any) => t.type === "income" && t.category !== "loan_repayment") // Exclude loan principal repayment from pure income if needed, but usually included in cash flow. Let's include all for now or separate.
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const expense = filteredTxns
      .filter((t: any) => t.type === "expense" && t.category !== "loan_disbursement")
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    return { income, expense, net: income - expense };
  }, [filteredTxns]);

  // Loan Stats
  const loanStats = useMemo(() => {
    const disbursed = filteredTxns
      .filter((t: any) => t.category === "loan_disbursement")
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const repaid = filteredTxns
      .filter((t: any) => t.category === "loan_repayment")
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const interest = filteredTxns
      .filter((t: any) => t.category === "interest_income" || t.category === "bank_interest")
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    
    const totalOutstanding = (loans || []).reduce((acc: number, l: any) => acc + getLoanOutstanding(l.id), 0);
    
    return { disbursed, repaid, interest, totalOutstanding };
  }, [filteredTxns, loans]);

  // Funds Stats (Opening/Closing)
  const getBalancesAt = (date: Date) => {
    let cash = accountSettings?.openingBalanceCash || 0;
    let bank = accountSettings?.openingBalanceBank || 0;
    
    transactions.forEach((t: any) => {
      const tDate = new Date(t.date);
      if (tDate <= date) {
         const amt = t.amount;
         if (t.type === 'income') {
            if (t.paymentMethod === 'bank') bank += amt;
            else cash += amt;
         } else if (t.type === 'expense') {
            if (t.paymentMethod === 'bank') bank -= amt;
            else cash -= amt;
         } else if (t.type === 'transfer') {
            if (t.category === 'bank_deposit') { cash -= amt; bank += amt; }
            if (t.category === 'bank_withdraw') { bank -= amt; cash += amt; }
         }
      }
    });
    return { cash, bank, total: cash + bank };
  };

  const fundStats = useMemo(() => {
    const start = new Date(startDate); start.setDate(start.getDate() - 1);
    const opening = getBalancesAt(start);
    const closing = getBalancesAt(endDate);
    return { opening, closing };
  }, [startDate, endDate, transactions, accountSettings]);

  const monthsInRange = useMemo(() => {
    const months = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    let current = new Date(start.getFullYear(), start.getMonth(), 1);

    while (current <= end) {
      months.push({
        name: current.toLocaleString("default", { month: "short" }),
        year: current.getFullYear(),
        monthIdx: current.getMonth(),
      });
      current.setMonth(current.getMonth() + 1);
    }
    return months;
  }, [startDate, endDate]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.title}>အစီရင်ခံစာ</Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Pressable 
             style={{ padding: 8 }}
             onPress={async () => refreshData && await refreshData()}
          >
            <Ionicons name="refresh" size={22} color={Colors.light.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.dateRow}>
          {Platform.OS === 'web' ? (
            <View style={styles.dateBtn}>
              {React.createElement('input', {
                type: 'date',
                value: startDate.toISOString().split('T')[0],
                onChange: (e: any) => e.target.value && setStartDate(new Date(e.target.value)),
                style: { border: 'none', outline: 'none', backgroundColor: 'transparent', fontSize: 13, fontFamily: 'inherit', color: Colors.light.text, width: 110 }
              })}
            </View>
          ) : (
            <Pressable style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.dateBtnText}>{formatDateBtn(startDate)}</Text>
            </Pressable>
          )}
          
          <Text style={{ color: Colors.light.textSecondary }}>-</Text>

          {Platform.OS === 'web' ? (
            <View style={styles.dateBtn}>
              {React.createElement('input', {
                type: 'date',
                value: endDate.toISOString().split('T')[0],
                onChange: (e: any) => e.target.value && setEndDate(new Date(e.target.value)),
                style: { border: 'none', outline: 'none', backgroundColor: 'transparent', fontSize: 13, fontFamily: 'inherit', color: Colors.light.text, width: 110 }
              })}
            </View>
          ) : (
            <Pressable style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.dateBtnText}>{formatDateBtn(endDate)}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.periodPicker}>
          {PERIOD_OPTIONS.map((opt) => (
            <Pressable
              key={opt.label}
              style={styles.periodBtn}
              onPress={() => handlePeriodSelect(opt.months)}
            >
              <Text style={styles.periodText}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Date Pickers for Native */}
      {(showStartPicker || showEndPicker) && Platform.OS !== 'web' && (
        <DateTimePicker
          value={showStartPicker ? startDate : endDate}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            if (showStartPicker) {
              setShowStartPicker(false);
              if (selectedDate) setStartDate(selectedDate);
            } else {
              setShowEndPicker(false);
              if (selectedDate) setEndDate(selectedDate);
            }
          }}
        />
      )}

      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 15 }}>
          <Pressable style={[styles.tab, reportTab === "income_expense" && styles.activeTab]} onPress={() => setReportTab("income_expense")}>
            <Text style={[styles.tabText, reportTab === "income_expense" && styles.activeTabText]}>ရငွေ/အသုံးစရိတ်</Text>
          </Pressable>
          <Pressable style={[styles.tab, reportTab === "loans" && styles.activeTab]} onPress={() => setReportTab("loans")}>
            <Text style={[styles.tabText, reportTab === "loans" && styles.activeTabText]}>ချေးငွေ</Text>
          </Pressable>
          <Pressable style={[styles.tab, reportTab === "funds" && styles.activeTab]} onPress={() => setReportTab("funds")}>
            <Text style={[styles.tabText, reportTab === "funds" && styles.activeTabText]}>ဘဏ်/ငွေသား</Text>
          </Pressable>
          <Pressable style={[styles.tab, reportTab === "fees" && styles.activeTab]} onPress={() => setReportTab("fees")}>
            <Text style={[styles.tabText, reportTab === "fees" && styles.activeTabText]}>လစဉ်ကြေး</Text>
          </Pressable>
        </ScrollView>
      </View>

      {reportTab === "income_expense" && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.summaryGrid}>
              <View style={[styles.statBox, { borderLeftColor: "#10B981" }]}>
                <Text style={styles.statLabel}>စုစုပေါင်းအဝင်</Text>
                <Text style={[styles.statValue, { color: "#10B981" }]}>
                  {incomeExpenseStats.income.toLocaleString()} KS
                </Text>
              </View>
              <View style={[styles.statBox, { borderLeftColor: "#F43F5E" }]}>
                <Text style={styles.statLabel}>စုစုပေါင်းအထွက်</Text>
                <Text style={[styles.statValue, { color: "#F43F5E" }]}>
                  {incomeExpenseStats.expense.toLocaleString()} KS
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>အသေးစိတ် စာရင်းများ</Text>
              {filteredTxns.filter((t: any) => t.type !== 'transfer').map((t: any) => (
                <View key={t.id} style={styles.catRow}>
                  <View style={styles.catInfo}>
                    <View style={[styles.catDot, { backgroundColor: t.type === 'income' ? '#10B981' : '#F43F5E' }]} />
                    <Text style={styles.catLabel}>
                      {CATEGORY_LABELS[t.category as keyof typeof CATEGORY_LABELS] || t.category}
                    </Text>
                    <Text style={styles.catSub}>{new Date(t.date).toLocaleDateString()}</Text>
                  </View>
                  <Text style={[styles.catValue, { color: t.type === 'income' ? '#10B981' : '#F43F5E' }]}>
                    {t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
        </ScrollView>
      )}

      {reportTab === "loans" && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryGrid}>
            <View style={[styles.statBox, { borderLeftColor: "#F59E0B" }]}>
              <Text style={styles.statLabel}>ထုတ်ချေးငွေ</Text>
              <Text style={[styles.statValue, { color: "#F59E0B" }]}>{loanStats.disbursed.toLocaleString()} KS</Text>
            </View>
            <View style={[styles.statBox, { borderLeftColor: "#10B981" }]}>
              <Text style={styles.statLabel}>ပြန်ဆပ်ငွေ</Text>
              <Text style={[styles.statValue, { color: "#10B981" }]}>{loanStats.repaid.toLocaleString()} KS</Text>
            </View>
          </View>
          <View style={[styles.summaryGrid, { marginTop: 0 }]}>
             <View style={[styles.statBox, { borderLeftColor: "#8B5CF6" }]}>
              <Text style={styles.statLabel}>အတိုးရငွေ</Text>
              <Text style={[styles.statValue, { color: "#8B5CF6" }]}>{loanStats.interest.toLocaleString()} KS</Text>
            </View>
            <View style={[styles.statBox, { borderLeftColor: "#EF4444" }]}>
              <Text style={styles.statLabel}>လက်ကျန်ငွေပေါင်း</Text>
              <Text style={[styles.statValue, { color: "#EF4444" }]}>{loanStats.totalOutstanding.toLocaleString()} KS</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ချေးငွေဆိုင်ရာ မှတ်တမ်းများ</Text>
            {filteredTxns.filter((t: any) => ['loan_disbursement', 'loan_repayment', 'interest_income'].includes(t.category)).map((t: any) => (
               <View key={t.id} style={styles.catRow}>
                  <View style={styles.catInfo}>
                    <Text style={styles.catLabel}>{CATEGORY_LABELS[t.category as keyof typeof CATEGORY_LABELS] || t.category}</Text>
                    <Text style={styles.catSub}>{new Date(t.date).toLocaleDateString()}</Text>
                  </View>
                  <Text style={styles.catValue}>{t.amount.toLocaleString()}</Text>
               </View>
            ))}
          </View>
        </ScrollView>
      )}

      {reportTab === "funds" && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>လက်ကျန်ရှင်းတမ်း (Opening/Closing)</Text>
            <View style={styles.catRow}>
              <Text style={styles.catLabel}>စာရင်းဖွင့် လက်ကျန်</Text>
              <Text style={styles.catValue}>{fundStats.opening.total.toLocaleString()} KS</Text>
            </View>
            <View style={[styles.catRow, { paddingLeft: 20 }]}>
               <Text style={styles.catSub}>ငွေသား: {fundStats.opening.cash.toLocaleString()}</Text>
               <Text style={styles.catSub}>ဘဏ်: {fundStats.opening.bank.toLocaleString()}</Text>
            </View>
            <View style={[styles.catRow, { borderTopWidth: 1, borderColor: '#eee', paddingTop: 10, marginTop: 10 }]}>
              <Text style={styles.catLabel}>စာရင်းပိတ် လက်ကျန်</Text>
              <Text style={[styles.catValue, { fontWeight: 'bold' }]}>{fundStats.closing.total.toLocaleString()} KS</Text>
            </View>
             <View style={[styles.catRow, { paddingLeft: 20 }]}>
               <Text style={styles.catSub}>ငွေသား: {fundStats.closing.cash.toLocaleString()}</Text>
               <Text style={styles.catSub}>ဘဏ်: {fundStats.closing.bank.toLocaleString()}</Text>
            </View>
          </View>
        </ScrollView>
      )}

      {reportTab === "fees" && (
        <View style={styles.feesContainer}>
          <Text style={styles.sectionTitle}>အသင်းဝင်ကြေး ပေးဆောင်မှု ({startDate.getFullYear()})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ height: '100%' }}>
              <View>
                <View style={styles.tableHeader}>
                  <View style={styles.tableNameCol}>
                    <Text style={styles.tableHeaderText}>အမည်</Text>
                  </View>
                  {monthsInRange.map((m) => (
                    <View key={`${m.monthIdx}-${m.year}`} style={styles.tableMonthCol}>
                      <Text style={styles.tableHeaderText}>{m.name}</Text>
                    </View>
                  ))}
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                {members.map((member: any) => (
                  <View key={member.id} style={styles.tableRow}>
                    <View style={styles.tableNameCol}>
                      <Text style={styles.tableName} numberOfLines={1}>
                        {member.name}
                      </Text>
                    </View>
                    {monthsInRange.map((m) => {
                      const isPaid = transactions.some(
                        (t: any) => {
                          if (t.memberId !== member.id || t.category !== "member_fees") return false;
                          
                          if (t.feePeriodStart && t.feePeriodEnd) {
                            const start = new Date(t.feePeriodStart); start.setHours(0,0,0,0);
                            const end = new Date(t.feePeriodEnd); end.setHours(23,59,59,999);
                            const monthStart = new Date(m.year, m.monthIdx, 1);
                            const monthEnd = new Date(m.year, m.monthIdx + 1, 0);
                            return start <= monthEnd && end >= monthStart;
                          } else {
                            const d = new Date(t.date);
                            return d.getMonth() === m.monthIdx && d.getFullYear() === m.year;
                          }
                        }
                      );
                      return (
                        <View key={`${m.monthIdx}-${m.year}`} style={styles.tableMonthCol}>
                          {isPaid ? (
                            <View style={[styles.paidBadge, { backgroundColor: Colors.light.success }]}>
                              <Ionicons name="checkmark" size={14} color="white" />
                            </View>
                          ) : (
                            <Ionicons name="close" size={14} color={Colors.light.textSecondary + "40"} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
                </ScrollView>
              </View>
            </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text },
  filterSection: { paddingHorizontal: 20, marginBottom: 15, gap: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border },
  dateBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.text },
  periodPicker: { flexDirection: "row", gap: 8 },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  periodText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  tabBar: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 10 },
  tab: { paddingVertical: 8, paddingHorizontal: 4 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: Colors.light.tint },
  tabText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  activeTabText: { color: Colors.light.tint },
  scrollContent: { paddingBottom: 40 },
  summaryGrid: { flexDirection: "row", paddingHorizontal: 20, gap: 12, marginBottom: 20 },
  statBox: {
    flex: 1,
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  statLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 4 },
  section: { backgroundColor: "white", marginHorizontal: 20, padding: 15, borderRadius: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 15 },
  catRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  catInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text },
  catValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  catSub: { fontSize: 12, color: Colors.light.textSecondary, marginLeft: 6 },
  tableHeader: { flexDirection: "row", backgroundColor: Colors.light.tint, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 6, marginBottom: 4 },
  tableHeaderText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff", textAlign: "center" },
  tableNameCol: { width: 120, paddingHorizontal: 6, justifyContent: "center" },
  tableMonthCol: { width: 70, alignItems: "center", justifyContent: "center" },
  tableRow: { flexDirection: "row", backgroundColor: "#F8FAFC", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 6, marginBottom: 4, borderWidth: 1, borderColor: "#E2E8F0" },
  tableName: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.text },
  paidBadge: { backgroundColor: Colors.light.success + "15", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  feesContainer: { flex: 1, paddingHorizontal: 20, paddingBottom: 20 },
});
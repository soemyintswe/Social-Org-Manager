import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CATEGORY_LABELS } from "@/lib/types"; // မသုံးတဲ့ types တွေကို ဖယ်ထုတ်လိုက်သည်
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const PERIOD_OPTIONS = [
  { label: "ယခုလ", months: 0 },
  { label: "၄ လ", months: 4 },
  { label: "၈ လ", months: 8 },
  { label: "၁ နှစ်", months: 12 },
];

type ReportTab = "income_expense" | "loans" | "funds" | "fees";

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { transactions, members, loading, accountSettings, loans, getLoanOutstanding } = useData() as any;
  
  // Default to Current Year Jan 1 to Today (or end of current month)
  const [pickerStartDate, setPickerStartDate] = useState(new Date(new Date().getFullYear(), 0, 1));
  const [pickerEndDate, setPickerEndDate] = useState(new Date());

  // Applied dates for filtering (only updates when Report button is clicked)
  const [startDate, setStartDate] = useState(pickerStartDate);
  const [endDate, setEndDate] = useState(pickerEndDate);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  
  const [reportTab, setReportTab] = useState<ReportTab>("income_expense");

  const handlePeriodSelect = (months: number) => {
    const now = new Date();
    const year = now.getFullYear();
    let start, end;

    if (months === 0) {
      // ယခုလ: လက်ရှိလ ၁ ရက်နေ့မှ ယနေ့အထိ
      start = new Date(year, now.getMonth(), 1);
      end = new Date();
    } else {
      // ၄ လ / ၈ လ / ၁ နှစ်: နှစ်အစ (Jan 1) မှ သတ်မှတ်လအဆုံးနေ့အထိ
      start = new Date(year, 0, 1);
      end = new Date(year, months, 0);
    }

    // Fix for potential timezone shifts (set to noon)
    start.setHours(12, 0, 0, 0);
    end.setHours(12, 0, 0, 0);

    setPickerStartDate(start);
    setPickerEndDate(end);
    setStartDate(start);
    setEndDate(end);
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

  const generatePdf = async () => {
    const html = `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; color: #333; margin-bottom: 10px; }
            p { text-align: center; color: #666; margin-top: 0; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background-color: #f4f4f4; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #999; }
          </style>
        </head>
        <body>
          <h1>Social Org Manager</h1>
          <p>Member List Report • ${new Date().toLocaleDateString()}</p>
          
          <table>
            <thead>
              <tr>
                <th style="width: 40px;">No.</th>
                <th>Name</th>
                <th>ID</th>
                <th>Phone</th>
                <th>NRC</th>
                <th>Join Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${members.map((m: any, index: number) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${m.name}</td>
                  <td>${m.id}</td>
                  <td>${m.phone || '-'}</td>
                  <td>${m.nrc || '-'}</td>
                  <td>${m.joinDate || '-'}</td>
                  <td>${m.status === 'active' ? 'Active' : 'Resigned'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            Generated by Social Org Manager App
          </div>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "PDF ထုတ်မရနိုင်ပါ။");
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>အစီရင်ခံစာ</Text>
        <View style={styles.headerActions}>
          <Pressable 
             style={styles.headerIconBtn}
             onPress={generatePdf}
          >
            <Ionicons name="print-outline" size={22} color={Colors.light.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.dateRow}>
          {Platform.OS === 'web' ? (
            <View style={styles.dateBtn}>
              {React.createElement('input', {
                type: 'date',
                value: pickerStartDate.toISOString().split('T')[0],
                onChange: (e: any) => e.target.value && setPickerStartDate(new Date(e.target.value)),
                style: { border: 'none', outline: 'none', backgroundColor: 'transparent', fontSize: 13, fontFamily: 'inherit', color: Colors.light.text, width: 110 }
              })}
            </View>
          ) : (
            <Pressable style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.dateBtnText}>{formatDateBtn(pickerStartDate)}</Text>
            </Pressable>
          )}
          
          <Text style={{ color: Colors.light.textSecondary }}>-</Text>

          {Platform.OS === 'web' ? (
            <View style={styles.dateBtn}>
              {React.createElement('input', {
                type: 'date',
                value: pickerEndDate.toISOString().split('T')[0],
                onChange: (e: any) => e.target.value && setPickerEndDate(new Date(e.target.value)),
                style: { border: 'none', outline: 'none', backgroundColor: 'transparent', fontSize: 13, fontFamily: 'inherit', color: Colors.light.text, width: 110 }
              })}
            </View>
          ) : (
            <Pressable style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.dateBtnText}>{formatDateBtn(pickerEndDate)}</Text>
            </Pressable>
          )}

          <Pressable 
            style={styles.searchBtn}
            onPress={() => { setStartDate(pickerStartDate); setEndDate(pickerEndDate); }}
          >
            <Ionicons name="search" size={20} color="white" />
          </Pressable>
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
          value={showStartPicker ? pickerStartDate : pickerEndDate}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            if (showStartPicker) {
              setShowStartPicker(false);
              if (selectedDate) setPickerStartDate(selectedDate);
            } else {
              setShowEndPicker(false);
              if (selectedDate) setPickerEndDate(selectedDate);
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
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={styles.sectionTitle}>အသင်းဝင်ကြေး ပေးဆောင်မှု ({startDate.getFullYear()})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={{ paddingBottom: 20 }}>
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
              </View>
            </ScrollView>
          </View>
        </ScrollView>
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
  headerActions: { flexDirection: "row", alignItems: "center", marginRight: 108 },
  headerIconBtn: { padding: 8 },
  filterSection: { paddingHorizontal: 20, marginBottom: 15, gap: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border },
  dateBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.text },
  searchBtn: { backgroundColor: Colors.light.tint, width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
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
});

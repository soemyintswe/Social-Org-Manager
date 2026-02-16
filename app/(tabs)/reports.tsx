import React, { useState, useMemo, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CATEGORY_LABELS, MEMBER_STATUS_LABELS, MemberStatus } from "@/lib/types";
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from "expo-file-system/legacy";
import AccessDenied from "@/components/AccessDenied";

const PERIOD_OPTIONS = [
  { label: "ယခုလ", months: 0 },
  { label: "၄ လ", months: 4 },
  { label: "၈ လ", months: 8 },
  { label: "၁ နှစ်", months: 12 },
];

type ReportTab = "income_expense" | "loans" | "funds" | "fees" | "audit_flags";
type ReportViewScope = "all" | "self" | "member";

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { transactions, members, loading, accountSettings, loans, getLoanOutstanding } = useData() as any;
  const { can, currentUser, profile } = useAuth();
  const canViewAllReports = can("reports.view_all");
  const canViewReports = can("reports.view_summary") || canViewAllReports;
  const canViewAllFinanceRecords = can("finance.view_detail") || can("finance.view_all");
  const canViewAuditFlags = can("finance.audit_flag") || canViewAllFinanceRecords;
  const canChooseScope = canViewAllReports && canViewAllFinanceRecords;
  
  // Default to Current Year Jan 1 to Today
  const [pickerStartDate, setPickerStartDate] = useState(new Date(new Date().getFullYear(), 0, 1));
  const [pickerEndDate, setPickerEndDate] = useState(new Date());

  const [startDate, setStartDate] = useState(pickerStartDate);
  const [endDate, setEndDate] = useState(pickerEndDate);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  
  const [reportTab, setReportTab] = useState<ReportTab>("income_expense");
  const [viewScope, setViewScope] = useState<ReportViewScope>("all");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditOnlyFlagged, setAuditOnlyFlagged] = useState(true);
  const effectiveScope: ReportViewScope = canChooseScope ? viewScope : "self";

  const handlePeriodSelect = (months: number) => {
    const now = new Date();
    const year = now.getFullYear();
    let start, end;

    if (months === 0) {
      start = new Date(year, now.getMonth(), 1);
      end = new Date();
    } else {
      start = new Date(year, 0, 1);
      end = new Date(year, months, 0);
    }

    start.setHours(12, 0, 0, 0);
    end.setHours(12, 0, 0, 0);

    setPickerStartDate(start);
    setPickerEndDate(end);
    setStartDate(start);
    setEndDate(end);
  };

  const formatDateBtn = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const memberOptions = useMemo(() => {
    const needle = memberSearch.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member: any) => {
      const id = String(member.id || "").toLowerCase();
      const name = String(member.name || "").toLowerCase();
      return id.includes(needle) || name.includes(needle);
    });
  }, [members, memberSearch]);

  const scopedMemberId = useMemo<string | null>(() => {
    if (effectiveScope === "all") return null;
    if (effectiveScope === "self") return currentUser?.memberId || "__none__";
    return selectedMemberId || "__none__";
  }, [effectiveScope, currentUser?.memberId, selectedMemberId]);
  const isAllScope = effectiveScope === "all";

  const scopeLabel = useMemo(() => {
    if (effectiveScope === "all") return "အားလုံး";
    if (effectiveScope === "self") return "ကိုယ်ပိုင်";
    if (scopedMemberId === "__none__") return "ရွေးချယ်ထားသူ";
    const selectedName = members.find((member: any) => member.id === scopedMemberId)?.name || "";
    return selectedName ? `${selectedName} (${scopedMemberId})` : scopedMemberId;
  }, [effectiveScope, scopedMemberId, members]);

  const reportMembers = useMemo(() => {
    if (scopedMemberId === null) return members;
    return members.filter((member: any) => member.id === scopedMemberId);
  }, [members, scopedMemberId]);

  const reportTransactions = useMemo(() => {
    if (scopedMemberId === null) return transactions;
    return transactions.filter((t: any) => t.memberId === scopedMemberId);
  }, [transactions, scopedMemberId]);

  const reportLoans = useMemo(() => {
    if (scopedMemberId === null) return loans;
    return loans.filter((loan: any) => loan.memberId === scopedMemberId);
  }, [loans, scopedMemberId]);

  const filteredTxns = useMemo(
    () => reportTransactions.filter((t: any) => {
      const d = new Date(t.date);
      const start = new Date(startDate); start.setHours(0,0,0,0);
      const end = new Date(endDate); end.setHours(23,59,59,999);
      return d >= start && d <= end;
    }),
    [reportTransactions, startDate, endDate]
  );

  const incomeExpenseStats = useMemo(() => {
    const income = filteredTxns
      .filter((t: any) => t.type === "income" && t.category !== "loan_repayment")
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const expense = filteredTxns
      .filter((t: any) => t.type === "expense" && t.category !== "loan_disbursement")
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    return { income, expense, net: income - expense };
  }, [filteredTxns]);

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
    
    const totalOutstanding = (reportLoans || []).reduce((acc: number, l: any) => acc + getLoanOutstanding(l.id), 0);
    
    return { disbursed, repaid, interest, totalOutstanding };
  }, [filteredTxns, reportLoans, getLoanOutstanding]);

  const getBalancesAt = useCallback((date: Date) => {
    let cash = accountSettings?.openingBalanceCash || 0;
    let bank = accountSettings?.openingBalanceBank || 0;
    
    reportTransactions.forEach((t: any) => {
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
  }, [accountSettings, reportTransactions]);

  const fundStats = useMemo(() => {
    const start = new Date(startDate); start.setDate(start.getDate() - 1);
    const opening = getBalancesAt(start);
    const closing = getBalancesAt(endDate);
    return { opening, closing };
  }, [startDate, endDate, getBalancesAt]);

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

  const roleSummaryCards = useMemo(() => {
    const role = profile?.orgPosition || "member";
    const feeTxns = filteredTxns.filter((t: any) => t.category === "member_fees");
    const donationTxns = filteredTxns.filter((t: any) => t.category === "donation");
    const welfareTxns = filteredTxns.filter((t: any) => String(t.category || "").startsWith("welfare_"));
    const flaggedTxns = filteredTxns.filter((t: any) => Boolean(t.auditFlagged));

    if (role === "patron") {
      return [
        { label: "စုစုပေါင်းအဝင်", value: `${incomeExpenseStats.income.toLocaleString()} KS`, color: "#10B981" },
        { label: "စုစုပေါင်းအထွက်", value: `${incomeExpenseStats.expense.toLocaleString()} KS`, color: "#F43F5E" },
        { label: "လက်ကျန်ကွာဟချက်", value: `${incomeExpenseStats.net.toLocaleString()} KS`, color: "#8B5CF6" },
      ];
    }

    if (role === "auditor") {
      return [
        { label: "Flagged Record", value: `${flaggedTxns.length}`, color: "#DC2626" },
        {
          label: "Flagged Amount",
          value: `${flaggedTxns.reduce((s: number, t: any) => s + Number(t.amount || 0), 0).toLocaleString()} KS`,
          color: "#B45309",
        },
        { label: "စစ်ဆေးရမည့် Welfare", value: `${welfareTxns.length}`, color: "#2563EB" },
      ];
    }

    return [
      { label: "ပေးသွင်းငွေ", value: `${incomeExpenseStats.income.toLocaleString()} KS`, color: "#10B981" },
      { label: "ထုတ်ယူငွေ", value: `${incomeExpenseStats.expense.toLocaleString()} KS`, color: "#F43F5E" },
      { label: "လစဉ်ကြေး/လှူဒါန်းမှု", value: `${(feeTxns.length + donationTxns.length).toLocaleString()}`, color: "#0EA5A4" },
    ];
  }, [profile?.orgPosition, filteredTxns, incomeExpenseStats]);

  const scopedAuditRows = useMemo(() => {
    const needle = auditSearch.trim().toLowerCase();
    return filteredTxns.filter((t: any) => {
      if (auditOnlyFlagged && !t.auditFlagged) return false;
      if (!needle) return true;
      const categoryLabel = CATEGORY_LABELS[t.category as keyof typeof CATEGORY_LABELS] || String(t.category || "");
      return (
        String(t.memberId || "").toLowerCase().includes(needle) ||
        String(t.receiptNumber || "").toLowerCase().includes(needle) ||
        String(t.auditNote || "").toLowerCase().includes(needle) ||
        String(categoryLabel).toLowerCase().includes(needle)
      );
    });
  }, [filteredTxns, auditSearch, auditOnlyFlagged]);

  const exportAuditJson = async () => {
    const payload = {
      type: "auditor_flagged_transactions",
      exportedAt: new Date().toISOString(),
      scope: scopeLabel,
      count: scopedAuditRows.length,
      rows: scopedAuditRows,
    };
    const json = JSON.stringify(payload, null, 2);

    try {
      if (Platform.OS === "web") {
        const timestamp = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `auditor_flags_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!directory) return;
      const timestamp = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
      const fileUri = directory + `auditor_flags_${timestamp}.json`;
      await FileSystem.writeAsStringAsync(fileUri, json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/json",
          dialogTitle: "Auditor Flag JSON Export",
          UTI: "public.json",
        });
      }
    } catch {
      Alert.alert("အမှား", "Audit JSON export မအောင်မြင်ပါ။");
    }
  };

  const exportAuditCsv = async () => {
    const headers = ["member_id", "category", "amount", "date", "receipt", "audit_flagged", "audit_note", "flagged_by", "flagged_at"];
    const rows = scopedAuditRows.map((t: any) =>
      [
        t.memberId || "",
        CATEGORY_LABELS[t.category as keyof typeof CATEGORY_LABELS] || t.category || "",
        t.amount || 0,
        t.date || "",
        t.receiptNumber || "",
        t.auditFlagged ? "YES" : "NO",
        t.auditNote || "",
        t.auditFlaggedByUserId || "",
        t.auditFlaggedAt || "",
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");

    try {
      if (Platform.OS === "web") {
        const timestamp = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `auditor_flags_${timestamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!directory) return;
      const timestamp = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
      const fileUri = directory + `auditor_flags_${timestamp}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/csv",
          dialogTitle: "Auditor Flag CSV Export",
          UTI: "public.comma-separated-values-text",
        });
      }
    } catch {
      Alert.alert("အမှား", "Audit CSV export မအောင်မြင်ပါ။");
    }
  };

  const generatePdf = async () => {
    if (!canViewAllReports) {
      Alert.alert("ခွင့်မပြုပါ", "Summary-only permission ဖြစ်သောကြောင့် detailed member report ကို PDF မထုတ်နိုင်ပါ။");
      return;
    }

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
                <th>Email</th>
                <th>NRC</th>
                <th>Join Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${reportMembers.map((m: any, index: number) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${m.name}</td>
                  <td>${m.id}</td>
                  <td>${m.phone || '-'}</td>
                  <td>${m.email || '-'}</td>
                  <td>${m.nrc || '-'}</td>
                  <td>${m.joinDate || '-'}</td>
                  <td>${MEMBER_STATUS_LABELS[m.status as MemberStatus] || m.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">Generated by Social Org Manager App</div>
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

  if (!canViewReports) {
    return <AccessDenied showBack={false} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
          <Pressable onPress={() => router.replace("/")} style={{ padding: 4, position: "absolute", left: 0, zIndex: 10 }}>
            <Ionicons name="home" size={24} color={Colors.light.text} />
          </Pressable>


        <Text style={[styles.title, { marginLeft: 70 }]}>အစီရင်ခံစာ - {scopeLabel}</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerIconBtn} onPress={generatePdf}>
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
      {canChooseScope && (
        <View style={styles.scopeCard}>
          <Text style={styles.scopeLabel}>ကြည့်ရှုမည့်အပိုင်း</Text>
          <View style={styles.scopeRow}>
            <Pressable style={[styles.scopeChip, viewScope === "all" && styles.scopeChipActive]} onPress={() => setViewScope("all")}>
              <Text style={[styles.scopeChipText, viewScope === "all" && styles.scopeChipTextActive]}>အားလုံး</Text>
            </Pressable>
            <Pressable style={[styles.scopeChip, viewScope === "self" && styles.scopeChipActive]} onPress={() => setViewScope("self")}>
              <Text style={[styles.scopeChipText, viewScope === "self" && styles.scopeChipTextActive]}>ကိုယ်တိုင်</Text>
            </Pressable>
            <Pressable style={[styles.scopeChip, viewScope === "member" && styles.scopeChipActive]} onPress={() => setViewScope("member")}>
              <Text style={[styles.scopeChipText, viewScope === "member" && styles.scopeChipTextActive]}>အခြားသူ</Text>
            </Pressable>
          </View>
          {viewScope === "member" && (
            <View style={styles.memberPickerWrap}>
              <TextInput
                style={styles.memberSearchInput}
                value={memberSearch}
                onChangeText={setMemberSearch}
                placeholder="Member ID / Full Name ရိုက်ရှာပါ"
              />
              <Pressable style={styles.memberPickerBtn} onPress={() => setShowMemberPicker(true)}>
                <Text style={styles.memberPickerBtnText} numberOfLines={1}>
                  {selectedMemberId === "" ? "Dropdown မှ Member ရွေးမည်" : `${members.find((m: any) => m.id === selectedMemberId)?.name || ""} (${selectedMemberId})`}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} />
              </Pressable>
            </View>
          )}
        </View>
      )}

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
            <Text style={[styles.tabText, reportTab === "income_expense" && styles.activeTabText]}>
              {isAllScope ? "ရငွေ/အသုံးစရိတ်" : "အသင်းသို့ပေးသွင်းငွေ"}
            </Text>
          </Pressable>
          <Pressable style={[styles.tab, reportTab === "loans" && styles.activeTab]} onPress={() => setReportTab("loans")}>
            <Text style={[styles.tabText, reportTab === "loans" && styles.activeTabText]}>ချေးငွေ</Text>
          </Pressable>
          <Pressable style={[styles.tab, reportTab === "funds" && styles.activeTab]} onPress={() => setReportTab("funds")}>
            <Text style={[styles.tabText, reportTab === "funds" && styles.activeTabText]}>
              {isAllScope ? "ဘဏ်/ငွေသား" : "အသင်းမှထုတ်ယူငွေ"}
            </Text>
          </Pressable>
          <Pressable style={[styles.tab, reportTab === "fees" && styles.activeTab]} onPress={() => setReportTab("fees")}>
            <Text style={[styles.tabText, reportTab === "fees" && styles.activeTabText]}>လစဉ်ကြေး</Text>
          </Pressable>
          {canViewAuditFlags && (
            <Pressable style={[styles.tab, reportTab === "audit_flags" && styles.activeTab]} onPress={() => setReportTab("audit_flags")}>
              <Text style={[styles.tabText, reportTab === "audit_flags" && styles.activeTabText]}>Audit Flag</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
      {!canChooseScope && (
        <View style={styles.summaryOnlyNote}>
          <Ionicons name="person-circle-outline" size={18} color="#1E3A8A" />
          <Text style={styles.summaryOnlyNoteText}>သင့်အကောင့်နှင့်သက်ဆိုင်သော Report အချက်အလက်များကိုသာ ပြသထားပါသည်။</Text>
        </View>
      )}
      <View style={styles.summaryGrid}>
        {roleSummaryCards.map((card) => (
          <View key={card.label} style={[styles.statBox, { borderLeftColor: card.color }]}>
            <Text style={styles.statLabel}>{card.label}</Text>
            <Text style={[styles.statValue, { color: card.color }]}>{card.value}</Text>
          </View>
        ))}
      </View>

      {reportTab === "income_expense" && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.summaryGrid}>
              <View style={[styles.statBox, { borderLeftColor: "#10B981" }]}>
                <Text style={styles.statLabel}>{isAllScope ? "စုစုပေါင်းအဝင်" : "အသင်းသို့ပေးသွင်းငွေများ"}</Text>
                <Text style={[styles.statValue, { color: "#10B981" }]}>
                  {incomeExpenseStats.income.toLocaleString()} KS
                </Text>
              </View>
              <View style={[styles.statBox, { borderLeftColor: "#F43F5E" }]}>
                <Text style={styles.statLabel}>{isAllScope ? "စုစုပေါင်းအထွက်" : "အသင်းမှထုတ်ယူငွေ"}</Text>
                <Text style={[styles.statValue, { color: "#F43F5E" }]}>
                  {incomeExpenseStats.expense.toLocaleString()} KS
                </Text>
              </View>
            </View>
            {!isAllScope && (
              <View style={[styles.summaryGrid, { marginTop: -10 }]}>
                <View style={[styles.statBox, { borderLeftColor: "#8B5CF6" }]}>
                  <Text style={styles.statLabel}>စုစုပေါင်းကွာဟချက်</Text>
                  <Text style={[styles.statValue, { color: "#8B5CF6" }]}>
                    {incomeExpenseStats.net.toLocaleString()} KS
                  </Text>
                </View>
              </View>
            )}

            {canViewAllReports ? (
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
            ) : (
              <View style={styles.summaryOnlyNote}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#1E3A8A" />
                <Text style={styles.summaryOnlyNoteText}>Summary-only permission ဖြစ်သောကြောင့် အသေးစိတ်စာရင်းများ မပြထားပါ။</Text>
              </View>
            )}
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
          {canViewAllReports ? (
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
          ) : (
            <View style={styles.summaryOnlyNote}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#1E3A8A" />
              <Text style={styles.summaryOnlyNoteText}>Summary-only permission ဖြစ်သောကြောင့် ချေးငွေ အသေးစိတ်မှတ်တမ်း မပြထားပါ။</Text>
            </View>
          )}
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
                  <View style={[styles.tableMonthCol, { width: 90 }]}>
                    <Text style={styles.tableHeaderText}>စုစုပေါင်း</Text>
                  </View>
                </View>

                {reportMembers.map((member: any) => (
                  <View key={member.id} style={styles.tableRow}>
                    <View style={styles.tableNameCol}>
                      <Text style={styles.tableName} numberOfLines={1}>
                        {member.name}
                      </Text>
                    </View>
                    {monthsInRange.map((m) => {
                      const monthlyPayments = reportTransactions.filter(
                        (t: any) => {
                          if (t.memberId !== member.id || t.category !== "member_fees") return false;

                          if (t.feePeriodStart && t.feePeriodEnd) {
                            const start = new Date(t.feePeriodStart); start.setHours(0,0,0,0);
                            const end = new Date(t.feePeriodEnd); end.setHours(23,59,59,999);
                            const monthStart = new Date(m.year, m.monthIdx, 1);
                            const monthEnd = new Date(m.year, m.monthIdx + 1, 0);
                            return start <= monthEnd && end >= monthStart;
                          }

                          const d = new Date(t.date);
                          return d.getMonth() === m.monthIdx && d.getFullYear() === m.year;
                        }
                      );

                      const isPaid = monthlyPayments.length > 0;
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

                    <View style={[styles.tableMonthCol, { width: 90 }]}>
                      <Text style={[styles.tableName, { fontFamily: "Inter_700Bold", color: Colors.light.tint }]}>
                        {filteredTxns
                          .filter((t: any) => t.memberId === member.id && t.category === "member_fees")
                          .reduce((sum: number, t: any) => sum + t.amount, 0)
                          .toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {reportTab === "audit_flags" && canViewAuditFlags && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Auditor Flagged Transactions</Text>
            <View style={styles.auditToolbar}>
              <Pressable
                style={[styles.scopeChip, auditOnlyFlagged && styles.scopeChipActive]}
                onPress={() => setAuditOnlyFlagged((prev) => !prev)}
              >
                <Text style={[styles.scopeChipText, auditOnlyFlagged && styles.scopeChipTextActive]}>
                  {auditOnlyFlagged ? "Flagged Only" : "All Rows"}
                </Text>
              </Pressable>
              <Pressable style={styles.exportBtn} onPress={exportAuditJson}>
                <Ionicons name="download-outline" size={14} color={Colors.light.tint} />
                <Text style={styles.exportBtnText}>JSON</Text>
              </Pressable>
              <Pressable style={styles.exportBtn} onPress={exportAuditCsv}>
                <Ionicons name="download-outline" size={14} color={Colors.light.tint} />
                <Text style={styles.exportBtnText}>CSV</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.memberSearchInput}
              value={auditSearch}
              onChangeText={setAuditSearch}
              placeholder="Member ID / category / note / receipt"
            />
            <Text style={styles.auditMetaText}>Count: {scopedAuditRows.length}</Text>
            {scopedAuditRows.length === 0 ? (
              <View style={{ paddingVertical: 12 }}>
                <Text style={styles.summaryOnlyNoteText}>Audit records မရှိသေးပါ။</Text>
              </View>
            ) : (
              scopedAuditRows.map((row: any) => (
                <View key={row.id} style={styles.auditRow}>
                  <Text style={styles.auditTitle}>
                    {CATEGORY_LABELS[row.category as keyof typeof CATEGORY_LABELS] || row.category} - {Number(row.amount || 0).toLocaleString()} KS
                  </Text>
                  <Text style={styles.auditSub}>
                    Member: {row.memberId || "-"} | Date: {row.date || "-"} | Receipt: {row.receiptNumber || "-"}
                  </Text>
                  <Text style={styles.auditNoteText}>Note: {row.auditNote || "-"}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={showMemberPicker}
        onRequestClose={() => setShowMemberPicker(false)}
      >
        <View style={styles.modalContainer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowMemberPicker(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Member ရွေးချယ်ရန်</Text>
            <FlatList
              data={memberOptions}
              keyExtractor={(item: any) => String(item.id)}
              style={{ maxHeight: 320 }}
              renderItem={({ item }: { item: any }) => (
                <Pressable
                  style={styles.memberOptionRow}
                  onPress={() => {
                    setSelectedMemberId(String(item.id || ""));
                    setShowMemberPicker(false);
                  }}
                >
                  <Text style={styles.memberOptionName}>{item.name || "-"}</Text>
                  <Text style={styles.memberOptionId}>{item.id || "-"}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <Text style={styles.summaryOnlyNoteText}>ရွေးချယ်ရန် Member မတွေ့ပါ</Text>
                </View>
              }
            />
            <Pressable style={styles.cancelBtn} onPress={() => setShowMemberPicker(false)}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  scopeCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  scopeLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
    marginBottom: 8,
  },
  scopeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  scopeChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#F8FAFC",
  },
  scopeChipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  scopeChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  scopeChipTextActive: { color: "white" },
  memberPickerWrap: { gap: 8 },
  memberSearchInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.light.text,
  },
  memberPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
  },
  memberPickerBtnText: { flex: 1, marginRight: 8, fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.text },
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
  auditToolbar: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#F8FAFC",
  },
  exportBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.tint },
  auditMetaText: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 8, marginBottom: 8 },
  auditRow: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#F8FAFC",
    marginBottom: 8,
  },
  auditTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.light.text },
  auditSub: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 3 },
  auditNoteText: { fontSize: 12, color: "#B45309", marginTop: 4 },
  summaryOnlyNote: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 20,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryOnlyNoteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#1E3A8A",
  },
  modalContainer: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 20, textAlign: "center" },
  memberOptionRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  memberOptionName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  memberOptionId: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  cancelBtn: { paddingVertical: 14, alignItems: "center", marginTop: 5 },
  cancelBtnText: { color: Colors.light.textSecondary, fontSize: 15, fontFamily: "Inter_500Medium" },
});

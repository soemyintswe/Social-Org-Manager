import React, { useState, useMemo, useCallback, useEffect } from "react";
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
  InteractionManager,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import DateTimePicker from "@react-native-community/datetimepicker";
import { MEMBER_STATUS_LABELS, MemberStatus } from "@/lib/types";
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from "expo-file-system/legacy";
import AccessDenied from "@/components/AccessDenied";
import { getLocalizedTransactionCategoryLabel, stripTechnicalNoteText } from "@/lib/transaction-display";

const PERIOD_OPTIONS = [
  { label: "ယခုလ", months: 0 },
  { label: "၄ လ", months: 4 },
  { label: "၈ လ", months: 8 },
  { label: "၁ နှစ်", months: 12 },
];

type ReportTab = "income_expense" | "loans" | "funds" | "registers" | "cash_book" | "fees" | "audit_flags";
type ReportViewScope = "all" | "self" | "member";
type RegisterView = "received" | "expenditure" | "loan_out" | "loan_in";
type DetailSortOrder = "newest" | "oldest";
const REPORT_TXN_PAGE_SIZE = 60;
const REPORT_REGISTER_PAGE_SIZE = 50;
const REPORT_CASHBOOK_PAGE_SIZE = 80;
const REPORT_AUDIT_PAGE_SIZE = 50;
const REPORT_MEMBER_PAGE_SIZE = 40;

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function getCategoryLabel(category: unknown): string {
  return getLocalizedTransactionCategoryLabel(category);
}

function getReadableNotes(notes: unknown): string {
  return stripTechnicalNoteText(notes);
}

function formatDateForRegister(dateValue: unknown): string {
  const d = new Date(String(dateValue || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

function parseDateMs(dateValue: unknown): number {
  const raw = String(dateValue || "").trim();
  if (!raw) return 0;

  const dotParts = raw.split(".");
  if (dotParts.length === 3) {
    const day = Number(dotParts[0]);
    const month = Number(dotParts[1]);
    const year = Number(dotParts[2]);
    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
      const parsed = new Date(year, month - 1, day).getTime();
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  const direct = new Date(raw).getTime();
  if (Number.isFinite(direct)) return direct;

  return 0;
}

function normalizeMemberText(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s\u200b\u200c\u200d\ufeff]/g, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function transactionBelongsToMember(tx: any, memberId: string, memberName: string): boolean {
  const directId = String(tx?.memberId || "").trim();
  if (directId && directId === memberId) return true;

  const notes = String(tx?.notes || "");
  if (notes.includes(`(${memberId})`)) return true;
  const memberIdRegex = new RegExp(`(?:linked_member|linked_member_id|beneficiary_member_id)\\s*=\\s*${escapeRegExp(memberId)}(?:\\b|\\s|$)`, "i");
  if (memberIdRegex.test(notes)) return true;

  const nameNorm = normalizeMemberText(memberName);
  if (nameNorm.length >= 2) {
    const payerNorm = normalizeMemberText(tx?.payerPayee);
    if (payerNorm && (payerNorm.includes(nameNorm) || nameNorm.includes(payerNorm))) return true;
  }

  return false;
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { transactions, members, loading, accountSettings, loans, getLoanInterestDue } = useData() as any;
  const { can, currentUser, profile } = useAuth();
  const canViewAllReports = can("reports.view_all");
  const canViewReports = can("reports.view_summary") || canViewAllReports;
  const canViewAllFinanceRecords = can("finance.view_detail") || can("finance.view_all");
  const canViewAuditFlags = can("finance.audit_flag") || canViewAllFinanceRecords;
  const canChooseScope = canViewAllReports && canViewAllFinanceRecords;
  
  // Default to 2018-01-01 to Today
  const [pickerStartDate, setPickerStartDate] = useState(new Date(2018, 0, 1));
  const [pickerEndDate, setPickerEndDate] = useState(new Date());

  const [startDate, setStartDate] = useState(pickerStartDate);
  const [endDate, setEndDate] = useState(pickerEndDate);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  
  const [reportTab, setReportTab] = useState<ReportTab>("income_expense");
  const [registerView, setRegisterView] = useState<RegisterView>("received");
  const [viewScope, setViewScope] = useState<ReportViewScope>("all");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditOnlyFlagged, setAuditOnlyFlagged] = useState(true);
  const [detailSortOrder, setDetailSortOrder] = useState<DetailSortOrder>("newest");
  const [activeFilterTag, setActiveFilterTag] = useState("all");
  const [computeReady, setComputeReady] = useState(false);
  const [visibleTxnDetailCount, setVisibleTxnDetailCount] = useState(REPORT_TXN_PAGE_SIZE);
  const [visibleLoanTxnCount, setVisibleLoanTxnCount] = useState(REPORT_TXN_PAGE_SIZE);
  const [visibleRegisterCount, setVisibleRegisterCount] = useState(REPORT_REGISTER_PAGE_SIZE);
  const [visibleCashBookCount, setVisibleCashBookCount] = useState(REPORT_CASHBOOK_PAGE_SIZE);
  const [visibleAuditCount, setVisibleAuditCount] = useState(REPORT_AUDIT_PAGE_SIZE);
  const [visibleMemberCount, setVisibleMemberCount] = useState(REPORT_MEMBER_PAGE_SIZE);
  const effectiveScope: ReportViewScope = canChooseScope ? viewScope : "self";
  const showDetailRows = canViewAllReports || effectiveScope !== "all";
  const useInlineYearPicker = width >= 768;
  const startDateMs = startDate.getTime();
  const endDateMs = endDate.getTime();
  const transactionCount = transactions?.length ?? 0;
  const loanCount = loans?.length ?? 0;

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
    setActiveFilterTag(`period-${months}`);
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

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setComputeReady(false);
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        if (!cancelled) setComputeReady(true);
      }, 40);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof (task as any)?.cancel === "function") {
        (task as any).cancel();
      }
    };
  }, [
    transactionCount,
    loanCount,
    startDateMs,
    endDateMs,
    scopedMemberId,
    reportTab,
    registerView,
  ]);

  const scopeLabel = useMemo(() => {
    if (effectiveScope === "all") return "အားလုံး";
    if (effectiveScope === "self") return "ကိုယ်တိုင်";
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
    if (scopedMemberId === "__none__") return [];
    const scopedMember = members.find((m: any) => String(m?.id || "") === scopedMemberId);
    const scopedMemberName = String(scopedMember?.name || "");
    return transactions.filter((t: any) => transactionBelongsToMember(t, scopedMemberId, scopedMemberName));
  }, [transactions, members, scopedMemberId]);

  const reportLoans = useMemo(() => {
    if (scopedMemberId === null) return loans;
    return loans.filter((loan: any) => loan.memberId === scopedMemberId);
  }, [loans, scopedMemberId]);

  const computeTransactions = useMemo(() => (computeReady ? reportTransactions : []), [computeReady, reportTransactions]);
  const computeLoans = useMemo(() => (computeReady ? reportLoans : []), [computeReady, reportLoans]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    (computeTransactions || []).forEach((t: any) => {
      const d = new Date(t?.date);
      if (!Number.isNaN(d.getTime())) years.add(d.getFullYear());
    });
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [computeTransactions]);

  const yearOptions = useMemo(() => {
    const minYear = 2018;
    const currentYear = new Date().getFullYear();
    const maxDetectedYear = availableYears.length > 0 ? Math.max(...availableYears) : currentYear;
    const maxYear = Math.max(currentYear + 10, maxDetectedYear + 2);
    const years: number[] = [];
    for (let year = minYear; year <= maxYear; year += 1) {
      years.push(year);
    }
    return years;
  }, [availableYears]);

  const selectedYearValue = useMemo(() => {
    if (!activeFilterTag.startsWith("year-")) return null;
    const value = Number(activeFilterTag.replace("year-", ""));
    return Number.isFinite(value) ? value : null;
  }, [activeFilterTag]);

  const selectedYearLabel = useMemo(
    () => (selectedYearValue ? String(selectedYearValue) : String(new Date().getFullYear())),
    [selectedYearValue]
  );

  const isYearFilterActive = selectedYearValue !== null;

  useEffect(() => {
    if (useInlineYearPicker && showYearPicker) {
      setShowYearPicker(false);
    }
  }, [useInlineYearPicker, showYearPicker]);

  const applyAllDateRange = useCallback(() => {
    const now = new Date();
    const start = new Date(2018, 0, 1);
    start.setHours(12, 0, 0, 0);
    now.setHours(12, 0, 0, 0);
    setPickerStartDate(start);
    setPickerEndDate(now);
    setStartDate(start);
    setEndDate(now);
    setActiveFilterTag("all");
  }, []);

  const applyYearDateRange = useCallback((year: number) => {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    start.setHours(12, 0, 0, 0);
    end.setHours(12, 0, 0, 0);
    setPickerStartDate(start);
    setPickerEndDate(end);
    setStartDate(start);
    setEndDate(end);
    setActiveFilterTag(`year-${year}`);
  }, []);

  const filteredTxns = useMemo(
    () => computeTransactions.filter((t: any) => {
      const d = new Date(t.date);
      const start = new Date(startDate); start.setHours(0,0,0,0);
      const end = new Date(endDate); end.setHours(23,59,59,999);
      return d >= start && d <= end;
    }),
    [computeTransactions, startDate, endDate]
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
    
    // Business rule: principal outstanding = total disbursed - total repaid (within selected filter scope)
    const principalOutstanding = Math.max(0, Number(disbursed || 0) - Number(repaid || 0));

    const interestOutstanding = (computeLoans || []).reduce((acc: number, l: any) => {
      const amount = Number(getLoanInterestDue(l.id) || 0);
      return acc + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
    }, 0);
    
    return { disbursed, repaid, interest, principalOutstanding, interestOutstanding };
  }, [filteredTxns, computeLoans, getLoanInterestDue]);

  const getBalancesAt = useCallback((date: Date) => {
    let cash = accountSettings?.openingBalanceCash || 0;
    let bank = accountSettings?.openingBalanceBank || 0;
    
    computeTransactions.forEach((t: any) => {
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
  }, [accountSettings, computeTransactions]);

  const fundStats = useMemo(() => {
    const start = new Date(startDate); start.setDate(start.getDate() - 1);
    const opening = getBalancesAt(start);
    const closing = getBalancesAt(endDate);
    return { opening, closing };
  }, [startDate, endDate, getBalancesAt]);

  const cashBookRows = useMemo(() => {
    const startBoundary = new Date(startDate);
    startBoundary.setHours(0, 0, 0, 0);
    const openingRefDate = new Date(startBoundary);
    openingRefDate.setDate(openingRefDate.getDate() - 1);
    const opening = getBalancesAt(openingRefDate);

    const sorted = [...filteredTxns].sort((a: any, b: any) => {
      const da = new Date(a?.date).getTime();
      const db = new Date(b?.date).getTime();
      if (da !== db) return da - db;
      return String(a?.receiptNumber || a?.id || "").localeCompare(String(b?.receiptNumber || b?.id || ""));
    });

    const rows: Array<{
      rowType: "opening" | "entry" | "daily_total";
      id: string;
      date: string;
      receipt: string;
      particulars: string;
      cashIn: number;
      cashOut: number;
      bankIn: number;
      bankOut: number;
      cashBalance: number;
      bankBalance: number;
      totalBalance: number;
    }> = [];

    let runningCash = Number(opening.cash || 0);
    let runningBank = Number(opening.bank || 0);
    let currentDay = "";
    let dayCashIn = 0;
    let dayCashOut = 0;
    let dayBankIn = 0;
    let dayBankOut = 0;

    const pushDailyTotal = (day: string) => {
      if (!day) return;
      rows.push({
        rowType: "daily_total",
        id: `day-total-${day}`,
        date: day,
        receipt: "",
        particulars: "နေ့စဉ်စုစုပေါင်း",
        cashIn: dayCashIn,
        cashOut: dayCashOut,
        bankIn: dayBankIn,
        bankOut: dayBankOut,
        cashBalance: runningCash,
        bankBalance: runningBank,
        totalBalance: runningCash + runningBank,
      });
      dayCashIn = 0;
      dayCashOut = 0;
      dayBankIn = 0;
      dayBankOut = 0;
    };

    rows.push({
      rowType: "opening",
      id: "opening-balance",
      date: startDate.toISOString().split("T")[0],
      receipt: "",
      particulars: "စာရင်းဖွင့်လက်ကျန်",
      cashIn: 0,
      cashOut: 0,
      bankIn: 0,
      bankOut: 0,
      cashBalance: runningCash,
      bankBalance: runningBank,
      totalBalance: runningCash + runningBank,
    });

    sorted.forEach((t: any) => {
      const dateText = String(t?.date || "");
      if (currentDay && dateText !== currentDay) pushDailyTotal(currentDay);
      currentDay = dateText;

      const amount = Number(t?.amount || 0);
      let cashIn = 0;
      let cashOut = 0;
      let bankIn = 0;
      let bankOut = 0;

      if (t?.type === "income") {
        if (t?.paymentMethod === "bank") bankIn = amount;
        else cashIn = amount;
      } else if (t?.type === "expense") {
        if (t?.paymentMethod === "bank") bankOut = amount;
        else cashOut = amount;
      } else if (t?.type === "transfer") {
        if (t?.category === "bank_deposit") {
          cashOut = amount;
          bankIn = amount;
        } else if (t?.category === "bank_withdraw") {
          bankOut = amount;
          cashIn = amount;
        }
      }

      runningCash += cashIn - cashOut;
      runningBank += bankIn - bankOut;
      dayCashIn += cashIn;
      dayCashOut += cashOut;
      dayBankIn += bankIn;
      dayBankOut += bankOut;

      const categoryLabel = getCategoryLabel(t.category);
      const payerPayee = String(t.payerPayee || t.memberId || "").trim();
      const notes = getReadableNotes(t.notes);
      const particulars = [
        categoryLabel,
        payerPayee ? `အမည် - ${payerPayee}` : "",
        notes ? `မှတ်ချက် - ${notes}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      rows.push({
        rowType: "entry",
        id: String(t.id || `${dateText}-${rows.length}`),
        date: dateText,
        receipt: String(t?.receiptNumber || ""),
        particulars,
        cashIn,
        cashOut,
        bankIn,
        bankOut,
        cashBalance: runningCash,
        bankBalance: runningBank,
        totalBalance: runningCash + runningBank,
      });
    });

    pushDailyTotal(currentDay);
    return rows;
  }, [filteredTxns, getBalancesAt, startDate]);

  const cashBookSummary = useMemo(() => {
    const openingRow = cashBookRows.find((r) => r.rowType === "opening");
    const lastRow = cashBookRows[cashBookRows.length - 1];
    const entryRows = cashBookRows.filter((r) => r.rowType === "entry");
    const totals = entryRows.reduce(
      (acc, row) => {
        acc.cashIn += row.cashIn;
        acc.cashOut += row.cashOut;
        acc.bankIn += row.bankIn;
        acc.bankOut += row.bankOut;
        return acc;
      },
      { cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0 }
    );
    return {
      openingCash: openingRow?.cashBalance || 0,
      openingBank: openingRow?.bankBalance || 0,
      closingCash: lastRow?.cashBalance || 0,
      closingBank: lastRow?.bankBalance || 0,
      ...totals,
    };
  }, [cashBookRows]);

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

  const feePaidMonthSet = useMemo(() => {
    const set = new Set<string>();
    const monthKey = (memberId: string, year: number, monthIdx: number) => `${memberId}|${year}|${monthIdx}`;
    (reportTransactions || []).forEach((t: any) => {
      if (String(t?.category || "") !== "member_fees") return;
      const memberId = String(t?.memberId || "").trim();
      if (!memberId) return;

      if (t?.feePeriodStart && t?.feePeriodEnd) {
        const start = new Date(t.feePeriodStart);
        const end = new Date(t.feePeriodEnd);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
          let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
          const boundary = new Date(end.getFullYear(), end.getMonth(), 1);
          while (cursor <= boundary) {
            set.add(monthKey(memberId, cursor.getFullYear(), cursor.getMonth()));
            cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
          }
          return;
        }
      }

      const d = new Date(t?.date);
      if (!Number.isNaN(d.getTime())) {
        set.add(monthKey(memberId, d.getFullYear(), d.getMonth()));
      }
    });
    return set;
  }, [reportTransactions]);

  const memberFeeTotalsByMemberId = useMemo(() => {
    const map = new Map<string, number>();
    filteredTxns.forEach((t: any) => {
      if (String(t?.category || "") !== "member_fees") return;
      const memberId = String(t?.memberId || "").trim();
      if (!memberId) return;
      map.set(memberId, (map.get(memberId) || 0) + Number(t?.amount || 0));
    });
    return map;
  }, [filteredTxns]);

  const incomeTransactions = useMemo(() => {
    return [...filteredTxns]
      .filter((t: any) => t.type === "income")
      .sort((a: any, b: any) => {
        const da = new Date(a.date).getTime();
        const db = new Date(b.date).getTime();
        if (da !== db) return da - db;
        return String(a.receiptNumber || a.id || "").localeCompare(String(b.receiptNumber || b.id || ""));
      });
  }, [filteredTxns]);

  const expenseTransactions = useMemo(() => {
    return [...filteredTxns]
      .filter((t: any) => t.type === "expense")
      .sort((a: any, b: any) => {
        const da = new Date(a.date).getTime();
        const db = new Date(b.date).getTime();
        if (da !== db) return da - db;
        return String(a.receiptNumber || a.id || "").localeCompare(String(b.receiptNumber || b.id || ""));
      });
  }, [filteredTxns]);

  const transferTransactions = useMemo(() => {
    return [...filteredTxns]
      .filter((t: any) => t.type === "transfer" || t.category === "bank_deposit" || t.category === "bank_withdraw")
      .sort((a: any, b: any) => {
        const da = new Date(a.date).getTime();
        const db = new Date(b.date).getTime();
        if (da !== db) return da - db;
        return String(a.receiptNumber || a.id || "").localeCompare(String(b.receiptNumber || b.id || ""));
      });
  }, [filteredTxns]);

  const incomeByCategory = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    incomeTransactions.forEach((t: any) => {
      const key = String(t.category || "other_income");
      const prev = map.get(key) || { amount: 0, count: 0 };
      map.set(key, { amount: prev.amount + Number(t.amount || 0), count: prev.count + 1 });
    });
    return Array.from(map.entries())
      .map(([category, data]) => ({ category, amount: data.amount, count: data.count }))
      .sort((a, b) => b.amount - a.amount);
  }, [incomeTransactions]);

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    expenseTransactions.forEach((t: any) => {
      const key = String(t.category || "other_expenses");
      const prev = map.get(key) || { amount: 0, count: 0 };
      map.set(key, { amount: prev.amount + Number(t.amount || 0), count: prev.count + 1 });
    });
    return Array.from(map.entries())
      .map(([category, data]) => ({ category, amount: data.amount, count: data.count }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenseTransactions]);

  const transferByCategory = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    transferTransactions.forEach((t: any) => {
      const key = String(t.category || "bank_deposit");
      const prev = map.get(key) || { amount: 0, count: 0 };
      map.set(key, { amount: prev.amount + Number(t.amount || 0), count: prev.count + 1 });
    });
    return Array.from(map.entries())
      .map(([category, data]) => ({ category, amount: data.amount, count: data.count }))
      .sort((a, b) => b.amount - a.amount);
  }, [transferTransactions]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    (members || []).forEach((m: any) => map.set(String(m?.id || ""), String(m?.name || "")));
    return map;
  }, [members]);

  const receivedRegisterRows = useMemo(() => {
    return incomeTransactions.map((t: any, index: number) => ({
      id: String(t.id || `received-${index}`),
      no: index + 1,
      date: formatDateForRegister(t.date),
      receipt: String(t.receiptNumber || "-"),
      name: String(t.payerPayee || memberNameById.get(String(t.memberId || "")) || t.memberId || "-"),
      amount: Number(t.amount || 0),
      heading: getCategoryLabel(t.category),
      notes: getReadableNotes(t.notes) || "-",
      fromDate: t.feePeriodStart ? formatDateForRegister(t.feePeriodStart) : "-",
      toDate: t.feePeriodEnd ? formatDateForRegister(t.feePeriodEnd) : "-",
    }));
  }, [incomeTransactions, memberNameById]);

  const expenditureRegisterRows = useMemo(() => {
    return expenseTransactions.map((t: any, index: number) => ({
      id: String(t.id || `expense-${index}`),
      no: index + 1,
      date: formatDateForRegister(t.date),
      receipt: String(t.receiptNumber || "-"),
      name: String(t.payerPayee || memberNameById.get(String(t.memberId || "")) || t.memberId || "-"),
      amount: Number(t.amount || 0),
      heading: getCategoryLabel(t.category),
      notes: getReadableNotes(t.notes) || "-",
    }));
  }, [expenseTransactions, memberNameById]);

  const expenseLoanRegisterRows = useMemo(() => {
    return expenseTransactions
      .filter((t: any) => String(t.category || "") === "loan_disbursement")
      .map((t: any, index: number) => ({
        id: String(t.id || `loan-out-${index}`),
        no: index + 1,
        date: formatDateForRegister(t.date),
        receipt: String(t.receiptNumber || "-"),
        name: String(t.payerPayee || memberNameById.get(String(t.memberId || "")) || t.memberId || "-"),
        memberId: String(t.memberId || "-"),
        amount: Number(t.amount || 0),
        heading: getCategoryLabel(t.category),
        notes: getReadableNotes(t.notes) || "-",
      }));
  }, [expenseTransactions, memberNameById]);

  const receivedLoanRegisterRows = useMemo(() => {
    return incomeTransactions
      .filter((t: any) => ["loan_repayment", "interest_income"].includes(String(t.category || "")))
      .map((t: any, index: number) => ({
        id: String(t.id || `loan-in-${index}`),
        no: index + 1,
        date: formatDateForRegister(t.date),
        receipt: String(t.receiptNumber || "-"),
        name: String(t.payerPayee || memberNameById.get(String(t.memberId || "")) || t.memberId || "-"),
        memberId: String(t.memberId || "-"),
        amount: Number(t.amount || 0),
        heading: getCategoryLabel(t.category),
        notes: getReadableNotes(t.notes) || "-",
      }));
  }, [incomeTransactions, memberNameById]);

  const activeRegisterRows = useMemo(() => {
    if (registerView === "received") return receivedRegisterRows;
    if (registerView === "expenditure") return expenditureRegisterRows;
    if (registerView === "loan_out") return expenseLoanRegisterRows;
    return receivedLoanRegisterRows;
  }, [registerView, receivedRegisterRows, expenditureRegisterRows, expenseLoanRegisterRows, receivedLoanRegisterRows]);

  const activeRegisterTitle = useMemo(() => {
    if (registerView === "received") return "ရငွေမှတ်ပုံတင်စာရင်း";
    if (registerView === "expenditure") return "ထုတ်ပေးငွေမှတ်ပုံတင်စာရင်း";
    if (registerView === "loan_out") return "ချေးငွေထုတ်ပေးစာရင်း";
    return "ချေးငွေပြန်ရ/အတိုးရစာရင်း";
  }, [registerView]);

  const activeRegisterSummaryByHeading = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    activeRegisterRows.forEach((row: any) => {
      const key = String(row.heading || "အခြား");
      const prev = map.get(key) || { total: 0, count: 0 };
      map.set(key, { total: prev.total + Number(row.amount || 0), count: prev.count + 1 });
    });
    return Array.from(map.entries())
      .map(([heading, data]) => ({ heading, total: data.total, count: data.count }))
      .sort((a, b) => b.total - a.total);
  }, [activeRegisterRows]);

  const activeRegisterTotals = useMemo(() => {
    return {
      count: activeRegisterRows.length,
      amount: activeRegisterRows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0),
    };
  }, [activeRegisterRows]);

  const scopedAuditRows = useMemo(() => {
    const needle = auditSearch.trim().toLowerCase();
    return filteredTxns.filter((t: any) => {
      if (auditOnlyFlagged && !t.auditFlagged) return false;
      if (!needle) return true;
      const categoryLabel = getCategoryLabel(t.category);
      return (
        String(t.memberId || "").toLowerCase().includes(needle) ||
        String(t.receiptNumber || "").toLowerCase().includes(needle) ||
        String(t.auditNote || "").toLowerCase().includes(needle) ||
        String(categoryLabel).toLowerCase().includes(needle)
      );
    });
  }, [filteredTxns, auditSearch, auditOnlyFlagged]);

  const compareDateWithReceipt = useCallback(
    (a: any, b: any) => {
      const aMs = parseDateMs(a?.date);
      const bMs = parseDateMs(b?.date);
      if (aMs !== bMs) {
        return detailSortOrder === "newest" ? bMs - aMs : aMs - bMs;
      }
      const aReceipt = String(a?.receiptNumber || a?.receipt || a?.id || "");
      const bReceipt = String(b?.receiptNumber || b?.receipt || b?.id || "");
      return detailSortOrder === "newest"
        ? bReceipt.localeCompare(aReceipt)
        : aReceipt.localeCompare(bReceipt);
    },
    [detailSortOrder]
  );

  const nonTransferRows = useMemo(() => filteredTxns.filter((t: any) => t.type !== "transfer"), [filteredTxns]);
  const loanTxnRows = useMemo(
    () => filteredTxns.filter((t: any) => ["loan_disbursement", "loan_repayment", "interest_income"].includes(String(t.category || ""))),
    [filteredTxns]
  );
  const sortedNonTransferRows = useMemo(() => [...nonTransferRows].sort(compareDateWithReceipt), [nonTransferRows, compareDateWithReceipt]);
  const sortedLoanTxnRows = useMemo(() => [...loanTxnRows].sort(compareDateWithReceipt), [loanTxnRows, compareDateWithReceipt]);
  const sortedRegisterRows = useMemo(() => [...activeRegisterRows].sort(compareDateWithReceipt), [activeRegisterRows, compareDateWithReceipt]);
  const pagedNonTransferRows = useMemo(() => sortedNonTransferRows.slice(0, visibleTxnDetailCount), [sortedNonTransferRows, visibleTxnDetailCount]);
  const pagedLoanTxnRows = useMemo(() => sortedLoanTxnRows.slice(0, visibleLoanTxnCount), [sortedLoanTxnRows, visibleLoanTxnCount]);
  const pagedRegisterRows = useMemo(() => sortedRegisterRows.slice(0, visibleRegisterCount), [sortedRegisterRows, visibleRegisterCount]);
  const pagedCashBookRows = useMemo(() => cashBookRows.slice(0, visibleCashBookCount), [cashBookRows, visibleCashBookCount]);
  const pagedAuditRows = useMemo(() => scopedAuditRows.slice(0, visibleAuditCount), [scopedAuditRows, visibleAuditCount]);
  const pagedReportMembers = useMemo(() => reportMembers.slice(0, visibleMemberCount), [reportMembers, visibleMemberCount]);

  const hasMoreNonTransferRows = pagedNonTransferRows.length < sortedNonTransferRows.length;
  const hasMoreLoanTxnRows = pagedLoanTxnRows.length < sortedLoanTxnRows.length;
  const hasMoreRegisterRows = pagedRegisterRows.length < sortedRegisterRows.length;
  const hasMoreCashBookRows = pagedCashBookRows.length < cashBookRows.length;
  const hasMoreAuditRows = pagedAuditRows.length < scopedAuditRows.length;
  const hasMoreReportMembers = pagedReportMembers.length < reportMembers.length;

  const renderTransactionDetailCard = useCallback(
    (t: any, index: number, keyPrefix: string) => {
      const name = String(
        t?.payerPayee ||
          memberNameById.get(String(t?.memberId || "")) ||
          t?.memberId ||
          "-"
      );
      const notes = getReadableNotes(t?.notes);
      const amount = Number(t?.amount || 0);
      const isExpense = String(t?.type || "") === "expense";
      const amountColor = isExpense ? "#EF4444" : "#0F766E";
      const amountPrefix = isExpense ? "-" : "+";
      const fromDate = t?.feePeriodStart ? formatDateForRegister(t.feePeriodStart) : "-";
      const toDate = t?.feePeriodEnd ? formatDateForRegister(t.feePeriodEnd) : "-";
      const hasPeriod = fromDate !== "-" || toDate !== "-";
      const memberIdText = String(t?.memberId || "").trim();

      return (
        <View key={`${keyPrefix}-${t?.id || index}`} style={styles.registerCard}>
          <Text style={styles.registerCardTitle}>{index + 1}. {name}</Text>
          <Text style={[styles.registerCardAmount, { color: amountColor }]}>
            {amountPrefix}{amount.toLocaleString()} KS
          </Text>
          <Text style={styles.registerCardMeta}>
            ရက်စွဲ: {formatDateForRegister(t?.date)} | ပြေစာအမှတ်: {String(t?.receiptNumber || "-")}
          </Text>
          <Text style={styles.registerCardMeta}>ခေါင်းစဉ်: {getCategoryLabel(t?.category)}</Text>
          {hasPeriod ? <Text style={styles.registerCardMeta}>ကာလ: {fromDate} မှ {toDate}</Text> : null}
          {memberIdText ? <Text style={styles.registerCardMeta}>အသင်းဝင်အမှတ်: {memberIdText}</Text> : null}
          {notes ? <Text style={styles.registerCardNote}>မှတ်ချက်: {notes}</Text> : null}
        </View>
      );
    },
    [memberNameById]
  );

  const renderDetailSortToggle = useCallback(
    () => (
      <View style={styles.detailSortRow}>
        <Pressable
          style={[styles.detailSortChip, detailSortOrder === "newest" && styles.detailSortChipActive]}
          onPress={() => setDetailSortOrder("newest")}
        >
          <Text style={[styles.detailSortChipText, detailSortOrder === "newest" && styles.detailSortChipTextActive]}>
            နောက်ဆုံးမှစ
          </Text>
        </Pressable>
        <Pressable
          style={[styles.detailSortChip, detailSortOrder === "oldest" && styles.detailSortChipActive]}
          onPress={() => setDetailSortOrder("oldest")}
        >
          <Text style={[styles.detailSortChipText, detailSortOrder === "oldest" && styles.detailSortChipTextActive]}>
            အစဆုံးမှစ
          </Text>
        </Pressable>
      </View>
    ),
    [detailSortOrder]
  );

  useEffect(() => {
    setVisibleTxnDetailCount(REPORT_TXN_PAGE_SIZE);
    setVisibleLoanTxnCount(REPORT_TXN_PAGE_SIZE);
    setVisibleRegisterCount(REPORT_REGISTER_PAGE_SIZE);
    setVisibleCashBookCount(REPORT_CASHBOOK_PAGE_SIZE);
    setVisibleAuditCount(REPORT_AUDIT_PAGE_SIZE);
    setVisibleMemberCount(REPORT_MEMBER_PAGE_SIZE);
  }, [reportTab, registerView, startDateMs, endDateMs, scopedMemberId, computeReady]);

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
          dialogTitle: "စာရင်းစစ် အမှတ်အသား JSON ထုတ်ယူရန်",
          UTI: "public.json",
        });
      }
    } catch {
      Alert.alert("အမှား", "စာရင်းစစ် အမှတ်အသား JSON ထုတ်ယူမှု မအောင်မြင်ပါ။");
    }
  };

  const exportAuditCsv = async () => {
    const headers = ["member_id", "category", "amount", "date", "receipt", "audit_flagged", "audit_note", "flagged_by", "flagged_at"];
    const rows = scopedAuditRows.map((t: any) =>
      [
        t.memberId || "",
        getCategoryLabel(t.category),
        t.amount || 0,
        t.date || "",
        t.receiptNumber || "",
        t.auditFlagged ? "ဟုတ်" : "မဟုတ်",
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
          dialogTitle: "စာရင်းစစ် အမှတ်အသား CSV ထုတ်ယူရန်",
          UTI: "public.comma-separated-values-text",
        });
      }
    } catch {
      Alert.alert("အမှား", "စာရင်းစစ် အမှတ်အသား CSV ထုတ်ယူမှု မအောင်မြင်ပါ။");
    }
  };

  const generatePdf = async () => {
    if (!canViewAllReports) {
      Alert.alert("ခွင့်မပြုပါ", "အကျဉ်းချုပ်ကြည့်ခွင့်သာ ရှိသောကြောင့် အသင်းဝင်အသေးစိတ်အစီရင်ခံစာ PDF မထုတ်နိုင်ပါ။");
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
          <p>အသင်းဝင်စာရင်း အစီရင်ခံစာ • ${new Date().toLocaleDateString()}</p>
          
          <table>
            <thead>
              <tr>
                <th style="width: 40px;">No.</th>
                <th>အမည်</th>
                <th>အသင်းဝင်အမှတ်</th>
                <th>ဖုန်း</th>
                <th>အီးမေးလ်</th>
                <th>NRC</th>
                <th>ဝင်ခွင့်နေ့</th>
                <th>အခြေအနေ</th>
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
          <div class="footer">Social Org Manager App မှ ထုတ်ပေးသည်</div>
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

  if (loading || !computeReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingHint}>လုပ်ဆောင်နေပါတယ် ခေတ္တစောင့်ပါ။</Text>
        <View style={styles.loadingBarTrack}>
          <View style={styles.loadingBarFill} />
        </View>
      </View>
    );
  }

  if (!canViewReports) {
    return <AccessDenied showBack={false} />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.pageContent, { paddingTop: insets.top }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.header}>
        <Text style={styles.title}>အစီရင်ခံစာ - {scopeLabel}</Text>
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
            onPress={() => {
              setStartDate(pickerStartDate);
              setEndDate(pickerEndDate);
              setActiveFilterTag("custom");
            }}
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
        <View style={styles.periodPicker}>
          <Pressable
            style={[styles.periodBtn, activeFilterTag === "all" && styles.periodBtnActive]}
            onPress={applyAllDateRange}
          >
            <Text style={[styles.periodText, activeFilterTag === "all" && styles.periodTextActive]}>အစမှ အဆုံးထိ</Text>
          </Pressable>
          {useInlineYearPicker ? (
            <View style={styles.inlineYearPickerWrap}>
              {yearOptions.map((year) => (
                <Pressable
                  key={year}
                  style={[styles.periodBtn, activeFilterTag === `year-${year}` && styles.periodBtnActive]}
                  onPress={() => applyYearDateRange(year)}
                >
                  <Text style={[styles.periodText, activeFilterTag === `year-${year}` && styles.periodTextActive]}>
                    {year}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Pressable
              style={[styles.periodBtn, styles.yearDropdownBtn, isYearFilterActive && styles.periodBtnActive]}
              onPress={() => setShowYearPicker(true)}
            >
              <Text style={[styles.periodText, styles.yearDropdownText, isYearFilterActive && styles.periodTextActive]}>
                {selectedYearLabel}
              </Text>
              <Ionicons
                name="chevron-down"
                size={14}
                color={isYearFilterActive ? "#fff" : Colors.light.textSecondary}
              />
            </Pressable>
          )}
        </View>
      </View>
      {canChooseScope && (
        <View style={styles.scopeCard}>
          <View style={styles.scopeTopRow}>
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
          </View>
          {viewScope === "member" && (
            <View style={styles.memberPickerWrap}>
              <TextInput
                style={styles.memberSearchInput}
                value={memberSearch}
                onChangeText={setMemberSearch}
                placeholder="အသင်းဝင်အမှတ် / အမည်အပြည့်အစုံ ရိုက်ရှာပါ"
              />
              <Pressable style={styles.memberPickerBtn} onPress={() => setShowMemberPicker(true)}>
                <Text style={styles.memberPickerBtnText} numberOfLines={1}>
                  {selectedMemberId === "" ? "စာရင်းမှ အသင်းဝင်ရွေးမည်" : `${members.find((m: any) => m.id === selectedMemberId)?.name || ""} (${selectedMemberId})`}
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
        <View style={styles.tabBarWrap}>
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
          <Pressable style={[styles.tab, reportTab === "registers" && styles.activeTab]} onPress={() => setReportTab("registers")}>
            <Text style={[styles.tabText, reportTab === "registers" && styles.activeTabText]}>
              မှတ်ပုံတင်စာရင်း
            </Text>
          </Pressable>
          <Pressable style={[styles.tab, reportTab === "cash_book" && styles.activeTab]} onPress={() => setReportTab("cash_book")}>
            <Text style={[styles.tabText, reportTab === "cash_book" && styles.activeTabText]}>
              နှစ်ကော်လံ ငွေစာရင်း
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
        </View>
      </View>
      {!canChooseScope && (
        <View style={styles.summaryOnlyNote}>
          <Ionicons name="person-circle-outline" size={18} color="#1E3A8A" />
          <Text style={styles.summaryOnlyNoteText}>သင့်အကောင့်နှင့်သက်ဆိုင်သော အစီရင်ခံစာအချက်အလက်များကိုသာ ပြသထားပါသည်။</Text>
        </View>
      )}

      {reportTab === "income_expense" && (
        <View style={styles.scrollContent}>
            <View style={styles.incomeSummaryRow}>
              <View style={[styles.incomeSummaryBox, { borderLeftColor: "#10B981" }]}>
                <Text style={styles.incomeSummaryLabel}>{isAllScope ? "စုစုပေါင်းအဝင်" : "ပေးသွင်းငွေ"}</Text>
                <Text style={[styles.incomeSummaryValue, { color: "#10B981" }]}>
                  {incomeExpenseStats.income.toLocaleString()} KS
                </Text>
              </View>
              <View style={[styles.incomeSummaryBox, { borderLeftColor: "#F43F5E" }]}>
                <Text style={styles.incomeSummaryLabel}>{isAllScope ? "စုစုပေါင်းအထွက်" : "ထုတ်ယူငွေ"}</Text>
                <Text style={[styles.incomeSummaryValue, { color: "#F43F5E" }]}>
                  {incomeExpenseStats.expense.toLocaleString()} KS
                </Text>
              </View>
              <View style={[styles.incomeSummaryBox, styles.incomeSummaryBoxWide, { borderLeftColor: "#8B5CF6" }]}>
                <Text style={styles.incomeSummaryLabel}>ခြားနားချက်</Text>
                <Text style={[styles.incomeSummaryValue, { color: "#8B5CF6" }]}>
                  {incomeExpenseStats.net.toLocaleString()} KS
                </Text>
              </View>
            </View>

            {showDetailRows ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>အသေးစိတ် စာရင်းများ</Text>
                {renderDetailSortToggle()}
                {pagedNonTransferRows.map((t: any, index: number) => renderTransactionDetailCard(t, index, "income-expense"))}
                {hasMoreNonTransferRows ? (
                  <View style={styles.loadMoreWrap}>
                    <Pressable style={styles.loadMoreBtn} onPress={() => setVisibleTxnDetailCount((prev) => prev + REPORT_TXN_PAGE_SIZE)}>
                      <Text style={styles.loadMoreBtnText}>
                        နောက်ထပ် {Math.min(REPORT_TXN_PAGE_SIZE, sortedNonTransferRows.length - pagedNonTransferRows.length).toLocaleString()} ခု ပြရန်
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.summaryOnlyNote}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#1E3A8A" />
                <Text style={styles.summaryOnlyNoteText}>အကျဉ်းချုပ်ကြည့်ခွင့်သာ ရရှိထားသောကြောင့် အသေးစိတ်စာရင်းများ မပြထားပါ။</Text>
              </View>
            )}
        </View>
      )}

      {reportTab === "loans" && (
        <View style={styles.scrollContent}>
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
              <Text style={styles.statLabel}>အရင်းပြန်ဆပ်ရန်ကျန်ငွေ</Text>
              <Text style={[styles.statValue, { color: "#EF4444" }]}>{loanStats.principalOutstanding.toLocaleString()} KS</Text>
            </View>
          </View>
          <View style={[styles.summaryGrid, { marginTop: -10 }]}>
            <View style={[styles.statBox, { borderLeftColor: "#B45309" }]}>
              <Text style={styles.statLabel}>အတိုးဆပ်ရန်ကျန်ငွေ</Text>
              <Text style={[styles.statValue, { color: "#B45309" }]}>{loanStats.interestOutstanding.toLocaleString()} KS</Text>
            </View>
          </View>
          {showDetailRows ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ချေးငွေဆိုင်ရာ မှတ်တမ်းများ</Text>
              {renderDetailSortToggle()}
              {pagedLoanTxnRows.map((t: any, index: number) => renderTransactionDetailCard(t, index, "loan"))}
              {hasMoreLoanTxnRows ? (
                <View style={styles.loadMoreWrap}>
                  <Pressable style={styles.loadMoreBtn} onPress={() => setVisibleLoanTxnCount((prev) => prev + REPORT_TXN_PAGE_SIZE)}>
                    <Text style={styles.loadMoreBtnText}>
                      နောက်ထပ် {Math.min(REPORT_TXN_PAGE_SIZE, sortedLoanTxnRows.length - pagedLoanTxnRows.length).toLocaleString()} ခု ပြရန်
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.summaryOnlyNote}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#1E3A8A" />
              <Text style={styles.summaryOnlyNoteText}>အကျဉ်းချုပ်ကြည့်ခွင့်သာ ရရှိထားသောကြောင့် ချေးငွေ အသေးစိတ်မှတ်တမ်း မပြထားပါ။</Text>
            </View>
          )}
        </View>
      )}

      {reportTab === "funds" && (
        <View style={styles.scrollContent}>
          {isAllScope ? (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>လက်ကျန်ရှင်းတမ်း (စာရင်းဖွင့်/စာရင်းပိတ်)</Text>
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

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>ရငွေ စာရင်းချုပ် (ခေါင်းစဉ်အလိုက်)</Text>
                {incomeByCategory.length === 0 ? (
                  <Text style={styles.summaryOnlyNoteText}>ရငွေစာရင်း မရှိသေးပါ။</Text>
                ) : (
                  incomeByCategory.map((row) => (
                    <View key={`income-${row.category}`} style={styles.catRow}>
                      <Text style={styles.catLabel}>{getCategoryLabel(row.category)} ({row.count})</Text>
                      <Text style={styles.catValue}>{row.amount.toLocaleString()} KS</Text>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>အသုံးစရိတ် စာရင်းချုပ် (ခေါင်းစဉ်အလိုက်)</Text>
                {expenseByCategory.length === 0 ? (
                  <Text style={styles.summaryOnlyNoteText}>အသုံးစရိတ်စာရင်း မရှိသေးပါ။</Text>
                ) : (
                  expenseByCategory.map((row) => (
                    <View key={`expense-${row.category}`} style={styles.catRow}>
                      <Text style={styles.catLabel}>{getCategoryLabel(row.category)} ({row.count})</Text>
                      <Text style={styles.catValue}>{row.amount.toLocaleString()} KS</Text>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>ဘဏ်သွင်း/ဘဏ်ထုတ် စာရင်းချုပ်</Text>
                {transferByCategory.length === 0 ? (
                  <Text style={styles.summaryOnlyNoteText}>ဘဏ်သွင်း/ဘဏ်ထုတ် မှတ်တမ်း မရှိသေးပါ။</Text>
                ) : (
                  transferByCategory.map((row) => (
                    <View key={`transfer-${row.category}`} style={styles.catRow}>
                      <Text style={styles.catLabel}>{getCategoryLabel(row.category)} ({row.count})</Text>
                      <Text style={styles.catValue}>{row.amount.toLocaleString()} KS</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          ) : (
            <>
              <View style={styles.summaryGrid}>
                <View style={[styles.statBox, { borderLeftColor: "#10B981" }]}>
                  <Text style={styles.statLabel}>အသင်းသို့ပေးသွင်းငွေ</Text>
                  <Text style={[styles.statValue, { color: "#10B981" }]}>{incomeExpenseStats.income.toLocaleString()} KS</Text>
                </View>
                <View style={[styles.statBox, { borderLeftColor: "#F43F5E" }]}>
                  <Text style={styles.statLabel}>အသင်းမှထုတ်ယူငွေ</Text>
                  <Text style={[styles.statValue, { color: "#F43F5E" }]}>{incomeExpenseStats.expense.toLocaleString()} KS</Text>
                </View>
              </View>
              <View style={[styles.summaryGrid, { marginTop: -10 }]}>
                <View style={[styles.statBox, { borderLeftColor: "#8B5CF6" }]}>
                  <Text style={styles.statLabel}>ခြားနားချက် (+/-)</Text>
                  <Text style={[styles.statValue, { color: "#8B5CF6" }]}>{incomeExpenseStats.net.toLocaleString()} KS</Text>
                </View>
              </View>
            </>
          )}

          {showDetailRows ? (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>အသေးစိတ် စာရင်းများ</Text>
                {renderDetailSortToggle()}
                {pagedNonTransferRows.map((t: any, index: number) => renderTransactionDetailCard(t, index, "fund"))}
                {hasMoreNonTransferRows ? (
                  <View style={styles.loadMoreWrap}>
                    <Pressable style={styles.loadMoreBtn} onPress={() => setVisibleTxnDetailCount((prev) => prev + REPORT_TXN_PAGE_SIZE)}>
                      <Text style={styles.loadMoreBtnText}>
                        နောက်ထပ် {Math.min(REPORT_TXN_PAGE_SIZE, sortedNonTransferRows.length - pagedNonTransferRows.length).toLocaleString()} ခု ပြရန်
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </>
          ) : (
            <View style={styles.summaryOnlyNote}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#1E3A8A" />
              <Text style={styles.summaryOnlyNoteText}>အကျဉ်းချုပ်ကြည့်ခွင့်သာ ရရှိထားသောကြောင့် အသေးစိတ်စာရင်းများ မပြထားပါ။</Text>
            </View>
          )}
        </View>
      )}

      {reportTab === "registers" && (
        <View style={styles.scrollContent}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>မှတ်ပုံတင်ပုံစံ စာရင်းများ</Text>
            <View style={styles.registerModeRow}>
              <Pressable style={[styles.registerModeChip, registerView === "received" && styles.registerModeChipActive]} onPress={() => setRegisterView("received")}>
                <Text style={[styles.registerModeChipText, registerView === "received" && styles.registerModeChipTextActive]}>ရငွေ</Text>
              </Pressable>
              <Pressable style={[styles.registerModeChip, registerView === "expenditure" && styles.registerModeChipActive]} onPress={() => setRegisterView("expenditure")}>
                <Text style={[styles.registerModeChipText, registerView === "expenditure" && styles.registerModeChipTextActive]}>ထုတ်ပေးငွေ</Text>
              </Pressable>
              <Pressable style={[styles.registerModeChip, registerView === "loan_out" && styles.registerModeChipActive]} onPress={() => setRegisterView("loan_out")}>
                <Text style={[styles.registerModeChipText, registerView === "loan_out" && styles.registerModeChipTextActive]}>ချေးငွေထုတ်</Text>
              </Pressable>
              <Pressable style={[styles.registerModeChip, registerView === "loan_in" && styles.registerModeChipActive]} onPress={() => setRegisterView("loan_in")}>
                <Text style={[styles.registerModeChipText, registerView === "loan_in" && styles.registerModeChipTextActive]}>ချေးငွေပြန်ရ/အတိုး</Text>
              </Pressable>
            </View>
            <Text style={styles.catSub}>{activeRegisterTitle}</Text>
          </View>

          <View style={styles.summaryGrid}>
            <View style={[styles.statBox, { borderLeftColor: "#2563EB" }]}>
              <Text style={styles.statLabel}>စာရင်းအရေအတွက်</Text>
              <Text style={[styles.statValue, { color: "#2563EB" }]}>{activeRegisterTotals.count.toLocaleString()}</Text>
            </View>
            <View style={[styles.statBox, { borderLeftColor: "#10B981" }]}>
              <Text style={styles.statLabel}>စုစုပေါင်းငွေပမာဏ</Text>
              <Text style={[styles.statValue, { color: "#10B981" }]}>{activeRegisterTotals.amount.toLocaleString()} KS</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ခေါင်းစဉ်အလိုက် စာရင်းချုပ်</Text>
            {activeRegisterSummaryByHeading.length === 0 ? (
              <Text style={styles.summaryOnlyNoteText}>စာရင်းမရှိသေးပါ။</Text>
            ) : (
              activeRegisterSummaryByHeading.map((row) => (
                <View key={`reg-sum-${row.heading}`} style={styles.catRow}>
                  <Text style={styles.catLabel}>{row.heading} ({row.count})</Text>
                  <Text style={styles.catValue}>{row.total.toLocaleString()} KS</Text>
                </View>
              ))
            )}
          </View>

          {showDetailRows ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>အသေးစိတ်မှတ်တမ်း</Text>
              {renderDetailSortToggle()}
              {sortedRegisterRows.length === 0 ? (
                <Text style={styles.summaryOnlyNoteText}>အသေးစိတ်စာရင်း မရှိသေးပါ။</Text>
              ) : (
                pagedRegisterRows.map((row: any) => (
                  <View key={row.id} style={styles.registerCard}>
                    <Text style={styles.registerCardTitle}>{row.no}. {row.name}</Text>
                    <Text style={styles.registerCardAmount}>{Number(row.amount || 0).toLocaleString()} KS</Text>
                    <Text style={styles.registerCardMeta}>ရက်စွဲ: {row.date} | ပြေစာအမှတ်: {row.receipt}</Text>
                    <Text style={styles.registerCardMeta}>ခေါင်းစဉ်: {row.heading || "-"}</Text>
                    {registerView === "received" && (row.fromDate !== "-" || row.toDate !== "-") ? (
                      <Text style={styles.registerCardMeta}>ကာလ: {row.fromDate || "-"} မှ {row.toDate || "-"}</Text>
                    ) : null}
                    {!!row.memberId && row.memberId !== "-" ? <Text style={styles.registerCardMeta}>အသင်းဝင်အမှတ်: {row.memberId}</Text> : null}
                    {!!row.notes && row.notes !== "-" ? <Text style={styles.registerCardNote}>မှတ်ချက်: {row.notes}</Text> : null}
                  </View>
                ))
              )}
              {hasMoreRegisterRows ? (
                <View style={styles.loadMoreWrap}>
                  <Pressable style={styles.loadMoreBtn} onPress={() => setVisibleRegisterCount((prev) => prev + REPORT_REGISTER_PAGE_SIZE)}>
                    <Text style={styles.loadMoreBtnText}>
                      နောက်ထပ် {Math.min(REPORT_REGISTER_PAGE_SIZE, sortedRegisterRows.length - pagedRegisterRows.length).toLocaleString()} ခု ပြရန်
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.summaryOnlyNote}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#1E3A8A" />
              <Text style={styles.summaryOnlyNoteText}>ကြည့်ရှုခွင့်ကန့်သတ်ထားသောကြောင့် အသေးစိတ်စာရင်း မပြထားပါ။</Text>
            </View>
          )}
        </View>
      )}

      {reportTab === "cash_book" && (
        <View style={styles.scrollContent}>
          {isAllScope ? (
            <>
              <View style={styles.summaryGrid}>
                <View style={[styles.statBox, { borderLeftColor: "#0EA5A4" }]}>
                  <Text style={styles.statLabel}>စာရင်းဖွင့် (ငွေသား/ဘဏ်)</Text>
                  <Text style={[styles.statValue, { color: "#0EA5A4" }]}>
                    {cashBookSummary.openingCash.toLocaleString()} / {cashBookSummary.openingBank.toLocaleString()}
                  </Text>
                </View>
                <View style={[styles.statBox, { borderLeftColor: "#2563EB" }]}>
                  <Text style={styles.statLabel}>စာရင်းပိတ် (ငွေသား/ဘဏ်)</Text>
                  <Text style={[styles.statValue, { color: "#2563EB" }]}>
                    {cashBookSummary.closingCash.toLocaleString()} / {cashBookSummary.closingBank.toLocaleString()}
                  </Text>
                </View>
              </View>

              <View style={[styles.summaryGrid, { marginTop: -10 }]}>
                <View style={[styles.statBox, { borderLeftColor: "#10B981" }]}>
                  <Text style={styles.statLabel}>ငွေသား ဝင် / ထွက်</Text>
                  <Text style={[styles.statValue, { color: "#10B981" }]}>
                    {cashBookSummary.cashIn.toLocaleString()} / {cashBookSummary.cashOut.toLocaleString()}
                  </Text>
                </View>
                <View style={[styles.statBox, { borderLeftColor: "#F59E0B" }]}>
                  <Text style={styles.statLabel}>ဘဏ် ဝင် / ထွက်</Text>
                  <Text style={[styles.statValue, { color: "#F59E0B" }]}>
                    {cashBookSummary.bankIn.toLocaleString()} / {cashBookSummary.bankOut.toLocaleString()}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.summaryGrid}>
                <View style={[styles.statBox, { borderLeftColor: "#10B981" }]}>
                  <Text style={styles.statLabel}>အသင်းသို့ပေးသွင်းငွေ</Text>
                  <Text style={[styles.statValue, { color: "#10B981" }]}>{incomeExpenseStats.income.toLocaleString()} KS</Text>
                </View>
                <View style={[styles.statBox, { borderLeftColor: "#F43F5E" }]}>
                  <Text style={styles.statLabel}>အသင်းမှထုတ်ယူငွေ</Text>
                  <Text style={[styles.statValue, { color: "#F43F5E" }]}>{incomeExpenseStats.expense.toLocaleString()} KS</Text>
                </View>
              </View>
              <View style={[styles.summaryGrid, { marginTop: -10 }]}>
                <View style={[styles.statBox, { borderLeftColor: "#8B5CF6" }]}>
                  <Text style={styles.statLabel}>ခြားနားချက် (+/-)</Text>
                  <Text style={[styles.statValue, { color: "#8B5CF6" }]}>{incomeExpenseStats.net.toLocaleString()} KS</Text>
                </View>
              </View>
            </>
          )}

          {showDetailRows ? (
            isAllScope ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>နှစ်ကော်လံ ငွေစာရင်းစာအုပ် (နေ့စဉ်အသေးစိတ်)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View>
                    <View style={styles.cashBookHeaderRow}>
                      <Text style={[styles.cashBookHeaderCell, styles.cashBookDateCol]}>ရက်စွဲ</Text>
                      <Text style={[styles.cashBookHeaderCell, styles.cashBookReceiptCol]}>ပြေစာအမှတ်</Text>
                      <Text style={[styles.cashBookHeaderCell, styles.cashBookParticularCol]}>အကြောင်းအရာ</Text>
                      <Text style={[styles.cashBookHeaderCell, styles.cashBookAmountCol]}>ငွေသားဝင်</Text>
                      <Text style={[styles.cashBookHeaderCell, styles.cashBookAmountCol]}>ငွေသားထွက်</Text>
                      <Text style={[styles.cashBookHeaderCell, styles.cashBookAmountCol]}>ဘဏ်ဝင်</Text>
                      <Text style={[styles.cashBookHeaderCell, styles.cashBookAmountCol]}>ဘဏ်ထွက်</Text>
                      <Text style={[styles.cashBookHeaderCell, styles.cashBookAmountCol]}>ငွေသားလက်ကျန်</Text>
                      <Text style={[styles.cashBookHeaderCell, styles.cashBookAmountCol]}>ဘဏ်လက်ကျန်</Text>
                    </View>
                    {pagedCashBookRows.map((row) => (
                      <View
                        key={row.id}
                        style={[
                          styles.cashBookDataRow,
                          row.rowType === "opening" && styles.cashBookOpeningRow,
                          row.rowType === "daily_total" && styles.cashBookTotalRow,
                        ]}
                      >
                        <Text style={[styles.cashBookCell, styles.cashBookDateCol]}>{row.date || "-"}</Text>
                        <Text style={[styles.cashBookCell, styles.cashBookReceiptCol]}>{row.receipt || "-"}</Text>
                        <Text style={[styles.cashBookCell, styles.cashBookParticularCol]} numberOfLines={2}>
                          {row.particulars}
                        </Text>
                        <Text style={[styles.cashBookCell, styles.cashBookAmountCol]}>{row.cashIn ? row.cashIn.toLocaleString() : "-"}</Text>
                        <Text style={[styles.cashBookCell, styles.cashBookAmountCol]}>{row.cashOut ? row.cashOut.toLocaleString() : "-"}</Text>
                        <Text style={[styles.cashBookCell, styles.cashBookAmountCol]}>{row.bankIn ? row.bankIn.toLocaleString() : "-"}</Text>
                        <Text style={[styles.cashBookCell, styles.cashBookAmountCol]}>{row.bankOut ? row.bankOut.toLocaleString() : "-"}</Text>
                        <Text style={[styles.cashBookCell, styles.cashBookAmountCol, styles.cashBookBalanceText]}>{row.cashBalance.toLocaleString()}</Text>
                        <Text style={[styles.cashBookCell, styles.cashBookAmountCol, styles.cashBookBalanceText]}>{row.bankBalance.toLocaleString()}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                {hasMoreCashBookRows ? (
                  <View style={styles.loadMoreWrap}>
                    <Pressable style={styles.loadMoreBtn} onPress={() => setVisibleCashBookCount((prev) => prev + REPORT_CASHBOOK_PAGE_SIZE)}>
                      <Text style={styles.loadMoreBtnText}>
                        နောက်ထပ် {Math.min(REPORT_CASHBOOK_PAGE_SIZE, cashBookRows.length - pagedCashBookRows.length).toLocaleString()} ခု ပြရန်
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>အသေးစိတ် စာရင်းများ</Text>
                {renderDetailSortToggle()}
                {pagedNonTransferRows.map((t: any, index: number) => renderTransactionDetailCard(t, index, "fund-personal"))}
                {hasMoreNonTransferRows ? (
                  <View style={styles.loadMoreWrap}>
                    <Pressable style={styles.loadMoreBtn} onPress={() => setVisibleTxnDetailCount((prev) => prev + REPORT_TXN_PAGE_SIZE)}>
                      <Text style={styles.loadMoreBtnText}>
                        နောက်ထပ် {Math.min(REPORT_TXN_PAGE_SIZE, sortedNonTransferRows.length - pagedNonTransferRows.length).toLocaleString()} ခု ပြရန်
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )
          ) : (
            <View style={styles.summaryOnlyNote}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#1E3A8A" />
              <Text style={styles.summaryOnlyNoteText}>အကျဉ်းချုပ်ကြည့်ခွင့်သာ ရရှိထားသောကြောင့် နှစ်ကော်လံ ငွေစာရင်းအသေးစိတ် မပြထားပါ။</Text>
            </View>
          )}
        </View>
      )}

      {reportTab === "fees" && (
        <View style={styles.scrollContent}>
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

                {pagedReportMembers.map((member: any) => (
                  <View key={member.id} style={styles.tableRow}>
                    <View style={styles.tableNameCol}>
                      <Text style={styles.tableName} numberOfLines={1}>
                        {member.name}
                      </Text>
                    </View>
                    {monthsInRange.map((m) => {
                      const isPaid = feePaidMonthSet.has(`${member.id}|${m.year}|${m.monthIdx}`);
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
                        {(memberFeeTotalsByMemberId.get(String(member.id || "")) || 0).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ))}
                {hasMoreReportMembers ? (
                  <View style={styles.loadMoreWrap}>
                    <Pressable style={styles.loadMoreBtn} onPress={() => setVisibleMemberCount((prev) => prev + REPORT_MEMBER_PAGE_SIZE)}>
                      <Text style={styles.loadMoreBtnText}>
                        နောက်ထပ် {Math.min(REPORT_MEMBER_PAGE_SIZE, reportMembers.length - pagedReportMembers.length).toLocaleString()} ဦး ပြရန်
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {reportTab === "audit_flags" && canViewAuditFlags && (
        <View style={styles.scrollContent}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>စာရင်းစစ် အမှတ်အသားပြုထားသော စာရင်းများ</Text>
            <View style={styles.auditToolbar}>
              <Pressable
                style={[styles.scopeChip, auditOnlyFlagged && styles.scopeChipActive]}
                onPress={() => setAuditOnlyFlagged((prev) => !prev)}
              >
                <Text style={[styles.scopeChipText, auditOnlyFlagged && styles.scopeChipTextActive]}>
                  {auditOnlyFlagged ? "အမှတ်အသားရှိသောစာရင်းသာ" : "စာရင်းအားလုံး"}
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
              placeholder="အသင်းဝင်အမှတ် / ခေါင်းစဉ် / မှတ်ချက် / ပြေစာအမှတ်"
            />
            <Text style={styles.auditMetaText}>အရေအတွက်: {scopedAuditRows.length}</Text>
            {scopedAuditRows.length === 0 ? (
              <View style={{ paddingVertical: 12 }}>
                <Text style={styles.summaryOnlyNoteText}>အမှတ်အသားပြုစာရင်း မရှိသေးပါ။</Text>
              </View>
            ) : (
              pagedAuditRows.map((row: any) => (
                <View key={row.id} style={styles.auditRow}>
                  <Text style={styles.auditTitle}>
                    {getCategoryLabel(row.category)} - {Number(row.amount || 0).toLocaleString()} KS
                  </Text>
                  <Text style={styles.auditSub}>
                    အသင်းဝင်: {row.memberId || "-"} | ရက်စွဲ: {row.date || "-"} | ပြေစာအမှတ်: {row.receiptNumber || "-"}
                  </Text>
                  <Text style={styles.auditNoteText}>မှတ်ချက်: {row.auditNote || "-"}</Text>
                </View>
              ))
            )}
            {hasMoreAuditRows ? (
              <View style={styles.loadMoreWrap}>
                <Pressable style={styles.loadMoreBtn} onPress={() => setVisibleAuditCount((prev) => prev + REPORT_AUDIT_PAGE_SIZE)}>
                  <Text style={styles.loadMoreBtnText}>
                    နောက်ထပ် {Math.min(REPORT_AUDIT_PAGE_SIZE, scopedAuditRows.length - pagedAuditRows.length).toLocaleString()} ခု ပြရန်
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      )}
      </ScrollView>

      {!useInlineYearPicker && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={showYearPicker}
          onRequestClose={() => setShowYearPicker(false)}
        >
          <View style={styles.modalContainer}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowYearPicker(false)} />
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>ခုနှစ်ရွေးချယ်ရန်</Text>
              <FlatList
                data={yearOptions}
                keyExtractor={(item: number) => String(item)}
                style={{ maxHeight: 320 }}
                renderItem={({ item }: { item: number }) => {
                  const isActive = activeFilterTag === `year-${item}`;
                  return (
                    <Pressable
                      style={[styles.yearOptionRow, isActive && styles.yearOptionRowActive]}
                      onPress={() => {
                        applyYearDateRange(item);
                        setShowYearPicker(false);
                      }}
                    >
                      <Text style={[styles.yearOptionText, isActive && styles.yearOptionTextActive]}>{item}</Text>
                      {isActive ? <Ionicons name="checkmark" size={16} color={Colors.light.tint} /> : null}
                    </Pressable>
                  );
                }}
              />
              <Pressable style={styles.cancelBtn} onPress={() => setShowYearPicker(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
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
            <Text style={styles.modalTitle}>အသင်းဝင် ရွေးချယ်ရန်</Text>
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
                  <Text style={styles.summaryOnlyNoteText}>ရွေးချယ်ရန် အသင်းဝင် မတွေ့ပါ</Text>
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
  pageContent: { paddingBottom: 28 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingHint: {
    marginTop: 10,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
  },
  loadingBarTrack: {
    marginTop: 12,
    width: 220,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  loadingBarFill: {
    width: "62%",
    height: "100%",
    backgroundColor: Colors.light.tint,
    borderRadius: 999,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: { fontSize: 19, fontFamily: "Inter_700Bold", color: Colors.light.text },
  headerActions: { flexDirection: "row", alignItems: "center" },
  headerIconBtn: { padding: 6 },
  filterSection: { paddingHorizontal: 16, marginBottom: 10, gap: 8 },
  scopeCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  scopeTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  scopeLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
  },
  scopeRow: { flexDirection: "row", gap: 6 },
  scopeChip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
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
  memberPickerWrap: { gap: 8, marginTop: 8 },
  memberSearchInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12.5,
    color: Colors.light.text,
  },
  memberPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#F8FAFC",
  },
  memberPickerBtnText: { flex: 1, marginRight: 8, fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.text },
  registerModeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  registerModeChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#F8FAFC",
  },
  registerModeChipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  registerModeChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  registerModeChipTextActive: { color: "white" },
  loadMoreWrap: {
    paddingTop: 6,
    paddingBottom: 4,
    alignItems: "center",
  },
  loadMoreBtn: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 999,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  loadMoreBtnText: {
    fontSize: 12.5,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
  detailSortRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  detailSortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#F8FAFC",
  },
  detailSortChipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  detailSortChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
  },
  detailSortChipTextActive: {
    color: "white",
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'white', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border },
  dateBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.text },
  searchBtn: { backgroundColor: Colors.light.tint, width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  periodPicker: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  periodBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  periodBtnActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  periodText: { fontSize: 11.5, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  periodTextActive: { color: "white" },
  yearDropdownBtn: {
    minWidth: 130,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  yearDropdownText: { flex: 1 },
  inlineYearPickerWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    flex: 1,
  },
  tabBar: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 8 },
  tabBarWrap: { flexDirection: "row", flexWrap: "wrap", columnGap: 15, rowGap: 8 },
  tab: { paddingVertical: 6, paddingHorizontal: 4 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: Colors.light.tint },
  tabText: { fontSize: 13.5, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  activeTabText: { color: Colors.light.tint },
  scrollContent: { paddingBottom: 24 },
  incomeSummaryRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 10, marginBottom: 14 },
  incomeSummaryBox: {
    width: "48%",
    backgroundColor: "white",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderLeftWidth: 4,
    gap: 6,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  incomeSummaryBoxWide: { width: "100%" },
  incomeSummaryLabel: { fontSize: 12.5, lineHeight: 18, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  incomeSummaryValue: { fontSize: 22, lineHeight: 28, fontFamily: "Inter_700Bold" },
  summaryGrid: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 14 },
  statBox: {
    flex: 1,
    backgroundColor: "white",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderLeftWidth: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  statLabel: { fontSize: 11.5, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, flex: 1 },
  statValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
  section: { backgroundColor: "white", marginHorizontal: 16, padding: 12, borderRadius: 14, marginBottom: 14 },
  sectionTitle: { fontSize: 14.5, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 10 },
  catRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  catInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.text },
  catValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  catSub: { fontSize: 11.5, color: Colors.light.textSecondary, marginLeft: 6 },
  cashBookLiteRow: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "#F8FAFC",
    gap: 4,
  },
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
  registerCard: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#F8FAFC",
    marginBottom: 10,
    gap: 4,
  },
  registerCardTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  registerCardAmount: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#0F766E", lineHeight: 24, marginBottom: 2 },
  registerCardMeta: { fontSize: 12, color: Colors.light.textSecondary, lineHeight: 18 },
  registerCardNote: { fontSize: 12, color: "#92400E", lineHeight: 18 },
  cashBookHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  cashBookDataRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#E2E8F0",
    backgroundColor: "white",
  },
  cashBookOpeningRow: {
    backgroundColor: "#DBEAFE",
  },
  cashBookTotalRow: {
    backgroundColor: "#ECFDF5",
  },
  cashBookHeaderCell: {
    color: "white",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 8,
    paddingVertical: 10,
    textAlign: "center",
  },
  cashBookCell: {
    fontSize: 12,
    color: Colors.light.text,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderColor: "#E2E8F0",
  },
  cashBookDateCol: { width: 96 },
  cashBookReceiptCol: { width: 130 },
  cashBookParticularCol: { width: 250 },
  cashBookAmountCol: { width: 120, textAlign: "right" },
  cashBookBalanceText: {
    fontFamily: "Inter_700Bold",
    color: "#1E3A8A",
  },
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
  yearOptionRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  yearOptionRowActive: {
    backgroundColor: Colors.light.tint + "10",
  },
  yearOptionText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  yearOptionTextActive: { color: Colors.light.tint },
  cancelBtn: { paddingVertical: 14, alignItems: "center", marginTop: 5 },
  cancelBtnText: { color: Colors.light.textSecondary, fontSize: 15, fontFamily: "Inter_500Medium" },
});

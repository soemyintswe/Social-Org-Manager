import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { Transaction, Loan, CATEGORY_LABELS, type MemberPaymentRequestKind } from "@/lib/types";
import DateTimePicker from "@react-native-community/datetimepicker";
import { computeLoanMetrics, getLoanPrincipal, type LoanComputedMetrics } from "@/lib/loan-metrics";

type Tab = "transactions" | "transfers" | "loans";
type FinanceViewScope = "all" | "self" | "member";

const formatKs = (value: number) => `${Math.round(value || 0).toLocaleString()} KS`;

function BalanceCard({ label, amount, icon, color }: {
  label: string;
  amount: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={[styles.balanceCard, { borderLeftColor: color }]}>
      <View style={styles.balanceLeftGroup}>
        <View style={[styles.balanceIcon, { backgroundColor: color + "15" }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <Text style={styles.balanceLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.balanceAmount, { color }]} numberOfLines={1}>
        {amount < 0 ? "-" : ""}{Math.abs(amount).toLocaleString()} <Text style={styles.currencyText}>KS</Text>
      </Text>
    </View>
  );
}

function MiniMetricCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <View style={[styles.miniMetricCard, { borderLeftColor: color }]}>
      <Text style={styles.miniMetricTitle}>{title}</Text>
      <Text style={[styles.miniMetricValue, { color }]}>{formatKs(value)}</Text>
    </View>
  );
}

function TransactionRow({ txn, memberName, onDelete, canEdit = false, canDelete = false, canAuditFlag = false, onAuditPress }: {
  txn: Transaction;
  memberName?: string;
  onDelete: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canAuditFlag?: boolean;
  onAuditPress?: (txn: Transaction) => void;
}) {
  const isIncome = txn.type === "income";
  const isTransfer = (txn.type as string) === "transfer";
  const paymentMethod = (txn as any).paymentMethod || "cash";

  const dateObj = useMemo(() => {
    const d = txn.date as any;
    if (!d) return new Date();
    if (typeof d === 'string' && d.includes('/')) {
      const [day, month, year] = d.split('/');
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    return new Date(d);
  }, [txn.date]);

  return (
    <Pressable
      style={styles.txnRow}
      onPress={canEdit ? () => router.push({ pathname: "/add-transaction", params: { editId: txn.id } }) : undefined}
      onLongPress={
        canDelete
          ? () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              Alert.alert("ဖျက်ရန်", "ဤငွေစာရင်းကို ဖျက်လိုပါသလား?", [
                { text: "မဖျက်တော့ပါ", style: "cancel" },
                { text: "ဖျက်မည်", style: "destructive", onPress: () => onDelete(txn.id) },
              ]);
            }
          : undefined
      }
    >
      <View style={[styles.txnIcon, { backgroundColor: (isTransfer ? "#8B5CF6" : (isIncome ? "#10B981" : "#F43F5E")) + "15" }]}>
        <Ionicons
          name={isTransfer ? "swap-horizontal" : (isIncome ? "arrow-down" : "arrow-up")}
          size={20}
          color={isTransfer ? "#8B5CF6" : (isIncome ? "#10B981" : "#F43F5E")}
        />
      </View>
      <View style={styles.txnInfo}>
        <Text style={styles.txnCategory} numberOfLines={1}>
          {(txn as any).categoryLabel || CATEGORY_LABELS[txn.category] || txn.category}
        </Text>
        <Text style={styles.txnDesc} numberOfLines={1}>
          {memberName ? memberName + " - " : ""}{(txn as any).notes || (txn as any).description || txn.receiptNumber}
        </Text>
        {txn.auditFlagged ? (
          <View style={styles.auditBadge}>
            <Ionicons name="flag" size={11} color="#B91C1C" />
            <Text style={styles.auditBadgeText} numberOfLines={1}>
              စစ်ဆေးရန်: {txn.auditNote || "မှားယွင်းမှုမှတ်သားထားသည်"}
            </Text>
          </View>
        ) : null}
        <Text style={styles.txnDate}>
          {dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {" "}
          <Text style={styles.txnMethod}>{paymentMethod.toUpperCase()}</Text>
        </Text>
      </View>
      <View style={styles.txnRight}>
        {canAuditFlag && onAuditPress ? (
          <Pressable style={styles.auditFlagBtn} onPress={() => onAuditPress(txn)}>
            <Ionicons name={txn.auditFlagged ? "flag" : "flag-outline"} size={16} color={txn.auditFlagged ? "#B91C1C" : Colors.light.textSecondary} />
          </Pressable>
        ) : null}
        <Text style={[styles.txnAmount, { color: isTransfer ? "#8B5CF6" : (isIncome ? "#10B981" : "#F43F5E") }]}>
          {isTransfer ? "" : (isIncome ? "+" : "-")}{txn.amount.toLocaleString()}
        </Text>
      </View>
    </Pressable>
  );
}

function LoanRow({ loan, memberName, outstanding, metrics }: {
  loan: Loan;
  memberName?: string;
  outstanding: number;
  metrics: LoanComputedMetrics;
}) {
  const isPaid = loan.status === "paid";
  const principalAmount = getLoanPrincipal(loan as any);

  const dateStr = useMemo(() => {
    const d = loan.issueDate as any;
    if (!d) return "";
    if (typeof d === 'string' && d.includes('/')) {
      const [day, month, year] = d.split('/');
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }, [loan.issueDate]);

  return (
    <Pressable
      style={styles.loanRow}
      onPress={() => router.push({ pathname: "/loan-detail", params: { id: loan.id } } as any)}
    >
      <View style={[styles.loanIcon, { backgroundColor: (isPaid ? Colors.light.success : "#F59E0B") + "15" }]}>
        <Ionicons
          name={isPaid ? "checkmark-circle" : "timer"}
          size={22}
          color={isPaid ? Colors.light.success : "#F59E0B"}
        />
      </View>
      <View style={styles.loanInfo}>
        <Text style={styles.loanName}>{memberName || "အမည်မသိ"}</Text>
        <Text style={styles.loanDesc}>
          အတိုး {metrics.appliedRate}% • အရင်း {formatKs(principalAmount)}
        </Text>
        <Text style={styles.loanDate}>{dateStr}</Text>
        <View style={styles.loanInlineStats}>
          <Text style={styles.loanInlineStat}>ပြန်ဆပ်ပြီး: {formatKs(metrics.principalRepaid)}</Text>
          <Text style={styles.loanInlineStat}>အတိုးကျသင့်: {formatKs(metrics.interestPayable)}</Text>
          <Text style={styles.loanInlineStat}>အတိုးကျန်: {formatKs(metrics.interestOutstanding)}</Text>
        </View>
      </View>
      <View style={styles.loanRight}>
        <Text style={styles.loanOutstanding}>{formatKs(outstanding)}</Text>
        <View style={[styles.loanStatusBadge, isPaid ? styles.loanPaid : styles.loanActive]}>
          <Text style={[styles.loanStatusText, { color: isPaid ? Colors.light.success : "#3B82F6" }]}>
            {isPaid ? "ဆပ်ပြီး" : "ကျန်ရှိ"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function FinanceScreen() {
  const insets = useSafeAreaInsets();
  const {
    transactions,
    loans,
    members,
    removeTransaction,
    updateTransaction,
    getLoanOutstanding,
    loading,
    accountSettings,
    updateAccountSettings
  } = useData() as any;
  const { can, currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("transactions");
  const [startDate, setStartDate] = useState(new Date(2018, 0, 1));
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Opening Balance Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempCash, setTempCash] = useState("");
  const [tempBank, setTempBank] = useState("");
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditTxn, setAuditTxn] = useState<Transaction | null>(null);
  const [auditNote, setAuditNote] = useState("");
  const [viewScope, setViewScope] = useState<FinanceViewScope>("all");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  const canViewFinanceSummary = can("finance.view_summary") || can("finance.view_all");
  const canViewFinanceDetail = can("finance.view_detail") || can("finance.view_all");
  const canViewFinanceSelf = can("finance.view_self");
  const canManageFinance = can("finance.create") || can("finance.edit") || can("finance.delete") || can("finance.manage");
  const canCreateFinance = can("finance.create") || can("finance.manage");
  const canEditFinance = can("finance.edit") || can("finance.manage");
  const canDeleteFinance = can("finance.delete") || can("finance.manage");
  const canAuditFlagFinance = can("finance.audit_flag");
  const canViewAnyFinance = canViewFinanceSummary || canViewFinanceDetail || canViewFinanceSelf;
  const effectiveScope: FinanceViewScope = canViewFinanceDetail ? viewScope : "self";
  const openPaymentRequest = (kind: MemberPaymentRequestKind) => {
    router.push({ pathname: "/member-payment-requests", params: { kind } } as any);
  };

  const handleOpenSettings = () => {
    setTempCash(accountSettings?.openingBalanceCash?.toString() || "0");
    setTempBank(accountSettings?.openingBalanceBank?.toString() || "0");
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    if (updateAccountSettings) {
      await updateAccountSettings({
        ...accountSettings,
        openingBalanceCash: parseFloat(tempCash) || 0,
        openingBalanceBank: parseFloat(tempBank) || 0,
      });
    }
    setShowSettingsModal(false);
  };

  const openAuditModal = (txn: Transaction) => {
    if (!canAuditFlagFinance) return;
    setAuditTxn(txn);
    setAuditNote(txn.auditNote || "");
    setShowAuditModal(true);
  };

  const handleSaveAuditFlag = async () => {
    if (!auditTxn) return;
    const note = auditNote.trim();
    if (!note) {
      Alert.alert("လိုအပ်ချက်", "မှားယွင်းမှုအကြောင်းပြချက် Note ကိုဖြည့်ပါ။");
      return;
    }
    await updateTransaction(auditTxn.id, {
      auditFlagged: true,
      auditNote: note,
      auditFlaggedByUserId: currentUser?.id || "",
      auditFlaggedAt: new Date().toISOString(),
    } as Partial<Transaction>);
    setShowAuditModal(false);
    setAuditTxn(null);
    setAuditNote("");
    Alert.alert("မှတ်သားပြီးပါပြီ", "စာရင်းစစ် မှတ်ချက်ကိုသိမ်းပြီးပါပြီ။");
  };

  const handleClearAuditFlag = async () => {
    if (!auditTxn) return;
    await updateTransaction(auditTxn.id, {
      auditFlagged: false,
      auditNote: "",
      auditFlaggedByUserId: "",
      auditFlaggedAt: "",
    } as Partial<Transaction>);
    setShowAuditModal(false);
    setAuditTxn(null);
    setAuditNote("");
    Alert.alert("ဖြုတ်ပြီးပါပြီ", "Audit Flag ကိုဖြုတ်ပြီးပါပြီ။");
  };

  const getMemberName = (id?: string) => {
    if (!id) return "";
    const m = members.find((member: any) => member.id === id);
    if (!m) return "";
    const anyM = m as any;
    if (anyM.name) return anyM.name;
    const fullName = [anyM.firstName, anyM.lastName].filter(Boolean).join(" ").trim();
    return fullName || anyM.email || anyM.phone || "";
  };

  const memberOptions = useMemo(() => {
    const needle = memberSearch.trim().toLowerCase();
    const list = [...(members || [])];
    if (!needle) return list;
    return list.filter((member: any) => {
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

  const scopeLabel = useMemo(() => {
    if (effectiveScope === "all") return "အားလုံး";
    if (effectiveScope === "self") return "ကိုယ်တိုင်";
    const selectedName = members.find((member: any) => member.id === scopedMemberId)?.name || "";
    if (scopedMemberId === "__none__") return "ရွေးချယ်ထားသူ";
    return selectedName ? `${selectedName} (${scopedMemberId})` : scopedMemberId;
  }, [effectiveScope, scopedMemberId, members]);

  // Filter transactions by date range
  const sortedTxns = useMemo(
    () => [...(transactions || [])]
    .sort((a, b) => {
      const getDate = (d: any) => {
        if (!d) return 0;
        if (typeof d === 'string' && d.includes('/')) {
          const [day, month, year] = d.split('/');
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime();
        }
        return new Date(d).getTime();
      };
      return (getDate(b.date) || 0) - (getDate(a.date) || 0);
    })
    .filter(t => {
      const d = new Date(t.date);
      // Reset times for accurate date comparison
      const start = new Date(startDate); start.setHours(0,0,0,0);
      const end = new Date(endDate); end.setHours(23,59,59,999);
      const current = new Date(d);
      if (typeof t.date === 'string' && t.date.includes('/')) {
         const [day, month, year] = t.date.split('/');
         current.setFullYear(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      return current >= start && current <= end;
    }),
    [transactions, startDate, endDate]
  );

  const visibleTxns = useMemo(() => {
    if (scopedMemberId === null) return sortedTxns;
    return sortedTxns.filter((t: any) => t.memberId === scopedMemberId);
  }, [sortedTxns, scopedMemberId]);

  const sortedLoans = useMemo(
    () => [...(loans || [])].sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;
      return new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime();
    }),
    [loans]
  );

  const visibleLoans = useMemo(() => {
    if (scopedMemberId === null) return sortedLoans;
    return sortedLoans.filter((loan: any) => loan.memberId === scopedMemberId);
  }, [sortedLoans, scopedMemberId]);

  const balanceSourceTransactions = useMemo(() => {
    if (scopedMemberId === null) return transactions || [];
    return (transactions || []).filter((t: any) => t.memberId === scopedMemberId);
  }, [transactions, scopedMemberId]);

  // Calculate Balances locally to include Transfer logic
  const balances = useMemo(() => {
    let cash = (accountSettings?.openingBalanceCash || 0);
    let bank = (accountSettings?.openingBalanceBank || 0);

    balanceSourceTransactions.forEach((t: any) => {
      const amt = t.amount || 0;
      if (t.type === 'income') {
        if (t.paymentMethod === 'bank') bank += amt;
        else cash += amt;
      } else if (t.type === 'expense') {
        if (t.paymentMethod === 'bank') bank -= amt;
        else cash -= amt;
      } else if (t.type === 'transfer') {
        if (t.category === 'bank_deposit') { // Cash -> Bank
          cash -= amt;
          bank += amt;
        } else if (t.category === 'bank_withdraw') { // Bank -> Cash
          bank -= amt;
          cash += amt;
        }
      }
    });
    return { cash, bank, total: cash + bank };
  }, [balanceSourceTransactions, accountSettings]);

  const scopedFinanceStats = useMemo(() => {
    const income = visibleTxns
      .filter((t: any) => t.type === "income" && (t.type as string) !== "transfer")
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
    const expense = visibleTxns
      .filter((t: any) => t.type === "expense" && (t.type as string) !== "transfer")
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
    return { income, expense, net: income - expense };
  }, [visibleTxns]);

  const loanMetricRows = useMemo(() => {
    return (visibleLoans || []).map((loan: any) => {
      const metrics = computeLoanMetrics(loan, balanceSourceTransactions as any);
      return { loan, metrics };
    });
  }, [visibleLoans, balanceSourceTransactions]);

  const loanPrincipalSummary = useMemo(() => {
    const disbursed = visibleTxns
      .filter((t: any) => String(t?.category || "") === "loan_disbursement")
      .reduce((sum: number, t: any) => sum + Number(t?.amount || 0), 0);
    const repaid = visibleTxns
      .filter((t: any) => String(t?.category || "") === "loan_repayment")
      .reduce((sum: number, t: any) => sum + Number(t?.amount || 0), 0);
    // Use direct subtraction to ensure outstanding matches displayed totals (Disbursed - Repaid)
    const outstanding = disbursed - repaid;
    return { disbursed, repaid, outstanding };
  }, [visibleTxns]);

  const loanInterestSummary = useMemo(() => {
    const base = loanMetricRows.reduce((sum: number, row: any) => sum + Number(row.metrics.baseInterest || 0), 0);
    const relief = loanMetricRows.reduce((sum: number, row: any) => sum + Number(row.metrics.interestRelief || 0), 0);
    const payable = loanMetricRows.reduce((sum: number, row: any) => sum + Number(row.metrics.interestPayable || 0), 0);
    const paid = loanMetricRows.reduce((sum: number, row: any) => sum + Number(row.metrics.interestPaid || 0), 0);
    const outstanding = loanMetricRows.reduce((sum: number, row: any) => sum + Number(row.metrics.interestOutstanding || 0), 0);
    return { base, relief, payable, paid, outstanding };
  }, [loanMetricRows]);

  const isAllScope = effectiveScope === "all";
  const activeListData = useMemo<any[]>(() => {
    if (activeTab === "loans") return (visibleLoans as any[]) || [];
    if (activeTab === "transfers") {
      return (
        isAllScope
          ? visibleTxns.filter((t: any) => t.type === "transfer")
          : visibleTxns.filter((t: any) => t.type === "expense" && (t.type as string) !== "transfer")
      ) as any[];
    }
    return (
      isAllScope
        ? visibleTxns.filter((t: any) => t.type !== "transfer")
        : visibleTxns.filter((t: any) => t.type === "income" && (t.type as string) !== "transfer")
    ) as any[];
  }, [activeTab, isAllScope, visibleLoans, visibleTxns]);

  const formatDateBtn = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  if (!canViewAnyFinance) {
    return <AccessDenied showBack={false} />;
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.pageContent, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 14) + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
      <View style={[styles.header, { flexDirection: 'column', alignItems: 'stretch', gap: 5 }]}>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center" }}>
          <View style={styles.headerButtons}>
            {canManageFinance && (
              <Pressable
                style={[styles.addButton, { backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border }]}
                onPress={() => router.push("/transaction-data-management")}
              >
                <Ionicons name="cloud-download-outline" size={20} color={Colors.light.text} />
              </Pressable>
            )}
            {canManageFinance && (
              <Pressable
                style={[styles.addButton, { backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border }]}
                onPress={handleOpenSettings}
              >
                <Ionicons name="wallet-outline" size={20} color={Colors.light.text} />
              </Pressable>
            )}
            {canCreateFinance && (
              <Pressable
                style={styles.addButton}
                onPress={() => router.push(activeTab === "loans" ? "/add-loan" : "/add-transaction" as any)}
              >
                <Ionicons name="add" size={24} color="white" />
              </Pressable>
            )}
            <Pressable
              style={[styles.addButton, { backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border }]}
              onPress={() => router.push("/expense-claims" as any)}
            >
              <Ionicons name="document-text-outline" size={20} color={Colors.light.text} />
            </Pressable>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={1}>ငွေစာရင်းမှတ်တမ်း - {scopeLabel}</Text>
      </View>

      {canViewFinanceDetail && (
        <View style={styles.scopeCard}>
          <View style={styles.scopeTopRow}>
            <Text style={styles.scopeLabel}>ကြည့်ရှုမည့်အပိုင်း</Text>
            <View style={styles.scopeRow}>
              <Pressable
                style={[styles.scopeChip, viewScope === "all" && styles.scopeChipActive]}
                onPress={() => setViewScope("all")}
              >
                <Text style={[styles.scopeChipText, viewScope === "all" && styles.scopeChipTextActive]}>အားလုံး</Text>
              </Pressable>
              <Pressable
                style={[styles.scopeChip, viewScope === "self" && styles.scopeChipActive]}
                onPress={() => setViewScope("self")}
              >
                <Text style={[styles.scopeChipText, viewScope === "self" && styles.scopeChipTextActive]}>ကိုယ်တိုင်</Text>
              </Pressable>
              <Pressable
                style={[styles.scopeChip, viewScope === "member" && styles.scopeChipActive]}
                onPress={() => setViewScope("member")}
              >
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
                placeholder="Member ID / Full Name ရိုက်ရှာပါ"
              />
              <Pressable style={styles.memberPickerBtn} onPress={() => setShowMemberPicker(true)}>
                <Text style={styles.memberPickerBtnText} numberOfLines={1}>
                  {selectedMemberId === "" ? "Dropdown မှ Member ရွေးမည်" : `${getMemberName(selectedMemberId)} (${selectedMemberId})`}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} />
              </Pressable>
            </View>
          )}
        </View>
      )}

      <View style={styles.filterContainer}>
        {Platform.OS === 'web' ? (
          <View style={styles.dateBtn}>
            {React.createElement('input', {
              type: 'date',
              value: startDate.toISOString().split('T')[0],
              onChange: (e: any) => e.target.value && setStartDate(new Date(e.target.value)),
              style: {
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontSize: 13,
                fontFamily: 'inherit',
                color: Colors.light.text,
                width: 110
              }
            })}
          </View>
        ) : (
          <Pressable style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
            <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
            <Text style={styles.dateBtnText}>{formatDateBtn(startDate)}</Text>
          </Pressable>
        )}

        <Text style={{ color: Colors.light.textSecondary }}>to</Text>

        {Platform.OS === 'web' ? (
          <View style={styles.dateBtn}>
            {React.createElement('input', {
              type: 'date',
              value: endDate.toISOString().split('T')[0],
              onChange: (e: any) => e.target.value && setEndDate(new Date(e.target.value)),
              style: {
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontSize: 13,
                fontFamily: 'inherit',
                color: Colors.light.text,
                width: 110
              }
            })}
          </View>
        ) : (
          <Pressable style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
            <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
            <Text style={styles.dateBtnText}>{formatDateBtn(endDate)}</Text>
          </Pressable>
        )}
      </View>

      {/* Date Pickers */}
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

      <View style={styles.balanceGrid}>
        {isAllScope ? (
          <>
            <BalanceCard label="ငွေသားလက်ကျန်" amount={balances.cash} icon="cash" color="#10B981" />
            <BalanceCard label="ဘဏ်လက်ကျန်" amount={balances.bank} icon="card" color="#3B82F6" />
            <BalanceCard label="စုစုပေါင်းလက်ကျန်" amount={balances.total} icon="wallet" color="#8B5CF6" />
          </>
        ) : (
          <>
            <BalanceCard label="အသင်းသို့ပေးသွင်းငွေ" amount={scopedFinanceStats.income} icon="arrow-down" color="#10B981" />
            <BalanceCard label="အသင်းမှထုတ်ယူငွေ" amount={scopedFinanceStats.expense} icon="arrow-up" color="#F43F5E" />
            <BalanceCard label="စုစုပေါင်းကွာဟချက်" amount={scopedFinanceStats.net} icon="wallet" color="#8B5CF6" />
          </>
        )}
      </View>

      {effectiveScope === "self" && (
        <>
          <Text style={styles.quickActionsTitle}>အမြန်လုပ်ဆောင်ချက်များ</Text>
          <View style={styles.quickActionsGrid}>
            <Pressable style={styles.quickActionBtn} onPress={() => openPaymentRequest("member_fees")}>
              <Ionicons name="card-outline" size={18} color={Colors.light.tint} />
              <Text style={styles.quickActionText}>လစဉ်ကြေးပေးသွင်းရန်</Text>
            </Pressable>
            <Pressable style={styles.quickActionBtn} onPress={() => openPaymentRequest("donations")}>
              <Ionicons name="gift-outline" size={18} color={Colors.light.tint} />
              <Text style={styles.quickActionText}>လှူဒါန်းရန်</Text>
            </Pressable>
            <Pressable style={styles.quickActionBtn} onPress={() => openPaymentRequest("loan_repayment")}>
              <Ionicons name="cash-outline" size={18} color={Colors.light.tint} />
              <Text style={styles.quickActionText}>ချေးငွေဆပ်ရန်</Text>
            </Pressable>
            <Pressable style={styles.quickActionBtn} onPress={() => openPaymentRequest("interest_income")}>
              <Ionicons name="trending-up-outline" size={18} color={Colors.light.tint} />
              <Text style={styles.quickActionText}>အတိုးဆပ်ရန်</Text>
            </Pressable>
            <Pressable style={styles.quickActionBtn} onPress={() => router.push("/expense-claims" as any)}>
              <Ionicons name="document-text-outline" size={18} color={Colors.light.tint} />
              <Text style={styles.quickActionText}>ငွေတောင်းခံရန်</Text>
            </Pressable>
          </View>
        </>
      )}

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === "transactions" && styles.activeTab]}
          onPress={() => setActiveTab("transactions")}
        >
          <Text style={[styles.tabText, activeTab === "transactions" && styles.activeTabText]}>
            {isAllScope ? "အဝင်/အထွက်" : "အသင်းသို့ပေးသွင်းငွေ"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "transfers" && styles.activeTab]}
          onPress={() => setActiveTab("transfers")}
        >
          <Text style={[styles.tabText, activeTab === "transfers" && styles.activeTabText]}>
            {isAllScope ? "ဘဏ်သွင်း/ဘဏ်ထုတ်" : "အသင်းမှထုတ်ယူငွေ"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "loans" && styles.activeTab]}
          onPress={() => setActiveTab("loans")}
        >
          <Text style={[styles.tabText, activeTab === "loans" && styles.activeTabText]}>
            ချေးငွေ
          </Text>
        </Pressable>
      </View>

      {!canViewFinanceDetail && canViewFinanceSummary && !canViewFinanceSelf ? (
        <View style={styles.emptyContainerCompact}>
          <Ionicons name="shield-checkmark-outline" size={40} color={Colors.light.textSecondary} />
          <Text style={styles.emptyText}>Summary only permission ဖြစ်သောကြောင့် အသေးစိတ်စာရင်း မပြထားပါ။</Text>
        </View>
      ) : (
        <View style={styles.listContent}>
          {activeTab === "loans" ? (
            <View style={styles.loanSummaryWrap}>
              <Text style={styles.loanSummaryTitle}>ချေးငွေအရင်း စာရင်းချုပ်</Text>
              <View style={styles.loanPrimaryRow}>
                <View style={styles.loanPrimaryBox}>
                  <Text style={styles.loanPrimaryLabel}>ထုတ်ချေးငွေ</Text>
                  <Text style={[styles.loanPrimaryValue, { color: "#F59E0B" }]}>{formatKs(loanPrincipalSummary.disbursed)}</Text>
                </View>
                <View style={styles.loanPrimaryBox}>
                  <Text style={styles.loanPrimaryLabel}>ပြန်ဆပ်ငွေ</Text>
                  <Text style={[styles.loanPrimaryValue, { color: "#10B981" }]}>{formatKs(loanPrincipalSummary.repaid)}</Text>
                </View>
                <View style={styles.loanPrimaryBox}>
                  <Text style={styles.loanPrimaryLabel}>ပြန်ဆပ်ရန်ကျန်ငွေ</Text>
                  <Text style={[styles.loanPrimaryValue, { color: "#EF4444" }]}>{formatKs(loanPrincipalSummary.outstanding)}</Text>
                </View>
              </View>

              <Text style={styles.loanSummaryTitle}>အတိုးကျသင့်ငွေ စာရင်းချုပ်</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.loanInterestRow}>
                <MiniMetricCard title="မူလအတိုးကျသင့်ငွေ" value={loanInterestSummary.base} color="#8B5CF6" />
                <MiniMetricCard title="အတိုးဖြေလျှော့ငွေ" value={loanInterestSummary.relief} color="#0EA5E9" />
                <MiniMetricCard title="အတိုးဆပ်ရန်ကျသင့်ငွေ" value={loanInterestSummary.payable} color="#0369A1" />
                <MiniMetricCard title="အတိုးဆပ်ပြီးငွေ" value={loanInterestSummary.paid} color="#16A34A" />
                <MiniMetricCard title="အတိုးဆပ်ရန်ကျန်ငွေ" value={loanInterestSummary.outstanding} color="#DC2626" />
              </ScrollView>

              <Text style={styles.loanSummaryTitle}>ချေးငွေအသေးစိတ်စာရင်း</Text>
            </View>
          ) : null}
          {activeListData.length === 0 ? (
            <View style={styles.emptyContainerCompact}>
              <Ionicons name="receipt-outline" size={40} color={Colors.light.textSecondary} />
              <Text style={styles.emptyText}>မှတ်တမ်းများ မရှိသေးပါ</Text>
            </View>
          ) : (
            activeListData.map((item: any) => {
              if (activeTab === "transactions" || activeTab === "transfers") {
                const txn = item as Transaction;
                const memberName = getMemberName(txn.memberId);
                const displayName = memberName || (item as any).payerPayee;
                return (
                  <TransactionRow
                    key={txn.id}
                    txn={txn}
                    memberName={displayName}
                    onDelete={removeTransaction}
                    canEdit={canEditFinance}
                    canDelete={canDeleteFinance}
                    canAuditFlag={canAuditFlagFinance}
                    onAuditPress={openAuditModal}
                  />
                );
              }

              const loan = item as Loan;
              const member = members.find((m: any) => m.id === loan.memberId);
              const metrics = computeLoanMetrics(loan as any, balanceSourceTransactions as any);
              return (
                <LoanRow
                  key={loan.id}
                  loan={loan}
                  memberName={member?.name}
                  outstanding={getLoanOutstanding(loan.id)}
                  metrics={metrics}
                />
              );
            })
          )}
        </View>
      )}
      </ScrollView>

      {/* Opening Balance Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showSettingsModal}
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalContainer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSettingsModal(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Opening Balances (စာရင်းဖွင့်လက်ကျန်)</Text>
            
            <Text style={styles.label}>Opening Cash (ငွေသား)</Text>
            <TextInput style={styles.input} value={tempCash} onChangeText={setTempCash} keyboardType="decimal-pad" placeholder="0.00" />

            <Text style={styles.label}>Opening Bank (ဘဏ်)</Text>
            <TextInput style={styles.input} value={tempBank} onChangeText={setTempBank} keyboardType="decimal-pad" placeholder="0.00" />

            <Pressable style={styles.saveBtn} onPress={handleSaveSettings}>
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setShowSettingsModal(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={showAuditModal}
        onRequestClose={() => setShowAuditModal(false)}
      >
        <View style={styles.modalContainer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAuditModal(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Audit Flag (စာရင်းစစ် မှတ်ချက်)</Text>
            <Text style={styles.label}>မှတ်ချက်</Text>
            <TextInput
              style={[styles.input, styles.auditNoteInput]}
              value={auditNote}
              onChangeText={setAuditNote}
              multiline
              numberOfLines={4}
              placeholder="ဥပမာ - Receipt number မကိုက်ညီ / ပမာဏမှား"
            />
            <Pressable style={styles.saveBtn} onPress={handleSaveAuditFlag}>
              <Text style={styles.saveBtnText}>Flag သိမ်းမည်</Text>
            </Pressable>
            {auditTxn?.auditFlagged ? (
              <Pressable style={styles.clearFlagBtn} onPress={handleClearAuditFlag}>
                <Text style={styles.clearFlagBtnText}>Flag ဖြုတ်မည်</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.cancelBtn} onPress={() => setShowAuditModal(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
                  <Text style={styles.emptyText}>ရွေးချယ်ရန် Member မတွေ့ပါ</Text>
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

// ... styles remain the same (အပေါ်က ကုဒ်ဟောင်းအတိုင်း သုံးနိုင်ပါသည်)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  pageContent: { paddingBottom: 24 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: { fontSize: 19, fontFamily: "Inter_700Bold", color: Colors.light.text },
  headerButtons: { flexDirection: "row", gap: 10, flexShrink: 0 },
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
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.tint,
    justifyContent: "center",
    alignItems: "center",
  },
  balanceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 12,
  },
  balanceCard: {
    flex: 1,
    minWidth: "45%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "white",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderLeftWidth: 4,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  balanceLeftGroup: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0, marginRight: 8 },
  balanceIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6,
  },
  balanceLabel: { fontSize: 11.5, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, flexShrink: 1 },
  balanceAmount: { fontSize: 13.5, fontFamily: "Inter_700Bold" },
  currencyText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  miniMetricCard: {
    width: 220,
    borderLeftWidth: 4,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  miniMetricTitle: { fontSize: 11, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium", flex: 1 },
  miniMetricValue: { fontSize: 12.5, fontFamily: "Inter_700Bold" },
  quickActionsTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  quickActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quickActionText: {
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 10,
  },
  tab: { paddingVertical: 6, paddingHorizontal: 4 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: Colors.light.tint },
  tabText: { fontSize: 13.5, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  activeTabText: { color: Colors.light.tint },
  listContent: { paddingHorizontal: 16, paddingBottom: 8 },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  txnIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  txnInfo: { flex: 1 },
  txnTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  txnCategory: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  txnDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  auditBadge: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEE2E2",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    maxWidth: "95%",
  },
  auditBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#B91C1C",
    maxWidth: 220,
  },
  txnMethod: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: Colors.light.tint },
  txnSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  txnRight: { alignItems: "flex-end", gap: 4 },
  auditFlagBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  txnAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  txnDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  loanRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  loanIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  loanInfo: { flex: 1 },
  loanName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  loanDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 1 },
  loanDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  loanInlineStats: { marginTop: 4, gap: 2 },
  loanInlineStat: { fontSize: 11, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  loanRight: { alignItems: "flex-end", gap: 4 },
  loanOutstanding: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.light.text },
  loanStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  loanStatusText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  loanActive: { backgroundColor: "#3B82F6" + "15" },
  loanPaid: { backgroundColor: Colors.light.success + "15" },
  loanSummaryWrap: {
    marginBottom: 12,
  },
  loanSummaryTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    marginBottom: 8,
    marginTop: 4,
  },
  loanPrimaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  loanPrimaryBox: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  loanPrimaryLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  loanPrimaryValue: {
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
  },
  loanInterestRow: {
    paddingBottom: 4,
    paddingRight: 10,
  },
  emptyContainer: { alignItems: "center", marginTop: 50 },
  emptyContainerCompact: { alignItems: "center", marginTop: 20, marginBottom: 12 },
  emptyText: { marginTop: 10, fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  filterContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'white', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border },
  dateBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.text },
  modalContainer: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 20, textAlign: "center" },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: "#F8FAFC", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, borderWidth: 1, borderColor: Colors.light.border },
  auditNoteInput: { minHeight: 96, textAlignVertical: "top" },
  saveBtn: { backgroundColor: Colors.light.tint, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 20 },
  saveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  clearFlagBtn: { backgroundColor: "#EF4444", paddingVertical: 12, borderRadius: 12, alignItems: "center", marginTop: 8 },
  clearFlagBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
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

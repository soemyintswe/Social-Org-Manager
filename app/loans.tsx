import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import AccessDenied from "@/components/AccessDenied";
import { computeLoanMetrics, getLoanPrincipal, monthDiffInclusive, parseFlexibleDate } from "@/lib/loan-metrics";

type LoanViewScope = "all" | "self" | "member";

const DEFAULT_FROM_DATE = new Date(2018, 0, 1);
const formatKs = (value: number) => `${Math.round(value || 0).toLocaleString()} KS`;
const toYmd = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const formatDateBtn = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const WEB_DATE_INPUT_STYLE: any = { border: "none", outline: "none", backgroundColor: "transparent", fontSize: 13, color: Colors.light.text, width: 115 };

const normalizeCategoryToken = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const isLoanDisbursementCategory = (value: unknown): boolean => {
  const token = normalizeCategoryToken(value);
  return token === "loan_disbursement" || token === "loan_issued";
};

const isLoanRepaymentCategory = (value: unknown): boolean =>
  normalizeCategoryToken(value) === "loan_repayment";

const isInterestIncomeCategory = (value: unknown): boolean => {
  const token = normalizeCategoryToken(value);
  return token === "interest_income" || token === "bank_interest";
};

export default function LoansScreen() {
  const insets = useSafeAreaInsets();
  const { loans = [], transactions = [], members = [] } = useData() as any;
  const { can, currentUser } = useAuth();

  const canViewFinanceSummary = can("finance.view_summary") || can("finance.view_all");
  const canViewFinanceDetail = can("finance.view_detail") || can("finance.view_all");
  const canViewFinanceSelf = can("finance.view_self");
  const canCreateFinance = can("finance.create") || can("finance.manage");
  const canViewAnyFinance = canViewFinanceSummary || canViewFinanceDetail || canViewFinanceSelf;
  const canChooseScope = canViewFinanceDetail;

  const [viewScope, setViewScope] = useState<LoanViewScope>("all");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  const [startDate, setStartDate] = useState(new Date(DEFAULT_FROM_DATE));
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [calcPrincipal, setCalcPrincipal] = useState("");
  const [calcRate, setCalcRate] = useState("");
  const [calcFromDate, setCalcFromDate] = useState(new Date(DEFAULT_FROM_DATE));
  const [calcToDate, setCalcToDate] = useState(new Date());
  const [calcSuspensionEnabled, setCalcSuspensionEnabled] = useState(false);
  const [calcSuspensionFromDate, setCalcSuspensionFromDate] = useState(new Date(DEFAULT_FROM_DATE));
  const [calcSuspensionToDate, setCalcSuspensionToDate] = useState(new Date());
  const [calcDiscountPercent, setCalcDiscountPercent] = useState("");
  const [calcDiscountAmount, setCalcDiscountAmount] = useState("");
  const [calcWaivePercent, setCalcWaivePercent] = useState("");
  const [calcWaiveAmount, setCalcWaiveAmount] = useState("");

  const [showCalcFromPicker, setShowCalcFromPicker] = useState(false);
  const [showCalcToPicker, setShowCalcToPicker] = useState(false);
  const [showSuspFromPicker, setShowSuspFromPicker] = useState(false);
  const [showSuspToPicker, setShowSuspToPicker] = useState(false);

  const effectiveScope: LoanViewScope = canChooseScope ? viewScope : "self";
  const scopedMemberId = useMemo<string | null>(() => {
    if (effectiveScope === "all") return null;
    if (effectiveScope === "self") return currentUser?.memberId || "__none__";
    return selectedMemberId || "__none__";
  }, [effectiveScope, currentUser?.memberId, selectedMemberId]);

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
  const showInlineMemberResults = useMemo(
    () => viewScope === "member" && memberSearch.trim().length > 0,
    [viewScope, memberSearch]
  );
  const inlineMemberOptions = useMemo(() => memberOptions.slice(0, 10), [memberOptions]);

  const scopeLabel = useMemo(() => {
    if (effectiveScope === "all") return "အားလုံး";
    if (effectiveScope === "self") return "ကိုယ်တိုင်";
    if (scopedMemberId === "__none__") return "ရွေးချယ်ထားသူ";
    const selectedName = members.find((member: any) => member.id === scopedMemberId)?.name || "";
    return selectedName ? `${selectedName} (${scopedMemberId})` : scopedMemberId;
  }, [effectiveScope, scopedMemberId, members]);

  const visibleLoans = useMemo(() => {
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(23, 59, 59, 999);
    let source = [...(loans || [])];

    if (scopedMemberId !== null) {
      source = source.filter((loan: any) => String(loan?.memberId || "") === String(scopedMemberId || ""));
    }

    source = source.filter((loan: any) => {
      const d = parseFlexibleDate(loan?.issueDate || loan?.date);
      if (!d) return true;
      return d >= start && d <= end;
    });

    return source.sort((a: any, b: any) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;
      return new Date(String(b?.issueDate || b?.date || "")).getTime() - new Date(String(a?.issueDate || a?.date || "")).getTime();
    });
  }, [loans, scopedMemberId, startDate, endDate]);

  const loanRows = useMemo(() => {
    return visibleLoans.map((loan: any) => {
      const memberName = members.find((m: any) => String(m?.id || "") === String(loan?.memberId || ""))?.name || "အမည်မသိ";
      const metrics = computeLoanMetrics(loan, transactions);
      return { loan, metrics, memberName };
    });
  }, [visibleLoans, members, transactions]);

  const scopedTransactions = useMemo(() => {
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(23, 59, 59, 999);
    return (transactions || []).filter((tx: any) => {
      const d = parseFlexibleDate(tx?.date);
      if (d && (d < start || d > end)) return false;
      if (scopedMemberId === null) return true;
      return String(tx?.memberId || "") === String(scopedMemberId || "");
    });
  }, [transactions, startDate, endDate, scopedMemberId]);

  const fallbackLoanRows = useMemo(() => {
    const disbursements = scopedTransactions.filter((tx: any) => isLoanDisbursementCategory(tx?.category));
    if (disbursements.length === 0) return [] as any[];

    const principalByMember = new Map<string, number>();
    const firstDisbursementDateByMember = new Map<string, string>();
    disbursements.forEach((tx: any) => {
      const memberId = String(tx?.memberId || "").trim() || "__unknown__";
      const amount = Number(tx?.amount || 0);
      principalByMember.set(memberId, (principalByMember.get(memberId) || 0) + amount);
      if (!firstDisbursementDateByMember.has(memberId)) {
        firstDisbursementDateByMember.set(memberId, String(tx?.date || ""));
      }
    });

    const repaidByMember = new Map<string, number>();
    scopedTransactions
      .filter((tx: any) => isLoanRepaymentCategory(tx?.category))
      .forEach((tx: any) => {
        const memberId = String(tx?.memberId || "").trim() || "__unknown__";
        repaidByMember.set(memberId, (repaidByMember.get(memberId) || 0) + Number(tx?.amount || 0));
      });

    const interestByMember = new Map<string, number>();
    scopedTransactions
      .filter((tx: any) => isInterestIncomeCategory(tx?.category))
      .forEach((tx: any) => {
        const memberId = String(tx?.memberId || "").trim() || "__unknown__";
        interestByMember.set(memberId, (interestByMember.get(memberId) || 0) + Number(tx?.amount || 0));
      });

    return Array.from(principalByMember.entries()).map(([memberId, issued], index) => {
      const principal = Math.max(0, Number(issued || 0));
      const principalRepaid = Math.max(0, Number(repaidByMember.get(memberId) || 0));
      const principalOutstanding = Math.max(0, principal - principalRepaid);
      const interestPaid = Math.max(0, Number(interestByMember.get(memberId) || 0));
      const memberName = members.find((m: any) => String(m?.id || "") === memberId)?.name || "အမည်မသိ";

      return {
        loan: {
          id: `legacy-loan-${memberId}-${index}`,
          memberId,
          principal,
          issueDate: firstDisbursementDateByMember.get(memberId) || "",
          status: principalOutstanding <= 0 ? "paid" : "active",
          interestRate: 0,
        },
        metrics: {
          principal,
          principalRepaid,
          principalOutstanding,
          baseRate: 0,
          appliedRate: 0,
          calcMonths: 0,
          suspensionMonths: 0,
          effectiveMonths: 0,
          interestSuspended: false,
          baseInterest: interestPaid,
          discountPercent: 0,
          discountAmount: 0,
          waivedPercent: 0,
          waivedAmount: 0,
          interestRelief: 0,
          interestPayable: interestPaid,
          interestPaid,
          interestOutstanding: 0,
        },
        memberName,
      };
    });
  }, [scopedTransactions, members]);

  const hasStructuredLoanRows = loanRows.length > 0;
  const displayLoanRows = hasStructuredLoanRows ? loanRows : fallbackLoanRows;

  const principalSummary = useMemo(() => {
    const issued = displayLoanRows.reduce((sum: number, row: any) => sum + getLoanPrincipal(row.loan), 0);
    const repaid = displayLoanRows.reduce((sum: number, row: any) => sum + Number(row.metrics.principalRepaid || 0), 0);
    const outstanding = Math.max(0, issued - repaid);
    return { issued, repaid, outstanding };
  }, [displayLoanRows]);

  const interestSummary = useMemo(() => {
    const base = displayLoanRows.reduce((sum: number, row: any) => sum + Number(row.metrics.baseInterest || 0), 0);
    const relief = displayLoanRows.reduce((sum: number, row: any) => sum + Number(row.metrics.interestRelief || 0), 0);
    const payable = displayLoanRows.reduce((sum: number, row: any) => sum + Number(row.metrics.interestPayable || 0), 0);
    const paid = displayLoanRows.reduce((sum: number, row: any) => sum + Number(row.metrics.interestPaid || 0), 0);
    const outstanding = displayLoanRows.reduce((sum: number, row: any) => sum + Number(row.metrics.interestOutstanding || 0), 0);
    return { base, relief, payable, paid, outstanding };
  }, [displayLoanRows]);

  const calculator = useMemo(() => {
    const principal = Math.max(0, Number(calcPrincipal || 0));
    const rate = Math.max(0, Number(calcRate || 0));
    const calcMonths = Math.max(0, monthDiffInclusive(calcFromDate, calcToDate));
    const suspensionMonths = calcSuspensionEnabled ? Math.max(0, monthDiffInclusive(calcSuspensionFromDate, calcSuspensionToDate)) : 0;
    const discountPercent = Math.max(0, Math.min(100, Number(calcDiscountPercent || 0)));
    const discountAmount = Math.max(0, Number(calcDiscountAmount || 0));
    const waivePercent = Math.max(0, Math.min(100, Number(calcWaivePercent || 0)));
    const waiveAmount = Math.max(0, Number(calcWaiveAmount || 0));

    const effectiveMonths = Math.max(0, calcMonths - suspensionMonths);
    const baseInterest = principal * (rate / 100) * effectiveMonths;
    const afterDiscountRate = Math.max(0, baseInterest * (1 - discountPercent / 100));
    const afterDiscountAmount = Math.max(0, afterDiscountRate - discountAmount);
    const waivedByPercentAmount = Math.max(0, afterDiscountAmount * (waivePercent / 100));
    const payableInterest = Math.max(0, afterDiscountAmount - waivedByPercentAmount - waiveAmount);
    const totalPayable = principal + payableInterest;

    return { calcMonths, suspensionMonths, effectiveMonths, baseInterest, payableInterest, totalPayable };
  }, [
    calcPrincipal, calcRate, calcFromDate, calcToDate, calcSuspensionEnabled, calcSuspensionFromDate, calcSuspensionToDate,
    calcDiscountPercent, calcDiscountAmount, calcWaivePercent, calcWaiveAmount,
  ]);

  if (!canViewAnyFinance) return <AccessDenied showBack={false} />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ချေးငွေစာရင်း - {scopeLabel}</Text>
        {canCreateFinance ? (
          <Pressable onPress={() => router.push("/add-loan" as any)} style={styles.headerActionBtn}>
            <Ionicons name="add-circle" size={20} color={Colors.light.tint} />
            <Text style={styles.headerActionText}>အသစ်ထည့်ရန်</Text>
          </Pressable>
        ) : <View style={{ width: 24 }} />}
      </View>

      {canChooseScope && (
        <View style={styles.scopeCard}>
          <View style={styles.scopeTopRow}>
            <Text style={styles.scopeLabel}>ကြည့်ရှုမည့်အပိုင်း</Text>
            <View style={styles.scopeRow}>
              {(["all", "self", "member"] as LoanViewScope[]).map((k) => (
                <Pressable key={k} style={[styles.scopeChip, viewScope === k && styles.scopeChipActive]} onPress={() => setViewScope(k)}>
                  <Text style={[styles.scopeChipText, viewScope === k && styles.scopeChipTextActive]}>{k === "all" ? "အားလုံး" : k === "self" ? "ကိုယ်တိုင်" : "အခြားသူ"}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {viewScope === "member" && (
            <View style={styles.memberPickerWrap}>
              <TextInput style={styles.memberSearchInput} value={memberSearch} onChangeText={setMemberSearch} placeholder="Member ID / Full Name ရိုက်ရှာပါ" />
              {showInlineMemberResults ? (
                <View style={styles.memberQuickList}>
                  {inlineMemberOptions.length > 0 ? (
                    inlineMemberOptions.map((item: any) => (
                      <Pressable
                        key={`quick-member-${String(item.id || "")}`}
                        style={styles.memberQuickRow}
                        onPress={() => setSelectedMemberId(String(item.id || ""))}
                      >
                        <Text style={styles.memberQuickName} numberOfLines={1}>{item.name || "-"}</Text>
                        <Text style={styles.memberQuickId}>{item.id || "-"}</Text>
                      </Pressable>
                    ))
                  ) : (
                    <Text style={styles.memberQuickEmpty}>ရှာဖွေတွေ့ရှိသော Member မရှိပါ</Text>
                  )}
                </View>
              ) : null}
              <Pressable style={styles.memberPickerBtn} onPress={() => setShowMemberPicker(true)}>
                <Text style={styles.memberPickerBtnText} numberOfLines={1}>
                  {selectedMemberId === "" ? "Dropdown မှ Member ရွေးမည်" : `${members.find((x: any) => x.id === selectedMemberId)?.name || ""} (${selectedMemberId})`}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} />
              </Pressable>
            </View>
          )}
        </View>
      )}

      <View style={styles.filterContainer}>
        {Platform.OS === "web" ? (
          <View style={styles.dateBtn}>{React.createElement("input", { type: "date", value: toYmd(startDate), onChange: (e: any) => e.target.value && setStartDate(new Date(e.target.value)), style: WEB_DATE_INPUT_STYLE })}</View>
        ) : (
          <Pressable style={styles.dateBtn} onPress={() => setShowStartPicker(true)}><Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} /><Text style={styles.dateBtnText}>{formatDateBtn(startDate)}</Text></Pressable>
        )}
        <Text style={{ color: Colors.light.textSecondary }}>to</Text>
        {Platform.OS === "web" ? (
          <View style={styles.dateBtn}>{React.createElement("input", { type: "date", value: toYmd(endDate), onChange: (e: any) => e.target.value && setEndDate(new Date(e.target.value)), style: WEB_DATE_INPUT_STYLE })}</View>
        ) : (
          <Pressable style={styles.dateBtn} onPress={() => setShowEndPicker(true)}><Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} /><Text style={styles.dateBtnText}>{formatDateBtn(endDate)}</Text></Pressable>
        )}
      </View>

      {(showStartPicker || showEndPicker) && Platform.OS !== "web" && (
        <DateTimePicker value={showStartPicker ? startDate : endDate} mode="date" display="default" onChange={(_e, d) => {
          if (showStartPicker) { setShowStartPicker(false); if (d) setStartDate(d); }
          else { setShowEndPicker(false); if (d) setEndDate(d); }
        }} />
      )}

      <FlatList
        data={displayLoanRows}
        keyExtractor={(item) => String(item.loan.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.primaryRow}>
              <View style={styles.primaryBox}><Text style={styles.primaryLabel}>ထုတ်ချေးငွေ</Text><Text style={[styles.primaryValue, { color: "#F59E0B" }]}>{formatKs(principalSummary.issued)}</Text></View>
              <View style={styles.primaryBox}><Text style={styles.primaryLabel}>ပြန်ဆပ်ငွေ</Text><Text style={[styles.primaryValue, { color: "#10B981" }]}>{formatKs(principalSummary.repaid)}</Text></View>
              <View style={[styles.primaryBox, styles.primaryBoxWide]}><Text style={styles.primaryLabel}>ပြန်ဆပ်ရန်ကျန်ငွေ</Text><Text style={[styles.primaryValue, { color: "#EF4444" }]}>{formatKs(principalSummary.outstanding)}</Text></View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsRow}>
              <View style={styles.metricCard}><Text style={styles.metricTitle}>မူလအတိုးကျသင့်ငွေ</Text><Text style={styles.metricValue}>{formatKs(interestSummary.base)}</Text></View>
              <View style={styles.metricCard}><Text style={styles.metricTitle}>အတိုးလျှော့/ဖြေလျှော့ငွေ</Text><Text style={styles.metricValue}>{formatKs(interestSummary.relief)}</Text></View>
              <View style={styles.metricCard}><Text style={styles.metricTitle}>အတိုးဆပ်ရန်ကျသင့်ငွေ</Text><Text style={styles.metricValue}>{formatKs(interestSummary.payable)}</Text></View>
              <View style={styles.metricCard}><Text style={styles.metricTitle}>အတိုးဆပ်ပြီးငွေ</Text><Text style={styles.metricValue}>{formatKs(interestSummary.paid)}</Text></View>
              <View style={styles.metricCard}><Text style={styles.metricTitle}>အတိုးဆပ်ရန်ကျန်ငွေ</Text><Text style={styles.metricValue}>{formatKs(interestSummary.outstanding)}</Text></View>
            </ScrollView>

            <View style={styles.calcCard}>
              <Text style={styles.calcTitle}>အတိုးတွက်ချက်မှုကဏ္ဍ</Text>
              <View style={styles.calcInputRow}><TextInput style={styles.calcInput} placeholder="မူလချေးငွေ" keyboardType="numeric" value={calcPrincipal} onChangeText={setCalcPrincipal} /><TextInput style={styles.calcInput} placeholder="အတိုးနှုန်း (%)" keyboardType="numeric" value={calcRate} onChangeText={setCalcRate} /></View>

              <Text style={styles.calcSubTitle}>တွက်ချက်ကာလ (From - To)</Text>
              <View style={styles.calcInputRow}>
                {Platform.OS === "web" ? (
                  <>
                    <View style={styles.dateField}>{React.createElement("input", { type: "date", value: toYmd(calcFromDate), onChange: (e: any) => e.target.value && setCalcFromDate(new Date(e.target.value)), style: WEB_DATE_INPUT_STYLE })}</View>
                    <View style={styles.dateField}>{React.createElement("input", { type: "date", value: toYmd(calcToDate), onChange: (e: any) => e.target.value && setCalcToDate(new Date(e.target.value)), style: WEB_DATE_INPUT_STYLE })}</View>
                  </>
                ) : (
                  <>
                    <Pressable style={styles.dateField} onPress={() => setShowCalcFromPicker(true)}><Text style={styles.dateBtnText}>{formatDateBtn(calcFromDate)}</Text></Pressable>
                    <Pressable style={styles.dateField} onPress={() => setShowCalcToPicker(true)}><Text style={styles.dateBtnText}>{formatDateBtn(calcToDate)}</Text></Pressable>
                  </>
                )}
              </View>

              <Pressable style={[styles.scopeChip, calcSuspensionEnabled && styles.scopeChipActive]} onPress={() => setCalcSuspensionEnabled((p) => !p)}>
                <Text style={[styles.scopeChipText, calcSuspensionEnabled && styles.scopeChipTextActive]}>{calcSuspensionEnabled ? "ဆိုင်းငံ့ကာလ တွက်ချက်မည်" : "ဆိုင်းငံ့ကာလ မပါ"}</Text>
              </Pressable>

              {calcSuspensionEnabled && (
                <>
                  <Text style={styles.calcSubTitle}>ဆိုင်းငံ့ကာလ (From - To)</Text>
                  <View style={styles.calcInputRow}>
                    {Platform.OS === "web" ? (
                      <>
                        <View style={styles.dateField}>{React.createElement("input", { type: "date", value: toYmd(calcSuspensionFromDate), onChange: (e: any) => e.target.value && setCalcSuspensionFromDate(new Date(e.target.value)), style: WEB_DATE_INPUT_STYLE })}</View>
                        <View style={styles.dateField}>{React.createElement("input", { type: "date", value: toYmd(calcSuspensionToDate), onChange: (e: any) => e.target.value && setCalcSuspensionToDate(new Date(e.target.value)), style: WEB_DATE_INPUT_STYLE })}</View>
                      </>
                    ) : (
                      <>
                        <Pressable style={styles.dateField} onPress={() => setShowSuspFromPicker(true)}><Text style={styles.dateBtnText}>{formatDateBtn(calcSuspensionFromDate)}</Text></Pressable>
                        <Pressable style={styles.dateField} onPress={() => setShowSuspToPicker(true)}><Text style={styles.dateBtnText}>{formatDateBtn(calcSuspensionToDate)}</Text></Pressable>
                      </>
                    )}
                  </View>
                </>
              )}

              <View style={styles.calcInputRow}><TextInput style={styles.calcInput} placeholder="အတိုးလျှော့နှုန်း (%)" keyboardType="numeric" value={calcDiscountPercent} onChangeText={setCalcDiscountPercent} /><TextInput style={styles.calcInput} placeholder="အတိုးလျှော့ငွေပမာဏ (KS)" keyboardType="numeric" value={calcDiscountAmount} onChangeText={setCalcDiscountAmount} /></View>
              <View style={styles.calcInputRow}><TextInput style={styles.calcInput} placeholder="အတိုးဖြေလျှော့နှုန်း (%)" keyboardType="numeric" value={calcWaivePercent} onChangeText={setCalcWaivePercent} /><TextInput style={styles.calcInput} placeholder="အတိုးဖြေလျှော့ငွေပမာဏ (KS)" keyboardType="numeric" value={calcWaiveAmount} onChangeText={setCalcWaiveAmount} /></View>

              <Text style={styles.helperText}>&quot;အတိုးလျှော့&quot; = တွက်ချက်ရာမှာ လျှော့သတ်မှတ်ခြင်း • &quot;အတိုးဖြေလျှော့&quot; = ကျသင့်ပြီးအတိုးမှ ခွင့်လွှတ်လျော့ချပေးခြင်း</Text>
              <View style={styles.calcResultRow}><Text style={styles.calcResultLabel}>တွက်ချက်ကာလ:</Text><Text style={styles.calcResultValue}>{calculator.calcMonths} လ</Text></View>
              <View style={styles.calcResultRow}><Text style={styles.calcResultLabel}>ဆိုင်းငံ့ကာလ:</Text><Text style={styles.calcResultValue}>{calculator.suspensionMonths} လ</Text></View>
              <View style={styles.calcResultRow}><Text style={styles.calcResultLabel}>ထိရောက်ကာလ:</Text><Text style={styles.calcResultValue}>{calculator.effectiveMonths} လ</Text></View>
              <View style={styles.calcResultRow}><Text style={styles.calcResultLabel}>မူလအတိုးကျသင့်:</Text><Text style={styles.calcResultValue}>{formatKs(calculator.baseInterest)}</Text></View>
              <View style={styles.calcResultRow}><Text style={styles.calcResultLabel}>အတိုးဆပ်ရန်ကျသင့်:</Text><Text style={styles.calcResultValue}>{formatKs(calculator.payableInterest)}</Text></View>
              <View style={styles.calcResultRow}><Text style={styles.calcResultLabel}>စုစုပေါင်းပေးဆပ်ရန်:</Text><Text style={styles.calcResultValue}>{formatKs(calculator.totalPayable)}</Text></View>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const loan = item.loan as any;
          const metrics = item.metrics;
          const progress = loan?.status === "paid" ? 100 : (metrics.principal > 0 ? ((metrics.principalRepaid / metrics.principal) * 100) : 0);
          const canOpenDetail = hasStructuredLoanRows && !String(loan?.id || "").startsWith("legacy-loan-");
          return (
            <Pressable
              style={[styles.loanCard, !canOpenDetail && { opacity: 0.85 }]}
              onPress={() => {
                if (!canOpenDetail) return;
                router.push({ pathname: "/loan-detail", params: { id: loan.id } } as any);
              }}
            >
              <View style={styles.loanHeader}><Text style={styles.memberName}>{item.memberName}</Text><Text style={styles.loanAmount}>{formatKs(getLoanPrincipal(loan))}</Text></View>
              <Text style={styles.loanMeta}>ထုတ်ချေးရက်: {String(loan?.issueDate || loan?.date || "-")} • အတိုးနှုန်း: {metrics.appliedRate}%</Text>
              <View style={styles.loanDetailRow}><Text style={styles.loanDetailText}>အရင်းပြန်ဆပ်ပြီး: {formatKs(metrics.principalRepaid)}</Text><Text style={styles.loanDetailText}>အရင်းကျန်: {formatKs(metrics.principalOutstanding)}</Text></View>
              <View style={styles.loanDetailRow}><Text style={styles.loanDetailText}>မူလအတိုး: {formatKs(metrics.baseInterest)}</Text><Text style={styles.loanDetailText}>အတိုးပေးရန်: {formatKs(metrics.interestPayable)}</Text></View>
              <View style={styles.loanDetailRow}><Text style={styles.loanDetailText}>အတိုးဆပ်ပြီး: {formatKs(metrics.interestPaid)}</Text><Text style={styles.loanDetailText}>အတိုးကျန်: {formatKs(metrics.interestOutstanding)}</Text></View>
              <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${Math.max(0, Math.min(100, progress))}%` }]} /></View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>ချေးငွေမှတ်တမ်း မရှိသေးပါ။</Text>}
      />

      {(showCalcFromPicker || showCalcToPicker || showSuspFromPicker || showSuspToPicker) && Platform.OS !== "web" && (
        <DateTimePicker value={showCalcFromPicker ? calcFromDate : showCalcToPicker ? calcToDate : showSuspFromPicker ? calcSuspensionFromDate : calcSuspensionToDate} mode="date" display="default" onChange={(_e, d) => {
          if (showCalcFromPicker) { setShowCalcFromPicker(false); if (d) setCalcFromDate(d); return; }
          if (showCalcToPicker) { setShowCalcToPicker(false); if (d) setCalcToDate(d); return; }
          if (showSuspFromPicker) { setShowSuspFromPicker(false); if (d) setCalcSuspensionFromDate(d); return; }
          setShowSuspToPicker(false); if (d) setCalcSuspensionToDate(d);
        }} />
      )}

      <Modal animationType="slide" transparent visible={showMemberPicker} onRequestClose={() => setShowMemberPicker(false)}>
        <View style={styles.modalContainer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowMemberPicker(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Member ရွေးချယ်ရန်</Text>
            <FlatList data={memberOptions} keyExtractor={(item: any) => String(item.id)} style={{ maxHeight: 320 }} renderItem={({ item }: { item: any }) => (
              <Pressable style={styles.memberOptionRow} onPress={() => { setSelectedMemberId(String(item.id || "")); setShowMemberPicker(false); }}>
                <Text style={styles.memberOptionName}>{item.name || "-"}</Text>
                <Text style={styles.memberOptionId}>{item.id || "-"}</Text>
              </Pressable>
            )} />
            <Pressable style={styles.cancelBtn} onPress={() => setShowMemberPicker(false)}><Text style={styles.cancelBtnText}>Close</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, backgroundColor: Colors.light.surface, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text, flex: 1, marginRight: 10 },
  headerActionBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: Colors.light.surface },
  headerActionText: { fontSize: 12, color: Colors.light.tint, fontFamily: "Inter_600SemiBold", marginLeft: 4 },
  scopeCard: { marginHorizontal: 14, marginTop: 10, marginBottom: 8, padding: 10, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.light.border },
  scopeTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  scopeLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  scopeRow: { flexDirection: "row", gap: 6 },
  scopeChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: "#F8FAFC" },
  scopeChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  scopeChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  scopeChipTextActive: { color: "#fff" },
  memberPickerWrap: { gap: 8, marginTop: 8 },
  memberSearchInput: { backgroundColor: "#F8FAFC", borderRadius: 10, borderWidth: 1, borderColor: Colors.light.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.light.text },
  memberQuickList: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, backgroundColor: "#fff", overflow: "hidden" },
  memberQuickRow: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#EEF2F7" },
  memberQuickName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  memberQuickId: { fontSize: 11.5, color: Colors.light.textSecondary, marginTop: 1, fontFamily: "Inter_500Medium" },
  memberQuickEmpty: { paddingHorizontal: 12, paddingVertical: 10, color: Colors.light.textSecondary, fontSize: 12.5, fontFamily: "Inter_500Medium" },
  memberPickerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#F8FAFC" },
  memberPickerBtnText: { flex: 1, marginRight: 8, fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.text },
  filterContainer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 14, marginBottom: 8, marginTop: 2 },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border },
  dateBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.text },
  dateField: { flex: 1, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: "#F8FAFC" },
  content: { padding: 14, paddingBottom: 30 },
  primaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  primaryBox: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 6,
  },
  primaryBoxWide: { width: "100%" },
  primaryLabel: { fontSize: 12.5, lineHeight: 18, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  primaryValue: { fontSize: 22, lineHeight: 28, fontFamily: "Inter_700Bold" },
  metricsRow: { paddingRight: 10, paddingBottom: 2 },
  metricCard: { width: 220, borderLeftWidth: 4, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: Colors.light.border, marginRight: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  metricTitle: { fontSize: 11, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium", flex: 1 },
  metricValue: { fontSize: 12.5, fontFamily: "Inter_700Bold" },
  calcCard: { marginTop: 10, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, padding: 10 },
  calcTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 8 },
  calcSubTitle: { fontSize: 12, color: Colors.light.textSecondary, marginBottom: 6, fontFamily: "Inter_600SemiBold" },
  calcInputRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  calcInput: { flex: 1, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: Colors.light.text, backgroundColor: "#F8FAFC" },
  helperText: { fontSize: 11, color: Colors.light.textSecondary, lineHeight: 16, marginBottom: 6 },
  calcResultRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  calcResultLabel: { fontSize: 12, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  calcResultValue: { fontSize: 12.5, color: Colors.light.text, fontFamily: "Inter_700Bold" },
  loanCard: { backgroundColor: "white", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: Colors.light.border },
  loanHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  memberName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  loanAmount: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#7C3AED" },
  loanMeta: { fontSize: 12, color: Colors.light.textSecondary, marginBottom: 6 },
  loanDetailRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  loanDetailText: { fontSize: 12, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  progressBarBg: { marginTop: 8, height: 6, backgroundColor: "#F3F4F6", borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: "#10B981" },
  emptyText: { textAlign: "center", color: Colors.light.textSecondary, marginTop: 20 },
  modalContainer: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 20, textAlign: "center" },
  memberOptionRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  memberOptionName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  memberOptionId: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  cancelBtn: { paddingVertical: 14, alignItems: "center", marginTop: 5 },
  cancelBtnText: { color: Colors.light.textSecondary, fontSize: 15, fontFamily: "Inter_500Medium" },
});

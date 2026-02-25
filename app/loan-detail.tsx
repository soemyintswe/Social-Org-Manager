import React, { useMemo, useState } from "react";
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
import DateTimePicker from "@react-native-community/datetimepicker";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { generateReceiptNumber } from "@/lib/storage";
import { computeLoanMetrics, getLoanPrincipal, monthDiffInclusive, parseFlexibleDate } from "@/lib/loan-metrics";

const formatKs = (value: number) => `${Math.round(value || 0).toLocaleString()} MMK`;
const DEFAULT_FROM_DATE = new Date(2018, 0, 1);
const toYmd = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const formatDateBtn = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const WEB_DATE_INPUT_STYLE: any = { border: "none", outline: "none", backgroundColor: "transparent", fontSize: 13, color: Colors.light.text, width: "100%" };

export default function LoanDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    loans,
    members,
    transactions,
    editLoan,
    addTransaction,
    removeLoan,
  } = useData();

  const loan = loans?.find((l) => l.id === id);
  const member = members?.find((m) => m.id === loan?.memberId);

  const [showRepayment, setShowRepayment] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");
  const [repayMethod, setRepayMethod] = useState<"cash" | "bank">("cash");
  const [repayKind, setRepayKind] = useState<"principal" | "interest">("principal");
  const [showInterestSettings, setShowInterestSettings] = useState(false);
  const issueDateBase = parseFlexibleDate((loan as any)?.issueDate || (loan as any)?.date) || DEFAULT_FROM_DATE;
  const endDateBase = parseFlexibleDate((loan as any)?.dueDate) || new Date();
  const [interestSuspended, setInterestSuspended] = useState(Boolean((loan as any)?.interestSuspended));
  const [interestRateOverride, setInterestRateOverride] = useState(String((loan as any)?.interestRateOverride ?? ""));
  const [interestCalcFromDate, setInterestCalcFromDate] = useState<Date>(() => parseFlexibleDate((loan as any)?.interestCalcFromDate) || issueDateBase);
  const [interestCalcToDate, setInterestCalcToDate] = useState<Date>(() => parseFlexibleDate((loan as any)?.interestCalcToDate) || endDateBase);
  const [useSuspensionRange, setUseSuspensionRange] = useState(
    Boolean((loan as any)?.interestSuspensionFromDate || (loan as any)?.interestSuspensionToDate || Number((loan as any)?.interestSuspensionMonths || 0) > 0)
  );
  const [interestSuspensionFromDate, setInterestSuspensionFromDate] = useState<Date>(() => parseFlexibleDate((loan as any)?.interestSuspensionFromDate) || issueDateBase);
  const [interestSuspensionToDate, setInterestSuspensionToDate] = useState<Date>(() => parseFlexibleDate((loan as any)?.interestSuspensionToDate) || endDateBase);
  const [interestDiscountPercent, setInterestDiscountPercent] = useState(String((loan as any)?.interestDiscountPercent ?? ""));
  const [interestDiscountAmount, setInterestDiscountAmount] = useState(String((loan as any)?.interestDiscountAmount ?? ""));
  const [interestWaivedPercent, setInterestWaivedPercent] = useState(String((loan as any)?.interestWaivedPercent ?? ""));
  const [interestWaivedAmount, setInterestWaivedAmount] = useState(String((loan as any)?.interestWaivedAmount ?? ""));
  const [interestAdjustmentNote, setInterestAdjustmentNote] = useState(String((loan as any)?.interestAdjustmentNote ?? ""));
  const [showCalcFromPicker, setShowCalcFromPicker] = useState(false);
  const [showCalcToPicker, setShowCalcToPicker] = useState(false);
  const [showSuspFromPicker, setShowSuspFromPicker] = useState(false);
  const [showSuspToPicker, setShowSuspToPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const loanTransactions = useMemo(
    () => transactions?.filter((t) => String((t as any)?.loanId || "") === String(id || "")) || [],
    [transactions, id]
  );
  const metrics = useMemo(() => computeLoanMetrics(loan as any, transactions as any), [loan, transactions]);
  const webTopInset = Platform.OS === "web" ? 67 : 0;

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

  const handleRepayment = async () => {
    const amount = parseFloat(repayAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("လိုအပ်ချက်", "မှန်ကန်သော ငွေပမာဏကို ရိုက်ထည့်ပါ။");
      return;
    }

    setSaving(true);
    try {
      await addTransaction({
        type: "income",
        category: (repayKind === "principal" ? "loan_repayment" : "interest_income") as any,
        amount,
        memberId: loan.memberId,
        loanId: loan.id,
        date: new Date().toISOString().split("T")[0],
        paymentMethod: repayMethod,
        description:
          repayKind === "principal"
            ? `Loan principal repayment from ${member?.name || "Member"}`
            : `Loan interest repayment from ${member?.name || "Member"}`,
        receiptNumber: generateReceiptNumber(),
        createdAt: new Date().toISOString(),
      });

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowRepayment(false);
      setRepayAmount("");
      Alert.alert("အောင်မြင်ပါသည်", "ပေးဆပ်မှု မှတ်တမ်းတင်ပြီးပါပြီ။");
    } catch {
      Alert.alert("အမှား", "သိမ်းဆည်း၍ မရပါ။");
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
        interestCalcFromDate: toYmd(interestCalcFromDate),
        interestCalcToDate: toYmd(interestCalcToDate),
        interestCalcMonths: monthDiffInclusive(interestCalcFromDate, interestCalcToDate),
        interestSuspensionFromDate: useSuspensionRange ? toYmd(interestSuspensionFromDate) : undefined,
        interestSuspensionToDate: useSuspensionRange ? toYmd(interestSuspensionToDate) : undefined,
        interestSuspensionMonths: useSuspensionRange
          ? monthDiffInclusive(interestSuspensionFromDate, interestSuspensionToDate)
          : 0,
        interestDiscountPercent: toNumberOrUndefined(interestDiscountPercent),
        interestDiscountAmount: toNumberOrUndefined(interestDiscountAmount),
        interestWaivedPercent: toNumberOrUndefined(interestWaivedPercent),
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

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Borrower</Text>
          <Text style={styles.borrowerName}>{member?.name || "Unknown Member"}</Text>
          <Text style={styles.metaText}>
            ထုတ်ချေးရက်: {String((loan as any)?.issueDate || (loan as any)?.date || "-")} • အတိုးနှုန်း: {metrics.appliedRate}%
          </Text>
        </View>

        <Text style={styles.sectionTitle}>အရင်းငွေ စာရင်းချုပ်</Text>
        <View style={styles.primaryRow}>
          <View style={styles.primaryBox}>
            <Text style={styles.primaryLabel}>ထုတ်ချေးငွေ</Text>
            <Text style={[styles.primaryValue, { color: "#F59E0B" }]}>{formatKs(getLoanPrincipal(loan as any))}</Text>
          </View>
          <View style={styles.primaryBox}>
            <Text style={styles.primaryLabel}>ပြန်ဆပ်ငွေ</Text>
            <Text style={[styles.primaryValue, { color: "#10B981" }]}>{formatKs(metrics.principalRepaid)}</Text>
          </View>
          <View style={styles.primaryBox}>
            <Text style={styles.primaryLabel}>ပြန်ဆပ်ရန်ကျန်ငွေ</Text>
            <Text style={[styles.primaryValue, { color: "#EF4444" }]}>{formatKs(metrics.principalOutstanding)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>အတိုးကျသင့်ငွေ စာရင်းချုပ်</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsRow}>
          <View style={[styles.metricCard, { borderLeftColor: "#8B5CF6" }]}>
            <Text style={styles.metricTitle}>မူလအတိုးကျသင့်ငွေ</Text>
            <Text style={[styles.metricValue, { color: "#8B5CF6" }]}>{formatKs(metrics.baseInterest)}</Text>
          </View>
          <View style={[styles.metricCard, { borderLeftColor: "#0EA5E9" }]}>
            <Text style={styles.metricTitle}>အတိုးဖြေလျှော့ငွေ</Text>
            <Text style={[styles.metricValue, { color: "#0EA5E9" }]}>{formatKs(metrics.interestRelief)}</Text>
          </View>
          <View style={[styles.metricCard, { borderLeftColor: "#0369A1" }]}>
            <Text style={styles.metricTitle}>အတိုးဆပ်ရန်ကျသင့်ငွေ</Text>
            <Text style={[styles.metricValue, { color: "#0369A1" }]}>{formatKs(metrics.interestPayable)}</Text>
          </View>
          <View style={[styles.metricCard, { borderLeftColor: "#16A34A" }]}>
            <Text style={styles.metricTitle}>အတိုးဆပ်ပြီးငွေ</Text>
            <Text style={[styles.metricValue, { color: "#16A34A" }]}>{formatKs(metrics.interestPaid)}</Text>
          </View>
          <View style={[styles.metricCard, { borderLeftColor: "#DC2626" }]}>
            <Text style={styles.metricTitle}>အတိုးဆပ်ရန်ကျန်ငွေ</Text>
            <Text style={[styles.metricValue, { color: "#DC2626" }]}>{formatKs(metrics.interestOutstanding)}</Text>
          </View>
        </ScrollView>

        <View style={styles.actionRow}>
          <Pressable style={styles.primaryBtn} onPress={() => setShowRepayment((prev) => !prev)}>
            <Text style={styles.primaryBtnText}>{showRepayment ? "ပိတ်မည်" : "ပေးဆပ်မှုထည့်မည်"}</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => setShowInterestSettings((prev) => !prev)}>
            <Text style={styles.secondaryBtnText}>{showInterestSettings ? "ပိတ်မည်" : "အတိုးတွက်ချက်မှုပြင်မည်"}</Text>
          </Pressable>
        </View>

        {showInterestSettings && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>အတိုးတွက်ချက်မှု သတ်မှတ်ချက်</Text>
            <Pressable
              style={[styles.toggleChip, interestSuspended && styles.toggleChipActive]}
              onPress={() => setInterestSuspended((prev) => !prev)}
            >
              <Text style={[styles.toggleChipText, interestSuspended && styles.toggleChipTextActive]}>
                {interestSuspended ? "အတိုးဆိုင်းငံ့ထား" : "အတိုးတွက်ချက်နေ"}
              </Text>
            </Pressable>

            <View style={styles.inputRow}>
              <TextInput style={styles.input} placeholder="အတိုးနှုန်း Override (%)" keyboardType="numeric" value={interestRateOverride} onChangeText={setInterestRateOverride} />
            </View>

            <Text style={styles.inlineLabel}>တွက်ချက်ကာလ (From - To)</Text>
            <View style={styles.inputRow}>
              {Platform.OS === "web" ? (
                <>
                  <View style={styles.dateField}>
                    {React.createElement("input", {
                      type: "date",
                      value: toYmd(interestCalcFromDate),
                      onChange: (e: any) => e.target.value && setInterestCalcFromDate(new Date(e.target.value)),
                      style: WEB_DATE_INPUT_STYLE,
                    })}
                  </View>
                  <View style={styles.dateField}>
                    {React.createElement("input", {
                      type: "date",
                      value: toYmd(interestCalcToDate),
                      onChange: (e: any) => e.target.value && setInterestCalcToDate(new Date(e.target.value)),
                      style: WEB_DATE_INPUT_STYLE,
                    })}
                  </View>
                </>
              ) : (
                <>
                  <Pressable style={styles.dateField} onPress={() => setShowCalcFromPicker(true)}>
                    <Text style={styles.dateText}>{formatDateBtn(interestCalcFromDate)}</Text>
                  </Pressable>
                  <Pressable style={styles.dateField} onPress={() => setShowCalcToPicker(true)}>
                    <Text style={styles.dateText}>{formatDateBtn(interestCalcToDate)}</Text>
                  </Pressable>
                </>
              )}
            </View>

            <Pressable
              style={[styles.toggleChip, useSuspensionRange && styles.toggleChipActive]}
              onPress={() => setUseSuspensionRange((prev) => !prev)}
            >
              <Text style={[styles.toggleChipText, useSuspensionRange && styles.toggleChipTextActive]}>
                {useSuspensionRange ? "ဆိုင်းငံ့ကာလ သတ်မှတ်ထား" : "ဆိုင်းငံ့ကာလ မသတ်မှတ်"}
              </Text>
            </Pressable>

            {useSuspensionRange && (
              <>
                <Text style={styles.inlineLabel}>ဆိုင်းငံ့ကာလ (From - To)</Text>
                <View style={styles.inputRow}>
                  {Platform.OS === "web" ? (
                    <>
                      <View style={styles.dateField}>
                        {React.createElement("input", {
                          type: "date",
                          value: toYmd(interestSuspensionFromDate),
                          onChange: (e: any) => e.target.value && setInterestSuspensionFromDate(new Date(e.target.value)),
                          style: WEB_DATE_INPUT_STYLE,
                        })}
                      </View>
                      <View style={styles.dateField}>
                        {React.createElement("input", {
                          type: "date",
                          value: toYmd(interestSuspensionToDate),
                          onChange: (e: any) => e.target.value && setInterestSuspensionToDate(new Date(e.target.value)),
                          style: WEB_DATE_INPUT_STYLE,
                        })}
                      </View>
                    </>
                  ) : (
                    <>
                      <Pressable style={styles.dateField} onPress={() => setShowSuspFromPicker(true)}>
                        <Text style={styles.dateText}>{formatDateBtn(interestSuspensionFromDate)}</Text>
                      </Pressable>
                      <Pressable style={styles.dateField} onPress={() => setShowSuspToPicker(true)}>
                        <Text style={styles.dateText}>{formatDateBtn(interestSuspensionToDate)}</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </>
            )}

            <View style={styles.inputRow}>
              <TextInput style={styles.input} placeholder="အတိုးလျှော့နှုန်း (%)" keyboardType="numeric" value={interestDiscountPercent} onChangeText={setInterestDiscountPercent} />
              <TextInput style={styles.input} placeholder="အတိုးလျှော့ငွေပမာဏ (MMK)" keyboardType="numeric" value={interestDiscountAmount} onChangeText={setInterestDiscountAmount} />
            </View>
            <View style={styles.inputRow}>
              <TextInput style={styles.input} placeholder="အတိုးဖြေလျှော့နှုန်း (%)" keyboardType="numeric" value={interestWaivedPercent} onChangeText={setInterestWaivedPercent} />
              <TextInput style={styles.input} placeholder="အတိုးဖြေလျှော့ငွေပမာဏ (MMK)" keyboardType="numeric" value={interestWaivedAmount} onChangeText={setInterestWaivedAmount} />
            </View>
            <Text style={styles.helperText}>
              "အတိုးလျှော့" = တွက်ချက်ရာမှာ လျှော့သတ်မှတ်ခြင်း • "အတိုးဖြေလျှော့" = ကျသင့်ပြီးအတိုးမှ ခွင့်လွှတ်လျော့ချပေးခြင်း
            </Text>
            <TextInput
              style={[styles.input, { minHeight: 70 }]}
              placeholder="မှတ်ချက်"
              multiline
              value={interestAdjustmentNote}
              onChangeText={setInterestAdjustmentNote}
            />

            <View style={styles.formActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowInterestSettings(false)}>
                <Text style={styles.cancelBtnText}>ပိတ်မည်</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={saveInterestSettings} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {(showCalcFromPicker || showCalcToPicker || showSuspFromPicker || showSuspToPicker) && Platform.OS !== "web" && (
          <DateTimePicker
            value={
              showCalcFromPicker
                ? interestCalcFromDate
                : showCalcToPicker
                  ? interestCalcToDate
                  : showSuspFromPicker
                    ? interestSuspensionFromDate
                    : interestSuspensionToDate
            }
            mode="date"
            display="default"
            onChange={(_event, selectedDate) => {
              if (showCalcFromPicker) {
                setShowCalcFromPicker(false);
                if (selectedDate) setInterestCalcFromDate(selectedDate);
                return;
              }
              if (showCalcToPicker) {
                setShowCalcToPicker(false);
                if (selectedDate) setInterestCalcToDate(selectedDate);
                return;
              }
              if (showSuspFromPicker) {
                setShowSuspFromPicker(false);
                if (selectedDate) setInterestSuspensionFromDate(selectedDate);
                return;
              }
              setShowSuspToPicker(false);
              if (selectedDate) setInterestSuspensionToDate(selectedDate);
            }}
          />
        )}

        {showRepayment && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>ပေးဆပ်မှုထည့်သွင်းရန်</Text>
            <View style={styles.kindRow}>
              <Pressable
                style={[styles.kindChip, repayKind === "principal" && styles.kindChipActive]}
                onPress={() => setRepayKind("principal")}
              >
                <Text style={[styles.kindChipText, repayKind === "principal" && styles.kindChipTextActive]}>အရင်းဆပ်ငွေ</Text>
              </Pressable>
              <Pressable
                style={[styles.kindChip, repayKind === "interest" && styles.kindChipActive]}
                onPress={() => setRepayKind("interest")}
              >
                <Text style={[styles.kindChipText, repayKind === "interest" && styles.kindChipTextActive]}>အတိုးဆပ်ငွေ</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Amount"
              keyboardType="numeric"
              value={repayAmount}
              onChangeText={setRepayAmount}
            />
            <View style={styles.methodRow}>
              <Pressable style={[styles.methodOption, repayMethod === "cash" && styles.methodActive]} onPress={() => setRepayMethod("cash")}>
                <Text>Cash</Text>
              </Pressable>
              <Pressable style={[styles.methodOption, repayMethod === "bank" && styles.methodActive]} onPress={() => setRepayMethod("bank")}>
                <Text>Bank</Text>
              </Pressable>
            </View>
            <View style={styles.formActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowRepayment(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={handleRepayment} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>အသေးစိတ်မှတ်တမ်း</Text>
        {loanTransactions.length === 0 ? (
          <Text style={styles.emptyText}>ပေးဆပ်မှုမှတ်တမ်း မရှိသေးပါ။</Text>
        ) : (
          loanTransactions.map((t: any) => (
            <View key={t.id} style={styles.historyItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyDate}>{String(t.date || "-")}</Text>
                <Text style={styles.historyMethod}>
                  {String(t.category || "") === "loan_repayment" ? "အရင်းဆပ်ငွေ" : "အတိုးဆပ်ငွေ"} • {String(t.paymentMethod || "").toUpperCase()}
                </Text>
              </View>
              <Text style={styles.historyAmount}>{formatKs(Number(t.amount || 0))}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center", padding: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  content: { padding: 14 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: Colors.light.border },
  cardLabel: { fontSize: 12, color: Colors.light.textSecondary, textTransform: "uppercase" },
  borrowerName: { fontSize: 19, fontWeight: "700", color: Colors.light.text, marginTop: 4 },
  metaText: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8, marginTop: 2, color: Colors.light.text },
  primaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  primaryBox: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: Colors.light.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  primaryLabel: { fontSize: 11, color: Colors.light.textSecondary, flex: 1 },
  primaryValue: { fontSize: 12.5, fontWeight: "700" },
  metricsRow: { paddingBottom: 2, paddingRight: 8 },
  metricCard: {
    width: 215,
    borderLeftWidth: 4,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginRight: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  metricTitle: { fontSize: 11, color: Colors.light.textSecondary, flex: 1 },
  metricValue: { fontSize: 12.5, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 10, marginBottom: 10 },
  primaryBtn: { flex: 1, backgroundColor: Colors.light.tint, borderRadius: 10, alignItems: "center", paddingVertical: 10 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  secondaryBtn: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, alignItems: "center", paddingVertical: 10 },
  secondaryBtnText: { color: Colors.light.text, fontWeight: "700", fontSize: 12 },
  formCard: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.light.border },
  formTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8, color: Colors.light.text },
  toggleChip: { alignSelf: "flex-start", borderWidth: 1, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  toggleChipActive: { borderColor: Colors.light.tint, backgroundColor: Colors.light.tint + "15" },
  toggleChipText: { fontSize: 12, color: Colors.light.textSecondary, fontWeight: "600" },
  toggleChipTextActive: { color: Colors.light.tint },
  inlineLabel: { fontSize: 12, color: Colors.light.textSecondary, marginBottom: 6, fontWeight: "600" },
  inputRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, padding: 10, marginBottom: 8, fontSize: 13, backgroundColor: "#F8FAFC", color: Colors.light.text },
  dateField: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
  },
  dateText: { fontSize: 13, color: Colors.light.text, fontFamily: "Inter_500Medium" },
  helperText: { fontSize: 11, color: Colors.light.textSecondary, lineHeight: 16, marginBottom: 8 },
  kindRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  kindChip: { flex: 1, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingVertical: 9, alignItems: "center", backgroundColor: "#fff" },
  kindChipActive: { borderColor: Colors.light.tint, backgroundColor: Colors.light.tint + "15" },
  kindChipText: { fontSize: 12, color: Colors.light.textSecondary, fontWeight: "600" },
  kindChipTextActive: { color: Colors.light.tint },
  methodRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  methodOption: { flex: 1, padding: 10, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 8, alignItems: "center" },
  methodActive: { backgroundColor: Colors.light.tintLight, borderColor: Colors.light.tint },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  cancelBtnText: { color: Colors.light.textSecondary, fontWeight: "600" },
  saveBtn: { backgroundColor: Colors.light.tint, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  saveBtnText: { color: "#fff", fontWeight: "600" },
  historyItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    gap: 8,
  },
  historyDate: { fontSize: 13, color: Colors.light.text },
  historyMethod: { fontSize: 11, color: Colors.light.textSecondary },
  historyAmount: { fontSize: 14, fontWeight: "700", color: "#10B981" },
  emptyText: { color: Colors.light.textSecondary, textAlign: "center", marginTop: 6 },
});

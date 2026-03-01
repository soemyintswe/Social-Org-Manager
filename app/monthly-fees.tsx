import React, { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import AccessDenied from "@/components/AccessDenied";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { useData } from "@/lib/DataContext";
import {
  MonthlyFeePolicyRequest,
  MonthlyFeeRateRule,
  MonthlyFeeReliefRule,
  MonthlyFeeReliefMode,
  MonthlyFeeRuleScope,
  ORG_POSITION_LABELS,
  normalizeOrgPosition,
  type OrgPosition,
} from "@/lib/types";

type MemberOption = { id: string; name: string };
type DateFieldKey = "rateStart" | "rateEnd" | "reliefStart" | "reliefEnd";

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ymdToDate(value: string | undefined): Date {
  const text = String(value || "").trim();
  const matched = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!matched) return new Date();
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function requestId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function MonthlyFeesScreen() {
  const { accountSettings, updateAccountSettings, members = [] } = useData() as any;
  const { can, currentUser, currentMember } = useAuth();

  const canView = can("reports.view_summary") || can("reports.view_all");
  const role = normalizeOrgPosition(currentMember?.orgPosition || currentUser?.orgPosition || "member");
  const isAdmin = currentUser?.systemRole === "admin";
  const isTreasurer = isAdmin || role === "treasurer";
  const isChair = isAdmin || role === "chairperson";
  const canEdit = isTreasurer || isChair;

  const rateRules = useMemo<MonthlyFeeRateRule[]>(
    () => (Array.isArray(accountSettings?.monthlyFeeRateRules) ? accountSettings.monthlyFeeRateRules : []),
    [accountSettings?.monthlyFeeRateRules]
  );
  const reliefRules = useMemo<MonthlyFeeReliefRule[]>(
    () => (Array.isArray(accountSettings?.monthlyFeeReliefRules) ? accountSettings.monthlyFeeReliefRules : []),
    [accountSettings?.monthlyFeeReliefRules]
  );
  const policyRequests = useMemo<MonthlyFeePolicyRequest[]>(
    () => (Array.isArray(accountSettings?.monthlyFeePolicyRequests) ? accountSettings.monthlyFeePolicyRequests : []),
    [accountSettings?.monthlyFeePolicyRequests]
  );
  const pendingRequests = useMemo(
    () => policyRequests.filter((row) => row.status === "pending_chair_approval"),
    [policyRequests]
  );

  const memberOptions = useMemo<MemberOption[]>(
    () =>
      (members || [])
        .map((m: any) => ({ id: String(m?.id || ""), name: String(m?.name || "-") }))
        .filter((m: MemberOption) => !!m.id),
    [members]
  );
  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    memberOptions.forEach((m) => map.set(m.id, m.name));
    return map;
  }, [memberOptions]);

  const [rateScope, setRateScope] = useState<MonthlyFeeRuleScope>("global");
  const [ratePosition, setRatePosition] = useState<OrgPosition>("patron");
  const [rateMemberIds, setRateMemberIds] = useState<string[]>([]);
  const [rateSearch, setRateSearch] = useState("");
  const [rateShowList, setRateShowList] = useState(false);
  const [rateAmount, setRateAmount] = useState("");
  const [rateStart, setRateStart] = useState(todayYmd());
  const [rateEnd, setRateEnd] = useState("");
  const [rateReason, setRateReason] = useState("");

  const [reliefScope, setReliefScope] = useState<MonthlyFeeRuleScope>("global");
  const [reliefPosition, setReliefPosition] = useState<OrgPosition>("patron");
  const [reliefMemberIds, setReliefMemberIds] = useState<string[]>([]);
  const [reliefSearch, setReliefSearch] = useState("");
  const [reliefShowList, setReliefShowList] = useState(false);
  const [reliefMode, setReliefMode] = useState<MonthlyFeeReliefMode>("full");
  const [reliefValue, setReliefValue] = useState("");
  const [reliefStart, setReliefStart] = useState(todayYmd());
  const [reliefEnd, setReliefEnd] = useState("");
  const [reliefReason, setReliefReason] = useState("");
  const [dateFieldKey, setDateFieldKey] = useState<DateFieldKey | null>(null);
  const [datePickerValue, setDatePickerValue] = useState<Date>(new Date());
  const [webDateEditorVisible, setWebDateEditorVisible] = useState(false);
  const [webDateEditorValue, setWebDateEditorValue] = useState("");

  const filteredRateMembers = useMemo(() => {
    const needle = rateSearch.trim().toLowerCase();
    if (!needle) return memberOptions;
    return memberOptions.filter((m) => m.id.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle));
  }, [memberOptions, rateSearch]);
  const filteredReliefMembers = useMemo(() => {
    const needle = reliefSearch.trim().toLowerCase();
    if (!needle) return memberOptions;
    return memberOptions.filter((m) => m.id.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle));
  }, [memberOptions, reliefSearch]);

  const openDatePicker = useCallback((key: DateFieldKey, currentValue: string) => {
    if (Platform.OS === "web") {
      setDateFieldKey(key);
      setWebDateEditorValue(String(currentValue || todayYmd()));
      setWebDateEditorVisible(true);
      return;
    }
    setDatePickerValue(ymdToDate(currentValue || todayYmd()));
    setDateFieldKey(key);
  }, []);

  const applyDateToField = useCallback((key: DateFieldKey, date: Date) => {
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (key === "rateStart") setRateStart(ymd);
    if (key === "rateEnd") setRateEnd(ymd);
    if (key === "reliefStart") setReliefStart(ymd);
    if (key === "reliefEnd") setReliefEnd(ymd);
  }, []);

  const handleDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!dateFieldKey) return;
    if (event.type === "dismissed") {
      setDateFieldKey(null);
      return;
    }
    if (!selectedDate) return;
    if (Platform.OS === "android") {
      applyDateToField(dateFieldKey, selectedDate);
      setDateFieldKey(null);
      return;
    }
    setDatePickerValue(selectedDate);
  }, [dateFieldKey, applyDateToField]);

  const applyWebDate = useCallback(() => {
    if (!dateFieldKey) return;
    const text = String(webDateEditorValue || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      Alert.alert("နေ့စွဲ format", "YYYY-MM-DD ပုံစံဖြင့်ထည့်ပါ။");
      return;
    }
    applyDateToField(dateFieldKey, ymdToDate(text));
    setWebDateEditorVisible(false);
    setDateFieldKey(null);
  }, [dateFieldKey, webDateEditorValue, applyDateToField]);

  const persist = useCallback(
    async (nextRates: MonthlyFeeRateRule[], nextReliefs: MonthlyFeeReliefRule[], nextRequests: MonthlyFeePolicyRequest[]) => {
      await updateAccountSettings({
        ...accountSettings,
        monthlyFeeRateRules: nextRates,
        monthlyFeeReliefRules: nextReliefs,
        monthlyFeePolicyRequests: nextRequests,
      });
    },
    [accountSettings, updateAccountSettings]
  );

  const addRate = useCallback(async () => {
    if (!canEdit || !currentUser?.id) return;
    const amount = Math.max(0, Number(rateAmount || 0));
    if (!amount || !rateStart.trim()) return Alert.alert("လိုအပ်ချက်", "နှုန်းထားနှင့် စတင်နေ့ ထည့်ပါ။");
    const targets = rateScope === "member" ? rateMemberIds : [""];
    if (rateScope === "member" && targets.length === 0) return Alert.alert("လိုအပ်ချက်", "အသင်းဝင်ရွေးချယ်ပါ။");
    const now = new Date().toISOString();
    const rules = targets.map((id) => ({
      id: requestId("fee-rate"),
      scope: rateScope,
      amount,
      effectiveFrom: rateStart.trim(),
      effectiveTo: rateEnd.trim() || undefined,
      memberId: rateScope === "member" ? id : undefined,
      position: rateScope === "position" ? normalizeOrgPosition(ratePosition) : undefined,
      reason: rateReason.trim() || undefined,
      active: true,
      updatedAt: now,
      updatedByUserId: String(currentUser.id),
    })) as MonthlyFeeRateRule[];

    if (isChair) {
      const approved = rules.map((payload) => ({
        id: requestId("fee-policy-req"),
        policyType: "rate_rule",
        action: "create",
        payload,
        status: "approved",
        createdByUserId: String(currentUser.id),
        createdByMemberId: String(currentUser.memberId || "") || undefined,
        createdByRole: role,
        createdAt: now,
        reviewedByUserId: String(currentUser.id),
        reviewedByMemberId: String(currentUser.memberId || "") || undefined,
        reviewedAt: now,
        appliedAt: now,
      })) as MonthlyFeePolicyRequest[];
      await persist([...rateRules, ...rules], reliefRules, [...policyRequests, ...approved]);
    } else {
      const pending = rules.map((payload) => ({
        id: requestId("fee-policy-req"),
        policyType: "rate_rule",
        action: "create",
        payload,
        status: "pending_chair_approval",
        createdByUserId: String(currentUser.id),
        createdByMemberId: String(currentUser.memberId || "") || undefined,
        createdByRole: role,
        createdAt: now,
      })) as MonthlyFeePolicyRequest[];
      await persist(rateRules, reliefRules, [...policyRequests, ...pending]);
      Alert.alert("တင်ပြပြီးပါပြီ", "ဥက္ကဌ အတည်ပြုချက်ရပြီးမှ အသက်ဝင်ပါမည်။");
    }
    setRateMemberIds([]);
    setRateAmount("");
    setRateEnd("");
    setRateReason("");
  }, [canEdit, currentUser, rateAmount, rateStart, rateScope, rateMemberIds, rateEnd, ratePosition, rateReason, isChair, role, persist, rateRules, reliefRules, policyRequests]);

  const addRelief = useCallback(async () => {
    if (!canEdit || !currentUser?.id) return;
    if (!reliefStart.trim()) return Alert.alert("လိုအပ်ချက်", "စတင်နေ့ ထည့်ပါ။");
    if (reliefMode !== "full" && Math.max(0, Number(reliefValue || 0)) <= 0) return Alert.alert("လိုအပ်ချက်", "ကင်းလွတ်/သက်သာတန်ဖိုး ထည့်ပါ။");
    const targets = reliefScope === "member" ? reliefMemberIds : [""];
    if (reliefScope === "member" && targets.length === 0) return Alert.alert("လိုအပ်ချက်", "အသင်းဝင်ရွေးချယ်ပါ။");
    const now = new Date().toISOString();
    const rules = targets.map((id) => ({
      id: requestId("fee-relief"),
      scope: reliefScope,
      mode: reliefMode,
      value: reliefMode === "full" ? undefined : Math.max(0, Number(reliefValue || 0)),
      effectiveFrom: reliefStart.trim(),
      effectiveTo: reliefEnd.trim() || undefined,
      memberId: reliefScope === "member" ? id : undefined,
      position: reliefScope === "position" ? normalizeOrgPosition(reliefPosition) : undefined,
      reason: reliefReason.trim() || undefined,
      active: true,
      updatedAt: now,
      updatedByUserId: String(currentUser.id),
    })) as MonthlyFeeReliefRule[];

    if (isChair) {
      const approved = rules.map((payload) => ({
        id: requestId("fee-policy-req"),
        policyType: "relief_rule",
        action: "create",
        payload,
        status: "approved",
        createdByUserId: String(currentUser.id),
        createdByMemberId: String(currentUser.memberId || "") || undefined,
        createdByRole: role,
        createdAt: now,
        reviewedByUserId: String(currentUser.id),
        reviewedByMemberId: String(currentUser.memberId || "") || undefined,
        reviewedAt: now,
        appliedAt: now,
      })) as MonthlyFeePolicyRequest[];
      await persist(rateRules, [...reliefRules, ...rules], [...policyRequests, ...approved]);
    } else {
      const pending = rules.map((payload) => ({
        id: requestId("fee-policy-req"),
        policyType: "relief_rule",
        action: "create",
        payload,
        status: "pending_chair_approval",
        createdByUserId: String(currentUser.id),
        createdByMemberId: String(currentUser.memberId || "") || undefined,
        createdByRole: role,
        createdAt: now,
      })) as MonthlyFeePolicyRequest[];
      await persist(rateRules, reliefRules, [...policyRequests, ...pending]);
      Alert.alert("တင်ပြပြီးပါပြီ", "ဥက္ကဌ အတည်ပြုချက်ရပြီးမှ အသက်ဝင်ပါမည်။");
    }
    setReliefMemberIds([]);
    setReliefValue("");
    setReliefEnd("");
    setReliefReason("");
  }, [canEdit, currentUser, reliefStart, reliefMode, reliefValue, reliefScope, reliefMemberIds, reliefEnd, reliefPosition, reliefReason, isChair, role, persist, rateRules, reliefRules, policyRequests]);

  const approvePending = useCallback(async (req: MonthlyFeePolicyRequest, approve: boolean) => {
    if (!isChair || !currentUser?.id) return;
    let nextRates = [...rateRules];
    let nextReliefs = [...reliefRules];
    if (approve && req.policyType === "rate_rule") nextRates = [...nextRates, req.payload as MonthlyFeeRateRule];
    if (approve && req.policyType === "relief_rule") nextReliefs = [...nextReliefs, req.payload as MonthlyFeeReliefRule];
    const now = new Date().toISOString();
    const nextRequests = policyRequests.map((row) => (row.id === req.id ? { ...row, status: approve ? "approved" : "rejected", reviewedByUserId: currentUser.id, reviewedAt: now, appliedAt: approve ? now : row.appliedAt } : row));
    await persist(nextRates, nextReliefs, nextRequests as MonthlyFeePolicyRequest[]);
  }, [isChair, currentUser, rateRules, reliefRules, policyRequests, persist]);

  if (!canView) return <AccessDenied message="လစဉ်ကြေး စာမျက်နှာ ကြည့်ရှုခွင့်မရှိပါ။" />;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>လစဉ်ကြေး</Text>
        <Text style={styles.sub}>ပြင်ဆင်ခွင့်: ဘဏ္ဍာရေးမှူး + ဥက္ကဌ | ဘဏ္ဍာရေးမှူးပြင်ဆင်မှုများသည် ဥက္ကဌအတည်ပြုမှ အသက်ဝင်မည်။</Text>

        {pendingRequests.length > 0 && isChair ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ဥက္ကဌ အတည်ပြုရန်</Text>
            {pendingRequests.map((req) => (
              <View key={req.id} style={styles.row}>
                <Text style={styles.meta}>{req.policyType === "rate_rule" ? "နှုန်းထား" : "ကင်းလွတ်/သက်သာ"} | {req.action} | {req.payload?.effectiveFrom || "-"}</Text>
                <View style={styles.inlineBtns}>
                  <Pressable style={[styles.smallAction, { backgroundColor: "#10B981" }]} onPress={() => void approvePending(req, true)}><Text style={styles.smallActionText}>Approve</Text></Pressable>
                  <Pressable style={[styles.smallAction, { backgroundColor: "#EF4444" }]} onPress={() => void approvePending(req, false)}><Text style={styles.smallActionText}>Reject</Text></Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>နှုန်းထား စည်းမျဉ်းများ ({rateRules.length})</Text>
          {rateRules.map((r) => <Text key={r.id} style={styles.meta}>- {r.scope === "member" ? `${memberNameById.get(String(r.memberId || "")) || "-"} (${r.memberId || "-"})` : r.scope === "position" ? `ရာထူး: ${ORG_POSITION_LABELS[normalizeOrgPosition(r.position || "member")]}` : "အားလုံး"} | {Number(r.amount || 0).toLocaleString()} KS | {r.effectiveFrom} ~ {r.effectiveTo || "-"}</Text>)}
        </View>

        {canEdit ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>နှုန်းထားအသစ် ထည့်ရန်</Text>
            <View style={styles.inlineBtns}>
              {(["global", "position", "member"] as MonthlyFeeRuleScope[]).map((scope) => (
                <Pressable
                  key={`rate-scope-${scope}`}
                  style={[styles.chipBtn, rateScope === scope && styles.chipBtnActive]}
                  onPress={() => setRateScope(scope)}
                >
                  <Text style={[styles.chipBtnText, rateScope === scope && styles.chipBtnTextActive]}>
                    {scope === "global" ? "အားလုံး" : scope === "position" ? "ရာထူး" : "အသင်းဝင်"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {rateScope === "position" ? (
              <View style={styles.inlineBtns}>
                {(["patron", "chairperson", "vice_chairperson", "secretary", "joint_secretary", "treasurer", "auditor", "committee_member", "member"] as OrgPosition[]).map((position) => (
                  <Pressable
                    key={`rate-position-${position}`}
                    style={[styles.chipBtn, ratePosition === position && styles.chipBtnActive]}
                    onPress={() => setRatePosition(position)}
                  >
                    <Text style={[styles.chipBtnText, ratePosition === position && styles.chipBtnTextActive]}>{ORG_POSITION_LABELS[position]}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.meta}>Scope: {rateScope === "global" ? "အားလုံး" : rateScope === "position" ? ORG_POSITION_LABELS[normalizeOrgPosition(ratePosition)] : "အသင်းဝင်ရွေးချယ်ရန်"}</Text>
            {rateScope === "member" ? (
              <View style={styles.selectorWrap}>
                <Pressable style={styles.toggleBtn} onPress={() => setRateShowList(true)}>
                  <Text style={styles.toggleBtnText}>Member List ရွေးချယ်ရန် (Popup)</Text>
                </Pressable>
                <Text style={styles.meta}>
                  ရွေးထားသည်: {rateMemberIds.map((id) => `${memberNameById.get(id) || "-"} (${id})`).join(", ") || "-"}
                </Text>
              </View>
            ) : null}
            <TextInput style={styles.input} value={rateAmount} onChangeText={setRateAmount} placeholder="နှုန်းထား (KS/လ)" keyboardType="numeric" />
            <View style={styles.dateRow}>
              <Pressable style={styles.dateBtn} onPress={() => openDatePicker("rateStart", rateStart)}>
                <Text style={styles.dateBtnLabel}>စတင်နေ့</Text>
                <Text style={styles.dateBtnValue}>{rateStart || "-"}</Text>
              </Pressable>
              <Pressable style={styles.dateBtn} onPress={() => openDatePicker("rateEnd", rateEnd || todayYmd())}>
                <Text style={styles.dateBtnLabel}>ပြီးဆုံးနေ့ (optional)</Text>
                <Text style={styles.dateBtnValue}>{rateEnd || "ရွေးချယ်ရန်"}</Text>
              </Pressable>
            </View>
            <View style={styles.dateRow}>
              <TextInput style={[styles.input, styles.dateManualInput]} value={rateStart} onChangeText={setRateStart} placeholder="စတင်နေ့ YYYY-MM-DD" />
              <TextInput style={[styles.input, styles.dateManualInput]} value={rateEnd} onChangeText={setRateEnd} placeholder="ပြီးဆုံးနေ့ YYYY-MM-DD (optional)" />
            </View>
            <View style={styles.inlineBtns}>
              <Pressable style={styles.chipBtn} onPress={() => setRateEnd("")}>
                <Text style={styles.chipBtnText}>ပြီးဆုံးနေ့ Clear</Text>
              </Pressable>
            </View>
            <TextInput style={styles.input} value={rateReason} onChangeText={setRateReason} placeholder="အကြောင်းအရာ" />
            <Pressable style={styles.saveBtn} onPress={() => void addRate()}><Text style={styles.saveBtnText}>Save</Text></Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>ကင်းလွတ်/သက်သာ စည်းမျဉ်းများ ({reliefRules.length})</Text>
          {reliefRules.map((r) => <Text key={r.id} style={styles.meta}>- {r.scope === "member" ? `${memberNameById.get(String(r.memberId || "")) || "-"} (${r.memberId || "-"})` : r.scope === "position" ? `ရာထူး: ${ORG_POSITION_LABELS[normalizeOrgPosition(r.position || "member")]}` : "အားလုံး"} | {r.mode} | {r.effectiveFrom} ~ {r.effectiveTo || "-"}</Text>)}
        </View>

        {canEdit ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ကင်းလွတ်/သက်သာ အသစ်ထည့်ရန်</Text>
            <View style={styles.inlineBtns}>
              {(["global", "position", "member"] as MonthlyFeeRuleScope[]).map((scope) => (
                <Pressable
                  key={`relief-scope-${scope}`}
                  style={[styles.chipBtn, reliefScope === scope && styles.chipBtnActive]}
                  onPress={() => setReliefScope(scope)}
                >
                  <Text style={[styles.chipBtnText, reliefScope === scope && styles.chipBtnTextActive]}>
                    {scope === "global" ? "အားလုံး" : scope === "position" ? "ရာထူး" : "အသင်းဝင်"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {reliefScope === "position" ? (
              <View style={styles.inlineBtns}>
                {(["patron", "chairperson", "vice_chairperson", "secretary", "joint_secretary", "treasurer", "auditor", "committee_member", "member"] as OrgPosition[]).map((position) => (
                  <Pressable
                    key={`relief-position-${position}`}
                    style={[styles.chipBtn, reliefPosition === position && styles.chipBtnActive]}
                    onPress={() => setReliefPosition(position)}
                  >
                    <Text style={[styles.chipBtnText, reliefPosition === position && styles.chipBtnTextActive]}>{ORG_POSITION_LABELS[position]}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.inlineBtns}>
              {(["full", "percent", "fixed"] as MonthlyFeeReliefMode[]).map((mode) => (
                <Pressable
                  key={`relief-mode-${mode}`}
                  style={[styles.chipBtn, reliefMode === mode && styles.chipBtnActive]}
                  onPress={() => setReliefMode(mode)}
                >
                  <Text style={[styles.chipBtnText, reliefMode === mode && styles.chipBtnTextActive]}>
                    {mode === "full" ? "ကင်းလွတ်" : mode === "percent" ? "ရာခိုင်နှုန်း" : "ငွေပမာဏ"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.meta}>Scope: {reliefScope === "global" ? "အားလုံး" : reliefScope === "position" ? ORG_POSITION_LABELS[normalizeOrgPosition(reliefPosition)] : "အသင်းဝင်ရွေးချယ်ရန်"}</Text>
            {reliefScope === "member" ? (
              <View style={styles.selectorWrap}>
                <Pressable style={styles.toggleBtn} onPress={() => setReliefShowList(true)}>
                  <Text style={styles.toggleBtnText}>Member List ရွေးချယ်ရန် (Popup)</Text>
                </Pressable>
                <Text style={styles.meta}>
                  ရွေးထားသည်: {reliefMemberIds.map((id) => `${memberNameById.get(id) || "-"} (${id})`).join(", ") || "-"}
                </Text>
              </View>
            ) : null}
            <TextInput style={styles.input} value={reliefValue} onChangeText={setReliefValue} placeholder="တန်ဖိုး (full မဟုတ်လျှင်)" keyboardType="numeric" />
            <View style={styles.dateRow}>
              <Pressable style={styles.dateBtn} onPress={() => openDatePicker("reliefStart", reliefStart)}>
                <Text style={styles.dateBtnLabel}>စတင်နေ့</Text>
                <Text style={styles.dateBtnValue}>{reliefStart || "-"}</Text>
              </Pressable>
              <Pressable style={styles.dateBtn} onPress={() => openDatePicker("reliefEnd", reliefEnd || todayYmd())}>
                <Text style={styles.dateBtnLabel}>ပြီးဆုံးနေ့ (optional)</Text>
                <Text style={styles.dateBtnValue}>{reliefEnd || "ရွေးချယ်ရန်"}</Text>
              </Pressable>
            </View>
            <View style={styles.dateRow}>
              <TextInput style={[styles.input, styles.dateManualInput]} value={reliefStart} onChangeText={setReliefStart} placeholder="စတင်နေ့ YYYY-MM-DD" />
              <TextInput style={[styles.input, styles.dateManualInput]} value={reliefEnd} onChangeText={setReliefEnd} placeholder="ပြီးဆုံးနေ့ YYYY-MM-DD (optional)" />
            </View>
            <View style={styles.inlineBtns}>
              <Pressable style={styles.chipBtn} onPress={() => setReliefEnd("")}>
                <Text style={styles.chipBtnText}>ပြီးဆုံးနေ့ Clear</Text>
              </Pressable>
            </View>
            <TextInput style={styles.input} value={reliefReason} onChangeText={setReliefReason} placeholder="အကြောင်းအရာ" />
            <Pressable style={styles.saveBtn} onPress={() => void addRelief()}><Text style={styles.saveBtnText}>Save</Text></Pressable>
          </View>
        ) : null}

      </ScrollView>

      <Modal visible={rateShowList} transparent animationType="fade" onRequestClose={() => setRateShowList(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>အသင်းဝင်ရွေးချယ်ရန် (နှုန်းထား)</Text>
            <TextInput style={styles.input} value={rateSearch} onChangeText={setRateSearch} placeholder="ရှာရန် (ID / အမည်)" />
            <View style={styles.inlineBtns}>
              <Pressable style={styles.chipBtn} onPress={() => setRateMemberIds(filteredRateMembers.map((m) => m.id))}><Text style={styles.chipBtnText}>Select All</Text></Pressable>
              <Pressable style={styles.chipBtn} onPress={() => setRateMemberIds([])}><Text style={styles.chipBtnText}>Deselect All</Text></Pressable>
              <Pressable style={styles.chipBtn} onPress={() => setRateShowList(false)}><Text style={styles.chipBtnText}>ပိတ်မည်</Text></Pressable>
            </View>
            <ScrollView style={styles.memberListScroll}>
              {filteredRateMembers.map((m) => {
                const selected = rateMemberIds.includes(m.id);
                return (
                  <Pressable key={`rm-${m.id}`} style={styles.memberRow} onPress={() => setRateMemberIds((prev) => (selected ? prev.filter((id) => id !== m.id) : [...prev, m.id]))}>
                    <Text style={styles.meta}>{selected ? "☑" : "☐"} {m.name} ({m.id})</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={reliefShowList} transparent animationType="fade" onRequestClose={() => setReliefShowList(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>အသင်းဝင်ရွေးချယ်ရန် (ကင်းလွတ်/သက်သာ)</Text>
            <TextInput style={styles.input} value={reliefSearch} onChangeText={setReliefSearch} placeholder="ရှာရန် (ID / အမည်)" />
            <View style={styles.inlineBtns}>
              <Pressable style={styles.chipBtn} onPress={() => setReliefMemberIds(filteredReliefMembers.map((m) => m.id))}><Text style={styles.chipBtnText}>Select All</Text></Pressable>
              <Pressable style={styles.chipBtn} onPress={() => setReliefMemberIds([])}><Text style={styles.chipBtnText}>Deselect All</Text></Pressable>
              <Pressable style={styles.chipBtn} onPress={() => setReliefShowList(false)}><Text style={styles.chipBtnText}>ပိတ်မည်</Text></Pressable>
            </View>
            <ScrollView style={styles.memberListScroll}>
              {filteredReliefMembers.map((m) => {
                const selected = reliefMemberIds.includes(m.id);
                return (
                  <Pressable key={`rl-${m.id}`} style={styles.memberRow} onPress={() => setReliefMemberIds((prev) => (selected ? prev.filter((id) => id !== m.id) : [...prev, m.id]))}>
                    <Text style={styles.meta}>{selected ? "☑" : "☐"} {m.name} ({m.id})</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!dateFieldKey && Platform.OS === "ios"} transparent animationType="fade" onRequestClose={() => setDateFieldKey(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.dateModalCard}>
            <Text style={styles.modalTitle}>နေ့စွဲရွေးချယ်ရန်</Text>
            <DateTimePicker value={datePickerValue} mode="date" display="spinner" onChange={handleDateChange} />
            <View style={styles.inlineBtns}>
              <Pressable style={styles.chipBtn} onPress={() => setDateFieldKey(null)}>
                <Text style={styles.chipBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.chipBtn, styles.chipBtnActive]}
                onPress={() => {
                  if (!dateFieldKey) return;
                  applyDateToField(dateFieldKey, datePickerValue);
                  setDateFieldKey(null);
                }}
              >
                <Text style={[styles.chipBtnText, styles.chipBtnTextActive]}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={webDateEditorVisible && Platform.OS === "web"} transparent animationType="fade" onRequestClose={() => { setWebDateEditorVisible(false); setDateFieldKey(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.dateModalCard}>
            <Text style={styles.modalTitle}>နေ့စွဲရွေးချယ်ရန် (YYYY-MM-DD)</Text>
            <View style={{ marginBottom: 8 }}>
              <input
                type="date"
                value={webDateEditorValue}
                onChange={(event: any) => setWebDateEditorValue(String(event?.target?.value || ""))}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #D1D5DB",
                  fontSize: 16,
                  outline: "none",
                }}
              />
            </View>
            <TextInput style={styles.input} value={webDateEditorValue} onChangeText={setWebDateEditorValue} placeholder="YYYY-MM-DD" />
            <View style={styles.inlineBtns}>
              <Pressable style={styles.chipBtn} onPress={() => setWebDateEditorValue(todayYmd())}>
                <Text style={styles.chipBtnText}>Today</Text>
              </Pressable>
              <Pressable style={styles.chipBtn} onPress={() => { setWebDateEditorVisible(false); setDateFieldKey(null); }}>
                <Text style={styles.chipBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.chipBtn, styles.chipBtnActive]} onPress={applyWebDate}>
                <Text style={[styles.chipBtnText, styles.chipBtnTextActive]}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {dateFieldKey && Platform.OS === "android" ? (
        <DateTimePicker value={datePickerValue} mode="date" display="calendar" onChange={handleDateChange} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { padding: 16, paddingBottom: 32, gap: 10 },
  title: { fontSize: 28, fontWeight: "800", color: Colors.light.text },
  sub: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: "600" },
  card: { backgroundColor: "white", borderWidth: 1, borderColor: Colors.light.border, borderRadius: 12, padding: 12, gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: "800", color: Colors.light.text },
  meta: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: "600" },
  row: { borderWidth: 1, borderColor: "#FDE68A", backgroundColor: "#FFFBEB", borderRadius: 10, padding: 8, gap: 6 },
  inlineBtns: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallAction: { borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  smallActionText: { color: "white", fontSize: 12, fontWeight: "700" },
  saveBtn: { backgroundColor: Colors.light.tint, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  saveBtnText: { color: "white", fontWeight: "800" },
  input: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, color: Colors.light.text, backgroundColor: "white" },
  selectorWrap: { gap: 6 },
  dateRow: { flexDirection: "row", gap: 8 },
  dateBtn: { flex: 1, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "white" },
  dateBtnLabel: { fontSize: 11, fontWeight: "700", color: Colors.light.textSecondary },
  dateBtnValue: { fontSize: 14, fontWeight: "700", color: Colors.light.text, marginTop: 2 },
  dateManualInput: { flex: 1, marginBottom: 0 },
  toggleBtn: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, alignSelf: "flex-start", backgroundColor: "white" },
  toggleBtnText: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: "700" },
  chipBtn: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: "white" },
  chipBtnText: { color: Colors.light.textSecondary, fontSize: 12, fontWeight: "700" },
  chipBtnActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  chipBtnTextActive: { color: "white" },
  memberRow: { borderBottomWidth: 1, borderBottomColor: "#F1F5F9", paddingVertical: 7 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "white", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.light.border, maxHeight: "80%" },
  dateModalCard: { backgroundColor: "white", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.light.border },
  modalTitle: { fontSize: 17, fontWeight: "800", color: Colors.light.text, marginBottom: 8 },
  memberListScroll: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 8, backgroundColor: "white", maxHeight: 320 },
});

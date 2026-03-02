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
type GroupedRateRuleRow = {
  key: string;
  scope: MonthlyFeeRuleScope;
  amount: number;
  effectiveFrom: string;
  effectiveTo?: string;
  position?: OrgPosition;
  memberIds: string[];
  ruleIds: string[];
};
type GroupedReliefRuleRow = {
  key: string;
  scope: MonthlyFeeRuleScope;
  mode: MonthlyFeeReliefMode;
  value?: number;
  effectiveFrom: string;
  effectiveTo?: string;
  position?: OrgPosition;
  memberIds: string[];
  ruleIds: string[];
};

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

function MemberNamesReadMore({
  memberIds,
  memberNameById,
  prefix = "",
}: {
  memberIds: string[];
  memberNameById: Map<string, string>;
  prefix?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const labels = useMemo(
    () =>
      memberIds
        .map((id) => String(id || "").trim())
        .filter(Boolean)
        .map((id) => `${memberNameById.get(id) || "-"} (${id})`),
    [memberIds, memberNameById]
  );
  const maxCollapsed = 4;
  const visible = expanded ? labels : labels.slice(0, maxCollapsed);
  const remaining = Math.max(0, labels.length - visible.length);

  return (
    <View style={styles.readMoreWrap}>
      <Text style={styles.meta}>
        {prefix}
        {visible.join(", ") || "-"}
        {!expanded && remaining > 0 ? ` ... (+${remaining} ဦး)` : ""}
      </Text>
      {labels.length > maxCollapsed ? (
        <Pressable onPress={() => setExpanded((prev) => !prev)} style={styles.readMoreBtn}>
          <Text style={styles.readMoreText}>{expanded ? "Show less" : "Read more..."}</Text>
        </Pressable>
      ) : null}
    </View>
  );
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
  const groupedRateRules = useMemo<GroupedRateRuleRow[]>(() => {
    const map = new Map<string, GroupedRateRuleRow>();
    rateRules.forEach((row) => {
      const scope = row.scope === "member" || row.scope === "position" || row.scope === "global" ? row.scope : "global";
      if (scope !== "member") {
        map.set(`single-${row.id}`, {
          key: `single-${row.id}`,
          scope,
          amount: Number(row.amount || 0),
          effectiveFrom: String(row.effectiveFrom || ""),
          effectiveTo: row.effectiveTo,
          position: row.position,
          memberIds: [],
          ruleIds: [String(row.id || "")],
        });
        return;
      }
      const key = [
        scope,
        Number(row.amount || 0),
        String(row.effectiveFrom || ""),
        String(row.effectiveTo || ""),
        String(row.position || ""),
      ].join("|");
      const memberId = String(row.memberId || "").trim();
      const existing = map.get(key);
      if (existing) {
        if (memberId && !existing.memberIds.includes(memberId)) existing.memberIds.push(memberId);
        if (row.id && !existing.ruleIds.includes(String(row.id))) existing.ruleIds.push(String(row.id));
      } else {
        map.set(key, {
          key,
          scope,
          amount: Number(row.amount || 0),
          effectiveFrom: String(row.effectiveFrom || ""),
          effectiveTo: row.effectiveTo,
          position: row.position,
          memberIds: memberId ? [memberId] : [],
          ruleIds: row.id ? [String(row.id)] : [],
        });
      }
    });
    return Array.from(map.values());
  }, [rateRules]);
  const groupedReliefRules = useMemo<GroupedReliefRuleRow[]>(() => {
    const map = new Map<string, GroupedReliefRuleRow>();
    reliefRules.forEach((row) => {
      const scope = row.scope === "member" || row.scope === "position" || row.scope === "global" ? row.scope : "global";
      if (scope !== "member") {
        map.set(`single-${row.id}`, {
          key: `single-${row.id}`,
          scope,
          mode: row.mode,
          value: row.value,
          effectiveFrom: String(row.effectiveFrom || ""),
          effectiveTo: row.effectiveTo,
          position: row.position,
          memberIds: [],
          ruleIds: [String(row.id || "")],
        });
        return;
      }
      const key = [
        scope,
        String(row.mode || ""),
        Number(row.value || 0),
        String(row.effectiveFrom || ""),
        String(row.effectiveTo || ""),
        String(row.position || ""),
      ].join("|");
      const memberId = String(row.memberId || "").trim();
      const existing = map.get(key);
      if (existing) {
        if (memberId && !existing.memberIds.includes(memberId)) existing.memberIds.push(memberId);
        if (row.id && !existing.ruleIds.includes(String(row.id))) existing.ruleIds.push(String(row.id));
      } else {
        map.set(key, {
          key,
          scope,
          mode: row.mode,
          value: row.value,
          effectiveFrom: String(row.effectiveFrom || ""),
          effectiveTo: row.effectiveTo,
          position: row.position,
          memberIds: memberId ? [memberId] : [],
          ruleIds: row.id ? [String(row.id)] : [],
        });
      }
    });
    return Array.from(map.values());
  }, [reliefRules]);

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
  const [editingRateRuleIds, setEditingRateRuleIds] = useState<string[]>([]);
  const [editingReliefRuleIds, setEditingReliefRuleIds] = useState<string[]>([]);
  const [rateDetailRow, setRateDetailRow] = useState<GroupedRateRuleRow | null>(null);
  const [reliefDetailRow, setReliefDetailRow] = useState<GroupedReliefRuleRow | null>(null);

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
  const detailRateRules = useMemo(
    () => (rateDetailRow ? rateRules.filter((row) => rateDetailRow.ruleIds.includes(String(row.id || ""))) : []),
    [rateDetailRow, rateRules]
  );
  const detailReliefRules = useMemo(
    () => (reliefDetailRow ? reliefRules.filter((row) => reliefDetailRow.ruleIds.includes(String(row.id || ""))) : []),
    [reliefDetailRow, reliefRules]
  );

  const resetRateEditor = useCallback(() => {
    setEditingRateRuleIds([]);
    setRateScope("global");
    setRatePosition("patron");
    setRateMemberIds([]);
    setRateAmount("");
    setRateStart(todayYmd());
    setRateEnd("");
    setRateReason("");
  }, []);

  const resetReliefEditor = useCallback(() => {
    setEditingReliefRuleIds([]);
    setReliefScope("global");
    setReliefPosition("patron");
    setReliefMemberIds([]);
    setReliefMode("full");
    setReliefValue("");
    setReliefStart(todayYmd());
    setReliefEnd("");
    setReliefReason("");
  }, []);

  const beginEditRateGroup = useCallback((group: GroupedRateRuleRow) => {
    const first = rateRules.find((row) => group.ruleIds.includes(String(row.id || "")));
    if (!first) return;
    setEditingRateRuleIds(group.ruleIds);
    setRateScope(group.scope);
    setRatePosition(normalizeOrgPosition(group.position || first.position || "patron"));
    setRateMemberIds(group.scope === "member" ? group.memberIds : []);
    setRateAmount(String(Number(group.amount || 0)));
    setRateStart(String(group.effectiveFrom || ""));
    setRateEnd(String(group.effectiveTo || ""));
    setRateReason(String(first.reason || ""));
    setRateDetailRow(null);
    Alert.alert("ပြင်ဆင်မည်", "အောက်က နှုန်းထား form တွင်ပြင်ပြီး Update နှိပ်ပါ။");
  }, [rateRules]);

  const beginEditReliefGroup = useCallback((group: GroupedReliefRuleRow) => {
    const first = reliefRules.find((row) => group.ruleIds.includes(String(row.id || "")));
    if (!first) return;
    setEditingReliefRuleIds(group.ruleIds);
    setReliefScope(group.scope);
    setReliefPosition(normalizeOrgPosition(group.position || first.position || "patron"));
    setReliefMemberIds(group.scope === "member" ? group.memberIds : []);
    setReliefMode(group.mode);
    setReliefValue(group.mode === "full" ? "" : String(Number(group.value || 0)));
    setReliefStart(String(group.effectiveFrom || ""));
    setReliefEnd(String(group.effectiveTo || ""));
    setReliefReason(String(first.reason || ""));
    setReliefDetailRow(null);
    Alert.alert("ပြင်ဆင်မည်", "အောက်က ကင်းလွတ်/သက်သာ form တွင်ပြင်ပြီး Update နှိပ်ပါ။");
  }, [reliefRules]);

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
    const isEditing = editingRateRuleIds.length > 0;
    const amount = Math.max(0, Number(rateAmount || 0));
    if (!amount || !rateStart.trim()) return Alert.alert("လိုအပ်ချက်", "နှုန်းထားနှင့် စတင်နေ့ ထည့်ပါ။");
    const targets = rateScope === "member" ? rateMemberIds : [""];
    if (rateScope === "member" && targets.length === 0) return Alert.alert("လိုအပ်ချက်", "အသင်းဝင်ရွေးချယ်ပါ။");
    const now = new Date().toISOString();
    const editableRules = rateRules.filter((row) => editingRateRuleIds.includes(String(row.id || "")));
    const editableByMember = new Map<string, string>();
    editableRules.forEach((row) => editableByMember.set(String(row.memberId || ""), String(row.id || "")));
    const rules = targets.map((id) => ({
      id:
        editableByMember.get(String(id || "")) ||
        (editingRateRuleIds[0] && targets.length === 1 ? editingRateRuleIds[0] : requestId("fee-rate")),
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
      const keptRates = isEditing
        ? rateRules.filter((row) => !editingRateRuleIds.includes(String(row.id || "")))
        : rateRules;
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
      await persist([...keptRates, ...rules], reliefRules, [...policyRequests, ...approved]);
    } else {
      const pendingDeletes = isEditing
        ? editingRateRuleIds.map((targetRuleId) => ({
            id: requestId("fee-policy-req"),
            policyType: "rate_rule" as const,
            action: "delete" as const,
            targetRuleId,
            payload: editableRules.find((row) => String(row.id || "") === String(targetRuleId)) || rules[0],
            status: "pending_chair_approval" as const,
            createdByUserId: String(currentUser.id),
            createdByMemberId: String(currentUser.memberId || "") || undefined,
            createdByRole: role,
            createdAt: now,
          }))
        : [];
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
      await persist(rateRules, reliefRules, [...policyRequests, ...pendingDeletes, ...pending]);
      Alert.alert("တင်ပြပြီးပါပြီ", isEditing ? "ပြင်ဆင်ချက်ကို ဥက္ကဌအတည်ပြုပြီးမှ အသက်ဝင်ပါမည်။" : "ဥက္ကဌ အတည်ပြုချက်ရပြီးမှ အသက်ဝင်ပါမည်။");
    }
    resetRateEditor();
  }, [canEdit, currentUser, editingRateRuleIds, rateAmount, rateStart, rateScope, rateMemberIds, rateEnd, ratePosition, rateReason, isChair, role, persist, rateRules, reliefRules, policyRequests, resetRateEditor]);

  const addRelief = useCallback(async () => {
    if (!canEdit || !currentUser?.id) return;
    const isEditing = editingReliefRuleIds.length > 0;
    if (!reliefStart.trim()) return Alert.alert("လိုအပ်ချက်", "စတင်နေ့ ထည့်ပါ။");
    if (reliefMode !== "full" && Math.max(0, Number(reliefValue || 0)) <= 0) return Alert.alert("လိုအပ်ချက်", "ကင်းလွတ်/သက်သာတန်ဖိုး ထည့်ပါ။");
    const targets = reliefScope === "member" ? reliefMemberIds : [""];
    if (reliefScope === "member" && targets.length === 0) return Alert.alert("လိုအပ်ချက်", "အသင်းဝင်ရွေးချယ်ပါ။");
    const now = new Date().toISOString();
    const editableRules = reliefRules.filter((row) => editingReliefRuleIds.includes(String(row.id || "")));
    const editableByMember = new Map<string, string>();
    editableRules.forEach((row) => editableByMember.set(String(row.memberId || ""), String(row.id || "")));
    const rules = targets.map((id) => ({
      id:
        editableByMember.get(String(id || "")) ||
        (editingReliefRuleIds[0] && targets.length === 1 ? editingReliefRuleIds[0] : requestId("fee-relief")),
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
      const keptReliefs = isEditing
        ? reliefRules.filter((row) => !editingReliefRuleIds.includes(String(row.id || "")))
        : reliefRules;
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
      await persist(rateRules, [...keptReliefs, ...rules], [...policyRequests, ...approved]);
    } else {
      const pendingDeletes = isEditing
        ? editingReliefRuleIds.map((targetRuleId) => ({
            id: requestId("fee-policy-req"),
            policyType: "relief_rule" as const,
            action: "delete" as const,
            targetRuleId,
            payload: editableRules.find((row) => String(row.id || "") === String(targetRuleId)) || rules[0],
            status: "pending_chair_approval" as const,
            createdByUserId: String(currentUser.id),
            createdByMemberId: String(currentUser.memberId || "") || undefined,
            createdByRole: role,
            createdAt: now,
          }))
        : [];
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
      await persist(rateRules, reliefRules, [...policyRequests, ...pendingDeletes, ...pending]);
      Alert.alert("တင်ပြပြီးပါပြီ", isEditing ? "ပြင်ဆင်ချက်ကို ဥက္ကဌအတည်ပြုပြီးမှ အသက်ဝင်ပါမည်။" : "ဥက္ကဌ အတည်ပြုချက်ရပြီးမှ အသက်ဝင်ပါမည်။");
    }
    resetReliefEditor();
  }, [canEdit, currentUser, editingReliefRuleIds, reliefStart, reliefMode, reliefValue, reliefScope, reliefMemberIds, reliefEnd, reliefPosition, reliefReason, isChair, role, persist, rateRules, reliefRules, policyRequests, resetReliefEditor]);

  const approvePending = useCallback(async (req: MonthlyFeePolicyRequest, approve: boolean) => {
    if (!isChair || !currentUser?.id) return;
    let nextRates = [...rateRules];
    let nextReliefs = [...reliefRules];
    if (approve && req.policyType === "rate_rule" && req.action === "create") {
      const payload = req.payload as MonthlyFeeRateRule;
      nextRates = [...nextRates.filter((row) => String(row.id || "") !== String(payload.id || "")), payload];
    }
    if (approve && req.policyType === "rate_rule" && req.action === "delete" && req.targetRuleId) {
      nextRates = nextRates.filter((row) => String(row.id || "") !== String(req.targetRuleId || ""));
    }
    if (approve && req.policyType === "relief_rule" && req.action === "create") {
      const payload = req.payload as MonthlyFeeReliefRule;
      nextReliefs = [...nextReliefs.filter((row) => String(row.id || "") !== String(payload.id || "")), payload];
    }
    if (approve && req.policyType === "relief_rule" && req.action === "delete" && req.targetRuleId) {
      nextReliefs = nextReliefs.filter((row) => String(row.id || "") !== String(req.targetRuleId || ""));
    }
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
          {groupedRateRules.map((r) => (
            <Pressable key={r.key} style={styles.ruleRowPressable} onPress={() => setRateDetailRow(r)}>
              <Text style={styles.meta}>
                - {r.scope === "position" ? `ရာထူး: ${ORG_POSITION_LABELS[normalizeOrgPosition(r.position || "member")]}` : r.scope === "global" ? "အားလုံး" : `အသင်းဝင် (${r.memberIds.length})`}
                {" | "}
                {Number(r.amount || 0).toLocaleString()} KS
                {" | "}
                {r.effectiveFrom} ~ {r.effectiveTo || "-"}
              </Text>
              {r.scope === "member" ? <MemberNamesReadMore prefix="  အသင်းဝင်: " memberIds={r.memberIds} memberNameById={memberNameById} /> : null}
              <Text style={styles.ruleTapHint}>အသေးစိတ်ကြည့်ရန် / ပြင်ဆင်ရန်</Text>
            </Pressable>
          ))}
        </View>

        {canEdit ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{editingRateRuleIds.length > 0 ? "နှုန်းထား ပြင်ဆင်ရန်" : "နှုန်းထားအသစ် ထည့်ရန်"}</Text>
            {editingRateRuleIds.length > 0 ? <Text style={styles.meta}>Edit Mode ({editingRateRuleIds.length}) - ပြင်ပြီး Update နှိပ်ပါ။</Text> : null}
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
                  ရွေးထားသည် ({rateMemberIds.length})
                </Text>
                <MemberNamesReadMore memberIds={rateMemberIds} memberNameById={memberNameById} />
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
            <View style={styles.inlineBtns}>
              <Pressable style={styles.saveBtn} onPress={() => void addRate()}><Text style={styles.saveBtnText}>{editingRateRuleIds.length > 0 ? "Update" : "Save"}</Text></Pressable>
              {editingRateRuleIds.length > 0 ? (
                <Pressable style={styles.cancelBtn} onPress={resetRateEditor}>
                  <Text style={styles.cancelBtnText}>Cancel Edit</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>ကင်းလွတ်/သက်သာ စည်းမျဉ်းများ ({reliefRules.length})</Text>
          {groupedReliefRules.map((r) => (
            <Pressable key={r.key} style={styles.ruleRowPressable} onPress={() => setReliefDetailRow(r)}>
              <Text style={styles.meta}>
                - {r.scope === "position" ? `ရာထူး: ${ORG_POSITION_LABELS[normalizeOrgPosition(r.position || "member")]}` : r.scope === "global" ? "အားလုံး" : `အသင်းဝင် (${r.memberIds.length})`}
                {" | "}
                {r.mode === "full" ? "ကင်းလွတ်" : r.mode === "percent" ? `${Number(r.value || 0)}% သက်သာ` : `${Number(r.value || 0).toLocaleString()} KS သက်သာ`}
                {" | "}
                {r.effectiveFrom} ~ {r.effectiveTo || "-"}
              </Text>
              {r.scope === "member" ? <MemberNamesReadMore prefix="  အသင်းဝင်: " memberIds={r.memberIds} memberNameById={memberNameById} /> : null}
              <Text style={styles.ruleTapHint}>အသေးစိတ်ကြည့်ရန် / ပြင်ဆင်ရန်</Text>
            </Pressable>
          ))}
        </View>

        {canEdit ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{editingReliefRuleIds.length > 0 ? "ကင်းလွတ်/သက်သာ ပြင်ဆင်ရန်" : "ကင်းလွတ်/သက်သာ အသစ်ထည့်ရန်"}</Text>
            {editingReliefRuleIds.length > 0 ? <Text style={styles.meta}>Edit Mode ({editingReliefRuleIds.length}) - ပြင်ပြီး Update နှိပ်ပါ။</Text> : null}
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
                  ရွေးထားသည် ({reliefMemberIds.length})
                </Text>
                <MemberNamesReadMore memberIds={reliefMemberIds} memberNameById={memberNameById} />
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
            <View style={styles.inlineBtns}>
              <Pressable style={styles.saveBtn} onPress={() => void addRelief()}><Text style={styles.saveBtnText}>{editingReliefRuleIds.length > 0 ? "Update" : "Save"}</Text></Pressable>
              {editingReliefRuleIds.length > 0 ? (
                <Pressable style={styles.cancelBtn} onPress={resetReliefEditor}>
                  <Text style={styles.cancelBtnText}>Cancel Edit</Text>
                </Pressable>
              ) : null}
            </View>
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

      <Modal visible={!!rateDetailRow} transparent animationType="fade" onRequestClose={() => setRateDetailRow(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>နှုန်းထား စည်းမျဉ်း အသေးစိတ်</Text>
            <ScrollView style={styles.memberListScroll}>
              {detailRateRules.map((row, idx) => (
                <View key={`dr-${row.id}-${idx}`} style={styles.ruleDetailItem}>
                  <Text style={styles.meta}>{idx + 1}. {row.scope === "member" ? `${memberNameById.get(String(row.memberId || "")) || "-"} (${row.memberId || "-"})` : row.scope === "position" ? `ရာထူး: ${ORG_POSITION_LABELS[normalizeOrgPosition(row.position || "member")]}` : "အားလုံး"}</Text>
                  <Text style={styles.meta}>နှုန်းထား: {Number(row.amount || 0).toLocaleString()} KS</Text>
                  <Text style={styles.meta}>ကာလ: {row.effectiveFrom} ~ {row.effectiveTo || "-"}</Text>
                  {row.reason ? <Text style={styles.meta}>အကြောင်းအရာ: {row.reason}</Text> : null}
                </View>
              ))}
            </ScrollView>
            <View style={styles.inlineBtns}>
              {canEdit ? (
                <Pressable style={[styles.chipBtn, styles.chipBtnActive]} onPress={() => rateDetailRow && beginEditRateGroup(rateDetailRow)}>
                  <Text style={[styles.chipBtnText, styles.chipBtnTextActive]}>ပြင်ဆင်ရန်</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.chipBtn} onPress={() => setRateDetailRow(null)}>
                <Text style={styles.chipBtnText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!reliefDetailRow} transparent animationType="fade" onRequestClose={() => setReliefDetailRow(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>ကင်းလွတ်/သက်သာ စည်းမျဉ်း အသေးစိတ်</Text>
            <ScrollView style={styles.memberListScroll}>
              {detailReliefRules.map((row, idx) => (
                <View key={`drl-${row.id}-${idx}`} style={styles.ruleDetailItem}>
                  <Text style={styles.meta}>{idx + 1}. {row.scope === "member" ? `${memberNameById.get(String(row.memberId || "")) || "-"} (${row.memberId || "-"})` : row.scope === "position" ? `ရာထူး: ${ORG_POSITION_LABELS[normalizeOrgPosition(row.position || "member")]}` : "အားလုံး"}</Text>
                  <Text style={styles.meta}>အမျိုးအစား: {row.mode === "full" ? "ကင်းလွတ်" : row.mode === "percent" ? `${Number(row.value || 0)}% သက်သာ` : `${Number(row.value || 0).toLocaleString()} KS သက်သာ`}</Text>
                  <Text style={styles.meta}>ကာလ: {row.effectiveFrom} ~ {row.effectiveTo || "-"}</Text>
                  {row.reason ? <Text style={styles.meta}>အကြောင်းအရာ: {row.reason}</Text> : null}
                </View>
              ))}
            </ScrollView>
            <View style={styles.inlineBtns}>
              {canEdit ? (
                <Pressable style={[styles.chipBtn, styles.chipBtnActive]} onPress={() => reliefDetailRow && beginEditReliefGroup(reliefDetailRow)}>
                  <Text style={[styles.chipBtnText, styles.chipBtnTextActive]}>ပြင်ဆင်ရန်</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.chipBtn} onPress={() => setReliefDetailRow(null)}>
                <Text style={styles.chipBtnText}>Close</Text>
              </Pressable>
            </View>
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
  cancelBtn: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, alignItems: "center", backgroundColor: "white" },
  cancelBtnText: { color: Colors.light.textSecondary, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, color: Colors.light.text, backgroundColor: "white" },
  selectorWrap: { gap: 6 },
  ruleRow: { gap: 4 },
  ruleRowPressable: { gap: 4, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 8, backgroundColor: "#F8FAFC" },
  ruleTapHint: { color: Colors.light.tint, fontSize: 11, fontWeight: "700" },
  ruleDetailItem: { borderBottomWidth: 1, borderBottomColor: "#EEF2F7", paddingVertical: 8, gap: 2 },
  readMoreWrap: { gap: 4 },
  readMoreBtn: { alignSelf: "flex-start" },
  readMoreText: { color: Colors.light.tint, fontSize: 12, fontWeight: "700" },
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

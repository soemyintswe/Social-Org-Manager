import React, { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import AccessDenied from "../../components/AccessDenied";
import Colors from "../../constants/colors";
import { useAuth } from "../../lib/AuthContext";
import { useData } from "../../lib/DataContext";
import { isCommitteePosition } from "../../lib/access-control";
import { secureRandomToken } from "../../lib/secure-random";
import {
  MonthlyFeePolicyRequest,
  MonthlyFeeRateRule,
  MonthlyFeeReliefRule,
  MonthlyFeeReliefMode,
  MonthlyFeeRuleScope,
  ORG_POSITION_LABELS,
  normalizeOrgPosition,
  type OrgPosition,
} from "../../lib/types";

type MemberOption = { id: string; name: string };
type DateFieldKey = "detailStart" | "detailEnd" | "rateStart" | "rateEnd" | "reliefStart" | "reliefEnd";
type MonthlyFeesTab = "details" | "policy";
type ViewScope = "all" | "self" | "member";
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
type FeeDetailSummaryRow = {
  memberId: string;
  memberName: string;
  dueTotal: number;
  paidTotal: number;
  unpaidTotal: number;
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

function parseDateMs(dateValue: unknown): number {
  const text = String(dateValue || "").trim();
  if (!text) return 0;
  const direct = new Date(text).getTime();
  if (Number.isFinite(direct)) return direct;
  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const yy = Number(dmy[3]);
    const year = yy < 100 ? 2000 + yy : yy;
    return new Date(year, month - 1, day).getTime();
  }
  return 0;
}

function monthStart(year: number, monthIdx: number): Date {
  return new Date(year, monthIdx, 1, 0, 0, 0, 0);
}

function monthEnd(year: number, monthIdx: number): Date {
  return new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);
}

function monthKey(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
}

function requestId(prefix: string) {
  return `${prefix}-${Date.now()}-${secureRandomToken(6)}`;
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
  const router = useRouter();
  const { accountSettings, updateAccountSettings, members = [], transactions = [] } = useData() as any;
  const { currentUser, currentMember } = useAuth();
  const isSystemAdmin = currentUser?.systemRole === "admin";

  const canView =
    !isSystemAdmin &&
    isCommitteePosition(currentMember?.orgPosition || currentUser?.orgPosition);
  const role = normalizeOrgPosition(currentMember?.orgPosition || currentUser?.orgPosition || "member");
  const isTreasurer = role === "treasurer";
  const isChair = role === "chairperson";
  const canEdit = isTreasurer || isChair;
  const canViewAllDetails = !isSystemAdmin && isCommitteePosition(currentMember?.orgPosition || currentUser?.orgPosition);

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
  const [activeTab, setActiveTab] = useState<MonthlyFeesTab>("details");
  const [viewScope, setViewScope] = useState<ViewScope>("all");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [detailStart, setDetailStart] = useState("2018-01-01");
  const [detailEnd, setDetailEnd] = useState(todayYmd());

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
  const filteredScopeMembers = useMemo(() => {
    const needle = memberSearch.trim().toLowerCase();
    if (!needle) return memberOptions;
    return memberOptions.filter((m) => m.id.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle));
  }, [memberOptions, memberSearch]);
  const scopedMemberId = useMemo(() => {
    if (viewScope === "all") return null;
    if (viewScope === "self") return String(currentUser?.memberId || "").trim() || "__none__";
    return String(selectedMemberId || "").trim() || "__none__";
  }, [viewScope, currentUser?.memberId, selectedMemberId]);
  const scopedMembers = useMemo(() => {
    if (scopedMemberId === null) return members;
    if (scopedMemberId === "__none__") return [];
    return (members || []).filter((m: any) => String(m?.id || "") === scopedMemberId);
  }, [members, scopedMemberId]);
  const detailTransactions = useMemo(() => {
    const startMs = parseDateMs(detailStart) || parseDateMs("2018-01-01");
    const endMs = parseDateMs(detailEnd) || Date.now();
    const endBoundary = new Date(endMs);
    endBoundary.setHours(23, 59, 59, 999);
    return (transactions || [])
      .filter((t: any) => String(t?.category || "") === "member_fees")
      .filter((t: any) => {
        const tDateMs = parseDateMs(String(t?.date || ""));
        if (!Number.isFinite(tDateMs) || tDateMs <= 0) return false;
        if (tDateMs < startMs || tDateMs > endBoundary.getTime()) return false;
        if (scopedMemberId === null) return true;
        if (scopedMemberId === "__none__") return false;
        return String(t?.memberId || "").trim() === scopedMemberId;
      })
      .sort((a: any, b: any) => parseDateMs(String(b?.date || "")) - parseDateMs(String(a?.date || "")));
  }, [transactions, detailStart, detailEnd, scopedMemberId]);
  const memberFeePaidAmountByMonthMap = useMemo(() => {
    const map = new Map<string, number>();
    const addAmount = (memberId: string, year: number, monthIdx: number, amount: number) => {
      if (!memberId || !Number.isFinite(amount) || amount <= 0) return;
      const key = `${memberId}|${year}|${monthIdx}`;
      map.set(key, (map.get(key) || 0) + amount);
    };
    detailTransactions.forEach((t: any) => {
      const memberId = String(t?.memberId || "").trim();
      const amount = Math.max(0, Math.round(Number(t?.amount || 0)));
      if (!memberId || amount <= 0) return;

      if (t?.feePeriodStart && t?.feePeriodEnd) {
        const start = ymdToDate(String(t.feePeriodStart));
        const end = ymdToDate(String(t.feePeriodEnd));
        const s = start.getTime() <= end.getTime() ? start : end;
        const e = start.getTime() <= end.getTime() ? end : start;
        const months: { year: number; monthIdx: number }[] = [];
        let cursor = monthStart(s.getFullYear(), s.getMonth());
        const boundary = monthStart(e.getFullYear(), e.getMonth());
        while (cursor <= boundary) {
          months.push({ year: cursor.getFullYear(), monthIdx: cursor.getMonth() });
          cursor = monthStart(cursor.getFullYear(), cursor.getMonth() + 1);
        }
        if (months.length > 0) {
          const perMonth = Math.floor(amount / months.length);
          let remainder = amount - perMonth * months.length;
          months.forEach((m) => {
            const add = perMonth + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder -= 1;
            addAmount(memberId, m.year, m.monthIdx, add);
          });
          return;
        }
      }

      const txDate = ymdToDate(String(t?.date || ""));
      addAmount(memberId, txDate.getFullYear(), txDate.getMonth(), amount);
    });
    return map;
  }, [detailTransactions]);
  const monthlyFeeSummaryRows = useMemo<FeeDetailSummaryRow[]>(() => {
    const startMs = parseDateMs(detailStart) || parseDateMs("2018-01-01");
    const endMs = parseDateMs(detailEnd) || Date.now();
    const rangeStart = monthStart(new Date(startMs).getFullYear(), new Date(startMs).getMonth());
    const rangeEnd = monthStart(new Date(endMs).getFullYear(), new Date(endMs).getMonth());
    const months: { year: number; monthIdx: number; key: string }[] = [];
    let cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      months.push({ year: cursor.getFullYear(), monthIdx: cursor.getMonth(), key: monthKey(cursor.getFullYear(), cursor.getMonth()) });
      cursor = monthStart(cursor.getFullYear(), cursor.getMonth() + 1);
    }

    const scopeWeight = (scope: MonthlyFeeRuleScope) => (scope === "member" ? 3 : scope === "position" ? 2 : 1);
    const defaultRate = 2500;

    const resolvePositionInMonth = (member: any, year: number, monthIdx: number): OrgPosition => {
      const fallback = normalizeOrgPosition(member?.orgPosition || "member");
      const monthEndMs = monthEnd(year, monthIdx).getTime();
      const history = Array.isArray(member?.orgPositionHistory) ? member.orgPositionHistory : [];
      const candidates = history
        .map((row: any) => ({
          position: normalizeOrgPosition(row?.position || fallback),
          dateMs: parseDateMs(row?.effectiveDate || row?.assignedAt || row?.date || ""),
        }))
        .filter((row: any) => Number.isFinite(row.dateMs) && row.dateMs > 0 && row.dateMs <= monthEndMs)
        .sort((a: any, b: any) => b.dateMs - a.dateMs);
      return candidates[0]?.position || fallback;
    };

    const resolveDue = (member: any, year: number, monthIdx: number): number => {
      const monthStartMs = monthStart(year, monthIdx).getTime();
      const monthEndMs = monthEnd(year, monthIdx).getTime();
      const joinMs = parseDateMs(member?.joinDate || member?.createdAt || "2018-01-01") || parseDateMs("2018-01-01");
      const joinMonthStartMs = monthStart(new Date(joinMs).getFullYear(), new Date(joinMs).getMonth()).getTime();
      if (monthStartMs < joinMonthStartMs) return 0;

      const status = String(member?.status || "active").toLowerCase();
      if (["resigned", "deceased", "expelled", "suspended"].includes(status)) {
        const exitMs = parseDateMs(member?.statusDate || member?.resignDate || "");
        if (exitMs > 0) {
          const exitMonthStartMs = monthStart(new Date(exitMs).getFullYear(), new Date(exitMs).getMonth()).getTime();
          if (monthStartMs > exitMonthStartMs) return 0;
        }
      }

      const memberPosition = resolvePositionInMonth(member, year, monthIdx);
      const applicableRates = (rateRules || [])
        .filter((rule) => rule.active !== false)
        .filter((rule) => {
          const fromMs = parseDateMs(rule.effectiveFrom);
          const toMs = rule.effectiveTo ? parseDateMs(rule.effectiveTo) : Number.POSITIVE_INFINITY;
          if (fromMs > monthEndMs) return false;
          if (Number.isFinite(toMs) && toMs < monthStartMs) return false;
          if (rule.scope === "member") return String(rule.memberId || "") === String(member?.id || "");
          if (rule.scope === "position") return !!rule.position && normalizeOrgPosition(rule.position) === memberPosition;
          return true;
        })
        .sort((a, b) => {
          const scopeDiff = scopeWeight(b.scope) - scopeWeight(a.scope);
          if (scopeDiff !== 0) return scopeDiff;
          return parseDateMs(b.effectiveFrom) - parseDateMs(a.effectiveFrom);
        });
      const baseRate = Math.max(0, Number(applicableRates[0]?.amount ?? defaultRate));
      if (baseRate <= 0) return 0;

      const applicableReliefs = (reliefRules || [])
        .filter((rule) => rule.active !== false)
        .filter((rule) => {
          const fromMs = parseDateMs(rule.effectiveFrom);
          const toMs = rule.effectiveTo ? parseDateMs(rule.effectiveTo) : Number.POSITIVE_INFINITY;
          if (fromMs > monthEndMs) return false;
          if (Number.isFinite(toMs) && toMs < monthStartMs) return false;
          if (rule.scope === "member") return String(rule.memberId || "") === String(member?.id || "");
          if (rule.scope === "position") return !!rule.position && normalizeOrgPosition(rule.position) === memberPosition;
          return true;
        })
        .sort((a, b) => {
          const scopeDiff = scopeWeight(b.scope) - scopeWeight(a.scope);
          if (scopeDiff !== 0) return scopeDiff;
          return parseDateMs(b.effectiveFrom) - parseDateMs(a.effectiveFrom);
        });

      const relief = applicableReliefs[0];
      if (!relief) return Math.round(baseRate);
      if (relief.mode === "full") return 0;
      if (relief.mode === "percent") {
        const percent = Math.min(100, Math.max(0, Number(relief.value || 0)));
        return Math.max(0, Math.round(baseRate * (1 - percent / 100)));
      }
      const fixed = Math.max(0, Number(relief.value || 0));
      return Math.max(0, Math.round(baseRate - fixed));
    };

    const rows: FeeDetailSummaryRow[] = (scopedMembers || []).map((member: any) => {
      let dueTotal = 0;
      let paidTotal = 0;
      months.forEach((m) => {
        const due = resolveDue(member, m.year, m.monthIdx);
        dueTotal += due;
        paidTotal += Number(memberFeePaidAmountByMonthMap.get(`${member.id}|${m.year}|${m.monthIdx}`) || 0);
      });
      return {
        memberId: String(member?.id || ""),
        memberName: String(member?.name || "-"),
        dueTotal,
        paidTotal,
        unpaidTotal: Math.max(0, dueTotal - paidTotal),
      };
    });

    return rows
      .filter((row: FeeDetailSummaryRow) => row.dueTotal > 0 || row.paidTotal > 0)
      .sort((a: FeeDetailSummaryRow, b: FeeDetailSummaryRow) => Number(b.unpaidTotal || 0) - Number(a.unpaidTotal || 0));
  }, [detailStart, detailEnd, scopedMembers, memberFeePaidAmountByMonthMap, rateRules, reliefRules]);
  const totalOutstanding = useMemo(
    () => monthlyFeeSummaryRows.reduce((sum, row) => sum + Number(row.unpaidTotal || 0), 0),
    [monthlyFeeSummaryRows]
  );
  const outstandingRows = useMemo(
    () => monthlyFeeSummaryRows.filter((row) => row.unpaidTotal > 0).slice(0, 40),
    [monthlyFeeSummaryRows]
  );
  const displayTransactions = useMemo(() => detailTransactions.slice(0, 120), [detailTransactions]);

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
    if (key === "detailStart") setDetailStart(ymd);
    if (key === "detailEnd") setDetailEnd(ymd);
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
        <Text style={styles.sub}>ကြည့်ရှုခွင့်: ကော်မတီဝင်များ | ပြင်ဆင်ခွင့်: ဘဏ္ဍာရေးမှူး + ဥက္ကဌ | ဘဏ္ဍာရေးမှူးပြင်ဆင်မှုများသည် ဥက္ကဌအတည်ပြုမှ အသက်ဝင်မည်။</Text>

        <View style={styles.inlineBtns}>
          <Pressable style={[styles.chipBtn, activeTab === "details" && styles.chipBtnActive]} onPress={() => setActiveTab("details")}>
            <Text style={[styles.chipBtnText, activeTab === "details" && styles.chipBtnTextActive]}>လစဉ်ကြေး အသေးစိတ်</Text>
          </Pressable>
          <Pressable style={[styles.chipBtn, activeTab === "policy" && styles.chipBtnActive]} onPress={() => setActiveTab("policy")}>
            <Text style={[styles.chipBtnText, activeTab === "policy" && styles.chipBtnTextActive]}>သတ်မှတ်ချက် စည်းမျဉ်း</Text>
          </Pressable>
        </View>

        {activeTab === "details" ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>လစဉ်ကြေး ပေးဆောင်မှု အသေးစိတ်</Text>
            <View style={styles.inlineBtns}>
              <Pressable style={[styles.chipBtn, viewScope === "all" && styles.chipBtnActive]} onPress={() => setViewScope("all")}>
                <Text style={[styles.chipBtnText, viewScope === "all" && styles.chipBtnTextActive]}>အားလုံး</Text>
              </Pressable>
              <Pressable style={[styles.chipBtn, viewScope === "self" && styles.chipBtnActive]} onPress={() => setViewScope("self")}>
                <Text style={[styles.chipBtnText, viewScope === "self" && styles.chipBtnTextActive]}>ကိုယ်တိုင်</Text>
              </Pressable>
              <Pressable style={[styles.chipBtn, viewScope === "member" && styles.chipBtnActive]} onPress={() => setViewScope("member")}>
                <Text style={[styles.chipBtnText, viewScope === "member" && styles.chipBtnTextActive]}>အခြားသူ</Text>
              </Pressable>
            </View>
            {viewScope === "member" ? (
              <View style={styles.selectorWrap}>
                <TextInput
                  style={styles.input}
                  value={memberSearch}
                  onChangeText={setMemberSearch}
                  placeholder="Member ID / Full Name ရိုက်ရှာပါ"
                />
                <View style={styles.inlineBtns}>
                  {filteredScopeMembers.slice(0, 8).map((m) => (
                    <Pressable
                      key={`scoped-${m.id}`}
                      style={[styles.chipBtn, selectedMemberId === m.id && styles.chipBtnActive]}
                      onPress={() => {
                        setSelectedMemberId(m.id);
                        setShowMemberPicker(false);
                      }}
                    >
                      <Text style={[styles.chipBtnText, selectedMemberId === m.id && styles.chipBtnTextActive]}>{m.name} ({m.id})</Text>
                    </Pressable>
                  ))}
                  <Pressable style={styles.chipBtn} onPress={() => setShowMemberPicker(true)}>
                    <Text style={styles.chipBtnText}>Dropdown မှ Member ရွေးမည်</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            <View style={styles.dateRow}>
              <Pressable style={styles.dateBtn} onPress={() => openDatePicker("detailStart", detailStart)}>
                <Text style={styles.dateBtnLabel}>စတင်နေ့</Text>
                <Text style={styles.dateBtnValue}>{detailStart || "-"}</Text>
              </Pressable>
              <Pressable style={styles.dateBtn} onPress={() => openDatePicker("detailEnd", detailEnd || todayYmd())}>
                <Text style={styles.dateBtnLabel}>ပြီးဆုံးနေ့</Text>
                <Text style={styles.dateBtnValue}>{detailEnd || "-"}</Text>
              </Pressable>
            </View>
            <View style={styles.summaryMiniRow}>
              <View style={styles.summaryMiniBox}>
                <Text style={styles.summaryMiniLabel}>လစဉ်ကြေးရငွေ</Text>
                <Text style={[styles.summaryMiniValue, { color: "#10B981" }]}>
                  {detailTransactions.reduce((sum: number, t: any) => sum + Number(t?.amount || 0), 0).toLocaleString()} KS
                </Text>
              </View>
              <View style={styles.summaryMiniBox}>
                <Text style={styles.summaryMiniLabel}>ပေးရန်ကျန်</Text>
                <Text style={[styles.summaryMiniValue, { color: "#EF4444" }]}>{totalOutstanding.toLocaleString()} KS</Text>
              </View>
            </View>

            <Text style={styles.cardTitle}>လစဉ်ကြေး ကြွေးကျန် စာရင်း</Text>
            {outstandingRows.length === 0 ? (
              <Text style={styles.meta}>ရွေးချယ်ထားသောကာလအတွက် ကြွေးကျန်မရှိပါ။</Text>
            ) : (
              <View style={styles.tableWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View style={styles.tableContainer}>
                    <View style={[styles.tableRow, styles.tableHeaderRow]}>
                      <Text style={[styles.tableHeaderText, { width: 52 }]}>စဉ်</Text>
                      <Text style={[styles.tableHeaderText, { width: 200 }]}>အသင်းဝင်</Text>
                      <Text style={[styles.tableHeaderText, { width: 120 }]}>အသင်းဝင် ID</Text>
                      <Text style={[styles.tableHeaderText, { width: 130 }]}>ကျသင့်ငွေ</Text>
                      <Text style={[styles.tableHeaderText, { width: 130 }]}>ပေးပြီးငွေ</Text>
                      <Text style={[styles.tableHeaderText, { width: 140 }]}>ပေးရန်ကျန်</Text>
                    </View>
                    {outstandingRows.map((row, idx) => (
                      <View key={`out-${row.memberId}-${idx}`} style={[styles.tableRow, idx % 2 === 1 && styles.tableAltRow]}>
                        <Text style={[styles.tableCellText, { width: 52 }]}>{idx + 1}</Text>
                        <Text style={[styles.tableCellText, { width: 200 }]} numberOfLines={1}>{row.memberName}</Text>
                        <Text style={[styles.tableCellText, { width: 120 }]}>{row.memberId}</Text>
                        <Text style={[styles.tableCellText, styles.tableAmountText, { width: 130 }]}>{row.dueTotal.toLocaleString()} KS</Text>
                        <Text style={[styles.tableCellText, styles.tableAmountText, { width: 130, color: "#059669" }]}>{row.paidTotal.toLocaleString()} KS</Text>
                        <Text style={[styles.tableCellText, styles.tableAmountText, { width: 140, color: "#DC2626" }]}>{row.unpaidTotal.toLocaleString()} KS</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <Text style={styles.cardTitle}>လစဉ်ကြေး ပေးသွင်းမှတ်တမ်း</Text>
            {displayTransactions.length === 0 ? (
              <Text style={styles.meta}>ရွေးချယ်ထားသော filter အတွက် လစဉ်ကြေး မှတ်တမ်းမရှိပါ။</Text>
            ) : (
              <View style={styles.tableWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View style={styles.tableContainer}>
                    <View style={[styles.tableRow, styles.tableHeaderRow]}>
                      <Text style={[styles.tableHeaderText, { width: 52 }]}>စဉ်</Text>
                      <Text style={[styles.tableHeaderText, { width: 120 }]}>ရက်စွဲ</Text>
                      <Text style={[styles.tableHeaderText, { width: 200 }]}>အသင်းဝင်</Text>
                      <Text style={[styles.tableHeaderText, { width: 120 }]}>အသင်းဝင် ID</Text>
                      <Text style={[styles.tableHeaderText, { width: 220 }]}>လစဉ်ကြေးကာလ</Text>
                      <Text style={[styles.tableHeaderText, { width: 130 }]}>ပြေစာ</Text>
                      <Text style={[styles.tableHeaderText, { width: 130 }]}>ပမာဏ</Text>
                    </View>
                    {displayTransactions.map((t: any, idx: number) => {
                      const rowUi = (
                        <View style={[styles.tableRow, idx % 2 === 1 && styles.tableAltRow]}>
                          <Text style={[styles.tableCellText, { width: 52 }]}>{idx + 1}</Text>
                          <Text style={[styles.tableCellText, { width: 120 }]}>{String(t?.date || "-")}</Text>
                          <Text style={[styles.tableCellText, { width: 200 }]} numberOfLines={1}>
                            {memberNameById.get(String(t?.memberId || "")) || t?.payerPayee || "-"}
                          </Text>
                          <Text style={[styles.tableCellText, { width: 120 }]}>{String(t?.memberId || "-")}</Text>
                          <Text style={[styles.tableCellText, { width: 220 }]} numberOfLines={1}>
                            {String(t?.feePeriodStart || "-")} ~ {String(t?.feePeriodEnd || "-")}
                          </Text>
                          <Text style={[styles.tableCellText, { width: 130 }]}>{String(t?.receiptNumber || "-")}</Text>
                          <Text style={[styles.tableCellText, styles.tableAmountText, { width: 130, color: "#0F766E" }]}>
                            {Number(t?.amount || 0).toLocaleString()} KS
                          </Text>
                        </View>
                      );
                      if (!isTreasurer || !canViewAllDetails) {
                        return <View key={`fee-txn-${t.id || idx}`}>{rowUi}</View>;
                      }
                      return (
                        <Pressable
                          key={`fee-txn-${t.id || idx}`}
                          onPress={() => {
                            router.push("/finance" as any);
                          }}
                        >
                          {rowUi}
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
                {isTreasurer && canViewAllDetails ? <Text style={styles.meta}>ဇယားအတန်းကိုနှိပ်ပါက Finance Page ဖွင့်ပါမည်။</Text> : null}
              </View>
            )}
          </View>
        ) : null}

        {activeTab === "policy" && pendingRequests.length > 0 && isChair ? (
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

        {activeTab === "policy" ? (
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
        ) : null}

        {activeTab === "policy" && canEdit ? (
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

        {activeTab === "policy" ? (
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
        ) : null}

        {activeTab === "policy" && canEdit ? (
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

      <Modal visible={showMemberPicker} transparent animationType="fade" onRequestClose={() => setShowMemberPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>အသင်းဝင်ရွေးချယ်ရန်</Text>
            <TextInput style={styles.input} value={memberSearch} onChangeText={setMemberSearch} placeholder="ရှာရန် (ID / အမည်)" />
            <View style={styles.inlineBtns}>
              <Pressable style={styles.chipBtn} onPress={() => setSelectedMemberId("")}><Text style={styles.chipBtnText}>ရွေးချယ်မှုဖျက်မည်</Text></Pressable>
              <Pressable style={styles.chipBtn} onPress={() => setShowMemberPicker(false)}><Text style={styles.chipBtnText}>ပိတ်မည်</Text></Pressable>
            </View>
            <ScrollView style={styles.memberListScroll}>
              {filteredScopeMembers.map((m) => {
                const selected = selectedMemberId === m.id;
                return (
                  <Pressable
                    key={`scope-m-${m.id}`}
                    style={styles.memberRow}
                    onPress={() => {
                      setSelectedMemberId(m.id);
                      setShowMemberPicker(false);
                    }}
                  >
                    <Text style={styles.meta}>{selected ? "☑" : "☐"} {m.name} ({m.id})</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
  summaryMiniRow: { flexDirection: "row", gap: 8 },
  summaryMiniBox: { flex: 1, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 10, backgroundColor: "#F8FAFC" },
  summaryMiniLabel: { fontSize: 12, fontWeight: "700", color: Colors.light.textSecondary },
  summaryMiniValue: { marginTop: 4, fontSize: 16, fontWeight: "800" },
  tableWrap: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  tableContainer: {
    minWidth: 760,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    minHeight: 40,
  },
  tableHeaderRow: {
    backgroundColor: "#0F766E",
    borderBottomColor: "#0F766E",
    minHeight: 42,
  },
  tableAltRow: {
    backgroundColor: "#F8FAFC",
  },
  tableHeaderText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  tableCellText: {
    color: Colors.light.text,
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  tableAmountText: {
    textAlign: "right",
    fontWeight: "800",
  },
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

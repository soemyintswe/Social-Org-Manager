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
import {
  MEMBER_GENDER_LABELS,
  MEMBER_STATUS_LABELS,
  MEMBER_STATUS_VALUES,
  ORG_POSITION_LABELS,
  MemberStatus,
  type OrgPosition,
  normalizeMemberStatus,
  normalizeOrgPosition,
} from "@/lib/types";
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from "expo-file-system/legacy";
import AccessDenied from "@/components/AccessDenied";
import { getLocalizedTransactionCategoryLabel, stripTechnicalNoteText } from "@/lib/transaction-display";
import { toEnglishDigits } from "@/lib/member-utils";

const PERIOD_OPTIONS = [
  { label: "ယခုလ", months: 0 },
  { label: "၄ လ", months: 4 },
  { label: "၈ လ", months: 8 },
  { label: "၁ နှစ်", months: 12 },
];

type ReportTab = "income_expense" | "loans" | "funds" | "registers" | "cash_book" | "fees" | "members" | "audit_flags";
type ReportViewScope = "all" | "self" | "member";
type RegisterView = "received" | "expenditure" | "loan_out" | "loan_in";
type DetailSortOrder = "newest" | "oldest";
type MemberDateBasis = "join" | "status" | "created";
type MemberGenderFilter = "all" | "male" | "female" | "other";
type MemberAgeFilter = "all" | "under18" | "18_35" | "36_60" | "61_75" | "over75" | "unknown";
type MemberPositionFilter =
  | "all"
  | "executive"
  | "patron"
  | "chairperson"
  | "vice_chairperson"
  | "secretary"
  | "joint_secretary"
  | "treasurer"
  | "auditor"
  | "committee_member"
  | "member";
type PrintReportKind =
  | "current"
  | "members_filtered"
  | "executive_committee"
  | "monthly_summary"
  | "four_month_summary"
  | "yearly_summary";

const REPORT_TXN_PAGE_SIZE = 60;
const REPORT_REGISTER_PAGE_SIZE = 50;
const REPORT_CASHBOOK_PAGE_SIZE = 80;
const REPORT_AUDIT_PAGE_SIZE = 50;
const REPORT_MEMBER_PAGE_SIZE = 40;
const EXECUTIVE_POSITIONS = [
  "patron",
  "chairperson",
  "vice_chairperson",
  "secretary",
  "joint_secretary",
  "treasurer",
  "auditor",
  "committee_member",
] as const;

function isExecutivePosition(position: unknown): boolean {
  return EXECUTIVE_POSITIONS.includes(normalizeOrgPosition(position) as any);
}

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
  const raw = toEnglishDigits(String(dateValue || "").trim()).replace(/[၊။]/g, ".").trim();
  if (!raw) return 0;

  const ymd = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
      const parsed = new Date(year, month - 1, day).getTime();
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const yy = Number(dmy[3]);
    const year = yy < 100 ? 2000 + yy : yy;
    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
      const parsed = new Date(year, month - 1, day).getTime();
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  const direct = new Date(raw.replace(/\s+/g, " ")).getTime();
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

function inferGenderFromName(rawName: string): "male" | "female" | "other" {
  const name = String(rawName || "").trim();
  if (!name) return "other";
  const n = name.toLowerCase();
  if (
    name.startsWith("ဆရာတော်") ||
    name.startsWith("ဦး") ||
    name.startsWith("ကို") ||
    name.startsWith("မောင်") ||
    name.startsWith("ကိုရင်") ||
    name.startsWith("ဦးဇင်း") ||
    n.startsWith("u ") ||
    n.startsWith("ko ") ||
    n.startsWith("mg ")
  ) {
    return "male";
  }
  if (
    name.startsWith("ဒေါ်") ||
    name.startsWith("မ") ||
    name.startsWith("မိ") ||
    name.startsWith("သီလရှင်") ||
    name.startsWith("ဆရာလေး") ||
    n.startsWith("daw ") ||
    n.startsWith("ma ")
  ) {
    return "female";
  }
  return "other";
}

function calculateAge(dob?: string, refDate: Date = new Date()): number | null {
  const birthMs = parseDateMs(dob);
  if (!Number.isFinite(birthMs) || birthMs <= 0) return null;
  const birthDate = new Date(birthMs);
  let age = refDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = refDate.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && refDate.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function getAgeBucket(age: number | null): "under18" | "18_35" | "36_60" | "61_75" | "over75" | "unknown" {
  if (age === null) return "unknown";
  if (age < 18) return "under18";
  if (age <= 35) return "18_35";
  if (age <= 60) return "36_60";
  if (age <= 75) return "61_75";
  return "over75";
}

function resolveMemberGender(member: any): "male" | "female" | "other" {
  const explicit = String(member?.gender || "").toLowerCase();
  if (explicit === "male" || explicit === "female" || explicit === "other") return explicit;
  return inferGenderFromName(String(member?.name || ""));
}

function normalizeMemberPositionTimeline(
  member: any,
  fallbackPosition: OrgPosition
): { position: OrgPosition; dateMs: number; dateText: string }[] {
  const rawHistory = Array.isArray(member?.orgPositionHistory) ? member.orgPositionHistory : [];
  const timeline = rawHistory
    .map((row: any) => {
      const position = normalizeOrgPosition(row?.position || fallbackPosition);
      const dateText = String(row?.effectiveDate || row?.assignedAt || row?.date || "").trim();
      const dateMs = parseDateMs(dateText);
      if (!Number.isFinite(dateMs) || dateMs <= 0) return null;
      return { position, dateMs, dateText };
    })
    .filter(Boolean) as { position: OrgPosition; dateMs: number; dateText: string }[];

  const fallbackDateText = String(member?.joinDate || member?.createdAt || "").trim();
  const fallbackDateMs = parseDateMs(fallbackDateText) || Date.now();
  if (timeline.length === 0) {
    timeline.push({
      position: fallbackPosition,
      dateMs: fallbackDateMs,
      dateText: fallbackDateText || new Date(fallbackDateMs).toISOString().slice(0, 10),
    });
  }

  timeline.sort((a, b) => a.dateMs - b.dateMs);
  const collapsed: { position: OrgPosition; dateMs: number; dateText: string }[] = [];
  timeline.forEach((row) => {
    const last = collapsed[collapsed.length - 1];
    if (!last) {
      collapsed.push(row);
      return;
    }
    if (last.dateMs === row.dateMs) {
      collapsed[collapsed.length - 1] = row;
      return;
    }
    if (last.position === row.position) return;
    collapsed.push(row);
  });

  const last = collapsed[collapsed.length - 1];
  if (!last || last.position !== fallbackPosition) {
    collapsed.push({
      position: fallbackPosition,
      dateMs: Math.max(fallbackDateMs, last?.dateMs || 0),
      dateText: fallbackDateText || new Date(Math.max(fallbackDateMs, last?.dateMs || 0)).toISOString().slice(0, 10),
    });
  }

  return collapsed;
}

function getMemberPositionsInRange(
  member: any,
  startMs: number,
  endMs: number
): { positions: OrgPosition[]; primaryPosition: OrgPosition } {
  const fallbackPosition = normalizeOrgPosition(member?.orgPosition || member?.status || "member");
  const timeline = normalizeMemberPositionTimeline(member, fallbackPosition);
  const set = new Set<OrgPosition>();
  let primaryPosition: OrgPosition = fallbackPosition;

  timeline.forEach((row, index) => {
    const next = timeline[index + 1];
    const intervalStart = row.dateMs;
    const intervalEnd = (next?.dateMs || Number.POSITIVE_INFINITY) - 1;
    const overlaps = intervalStart <= endMs && intervalEnd >= startMs;
    if (!overlaps) return;
    set.add(row.position);
    if (intervalStart <= endMs) primaryPosition = row.position;
  });

  if (set.size === 0) {
    set.add(primaryPosition);
  }

  return { positions: Array.from(set.values()), primaryPosition };
}

function escapeHtml(text: unknown): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { transactions, members, loading, accountSettings, loans, getLoanInterestDue } = useData() as any;
  const { can, currentUser } = useAuth();
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
  const [showPrintPicker, setShowPrintPicker] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditOnlyFlagged, setAuditOnlyFlagged] = useState(true);
  const [memberStatusFilter, setMemberStatusFilter] = useState<"all" | MemberStatus>("all");
  const [memberGenderFilter, setMemberGenderFilter] = useState<MemberGenderFilter>("all");
  const [memberAgeFilter, setMemberAgeFilter] = useState<MemberAgeFilter>("all");
  const [memberPositionFilter, setMemberPositionFilter] = useState<MemberPositionFilter>("all");
  const [memberDateBasis, setMemberDateBasis] = useState<MemberDateBasis>("join");
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

  const getMemberReferenceDateMs = useCallback(
    (member: any): number => {
      if (memberDateBasis === "status") {
        return parseDateMs(member?.statusDate || member?.resignDate || member?.joinDate || member?.createdAt);
      }
      if (memberDateBasis === "created") {
        return parseDateMs(member?.createdAt || member?.joinDate);
      }
      return parseDateMs(member?.joinDate || member?.createdAt || member?.statusDate || member?.resignDate);
    },
    [memberDateBasis]
  );

  const memberRowsWithMetrics = useMemo(() => {
    const refDate = endDate;
    return (reportMembers || []).map((member: any) => {
      const status = normalizeMemberStatus(member?.status);
      const defaultPosition = normalizeOrgPosition(member?.orgPosition || status);
      const gender = resolveMemberGender(member);
      const age = calculateAge(member?.dob, refDate);
      const joinDateMsRaw = parseDateMs(
        member?.joinDate ||
          member?.createdAt ||
          member?.orgPositionHistory?.[0]?.effectiveDate ||
          member?.statusDate ||
          member?.resignDate
      );
      const joinDateMs = joinDateMsRaw > 0 ? joinDateMsRaw : parseDateMs("2018-01-01");
      const rawExitDateMs = parseDateMs(member?.statusDate || member?.resignDate);
      const hasExitStatus = ["resigned", "deceased", "expelled", "suspended"].includes(status);
      const exitDateMs = hasExitStatus && Number.isFinite(rawExitDateMs) ? rawExitDateMs : 0;
      return {
        ...member,
        __status: status,
        __defaultPosition: defaultPosition,
        __gender: gender,
        __age: age,
        __ageBucket: getAgeBucket(age),
        __joinDateMs: joinDateMs,
        __exitDateMs: exitDateMs,
        __refDateMs: getMemberReferenceDateMs(member),
      };
    });
  }, [reportMembers, endDate, getMemberReferenceDateMs]);

  const memberFlowStats = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const startMs = start.getTime();
    const endMs = end.getTime();

    let opening = 0;
    let joined = 0;
    let exited = 0;
    let closing = 0;

    memberRowsWithMetrics.forEach((member: any) => {
      const joinMs = Number(member?.__joinDateMs || 0);
      const exitMs = Number(member?.__exitDateMs || 0);
      if (!Number.isFinite(joinMs) || joinMs <= 0) return;

      const activeAtStart = joinMs < startMs && (exitMs <= 0 || exitMs >= startMs);
      const joinedInRange = joinMs >= startMs && joinMs <= endMs;
      const exitedInRange = exitMs > 0 && exitMs >= startMs && exitMs <= endMs;
      const activeAtEnd = joinMs <= endMs && (exitMs <= 0 || exitMs > endMs);

      if (activeAtStart) opening += 1;
      if (joinedInRange) joined += 1;
      if (exitedInRange) exited += 1;
      if (activeAtEnd) closing += 1;
    });

    return { opening, joined, exited, closing };
  }, [memberRowsWithMetrics, startDate, endDate]);

  const filteredMemberRows = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const startMs = start.getTime();
    const endMs = end.getTime();

    return memberRowsWithMetrics
      .map((member: any) => {
        const positionSnapshot = getMemberPositionsInRange(member, startMs, endMs);
        return {
          ...member,
          __positionsInRange: positionSnapshot.positions,
          __positionPrimary: positionSnapshot.primaryPosition,
        };
      })
      .filter((member: any) => {
        const joinMs = Number(member?.__joinDateMs || 0);
        const exitMs = Number(member?.__exitDateMs || 0);
        if (!Number.isFinite(joinMs) || joinMs <= 0) return false;
        const existsInRange = joinMs <= endMs && (exitMs <= 0 || exitMs >= startMs);
        if (!existsInRange) return false;

        if (memberStatusFilter !== "all" && member.__status !== memberStatusFilter) return false;
        if (memberGenderFilter !== "all" && member.__gender !== memberGenderFilter) return false;
        if (memberAgeFilter !== "all" && member.__ageBucket !== memberAgeFilter) return false;
        const positionsInRange: OrgPosition[] = Array.isArray(member.__positionsInRange) ? member.__positionsInRange : [];
        if (memberPositionFilter === "executive" && !positionsInRange.some((position) => isExecutivePosition(position))) return false;
        if (
          memberPositionFilter !== "all" &&
          memberPositionFilter !== "executive" &&
          !positionsInRange.includes(memberPositionFilter as OrgPosition)
        ) return false;
        return true;
      })
      .sort((a: any, b: any) => {
        if (a.__refDateMs !== b.__refDateMs) return b.__refDateMs - a.__refDateMs;
        return String(a?.id || "").localeCompare(String(b?.id || ""));
      });
  }, [
    memberRowsWithMetrics,
    memberStatusFilter,
    memberGenderFilter,
    memberAgeFilter,
    memberPositionFilter,
    startDate,
    endDate,
  ]);

  const executiveMembers = useMemo(
    () =>
      filteredMemberRows
        .filter((member: any) => {
          const positionsInRange: OrgPosition[] = Array.isArray(member?.__positionsInRange) ? member.__positionsInRange : [];
          return positionsInRange.some((position) => isExecutivePosition(position));
        })
        .sort((a: any, b: any) => {
          const rank = (pos: string): number => {
            const idx = EXECUTIVE_POSITIONS.indexOf(pos as any);
            return idx >= 0 ? idx : 999;
          };
          const ra = rank(a.__positionPrimary || a.__defaultPosition || "member");
          const rb = rank(b.__positionPrimary || b.__defaultPosition || "member");
          if (ra !== rb) return ra - rb;
          return String(a?.id || "").localeCompare(String(b?.id || ""));
        }),
    [filteredMemberRows]
  );

  const memberSummaryStats = useMemo(() => {
    const statusCounts: Record<MemberStatus, number> = {
      active: 0,
      resigned: 0,
      deceased: 0,
      expelled: 0,
      suspended: 0,
      applicant: 0,
    };
    const genderCounts: Record<"male" | "female" | "other", number> = { male: 0, female: 0, other: 0 };
    const ageCounts: Record<"under18" | "18_35" | "36_60" | "61_75" | "over75" | "unknown", number> = {
      under18: 0,
      "18_35": 0,
      "36_60": 0,
      "61_75": 0,
      over75: 0,
      unknown: 0,
    };
    const positionCounts = new Map<string, number>();

    filteredMemberRows.forEach((member: any) => {
      const statusKey = member.__status as MemberStatus;
      const genderKey = member.__gender as "male" | "female" | "other";
      const ageKey = member.__ageBucket as "under18" | "18_35" | "36_60" | "61_75" | "over75" | "unknown";
      if (statusCounts[statusKey] !== undefined) statusCounts[statusKey] += 1;
      if (genderCounts[genderKey] !== undefined) genderCounts[genderKey] += 1;
      if (ageCounts[ageKey] !== undefined) ageCounts[ageKey] += 1;
      const key = String(member.__positionPrimary || member.__defaultPosition || "member");
      positionCounts.set(key, (positionCounts.get(key) || 0) + 1);
    });

    const topPositions = Array.from(positionCounts.entries())
      .map(([position, count]) => ({ position, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total: filteredMemberRows.length,
      statusCounts,
      genderCounts,
      ageCounts,
      topPositions,
      executiveCount: executiveMembers.length,
    };
  }, [filteredMemberRows, executiveMembers.length]);

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

    const rows: {
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
    }[] = [];

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
  const pagedFilteredMemberRows = useMemo(() => filteredMemberRows.slice(0, visibleMemberCount), [filteredMemberRows, visibleMemberCount]);
  const pagedExecutiveMembers = useMemo(() => executiveMembers.slice(0, visibleMemberCount), [executiveMembers, visibleMemberCount]);

  const hasMoreNonTransferRows = pagedNonTransferRows.length < sortedNonTransferRows.length;
  const hasMoreLoanTxnRows = pagedLoanTxnRows.length < sortedLoanTxnRows.length;
  const hasMoreRegisterRows = pagedRegisterRows.length < sortedRegisterRows.length;
  const hasMoreCashBookRows = pagedCashBookRows.length < cashBookRows.length;
  const hasMoreAuditRows = pagedAuditRows.length < scopedAuditRows.length;
  const hasMoreReportMembers = pagedReportMembers.length < reportMembers.length;
  const hasMoreFilteredMemberRows = pagedFilteredMemberRows.length < filteredMemberRows.length;
  const hasMoreExecutiveMembers = pagedExecutiveMembers.length < executiveMembers.length;

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
  }, [
    reportTab,
    registerView,
    startDateMs,
    endDateMs,
    scopedMemberId,
    computeReady,
    memberStatusFilter,
    memberGenderFilter,
    memberAgeFilter,
    memberPositionFilter,
    memberDateBasis,
  ]);

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

  const shareHtmlAsPdf = useCallback(async (html: string) => {
    if (Platform.OS === "web") {
      if (typeof document === "undefined") {
        await Print.printAsync({ html });
        return;
      }

      const frame = document.createElement("iframe");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.setAttribute("aria-hidden", "true");
      document.body.appendChild(frame);

      const cleanup = () => {
        try {
          if (frame.parentNode) frame.parentNode.removeChild(frame);
        } catch {}
      };

      try {
        const doc = frame.contentDocument || frame.contentWindow?.document;
        if (!doc || !frame.contentWindow) {
          cleanup();
          await Print.printAsync({ html });
          return;
        }
        doc.open();
        doc.write(html);
        doc.close();
        await new Promise((resolve) => setTimeout(resolve, 220));
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(cleanup, 1200);
      } catch {
        cleanup();
        await Print.printAsync({ html });
      }
      return;
    }
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { UTI: ".pdf", mimeType: "application/pdf" });
      return;
    }
    await Print.printAsync({ html });
  }, []);

  const formatMemberDateByBasis = useCallback(
    (member: any) => {
      if (memberDateBasis === "status") return member?.statusDate || member?.resignDate || "-";
      if (memberDateBasis === "created") return member?.createdAt || "-";
      return member?.joinDate || "-";
    },
    [memberDateBasis]
  );

  const renderMemberReportTableHtml = useCallback(
    (rows: any[], title: string) => `
      <h2>${escapeHtml(title)}</h2>
      <table>
        <thead>
          <tr>
            <th style="width:36px;">No.</th>
            <th>အမည်</th>
            <th>အသင်းဝင်အမှတ်</th>
            <th>အဖွဲ့တာဝန်</th>
            <th>ကျား/မ</th>
            <th>အသက်</th>
            <th>အခြေအနေ</th>
            <th>ဖုန်း</th>
            <th>${memberDateBasis === "status" ? "Status Date" : memberDateBasis === "created" ? "Created Date" : "Join Date"}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (m: any, index: number) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(m?.name || "-")}</td>
              <td>${escapeHtml(m?.id || "-")}</td>
              <td>${escapeHtml(
                Array.isArray(m?.__positionsInRange) && m.__positionsInRange.length > 0
                  ? m.__positionsInRange
                      .map((position: OrgPosition) => ORG_POSITION_LABELS[position] || ORG_POSITION_LABELS.member)
                      .join(" / ")
                  : ORG_POSITION_LABELS[(m?.__positionPrimary || m?.__defaultPosition || "member") as OrgPosition] || ORG_POSITION_LABELS.member
              )}</td>
              <td>${escapeHtml(MEMBER_GENDER_LABELS[m?.__gender as "male" | "female" | "other"] || "အခြား")}</td>
              <td>${m?.__age === null || m?.__age === undefined ? "-" : `${m.__age}`}</td>
              <td>${escapeHtml(MEMBER_STATUS_LABELS[m?.__status as MemberStatus] || m?.__status || "-")}</td>
              <td>${escapeHtml(m?.phone || "-")}</td>
              <td>${escapeHtml(formatDateForRegister(formatMemberDateByBasis(m)))}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `,
    [formatMemberDateByBasis, memberDateBasis]
  );

  const buildFinancialSummaryRows = useCallback(
    (granularity: "month" | "four_month" | "year") => {
      const map = new Map<
        string,
        {
          label: string;
          sortKey: number;
          income: number;
          expense: number;
          loanDisbursed: number;
          loanRepaid: number;
          interestIncome: number;
          transferIn: number;
          transferOut: number;
        }
      >();

      filteredTxns.forEach((tx: any) => {
        const d = new Date(tx?.date);
        if (Number.isNaN(d.getTime())) return;
        const year = d.getFullYear();
        const month = d.getMonth();
        const fourMonthBucket = Math.floor(month / 4) + 1;

        let key = "";
        let label = "";
        let sortKey = 0;
        if (granularity === "year") {
          key = `Y-${year}`;
          label = `${year}`;
          sortKey = year * 100 + 1;
        } else if (granularity === "four_month") {
          key = `F-${year}-${fourMonthBucket}`;
          label = `${year} (၄ လပတ် ${fourMonthBucket})`;
          sortKey = year * 100 + fourMonthBucket;
        } else {
          key = `M-${year}-${month + 1}`;
          label = `${year}-${String(month + 1).padStart(2, "0")}`;
          sortKey = year * 100 + (month + 1);
        }

        const row = map.get(key) || {
          label,
          sortKey,
          income: 0,
          expense: 0,
          loanDisbursed: 0,
          loanRepaid: 0,
          interestIncome: 0,
          transferIn: 0,
          transferOut: 0,
        };

        const amount = Number(tx?.amount || 0);
        const type = String(tx?.type || "");
        const category = String(tx?.category || "");
        if (type === "income") row.income += amount;
        if (type === "expense") row.expense += amount;
        if (category === "loan_disbursement") row.loanDisbursed += amount;
        if (category === "loan_repayment") row.loanRepaid += amount;
        if (category === "interest_income" || category === "bank_interest") row.interestIncome += amount;
        if (type === "transfer" && category === "bank_withdraw") row.transferIn += amount;
        if (type === "transfer" && category === "bank_deposit") row.transferOut += amount;

        map.set(key, row);
      });

      return Array.from(map.values()).sort((a, b) => a.sortKey - b.sortKey);
    },
    [filteredTxns]
  );

  const buildBaseHtml = useCallback(
    (title: string, subtitle: string, content: string) => `
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 18px; color: #0F172A; }
            h1 { text-align: center; margin: 0 0 8px; }
            h2 { margin: 18px 0 8px; font-size: 16px; }
            p.meta { text-align: center; margin: 0 0 12px; color: #475569; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px; }
            th, td { border: 1px solid #E2E8F0; padding: 7px; text-align: left; vertical-align: top; }
            th { background: #F1F5F9; font-weight: 700; }
            tr:nth-child(even) { background: #F8FAFC; }
            .summary { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
            .summary-box { border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px; min-width: 150px; }
            .summary-label { font-size: 11px; color: #64748B; }
            .summary-value { font-size: 14px; font-weight: 700; margin-top: 4px; }
            .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #94A3B8; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(accountSettings?.orgName || "Social Org Manager")}</h1>
          <p class="meta">${escapeHtml(title)}<br/>${escapeHtml(subtitle)}</p>
          ${content}
          <div class="footer">Generated by Social Org Manager</div>
        </body>
      </html>
    `,
    [accountSettings?.orgName]
  );

  const generatePdf = useCallback(
    async (kind: PrintReportKind) => {
      try {
        setPrinting(true);
        const subtitle = `${scopeLabel} | ${formatDateForRegister(startDate)} - ${formatDateForRegister(endDate)} | ${new Date().toLocaleString()}`;

        if (kind === "members_filtered") {
          const content = `
            <div class="summary">
              <div class="summary-box"><div class="summary-label">စုစုပေါင်း</div><div class="summary-value">${memberSummaryStats.total}</div></div>
              <div class="summary-box"><div class="summary-label">အစရှိ</div><div class="summary-value">${memberFlowStats.opening}</div></div>
              <div class="summary-box"><div class="summary-label">တိုးလာ</div><div class="summary-value">${memberFlowStats.joined}</div></div>
              <div class="summary-box"><div class="summary-label">လျှော့သွား</div><div class="summary-value">${memberFlowStats.exited}</div></div>
              <div class="summary-box"><div class="summary-label">လက်ကျန်</div><div class="summary-value">${memberFlowStats.closing}</div></div>
              <div class="summary-box"><div class="summary-label">ကျား</div><div class="summary-value">${memberSummaryStats.genderCounts.male}</div></div>
              <div class="summary-box"><div class="summary-label">မ</div><div class="summary-value">${memberSummaryStats.genderCounts.female}</div></div>
              <div class="summary-box"><div class="summary-label">အခြား</div><div class="summary-value">${memberSummaryStats.genderCounts.other}</div></div>
            </div>
            ${renderMemberReportTableHtml(filteredMemberRows, "အသင်းဝင် စီစစ်စာရင်း")}
          `;
          await shareHtmlAsPdf(buildBaseHtml("အသင်းဝင်အစီရင်ခံစာ", subtitle, content));
          return;
        }

        if (kind === "executive_committee") {
          const content = `
            <div class="summary">
              <div class="summary-box"><div class="summary-label">အမှုဆောင်စုစုပေါင်း</div><div class="summary-value">${executiveMembers.length}</div></div>
              <div class="summary-box"><div class="summary-label">အစရှိ</div><div class="summary-value">${memberFlowStats.opening}</div></div>
              <div class="summary-box"><div class="summary-label">တိုးလာ</div><div class="summary-value">${memberFlowStats.joined}</div></div>
              <div class="summary-box"><div class="summary-label">လျှော့သွား</div><div class="summary-value">${memberFlowStats.exited}</div></div>
              <div class="summary-box"><div class="summary-label">လက်ကျန်</div><div class="summary-value">${memberFlowStats.closing}</div></div>
            </div>
            ${renderMemberReportTableHtml(executiveMembers, "နာယကနှင့် အမှုဆောင်အဖွဲ့စာရင်း")}
          `;
          await shareHtmlAsPdf(buildBaseHtml("အမှုဆောင်အဖွဲ့အစီရင်ခံစာ", subtitle, content));
          return;
        }

        if (kind === "monthly_summary" || kind === "four_month_summary" || kind === "yearly_summary") {
          const granularity = kind === "monthly_summary" ? "month" : kind === "four_month_summary" ? "four_month" : "year";
          const rows = buildFinancialSummaryRows(granularity);
          const titleLabel = kind === "monthly_summary" ? "လချုပ် ငွေစာရင်းချုပ်" : kind === "four_month_summary" ? "၄ လပတ် ငွေစာရင်းချုပ်" : "နှစ်ချုပ် ငွေစာရင်းချုပ်";
          const table = `
            <h2>${titleLabel}</h2>
            <table>
              <thead>
                <tr>
                  <th>ကာလ</th>
                  <th>ရငွေ</th>
                  <th>အသုံးစရိတ်</th>
                  <th>ချေးငွေထုတ်</th>
                  <th>ချေးငွေပြန်ရ</th>
                  <th>အတိုးရ</th>
                  <th>ဘဏ်ထုတ်</th>
                  <th>ဘဏ်သွင်း</th>
                  <th>ခြားနားချက်</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (row) => `
                  <tr>
                    <td>${escapeHtml(row.label)}</td>
                    <td>${row.income.toLocaleString()}</td>
                    <td>${row.expense.toLocaleString()}</td>
                    <td>${row.loanDisbursed.toLocaleString()}</td>
                    <td>${row.loanRepaid.toLocaleString()}</td>
                    <td>${row.interestIncome.toLocaleString()}</td>
                    <td>${row.transferIn.toLocaleString()}</td>
                    <td>${row.transferOut.toLocaleString()}</td>
                    <td>${(row.income - row.expense).toLocaleString()}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          `;
          await shareHtmlAsPdf(buildBaseHtml(titleLabel, subtitle, table));
          return;
        }

        if (kind === "current") {
          let content = "";
          if (reportTab === "members") {
            content = renderMemberReportTableHtml(filteredMemberRows, "အသင်းဝင် စီစစ်စာရင်း");
          } else if (reportTab === "registers") {
            content = `
              <h2>${escapeHtml(activeRegisterTitle)}</h2>
              <table>
                <thead><tr><th>No.</th><th>အမည်</th><th>အသင်းဝင်အမှတ်</th><th>ရက်စွဲ</th><th>ပြေစာ</th><th>ခေါင်းစဉ်</th><th>ငွေပမာဏ</th></tr></thead>
                <tbody>
                  ${sortedRegisterRows
                    .map(
                      (row: any, index: number) => `
                    <tr>
                      <td>${index + 1}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.memberId || "-")}</td>
                      <td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.receipt)}</td><td>${escapeHtml(row.heading)}</td>
                      <td>${Number(row.amount || 0).toLocaleString()}</td>
                    </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            `;
          } else if (reportTab === "loans") {
            content = `
              <div class="summary">
                <div class="summary-box"><div class="summary-label">ထုတ်ချေး</div><div class="summary-value">${loanStats.disbursed.toLocaleString()} KS</div></div>
                <div class="summary-box"><div class="summary-label">ပြန်ဆပ်</div><div class="summary-value">${loanStats.repaid.toLocaleString()} KS</div></div>
                <div class="summary-box"><div class="summary-label">အရင်းကျန်</div><div class="summary-value">${loanStats.principalOutstanding.toLocaleString()} KS</div></div>
              </div>
              <h2>ချေးငွေဆိုင်ရာမှတ်တမ်း</h2>
              <table>
                <thead><tr><th>No.</th><th>အမည်</th><th>အသင်းဝင်</th><th>ရက်စွဲ</th><th>ပြေစာ</th><th>ခေါင်းစဉ်</th><th>ငွေ</th></tr></thead>
                <tbody>
                  ${sortedLoanTxnRows
                    .map(
                      (row: any, index: number) => `
                    <tr>
                      <td>${index + 1}</td><td>${escapeHtml(row.payerPayee || memberNameById.get(String(row.memberId || "")) || "-")}</td>
                      <td>${escapeHtml(row.memberId || "-")}</td><td>${escapeHtml(formatDateForRegister(row.date))}</td>
                      <td>${escapeHtml(row.receiptNumber || "-")}</td><td>${escapeHtml(getCategoryLabel(row.category))}</td>
                      <td>${Number(row.amount || 0).toLocaleString()}</td>
                    </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            `;
          } else if (reportTab === "fees") {
            content = renderMemberReportTableHtml(
              (reportMembers || []).map((member: any) => ({
                ...member,
                __status: normalizeMemberStatus(member?.status),
                __defaultPosition: normalizeOrgPosition(member?.orgPosition || member?.status),
                __positionPrimary: normalizeOrgPosition(member?.orgPosition || member?.status),
                __positionsInRange: [normalizeOrgPosition(member?.orgPosition || member?.status)],
                __gender: resolveMemberGender(member),
                __age: calculateAge(member?.dob, endDate),
              })),
              "လစဉ်ကြေး ဆိုင်ရာ အသင်းဝင်စာရင်း"
            );
          } else {
            content = `
              <div class="summary">
                <div class="summary-box"><div class="summary-label">ရငွေ</div><div class="summary-value">${incomeExpenseStats.income.toLocaleString()} KS</div></div>
                <div class="summary-box"><div class="summary-label">အသုံးစရိတ်</div><div class="summary-value">${incomeExpenseStats.expense.toLocaleString()} KS</div></div>
                <div class="summary-box"><div class="summary-label">ခြားနားချက်</div><div class="summary-value">${incomeExpenseStats.net.toLocaleString()} KS</div></div>
              </div>
              <h2>အသေးစိတ်စာရင်း</h2>
              <table>
                <thead><tr><th>No.</th><th>ရက်စွဲ</th><th>အမည်</th><th>အသင်းဝင်</th><th>ပြေစာ</th><th>ခေါင်းစဉ်</th><th>ငွေ</th><th>Type</th></tr></thead>
                <tbody>
                  ${sortedNonTransferRows
                    .map(
                      (row: any, index: number) => `
                    <tr>
                      <td>${index + 1}</td><td>${escapeHtml(formatDateForRegister(row.date))}</td>
                      <td>${escapeHtml(row.payerPayee || memberNameById.get(String(row.memberId || "")) || "-")}</td>
                      <td>${escapeHtml(row.memberId || "-")}</td><td>${escapeHtml(row.receiptNumber || "-")}</td>
                      <td>${escapeHtml(getCategoryLabel(row.category))}</td><td>${Number(row.amount || 0).toLocaleString()}</td><td>${escapeHtml(row.type || "-")}</td>
                    </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            `;
          }

          await shareHtmlAsPdf(buildBaseHtml("လက်ရှိအစီရင်ခံစာ", subtitle, content));
        }
      } catch (error) {
        console.error(error);
        Alert.alert("Error", "PDF ထုတ်မရနိုင်ပါ။");
      } finally {
        setPrinting(false);
      }
    },
    [
      scopeLabel,
      startDate,
      endDate,
      memberSummaryStats,
      memberFlowStats,
      filteredMemberRows,
      executiveMembers,
      buildFinancialSummaryRows,
      reportTab,
      activeRegisterTitle,
      sortedRegisterRows,
      loanStats,
      sortedLoanTxnRows,
      memberNameById,
      reportMembers,
      incomeExpenseStats,
      sortedNonTransferRows,
      shareHtmlAsPdf,
      buildBaseHtml,
      renderMemberReportTableHtml,
    ]
  );

  const handlePrintKind = useCallback(
    (kind: PrintReportKind) => {
      setShowPrintPicker(false);
      void generatePdf(kind);
    },
    [generatePdf]
  );

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
          <Pressable style={styles.headerIconBtn} onPress={() => setShowPrintPicker(true)} disabled={printing}>
            {printing ? (
              <ActivityIndicator size="small" color={Colors.light.tint} />
            ) : (
              <Ionicons name="print-outline" size={22} color={Colors.light.text} />
            )}
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
          <Pressable style={[styles.tab, reportTab === "members" && styles.activeTab]} onPress={() => setReportTab("members")}>
            <Text style={[styles.tabText, reportTab === "members" && styles.activeTabText]}>အသင်းဝင်များ</Text>
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

      {reportTab === "members" && (
        <View style={styles.scrollContent}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>အသင်းဝင် အချက်အလက် Filter</Text>
            <Text style={styles.catSub}>အချိန်ကာလအခြေခံ</Text>
            <View style={styles.registerModeRow}>
              <Pressable style={[styles.registerModeChip, memberDateBasis === "join" && styles.registerModeChipActive]} onPress={() => setMemberDateBasis("join")}>
                <Text style={[styles.registerModeChipText, memberDateBasis === "join" && styles.registerModeChipTextActive]}>ဝင်ခွင့်နေ့</Text>
              </Pressable>
              <Pressable style={[styles.registerModeChip, memberDateBasis === "status" && styles.registerModeChipActive]} onPress={() => setMemberDateBasis("status")}>
                <Text style={[styles.registerModeChipText, memberDateBasis === "status" && styles.registerModeChipTextActive]}>Status နေ့</Text>
              </Pressable>
              <Pressable style={[styles.registerModeChip, memberDateBasis === "created" && styles.registerModeChipActive]} onPress={() => setMemberDateBasis("created")}>
                <Text style={[styles.registerModeChipText, memberDateBasis === "created" && styles.registerModeChipTextActive]}>Created နေ့</Text>
              </Pressable>
            </View>

            <Text style={styles.catSub}>အခြေအနေ</Text>
            <View style={styles.registerModeRow}>
              <Pressable style={[styles.registerModeChip, memberStatusFilter === "all" && styles.registerModeChipActive]} onPress={() => setMemberStatusFilter("all")}>
                <Text style={[styles.registerModeChipText, memberStatusFilter === "all" && styles.registerModeChipTextActive]}>အားလုံး</Text>
              </Pressable>
              {MEMBER_STATUS_VALUES.map((status) => (
                <Pressable
                  key={`status-${status}`}
                  style={[styles.registerModeChip, memberStatusFilter === status && styles.registerModeChipActive]}
                  onPress={() => setMemberStatusFilter(status)}
                >
                  <Text style={[styles.registerModeChipText, memberStatusFilter === status && styles.registerModeChipTextActive]}>
                    {MEMBER_STATUS_LABELS[status]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.catSub}>ကျား / မ</Text>
            <View style={styles.registerModeRow}>
              <Pressable style={[styles.registerModeChip, memberGenderFilter === "all" && styles.registerModeChipActive]} onPress={() => setMemberGenderFilter("all")}>
                <Text style={[styles.registerModeChipText, memberGenderFilter === "all" && styles.registerModeChipTextActive]}>အားလုံး</Text>
              </Pressable>
              <Pressable style={[styles.registerModeChip, memberGenderFilter === "male" && styles.registerModeChipActive]} onPress={() => setMemberGenderFilter("male")}>
                <Text style={[styles.registerModeChipText, memberGenderFilter === "male" && styles.registerModeChipTextActive]}>ကျား</Text>
              </Pressable>
              <Pressable style={[styles.registerModeChip, memberGenderFilter === "female" && styles.registerModeChipActive]} onPress={() => setMemberGenderFilter("female")}>
                <Text style={[styles.registerModeChipText, memberGenderFilter === "female" && styles.registerModeChipTextActive]}>မ</Text>
              </Pressable>
              <Pressable style={[styles.registerModeChip, memberGenderFilter === "other" && styles.registerModeChipActive]} onPress={() => setMemberGenderFilter("other")}>
                <Text style={[styles.registerModeChipText, memberGenderFilter === "other" && styles.registerModeChipTextActive]}>အခြား</Text>
              </Pressable>
            </View>

            <Text style={styles.catSub}>အသက်အုပ်စု</Text>
            <View style={styles.registerModeRow}>
              {[
                { key: "all", label: "အားလုံး" },
                { key: "under18", label: "18 နှစ်အောက်" },
                { key: "18_35", label: "18-35" },
                { key: "36_60", label: "36-60" },
                { key: "61_75", label: "61-75" },
                { key: "over75", label: "75 အထက်" },
                { key: "unknown", label: "မသိရှိ" },
              ].map((ageOpt) => (
                <Pressable
                  key={`age-${ageOpt.key}`}
                  style={[styles.registerModeChip, memberAgeFilter === (ageOpt.key as MemberAgeFilter) && styles.registerModeChipActive]}
                  onPress={() => setMemberAgeFilter(ageOpt.key as MemberAgeFilter)}
                >
                  <Text style={[styles.registerModeChipText, memberAgeFilter === (ageOpt.key as MemberAgeFilter) && styles.registerModeChipTextActive]}>
                    {ageOpt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.catSub}>တာဝန်/ရာထူး</Text>
            <View style={styles.registerModeRow}>
              {[
                { key: "all", label: "အားလုံး" },
                { key: "executive", label: "အမှုဆောင်များ" },
                { key: "patron", label: ORG_POSITION_LABELS.patron },
                { key: "chairperson", label: ORG_POSITION_LABELS.chairperson },
                { key: "vice_chairperson", label: ORG_POSITION_LABELS.vice_chairperson },
                { key: "secretary", label: ORG_POSITION_LABELS.secretary },
                { key: "joint_secretary", label: ORG_POSITION_LABELS.joint_secretary },
                { key: "treasurer", label: ORG_POSITION_LABELS.treasurer },
                { key: "auditor", label: ORG_POSITION_LABELS.auditor },
                { key: "committee_member", label: ORG_POSITION_LABELS.committee_member },
                { key: "member", label: ORG_POSITION_LABELS.member },
              ].map((posOpt) => (
                <Pressable
                  key={`pos-${posOpt.key}`}
                  style={[styles.registerModeChip, memberPositionFilter === (posOpt.key as MemberPositionFilter) && styles.registerModeChipActive]}
                  onPress={() => setMemberPositionFilter(posOpt.key as MemberPositionFilter)}
                >
                  <Text
                    style={[
                      styles.registerModeChipText,
                      memberPositionFilter === (posOpt.key as MemberPositionFilter) && styles.registerModeChipTextActive,
                    ]}
                  >
                    {posOpt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.auditMetaText}>
              မှတ်ချက်: ရာထူးသမိုင်း (assign/relieve date) မသိမ်းသေးပါက လက်ရှိရာထူးအခြေပြု filter ဖြင့်ပြသပါသည်။
            </Text>
          </View>

          <View style={styles.summaryGrid}>
            <View style={[styles.statBox, { borderLeftColor: "#0EA5A4" }]}>
              <Text style={styles.statLabel}>စုစုပေါင်းအသင်းဝင်</Text>
              <Text style={[styles.statValue, { color: "#0EA5A4" }]}>{memberSummaryStats.total.toLocaleString()}</Text>
            </View>
            <View style={[styles.statBox, { borderLeftColor: "#2563EB" }]}>
              <Text style={styles.statLabel}>အမှုဆောင်စုစုပေါင်း</Text>
              <Text style={[styles.statValue, { color: "#2563EB" }]}>{memberSummaryStats.executiveCount.toLocaleString()}</Text>
            </View>
          </View>
          <View style={[styles.summaryGrid, { marginTop: -10 }]}>
            <View style={[styles.statBox, { borderLeftColor: "#0F766E" }]}>
              <Text style={styles.statLabel}>ကျား / မ / အခြား</Text>
              <Text style={[styles.statValue, { color: "#0F766E" }]}>
                {memberSummaryStats.genderCounts.male} / {memberSummaryStats.genderCounts.female} / {memberSummaryStats.genderCounts.other}
              </Text>
            </View>
            <View style={[styles.statBox, { borderLeftColor: "#7C3AED" }]}>
              <Text style={styles.statLabel}>လက်ရှိ / နုတ်ထွက် / ကွယ်လွန်</Text>
              <Text style={[styles.statValue, { color: "#7C3AED" }]}>
                {memberSummaryStats.statusCounts.active} / {memberSummaryStats.statusCounts.resigned} / {memberSummaryStats.statusCounts.deceased}
              </Text>
            </View>
          </View>
          <View style={[styles.summaryGrid, { marginTop: -10 }]}>
            <View style={[styles.statBox, { borderLeftColor: "#DC2626" }]}>
              <Text style={styles.statLabel}>ထုတ်ပယ် / ဆိုင်းငံ့ / လျှောက်ထား</Text>
              <Text style={[styles.statValue, { color: "#DC2626" }]}>
                {memberSummaryStats.statusCounts.expelled} / {memberSummaryStats.statusCounts.suspended} / {memberSummaryStats.statusCounts.applicant}
              </Text>
            </View>
            <View style={[styles.statBox, { borderLeftColor: "#B45309" }]}>
              <Text style={styles.statLabel}>အသက်အုပ်စု (18-35 / 36-60 / 61-75 / 75+)</Text>
              <Text style={[styles.statValue, { color: "#B45309" }]}>
                {memberSummaryStats.ageCounts["18_35"]} / {memberSummaryStats.ageCounts["36_60"]} / {memberSummaryStats.ageCounts["61_75"]} / {memberSummaryStats.ageCounts.over75}
              </Text>
            </View>
          </View>
          <View style={[styles.summaryGrid, { marginTop: -10 }]}>
            <View style={[styles.statBox, { borderLeftColor: "#0369A1" }]}>
              <Text style={styles.statLabel}>အစရှိ (ကာလမတိုင်မီ)</Text>
              <Text style={[styles.statValue, { color: "#0369A1" }]}>{memberFlowStats.opening.toLocaleString()}</Text>
            </View>
            <View style={[styles.statBox, { borderLeftColor: "#16A34A" }]}>
              <Text style={styles.statLabel}>တိုးလာ (ကာလအတွင်း)</Text>
              <Text style={[styles.statValue, { color: "#16A34A" }]}>{memberFlowStats.joined.toLocaleString()}</Text>
            </View>
          </View>
          <View style={[styles.summaryGrid, { marginTop: -10 }]}>
            <View style={[styles.statBox, { borderLeftColor: "#DC2626" }]}>
              <Text style={styles.statLabel}>လျှော့သွား (ကာလအတွင်း)</Text>
              <Text style={[styles.statValue, { color: "#DC2626" }]}>{memberFlowStats.exited.toLocaleString()}</Text>
            </View>
            <View style={[styles.statBox, { borderLeftColor: "#7C3AED" }]}>
              <Text style={styles.statLabel}>လက်ကျန် (ကာလပြီး)</Text>
              <Text style={[styles.statValue, { color: "#7C3AED" }]}>{memberFlowStats.closing.toLocaleString()}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>နာယကနှင့် အမှုဆောင်အဖွဲ့</Text>
            {pagedExecutiveMembers.length === 0 ? (
              <Text style={styles.summaryOnlyNoteText}>သတ်မှတ်ထားသော filter အောက်တွင် အမှုဆောင်စာရင်း မရှိသေးပါ။</Text>
            ) : (
              pagedExecutiveMembers.map((member: any, index: number) => (
                <View key={`exec-${member?.id || index}`} style={styles.registerCard}>
                  <Text style={styles.registerCardTitle}>{index + 1}. {member?.name || "-"}</Text>
                  <Text style={styles.registerCardMeta}>အသင်းဝင်အမှတ်: {member?.id || "-"}</Text>
                  <Text style={styles.registerCardMeta}>
                    တာဝန်:{" "}
                    {Array.isArray(member?.__positionsInRange) && member.__positionsInRange.length > 0
                      ? member.__positionsInRange
                          .map((position: OrgPosition) => ORG_POSITION_LABELS[position] || ORG_POSITION_LABELS.member)
                          .join(" / ")
                      : ORG_POSITION_LABELS[(member?.__positionPrimary || member?.__defaultPosition || "member") as OrgPosition] || ORG_POSITION_LABELS.member}
                  </Text>
                  <Text style={styles.registerCardMeta}>အခြေအနေ: {MEMBER_STATUS_LABELS[member?.__status as MemberStatus] || "-"}</Text>
                  <Text style={styles.registerCardMeta}>ဖုန်း: {member?.phone || "-"}</Text>
                </View>
              ))
            )}
            {hasMoreExecutiveMembers ? (
              <View style={styles.loadMoreWrap}>
                <Pressable style={styles.loadMoreBtn} onPress={() => setVisibleMemberCount((prev) => prev + REPORT_MEMBER_PAGE_SIZE)}>
                  <Text style={styles.loadMoreBtnText}>
                    နောက်ထပ် {Math.min(REPORT_MEMBER_PAGE_SIZE, executiveMembers.length - pagedExecutiveMembers.length).toLocaleString()} ဦး ပြရန်
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>အသင်းဝင် အသေးစိတ်စာရင်း</Text>
            {pagedFilteredMemberRows.length === 0 ? (
              <Text style={styles.summaryOnlyNoteText}>ရွေးချယ်ထားသည့် filter အောက်တွင် အသင်းဝင်စာရင်း မရှိပါ။</Text>
            ) : (
              pagedFilteredMemberRows.map((member: any, index: number) => (
                <View key={`member-detail-${member?.id || index}`} style={styles.registerCard}>
                  <Text style={styles.registerCardTitle}>{index + 1}. {member?.name || "-"}</Text>
                  <Text style={styles.registerCardMeta}>အသင်းဝင်အမှတ်: {member?.id || "-"}</Text>
                  <Text style={styles.registerCardMeta}>
                    ကျား/မ: {MEMBER_GENDER_LABELS[member?.__gender as "male" | "female" | "other"] || "အခြား"} | အသက်: {member?.__age === null ? "မသိပါ" : `${member.__age} နှစ်`}
                  </Text>
                  <Text style={styles.registerCardMeta}>
                    အခြေအနေ: {MEMBER_STATUS_LABELS[member?.__status as MemberStatus] || "-"} | တာဝန်:{" "}
                    {Array.isArray(member?.__positionsInRange) && member.__positionsInRange.length > 0
                      ? member.__positionsInRange
                          .map((position: OrgPosition) => ORG_POSITION_LABELS[position] || ORG_POSITION_LABELS.member)
                          .join(" / ")
                      : ORG_POSITION_LABELS[(member?.__positionPrimary || member?.__defaultPosition || "member") as OrgPosition] || ORG_POSITION_LABELS.member}
                  </Text>
                  <Text style={styles.registerCardMeta}>
                    {memberDateBasis === "status" ? "Status နေ့" : memberDateBasis === "created" ? "Created နေ့" : "Join နေ့"}:{" "}
                    {formatDateForRegister(formatMemberDateByBasis(member))}
                  </Text>
                  <Text style={styles.registerCardMeta}>ဖုန်း: {member?.phone || "-"}</Text>
                  {!!member?.statusNote ? <Text style={styles.registerCardNote}>မှတ်ချက်: {member.statusNote}</Text> : null}
                </View>
              ))
            )}
            {hasMoreFilteredMemberRows ? (
              <View style={styles.loadMoreWrap}>
                <Pressable style={styles.loadMoreBtn} onPress={() => setVisibleMemberCount((prev) => prev + REPORT_MEMBER_PAGE_SIZE)}>
                  <Text style={styles.loadMoreBtnText}>
                    နောက်ထပ် {Math.min(REPORT_MEMBER_PAGE_SIZE, filteredMemberRows.length - pagedFilteredMemberRows.length).toLocaleString()} ဦး ပြရန်
                  </Text>
                </Pressable>
              </View>
            ) : null}
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

      <Modal
        animationType="slide"
        transparent={true}
        visible={showPrintPicker}
        onRequestClose={() => setShowPrintPicker(false)}
      >
        <View style={styles.modalContainer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowPrintPicker(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Print Report ရွေးချယ်ရန်</Text>
            <View style={styles.printOptionList}>
              <Pressable
                style={styles.printOptionBtn}
                onPress={() => handlePrintKind("current")}
              >
                <Text style={styles.printOptionText}>လက်ရှိ Report Tab ကို Print</Text>
              </Pressable>
              <Pressable
                style={styles.printOptionBtn}
                onPress={() => handlePrintKind("members_filtered")}
              >
                <Text style={styles.printOptionText}>အသင်းဝင် Filter စာရင်း Print</Text>
              </Pressable>
              <Pressable
                style={styles.printOptionBtn}
                onPress={() => handlePrintKind("executive_committee")}
              >
                <Text style={styles.printOptionText}>နာယကနှင့် အမှုဆောင်အဖွဲ့ Print</Text>
              </Pressable>
              <Pressable
                style={styles.printOptionBtn}
                onPress={() => handlePrintKind("monthly_summary")}
              >
                <Text style={styles.printOptionText}>လချုပ် ငွေစာရင်းချုပ် Print</Text>
              </Pressable>
              <Pressable
                style={styles.printOptionBtn}
                onPress={() => handlePrintKind("four_month_summary")}
              >
                <Text style={styles.printOptionText}>၄ လပတ် ငွေစာရင်းချုပ် Print</Text>
              </Pressable>
              <Pressable
                style={styles.printOptionBtn}
                onPress={() => handlePrintKind("yearly_summary")}
              >
                <Text style={styles.printOptionText}>နှစ်ချုပ် ငွေစာရင်းချုပ် Print</Text>
              </Pressable>
            </View>
            <Pressable style={styles.cancelBtn} onPress={() => setShowPrintPicker(false)}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
  printOptionList: { gap: 8 },
  printOptionBtn: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  printOptionText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
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

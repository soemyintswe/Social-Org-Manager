import { getLocalizedTransactionCategoryLabel, stripTechnicalNoteText } from "./transaction-display";
import { toEnglishDigits } from "./member-utils";
import { normalizeMemberStatus, normalizeOrgPosition, type OrgPosition, type MemberStatus } from "./types";

export const EXECUTIVE_POSITIONS = [
  "patron",
  "chairperson",
  "vice_chairperson",
  "secretary",
  "joint_secretary",
  "treasurer",
  "auditor",
  "committee_member",
] as const;

export function isExecutivePosition(position: unknown): boolean {
  return EXECUTIVE_POSITIONS.includes(normalizeOrgPosition(position) as any);
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

export function getCategoryLabel(category: unknown): string {
  return getLocalizedTransactionCategoryLabel(category);
}

export function getReadableNotes(notes: unknown): string {
  return stripTechnicalNoteText(notes);
}

export function formatDateForRegister(dateValue: unknown): string {
  const d = new Date(String(dateValue || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

export function parseDateMs(dateValue: unknown): number {
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

export function normalizeMemberText(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s\u200b\u200c\u200d\ufeff]/g, "")
    .trim();
}

export function escapeRegExp(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function transactionBelongsToMember(tx: any, memberId: string, memberName: string): boolean {
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

export function inferGenderFromName(rawName: string): "male" | "female" | "other" {
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

export function calculateAge(dob?: string, refDate: Date = new Date()): number | null {
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

export function getAgeBucket(age: number | null): "under18" | "18_35" | "36_60" | "61_75" | "over75" | "unknown" {
  if (age === null) return "unknown";
  if (age < 18) return "under18";
  if (age <= 35) return "18_35";
  if (age <= 60) return "36_60";
  if (age <= 75) return "61_75";
  return "over75";
}

export function resolveMemberGender(member: any): "male" | "female" | "other" {
  const explicit = String(member?.gender || "").toLowerCase();
  if (explicit === "male" || explicit === "female" || explicit === "other") return explicit;
  return inferGenderFromName(String(member?.name || ""));
}

export function normalizeMemberPositionTimeline(
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

export function getMemberPositionsInRange(
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

export function escapeHtml(text: unknown): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatYmd(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthStartFrom(dateLike: string): Date {
  const ms = parseDateMs(dateLike);
  const d = ms > 0 ? new Date(ms) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function monthEndFrom(year: number, monthIdx: number): Date {
  return new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);
}

export function monthKey(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
}

export function getMemberReferenceDateMs(member: any, basis: "join" | "status" | "created"): number {
  if (basis === "status") {
    return parseDateMs(member?.statusDate || member?.resignDate || member?.joinDate || member?.createdAt);
  }
  if (basis === "created") {
    return parseDateMs(member?.createdAt || member?.joinDate);
  }
  return parseDateMs(member?.joinDate || member?.createdAt || member?.statusDate || member?.resignDate);
}

export function buildMemberRowsWithMetrics(params: {
  members: any[];
  endDate: Date;
  memberDateBasis: "join" | "status" | "created";
  shouldComputeMembers: boolean;
}): any[] {
  const { members, endDate, memberDateBasis, shouldComputeMembers } = params;
  if (!shouldComputeMembers) return [];
  const refDate = endDate;
  return (members || []).map((member: any) => {
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
      __refDateMs: getMemberReferenceDateMs(member, memberDateBasis),
    };
  });
}

export function computeMemberFlowStats(params: {
  memberRowsWithMetrics: any[];
  startDate: Date;
  endDate: Date;
  shouldComputeMembers: boolean;
}): { opening: number; joined: number; exited: number; closing: number } {
  const { memberRowsWithMetrics, startDate, endDate, shouldComputeMembers } = params;
  if (!shouldComputeMembers) return { opening: 0, joined: 0, exited: 0, closing: 0 };
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
}

export function buildFilteredMemberRows(params: {
  memberRowsWithMetrics: any[];
  startDate: Date;
  endDate: Date;
  memberStatusFilter: string;
  memberGenderFilter: string;
  memberAgeFilter: string;
  memberPositionFilter: string;
  shouldComputeMembers: boolean;
}): any[] {
  const {
    memberRowsWithMetrics,
    startDate,
    endDate,
    memberStatusFilter,
    memberGenderFilter,
    memberAgeFilter,
    memberPositionFilter,
    shouldComputeMembers,
  } = params;
  if (!shouldComputeMembers) return [];
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
}

export function computeExecutiveMembers(params: {
  filteredMemberRows: any[];
  shouldComputeMembers: boolean;
}): any[] {
  const { filteredMemberRows, shouldComputeMembers } = params;
  if (!shouldComputeMembers) return [];
  return filteredMemberRows
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
    });
}

export function computeMemberSummaryStats(params: {
  filteredMemberRows: any[];
  executiveMembers: any[];
  shouldComputeMembers: boolean;
}): {
  total: number;
  statusCounts: Record<MemberStatus, number>;
  genderCounts: Record<"male" | "female" | "other", number>;
  ageCounts: Record<"under18" | "18_35" | "36_60" | "61_75" | "over75" | "unknown", number>;
  topPositions: { position: string; count: number }[];
  executiveCount: number;
} {
  const { filteredMemberRows, executiveMembers, shouldComputeMembers } = params;
  if (!shouldComputeMembers) {
    return {
      total: 0,
      statusCounts: { active: 0, resigned: 0, deceased: 0, expelled: 0, suspended: 0, applicant: 0 } as Record<MemberStatus, number>,
      genderCounts: { male: 0, female: 0, other: 0 } as Record<"male" | "female" | "other", number>,
      ageCounts: { under18: 0, "18_35": 0, "36_60": 0, "61_75": 0, over75: 0, unknown: 0 } as Record<
        "under18" | "18_35" | "36_60" | "61_75" | "over75" | "unknown",
        number
      >,
      topPositions: [] as { position: string; count: number }[],
      executiveCount: 0,
    };
  }
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
}

export function computeIncomeExpenseStats(filteredTxns: any[]): { income: number; expense: number; net: number } {
  const income = filteredTxns
    .filter((t: any) => t.type === "income" && t.category !== "loan_repayment")
    .reduce((sum: number, t: any) => sum + t.amount, 0);
  const expense = filteredTxns
    .filter((t: any) => t.type === "expense" && t.category !== "loan_disbursement")
    .reduce((sum: number, t: any) => sum + t.amount, 0);
  return { income, expense, net: income - expense };
}

export function computeLoanStats(params: {
  filteredTxns: any[];
  computeLoans: any[];
  getLoanInterestDue: (loanId: string) => number;
}): {
  disbursed: number;
  repaid: number;
  interest: number;
  principalOutstanding: number;
  interestOutstanding: number;
} {
  const { filteredTxns, computeLoans, getLoanInterestDue } = params;
  const disbursed = filteredTxns
    .filter((t: any) => t.category === "loan_disbursement")
    .reduce((sum: number, t: any) => sum + t.amount, 0);
  const repaid = filteredTxns
    .filter((t: any) => t.category === "loan_repayment")
    .reduce((sum: number, t: any) => sum + t.amount, 0);
  const interest = filteredTxns
    .filter((t: any) => t.category === "interest_income")
    .reduce((sum: number, t: any) => sum + t.amount, 0);

  const principalOutstanding = Math.max(0, Number(disbursed || 0) - Number(repaid || 0));

  const interestOutstanding = (computeLoans || []).reduce((acc: number, l: any) => {
    const amount = Number(getLoanInterestDue(l.id) || 0);
    return acc + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
  }, 0);

  return { disbursed, repaid, interest, principalOutstanding, interestOutstanding };
}

export function computeBalancesAt(params: {
  date: Date;
  accountSettings: any;
  transactions: any[];
}): { cash: number; bank: number; total: number } {
  const { date, accountSettings, transactions } = params;
  let cash = accountSettings?.openingBalanceCash || 0;
  let bank = accountSettings?.openingBalanceBank || 0;

  transactions.forEach((t: any) => {
    const tDate = new Date(t.date);
    if (tDate <= date) {
      const amt = t.amount;
      if (t.type === "income") {
        if (t.paymentMethod === "bank") bank += amt;
        else cash += amt;
      } else if (t.type === "expense") {
        if (t.paymentMethod === "bank") bank -= amt;
        else cash -= amt;
      } else if (t.type === "transfer") {
        if (t.category === "bank_deposit") {
          cash -= amt;
          bank += amt;
        }
        if (t.category === "bank_withdraw") {
          bank -= amt;
          cash += amt;
        }
      }
    }
  });
  return { cash, bank, total: cash + bank };
}

export function computeFundStats(params: {
  startDate: Date;
  endDate: Date;
  getBalancesAt: (date: Date) => { cash: number; bank: number; total: number };
}): { opening: { cash: number; bank: number; total: number }; closing: { cash: number; bank: number; total: number } } {
  const { startDate, endDate, getBalancesAt } = params;
  const start = new Date(startDate);
  start.setDate(start.getDate() - 1);
  const opening = getBalancesAt(start);
  const closing = getBalancesAt(endDate);
  return { opening, closing };
}

export function buildCashBookRows(params: {
  filteredTxns: any[];
  startDate: Date;
  getBalancesAt: (date: Date) => { cash: number; bank: number; total: number };
  shouldComputeCashBook: boolean;
}): {
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
}[] {
  const { filteredTxns, startDate, getBalancesAt, shouldComputeCashBook } = params;
  if (!shouldComputeCashBook) return [];
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
}

export function computeCashBookSummary(params: {
  cashBookRows: {
    rowType: "opening" | "entry" | "daily_total";
    cashBalance: number;
    bankBalance: number;
    cashIn: number;
    cashOut: number;
    bankIn: number;
    bankOut: number;
  }[];
  shouldComputeCashBook: boolean;
}): {
  openingCash: number;
  openingBank: number;
  closingCash: number;
  closingBank: number;
  cashIn: number;
  cashOut: number;
  bankIn: number;
  bankOut: number;
} {
  const { cashBookRows, shouldComputeCashBook } = params;
  if (!shouldComputeCashBook) {
    return {
      openingCash: 0,
      openingBank: 0,
      closingCash: 0,
      closingBank: 0,
      cashIn: 0,
      cashOut: 0,
      bankIn: 0,
      bankOut: 0,
    };
  }
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
}

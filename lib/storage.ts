import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import {
  Member,
  OrgEvent,
  Group,
  AttendanceRecord,
  Transaction,
  Loan,
  AccountSettings,
  UserAccount,
  MemberChangeRequest,
  MemberChangeAction,
  ExpenseClaim,
  MemberPaymentRequest,
  MemberPaymentRequestKind,
  MobileWalletProvider,
  StandardAmountRule,
  StandardAmountChangeRequest,
  DEFAULT_STANDARD_AMOUNT_RULES,
  DisbursementMethod,
} from "./types";
import { splitPhoneNumbers, toEnglishDigits } from "./member-utils";

const KEYS = {
  MEMBERS: "@orghub_members",
  EVENTS: "@orghub_events",
  GROUPS: "@orghub_groups",
  ATTENDANCE: "@orghub_attendance",
  TRANSACTIONS: "@orghub_transactions",
  LOANS: "@orghub_loans",
  ACCOUNT_SETTINGS: "@orghub_account_settings",
  USERS: "@orghub_users",
  USER_PASSWORDS: "@orghub_user_passwords",
  MEMBER_CHANGE_REQUESTS: "@orghub_member_change_requests",
  EXPENSE_CLAIMS: "@orghub_expense_claims",
  MEMBER_PAYMENT_REQUESTS: "@orghub_member_payment_requests",
  STANDARD_AMOUNTS: "@orghub_standard_amounts",
  STANDARD_AMOUNT_CHANGE_REQUESTS: "@orghub_standard_amount_change_requests",
};
const SYNC_LAST_SERVER_UPDATED_AT_KEY = "@orghub_sync_last_server_updated_at";
const DEFAULT_SYNC_SERVER_URL = String((process.env as any).EXPO_PUBLIC_SYNC_SERVER_URL || "http://192.168.99.9:5000");

const AVATAR_COLORS = ["#0D9488", "#F43F5E", "#8B5CF6", "#F59E0B", "#3B82F6", "#10B981", "#EC4899", "#6366F1"];

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substring(2, 11);
}

export function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

// ဒေတာဖတ်တဲ့ function တိုင်းမှာ try-catch ထည့်ထားလို့ error တက်ရင်တောင် အဝိုင်းလည်မနေတော့ပါဘူး
async function safeGet<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (e) {
    console.error(`Error reading ${key}:`, e);
    return defaultValue;
  }
}

// --- Members ---
export const getMembers = () => safeGet<Member[]>(KEYS.MEMBERS, []);

export async function syncUsersWithMembers(members: Member[]) {
  try {
    const users = await getUsers();
    const admins = users.filter(u => u.systemRole === 'admin');
    
    const memberUsers: UserAccount[] = members.map(m => {
      const existing = users.find(u => u.memberId === m.id);
      const mAny = m as any;
      const position = mAny.orgPosition || (m.status === 'applicant' ? 'applicant' : 'member');
      return {
        id: existing ? existing.id : `user-${m.id}`,
        displayName: m.name,
        systemRole: 'org_user',
        memberId: m.id,
        orgPosition: position,
        isActive: m.status === 'active' || m.status === 'applicant',
        createdAt: existing ? existing.createdAt : new Date().toISOString()
      };
    });
    await saveUsers([...admins, ...memberUsers]);
  } catch (e) { console.error(e); }
}

export const saveMembers = async (data: Member[]) => {
  await AsyncStorage.setItem(KEYS.MEMBERS, JSON.stringify(data));
  await syncUsersWithMembers(data);
};

export const getMemberChangeRequests = () => safeGet<MemberChangeRequest[]>(KEYS.MEMBER_CHANGE_REQUESTS, []);

export const saveMemberChangeRequests = async (data: MemberChangeRequest[]) => {
  await AsyncStorage.setItem(KEYS.MEMBER_CHANGE_REQUESTS, JSON.stringify(data));
};

export async function createMemberChangeRequest(input: {
  action: MemberChangeAction;
  targetMemberId?: string;
  payload: {
    member?: Partial<Member>;
    note?: string;
  };
  createdByUserId: string;
  createdByMemberId?: string;
}): Promise<MemberChangeRequest> {
  const requests = await getMemberChangeRequests();
  const request: MemberChangeRequest = {
    id: generateId(),
    action: input.action,
    targetMemberId: input.targetMemberId,
    payload: input.payload || {},
    status: "pending",
    createdByUserId: input.createdByUserId,
    createdByMemberId: input.createdByMemberId,
    createdAt: new Date().toISOString(),
  };
  await saveMemberChangeRequests([request, ...requests]);
  return request;
}

export async function approveMemberChangeRequest(requestId: string, reviewerUserId: string, reviewNote?: string): Promise<void> {
  const [requests, members] = await Promise.all([getMemberChangeRequests(), getMembers()]);
  const index = requests.findIndex((item) => item.id === requestId);
  if (index === -1) throw new Error("request_not_found");

  const request = requests[index];
  if (request.status !== "pending") throw new Error("request_not_pending");
  if (request.assignedReviewerUserId && request.assignedReviewerUserId !== reviewerUserId) {
    throw new Error("request_assigned_to_other_reviewer");
  }

  let nextMembers = [...members];
  if (request.action === "create") {
    const incoming = request.payload.member || {};
    const incomingId = String(incoming.id || "").trim();
    if (!incomingId) throw new Error("invalid_member_id");
    const exists = nextMembers.some((item) => item.id === incomingId);
    if (exists) throw new Error("member_exists");

    const member: Member = {
      id: incomingId,
      name: String(incoming.name || "").trim(),
      phone: String(incoming.phone || "").trim(),
      joinDate: String(incoming.joinDate || new Date().toISOString().split("T")[0]),
      status: (incoming.status as any) || "active",
      createdAt: incoming.createdAt || new Date().toISOString(),
      color: incoming.color || randomColor(),
      role: incoming.role || "member",
      avatarColor: incoming.avatarColor || randomColor(),
      dob: incoming.dob,
      nrc: incoming.nrc,
      email: incoming.email,
      address: incoming.address,
      orgPosition: incoming.orgPosition,
      resignDate: incoming.resignDate,
      statusDate: incoming.statusDate,
      statusNote: incoming.statusNote,
      profileImage: incoming.profileImage,
    };
    nextMembers = [...nextMembers, member];
  } else if (request.action === "update") {
    const targetId = String(request.targetMemberId || "").trim();
    if (!targetId) throw new Error("target_missing");
    const memberIndex = nextMembers.findIndex((item) => item.id === targetId);
    if (memberIndex === -1) throw new Error("target_not_found");

    const updatePayload = { ...(request.payload.member || {}) };
    if (updatePayload.id && updatePayload.id !== targetId) {
      throw new Error("id_change_not_supported");
    }
    delete (updatePayload as any).id;
    nextMembers[memberIndex] = {
      ...nextMembers[memberIndex],
      ...updatePayload,
    };
  } else if (request.action === "delete") {
    const targetId = String(request.targetMemberId || "").trim();
    if (!targetId) throw new Error("target_missing");
    nextMembers = nextMembers.filter((item) => item.id !== targetId);
  }

  await saveMembers(nextMembers);

  requests[index] = {
    ...requests[index],
    status: "approved",
    reviewedByUserId: reviewerUserId,
    reviewedAt: new Date().toISOString(),
    reviewNote: reviewNote?.trim() || undefined,
  };
  await saveMemberChangeRequests(requests);
}

export async function rejectMemberChangeRequest(requestId: string, reviewerUserId: string, reviewNote?: string): Promise<void> {
  const requests = await getMemberChangeRequests();
  const index = requests.findIndex((item) => item.id === requestId);
  if (index === -1) throw new Error("request_not_found");
  if (requests[index].status !== "pending") throw new Error("request_not_pending");
  if (requests[index].assignedReviewerUserId && requests[index].assignedReviewerUserId !== reviewerUserId) {
    throw new Error("request_assigned_to_other_reviewer");
  }

  requests[index] = {
    ...requests[index],
    status: "rejected",
    reviewedByUserId: reviewerUserId,
    reviewedAt: new Date().toISOString(),
    reviewNote: reviewNote?.trim() || undefined,
  };
  await saveMemberChangeRequests(requests);
}

export async function assignMemberChangeRequest(
  requestId: string,
  assignedReviewerUserId: string | undefined,
  assignerUserId: string
): Promise<void> {
  const requests = await getMemberChangeRequests();
  const index = requests.findIndex((item) => item.id === requestId);
  if (index === -1) throw new Error("request_not_found");
  if (requests[index].status !== "pending") throw new Error("request_not_pending");

  const targetReviewer = String(assignedReviewerUserId || "").trim();
  const previousReviewer = String(requests[index].assignedReviewerUserId || "").trim();
  let action: "assign" | "unassign" | "reassign" = "assign";
  if (!targetReviewer) {
    action = "unassign";
  } else if (previousReviewer && previousReviewer !== targetReviewer) {
    action = "reassign";
  } else {
    action = "assign";
  }

  const assignmentHistory = [...(requests[index].assignmentHistory || [])];
  assignmentHistory.push({
    action,
    byUserId: assignerUserId,
    toUserId: targetReviewer || undefined,
    at: new Date().toISOString(),
  });

  requests[index] = {
    ...requests[index],
    assignedReviewerUserId: targetReviewer || undefined,
    assignedByUserId: targetReviewer ? assignerUserId : undefined,
    assignedAt: targetReviewer ? new Date().toISOString() : undefined,
    assignmentHistory,
  };
  await saveMemberChangeRequests(requests);
}

export async function withdrawMemberChangeRequest(requestId: string, requesterUserId: string, note?: string): Promise<void> {
  const requests = await getMemberChangeRequests();
  const index = requests.findIndex((item) => item.id === requestId);
  if (index === -1) throw new Error("request_not_found");
  if (requests[index].status !== "pending") throw new Error("request_not_pending");
  if (requests[index].createdByUserId !== requesterUserId) throw new Error("not_owner");

  requests[index] = {
    ...requests[index],
    status: "cancelled",
    reviewedByUserId: requesterUserId,
    reviewedAt: new Date().toISOString(),
    reviewNote: note?.trim() || "Withdrawn by requester",
  };
  await saveMemberChangeRequests(requests);
}

export async function setUserPassword(userId: string, passwordPlaintext: string): Promise<void> {
    const passwords = await getUserPasswords();
    const updatedPasswords = { ...passwords, [userId]: passwordPlaintext };
    await AsyncStorage.setItem(KEYS.USER_PASSWORDS, JSON.stringify(updatedPasswords));
}

export async function verifyPassword(userId: string, passwordPlaintext: string): Promise<boolean> {
    const passwords = await getUserPasswords();
    const storedPassword = passwords[userId];
    return storedPassword === passwordPlaintext;
}

async function getUserPasswords(): Promise<Record<string, string>> {
    try {
        const data = await AsyncStorage.getItem(KEYS.USER_PASSWORDS);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error(`Error reading ${KEYS.USER_PASSWORDS}:`, e);
        return {};
    }
}

function getTrailingDigits(rawValue?: string): string {
  const normalized = toEnglishDigits(String(rawValue || ""));
  const matched = normalized.match(/(\d+)\s*$/);
  return matched ? matched[1] : "";
}

export function buildMemberUsername(memberId?: string): string {
  const digits = getTrailingDigits(memberId);
  if (!digits) return "";
  return `ID${digits}`;
}

export function buildDefaultPassword(memberId?: string, isAdmin?: boolean): string {
  if (isAdmin) return "Admin";
  const digits = getTrailingDigits(memberId);
  return digits || "member";
}

async function ensureDefaultPasswordsForUsers(users: UserAccount[], members: Member[]): Promise<void> {
  const passwords = await getUserPasswords();
  let changed = false;

  for (const user of users) {
    if (passwords[user.id]) continue;
    if (user.systemRole === "admin") {
      passwords[user.id] = buildDefaultPassword(undefined, true);
      changed = true;
      continue;
    }
    const member = members.find((item) => item.id === user.memberId);
    if (member) {
      passwords[user.id] = buildDefaultPassword(member.id, false);
      changed = true;
    }
  }

  if (changed) {
    await AsyncStorage.setItem(KEYS.USER_PASSWORDS, JSON.stringify(passwords));
  }
}

export async function changeUserPassword(userId: string, currentPassword: string, nextPassword: string): Promise<boolean> {
  if (!userId || !nextPassword.trim()) return false;
  const isValid = await verifyPassword(userId, currentPassword);
  if (!isValid) return false;
  await setUserPassword(userId, nextPassword.trim());
  return true;
}

export async function resetUserPasswordByIdentifier(identifier: string): Promise<{ ok: boolean; userId?: string; reason?: string }> {
  const needle = toEnglishDigits(identifier || "").trim().toLowerCase();
  if (!needle) return { ok: false, reason: "empty" };

  const [users, members] = await Promise.all([getUsers(), getMembers()]);
  const targetUser = users.find((user) => {
    if (!user.isActive) return false;
    if (user.systemRole === "admin") {
      return needle === "admin";
    }

    const member = members.find((item) => item.id === user.memberId);
    if (!member) return false;

    const { primaryPhone, secondaryPhone } = splitPhoneNumbers(member.phone, (member as any).secondaryPhone);
    const phoneCandidates = [primaryPhone, secondaryPhone]
      .filter(Boolean)
      .map((phone) => toEnglishDigits(phone).replace(/[^\d]/g, ""));
    const emailCandidate = String(member.email || "").trim().toLowerCase();
    const memberIdCandidate = toEnglishDigits(member.id).trim().toLowerCase();
    const aliasCandidate = buildMemberUsername(member.id).toLowerCase();
    const normalizedNeedleDigits = needle.replace(/[^\d]/g, "");

    return (
      needle === memberIdCandidate ||
      needle === aliasCandidate ||
      (emailCandidate && needle === emailCandidate) ||
      (!!normalizedNeedleDigits && phoneCandidates.includes(normalizedNeedleDigits))
    );
  });

  if (!targetUser) return { ok: false, reason: "not_found" };

  if (targetUser.systemRole === "admin") {
    await setUserPassword(targetUser.id, buildDefaultPassword(undefined, true));
    return { ok: true, userId: targetUser.id };
  }

  const member = members.find((item) => item.id === targetUser.memberId);
  if (!member) return { ok: false, reason: "missing_member" };

  await setUserPassword(targetUser.id, buildDefaultPassword(member.id));
  return { ok: true, userId: targetUser.id };
}



export async function importMembers(newMembers: Member[]): Promise<void> {
  const members = await getMembers();
  const memberMap = new Map(members.map((m) => [m.id, m]));

  for (const m of newMembers) {
    // ID တူရင် အသစ်နဲ့ အစားထိုးမယ်
    memberMap.set(m.id, m);
  }

  await saveMembers(Array.from(memberMap.values()));
}

export async function addMember(member: any): Promise<Member> {
  const members = await getMembers();
  const newMember = {
    ...member,
    id: member.id || generateId(),
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    createdAt: new Date().toISOString()
  };

    await saveMembers([...members, newMember]);

    const user = await getUsers()
    const newUser = user.find((e) => e.memberId === newMember.id)
    if (newUser?.id) {
      await setUserPassword(newUser.id, buildDefaultPassword(newMember.id));
    }

  return newMember;
}

export async function updateMember(id: string, updates: any) {
  const members = await getMembers();
  const idx = members.findIndex(m => m.id === id);
  if (idx !== -1) {
    members[idx] = { ...members[idx], ...updates };
    await saveMembers(members);
  }
}

export async function deleteMember(id: string) {
  const members = await getMembers();
  await saveMembers(members.filter(m => m.id !== id));
}

export async function clearAllMembers(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.MEMBERS);
}

export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function makeClaimNumber(existing: ExpenseClaim[]): string {
  const today = new Date();
  const ymd = toYmd(today).replace(/-/g, "");
  const prefix = `EC-${ymd}-`;
  let max = 0;
  for (const item of existing) {
    const value = String(item.claimNumber || "");
    if (!value.startsWith(prefix)) continue;
    const seq = Number(value.slice(prefix.length));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

function makePaymentRequestNumber(existing: MemberPaymentRequest[]): string {
  const today = new Date();
  const ymd = toYmd(today).replace(/-/g, "");
  const prefix = `PR-${ymd}-`;
  let max = 0;
  for (const item of existing) {
    const value = String(item.requestNumber || "");
    if (!value.startsWith(prefix)) continue;
    const seq = Number(value.slice(prefix.length));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

function mapPaymentRequestKindToIncomeCategory(
  kind: MemberPaymentRequestKind
): { category: string; categoryLabel: string } {
  if (kind === "member_fees") return { category: "member_fees", categoryLabel: "လစဉ်ကြေးရငွေ" };
  if (kind === "donations") return { category: "donations", categoryLabel: "အလှူငွေရရှိ" };
  if (kind === "loan_repayment") return { category: "loan_repayment", categoryLabel: "ချေးငွေပြန်ဆပ်ရရှိငွေ" };
  return { category: "interest_income", categoryLabel: "အတိုးရငွေ" };
}

async function pushSystemEvent(input: {
  title: string;
  description: string;
  createdByUserId?: string;
  createdByMemberId?: string;
}) {
  try {
    const events = await getEvents();
    const now = new Date();
    const event: OrgEvent = {
      id: generateId(),
      title: input.title,
      description: input.description,
      date: toYmd(now),
      time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      location: "System",
      attendeeIds: [],
      createdAt: now.toISOString(),
      createdByUserId: input.createdByUserId,
      createdByMemberId: input.createdByMemberId,
    };
    await AsyncStorage.setItem(KEYS.EVENTS, JSON.stringify([event, ...events]));
  } catch (error) {
    console.log("pushSystemEvent failed", error);
  }
}

function defaultStandardRules(): StandardAmountRule[] {
  const now = new Date().toISOString();
  return DEFAULT_STANDARD_AMOUNT_RULES.map((item) => ({ ...item, updatedAt: now }));
}

export async function getStandardAmountRules(): Promise<StandardAmountRule[]> {
  const rules = await safeGet<StandardAmountRule[]>(KEYS.STANDARD_AMOUNTS, []);
  if (!Array.isArray(rules) || rules.length === 0) {
    const defaults = defaultStandardRules();
    await AsyncStorage.setItem(KEYS.STANDARD_AMOUNTS, JSON.stringify(defaults));
    return defaults;
  }

  const mergedByKey = new Map<string, StandardAmountRule>();
  defaultStandardRules().forEach((item) => mergedByKey.set(item.key, item));
  rules.forEach((item) => {
    const key = String(item?.key || "").trim();
    if (!key) return;
    mergedByKey.set(key, {
      ...mergedByKey.get(key),
      ...item,
      key,
      label: String(item.label || mergedByKey.get(key)?.label || key),
      amount: Number(item.amount || 0),
      enabled: Boolean(item.enabled),
      updatedAt: item.updatedAt || new Date().toISOString(),
    });
  });
  const merged = Array.from(mergedByKey.values());
  await AsyncStorage.setItem(KEYS.STANDARD_AMOUNTS, JSON.stringify(merged));
  return merged;
}

export async function getStandardAmountRuleByKey(key: string): Promise<StandardAmountRule | undefined> {
  const rules = await getStandardAmountRules();
  return rules.find((item) => item.key === key);
}

export async function getStandardAmountChangeRequests(): Promise<StandardAmountChangeRequest[]> {
  const rows = await safeGet<StandardAmountChangeRequest[]>(KEYS.STANDARD_AMOUNT_CHANGE_REQUESTS, []);
  return Array.isArray(rows) ? rows : [];
}

export async function createStandardAmountChangeRequest(input: {
  ruleKey: string;
  ruleLabel: string;
  requestedAmount: number;
  reason: string;
  createdByUserId: string;
  createdByMemberId?: string;
}): Promise<StandardAmountChangeRequest> {
  const [rules, requests] = await Promise.all([getStandardAmountRules(), getStandardAmountChangeRequests()]);
  const existingRule = rules.find((item) => item.key === input.ruleKey);
  const request: StandardAmountChangeRequest = {
    id: generateId(),
    ruleKey: input.ruleKey,
    ruleLabel: input.ruleLabel || existingRule?.label || input.ruleKey,
    previousAmount: Number(existingRule?.amount || 0),
    requestedAmount: Number(input.requestedAmount || 0),
    reason: String(input.reason || "").trim(),
    status: "pending_approval",
    createdByUserId: input.createdByUserId,
    createdByMemberId: input.createdByMemberId,
    createdAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEYS.STANDARD_AMOUNT_CHANGE_REQUESTS, JSON.stringify([request, ...requests]));
  await pushSystemEvent({
    title: `Amount change request: ${request.ruleLabel}`,
    description: `${request.previousAmount.toLocaleString()} KS → ${request.requestedAmount.toLocaleString()} KS`,
    createdByUserId: input.createdByUserId,
    createdByMemberId: input.createdByMemberId,
  });
  return request;
}

export async function approveStandardAmountChangeRequest(requestId: string, approverUserId: string, approvalNote?: string): Promise<void> {
  const [rules, requests] = await Promise.all([getStandardAmountRules(), getStandardAmountChangeRequests()]);
  const idx = requests.findIndex((item) => item.id === requestId);
  if (idx === -1) throw new Error("request_not_found");
  if (requests[idx].status !== "pending_approval") throw new Error("request_not_pending");

  const req = requests[idx];
  const nextRules = [...rules];
  const ruleIdx = nextRules.findIndex((item) => item.key === req.ruleKey);
  if (ruleIdx === -1) {
    nextRules.push({
      key: req.ruleKey,
      label: req.ruleLabel,
      amount: req.requestedAmount,
      enabled: false,
      updatedAt: new Date().toISOString(),
      updatedByUserId: approverUserId,
    });
  } else {
    nextRules[ruleIdx] = {
      ...nextRules[ruleIdx],
      amount: req.requestedAmount,
      updatedAt: new Date().toISOString(),
      updatedByUserId: approverUserId,
    };
  }

  requests[idx] = {
    ...req,
    status: "approved",
    approverUserId,
    approvalNote: approvalNote?.trim() || undefined,
    approvedAt: new Date().toISOString(),
  };

  await AsyncStorage.multiSet([
    [KEYS.STANDARD_AMOUNTS, JSON.stringify(nextRules)],
    [KEYS.STANDARD_AMOUNT_CHANGE_REQUESTS, JSON.stringify(requests)],
  ]);

  await pushSystemEvent({
    title: `Amount updated: ${req.ruleLabel}`,
    description: `${req.previousAmount.toLocaleString()} KS → ${req.requestedAmount.toLocaleString()} KS`,
    createdByUserId: approverUserId,
  });
}

export async function rejectStandardAmountChangeRequest(requestId: string, approverUserId: string, approvalNote?: string): Promise<void> {
  const requests = await getStandardAmountChangeRequests();
  const idx = requests.findIndex((item) => item.id === requestId);
  if (idx === -1) throw new Error("request_not_found");
  if (requests[idx].status !== "pending_approval") throw new Error("request_not_pending");
  requests[idx] = {
    ...requests[idx],
    status: "rejected",
    approverUserId,
    approvalNote: approvalNote?.trim() || undefined,
    approvedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEYS.STANDARD_AMOUNT_CHANGE_REQUESTS, JSON.stringify(requests));
}

export async function getExpenseClaims(): Promise<ExpenseClaim[]> {
  const rows = await safeGet<ExpenseClaim[]>(KEYS.EXPENSE_CLAIMS, []);
  return Array.isArray(rows) ? rows : [];
}

export async function createExpenseClaim(input: Omit<ExpenseClaim, "id" | "claimNumber" | "status" | "createdAt" | "updatedAt">): Promise<ExpenseClaim> {
  const claims = await getExpenseClaims();
  const now = new Date().toISOString();
  const claim: ExpenseClaim = {
    id: generateId(),
    claimNumber: makeClaimNumber(claims),
    claimDate: input.claimDate || toYmd(new Date()),
    expenseCategory: String(input.expenseCategory || "other_expenses"),
    expenseCategoryLabel: String(input.expenseCategoryLabel || input.expenseCategory || "Other"),
    claimantType: input.claimantType,
    claimantMemberId: input.claimantMemberId,
    relatedMemberId: input.relatedMemberId,
    relatedMemberName: input.relatedMemberName,
    claimantName: String(input.claimantName || "").trim(),
    claimantAddress: input.claimantAddress?.trim() || undefined,
    familyMemberName: input.familyMemberName?.trim() || undefined,
    familyRelation: input.familyRelation?.trim() || undefined,
    relationDescription: input.relationDescription?.trim() || undefined,
    nrc: input.nrc?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    reason: String(input.reason || "").trim(),
    linkedEventId: input.linkedEventId?.trim() || undefined,
    linkedEventTitle: input.linkedEventTitle?.trim() || undefined,
    requestedAmount: Number(input.requestedAmount || 0),
    approvedAmount: undefined,
    status: "pending_approval",
    createdByUserId: input.createdByUserId,
    createdByMemberId: input.createdByMemberId,
    createdAt: now,
    updatedAt: now,
  };
  await AsyncStorage.setItem(KEYS.EXPENSE_CLAIMS, JSON.stringify([claim, ...claims]));
  await pushSystemEvent({
    title: `Expense Claim Submitted (${claim.claimNumber})`,
    description: `${claim.claimantName} - ${claim.requestedAmount.toLocaleString()} KS (${claim.expenseCategoryLabel})`,
    createdByUserId: claim.createdByUserId,
    createdByMemberId: claim.createdByMemberId,
  });
  return claim;
}

export async function approveExpenseClaim(input: {
  claimId: string;
  approverUserId: string;
  approvedAmount: number;
  approvalNote?: string;
}): Promise<void> {
  const claims = await getExpenseClaims();
  const idx = claims.findIndex((item) => item.id === input.claimId);
  if (idx === -1) throw new Error("claim_not_found");
  if (claims[idx].status !== "pending_approval") throw new Error("claim_not_pending");
  claims[idx] = {
    ...claims[idx],
    status: "approved",
    approvedAmount: Number(input.approvedAmount || 0),
    approverUserId: input.approverUserId,
    approvalNote: input.approvalNote?.trim() || undefined,
    approvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEYS.EXPENSE_CLAIMS, JSON.stringify(claims));
  await pushSystemEvent({
    title: `Expense Claim Approved (${claims[idx].claimNumber})`,
    description: `${claims[idx].approvedAmount?.toLocaleString() || 0} KS approved`,
    createdByUserId: input.approverUserId,
  });
}

export async function rejectExpenseClaim(input: {
  claimId: string;
  approverUserId: string;
  approvalNote: string;
}): Promise<void> {
  const claims = await getExpenseClaims();
  const idx = claims.findIndex((item) => item.id === input.claimId);
  if (idx === -1) throw new Error("claim_not_found");
  if (claims[idx].status !== "pending_approval") throw new Error("claim_not_pending");
  claims[idx] = {
    ...claims[idx],
    status: "rejected",
    approverUserId: input.approverUserId,
    approvalNote: input.approvalNote?.trim() || undefined,
    approvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEYS.EXPENSE_CLAIMS, JSON.stringify(claims));
  await pushSystemEvent({
    title: `Expense Claim Rejected (${claims[idx].claimNumber})`,
    description: claims[idx].approvalNote || "Claim rejected",
    createdByUserId: input.approverUserId,
  });
}

export async function disburseExpenseClaim(input: {
  claimId: string;
  disburserUserId: string;
  method: DisbursementMethod;
  disbursementDate: string;
  voucherNumber?: string;
  note?: string;
}): Promise<void> {
  const claims = await getExpenseClaims();
  const idx = claims.findIndex((item) => item.id === input.claimId);
  if (idx === -1) throw new Error("claim_not_found");
  const claim = claims[idx];
  if (claim.status !== "approved") throw new Error("claim_not_approved");
  const amount = Number(claim.approvedAmount || claim.requestedAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_approved_amount");

  const txn = await addTransaction({
    memberId: claim.claimantMemberId || undefined,
    payerPayee: claim.claimantName,
    amount,
    type: "expense",
    category: claim.expenseCategory,
    paymentMethod: input.method,
    date: input.disbursementDate,
    notes: claim.reason,
    receiptNumber: input.voucherNumber?.trim() || claim.claimNumber,
    categoryLabel: claim.expenseCategoryLabel,
  });

  claims[idx] = {
    ...claim,
    status: "disbursed",
    disburserUserId: input.disburserUserId,
    disbursementMethod: input.method,
    disbursementDate: input.disbursementDate,
    voucherNumber: input.voucherNumber?.trim() || undefined,
    disbursementNote: input.note?.trim() || undefined,
    disbursedAt: new Date().toISOString(),
    linkedTransactionId: txn.id,
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEYS.EXPENSE_CLAIMS, JSON.stringify(claims));
  await pushSystemEvent({
    title: `Expense Disbursed (${claim.claimNumber})`,
    description: `${amount.toLocaleString()} KS • ${input.method.toUpperCase()}`,
    createdByUserId: input.disburserUserId,
  });
}

export async function getMemberPaymentRequests(): Promise<MemberPaymentRequest[]> {
  const rows = await safeGet<MemberPaymentRequest[]>(KEYS.MEMBER_PAYMENT_REQUESTS, []);
  return Array.isArray(rows) ? rows : [];
}

export async function createMemberPaymentRequest(input: {
  kind: MemberPaymentRequestKind;
  amount: number;
  payerMemberId?: string;
  payerName: string;
  walletProvider: MobileWalletProvider;
  walletAccountName?: string;
  walletAccountNumber?: string;
  walletReference?: string;
  proofImage?: string;
  note?: string;
  requestedDate?: string;
  createdByUserId: string;
  createdByMemberId?: string;
}): Promise<MemberPaymentRequest> {
  const requests = await getMemberPaymentRequests();
  const now = new Date().toISOString();
  const mapping = mapPaymentRequestKindToIncomeCategory(input.kind);
  const request: MemberPaymentRequest = {
    id: generateId(),
    requestNumber: makePaymentRequestNumber(requests),
    kind: input.kind,
    category: mapping.category,
    categoryLabel: mapping.categoryLabel,
    amount: Number(input.amount || 0),
    payerMemberId: input.payerMemberId,
    payerName: String(input.payerName || "").trim(),
    walletProvider: input.walletProvider,
    walletAccountName: input.walletAccountName?.trim() || undefined,
    walletAccountNumber: input.walletAccountNumber?.trim() || undefined,
    walletReference: input.walletReference?.trim() || undefined,
    proofImage: input.proofImage || undefined,
    note: input.note?.trim() || undefined,
    status: "pending_treasurer_review",
    requestedDate: input.requestedDate || toYmd(new Date()),
    createdByUserId: input.createdByUserId,
    createdByMemberId: input.createdByMemberId,
    createdAt: now,
    updatedAt: now,
    notifiedRoles: ["treasurer", "chairperson", "vice_chairperson", "secretary", "joint_secretary", "auditor"],
  };
  await AsyncStorage.setItem(KEYS.MEMBER_PAYMENT_REQUESTS, JSON.stringify([request, ...requests]));
  await pushSystemEvent({
    title: `Payment Request Submitted (${request.requestNumber})`,
    description: `${request.payerName} • ${request.amount.toLocaleString()} KS • ${request.categoryLabel}`,
    createdByUserId: request.createdByUserId,
    createdByMemberId: request.createdByMemberId,
  });
  return request;
}

export async function approveMemberPaymentRequest(input: {
  requestId: string;
  reviewerUserId: string;
  reviewNote?: string;
  acceptedDate?: string;
}): Promise<void> {
  const requests = await getMemberPaymentRequests();
  const idx = requests.findIndex((item) => item.id === input.requestId);
  if (idx === -1) throw new Error("request_not_found");
  const request = requests[idx];
  if (request.status !== "pending_treasurer_review") throw new Error("request_not_pending");

  const acceptedDate = input.acceptedDate || toYmd(new Date());
  const txn = await addTransaction({
    memberId: request.payerMemberId || undefined,
    payerPayee: request.payerName,
    amount: Number(request.amount || 0),
    type: "income",
    category: request.category,
    paymentMethod: "bank",
    date: acceptedDate,
    notes:
      request.note ||
      `${request.categoryLabel} (${request.walletProvider})`,
    receiptNumber: request.requestNumber,
    categoryLabel: request.categoryLabel,
  });

  requests[idx] = {
    ...request,
    status: "approved",
    reviewedByUserId: input.reviewerUserId,
    reviewNote: input.reviewNote?.trim() || undefined,
    reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    linkedTransactionId: txn.id,
  };
  await AsyncStorage.setItem(KEYS.MEMBER_PAYMENT_REQUESTS, JSON.stringify(requests));
  await pushSystemEvent({
    title: `Payment Request Approved (${request.requestNumber})`,
    description: `${request.amount.toLocaleString()} KS ကို ရငွေစာရင်းသို့ ထည့်သွင်းပြီးပါပြီ`,
    createdByUserId: input.reviewerUserId,
  });
}

export async function rejectMemberPaymentRequest(input: {
  requestId: string;
  reviewerUserId: string;
  reviewNote: string;
}): Promise<void> {
  const requests = await getMemberPaymentRequests();
  const idx = requests.findIndex((item) => item.id === input.requestId);
  if (idx === -1) throw new Error("request_not_found");
  const request = requests[idx];
  if (request.status !== "pending_treasurer_review") throw new Error("request_not_pending");

  requests[idx] = {
    ...request,
    status: "rejected",
    reviewedByUserId: input.reviewerUserId,
    reviewNote: input.reviewNote?.trim() || undefined,
    reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEYS.MEMBER_PAYMENT_REQUESTS, JSON.stringify(requests));
  await pushSystemEvent({
    title: `Payment Request Rejected (${request.requestNumber})`,
    description: requests[idx].reviewNote || "Rejected by treasurer",
    createdByUserId: input.reviewerUserId,
  });
}

// --- Events ---
export const getEvents = () => safeGet<OrgEvent[]>(KEYS.EVENTS, []);

export async function addEvent(event: any) {
  const events = await getEvents();
  const newEvent = { ...event, id: generateId() };
  await AsyncStorage.setItem(KEYS.EVENTS, JSON.stringify([...events, newEvent]));
  return newEvent;
}

export async function updateEvent(id: string, updates: any) {
  const events = await getEvents();
  const idx = events.findIndex(e => e.id === id);
  if (idx !== -1) {
    events[idx] = { ...events[idx], ...updates };
    await AsyncStorage.setItem(KEYS.EVENTS, JSON.stringify(events));
  }
}

export async function deleteEvent(id: string) {
  const events = await getEvents();
  await AsyncStorage.setItem(KEYS.EVENTS, JSON.stringify(events.filter(e => e.id !== id)));
}

// --- Groups ---
export const getGroups = () => safeGet<Group[]>(KEYS.GROUPS, []);
export const saveGroups = (data: Group[]) => AsyncStorage.setItem(KEYS.GROUPS, JSON.stringify(data));

export async function addGroup(group: any) {
  const groups = await getGroups();
  const newGroup = { ...group, id: generateId() };
  await saveGroups([...groups, newGroup]);
  return newGroup;
}

export async function updateGroup(id: string, updates: any) {
  const groups = await getGroups();
  const idx = groups.findIndex(g => g.id === id);
  if (idx !== -1) {
    groups[idx] = { ...groups[idx], ...updates };
    await saveGroups(groups);
  }
}

export async function deleteGroup(id: string) {
  const groups = await getGroups();
  await saveGroups(groups.filter(g => g.id !== id));
}

// --- Attendance ---
export const getAttendance = () => safeGet<AttendanceRecord[]>(KEYS.ATTENDANCE, []);

export async function saveAttendance(eventId: string, memberId: string, status: string) {
  const records = await getAttendance();
  const idx = records.findIndex(r => r.eventId === eventId && r.memberId === memberId);
  if (idx !== -1) {
    records[idx].status = status as any;
  } else {
    records.push({ id: generateId(), eventId, memberId, status: status as any, date: new Date().toISOString() });
  }
  await AsyncStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(records));
}

// --- Transactions ---
export const getTransactions = () => safeGet<Transaction[]>(KEYS.TRANSACTIONS, []);

export async function addTransaction(txn: any) {
  const txns = await getTransactions();
  const newTxn = { ...txn, id: generateId() };
  await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify([newTxn, ...txns]));
  return newTxn;
}

export async function updateTransaction(id: string, updates: any) {
  const txns = await getTransactions();
  const idx = txns.findIndex((item) => item.id === id);
  if (idx !== -1) {
    txns[idx] = { ...txns[idx], ...updates };
    await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(txns));
  }
}

export async function saveTransactions(data: Transaction[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(data));
}

export async function importTransactions(newTransactions: Transaction[]): Promise<void> {
  const existing = await getTransactions();
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const txn of newTransactions) {
    if (!txn?.id) continue;
    byId.set(txn.id, txn);
  }
  await saveTransactions(Array.from(byId.values()));
}

export async function deleteTransaction(id: string) {
  const txns = await getTransactions();
  await AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(txns.filter(t => t.id !== id)));
}

// --- Loans ---
export const getLoans = () => safeGet<Loan[]>(KEYS.LOANS, []);

export async function addLoan(loan: any) {
  const loans = await getLoans();
  const newLoan = { ...loan, id: generateId() };
  await AsyncStorage.setItem(KEYS.LOANS, JSON.stringify([...loans, newLoan]));
  return newLoan;
}

export async function updateLoan(id: string, updates: any) {
  const loans = await getLoans();
  const idx = loans.findIndex(l => l.id === id);
  if (idx !== -1) {
    loans[idx] = { ...loans[idx], ...updates };
    await AsyncStorage.setItem(KEYS.LOANS, JSON.stringify(loans));
  }
}

export async function deleteLoan(id: string) {
  const loans = await getLoans();
  await AsyncStorage.setItem(KEYS.LOANS, JSON.stringify(loans.filter(l => l.id !== id)));
}

// --- Settings ---
export async function getAccountSettings(): Promise<AccountSettings> {
  return safeGet<AccountSettings>(KEYS.ACCOUNT_SETTINGS, {
    orgName: "My Organization",
    openingBalanceCash: 0,
    openingBalanceBank: 0,
    currency: "MMK",
    asOfDate: new Date().toISOString(),
    syncServerUrl: DEFAULT_SYNC_SERVER_URL,
    syncEnabled: true,
  });
}

export async function saveAccountSettings(settings: AccountSettings) {
  await AsyncStorage.setItem(KEYS.ACCOUNT_SETTINGS, JSON.stringify(settings));
}

function normalizeSyncServerUrl(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function parseImageDataUrl(value: string): { mime: string; base64: string } | null {
  const matched = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (!matched) return null;
  return { mime: matched[1], base64: matched[2] };
}

async function compressImageDataUrl(value: string): Promise<string> {
  const looksLikeImageDataUrl = /^data:image\//i.test(value);
  if (!looksLikeImageDataUrl) return value;
  if (value.length <= 4096) return value;
  if (Platform.OS === "web") return value;

  const parsed = parseImageDataUrl(value);
  if (!parsed) return value;

  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir) return value;

  const isPng = /png/i.test(parsed.mime);
  const srcExt = isPng ? "png" : "jpg";
  const tempUri = `${baseDir}sync_img_${Date.now()}_${Math.random().toString(36).slice(2)}.${srcExt}`;

  try {
    await FileSystem.writeAsStringAsync(tempUri, parsed.base64, {
      // @ts-ignore
      encoding: FileSystem.EncodingType.Base64,
    });
    const result = await ImageManipulator.manipulateAsync(
      tempUri,
      [{ resize: { width: 768 } }],
      {
        compress: 0.58,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );
    if (!result?.base64) return value;
    return `data:image/jpeg;base64,${result.base64}`;
  } catch {
    return value;
  } finally {
    try {
      await FileSystem.deleteAsync(tempUri, { idempotent: true });
    } catch {}
  }
}

async function resolveSyncServerUrl(): Promise<{ url: string; enabled: boolean }> {
  const settings = await getAccountSettings();
  const url = normalizeSyncServerUrl(
    settings.syncServerUrl || DEFAULT_SYNC_SERVER_URL
  );
  const enabled = settings.syncEnabled !== false && !!url;
  return { url, enabled };
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 8000): Promise<Response> {
  return await Promise.race([
    fetch(input, init),
    new Promise<Response>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error("timeout"));
      }, timeoutMs);
    }),
  ]);
}

async function compressLargeDataUrlDeep(input: unknown): Promise<unknown> {
  if (Array.isArray(input)) {
    return await Promise.all(input.map((row) => compressLargeDataUrlDeep(row)));
  }
  if (!input || typeof input !== "object") return input;

  const obj = input as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      next[key] = await compressImageDataUrl(value);
      continue;
    }
    next[key] = await compressLargeDataUrlDeep(value);
  }
  return next;
}

export async function sanitizeExportForLanSync(data: Record<string, string>): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(data)) {
    try {
      const parsed = JSON.parse(raw);
      const cleaned = await compressLargeDataUrlDeep(parsed);
      result[key] = JSON.stringify(cleaned);
    } catch {
      result[key] = raw;
    }
  }
  return result;
}

export async function checkLanSyncHealth(): Promise<{ ok: boolean; url?: string; reason?: string; status?: number }> {
  try {
    const { url, enabled } = await resolveSyncServerUrl();
    if (!enabled) return { ok: false, url, reason: "disabled_or_empty_url" };
    const res = await fetchWithTimeout(`${url}/api/sync/health`, { method: "GET" }, 12000);
    if (!res.ok) return { ok: false, url, status: res.status, reason: "health_http_error" };
    return { ok: true, url, status: res.status };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || "health_fetch_failed") };
  }
}

export type LanSyncResult = {
  ok: boolean;
  changed?: boolean;
  reason?: string;
  status?: number;
  url?: string;
};

export async function pushLanSnapshotFromLocalDetailed(): Promise<LanSyncResult> {
  try {
    const { url, enabled } = await resolveSyncServerUrl();
    if (!enabled) return { ok: false, reason: "disabled_or_empty_url", url };
    const raw = await exportData();
    const data = await sanitizeExportForLanSync(JSON.parse(raw) as Record<string, string>);
    const payload = {
      updatedAt: new Date().toISOString(),
      source: "mobile",
      data,
    };
    const res = await fetchWithTimeout(`${url}/api/sync/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, 20000);
    if (!res.ok) return { ok: false, reason: "push_http_error", status: res.status, url };
    return { ok: true, changed: true, reason: "pushed", status: res.status, url };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || "push_failed") };
  }
}

export async function pullLanSnapshotToLocalDetailed(): Promise<LanSyncResult> {
  try {
    const { url, enabled } = await resolveSyncServerUrl();
    if (!enabled) return { ok: false, reason: "disabled_or_empty_url", url };
    const res = await fetchWithTimeout(`${url}/api/sync/snapshot`, { method: "GET" }, 20000);
    if (res.status === 404) {
      return { ok: true, changed: false, reason: "snapshot_not_found", status: res.status, url };
    }
    if (!res.ok) return { ok: false, reason: "pull_http_error", status: res.status, url };
    const payload = (await res.json()) as { updatedAt?: string; data?: Record<string, string> };
    if (!payload || typeof payload !== "object" || !payload.data) {
      return { ok: false, reason: "invalid_snapshot_payload", url };
    }

    const incomingUpdatedAt = String(payload.updatedAt || "");
    const lastApplied = String((await AsyncStorage.getItem(SYNC_LAST_SERVER_UPDATED_AT_KEY)) || "");
    if (incomingUpdatedAt && incomingUpdatedAt === lastApplied) {
      return { ok: true, changed: false, reason: "already_applied", url };
    }

    const merged = await mergeData(JSON.stringify(payload.data));
    if (incomingUpdatedAt) {
      await AsyncStorage.setItem(SYNC_LAST_SERVER_UPDATED_AT_KEY, incomingUpdatedAt);
    }
    return { ok: true, changed: merged, reason: merged ? "pulled_applied" : "pulled_no_change", url };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || "pull_failed") };
  }
}

export async function pushLanSnapshotFromLocal(): Promise<boolean> {
  const result = await pushLanSnapshotFromLocalDetailed();
  return result.ok;
}

export async function pullLanSnapshotToLocal(): Promise<boolean> {
  const result = await pullLanSnapshotToLocalDetailed();
  return result.ok && !!result.changed;
}

// --- Users ---
export const getUsers = () => safeGet<UserAccount[]>(KEYS.USERS, []);
export const saveUsers = (data: UserAccount[]) => AsyncStorage.setItem(KEYS.USERS, JSON.stringify(data));

export async function seedDefaultAdminUser() {
  // 1. Seeding: If no members exist, try to load from default-data.json
  const existingMembers = await getMembers();
  if (existingMembers.length === 0) {
    try {
      // Expo Go တွင် Data များပါလာစေရန် require ကိုအသုံးပြု၍ Bundle လုပ်ပါသည်
      // @ts-ignore
      const data = require("../assets/data/default-data.json");
      const pairs: [string, string][] = [];

      // default-data.json တွင် Key များနှင့် Value များသည် သိမ်းဆည်းထားသည့်အတိုင်း (Stringified JSON) ပါရှိပြီးဖြစ်သည်
      Object.values(KEYS).forEach((key) => {
        if (data[key]) {
          pairs.push([key, data[key]]);
        }
      });

      if (pairs.length > 0) await AsyncStorage.multiSet(pairs);
    } catch (e) {
      console.log("Seeding skipped (no default data found):", e);
    }
  }

  const users = await getUsers();
  const adminExists = users.some(u => u.systemRole === "admin");
  if (!adminExists) {
    const admin: UserAccount = {
      id: "admin-001",
      displayName: "System Admin",
      systemRole: "admin",
      isActive: true,


      createdAt: new Date().toISOString()
    };
    await saveUsers([admin, ...users]);
  }

  // Sync existing members to user accounts
  const members = await getMembers();
  await syncUsersWithMembers(members);
  const syncedUsers = await getUsers();
  await ensureDefaultPasswordsForUsers(syncedUsers, members);
}

export async function upsertUserAccount(user: UserAccount) {
  const users = await getUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx !== -1) {
    users[idx] = user;
  } else {
    users.push(user);
  }
  await saveUsers(users);
}

export async function deleteUserAccount(id: string) {
  const users = await getUsers();
  await saveUsers(users.filter(u => u.id !== id));
}

// Backup Data (Export All)
export async function exportData(): Promise<string> {
  const keys = Object.values(KEYS);
  const result = await AsyncStorage.multiGet(keys);
  const exportObj: Record<string, string> = {};
  
  result.forEach(([key, value]) => {
    if (value) {
      exportObj[key] = value;
    }
  });
  
  return JSON.stringify(exportObj);
}

// Restore Data (Import All)
export async function restoreData(jsonString: string): Promise<boolean> {
  try {
    const exportObj = JSON.parse(jsonString);
    const pairs: [string, string][] = [];
    
    Object.values(KEYS).forEach((key) => {
      if (exportObj[key]) {
        pairs.push([key, exportObj[key]]);
      }
    });

    if (pairs.length > 0) {
      await AsyncStorage.multiSet(pairs);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Restore failed:", error);
    return false;
  }
}

function parseJsonSafe<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function mergeRecordsById<T extends { id?: string }>(existing: T[], incoming: T[]): T[] {
  const result = [...existing];
  const indexById = new Map<string, number>();

  for (let i = 0; i < result.length; i += 1) {
    const id = String(result[i]?.id || "").trim();
    if (!id) continue;
    indexById.set(id, i);
  }

  for (const row of incoming) {
    const id = String(row?.id || "").trim();
    if (!id) {
      result.push(row);
      continue;
    }
    const idx = indexById.get(id);
    if (idx === undefined) {
      indexById.set(id, result.length);
      result.push(row);
    } else {
      result[idx] = row;
    }
  }

  return result;
}

export async function mergeData(jsonString: string): Promise<boolean> {
  try {
    const exportObj = JSON.parse(jsonString) as Record<string, unknown>;

    const keys = Object.values(KEYS);
    let changed = false;

    for (const key of keys) {
      if (!(key in exportObj)) continue;
      const incomingRaw = exportObj[key];
      const existingRaw = await AsyncStorage.getItem(key);

      if (key === KEYS.ACCOUNT_SETTINGS) {
        const existingSettings = parseJsonSafe<Record<string, unknown>>(existingRaw, {});
        const incomingSettings = parseJsonSafe<Record<string, unknown>>(incomingRaw, {});
        const mergedSettings = { ...existingSettings, ...incomingSettings };
        await AsyncStorage.setItem(key, JSON.stringify(mergedSettings));
        changed = true;
        continue;
      }

      if (key === KEYS.USER_PASSWORDS) {
        const existingPasswords = parseJsonSafe<Record<string, string>>(existingRaw, {});
        const incomingPasswords = parseJsonSafe<Record<string, string>>(incomingRaw, {});
        const mergedPasswords = { ...existingPasswords, ...incomingPasswords };
        await AsyncStorage.setItem(key, JSON.stringify(mergedPasswords));
        changed = true;
        continue;
      }

      const existingArray = parseJsonSafe<any[]>(existingRaw, []);
      const incomingArray = parseJsonSafe<any[]>(incomingRaw, []);
      if (!Array.isArray(incomingArray)) continue;

      const mergedArray = mergeRecordsById(existingArray, incomingArray);
      await AsyncStorage.setItem(key, JSON.stringify(mergedArray));
      changed = true;
    }

    return changed;
  } catch (error) {
    console.error("Merge failed:", error);
    return false;
  }
}

export function generateReceiptNumber(): string {
  return `REC-${Date.now().toString().slice(-6)}`;
}

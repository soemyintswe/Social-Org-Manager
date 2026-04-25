import orgStorage, { systemStorage } from "./org-storage";
import NativeAsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import {
  Member,
  MemberFamilyMember,
  MemberOrgPositionHistoryEntry,
  OrgEvent,
  Group,
  AttendanceRecord,
  Transaction,
  Loan,
  AccountSettings,
  UserAccount,
  MemberChangeRequest,
  MemberChangeAction,
  AuditChangeRequest,
  AuditChangeRequestMessage,
  AuditChangeRequestStatus,
  AuditChangeMessageType,
  AuditChangeDrafts,
  AuditChangeRevision,
  AuditExecutionLog,
  AuditChangeRequestKind,
  AuditChangeTargetType,
  AuditChangeWorkflowStage,
  ExpenseClaim,
  MemberPaymentRequest,
  MemberPaymentRequestKind,
  MobileWalletProvider,
  StandardAmountRule,
  StandardAmountChangeRequest,
  DEFAULT_STANDARD_AMOUNT_RULES,
  DisbursementMethod,
  ChatThread,
  ChatMessage,
  AppNotification,
  OrgPosition,
  normalizeMemberStatus,
  normalizeOrgPosition,
} from "./types";
import { splitPhoneNumbers, toEnglishDigits } from "./member-utils";
import {
  DEFAULT_CLOUD_SYNC_ENDPOINT as DEFAULT_CLOUD_SYNC_ENDPOINT_BASE,
  DEFAULT_CLOUD_SYNC_FOLDER_NAME,
  DEFAULT_LAN_SYNC_URL as DEFAULT_LAN_SYNC_URL_BASE,
} from "./sync-defaults";
import {
  getActiveOrgId,
  getManagedCloudSyncEnabled,
  getManagedLanSyncUrlForOrg,
  getManagedSyncLockdownEnabled,
  REMOTE_CONFIG_KEYS,
  resolveConfigValueWithPriorityForOrg,
  getSyncRetryBaseDelayMs,
  getSyncRetryMaxAttempts,
} from "./remote-config";
import { ensureOrgLicenseActive, fetchSystemAdminPasswordRemote, saveSystemAdminPasswordRemote } from "./org-registry";
import { computeSnapshotHash, verifySnapshotHash } from "./sync-integrity";
import { runWithRetry } from "./sync-queue";

const AsyncStorage = orgStorage;
const RawAsyncStorage = NativeAsyncStorage;

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
  AUDIT_CHANGE_REQUESTS: "@orghub_audit_change_requests",
  AUDIT_EXECUTION_LOGS: "@orghub_audit_execution_logs",
  EXPENSE_CLAIMS: "@orghub_expense_claims",
  MEMBER_PAYMENT_REQUESTS: "@orghub_member_payment_requests",
  STANDARD_AMOUNTS: "@orghub_standard_amounts",
  STANDARD_AMOUNT_CHANGE_REQUESTS: "@orghub_standard_amount_change_requests",
  CHAT_THREADS: "@orghub_chat_threads",
  CHAT_MESSAGES: "@orghub_chat_messages",
  NOTIFICATIONS: "@orghub_notifications",
};

const MEMBER_JOIN_DATE_FALLBACK_DMY = "01/01/2018";
const MEMBER_JOIN_DATE_MIGRATION_V1_KEY = "@orghub_member_join_date_migration_v1";
const AUDIT_REQUEST_CLEANUP_V4_KEY = "@orghub_audit_request_cleanup_v4";

const EXTRA_SHARED_KEYS = [
  "@custom_categories",
  "@org_notice_custom_topics",
  "@org_notice_custom_relations",
  "@org_notice_custom_conditions",
] as const;

const APP_STORAGE_PREFIX = "@orghub_";
const ORG_STORAGE_PREFIX = "@orgdb:";
const SYSTEM_STORAGE_PREFIX = "@sysdb:";
const SHARED_EXTRA_KEY_PREFIXES = ["@org_notice_custom_"] as const;
const SYSTEM_ADMIN_PASSWORD_KEY = "@orghub_system_admin_password";
const SYSTEM_ADMIN_PASSWORD_WEB_MIRROR_KEY = "__orghub_system_admin_password_web_v1";
const SYSTEM_ADMIN_PASSWORD_UPDATED_AT_KEY = "@orghub_system_admin_password_updated_at";
const SYSTEM_ADMIN_PASSWORD_UPDATED_AT_WEB_MIRROR_KEY = "__orghub_system_admin_password_updated_at_web_v1";
const DEFAULT_SYSTEM_ADMIN_PASSWORD = "Admin";
const MEMBER_PASSWORD_CLOUD_SYNC_DEBOUNCE_MS = 1500;

let memberPasswordCloudSyncTimer: ReturnType<typeof setTimeout> | null = null;
let memberPasswordCloudSyncInFlight = false;

const BACKUP_EXCLUDED_KEYS = new Set<string>([
  SYSTEM_ADMIN_PASSWORD_KEY,
  SYSTEM_ADMIN_PASSWORD_UPDATED_AT_KEY,
  "@orghub_auth_session",
  "@orghub_auth_background_marked",
  "@orghub_login_guard",
  "@orghub_sync_last_server_updated_at",
  "@orghub_expense_claim_draft",
  MEMBER_JOIN_DATE_MIGRATION_V1_KEY,
  "@member_change_last_seen_at",
  "@auto_backup_enabled",
  "@last_birthday_notification",
  "@app_update_last_checked_at",
  "@app_update_skipped_version",
  "@orghub_cloud_sync_last_remote_updated_at",
  "@orghub_cloud_sync_last_remote_hash",
]);

const RESET_ONLY_PREFIXES = [
  "@event_notification_seen_ids_",
  "@comment_notification_seen_ids_",
  "@chat_notification_seen_ids_",
  "@request_notification_seen_ids_",
  "@app_update_",
] as const;

const RESET_ONLY_KEYS = new Set<string>([
  ...Array.from(BACKUP_EXCLUDED_KEYS),
  "@orghub_auth_background_marked",
  MEMBER_JOIN_DATE_MIGRATION_V1_KEY,
]);
const EMPTY_ORG_STATE_KEY = "@orghub_empty_org_state_v1";
const SYNC_SCOPE_META_KEY = "@orghub_sync_scope_meta";

function hasAnyPrefix(key: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => key.startsWith(prefix));
}

function isNotificationSeenKey(key: string): boolean {
  return hasAnyPrefix(key, [
    "@event_notification_seen_ids_",
    "@comment_notification_seen_ids_",
    "@chat_notification_seen_ids_",
    "@request_notification_seen_ids_",
  ]);
}

function isOrgOwnedStorageKey(key: string): boolean {
  if (!key) return false;
  if (key.startsWith(APP_STORAGE_PREFIX)) return true;
  if (EXTRA_SHARED_KEYS.includes(key as any)) return true;
  if (hasAnyPrefix(key, SHARED_EXTRA_KEY_PREFIXES)) return true;
  if (hasAnyPrefix(key, RESET_ONLY_PREFIXES)) return true;
  if (RESET_ONLY_KEYS.has(key)) return true;
  return false;
}

function isSharedBackupKey(key: string): boolean {
  if (!key) return false;
  if (BACKUP_EXCLUDED_KEYS.has(key)) return false;
  if (isNotificationSeenKey(key)) return false;
  if (key.startsWith(APP_STORAGE_PREFIX)) return true;
  if (EXTRA_SHARED_KEYS.includes(key as any)) return true;
  if (hasAnyPrefix(key, SHARED_EXTRA_KEY_PREFIXES)) return true;
  return false;
}

async function getAllSharedBackupKeys(): Promise<string[]> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const dynamic = all.filter((key) => isSharedBackupKey(String(key || "")));
    if (dynamic.length > 0) return dynamic;
  } catch {}
  return [...Object.values(KEYS), ...EXTRA_SHARED_KEYS];
}

const SYNC_LAST_SERVER_UPDATED_AT_KEY = "@orghub_sync_last_server_updated_at";
const CLOUD_SYNC_LAST_REMOTE_UPDATED_AT_KEY = "@orghub_cloud_sync_last_remote_updated_at";
const CLOUD_SYNC_LAST_REMOTE_HASH_KEY = "@orghub_cloud_sync_last_remote_hash";
const AUDIT_TEST_CLEANUP_TOMBSTONES_KEY = "@orghub_audit_test_cleanup_tombstones_v1";
const DEFAULT_SYNC_SERVER_URL = String((process.env as any).EXPO_PUBLIC_SYNC_SERVER_URL || DEFAULT_LAN_SYNC_URL_BASE);
const DEFAULT_CLOUD_SYNC_ENDPOINT = String((process.env as any).EXPO_PUBLIC_CLOUD_SYNC_ENDPOINT || DEFAULT_CLOUD_SYNC_ENDPOINT_BASE);

const AVATAR_COLORS = ["#0D9488", "#F43F5E", "#8B5CF6", "#F59E0B", "#3B82F6", "#10B981", "#EC4899", "#6366F1"];

let entropyCounter = 0;
function getSecureRandomBytes(byteLength: number): Uint8Array {
  const safeLength = Math.max(1, Math.floor(byteLength));
  const output = new Uint8Array(safeLength);
  const webCrypto = (globalThis as any)?.crypto;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(output);
    return output;
  }

  // Fallback for older runtimes: derive bytes from UUID/time without Math.random().
  let fallbackSeed = "";
  try {
    fallbackSeed = String(Crypto.randomUUID() || "").replace(/-/g, "");
  } catch {
    fallbackSeed = "";
  }
  if (!fallbackSeed) {
    entropyCounter = (entropyCounter + 1) % 2147483647;
    fallbackSeed = `${Date.now().toString(16)}${entropyCounter.toString(16)}`;
  }
  for (let i = 0; i < output.length; i += 1) {
    const code = fallbackSeed.charCodeAt(i % fallbackSeed.length) || (i * 31);
    output[i] = code & 0xff;
  }
  return output;
}

function randomToken(size = 10): string {
  const bytes = getSecureRandomBytes(Math.ceil(size / 2));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, Math.max(1, size));
}

function secureRandomInt(maxExclusive: number): number {
  const max = Math.floor(maxExclusive);
  if (!Number.isFinite(max) || max <= 1) return 0;
  const bytes = getSecureRandomBytes(4);
  const value =
    ((bytes[0] << 24) >>> 0) +
    ((bytes[1] << 16) >>> 0) +
    ((bytes[2] << 8) >>> 0) +
    (bytes[3] >>> 0);
  return value % max;
}

function generateId(): string {
  return `${Date.now().toString()}${randomToken(10)}`;
}

export function randomColor(): string {
  return AVATAR_COLORS[secureRandomInt(AVATAR_COLORS.length)];
}

function normalizeFamilyMembers(input: unknown): MemberFamilyMember[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const rows = input
    .map((row) => {
      const obj = (row || {}) as any;
      const name = String(obj.name || "").trim();
      if (!name) return null;
      return {
        id: obj.id ? String(obj.id) : undefined,
        name,
        gender: obj.gender === "male" || obj.gender === "female" || obj.gender === "other" ? obj.gender : undefined,
        relation: obj.relation ? String(obj.relation).trim() : undefined,
        dob: obj.dob ? String(obj.dob).trim() : undefined,
        nrc: obj.nrc ? String(obj.nrc).trim() : undefined,
        occupation: obj.occupation ? String(obj.occupation).trim() : undefined,
      } as MemberFamilyMember;
    })
    .filter(Boolean) as MemberFamilyMember[];
  return rows.length > 0 ? rows : [];
}

function parseFlexibleDateMs(value: unknown): number {
  const raw = String(value || "").trim();
  if (!raw) return 0;

  const ymd = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    const parsed = new Date(year, month - 1, day).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }

  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const parsed = new Date(year, month - 1, day).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }

  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function toYmdString(value: unknown, fallback?: string): string {
  const ms = parseFlexibleDateMs(value);
  if (ms > 0) {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  if (fallback) return fallback;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hasMemberExitStatus(status: unknown): boolean {
  const normalized = normalizeMemberStatus(status);
  return normalized === "resigned" || normalized === "deceased" || normalized === "expelled" || normalized === "suspended";
}

function getMemberDefaultPosition(member: any): OrgPosition {
  const status = String(member?.status || "").toLowerCase();
  return normalizeOrgPosition(member?.orgPosition || (status.includes("applicant") ? "applicant" : "member"));
}

function normalizeOrgPositionHistory(input: unknown): MemberOrgPositionHistoryEntry[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const rows = input
    .map((row) => {
      const obj = (row || {}) as any;
      const position = normalizeOrgPosition(obj.position || "member");
      const effectiveDate = toYmdString(obj.effectiveDate || obj.assignedAt || obj.date, "");
      if (!effectiveDate) return null;
      return {
        id: obj.id ? String(obj.id) : generateId(),
        position,
        effectiveDate,
        note: obj.note ? String(obj.note).trim() : undefined,
      } as MemberOrgPositionHistoryEntry;
    })
    .filter(Boolean) as MemberOrgPositionHistoryEntry[];
  return rows.length > 0 ? rows : [];
}

function collapseOrgPositionHistory(entries: MemberOrgPositionHistoryEntry[]): MemberOrgPositionHistoryEntry[] {
  const sorted = [...entries].sort((a, b) => {
    const aMs = parseFlexibleDateMs(a.effectiveDate);
    const bMs = parseFlexibleDateMs(b.effectiveDate);
    if (aMs !== bMs) return aMs - bMs;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  const collapsed: MemberOrgPositionHistoryEntry[] = [];
  for (const row of sorted) {
    const last = collapsed[collapsed.length - 1];
    if (!last) {
      collapsed.push(row);
      continue;
    }
    if (last.effectiveDate === row.effectiveDate) {
      collapsed[collapsed.length - 1] = row;
      continue;
    }
    if (last.position === row.position) continue;
    collapsed.push(row);
  }
  return collapsed;
}

function addPositionHistoryEvent(
  history: MemberOrgPositionHistoryEntry[],
  position: OrgPosition,
  effectiveDate: string,
  note?: string
): MemberOrgPositionHistoryEntry[] {
  const next = [...history];
  next.push({
    id: generateId(),
    position,
    effectiveDate: toYmdString(effectiveDate),
    note: note?.trim() || undefined,
  });
  return collapseOrgPositionHistory(next);
}

function ensureMemberPositionHistoryShape(member: any, previousMember?: Member, patch?: any): MemberOrgPositionHistoryEntry[] {
  const joinDate = toYmdString(member?.joinDate || member?.createdAt);
  const basePosition = getMemberDefaultPosition(member);

  const fromMember = normalizeOrgPositionHistory(member?.orgPositionHistory);
  const fromPrevious = normalizeOrgPositionHistory(previousMember?.orgPositionHistory);
  let history = collapseOrgPositionHistory((fromMember && fromMember.length > 0 ? fromMember : fromPrevious) || []);

  if (history.length === 0) {
    history = [
      {
        id: generateId(),
        position: previousMember ? getMemberDefaultPosition(previousMember) : basePosition,
        effectiveDate: joinDate,
      },
    ];
  }

  const previousPosition = previousMember ? getMemberDefaultPosition(previousMember) : undefined;
  const hasExplicitPositionChange =
    !!patch && Object.prototype.hasOwnProperty.call(patch, "orgPosition") && previousPosition !== undefined && previousPosition !== basePosition;

  if (hasExplicitPositionChange) {
    const effectiveDate = toYmdString(
      patch?.orgPositionEffectiveDate || patch?.positionEffectiveDate || patch?.statusDate || member?.statusDate || new Date()
    );
    history = addPositionHistoryEvent(history, basePosition, effectiveDate, patch?.orgPositionNote);
  } else {
    const last = history[history.length - 1];
    if (!last || normalizeOrgPosition(last.position) !== basePosition) {
      const fallbackDate = toYmdString(member?.statusDate || member?.updatedAt || new Date());
      history = addPositionHistoryEvent(history, basePosition, fallbackDate);
    }
  }

  const exitDate = hasMemberExitStatus(member?.status) ? toYmdString(member?.statusDate || member?.resignDate || member?.updatedAt || new Date()) : "";
  if (exitDate) {
    const last = history[history.length - 1];
    if (last && parseFlexibleDateMs(last.effectiveDate) > parseFlexibleDateMs(exitDate)) {
      history = addPositionHistoryEvent(history, last.position, exitDate);
    }
  }

  return collapseOrgPositionHistory(history);
}

function normalizeMemberRecord(member: any, previousMember?: Member, patch?: any): Member {
  const normalized = normalizeMemberPatch(member) as any;
  normalized.orgPosition = getMemberDefaultPosition(normalized);
  normalized.orgPositionHistory = ensureMemberPositionHistoryShape(normalized, previousMember, patch);
  delete normalized.orgPositionEffectiveDate;
  delete normalized.positionEffectiveDate;
  delete normalized.orgPositionNote;
  return normalized as Member;
}

function normalizeMemberPatch(updates: any): Partial<Member> {
  const next: any = { ...(updates || {}) };
  if ("occupation" in next) {
    next.occupation = next.occupation ? String(next.occupation).trim() : undefined;
  }
  if ("profileImage" in next) {
    next.profileImage = next.profileImage ? String(next.profileImage) : undefined;
  }
  if ("familyMembers" in next) {
    next.familyMembers = normalizeFamilyMembers(next.familyMembers);
  }
  if ("orgPositionHistory" in next) {
    next.orgPositionHistory = normalizeOrgPositionHistory(next.orgPositionHistory);
  }
  return next;
}

async function remapMemberIdReferences(oldId: string, newId: string): Promise<void> {
  const from = String(oldId || "").trim();
  const to = String(newId || "").trim();
  if (!from || !to || from === to) return;

  const [
    transactions,
    loans,
    groups,
    users,
    memberChangeRequests,
    events,
    expenseClaims,
    memberPaymentRequests,
    chatMessages,
  ] = await Promise.all([
    getTransactions(),
    getLoans(),
    getGroups(),
    getUsers(),
    getMemberChangeRequests(),
    getEvents(),
    getExpenseClaims(),
    getMemberPaymentRequests(),
    getChatMessages(),
  ]);

  let txChanged = false;
  const nextTransactions = transactions.map((row: any) => {
    if (String(row?.memberId || "") !== from) return row;
    txChanged = true;
    return { ...row, memberId: to };
  });

  let loanChanged = false;
  const nextLoans = loans.map((row: any) => {
    if (String(row?.memberId || "") !== from) return row;
    loanChanged = true;
    return { ...row, memberId: to };
  });

  let groupChanged = false;
  const nextGroups = groups.map((row: any) => {
    const ids = Array.isArray(row?.memberIds) ? row.memberIds : [];
    if (!ids.includes(from)) return row;
    groupChanged = true;
    return {
      ...row,
      memberIds: ids.map((id: string) => (String(id) === from ? to : id)),
    };
  });

  let userChanged = false;
  const nextUsers = users.map((row: any) => {
    if (String(row?.memberId || "") !== from) return row;
    userChanged = true;
    return { ...row, memberId: to };
  });

  let reqChanged = false;
  const nextRequests = memberChangeRequests.map((row: any) => {
    let changed = false;
    const next: any = { ...row };
    if (String(row?.targetMemberId || "") === from) {
      next.targetMemberId = to;
      changed = true;
    }
    if (String(row?.createdByMemberId || "") === from) {
      next.createdByMemberId = to;
      changed = true;
    }
    const memberPayload = row?.payload?.member;
    if (memberPayload && typeof memberPayload === "object") {
      if (String(memberPayload.id || "") === from) {
        next.payload = { ...(row.payload || {}), member: { ...memberPayload, id: to } };
        changed = true;
      }
    }
    if (changed) reqChanged = true;
    return next;
  });

  let eventChanged = false;
  const nextEvents = events.map((row: any) => {
    let changed = false;
    const next: any = { ...row };
    if (Array.isArray(row?.attendeeIds) && row.attendeeIds.includes(from)) {
      next.attendeeIds = row.attendeeIds.map((id: string) => (String(id) === from ? to : id));
      changed = true;
    }
    if (String(row?.createdByMemberId || "") === from) {
      next.createdByMemberId = to;
      changed = true;
    }
    if (String(row?.senderMemberId || "") === from) {
      next.senderMemberId = to;
      changed = true;
    }
    if (String(row?.subjectMemberId || "") === from) {
      next.subjectMemberId = to;
      changed = true;
    }
    if (String(row?.healthPatientMemberId || "") === from) {
      next.healthPatientMemberId = to;
      changed = true;
    }
    if (changed) eventChanged = true;
    return next;
  });

  let claimChanged = false;
  const nextClaims = expenseClaims.map((row: any) => {
    let changed = false;
    const next: any = { ...row };
    if (String(row?.claimantMemberId || "") === from) {
      next.claimantMemberId = to;
      changed = true;
    }
    if (String(row?.relatedMemberId || "") === from) {
      next.relatedMemberId = to;
      changed = true;
    }
    if (String(row?.createdByMemberId || "") === from) {
      next.createdByMemberId = to;
      changed = true;
    }
    if (changed) claimChanged = true;
    return next;
  });

  let paymentChanged = false;
  const nextPayments = memberPaymentRequests.map((row: any) => {
    let changed = false;
    const next: any = { ...row };
    if (String(row?.forMemberId || "") === from) {
      next.forMemberId = to;
      changed = true;
    }
    if (String(row?.payerMemberId || "") === from) {
      next.payerMemberId = to;
      changed = true;
    }
    if (String(row?.createdByMemberId || "") === from) {
      next.createdByMemberId = to;
      changed = true;
    }
    if (changed) paymentChanged = true;
    return next;
  });

  let chatChanged = false;
  const nextChatMessages = chatMessages.map((row: any) => {
    let changed = false;
    const next: any = { ...row };
    if (String(row?.senderMemberId || "") === from) {
      next.senderMemberId = to;
      changed = true;
    }
    if (changed) chatChanged = true;
    return next;
  });

  const writes: Promise<any>[] = [];
  if (txChanged) writes.push(saveTransactions(nextTransactions as any[]));
  if (loanChanged) writes.push(AsyncStorage.setItem(KEYS.LOANS, JSON.stringify(nextLoans)));
  if (groupChanged) writes.push(saveGroups(nextGroups as any[]));
  if (userChanged) writes.push(saveUsers(nextUsers as any[]));
  if (reqChanged) writes.push(saveMemberChangeRequests(nextRequests as any[]));
  if (eventChanged) writes.push(AsyncStorage.setItem(KEYS.EVENTS, JSON.stringify(nextEvents)));
  if (claimChanged) writes.push(AsyncStorage.setItem(KEYS.EXPENSE_CLAIMS, JSON.stringify(nextClaims)));
  if (paymentChanged) writes.push(AsyncStorage.setItem(KEYS.MEMBER_PAYMENT_REQUESTS, JSON.stringify(nextPayments)));
  if (chatChanged) writes.push(saveChatMessages(nextChatMessages as any[]));
  if (writes.length > 0) {
    await Promise.all(writes);
  }
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

export async function runAuditRequestCleanupOnce(): Promise<boolean> {
  try {
    const flag = await AsyncStorage.getItem(AUDIT_REQUEST_CLEANUP_V4_KEY);
    if (flag === "1") return false;

    const [notifications, transactions] = await Promise.all([
      safeGet<AppNotification[]>(KEYS.NOTIFICATIONS, []),
      safeGet<Transaction[]>(KEYS.TRANSACTIONS, []),
    ]);
    const filteredNotifications = Array.isArray(notifications)
      ? notifications.filter((row: any) => {
          const category = String(row?.category || "");
          const relatedType = String(row?.relatedType || "");
          return !(
            category === "audit_change" ||
            category === "delete_request" ||
            relatedType === "audit_change_request"
          );
        })
      : [];
    let txnsChanged = false;
    const cleanedTransactions = Array.isArray(transactions)
      ? transactions.map((txn: any) => {
          if (!txn?.auditFlagged && !txn?.auditNote && !txn?.auditFlaggedByUserId && !txn?.auditFlaggedAt) {
            return txn;
          }
          txnsChanged = true;
          return {
            ...txn,
            auditFlagged: false,
            auditNote: "",
            auditFlaggedByUserId: "",
            auditFlaggedAt: "",
          };
        })
      : [];

    const writes = [
      AsyncStorage.setItem(KEYS.AUDIT_CHANGE_REQUESTS, JSON.stringify([])),
      AsyncStorage.setItem(KEYS.NOTIFICATIONS, JSON.stringify(filteredNotifications)),
      AsyncStorage.setItem(AUDIT_REQUEST_CLEANUP_V4_KEY, "1"),
    ];
    if (txnsChanged) {
      writes.push(AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(cleanedTransactions)));
    }
    await Promise.all(writes);
    try {
      await pushCloudSnapshotFromLocalDetailed();
    } catch (e) {
      console.warn("Audit cleanup cloud push skipped:", e);
    }
    return true;
  } catch (e) {
    console.error("Audit request cleanup failed:", e);
    return false;
  }
}

export async function deleteAuditChangeRequestsForTesting(input: {
  requestIds: string[];
  byUserId: string;
  byMemberId?: string;
  byDisplayName?: string;
}): Promise<{ removedIds: string[]; removedLogCount: number }> {
  const ids = new Set((input.requestIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  const [requests, notifications, executionLogs, rawExecutionLogs, transactions] = await Promise.all([
    getAuditChangeRequests(),
    getNotifications(),
    getAuditExecutionLogs(),
    safeGet<AuditExecutionLog[]>(KEYS.AUDIT_EXECUTION_LOGS, []),
    getTransactions(),
  ]);

  const shouldRemoveAll = ids.size === 0;
  const logSource = Array.isArray(rawExecutionLogs)
    ? rawExecutionLogs
    : (Array.isArray(executionLogs) ? executionLogs : []);
  const removedRequests = (Array.isArray(requests) ? requests : []).filter((row: any) => {
    if (shouldRemoveAll) return true;
    const rowId = String(row?.id || "").trim();
    const rowNo = String(row?.requestNumber || "").trim();
    return (rowId && ids.has(rowId)) || (rowNo && ids.has(rowNo));
  });
  const totalRequestCount = Array.isArray(requests) ? requests.length : 0;
  const removeAllArtifacts = shouldRemoveAll || (totalRequestCount > 0 && removedRequests.length === totalRequestCount);

  const removedIdSet = new Set(removedRequests.map((row: any) => String(row?.id || "").trim()).filter(Boolean));
  const removedNoSet = new Set(removedRequests.map((row: any) => String(row?.requestNumber || "").trim()).filter(Boolean));
  const inputIdSet = ids;

  const remainingRequests = removeAllArtifacts
    ? []
    : (Array.isArray(requests) ? requests : []).filter((row: any) => {
        const rowId = String(row?.id || "").trim();
        const rowNo = String(row?.requestNumber || "").trim();
        if (rowId && (removedIdSet.has(rowId) || inputIdSet.has(rowId))) return false;
        if (rowNo && (removedNoSet.has(rowNo) || inputIdSet.has(rowNo))) return false;
        return true;
      });
  const remainingNotifications = (Array.isArray(notifications) ? notifications : []).filter((row: any) => {
    if (removeAllArtifacts) {
      const category = String(row?.category || "");
      const relatedType = String(row?.relatedType || "");
      if (category === "audit_change" || category === "delete_request" || relatedType === "audit_change_request") {
        return false;
      }
    }
    const relatedId = String(row?.relatedId || "");
    if (relatedId && (removedIdSet.has(relatedId) || inputIdSet.has(relatedId))) return false;
    const title = String(row?.title || "");
    for (const no of removedNoSet) {
      if (no && title.includes(no)) return false;
    }
    for (const token of inputIdSet) {
      if (token && title.includes(token)) return false;
    }
    return true;
  });
  const removedLogs = removeAllArtifacts
    ? logSource
    : logSource.filter((log: any) => {
        const reqId = String(log?.requestId || "").trim();
        const reqNo = String(log?.requestNumber || "").trim();
        if (reqId && (removedIdSet.has(reqId) || inputIdSet.has(reqId))) return true;
        if (reqNo && (removedNoSet.has(reqNo) || inputIdSet.has(reqNo))) return true;
        return false;
      });

  const remainingLogs = removeAllArtifacts
    ? []
    : logSource.filter((log: any) => {
        const reqId = String(log?.requestId || "").trim();
        const reqNo = String(log?.requestNumber || "").trim();
        if (reqId && (removedIdSet.has(reqId) || inputIdSet.has(reqId))) return false;
        if (reqNo && (removedNoSet.has(reqNo) || inputIdSet.has(reqNo))) return false;
        return true;
      });

  const targetTxnIds = new Set<string>();
  removedRequests.forEach((req: any) => {
    const targetId = String(req?.transactionId || req?.targetId || "").trim();
    if (targetId) targetTxnIds.add(targetId);
  });

  let txChanged = false;
  const cleanedTransactions = (Array.isArray(transactions) ? transactions : []).map((txn: any) => {
    if (!targetTxnIds.has(String(txn?.id || ""))) return txn;
    if (!txn?.auditFlagged && !txn?.auditNote && !txn?.auditFlaggedByUserId && !txn?.auditFlaggedAt) return txn;
    txChanged = true;
    return {
      ...txn,
      auditFlagged: false,
      auditNote: "",
      auditFlaggedByUserId: "",
      auditFlaggedAt: "",
    };
  });

  const writes: Promise<any>[] = [
    AsyncStorage.setItem(KEYS.AUDIT_CHANGE_REQUESTS, JSON.stringify(remainingRequests)),
    AsyncStorage.setItem(KEYS.NOTIFICATIONS, JSON.stringify(remainingNotifications)),
    AsyncStorage.setItem(KEYS.AUDIT_EXECUTION_LOGS, JSON.stringify(remainingLogs)),
  ];
  const tombstonesToAdd: { id?: string; requestNumber?: string }[] = [];
  removedRequests.forEach((row: any) => {
    tombstonesToAdd.push({
      id: String(row?.id || "").trim() || undefined,
      requestNumber: String(row?.requestNumber || "").trim() || undefined,
    });
  });
  if (removeAllArtifacts) {
    logSource.forEach((log: any) => {
      tombstonesToAdd.push({
        id: String(log?.requestId || "").trim() || undefined,
        requestNumber: String(log?.requestNumber || "").trim() || undefined,
      });
    });
  } else {
    logSource.forEach((log: any) => {
      const reqId = String(log?.requestId || "").trim();
      const reqNo = String(log?.requestNumber || "").trim();
      if ((reqId && inputIdSet.has(reqId)) || (reqNo && inputIdSet.has(reqNo)) || removedIdSet.has(reqId) || removedNoSet.has(reqNo)) {
        tombstonesToAdd.push({ id: reqId || undefined, requestNumber: reqNo || undefined });
      }
    });
  }
  await appendAuditTestCleanupTombstones(tombstonesToAdd);
  if (txChanged) {
    writes.push(AsyncStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(cleanedTransactions)));
  }
  await Promise.all(writes);

  try {
    await pushCloudSnapshotFromLocalDetailed();
  } catch (e) {
    console.warn("Test audit request cleanup cloud push skipped:", e);
  }

  return {
    removedIds: removedRequests.map((row: any) => String(row?.id || "")).filter(Boolean),
    removedLogCount: removedLogs.length,
  };
}

// --- Members ---
export const getMembers = async (): Promise<Member[]> => {
  const rows = await safeGet<Member[]>(KEYS.MEMBERS, []);
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const migrationFlag = await AsyncStorage.getItem(MEMBER_JOIN_DATE_MIGRATION_V1_KEY);
  const shouldRunJoinDateMigration = migrationFlag !== "1";
  let joinDateMigrationChanged = false;
  const migratedRows = shouldRunJoinDateMigration
    ? rows.map((row: any) => {
        const joinDateText = String(row?.joinDate || "").trim();
        if (joinDateText) return row;
        joinDateMigrationChanged = true;
        return { ...row, joinDate: MEMBER_JOIN_DATE_FALLBACK_DMY };
      })
    : rows;

  let changed = false;
  const normalized = migratedRows.map((row: any) => {
    const next = normalizeMemberRecord(row);
    if (!changed) {
      try {
        changed = JSON.stringify(next) !== JSON.stringify(row);
      } catch {
        changed = true;
      }
    }
    return next;
  });

  const seen = new Set<string>();
  const dedupedReversed: Member[] = [];
  for (let i = normalized.length - 1; i >= 0; i -= 1) {
    const row = normalized[i];
    const key = normalizeMemberIdForCompare(row?.id);
    if (!key) {
      dedupedReversed.push(row);
      continue;
    }
    if (seen.has(key)) {
      changed = true;
      continue;
    }
    seen.add(key);
    dedupedReversed.push(row);
  }
  const deduped = dedupedReversed.reverse();

  if (shouldRunJoinDateMigration) {
    await AsyncStorage.setItem(MEMBER_JOIN_DATE_MIGRATION_V1_KEY, "1");
  }
  if (changed || joinDateMigrationChanged) {
    await AsyncStorage.setItem(KEYS.MEMBERS, JSON.stringify(deduped));
  }
  return deduped;
};

export async function syncUsersWithMembers(members: Member[]) {
  try {
    const users = await getUsers();
    const admins = users.filter(u => u.systemRole === 'admin');

    const existingByMember = new Map<string, UserAccount>();
    users.forEach((user) => {
      if (!user.memberId || user.systemRole === "admin") return;
      const key = normalizeMemberIdForCompare(user.memberId);
      if (!key) return;
      const current = existingByMember.get(key);
      if (!current) {
        existingByMember.set(key, user);
        return;
      }
      const currentTime = Date.parse(current.createdAt || "");
      const nextTime = Date.parse(user.createdAt || "");
      if (!Number.isNaN(nextTime) && (Number.isNaN(currentTime) || nextTime > currentTime)) {
        existingByMember.set(key, user);
      }
    });

    const memberUsers: UserAccount[] = members.map(m => {
      const memberKey = normalizeMemberIdForCompare(m.id);
      const existing = existingByMember.get(memberKey);
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
  const normalized = (Array.isArray(data) ? data : []).map((row: any) => normalizeMemberRecord(row));
  // ID တူညီမှုကို digit/script normalize ပြုလုပ်ပြီး duplicate rows ကိုတစ်ခုပဲထားပါ။
  const seen = new Set<string>();
  const dedupedReversed: Member[] = [];
  for (let i = normalized.length - 1; i >= 0; i -= 1) {
    const row = normalized[i];
    const key = normalizeMemberIdForCompare(row?.id);
    if (!key) {
      dedupedReversed.push(row);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedReversed.push(row);
  }
  const deduped = dedupedReversed.reverse();
  await AsyncStorage.setItem(KEYS.MEMBERS, JSON.stringify(deduped));
  await syncUsersWithMembers(deduped);
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
    const incoming = normalizeMemberPatch(request.payload.member || {}) as any;
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
      occupation: incoming.occupation,
      familyMembers: normalizeFamilyMembers(incoming.familyMembers),
    };
    nextMembers = [...nextMembers, normalizeMemberRecord(member, undefined, incoming)];
  } else if (request.action === "update") {
    const targetId = String(request.targetMemberId || "").trim();
    if (!targetId) throw new Error("target_missing");
    const memberIndex = nextMembers.findIndex((item) => item.id === targetId);
    if (memberIndex === -1) throw new Error("target_not_found");

    const updatePayload = normalizeMemberPatch(request.payload.member || {}) as any;
    const previousMember = { ...nextMembers[memberIndex] } as Member;
    const requestedId = String(updatePayload.id || "").trim();
    if (requestedId && requestedId !== targetId) {
      const exists = nextMembers.some((item, idx) => idx !== memberIndex && item.id === requestedId);
      if (exists) throw new Error("member_exists");
      await remapMemberIdReferences(targetId, requestedId);
      const merged = {
        ...nextMembers[memberIndex],
        ...updatePayload,
        id: requestedId,
      };
      nextMembers[memberIndex] = normalizeMemberRecord(merged, previousMember, updatePayload);
    } else {
      delete (updatePayload as any).id;
      const merged = {
        ...nextMembers[memberIndex],
        ...updatePayload,
      };
      nextMembers[memberIndex] = normalizeMemberRecord(merged, previousMember, updatePayload);
    }
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

function scheduleMemberPasswordCloudSync(trigger: string): void {
  if (memberPasswordCloudSyncTimer) {
    clearTimeout(memberPasswordCloudSyncTimer);
  }
  memberPasswordCloudSyncTimer = setTimeout(() => {
    memberPasswordCloudSyncTimer = null;
    if (memberPasswordCloudSyncInFlight) return;
    memberPasswordCloudSyncInFlight = true;
    void (async () => {
      try {
        const result = await pushCloudSnapshotFromLocalDetailed();
        if (!result.ok) {
          const reason = String(result.reason || "");
          if (reason !== "cloud_disabled_or_empty_endpoint" && reason !== "license_denied") {
            console.warn(`[member_password_cloud_sync:${trigger}] ${reason || "unknown"}`);
          }
        }
      } catch (error: any) {
        console.warn(`[member_password_cloud_sync:${trigger}] ${String(error?.message || error || "failed")}`);
      } finally {
        memberPasswordCloudSyncInFlight = false;
      }
    })();
  }, MEMBER_PASSWORD_CLOUD_SYNC_DEBOUNCE_MS);
}

export async function setUserPassword(userId: string, passwordPlaintext: string): Promise<void> {
    const passwords = await getUserPasswords();
    const updatedPasswords = { ...passwords, [userId]: passwordPlaintext };
    await AsyncStorage.setItem(KEYS.USER_PASSWORDS, JSON.stringify(updatedPasswords));
    scheduleMemberPasswordCloudSync("set_user_password");
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

function normalizeMemberIdForCompare(rawValue?: string): string {
  return toEnglishDigits(String(rawValue || "")).trim().toLowerCase();
}

export function buildDefaultPassword(): string {
  return buildAutoGeneratedPassword();
}

function buildDefaultStandaloneUserPassword(): string {
  return buildAutoGeneratedPassword();
}

async function ensureDefaultPasswordsForUsers(users: UserAccount[], members: Member[]): Promise<void> {
  const passwords = await getUserPasswords();
  let changed = false;

  for (const user of users) {
    if (passwords[user.id]) continue;
    if (user.systemRole === "admin") {
      continue;
    }
    const member = members.find((item) => item.id === user.memberId);
    if (member) {
      passwords[user.id] = buildAutoGeneratedPassword();
      changed = true;
    } else {
      passwords[user.id] = buildDefaultStandaloneUserPassword();
      changed = true;
    }
  }

  if (changed) {
    await AsyncStorage.setItem(KEYS.USER_PASSWORDS, JSON.stringify(passwords));
    scheduleMemberPasswordCloudSync("ensure_default_passwords");
  }
}

export async function ensureSystemAdminPassword(): Promise<string> {
  const parseTimestampMs = (raw: string): number => {
    const ms = Date.parse(String(raw || "").trim());
    return Number.isFinite(ms) ? ms : 0;
  };
  const readWebMirror = (): string => {
    if (Platform.OS !== "web" || typeof window === "undefined") return "";
    try {
      return String(window.localStorage?.getItem(SYSTEM_ADMIN_PASSWORD_WEB_MIRROR_KEY) || "").trim();
    } catch {
      return "";
    }
  };
  const writeWebMirror = (password: string): void => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    try {
      if (password) {
        window.localStorage?.setItem(SYSTEM_ADMIN_PASSWORD_WEB_MIRROR_KEY, password);
      } else {
        window.localStorage?.removeItem(SYSTEM_ADMIN_PASSWORD_WEB_MIRROR_KEY);
      }
    } catch {
      // ignore
    }
  };
  const readWebMirrorUpdatedAt = (): string => {
    if (Platform.OS !== "web" || typeof window === "undefined") return "";
    try {
      return String(window.localStorage?.getItem(SYSTEM_ADMIN_PASSWORD_UPDATED_AT_WEB_MIRROR_KEY) || "").trim();
    } catch {
      return "";
    }
  };
  const writeWebMirrorUpdatedAt = (updatedAtIso: string): void => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    try {
      if (updatedAtIso) {
        window.localStorage?.setItem(SYSTEM_ADMIN_PASSWORD_UPDATED_AT_WEB_MIRROR_KEY, updatedAtIso);
      } else {
        window.localStorage?.removeItem(SYSTEM_ADMIN_PASSWORD_UPDATED_AT_WEB_MIRROR_KEY);
      }
    } catch {
      // ignore
    }
  };

  try {
    const remote = await fetchSystemAdminPasswordRemote();
    const remotePassword = remote.ok ? String(remote.password || "").trim() : "";
    const remoteUpdatedAt = String(remote.updatedAt || "").trim();
    const remoteUpdatedAtMs = parseTimestampMs(remoteUpdatedAt);
    const systemExisting = String((await systemStorage.getItem(SYSTEM_ADMIN_PASSWORD_KEY)) || "").trim();
    const systemUpdatedAt = String((await systemStorage.getItem(SYSTEM_ADMIN_PASSWORD_UPDATED_AT_KEY)) || "").trim();
    const legacyExisting = String((await AsyncStorage.getItem(SYSTEM_ADMIN_PASSWORD_KEY)) || "").trim();
    const legacyUpdatedAt = String((await AsyncStorage.getItem(SYSTEM_ADMIN_PASSWORD_UPDATED_AT_KEY)) || "").trim();
    const webMirrorExisting = readWebMirror();
    const webMirrorUpdatedAt = readWebMirrorUpdatedAt();
    const candidates = [systemExisting, legacyExisting, webMirrorExisting].filter(Boolean);
    const countByValue = new Map<string, number>();
    for (const candidate of candidates) {
      countByValue.set(candidate, (countByValue.get(candidate) || 0) + 1);
    }
    let majorityValue = "";
    let majorityCount = 0;
    for (const [value, count] of countByValue.entries()) {
      if (count > majorityCount) {
        majorityValue = value;
        majorityCount = count;
      }
    }
    // Source priority fallback:
    // 1) newer value between local and remote timestamps
    // 2) majority value across system/legacy/web mirror
    // 3) system-scoped storage
    // 4) legacy global key (backward compatibility)
    // 5) web mirror (last fallback only)
    const localResolved = (majorityCount >= 2 ? majorityValue : "") || systemExisting || legacyExisting || webMirrorExisting;
    const localUpdatedAtMs = Math.max(
      parseTimestampMs(systemUpdatedAt),
      parseTimestampMs(legacyUpdatedAt),
      parseTimestampMs(webMirrorUpdatedAt)
    );
    const shouldUseRemote = !!remotePassword;
    const resolved = shouldUseRemote ? remotePassword : (localResolved || remotePassword);
    const resolvedUpdatedAtIso =
      (shouldUseRemote ? remoteUpdatedAt : "") ||
      (localUpdatedAtMs > 0 ? new Date(localUpdatedAtMs).toISOString() : new Date().toISOString());
    if (resolved) {
      // Keep legacy key aligned so old builds/cached clients don't fall back to a stale password.
      if (legacyExisting !== resolved) {
        try {
          await AsyncStorage.setItem(SYSTEM_ADMIN_PASSWORD_KEY, resolved);
        } catch {}
      }
      if (legacyUpdatedAt !== resolvedUpdatedAtIso) {
        try {
          await AsyncStorage.setItem(SYSTEM_ADMIN_PASSWORD_UPDATED_AT_KEY, resolvedUpdatedAtIso);
        } catch {}
      }
      if (systemExisting !== resolved) {
        try {
          await systemStorage.setItem(SYSTEM_ADMIN_PASSWORD_KEY, resolved);
        } catch {}
      }
      if (systemUpdatedAt !== resolvedUpdatedAtIso) {
        try {
          await systemStorage.setItem(SYSTEM_ADMIN_PASSWORD_UPDATED_AT_KEY, resolvedUpdatedAtIso);
        } catch {}
      }
      if (webMirrorExisting !== resolved) {
        writeWebMirror(resolved);
      }
      if (webMirrorUpdatedAt !== resolvedUpdatedAtIso) {
        writeWebMirrorUpdatedAt(resolvedUpdatedAtIso);
      }
      if (!remotePassword || remotePassword !== resolved || (!remoteUpdatedAtMs && resolvedUpdatedAtIso)) {
        try {
          await saveSystemAdminPasswordRemote(resolved);
        } catch {}
      }
      return resolved;
    }
    const seededUpdatedAt = new Date().toISOString();
    await systemStorage.setItem(SYSTEM_ADMIN_PASSWORD_KEY, DEFAULT_SYSTEM_ADMIN_PASSWORD);
    await systemStorage.setItem(SYSTEM_ADMIN_PASSWORD_UPDATED_AT_KEY, seededUpdatedAt);
    try {
      await AsyncStorage.setItem(SYSTEM_ADMIN_PASSWORD_KEY, DEFAULT_SYSTEM_ADMIN_PASSWORD);
      await AsyncStorage.setItem(SYSTEM_ADMIN_PASSWORD_UPDATED_AT_KEY, seededUpdatedAt);
    } catch {}
    writeWebMirror(DEFAULT_SYSTEM_ADMIN_PASSWORD);
    writeWebMirrorUpdatedAt(seededUpdatedAt);
    try {
      await saveSystemAdminPasswordRemote(DEFAULT_SYSTEM_ADMIN_PASSWORD);
    } catch {}
    return DEFAULT_SYSTEM_ADMIN_PASSWORD;
  } catch {
    return DEFAULT_SYSTEM_ADMIN_PASSWORD;
  }
}

export async function verifySystemAdminPassword(passwordPlaintext: string): Promise<boolean> {
  const stored = await ensureSystemAdminPassword();
  return stored === String(passwordPlaintext || "").trim();
}

export async function setSystemAdminPassword(nextPassword: string): Promise<void> {
  const trimmed = String(nextPassword || "").trim();
  if (!trimmed) return;
  const updatedAt = new Date().toISOString();
  await Promise.all([
    systemStorage.setItem(SYSTEM_ADMIN_PASSWORD_KEY, trimmed),
    systemStorage.setItem(SYSTEM_ADMIN_PASSWORD_UPDATED_AT_KEY, updatedAt),
    AsyncStorage.setItem(SYSTEM_ADMIN_PASSWORD_KEY, trimmed),
    AsyncStorage.setItem(SYSTEM_ADMIN_PASSWORD_UPDATED_AT_KEY, updatedAt),
    RawAsyncStorage.setItem(SYSTEM_ADMIN_PASSWORD_KEY, trimmed),
    RawAsyncStorage.setItem(SYSTEM_ADMIN_PASSWORD_UPDATED_AT_KEY, updatedAt),
  ]);
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      window.localStorage?.setItem(SYSTEM_ADMIN_PASSWORD_WEB_MIRROR_KEY, trimmed);
      window.localStorage?.setItem(SYSTEM_ADMIN_PASSWORD_UPDATED_AT_WEB_MIRROR_KEY, updatedAt);
    } catch {
      // ignore
    }
  }
  try {
    await saveSystemAdminPasswordRemote(trimmed);
  } catch {}
}

export async function changeUserPassword(userId: string, currentPassword: string, nextPassword: string): Promise<boolean> {
  if (!userId || !nextPassword.trim()) return false;
  const isValid = await verifyPassword(userId, currentPassword);
  if (!isValid) return false;
  await setUserPassword(userId, nextPassword.trim());
  return true;
}

export async function resetUserPasswordByIdentifier(
  identifier: string,
  nextPassword?: string
): Promise<{ ok: boolean; userId?: string; reason?: string; displayName?: string; memberId?: string; phone?: string; email?: string; password?: string }> {
  const rawNeedle = toEnglishDigits(identifier || "").trim();
  const needle = rawNeedle.toLowerCase();
  if (!needle) return { ok: false, reason: "empty" };
  if (needle === "admin") {
    const password = String(nextPassword || "").trim() || DEFAULT_SYSTEM_ADMIN_PASSWORD;
    await setSystemAdminPassword(password);
    return { ok: true, userId: "admin", displayName: "System Admin", password };
  }

  const [users, members] = await Promise.all([getUsers(), getMembers()]);
  const candidates = Array.from(
    new Set(
      [rawNeedle]
        .concat(rawNeedle.split(/[\/|,;\n]+/g))
        .map((item) => toEnglishDigits(String(item || "")).trim().toLowerCase())
        .filter(Boolean)
    )
  );

  const findExactByNeedle = (currentNeedle: string): UserAccount | undefined => {
    if (currentNeedle.startsWith("uid:")) {
      const uidNeedle = toEnglishDigits(currentNeedle.slice(4)).trim().toLowerCase();
      if (!uidNeedle) return undefined;
      return users.find((user) => toEnglishDigits(String(user.id || "")).trim().toLowerCase() === uidNeedle && user.isActive);
    }

    return users.find((user) => {
      if (!user.isActive) return false;
      if (user.systemRole === "admin") {
        return currentNeedle === "admin";
      }

      if (toEnglishDigits(String(user.id || "")).trim().toLowerCase() === currentNeedle) {
        return true;
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
      const normalizedNeedleDigits = currentNeedle.replace(/[^\d]/g, "");

      return (
        currentNeedle === memberIdCandidate ||
        currentNeedle === aliasCandidate ||
        (emailCandidate && currentNeedle === emailCandidate) ||
        (!!normalizedNeedleDigits && phoneCandidates.includes(normalizedNeedleDigits))
      );
    });
  };

  const targetUser =
    candidates.map((candidate) => findExactByNeedle(candidate)).find(Boolean) ||
    users.find((user) => {
      if (!user.isActive) return false;
      if (user.systemRole === "admin") return needle === "admin";
      const member = members.find((item) => item.id === user.memberId);
      if (!member) return false;
      const memberName = String(member.name || "").trim().toLowerCase();
      return memberName && memberName === needle;
    });

  if (!targetUser) return { ok: false, reason: "not_found" };
  if (targetUser.systemRole === "admin") {
    return { ok: false, reason: "forbidden" };
  }

  const chosenPassword = String(nextPassword || "").trim();
  const password = chosenPassword || buildAutoGeneratedPassword();
  const targetMemberKey = normalizeMemberIdForCompare(targetUser.memberId);
  const member = members.find((item) => normalizeMemberIdForCompare(item.id) === targetMemberKey);

  const targetUsers: UserAccount[] = (() => {
    if (!member) return [targetUser];
    const sameMemberUsers = users.filter((user) => {
      if (!user.isActive || user.systemRole === "admin") return false;
      return normalizeMemberIdForCompare(user.memberId) === normalizeMemberIdForCompare(member.id);
    });
    return sameMemberUsers.length > 0 ? sameMemberUsers : [targetUser];
  })();

  const targetUserIds = Array.from(
    new Set(targetUsers.map((user) => String(user.id || "").trim()).filter(Boolean))
  );
  if (!targetUserIds.length) {
    return { ok: false, reason: "not_found" };
  }

  await Promise.all(targetUserIds.map((userId) => setUserPassword(userId, password)));
  await pushPasswordResetBestEffort();

  const verifyResults = await Promise.all(targetUserIds.map((userId) => verifyPassword(userId, password)));
  if (verifyResults.some((ok) => !ok)) {
    return { ok: false, reason: "password_verify_failed" };
  }

  if (!member) {
    return {
      ok: true,
      userId: targetUser.id,
      displayName: targetUser.displayName || targetUser.id,
      password,
    };
  }

  const { primaryPhone, secondaryPhone } = splitPhoneNumbers(member.phone, (member as any).secondaryPhone);
  const email = String(member.email || "").trim();
  return {
    ok: true,
    userId: targetUser.id,
    displayName: member.name || targetUser.displayName || targetUser.id,
    memberId: member.id,
    phone: primaryPhone || secondaryPhone || "",
    email: email || undefined,
    password,
  };
}

async function pushPasswordResetBestEffort(): Promise<void> {
  try {
    await Promise.allSettled([
      pushLanSnapshotFromLocalDetailed(),
      pushCloudSnapshotFromLocalDetailed(),
    ]);
  } catch {
    // ignore sync errors; password is already updated locally
  }
}

function buildAutoGeneratedPassword(): string {
  const token = randomToken(4).toUpperCase();
  const digits = String(100 + secureRandomInt(900));
  return `ORG${token}${digits}`;
}

function buildInitialOrgUserId(users: UserAccount[], memberId?: string): string {
  const normalizedMemberId = toEnglishDigits(String(memberId || "")).trim();
  const base = normalizedMemberId ? `user-${normalizedMemberId}` : `chair-${randomToken(4).toUpperCase()}`;
  let candidate = base;
  let counter = 1;
  const existingIds = new Set(
    users.map((user) => toEnglishDigits(String(user.id || "")).trim().toLowerCase())
  );
  while (existingIds.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function buildChairMemberId(members: Member[]): string {
  const existingIds = new Set(
    members.map((member) => toEnglishDigits(String(member.id || "")).trim().toLowerCase())
  );
  let counter = 1;
  let candidate = `CHAIR-${String(counter).padStart(3, "0")}`;
  while (existingIds.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `CHAIR-${String(counter).padStart(3, "0")}`;
  }
  return candidate;
}

function normalizePhoneDigits(input?: string | null): string {
  return toEnglishDigits(String(input || "")).replace(/[^\d]/g, "");
}

export async function createInitialOrgUserAccount(input: {
  displayName: string;
  orgPosition: OrgPosition;
  memberId?: string;
  email?: string;
  phone?: string;
}): Promise<{ user: UserAccount; password: string }> {
  const displayName = String(input.displayName || "").trim();
  const orgPosition = normalizeOrgPosition(input.orgPosition || "chairperson");
  const memberId = toEnglishDigits(String(input.memberId || "")).trim();

  if (!displayName) throw new Error("display_name_required");

  const users = await getUsers();
  const existingInitialUser = users.find((user) => user.systemRole === "org_user" && !String(user.memberId || "").trim());
  if (existingInitialUser) throw new Error("initial_org_user_exists");

  const now = new Date().toISOString();
  const userId = buildInitialOrgUserId(users, memberId);
  const nextUser: UserAccount = {
    id: userId,
    displayName,
    systemRole: "org_user",
    orgPosition,
    memberId: memberId || undefined,
    isActive: true,
    createdAt: now,
  };

  const password = buildAutoGeneratedPassword();
  await saveUsers([...users, nextUser]);
  await setUserPassword(nextUser.id, password);
  return { user: nextUser, password };
}

export async function ensureChairAccountFromRegistry(input: {
  chairName: string;
  chairEmail?: string;
  chairPhone?: string;
  chairPassword: string;
}): Promise<{ ok: boolean; created?: boolean; memberId?: string; userId?: string; reason?: string }> {
  const chairName = String(input.chairName || "").trim();
  const chairEmail = String(input.chairEmail || "").trim().toLowerCase();
  const chairPhone = String(input.chairPhone || "").trim();
  const chairPassword = String(input.chairPassword || "").trim();

  if (!chairName) return { ok: false, reason: "chair_name_required" };
  if (!chairEmail && !chairPhone) return { ok: false, reason: "chair_contact_required" };
  if (!chairPassword) return { ok: false, reason: "chair_password_required" };

  const applyPasswordToMemberUsers = async (memberId: string): Promise<string | undefined> => {
    const refreshedUsers = await getUsers();
    const memberKey = normalizeMemberIdForCompare(memberId);
    const targets = refreshedUsers.filter((user) => {
      if (user.systemRole === "admin") return false;
      return normalizeMemberIdForCompare(user.memberId) === memberKey;
    });
    const targetIds = Array.from(new Set(targets.map((u) => String(u.id || "").trim()).filter(Boolean)));
    if (!targetIds.length) {
      const fallbackUserId = `user-${memberId}`;
      await setUserPassword(fallbackUserId, chairPassword);
      return fallbackUserId;
    }
    await Promise.all(targetIds.map((userId) => setUserPassword(userId, chairPassword)));
    return targetIds[0];
  };

  const [members, users] = await Promise.all([getMembers(), getUsers()]);
  const existingChairMember = members.find(
    (member) => normalizeOrgPosition(member.orgPosition || "") === "chairperson"
  );
  if (existingChairMember) {
    const userId = await applyPasswordToMemberUsers(existingChairMember.id);
    return { ok: true, created: false, memberId: existingChairMember.id, userId };
  }

  const existingChairUser = users.find(
    (user) =>
      user.systemRole === "org_user" &&
      normalizeOrgPosition(user.orgPosition || "") === "chairperson" &&
      !String(user.memberId || "").trim()
  );
  if (existingChairUser) {
    await setUserPassword(existingChairUser.id, chairPassword);
    return { ok: true, created: false, userId: existingChairUser.id };
  }

  const normalizedPhone = normalizePhoneDigits(chairPhone);
  const normalizedEmail = chairEmail;
  const matchedMember = members.find((member) => {
    const memberEmail = String(member.email || "").trim().toLowerCase();
    if (normalizedEmail && memberEmail && normalizedEmail === memberEmail) return true;
    if (normalizedPhone) {
      const { primaryPhone, secondaryPhone } = splitPhoneNumbers(member.phone, (member as any).secondaryPhone);
      const phoneCandidates = [primaryPhone, secondaryPhone]
        .filter(Boolean)
        .map((phone) => normalizePhoneDigits(phone));
      return phoneCandidates.includes(normalizedPhone);
    }
    return false;
  });

  if (matchedMember) {
    const updatedMembers = members.map((member) =>
      member.id === matchedMember.id
        ? { ...member, orgPosition: "chairperson" as OrgPosition, status: member.status || "active" }
        : member
    );
    await saveMembers(updatedMembers);
    const userId = await applyPasswordToMemberUsers(matchedMember.id);
    return { ok: true, created: false, memberId: matchedMember.id, userId };
  }

  const now = new Date().toISOString();
  const newMemberId = buildChairMemberId(members);
  const newMember: Member = {
    id: newMemberId,
    name: chairName,
    phone: chairPhone,
    email: chairEmail || undefined,
    joinDate: now.split("T")[0],
    status: "active",
    createdAt: now,
    color: randomColor(),
    avatarColor: randomColor(),
    role: "member",
    orgPosition: "chairperson",
  };

  await saveMembers([...members, newMember]);
  const newUserId = (await applyPasswordToMemberUsers(newMemberId)) || `user-${newMemberId}`;
  await setUserPassword(newUserId, chairPassword);
  return { ok: true, created: true, memberId: newMemberId, userId: newUserId };
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
  const normalized = normalizeMemberPatch(member) as any;
  const normalizedId = String(normalized.id || "").trim();
  const normalizedIdKey = normalizeMemberIdForCompare(normalizedId);
  if (normalizedId) {
    const exists = members.some((m) => normalizeMemberIdForCompare(m.id) === normalizedIdKey);
    if (exists) {
      throw new Error("member_exists");
    }
  }
  const newMember = normalizeMemberRecord({
    ...normalized,
    id: normalized.id || generateId(),
    avatarColor: normalized.avatarColor || randomColor(),
    createdAt: new Date().toISOString()
  }, undefined, normalized);

    await saveMembers([...members, newMember]);

    const user = await getUsers()
    const newMemberKey = normalizeMemberIdForCompare(newMember.id);
    const newUser = user.find((e) => normalizeMemberIdForCompare(e.memberId) === newMemberKey)
    if (newUser?.id) {
      await setUserPassword(newUser.id, buildAutoGeneratedPassword());
    }

  return newMember;
}

export async function updateMember(id: string, updates: any) {
  const members = await getMembers();
  const sourceIdKey = normalizeMemberIdForCompare(id);
  const idx = members.findIndex((m) => normalizeMemberIdForCompare(m.id) === sourceIdKey);
  if (idx !== -1) {
    const normalized = normalizeMemberPatch(updates) as any;
    const previousMember = { ...members[idx] } as Member;
    const nextId = String(normalized.id || id).trim() || id;
    const nextIdKey = normalizeMemberIdForCompare(nextId);
    if (nextIdKey && nextIdKey !== sourceIdKey) {
      const exists = members.some((m, i) => i !== idx && normalizeMemberIdForCompare(m.id) === nextIdKey);
      if (exists) throw new Error("member_exists");
      await remapMemberIdReferences(previousMember.id, nextId);
    }
    const merged = { ...members[idx], ...normalized, id: nextId };
    members[idx] = normalizeMemberRecord(merged, previousMember, normalized);
    await saveMembers(members);
  }
}

export async function deleteMember(id: string) {
  const members = await getMembers();
  const idKey = normalizeMemberIdForCompare(id);
  const nextMembers = members.filter(m => normalizeMemberIdForCompare(m.id) !== idKey);
  await saveMembers(nextMembers);
  try {
    const users = await getUsers();
    const toRemove = users.filter((u) => normalizeMemberIdForCompare(u.memberId) === idKey);
    if (toRemove.length > 0) {
      await saveUsers(users.filter((u) => normalizeMemberIdForCompare(u.memberId) !== idKey));
      const passwords = await getUserPasswords();
      let changed = false;
      toRemove.forEach((u) => {
        if (passwords[u.id]) {
          delete passwords[u.id];
          changed = true;
        }
      });
      if (changed) {
        await AsyncStorage.setItem(KEYS.USER_PASSWORDS, JSON.stringify(passwords));
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

export async function clearAllMembers(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.MEMBERS);
}

export async function clearAllData(): Promise<void> {
  const [sharedKeys, allKeys] = await Promise.all([
    getAllSharedBackupKeys(),
    AsyncStorage.getAllKeys().catch(() => [] as string[]),
  ]);
  const resetKeys = (allKeys || []).filter((key) => isOrgOwnedStorageKey(String(key || "")));
  const keys = Array.from(
    new Set([
      ...sharedKeys,
      ...resetKeys,
      ...Object.values(KEYS),
      ...EXTRA_SHARED_KEYS,
      ...Array.from(RESET_ONLY_KEYS),
    ])
  );
  if (keys.length > 0) {
    await AsyncStorage.multiRemove(keys);
  }
}

type PreservedSystemConfig = Pick<
  AccountSettings,
  | "orgName"
  | "orgEmail"
  | "orgPhone"
  | "orgId"
  | "orgSetupAt"
  | "orgSetupCompleted"
  | "currency"
  | "syncServerUrl"
  | "syncEnabled"
  | "cloudSyncEnabled"
  | "cloudSyncProvider"
  | "cloudSyncEndpoint"
  | "cloudSyncApiKey"
  | "cloudSyncGoogleAccountEmail"
  | "cloudSyncFolderName"
  | "receivingBankName"
  | "receivingBankAccountNumber"
  | "receivingBankAccountName"
  | "receivingKbzPayPhone"
  | "receivingKbzPayAccountName"
  | "receivingKbzPayMmqr"
  | "receivingWavePayPhone"
  | "receivingWavePayAccountName"
  | "receivingWavePayMmqr"
  | "receivingAyaPayPhone"
  | "receivingAyaPayAccountName"
  | "receivingAyaPayMmqr"
>;

function pickPreservedSystemConfig(settings: AccountSettings): PreservedSystemConfig {
  return {
    orgName: settings.orgName,
    orgEmail: settings.orgEmail,
    orgPhone: settings.orgPhone,
    orgId: settings.orgId,
    orgSetupAt: settings.orgSetupAt,
    orgSetupCompleted: settings.orgSetupCompleted,
    currency: settings.currency,
    syncServerUrl: settings.syncServerUrl,
    syncEnabled: settings.syncEnabled,
    cloudSyncEnabled: settings.cloudSyncEnabled,
    cloudSyncProvider: settings.cloudSyncProvider,
    cloudSyncEndpoint: settings.cloudSyncEndpoint,
    cloudSyncApiKey: settings.cloudSyncApiKey,
    cloudSyncGoogleAccountEmail: settings.cloudSyncGoogleAccountEmail,
    cloudSyncFolderName: settings.cloudSyncFolderName,
    receivingBankName: settings.receivingBankName,
    receivingBankAccountNumber: settings.receivingBankAccountNumber,
    receivingBankAccountName: settings.receivingBankAccountName,
    receivingKbzPayPhone: settings.receivingKbzPayPhone,
    receivingKbzPayAccountName: settings.receivingKbzPayAccountName,
    receivingKbzPayMmqr: settings.receivingKbzPayMmqr,
    receivingWavePayPhone: settings.receivingWavePayPhone,
    receivingWavePayAccountName: settings.receivingWavePayAccountName,
    receivingWavePayMmqr: settings.receivingWavePayMmqr,
    receivingAyaPayPhone: settings.receivingAyaPayPhone,
    receivingAyaPayAccountName: settings.receivingAyaPayAccountName,
    receivingAyaPayMmqr: settings.receivingAyaPayMmqr,
  };
}

export async function clearAllLocalDataKeepSystemConfig(): Promise<void> {
  const currentSettings = await getAccountSettings();
  const preserved = pickPreservedSystemConfig(currentSettings);
  await clearAllData();
  const defaults = await getAccountSettings();
  await saveAccountSettings({
    ...defaults,
    ...preserved,
    monthlyFeeRateRules: [],
    monthlyFeeReliefRules: [],
    monthlyFeePolicyRequests: [],
  });
  await AsyncStorage.setItem(EMPTY_ORG_STATE_KEY, "1");
}

export async function setEmptyOrgState(enabled: boolean): Promise<void> {
  if (enabled) {
    await AsyncStorage.setItem(EMPTY_ORG_STATE_KEY, "1");
    return;
  }
  await AsyncStorage.removeItem(EMPTY_ORG_STATE_KEY);
}

function parseMemberCountFromRaw(rawValue: string | null): number {
  try {
    const parsed = JSON.parse(String(rawValue || "[]"));
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function normalizeOrgIdForMigration(rawValue?: string | null): string {
  return String(rawValue || "").trim().toUpperCase();
}

function isScopedOrSystemStorageKey(key: string): boolean {
  return key.startsWith(ORG_STORAGE_PREFIX) || key.startsWith(SYSTEM_STORAGE_PREFIX);
}

export async function migrateLegacyOrgDataToScopedStorage(
  targetOrgIdInput: string,
  options?: {
    allowLegacyOrg000ToOrg001?: boolean;
    overwriteWhenScopedMembersAtMost?: number;
    mergeWhenLegacyHasMoreMembersByAtLeast?: number;
  }
): Promise<{
  ok: boolean;
  migrated: boolean;
  reason?: string;
  copiedKeys?: number;
  legacyMembers?: number;
  scopedMembers?: number;
}> {
  const targetOrgId = normalizeOrgIdForMigration(targetOrgIdInput);
  if (!targetOrgId || targetOrgId === "ORG000") {
    return { ok: true, migrated: false, reason: "skip_non_scoped_org" };
  }

  const overwriteThreshold = Number.isFinite(Number(options?.overwriteWhenScopedMembersAtMost))
    ? Math.max(0, Number(options?.overwriteWhenScopedMembersAtMost))
    : 1;
  const mergeWhenLegacyHasMoreMembersByAtLeast = Number.isFinite(Number(options?.mergeWhenLegacyHasMoreMembersByAtLeast))
    ? Math.max(0, Number(options?.mergeWhenLegacyHasMoreMembersByAtLeast))
    : 0;
  const allowOrg000Mapping = options?.allowLegacyOrg000ToOrg001 !== false;
  const scopedPrefix = `${ORG_STORAGE_PREFIX}${targetOrgId}:`;
  const scopedMembersKey = `${scopedPrefix}${KEYS.MEMBERS}`;

  try {
    const allKeys = await RawAsyncStorage.getAllKeys();
    const legacyKeys = (allKeys || []).filter(
      (key) => !isScopedOrSystemStorageKey(String(key || "")) && isSharedBackupKey(String(key || ""))
    );
    if (!legacyKeys.length) {
      return { ok: true, migrated: false, reason: "legacy_data_not_found" };
    }

    const checkRows = await RawAsyncStorage.multiGet([KEYS.MEMBERS, scopedMembersKey, KEYS.ACCOUNT_SETTINGS]);
    const legacyMembers = parseMemberCountFromRaw(checkRows?.[0]?.[1] || null);
    const scopedMembers = parseMemberCountFromRaw(checkRows?.[1]?.[1] || null);
    const legacySettingsRaw = checkRows?.[2]?.[1] || null;

    if (legacyMembers <= 0) {
      return { ok: true, migrated: false, reason: "legacy_members_empty", legacyMembers, scopedMembers };
    }
    let mergeMode = false;
    if (scopedMembers > overwriteThreshold) {
      const memberGap = legacyMembers - scopedMembers;
      if (mergeWhenLegacyHasMoreMembersByAtLeast > 0 && memberGap >= mergeWhenLegacyHasMoreMembersByAtLeast) {
        mergeMode = true;
      } else {
        return { ok: true, migrated: false, reason: "scoped_data_already_present", legacyMembers, scopedMembers };
      }
    }

    let legacyOrgId = "";
    try {
      const parsed = JSON.parse(String(legacySettingsRaw || "{}")) as { orgId?: string };
      legacyOrgId = normalizeOrgIdForMigration(parsed?.orgId);
    } catch {
      legacyOrgId = "";
    }

    const orgIdMatches =
      legacyOrgId === targetOrgId ||
      (allowOrg000Mapping && legacyOrgId === "ORG000" && targetOrgId === "ORG001");
    if (!orgIdMatches) {
      return { ok: true, migrated: false, reason: "legacy_org_mismatch", legacyMembers, scopedMembers };
    }

    const legacyPairs = await RawAsyncStorage.multiGet(legacyKeys);
    const existingScopedPairs = mergeMode
      ? await RawAsyncStorage.multiGet(legacyKeys.map((key) => `${scopedPrefix}${key}`))
      : [];
    const existingScopedMap = new Map<string, string | null>(existingScopedPairs);

    const parseJsonValue = (raw: string): { ok: boolean; value: unknown } => {
      try {
        return { ok: true, value: JSON.parse(raw) };
      } catch {
        return { ok: false, value: raw };
      }
    };

    const isObjectWithIdArray = (rows: unknown[]): boolean => {
      if (!Array.isArray(rows) || rows.length === 0) return false;
      return rows.every((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return false;
        return String((row as any).id || "").trim().length > 0;
      });
    };

    const normalizeArrayKey = (value: unknown): string => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const id = String((value as any).id || "").trim();
        if (id) return `id:${id}`;
      }
      try {
        return `json:${JSON.stringify(value)}`;
      } catch {
        return `str:${String(value)}`;
      }
    };

    const mergePreferExisting = (existingRaw: string | null, incomingRaw: string): string => {
      if (!mergeMode || typeof existingRaw !== "string" || !existingRaw.trim()) {
        return incomingRaw;
      }

      const existingParsed = parseJsonValue(existingRaw);
      const incomingParsed = parseJsonValue(incomingRaw);
      if (!existingParsed.ok || !incomingParsed.ok) {
        return existingRaw;
      }

      const existingValue = existingParsed.value;
      const incomingValue = incomingParsed.value;

      if (Array.isArray(existingValue) && Array.isArray(incomingValue)) {
        let mergedArray: unknown[] = [];
        if (isObjectWithIdArray(existingValue) && isObjectWithIdArray(incomingValue)) {
          const seen = new Set<string>();
          mergedArray = [...existingValue];
          existingValue.forEach((row) => seen.add(String((row as any).id || "").trim()));
          incomingValue.forEach((row) => {
            const id = String((row as any).id || "").trim();
            if (!id || seen.has(id)) return;
            seen.add(id);
            mergedArray.push(row);
          });
        } else {
          const seen = new Set<string>();
          mergedArray = [];
          for (const row of [...existingValue, ...incomingValue]) {
            const key = normalizeArrayKey(row);
            if (seen.has(key)) continue;
            seen.add(key);
            mergedArray.push(row);
          }
        }
        return JSON.stringify(mergedArray);
      }

      const isExistingObject =
        !!existingValue && typeof existingValue === "object" && !Array.isArray(existingValue);
      const isIncomingObject =
        !!incomingValue && typeof incomingValue === "object" && !Array.isArray(incomingValue);
      if (isExistingObject && isIncomingObject) {
        return JSON.stringify({ ...(incomingValue as Record<string, unknown>), ...(existingValue as Record<string, unknown>) });
      }

      return existingRaw;
    };

    const scopedPairs: [string, string][] = [];
    for (const [key, value] of legacyPairs) {
      if (typeof value !== "string") continue;
      let nextValue = value;
      const scopedKey = `${scopedPrefix}${key}`;
      if (mergeMode) {
        nextValue = mergePreferExisting(existingScopedMap.get(scopedKey) ?? null, nextValue);
      }
      if (key === KEYS.ACCOUNT_SETTINGS) {
        try {
          const parsed = JSON.parse(value) as Record<string, unknown>;
          const mergedFromMode =
            mergeMode &&
            (() => {
              try {
                return JSON.parse(nextValue) as Record<string, unknown>;
              } catch {
                return null;
              }
            })();
          nextValue = JSON.stringify({
            ...parsed,
            ...(mergedFromMode || {}),
            orgId: targetOrgId,
            orgSetupCompleted: true,
            orgSetupAt: parsed?.orgSetupAt || (mergedFromMode as any)?.orgSetupAt || new Date().toISOString(),
          });
        } catch {
          // keep raw value
        }
      } else if (key === SYNC_SCOPE_META_KEY) {
        try {
          const parsed = JSON.parse(value) as Record<string, unknown>;
          nextValue = JSON.stringify({
            ...parsed,
            orgId: targetOrgId,
            version: Number(parsed?.version || 1) || 1,
            generatedAt: String(parsed?.generatedAt || new Date().toISOString()),
          });
        } catch {
          nextValue = JSON.stringify({
            orgId: targetOrgId,
            version: 1,
            generatedAt: new Date().toISOString(),
            source: mergeMode ? "legacy_migration_merge" : "legacy_migration",
          });
        }
      }
      scopedPairs.push([scopedKey, nextValue]);
    }

    if (!scopedPairs.length) {
      return { ok: true, migrated: false, reason: "legacy_pairs_empty", legacyMembers, scopedMembers };
    }

    await RawAsyncStorage.multiSet(scopedPairs);
    return {
      ok: true,
      migrated: true,
      copiedKeys: scopedPairs.length,
      legacyMembers,
      scopedMembers,
    };
  } catch (error: any) {
    return { ok: false, migrated: false, reason: String(error?.message || "legacy_migration_failed") };
  }
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toHm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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

function makeAuditChangeRequestNumber(
  existing: AuditChangeRequest[],
  tombstones?: { numberSet: Set<string> }
): string {
  const today = new Date();
  const ymd = toYmd(today).replace(/-/g, "");
  const prefix = `AR-${ymd}-`;
  const used = new Set<number>();
  const capture = (value: string) => {
    if (!value.startsWith(prefix)) return;
    const seq = Number(value.slice(prefix.length));
    if (Number.isFinite(seq) && seq > 0) used.add(seq);
  };
  for (const item of existing) {
    capture(String(item.requestNumber || ""));
  }
  if (tombstones?.numberSet) {
    tombstones.numberSet.forEach((value) => capture(String(value || "")));
  }
  let next = 1;
  while (used.has(next)) next += 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

const AUDIT_PATCH_ALLOWED_FIELDS = [
  "type",
  "category",
  "categoryLabel",
  "memberId",
  "payerPayee",
  "amount",
  "date",
  "paymentMethod",
  "receiptNumber",
  "notes",
  "description",
  "loanId",
  "feePeriodStart",
  "feePeriodEnd",
] as const;

function sanitizeAuditPatch(patch: Record<string, any>): Record<string, any> {
  const next: Record<string, any> = {};
  for (const key of AUDIT_PATCH_ALLOWED_FIELDS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (key === "amount") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) next[key] = n;
      continue;
    }
    if (
      key === "type" ||
      key === "category" ||
      key === "categoryLabel" ||
      key === "memberId" ||
      key === "payerPayee" ||
      key === "date" ||
      key === "paymentMethod" ||
      key === "receiptNumber" ||
      key === "notes" ||
      key === "description" ||
      key === "loanId" ||
      key === "feePeriodStart" ||
      key === "feePeriodEnd"
    ) {
      const text = value == null ? "" : String(value).trim();
      next[key] = text;
    }
  }
  return next;
}

function pickTransactionAuditSnapshot(txn: Record<string, any>): Record<string, any> {
  const snapshot: Record<string, any> = {
    id: String(txn?.id || ""),
    auditFlagged: Boolean(txn?.auditFlagged),
    auditNote: String(txn?.auditNote || ""),
  };
  for (const key of AUDIT_PATCH_ALLOWED_FIELDS) {
    snapshot[key] = (txn as any)?.[key];
  }
  return snapshot;
}

function normalizeAuditRequestKind(value: unknown): AuditChangeRequestKind {
  return String(value || "").toLowerCase() === "delete" ? "delete" : "update";
}

function normalizeAuditTargetType(value: unknown, fallbackTargetId: string, fallbackTransactionId: string): AuditChangeTargetType {
  const v = String(value || "").toLowerCase();
  if (v === "loan") return "loan";
  if (v === "transaction") return "transaction";
  if (fallbackTargetId && !fallbackTransactionId) return "loan";
  return "transaction";
}

function normalizeAuditWorkflowStage(value: unknown, _kind: AuditChangeRequestKind, status: AuditChangeRequestStatus): AuditChangeWorkflowStage {
  const v = String(value || "");
  if (v === "auditor_review" || v === "chair_approval" || v === "treasurer_execution" || v === "completed") {
    return v;
  }
  if (status === "rejected" || status === "cancelled") return "completed";
  if (status === "approved") return "treasurer_execution";
  if (status === "suspended") return "chair_approval";
  return "auditor_review";
}

export async function getAuditChangeRequests(): Promise<AuditChangeRequest[]> {
  const rows = await safeGet<AuditChangeRequest[]>(KEYS.AUDIT_CHANGE_REQUESTS, []);
  if (!Array.isArray(rows)) return [];
  const tombstones = await getAuditTestCleanupTombstones();
  return rows
    .map((item: any) => ({
      ...item,
      requestKind: normalizeAuditRequestKind(item?.requestKind),
      status: (item?.status || "pending") as AuditChangeRequestStatus,
      targetType: normalizeAuditTargetType(item?.targetType, String(item?.targetId || ""), String(item?.transactionId || "")),
      targetId: String(item?.targetId || item?.transactionId || item?.relatedLoanId || ""),
      auditNote: String(item?.auditNote || "").trim(),
      originalSnapshot: item?.originalSnapshot && typeof item.originalSnapshot === "object" ? item.originalSnapshot : undefined,
      assignedRole: (item?.assignedRole ||
        (normalizeAuditWorkflowStage(item?.workflowStage, normalizeAuditRequestKind(item?.requestKind), (item?.status || "pending") as AuditChangeRequestStatus) === "treasurer_execution"
          ? "treasurer"
          : normalizeAuditWorkflowStage(item?.workflowStage, normalizeAuditRequestKind(item?.requestKind), (item?.status || "pending") as AuditChangeRequestStatus) === "chair_approval"
            ? "chairperson"
            : "auditor")) as any,
      messages: Array.isArray(item?.messages) ? item.messages : [],
      revisions: Array.isArray(item?.revisions) ? item.revisions : [],
      createdAt: item?.createdAt || new Date().toISOString(),
      updatedAt: item?.updatedAt || item?.createdAt || new Date().toISOString(),
      requestNumber: String(item?.requestNumber || ""),
      workflowStage: normalizeAuditWorkflowStage(item?.workflowStage, normalizeAuditRequestKind(item?.requestKind), (item?.status || "pending") as AuditChangeRequestStatus),
    }))
    .filter((item: any) => String(item?.targetId || "").trim().length > 0)
    .filter((item: any) => {
      const id = String(item?.id || "").trim();
      const requestNumber = String(item?.requestNumber || "").trim();
      if (id && tombstones.idSet.has(id)) return false;
      if (requestNumber && tombstones.numberSet.has(requestNumber)) return false;
      return true;
    })
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

async function saveAuditChangeRequests(rows: AuditChangeRequest[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.AUDIT_CHANGE_REQUESTS, JSON.stringify(rows));
}

export async function getAuditExecutionLogs(): Promise<AuditExecutionLog[]> {
  const [rows, tombstones] = await Promise.all([
    safeGet<AuditExecutionLog[]>(KEYS.AUDIT_EXECUTION_LOGS, []),
    getAuditTestCleanupTombstones(),
  ]);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item: any) => ({
      ...item,
      id: String(item?.id || generateId()),
      requestId: String(item?.requestId || ""),
      requestNumber: String(item?.requestNumber || "").trim() || undefined,
      requestKind: normalizeAuditRequestKind(item?.requestKind),
      action: String(item?.action || "") === "delete_executed" ? "delete_executed" : "update_applied",
      targetType: normalizeAuditTargetType(item?.targetType, String(item?.targetId || ""), String(item?.transactionId || "")),
      targetId: String(item?.targetId || item?.transactionId || item?.relatedLoanId || ""),
      transactionId: String(item?.transactionId || "").trim() || undefined,
      relatedLoanId: String(item?.relatedLoanId || "").trim() || undefined,
      statusAtExecution: (item?.statusAtExecution || "approved") as AuditChangeRequestStatus,
      workflowStageAtExecution: normalizeAuditWorkflowStage(
        item?.workflowStageAtExecution,
        normalizeAuditRequestKind(item?.requestKind),
        (item?.statusAtExecution || "approved") as AuditChangeRequestStatus
      ),
      byUserId: String(item?.byUserId || ""),
      byMemberId: String(item?.byMemberId || "").trim() || undefined,
      byDisplayName: String(item?.byDisplayName || "").trim() || undefined,
      note: String(item?.note || "").trim() || undefined,
      before: item?.before && typeof item.before === "object" ? item.before : undefined,
      patch: item?.patch && typeof item.patch === "object" ? item.patch : undefined,
      after: item?.after && typeof item.after === "object" ? item.after : undefined,
      affectedTransactionIds: Array.isArray(item?.affectedTransactionIds)
        ? item.affectedTransactionIds.map((v: any) => String(v || "").trim()).filter(Boolean)
        : [],
      createdAt: String(item?.createdAt || new Date().toISOString()),
    }))
    .filter((row) => String(row.requestId || "").trim().length > 0)
    .filter((row) => {
      const reqId = String(row.requestId || "").trim();
      const reqNo = String(row.requestNumber || "").trim();
      if (reqId && tombstones.idSet.has(reqId)) return false;
      if (reqNo && tombstones.numberSet.has(reqNo)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

type DeletedTargetIndex = {
  transactionIds: Set<string>;
  loanIds: Set<string>;
};

function normalizeId(value: unknown): string {
  return String(value || "").trim();
}

function collectDeletedTargetsFromExecutionLogs(logs: AuditExecutionLog[]): DeletedTargetIndex {
  const transactionIds = new Set<string>();
  const loanIds = new Set<string>();
  for (const log of logs) {
    if (String(log?.action || "") !== "delete_executed") continue;
    const targetType = String(log?.targetType || "");
    const targetId = normalizeId(log?.targetId);
    const txnId = normalizeId(log?.transactionId);
    const relatedLoanId = normalizeId(log?.relatedLoanId);
    if (targetType === "loan") {
      if (targetId) loanIds.add(targetId);
      if (relatedLoanId) loanIds.add(relatedLoanId);
    } else {
      if (targetId) transactionIds.add(targetId);
      if (txnId) transactionIds.add(txnId);
    }
    const linkedIds = Array.isArray(log?.affectedTransactionIds) ? log.affectedTransactionIds : [];
    for (const id of linkedIds) {
      const normalized = normalizeId(id);
      if (normalized) transactionIds.add(normalized);
    }
    const patchIds = (log as any)?.patch?.__removedLinkedTransactionIds;
    if (Array.isArray(patchIds)) {
      for (const id of patchIds) {
        const normalized = normalizeId(id);
        if (normalized) transactionIds.add(normalized);
      }
    }
    const beforeLinked = (log as any)?.before?.__linkedTransactions;
    if (Array.isArray(beforeLinked)) {
      for (const row of beforeLinked) {
        const id = normalizeId((row as any)?.id);
        if (id) transactionIds.add(id);
      }
    }
  }
  return { transactionIds, loanIds };
}

function isDeletedRow(row: any): boolean {
  return Boolean(row?.deleted || row?.deletedAt);
}

function filterTransactionsByDeletedIndex(txns: Transaction[], index: DeletedTargetIndex): Transaction[] {
  if (!index.transactionIds.size && !index.loanIds.size) return txns;
  return txns.filter((row: any) => {
    const id = normalizeId(row?.id);
    if (id && index.transactionIds.has(id)) return false;
    const loanId = normalizeId(row?.loanId);
    if (loanId && index.loanIds.has(loanId)) return false;
    if (isDeletedRow(row)) return false;
    return true;
  });
}

function filterLoansByDeletedIndex(loans: Loan[], index: DeletedTargetIndex): Loan[] {
  if (!index.loanIds.size) return loans;
  return loans.filter((row: any) => {
    const id = normalizeId(row?.id);
    if (id && index.loanIds.has(id)) return false;
    if (isDeletedRow(row)) return false;
    return true;
  });
}

async function buildDeletedTargetIndexFromStorage(): Promise<DeletedTargetIndex> {
  const logs = await getAuditExecutionLogs();
  return collectDeletedTargetsFromExecutionLogs(logs);
}

export async function pruneDeletedTargetsFromStorage(): Promise<boolean> {
  const [index, txnsRaw, loansRaw] = await Promise.all([
    buildDeletedTargetIndexFromStorage(),
    safeGet<Transaction[]>(KEYS.TRANSACTIONS, []),
    safeGet<Loan[]>(KEYS.LOANS, []),
  ]);
  if (!index.transactionIds.size && !index.loanIds.size) return false;
  const nextTxns = filterTransactionsByDeletedIndex(Array.isArray(txnsRaw) ? txnsRaw : [], index);
  const nextLoans = filterLoansByDeletedIndex(Array.isArray(loansRaw) ? loansRaw : [], index);
  const changed = nextTxns.length !== (Array.isArray(txnsRaw) ? txnsRaw.length : 0) || nextLoans.length !== (Array.isArray(loansRaw) ? loansRaw.length : 0);
  if (changed) {
    await AsyncStorage.multiSet([
      [KEYS.TRANSACTIONS, JSON.stringify(nextTxns)],
      [KEYS.LOANS, JSON.stringify(nextLoans)],
    ]);
  }
  return changed;
}

async function getAuditRequestTargetMemberId(req: AuditChangeRequest): Promise<string> {
  if (String(req?.targetType || "") === "loan") {
    const loans = await getLoans();
    const loan = loans.find((row: any) => String(row?.id || "") === String(req?.targetId || req?.relatedLoanId || ""));
    if (loan) return String((loan as any)?.memberId || "").trim();
    const logs = await getAuditExecutionLogs();
    const log = logs.find((row) => String(row?.requestId || "") === String(req?.id || ""));
    const fallbackMemberId = normalizeId((log as any)?.before?.memberId);
    return fallbackMemberId;
  }
  const txns = await getTransactions();
  const txn = txns.find((row: any) => String(row?.id || "") === String(req?.targetId || req?.transactionId || ""));
  if (txn) return String((txn as any)?.memberId || "").trim();
  const logs = await getAuditExecutionLogs();
  const log = logs.find((row) => String(row?.requestId || "") === String(req?.id || ""));
  return normalizeId((log as any)?.before?.memberId);
}

async function resolveAuditInitiatorRole(input: {
  createdByUserId?: string;
  createdByMemberId?: string;
}): Promise<OrgPosition> {
  try {
    const users = await getUsers();
    const user = users.find((row: any) => String(row?.id || "") === String(input.createdByUserId || ""));
    if (user?.orgPosition) return normalizeOrgPosition(user.orgPosition);
    const members = await getMembers();
    const member = members.find((row: any) => String(row?.id || "") === String(input.createdByMemberId || ""));
    if (member?.orgPosition) return normalizeOrgPosition(member.orgPosition);
  } catch (e) {
    console.warn("resolveAuditInitiatorRole failed:", e);
  }
  return "member";
}

export async function createAuditChangeRequest(input: {
  requestKind?: AuditChangeRequestKind;
  targetType?: AuditChangeTargetType;
  targetId?: string;
  transactionId?: string;
  relatedLoanId?: string;
  auditNote: string;
  createdByUserId: string;
  createdByMemberId?: string;
  createdByDisplayName?: string;
  drafts?: AuditChangeDrafts;
  tagUserIds?: string[];
}): Promise<AuditChangeRequest> {
  const [requests, transactions, loans, deleteIndex, initiatorRole, cleanupTombstones] = await Promise.all([
    getAuditChangeRequests(),
    getTransactions(),
    getLoans(),
    buildDeletedTargetIndexFromStorage(),
    resolveAuditInitiatorRole({ createdByUserId: input.createdByUserId, createdByMemberId: input.createdByMemberId }),
    getAuditTestCleanupTombstones(),
  ]);
  const requestKind: AuditChangeRequestKind = normalizeAuditRequestKind(input.requestKind);
  const resolvedTargetType: AuditChangeTargetType = requestKind === "delete"
    ? normalizeAuditTargetType(input.targetType, String(input.targetId || ""), String(input.transactionId || ""))
    : "transaction";

  const transactionId = String(input.transactionId || (resolvedTargetType === "transaction" ? input.targetId : "") || "").trim();
  const targetId = String(input.targetId || transactionId || (resolvedTargetType === "loan" ? input.relatedLoanId : "") || "").trim();
  if (!targetId) throw new Error("target_id_required");

  const txn = transactions.find((row: any) => String(row?.id || "") === transactionId);
  const loan = loans.find((row: any) => String(row?.id || "") === targetId);
  if (resolvedTargetType === "transaction" && !txn) throw new Error("transaction_not_found");
  if (resolvedTargetType === "loan" && !loan) throw new Error("loan_not_found");
  const originalSnapshot =
    resolvedTargetType === "loan"
      ? (loan ? { ...loan } : undefined)
      : (txn ? { ...txn } : undefined);
  if (requestKind === "delete") {
    if (resolvedTargetType === "loan") {
      if (deleteIndex.loanIds.has(targetId)) throw new Error("already_deleted");
    } else {
      if (deleteIndex.transactionIds.has(targetId) || deleteIndex.transactionIds.has(transactionId)) {
        throw new Error("already_deleted");
      }
      const loanId = normalizeId((txn as any)?.loanId);
      if (loanId && deleteIndex.loanIds.has(loanId)) throw new Error("already_deleted");
    }
  }

  const activeConflict = requests.find((row: any) => {
    const sameTarget =
      String(row?.targetType || "") === resolvedTargetType &&
      String(row?.targetId || "") === targetId;
    if (!sameTarget) return false;
    return (
      row?.status === "pending" ||
      row?.status === "suspended" ||
      (row?.status === "approved" && row?.workflowStage === "treasurer_execution")
    );
  });
  if (activeConflict) {
    throw new Error("request_conflict_in_progress");
  }
  const finalizedConflict = requests.find((row: any) => {
    const sameTarget =
      String(row?.targetType || "") === resolvedTargetType &&
      String(row?.targetId || "") === targetId;
    if (!sameTarget) return false;
    return ["approved", "rejected", "cancelled"].includes(String(row?.status || ""));
  });
  if (finalizedConflict) {
    throw new Error("request_finalized_locked");
  }

  const now = new Date().toISOString();
  const requestId = generateId();
  const noteText = String(input.auditNote || "").trim();
  const initialStage: AuditChangeWorkflowStage =
    initiatorRole === "auditor"
      ? "treasurer_execution"
      : initiatorRole === "chairperson"
        ? "auditor_review"
        : "auditor_review";
  const initialAssignedRole: OrgPosition =
    initialStage === "treasurer_execution" ? "treasurer" : initialStage === "chair_approval" ? "chairperson" : "auditor";
  const message: AuditChangeRequestMessage = {
    id: generateId(),
    requestId,
    messageType: "note",
    note: noteText || (requestKind === "delete" ? "Delete request" : "Audit flag မှတ်ချက်"),
    byUserId: input.createdByUserId,
    byMemberId: input.createdByMemberId,
    byDisplayName: input.createdByDisplayName?.trim() || undefined,
    toRole: initialAssignedRole,
    tagUserIds: input.tagUserIds && input.tagUserIds.length ? Array.from(new Set(input.tagUserIds)) : undefined,
    createdAt: now,
  };

  const request: AuditChangeRequest = {
    id: requestId,
    requestNumber: makeAuditChangeRequestNumber(requests, cleanupTombstones),
    requestKind,
    targetType: resolvedTargetType,
    targetId,
    transactionId: transactionId || undefined,
    relatedLoanId:
      String(input.relatedLoanId || (resolvedTargetType === "transaction" ? (txn as any)?.loanId : targetId) || "").trim() || undefined,
    originalSnapshot: originalSnapshot && typeof originalSnapshot === "object" ? originalSnapshot : undefined,
    status: "pending",
    workflowStage: initialStage,
    auditNote: noteText || "Audit flag မှတ်ချက်",
    initiatedByRole: initiatorRole,
    createdByUserId: input.createdByUserId,
    createdByMemberId: input.createdByMemberId,
    createdAt: now,
    updatedAt: now,
    assignedRole: initialAssignedRole,
    messages: [message],
    revisions: [],
    drafts: input.drafts && Object.keys(input.drafts).length ? input.drafts : undefined,
  };

  await saveAuditChangeRequests([request, ...requests]);
  const targetMemberId =
    resolvedTargetType === "loan"
      ? String((loan as any)?.memberId || "").trim()
      : String((txn as any)?.memberId || "").trim();
  await pushSystemEvent({
    title: requestKind === "delete"
      ? `Delete Request Submitted (${request.requestNumber})`
      : `Audit Change Request Submitted (${request.requestNumber})`,
    description: requestKind === "delete"
      ? `${resolvedTargetType === "loan" ? "Loan" : "Transaction"} ${targetId} ကို ပယ်ဖျက်ရန် တင်သွင်းထားပါသည်`
      : `Transaction ${transactionId} ကို စိစစ်ပြင်ဆင်ရန် တင်သွင်းထားပါသည်`,
    category: requestKind === "delete" ? "delete_request" : "audit_change",
    createdByUserId: input.createdByUserId,
    createdByMemberId: input.createdByMemberId,
    targetUserIds: input.tagUserIds && input.tagUserIds.length ? Array.from(new Set(input.tagUserIds)) : [],
    targetMemberIds: targetMemberId ? [targetMemberId] : [],
    relatedType: "audit_change_request",
    relatedId: request.id,
  });
  return request;
}

export async function addAuditChangeRequestMessage(input: {
  requestId: string;
  byUserId: string;
  byMemberId?: string;
  byDisplayName?: string;
  messageType?: AuditChangeMessageType;
  note: string;
  toRole?: "treasurer" | "auditor" | "chairperson" | "vice_chairperson" | "secretary" | "joint_secretary" | "committee_member" | "member" | "patron" | "applicant";
  toUserId?: string;
  tagUserIds?: string[];
  replyToMessageId?: string;
  setSuspended?: boolean;
}): Promise<void> {
  const requests = await getAuditChangeRequests();
  const idx = requests.findIndex((row: any) => row.id === input.requestId);
  if (idx === -1) throw new Error("request_not_found");
  const req = requests[idx];

  const note = String(input.note || "").trim();
  if (!note) throw new Error("note_required");

  const now = new Date().toISOString();
  const message: AuditChangeRequestMessage = {
    id: generateId(),
    requestId: req.id,
    messageType: input.messageType || "reply",
    note,
    byUserId: input.byUserId,
    byMemberId: input.byMemberId,
    byDisplayName: input.byDisplayName?.trim() || undefined,
    toRole: input.toRole,
    toUserId: input.toUserId ? String(input.toUserId).trim() : undefined,
    tagUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [],
    replyToMessageId: input.replyToMessageId,
    createdAt: now,
  };

  const next = {
    ...req,
    updatedAt: now,
    messages: [...(req.messages || []), message],
  } as AuditChangeRequest;

  if (input.setSuspended) {
    next.status = "suspended";
    next.workflowStage = "chair_approval";
    next.assignedRole = "chairperson";
    next.escalatedToChairAt = now;
    next.escalatedByUserId = input.byUserId;
  }
  requests[idx] = next;
  await saveAuditChangeRequests(requests);
  await pushSystemEvent({
    title: `Audit Change Request Updated (${req.requestNumber})`,
    description: `${note.slice(0, 80)}${note.length > 80 ? "..." : ""}`,
    category: "audit_change",
    createdByUserId: input.byUserId,
    createdByMemberId: input.byMemberId,
    targetUserIds: [
      ...(message.toUserId ? [message.toUserId] : []),
      ...((message.tagUserIds || []) as string[]),
      String(req.createdByUserId || "").trim(),
    ].filter(Boolean),
    relatedType: "audit_change_request",
    relatedId: req.id,
  });
}

export async function changeAuditChangeRequestStatus(input: {
  requestId: string;
  status: AuditChangeRequestStatus;
  byUserId: string;
  byMemberId?: string;
  byDisplayName?: string;
  note?: string;
  tagUserIds?: string[];
}): Promise<void> {
  const requests = await getAuditChangeRequests();
  const idx = requests.findIndex((row: any) => row.id === input.requestId);
  if (idx === -1) throw new Error("request_not_found");
  const req = requests[idx];
  const now = new Date().toISOString();

  const status = input.status;
  if (!["pending", "approved", "rejected", "cancelled", "suspended"].includes(String(status))) {
    throw new Error("invalid_status");
  }

  const decisionNote = String(input.note || "").trim();
  const message: AuditChangeRequestMessage = {
    id: generateId(),
    requestId: req.id,
    messageType: "decision",
    note: decisionNote || `Status changed to ${status}`,
    byUserId: input.byUserId,
    byMemberId: input.byMemberId,
    byDisplayName: input.byDisplayName?.trim() || undefined,
    toRole: status === "suspended" ? "chairperson" : undefined,
    tagUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : undefined,
    createdAt: now,
  };

  const nextStage: AuditChangeWorkflowStage = (() => {
    if (status === "rejected" || status === "cancelled") return "completed";
    if (status === "suspended") return "chair_approval";
    if (status === "approved") {
      if (req.workflowStage === "chair_approval") return "treasurer_execution";
      return req.workflowStage || "treasurer_execution";
    }
    if (status === "pending") {
      if (req.workflowStage && req.workflowStage !== "completed") return req.workflowStage;
      return "auditor_review";
    }
    return req.workflowStage || "auditor_review";
  })();
  const nextAssignedRole: OrgPosition | undefined =
    nextStage === "chair_approval"
      ? "chairperson"
      : nextStage === "treasurer_execution"
        ? "treasurer"
        : nextStage === "auditor_review"
          ? "auditor"
          : undefined;

  requests[idx] = {
    ...req,
    status,
    workflowStage: nextStage,
    assignedRole: nextAssignedRole,
    reviewedByUserId: input.byUserId,
    reviewedAt: now,
    reviewNote: decisionNote || undefined,
    updatedAt: now,
    escalatedToChairAt: status === "suspended" ? now : req.escalatedToChairAt,
    escalatedByUserId: status === "suspended" ? input.byUserId : req.escalatedByUserId,
    messages: [...(req.messages || []), message],
  };
  await saveAuditChangeRequests(requests);
  const targetMemberId = await getAuditRequestTargetMemberId(req);
  await pushSystemEvent({
    title: `Audit Change Request ${status.toUpperCase()} (${req.requestNumber})`,
    description: decisionNote || `Status: ${status}`,
    category: "audit_change",
    createdByUserId: input.byUserId,
    createdByMemberId: input.byMemberId,
    targetUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [],
    targetMemberIds: targetMemberId ? [targetMemberId] : [],
    relatedType: "audit_change_request",
    relatedId: req.id,
  });
}

export async function forwardAuditChangeRequestToChair(input: {
  requestId: string;
  byUserId: string;
  byMemberId?: string;
  byDisplayName?: string;
  note: string;
  tagUserIds?: string[];
}): Promise<void> {
  const requests = await getAuditChangeRequests();
  const idx = requests.findIndex((row: any) => row.id === input.requestId);
  if (idx === -1) throw new Error("request_not_found");
  const req = requests[idx];
  if (req.workflowStage && req.workflowStage !== "auditor_review") throw new Error("invalid_stage");

  const note = String(input.note || "").trim();
  if (!note) throw new Error("note_required");
  const now = new Date().toISOString();

  const msg: AuditChangeRequestMessage = {
    id: generateId(),
    requestId: req.id,
    messageType: "forward",
    note,
    byUserId: input.byUserId,
    byMemberId: input.byMemberId,
    byDisplayName: input.byDisplayName?.trim() || undefined,
    toRole: "chairperson",
    tagUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : undefined,
    createdAt: now,
  };

  requests[idx] = {
    ...req,
    status: "suspended",
    workflowStage: "chair_approval",
    assignedRole: "chairperson",
    escalatedToChairAt: now,
    escalatedByUserId: input.byUserId,
    updatedAt: now,
    messages: [...(req.messages || []), msg],
  };
  await saveAuditChangeRequests(requests);
  const targetMemberId = await getAuditRequestTargetMemberId(req);
  await pushSystemEvent({
    title: `${req.requestKind === "delete" ? "Delete Request" : "Audit Change Request"} Forwarded to Chair (${req.requestNumber})`,
    description: `${req.targetType} ${req.targetId} - chair approval requested`,
    category: req.requestKind === "delete" ? "delete_request" : "audit_change",
    createdByUserId: input.byUserId,
    createdByMemberId: input.byMemberId,
    targetUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [],
    targetMemberIds: targetMemberId ? [targetMemberId] : [],
    relatedType: "audit_change_request",
    relatedId: req.id,
  });
}

export async function sendAuditRequestBackToTreasurer(input: {
  requestId: string;
  byUserId: string;
  byMemberId?: string;
  byDisplayName?: string;
  note: string;
  tagUserIds?: string[];
}): Promise<void> {
  const requests = await getAuditChangeRequests();
  const idx = requests.findIndex((row: any) => row.id === input.requestId);
  if (idx === -1) throw new Error("request_not_found");
  const req = requests[idx];
  if (req.workflowStage === "completed") throw new Error("invalid_stage");
  if (req.workflowStage && !["auditor_review", "chair_approval"].includes(req.workflowStage)) {
    throw new Error("invalid_stage");
  }
  const note = String(input.note || "").trim();
  if (!note) throw new Error("note_required");
  const now = new Date().toISOString();

  const msg: AuditChangeRequestMessage = {
    id: generateId(),
    requestId: req.id,
    messageType: "forward",
    note,
    byUserId: input.byUserId,
    byMemberId: input.byMemberId,
    byDisplayName: input.byDisplayName?.trim() || undefined,
    toRole: "treasurer",
    tagUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : undefined,
    createdAt: now,
  };

  requests[idx] = {
    ...req,
    status: "pending",
    workflowStage: "treasurer_execution",
    assignedRole: "treasurer",
    updatedAt: now,
    messages: [...(req.messages || []), msg],
  };
  await saveAuditChangeRequests(requests);
  const targetMemberId = await getAuditRequestTargetMemberId(req);
  await pushSystemEvent({
    title: `Audit Request Returned to Treasurer (${req.requestNumber})`,
    description: note,
    category: req.requestKind === "delete" ? "delete_request" : "audit_change",
    createdByUserId: input.byUserId,
    createdByMemberId: input.byMemberId,
    targetUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [],
    targetMemberIds: targetMemberId ? [targetMemberId] : [],
    relatedType: "audit_change_request",
    relatedId: req.id,
  });
}

export async function sendAuditRequestBackToAuditor(input: {
  requestId: string;
  byUserId: string;
  byMemberId?: string;
  byDisplayName?: string;
  note: string;
  tagUserIds?: string[];
}): Promise<void> {
  const requests = await getAuditChangeRequests();
  const idx = requests.findIndex((row: any) => row.id === input.requestId);
  if (idx === -1) throw new Error("request_not_found");
  const req = requests[idx];
  if (req.workflowStage === "completed") throw new Error("invalid_stage");
  if (req.workflowStage && !["treasurer_execution", "chair_approval"].includes(req.workflowStage)) {
    throw new Error("invalid_stage");
  }
  const note = String(input.note || "").trim();
  if (!note) throw new Error("note_required");
  const now = new Date().toISOString();

  const msg: AuditChangeRequestMessage = {
    id: generateId(),
    requestId: req.id,
    messageType: "reply",
    note,
    byUserId: input.byUserId,
    byMemberId: input.byMemberId,
    byDisplayName: input.byDisplayName?.trim() || undefined,
    toRole: "auditor",
    tagUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : undefined,
    createdAt: now,
  };

  requests[idx] = {
    ...req,
    status: "pending",
    workflowStage: "auditor_review",
    assignedRole: "auditor",
    updatedAt: now,
    messages: [...(req.messages || []), msg],
  };
  await saveAuditChangeRequests(requests);
  const targetMemberId = await getAuditRequestTargetMemberId(req);
  await pushSystemEvent({
    title: `Audit Request Sent to Auditor (${req.requestNumber})`,
    description: note,
    category: req.requestKind === "delete" ? "delete_request" : "audit_change",
    createdByUserId: input.byUserId,
    createdByMemberId: input.byMemberId,
    targetUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [],
    targetMemberIds: targetMemberId ? [targetMemberId] : [],
    relatedType: "audit_change_request",
    relatedId: req.id,
  });
}

export async function saveAuditChangeRequestDraft(input: {
  requestId: string;
  role: "treasurer" | "auditor" | "chairperson";
  values: Record<string, any>;
  note?: string;
  byUserId: string;
  byMemberId?: string;
  byDisplayName?: string;
}): Promise<void> {
  const requests = await getAuditChangeRequests();
  const idx = requests.findIndex((row: any) => row.id === input.requestId);
  if (idx === -1) throw new Error("request_not_found");
  const req = requests[idx];
  const now = new Date().toISOString();
  const role = input.role;

  const nextDraft = {
    values: { ...(input.values || {}) },
    note: String(input.note || "").trim() || undefined,
    byUserId: input.byUserId,
    byMemberId: input.byMemberId,
    byDisplayName: input.byDisplayName?.trim() || undefined,
    updatedAt: now,
  };

  requests[idx] = {
    ...req,
    drafts: {
      ...(req.drafts || {}),
      [role]: nextDraft,
    },
    updatedAt: now,
  };

  await saveAuditChangeRequests(requests);
}

export async function forwardDeleteAuditRequestToChair(input: {
  requestId: string;
  byUserId: string;
  byMemberId?: string;
  byDisplayName?: string;
  note: string;
}): Promise<void> {
  return forwardAuditChangeRequestToChair(input);
}

export async function chairReviewAuditRequest(input: {
  requestId: string;
  byUserId: string;
  byMemberId?: string;
  byDisplayName?: string;
  approved: boolean;
  note: string;
  tagUserIds?: string[];
}): Promise<void> {
  const requests = await getAuditChangeRequests();
  const idx = requests.findIndex((row: any) => row.id === input.requestId);
  if (idx === -1) throw new Error("request_not_found");
  const req = requests[idx];
  if (req.workflowStage !== "chair_approval") throw new Error("invalid_stage");

  const note = String(input.note || "").trim();
  if (!note) throw new Error("note_required");
  const now = new Date().toISOString();
  const approved = Boolean(input.approved);

  const msg: AuditChangeRequestMessage = {
    id: generateId(),
    requestId: req.id,
    messageType: "decision",
    note,
    byUserId: input.byUserId,
    byMemberId: input.byMemberId,
    byDisplayName: input.byDisplayName?.trim() || undefined,
    toRole: approved ? "treasurer" : "auditor",
    tagUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : undefined,
    createdAt: now,
  };

  requests[idx] = {
    ...req,
    status: approved ? "approved" : "rejected",
    workflowStage: approved ? "treasurer_execution" : "completed",
    assignedRole: approved ? "treasurer" : "auditor",
    reviewedByUserId: input.byUserId,
    reviewedAt: now,
    reviewNote: note,
    chairApprovedByUserId: approved ? input.byUserId : req.chairApprovedByUserId,
    chairApprovedAt: approved ? now : req.chairApprovedAt,
    updatedAt: now,
    messages: [...(req.messages || []), msg],
  };
  await saveAuditChangeRequests(requests);
  const targetMemberId = await getAuditRequestTargetMemberId(req);
  await pushSystemEvent({
    title: approved
      ? `${req.requestKind === "delete" ? "Delete Request" : "Audit Change Request"} Approved by Chair (${req.requestNumber})`
      : `${req.requestKind === "delete" ? "Delete Request" : "Audit Change Request"} Rejected by Chair (${req.requestNumber})`,
    description: note,
    category: req.requestKind === "delete" ? "delete_request" : "audit_change",
    createdByUserId: input.byUserId,
    createdByMemberId: input.byMemberId,
    targetUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [],
    targetMemberIds: targetMemberId ? [targetMemberId] : [],
    relatedType: "audit_change_request",
    relatedId: req.id,
  });
}

export async function chairReviewDeleteAuditRequest(input: {
  requestId: string;
  byUserId: string;
  byMemberId?: string;
  byDisplayName?: string;
  approved: boolean;
  note: string;
  tagUserIds?: string[];
}): Promise<void> {
  return chairReviewAuditRequest(input);
}

export async function confirmDeleteAuditRequestExecution(input: {
  requestId: string;
  byUserId: string;
  byMemberId?: string;
  byDisplayName?: string;
  note?: string;
  tagUserIds?: string[];
}): Promise<void> {
  const [requests, txns, loans, executionLogs] = await Promise.all([
    getAuditChangeRequests(),
    getTransactions(),
    getLoans(),
    getAuditExecutionLogs(),
  ]);
  const idx = requests.findIndex((row: any) => row.id === input.requestId);
  if (idx === -1) throw new Error("request_not_found");
  const req = requests[idx];
  if (req.requestKind !== "delete") throw new Error("not_delete_request");
  if (req.workflowStage !== "treasurer_execution" || req.status !== "approved") throw new Error("request_not_ready_for_execution");

  const now = new Date().toISOString();
  let snapshotBefore: Record<string, any> = {};
  let removedLinkedTransactionIds: string[] = [];
  if (req.targetType === "loan") {
    const loanIdx = loans.findIndex((row: any) => String(row?.id || "") === String(req.targetId || ""));
    if (loanIdx === -1) throw new Error("loan_not_found");
    const loanSnapshot = { ...(loans[loanIdx] as any) };
    const linkedTransactions = txns.filter((row: any) => String(row?.loanId || "") === String(req.targetId || ""));
    removedLinkedTransactionIds = linkedTransactions.map((row: any) => String(row?.id || "")).filter(Boolean);
    snapshotBefore = {
      ...loanSnapshot,
      __linkedTransactions: linkedTransactions,
    };
    loans.splice(loanIdx, 1);
    if (removedLinkedTransactionIds.length > 0) {
      for (let i = txns.length - 1; i >= 0; i--) {
        const row = txns[i] as any;
        if (String(row?.loanId || "") === String(req.targetId || "")) {
          txns.splice(i, 1);
        }
      }
    }
  } else {
    const txnIdx = txns.findIndex((row: any) => String(row?.id || "") === String(req.targetId || req.transactionId || ""));
    if (txnIdx === -1) throw new Error("transaction_not_found");
    snapshotBefore = { ...(txns[txnIdx] as any) };
    txns.splice(txnIdx, 1);
  }

  const revision: AuditChangeRevision = {
    id: generateId(),
    requestId: req.id,
    transactionId: String(req.transactionId || req.targetId || ""),
    byUserId: input.byUserId,
    byMemberId: input.byMemberId,
    note: String(input.note || "").trim() || "Delete confirmed by treasurer",
    before: snapshotBefore,
    patch: {
      __action: "delete",
      __removedLinkedTransactionIds: removedLinkedTransactionIds,
    },
    after: {
      deleted: true,
      deletedAt: now,
      removedLinkedTransactionCount: removedLinkedTransactionIds.length,
    },
    createdAt: now,
  };

  const executionLog: AuditExecutionLog = {
    id: generateId(),
    requestId: req.id,
    requestNumber: req.requestNumber,
    requestKind: "delete",
    action: "delete_executed",
    targetType: req.targetType,
    targetId: String(req.targetId || req.transactionId || ""),
    transactionId: req.transactionId,
    relatedLoanId: req.relatedLoanId,
    statusAtExecution: "approved",
    workflowStageAtExecution: "completed",
    byUserId: input.byUserId,
    byMemberId: input.byMemberId,
    byDisplayName: input.byDisplayName?.trim() || undefined,
    note: String(input.note || "").trim() || "စာရင်းကို ပယ်ဖျက်ပြီး အတည်ပြုပြီးပါပြီ။",
    before: snapshotBefore,
    patch: {
      __action: "delete",
      __removedLinkedTransactionIds: removedLinkedTransactionIds,
    },
    after: {
      deleted: true,
      deletedAt: now,
      removedLinkedTransactionCount: removedLinkedTransactionIds.length,
    },
    affectedTransactionIds: removedLinkedTransactionIds,
    createdAt: now,
  };

  const msg: AuditChangeRequestMessage = {
    id: generateId(),
    requestId: req.id,
    messageType: "decision",
    note: String(input.note || "").trim() || "စာရင်းကို ပယ်ဖျက်ပြီး အတည်ပြုပြီးပါပြီ။",
    byUserId: input.byUserId,
    byMemberId: input.byMemberId,
    byDisplayName: input.byDisplayName?.trim() || undefined,
    tagUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : undefined,
    createdAt: now,
  };

  requests[idx] = {
    ...req,
    status: "approved",
    workflowStage: "completed",
    assignedRole: undefined,
    reviewedByUserId: input.byUserId,
    reviewedAt: now,
    reviewNote: String(input.note || "").trim() || req.reviewNote,
    treasurerConfirmedByUserId: input.byUserId,
    treasurerConfirmedAt: now,
    updatedAt: now,
    revisions: [...(req.revisions || []), revision],
    messages: [...(req.messages || []), msg],
  };

  const nextExecutionLogs = [executionLog, ...(executionLogs || [])].slice(0, 4000);

  await AsyncStorage.multiSet([
    [KEYS.AUDIT_CHANGE_REQUESTS, JSON.stringify(requests)],
    [KEYS.TRANSACTIONS, JSON.stringify(txns)],
    [KEYS.LOANS, JSON.stringify(loans)],
    [KEYS.AUDIT_EXECUTION_LOGS, JSON.stringify(nextExecutionLogs)],
  ]);
  const targetMemberId = await getAuditRequestTargetMemberId(req);
  await pushSystemEvent({
    title: `Delete Executed (${req.requestNumber})`,
    description:
      req.targetType === "loan" && removedLinkedTransactionIds.length > 0
        ? `${req.targetType} ${req.targetId} ကို ပယ်ဖျက်ပြီး linked transactions ${removedLinkedTransactionIds.length} ခု ဖယ်ရှားပြီးပါပြီ`
        : `${req.targetType} ${req.targetId} ကို ပယ်ဖျက်ပြီးပါပြီ`,
    category: "delete_request",
    createdByUserId: input.byUserId,
    createdByMemberId: input.byMemberId,
    targetUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [],
    targetMemberIds: targetMemberId ? [targetMemberId] : [],
    relatedType: "audit_change_request",
    relatedId: req.id,
  });
}

export async function applyAuditChangeRequestPatch(input: {
  requestId: string;
  byUserId: string;
  byMemberId?: string;
  byDisplayName?: string;
  patch: Record<string, any>;
  note?: string;
  tagUserIds?: string[];
}): Promise<void> {
  const [requests, txns, executionLogs] = await Promise.all([
    getAuditChangeRequests(),
    getTransactions(),
    getAuditExecutionLogs(),
  ]);
  const reqIdx = requests.findIndex((row: any) => row.id === input.requestId);
  if (reqIdx === -1) throw new Error("request_not_found");
  const req = requests[reqIdx];
  if (req.requestKind === "delete") throw new Error("invalid_request_kind");
  if (req.workflowStage !== "treasurer_execution" || String(req.status || "") !== "approved") {
    throw new Error("request_not_ready_for_execution");
  }

  const txnIdx = txns.findIndex((row: any) => String(row?.id || "") === String(req.transactionId || ""));
  if (txnIdx === -1) throw new Error("transaction_not_found");
  const currentTxn = txns[txnIdx] as any;

  const sanitizedPatch = sanitizeAuditPatch(input.patch || {});
  const hasPatchChanges = Object.keys(sanitizedPatch).length > 0;
  const nextReceipt = String(sanitizedPatch.receiptNumber || "").trim();
  const currentReceipt = String((currentTxn as any)?.receiptNumber || "").trim();
  if (nextReceipt && nextReceipt.toLowerCase() !== currentReceipt.toLowerCase()) {
    const duplicate = txns.find((row: any) => {
      if (String(row?.id || "") === String(currentTxn?.id || "")) return false;
      const existing = String(row?.receiptNumber || "").trim();
      return existing && existing.toLowerCase() === nextReceipt.toLowerCase();
    });
    if (duplicate) throw new Error("duplicate_receipt");
  }

  const before = pickTransactionAuditSnapshot(currentTxn);
  const afterTxn = {
    ...currentTxn,
    ...sanitizedPatch,
    auditFlagged: false,
    auditNote: "",
    auditFlaggedByUserId: "",
    auditFlaggedAt: "",
  };
  txns[txnIdx] = afterTxn;
  const after = pickTransactionAuditSnapshot(afterTxn);

  const now = new Date().toISOString();
  const revision: AuditChangeRevision = {
    id: generateId(),
    requestId: req.id,
    transactionId: String(req.transactionId || ""),
    byUserId: input.byUserId,
    byMemberId: input.byMemberId,
    note: String(input.note || "").trim() || undefined,
    before,
    patch: hasPatchChanges ? sanitizedPatch : { __noChange: true },
    after,
    createdAt: now,
  };

  const executionLog: AuditExecutionLog = {
    id: generateId(),
    requestId: req.id,
    requestNumber: req.requestNumber,
    requestKind: "update",
    action: "update_applied",
    targetType: req.targetType || "transaction",
    targetId: String(req.targetId || req.transactionId || ""),
    transactionId: req.transactionId,
    relatedLoanId: req.relatedLoanId,
    statusAtExecution: "approved",
    workflowStageAtExecution: "completed",
    byUserId: input.byUserId,
    byMemberId: input.byMemberId,
    byDisplayName: input.byDisplayName?.trim() || undefined,
    note: String(input.note || "").trim() || (hasPatchChanges ? "စာရင်းကို ပြင်ဆင်ပြီး အတည်ပြုပြီးပါပြီ။" : "ပြင်ဆင်စရာမရှိ၍ အတည်ပြုပြီးပါပြီ။"),
    before,
    patch: hasPatchChanges ? sanitizedPatch : { __noChange: true },
    after,
    createdAt: now,
  };

  const decisionMessage: AuditChangeRequestMessage = {
    id: generateId(),
    requestId: req.id,
    messageType: "decision",
    note: String(input.note || "").trim() || (hasPatchChanges ? "စာရင်းကို ပြင်ဆင်ပြီး အတည်ပြုပြီးပါပြီ။" : "ပြင်ဆင်စရာမရှိ၍ အတည်ပြုပြီးပါပြီ။"),
    byUserId: input.byUserId,
    byMemberId: input.byMemberId,
    byDisplayName: input.byDisplayName?.trim() || undefined,
    tagUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : undefined,
    createdAt: now,
  };

  requests[reqIdx] = {
    ...req,
    status: "approved",
    workflowStage: "completed",
    assignedRole: undefined,
    reviewedByUserId: input.byUserId,
    reviewedAt: now,
    reviewNote: String(input.note || "").trim() || undefined,
    updatedAt: now,
    resolvedTransactionId: String(req.transactionId || ""),
    revisions: [...(req.revisions || []), revision],
    messages: [...(req.messages || []), decisionMessage],
  };

  const nextExecutionLogs = [executionLog, ...(executionLogs || [])].slice(0, 4000);

  await AsyncStorage.multiSet([
    [KEYS.TRANSACTIONS, JSON.stringify(txns)],
    [KEYS.AUDIT_CHANGE_REQUESTS, JSON.stringify(requests)],
    [KEYS.AUDIT_EXECUTION_LOGS, JSON.stringify(nextExecutionLogs)],
  ]);
  const targetMemberId = String((afterTxn as any)?.memberId || "").trim();
  await pushSystemEvent({
    title: `Audit Change Applied (${req.requestNumber})`,
    description: hasPatchChanges
      ? `Transaction ${req.transactionId} ကို ပြင်ဆင်ပြီး အတည်ပြုခဲ့ပါသည်`
      : `Transaction ${req.transactionId} တွင် ပြင်ဆင်စရာမရှိ၍ အတည်ပြုခဲ့ပါသည်`,
    category: "audit_change",
    createdByUserId: input.byUserId,
    createdByMemberId: input.byMemberId,
    targetUserIds: Array.isArray(input.tagUserIds)
      ? input.tagUserIds.map((v) => String(v || "").trim()).filter(Boolean)
      : [],
    targetMemberIds: targetMemberId ? [targetMemberId] : [],
    relatedType: "audit_change_request",
    relatedId: req.id,
  });
}

function mapPaymentRequestKindToIncomeCategory(
  kind: MemberPaymentRequestKind
): { category: string; categoryLabel: string } {
  if (kind === "member_fees") return { category: "member_fees", categoryLabel: "လစဉ်ကြေးရငွေ" };
  if (kind === "donations") return { category: "donations", categoryLabel: "အလှူငွေရရှိ" };
  if (kind === "loan_repayment") return { category: "loan_repayment", categoryLabel: "ချေးငွေပြန်ဆပ်ရရှိငွေ" };
  return { category: "interest_income", categoryLabel: "အတိုးရငွေ" };
}

const COMMITTEE_NOTIFICATION_ROLES: OrgPosition[] = [
  "patron",
  "chairperson",
  "vice_chairperson",
  "secretary",
  "joint_secretary",
  "treasurer",
  "auditor",
  "committee_member",
];

function normalizeOrgPositionList(values: unknown[]): OrgPosition[] {
  const set = new Set<OrgPosition>();
  for (const row of values || []) {
    const role = normalizeOrgPosition(row);
    set.add(role);
  }
  return Array.from(set.values());
}

async function resolveNotificationTargetUserIds(input: {
  targetUserIds?: string[];
  targetMemberIds?: string[];
  targetRoles?: OrgPosition[];
  includeCommittee?: boolean;
  includeCreator?: boolean;
  createdByUserId?: string;
}): Promise<string[]> {
  const users = await getUsers();
  const activeUsers = (users || []).filter((row) => row?.isActive !== false);
  const activeIds = new Set(activeUsers.map((row) => String(row.id || "")).filter(Boolean));
  const target = new Set<string>();

  if (input.includeCommittee) {
    const committeeRoleSet = new Set(COMMITTEE_NOTIFICATION_ROLES);
    activeUsers.forEach((row: any) => {
      const role = normalizeOrgPosition(row?.orgPosition || "member");
      if (committeeRoleSet.has(role)) target.add(String(row?.id || ""));
    });
  }

  const roleSet = new Set(normalizeOrgPositionList((input.targetRoles || []) as unknown[]));
  if (roleSet.size > 0) {
    activeUsers.forEach((row: any) => {
      const role = normalizeOrgPosition(row?.orgPosition || "member");
      if (roleSet.has(role)) target.add(String(row?.id || ""));
    });
  }

  const memberSet = new Set((input.targetMemberIds || []).map((v) => String(v || "").trim()).filter(Boolean));
  if (memberSet.size > 0) {
    activeUsers.forEach((row: any) => {
      const memberId = String(row?.memberId || "").trim();
      if (memberId && memberSet.has(memberId)) target.add(String(row?.id || ""));
    });
  }

  (input.targetUserIds || []).forEach((id) => {
    const userId = String(id || "").trim();
    if (userId && activeIds.has(userId)) target.add(userId);
  });

  if (input.includeCreator && input.createdByUserId) {
    const creatorId = String(input.createdByUserId || "").trim();
    if (creatorId && activeIds.has(creatorId)) target.add(creatorId);
  }

  return Array.from(target.values()).filter(Boolean);
}

export async function getNotifications(): Promise<AppNotification[]> {
  const rows = await safeGet<AppNotification[]>(KEYS.NOTIFICATIONS, []);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item: any) => ({
      id: String(item?.id || ""),
      title: String(item?.title || ""),
      description: String(item?.description || ""),
      category: (item?.category || "system") as AppNotification["category"],
      createdAt: String(item?.createdAt || new Date().toISOString()),
      createdByUserId: item?.createdByUserId ? String(item.createdByUserId) : undefined,
      createdByMemberId: item?.createdByMemberId ? String(item.createdByMemberId) : undefined,
      targetUserIds: Array.isArray(item?.targetUserIds)
        ? item.targetUserIds.map((v: any) => String(v || "").trim()).filter(Boolean)
        : [],
      relatedType: item?.relatedType ? String(item.relatedType) : undefined,
      relatedId: item?.relatedId ? String(item.relatedId) : undefined,
      readByUserIds: Array.isArray(item?.readByUserIds)
        ? item.readByUserIds.map((v: any) => String(v || "").trim()).filter(Boolean)
        : [],
    }))
    .filter((item) => item.id && item.title && item.createdAt)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

async function saveNotifications(rows: AppNotification[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.NOTIFICATIONS, JSON.stringify(rows));
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  const nId = String(notificationId || "").trim();
  const uId = String(userId || "").trim();
  if (!nId || !uId) return;
  const rows = await getNotifications();
  const idx = rows.findIndex((row) => String(row.id || "") === nId);
  if (idx === -1) return;
  const readSet = new Set((rows[idx].readByUserIds || []).map((v) => String(v || "").trim()).filter(Boolean));
  readSet.add(uId);
  rows[idx] = {
    ...rows[idx],
    readByUserIds: Array.from(readSet.values()),
  };
  await saveNotifications(rows);
}

export async function deleteNotificationsForUser(input: {
  notificationIds: string[];
  userId: string;
}): Promise<{ removedIds: string[]; updatedIds: string[] }> {
  const ids = new Set((input.notificationIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  const userId = String(input.userId || "").trim();
  if (ids.size === 0 || !userId) return { removedIds: [], updatedIds: [] };

  const rows = await getNotifications();
  const removedIds: string[] = [];
  const updatedIds: string[] = [];

  const next = rows
    .map((row) => {
      const rowId = String(row?.id || "").trim();
      if (!rowId || !ids.has(rowId)) return row;
      const targetUserIds = Array.isArray(row?.targetUserIds) ? row.targetUserIds : [];
      const readByUserIds = Array.isArray(row?.readByUserIds) ? row.readByUserIds : [];
      const remainingTargets = targetUserIds.filter((id: any) => String(id || "").trim() !== userId);
      const remainingReads = readByUserIds.filter((id: any) => String(id || "").trim() !== userId);
      if (remainingTargets.length === 0) {
        removedIds.push(rowId);
        return null;
      }
      updatedIds.push(rowId);
      return {
        ...row,
        targetUserIds: remainingTargets,
        readByUserIds: remainingReads,
      };
    })
    .filter(Boolean) as AppNotification[];

  await saveNotifications(next);
  return { removedIds, updatedIds };
}

async function pushSystemNotification(input: {
  title: string;
  description: string;
  category?: AppNotification["category"];
  createdByUserId?: string;
  createdByMemberId?: string;
  targetUserIds?: string[];
  targetMemberIds?: string[];
  targetRoles?: OrgPosition[];
  includeCommittee?: boolean;
  includeCreator?: boolean;
  relatedType?: string;
  relatedId?: string;
}) {
  try {
    const targetUserIds = await resolveNotificationTargetUserIds({
      targetUserIds: input.targetUserIds,
      targetMemberIds: input.targetMemberIds,
      targetRoles: input.targetRoles,
      includeCommittee: input.includeCommittee !== false,
      includeCreator: input.includeCreator !== false,
      createdByUserId: input.createdByUserId,
    });
    if (targetUserIds.length === 0) return;

    const rows = await getNotifications();
    const item: AppNotification = {
      id: generateId(),
      title: String(input.title || "").trim(),
      description: String(input.description || "").trim(),
      category: (input.category || "system") as AppNotification["category"],
      createdAt: new Date().toISOString(),
      createdByUserId: input.createdByUserId,
      createdByMemberId: input.createdByMemberId,
      targetUserIds,
      relatedType: input.relatedType?.trim() || undefined,
      relatedId: input.relatedId?.trim() || undefined,
      readByUserIds: [],
    };
    if (!item.title) return;
    await saveNotifications([item, ...rows]);
  } catch (error) {
    console.log("pushSystemNotification failed", error);
  }
}

async function pushSystemEvent(input: {
  title: string;
  description: string;
  createdByUserId?: string;
  createdByMemberId?: string;
  category?: AppNotification["category"];
  targetUserIds?: string[];
  targetMemberIds?: string[];
  targetRoles?: OrgPosition[];
  includeCommittee?: boolean;
  includeCreator?: boolean;
  relatedType?: string;
  relatedId?: string;
}) {
  await pushSystemNotification(input);
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
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const claim: ExpenseClaim = {
    id: generateId(),
    claimNumber: makeClaimNumber(claims),
    claimDate: input.claimDate || toYmd(nowDate),
    claimTime: input.claimTime || toHm(nowDate),
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
    category: "expense_claim",
    createdByUserId: claim.createdByUserId,
    createdByMemberId: claim.createdByMemberId,
    targetMemberIds: [String(claim.claimantMemberId || claim.relatedMemberId || "").trim()].filter(Boolean),
    relatedType: "expense_claim",
    relatedId: claim.id,
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
    category: "expense_claim",
    createdByUserId: input.approverUserId,
    targetMemberIds: [String(claims[idx].claimantMemberId || claims[idx].relatedMemberId || "").trim()].filter(Boolean),
    relatedType: "expense_claim",
    relatedId: claims[idx].id,
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
    category: "expense_claim",
    createdByUserId: input.approverUserId,
    targetMemberIds: [String(claims[idx].claimantMemberId || claims[idx].relatedMemberId || "").trim()].filter(Boolean),
    relatedType: "expense_claim",
    relatedId: claims[idx].id,
  });
}

export async function disburseExpenseClaim(input: {
  claimId: string;
  disburserUserId: string;
  method: DisbursementMethod;
  disbursementDate: string;
  disbursementTime?: string;
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
    disbursementTime: input.disbursementTime || toHm(new Date()),
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
    category: "expense_claim",
    createdByUserId: input.disburserUserId,
    targetMemberIds: [String(claim.claimantMemberId || claim.relatedMemberId || "").trim()].filter(Boolean),
    relatedType: "expense_claim",
    relatedId: claim.id,
  });
}

export async function getMemberPaymentRequests(): Promise<MemberPaymentRequest[]> {
  const rows = await safeGet<MemberPaymentRequest[]>(KEYS.MEMBER_PAYMENT_REQUESTS, []);
  return Array.isArray(rows) ? rows : [];
}

export async function createMemberPaymentRequest(input: {
  kind: MemberPaymentRequestKind;
  amount: number;
  forMemberId?: string;
  forMemberName?: string;
  payerMemberId?: string;
  payerName: string;
  walletProvider: MobileWalletProvider;
  walletAccountName?: string;
  walletAccountNumber?: string;
  walletReference?: string;
  proofImage?: string;
  note?: string;
  requestedDate?: string;
  requestedTime?: string;
  feePeriodStart?: string;
  feePeriodEnd?: string;
  createdByUserId: string;
  createdByMemberId?: string;
}): Promise<MemberPaymentRequest> {
  const requests = await getMemberPaymentRequests();
  const pendingRequests = requests.filter((row) => String(row?.status || "") === "pending_treasurer_review");
  const requestedKind = String(input.kind || "").trim();
  const requestedForMemberId = String(input.forMemberId || "").trim();
  const requestedRef = String(input.walletReference || "").trim().toLowerCase();
  const requestedFeeStart = String(input.feePeriodStart || "").trim();
  const requestedFeeEnd = String(input.feePeriodEnd || "").trim();

  const hasPendingConflict = pendingRequests.some((row: any) => {
    const sameKind = String(row?.kind || "") === requestedKind;
    const sameForMember = String(row?.forMemberId || "") === requestedForMemberId;
    if (requestedRef && String(row?.walletReference || "").trim().toLowerCase() === requestedRef) {
      return true;
    }
    if (!sameKind || !sameForMember) return false;
    if (requestedKind !== "member_fees") return true;
    const rowStartRaw = String(row?.feePeriodStart || "").trim();
    const rowEndRaw = String(row?.feePeriodEnd || "").trim();
    if (!rowStartRaw || !rowEndRaw || !requestedFeeStart || !requestedFeeEnd) return true;
    const rowStart = new Date(rowStartRaw);
    const rowEnd = new Date(rowEndRaw);
    const reqStart = new Date(requestedFeeStart);
    const reqEnd = new Date(requestedFeeEnd);
    if ([rowStart, rowEnd, reqStart, reqEnd].some((d) => Number.isNaN(d.getTime()))) return true;
    rowStart.setHours(0, 0, 0, 0);
    rowEnd.setHours(23, 59, 59, 999);
    reqStart.setHours(0, 0, 0, 0);
    reqEnd.setHours(23, 59, 59, 999);
    return reqStart <= rowEnd && reqEnd >= rowStart;
  });
  if (hasPendingConflict) throw new Error("request_conflict_in_progress");

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const mapping = mapPaymentRequestKindToIncomeCategory(input.kind);
  const request: MemberPaymentRequest = {
    id: generateId(),
    requestNumber: makePaymentRequestNumber(requests),
    kind: input.kind,
    category: mapping.category,
    categoryLabel: mapping.categoryLabel,
    amount: Number(input.amount || 0),
    forMemberId: input.forMemberId?.trim() || undefined,
    forMemberName: input.forMemberName?.trim() || undefined,
    payerMemberId: input.payerMemberId,
    payerName: String(input.payerName || "").trim(),
    walletProvider: input.walletProvider,
    walletAccountName: input.walletAccountName?.trim() || undefined,
    walletAccountNumber: input.walletAccountNumber?.trim() || undefined,
    walletReference: input.walletReference?.trim() || undefined,
    proofImage: input.proofImage || undefined,
    note: input.note?.trim() || undefined,
    status: "pending_treasurer_review",
    requestedDate: input.requestedDate || toYmd(nowDate),
    requestedTime: input.requestedTime || toHm(nowDate),
    feePeriodStart: input.feePeriodStart || undefined,
    feePeriodEnd: input.feePeriodEnd || undefined,
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
    category: "payment_request",
    createdByUserId: request.createdByUserId,
    createdByMemberId: request.createdByMemberId,
    targetMemberIds: [String(request.forMemberId || request.payerMemberId || "").trim()].filter(Boolean),
    relatedType: "member_payment_request",
    relatedId: request.id,
  });
  return request;
}

export async function approveMemberPaymentRequest(input: {
  requestId: string;
  reviewerUserId: string;
  reviewNote?: string;
  acceptedDate?: string;
  acceptedTime?: string;
}): Promise<void> {
  const requests = await getMemberPaymentRequests();
  const idx = requests.findIndex((item) => item.id === input.requestId);
  if (idx === -1) throw new Error("request_not_found");
  const request = requests[idx];
  if (request.status !== "pending_treasurer_review") throw new Error("request_not_pending");

  const acceptedDate = input.acceptedDate || toYmd(new Date());
  const txn = await addTransaction({
    memberId: request.forMemberId || request.payerMemberId || undefined,
    payerPayee: request.forMemberName || request.payerName,
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
    feePeriodStart: request.feePeriodStart,
    feePeriodEnd: request.feePeriodEnd,
  });

  requests[idx] = {
    ...request,
    status: "approved",
    reviewedByUserId: input.reviewerUserId,
    reviewNote: input.reviewNote?.trim() || undefined,
    reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    linkedTransactionId: txn.id,
    acceptedDate,
    acceptedTime: input.acceptedTime || toHm(new Date()),
  };
  await AsyncStorage.setItem(KEYS.MEMBER_PAYMENT_REQUESTS, JSON.stringify(requests));
  await pushSystemEvent({
    title: `Payment Request Approved (${request.requestNumber})`,
    description: `${request.amount.toLocaleString()} KS ကို ရငွေစာရင်းသို့ ထည့်သွင်းပြီးပါပြီ`,
    category: "payment_request",
    createdByUserId: input.reviewerUserId,
    targetMemberIds: [String(request.forMemberId || request.payerMemberId || "").trim()].filter(Boolean),
    relatedType: "member_payment_request",
    relatedId: request.id,
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
    category: "payment_request",
    createdByUserId: input.reviewerUserId,
    targetMemberIds: [String(request.forMemberId || request.payerMemberId || "").trim()].filter(Boolean),
    relatedType: "member_payment_request",
    relatedId: request.id,
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

// --- Chat ---
export const getChatThreads = () => safeGet<ChatThread[]>(KEYS.CHAT_THREADS, []);
export const getChatMessages = () => safeGet<ChatMessage[]>(KEYS.CHAT_MESSAGES, []);

export async function saveChatThreads(data: ChatThread[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.CHAT_THREADS, JSON.stringify(data));
}

export async function saveChatMessages(data: ChatMessage[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.CHAT_MESSAGES, JSON.stringify(data));
}

function getChatMessagePreviewText(message: ChatMessage | undefined): string {
  if (!message) return "";
  if (message.isDeleted) return "[Deleted]";
  const text = String(message.text || "").trim();
  if (text) return text;
  if (String(message.image || "").trim()) return "[Image]";
  return "";
}

async function refreshChatThreadLastMessage(threadId: string): Promise<void> {
  const [threads, messages] = await Promise.all([getChatThreads(), getChatMessages()]);
  const idx = threads.findIndex((row) => String(row.id) === String(threadId));
  if (idx === -1) return;
  const sorted = (messages || [])
    .filter((row) => String(row.threadId || "") === String(threadId))
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  const last = sorted.length > 0 ? sorted[sorted.length - 1] : undefined;
  threads[idx] = {
    ...threads[idx],
    lastMessageAt: last?.createdAt || undefined,
    lastMessageText: getChatMessagePreviewText(last),
    updatedAt: new Date().toISOString(),
  };
  await saveChatThreads(threads);
}

function normalizeUserIdList(ids: string[]): string[] {
  return Array.from(
    new Set(
      (ids || [])
        .map((v) => String(v || "").trim())
        .filter(Boolean)
    )
  ).sort();
}

export async function createDirectChatThread(input: {
  userAId: string;
  userBId: string;
  createdByUserId: string;
}): Promise<ChatThread> {
  const [a, b] = normalizeUserIdList([input.userAId, input.userBId]);
  if (!a || !b) throw new Error("invalid_participants");
  const threads = await getChatThreads();
  const existing = threads.find((row) => {
    if (row.type !== "direct") return false;
    const ids = normalizeUserIdList(row.participantUserIds || []);
    return ids.length === 2 && ids[0] === a && ids[1] === b;
  });
  if (existing) return existing;

  const now = new Date().toISOString();
  const thread: ChatThread = {
    id: generateId(),
    type: "direct",
    participantUserIds: [a, b],
    createdByUserId: input.createdByUserId,
    createdAt: now,
    updatedAt: now,
    lastReadAtBy: {},
  };
  await saveChatThreads([thread, ...threads]);
  return thread;
}

export async function createGroupChatThread(input: {
  name: string;
  participantUserIds: string[];
  createdByUserId: string;
}): Promise<ChatThread> {
  const participants = normalizeUserIdList(input.participantUserIds);
  if (!input.name.trim() || participants.length < 2) {
    throw new Error("invalid_group");
  }
  const now = new Date().toISOString();
  const thread: ChatThread = {
    id: generateId(),
    type: "group",
    name: input.name.trim(),
    participantUserIds: participants,
    createdByUserId: input.createdByUserId,
    createdAt: now,
    updatedAt: now,
    lastReadAtBy: {},
  };
  const threads = await getChatThreads();
  await saveChatThreads([thread, ...threads]);
  return thread;
}

export async function sendChatMessage(input: {
  threadId: string;
  senderUserId: string;
  senderMemberId?: string;
  senderDisplayName?: string;
  text?: string;
  image?: string;
  replyToMessageId?: string;
  replyToUserId?: string;
  replyToDisplayName?: string;
  mentionUserIds?: string[];
}): Promise<ChatMessage> {
  const text = String(input.text || "").trim();
  const image = String(input.image || "").trim();
  if (!text && !image) throw new Error("empty_message");

  const [threads, messages] = await Promise.all([getChatThreads(), getChatMessages()]);
  const idx = threads.findIndex((row) => row.id === input.threadId);
  if (idx === -1) throw new Error("thread_not_found");
  if (!threads[idx].participantUserIds.includes(input.senderUserId)) throw new Error("sender_not_in_thread");

  const now = new Date().toISOString();
  const message: ChatMessage = {
    id: generateId(),
    threadId: input.threadId,
    senderUserId: input.senderUserId,
    senderMemberId: input.senderMemberId,
    senderDisplayName: input.senderDisplayName,
    text: text || undefined,
    image: image || undefined,
    createdAt: now,
    replyToMessageId: input.replyToMessageId,
    replyToUserId: input.replyToUserId,
    replyToDisplayName: input.replyToDisplayName,
    mentionUserIds: (input.mentionUserIds || []).map((v) => String(v || "").trim()).filter(Boolean),
  };
  await saveChatMessages([...messages, message]);

  threads[idx] = {
    ...threads[idx],
    lastMessageAt: now,
    lastMessageText: getChatMessagePreviewText(message),
    updatedAt: now,
  };
  await saveChatThreads(threads);
  return message;
}

export async function updateChatMessage(input: {
  messageId: string;
  editorUserId: string;
  text?: string;
  image?: string;
}): Promise<ChatMessage> {
  const messageId = String(input.messageId || "").trim();
  const editorUserId = String(input.editorUserId || "").trim();
  if (!messageId || !editorUserId) throw new Error("invalid_input");

  const messages = await getChatMessages();
  const idx = messages.findIndex((row) => String(row.id || "") === messageId);
  if (idx === -1) throw new Error("message_not_found");

  const target = messages[idx];
  if (String(target.senderUserId || "") !== editorUserId) throw new Error("not_message_owner");
  if (target.isDeleted) throw new Error("message_deleted");

  const text = String(input.text || "").trim();
  const image = String(input.image || "").trim();
  if (!text && !image) throw new Error("empty_message");

  const now = new Date().toISOString();
  const updated: ChatMessage = {
    ...target,
    text: text || undefined,
    image: image || undefined,
    updatedAt: now,
    editedAt: now,
  };
  messages[idx] = updated;
  await saveChatMessages(messages);
  await refreshChatThreadLastMessage(String(target.threadId || ""));
  return updated;
}

export async function deleteChatMessage(input: {
  messageId: string;
  deleterUserId: string;
}): Promise<ChatMessage> {
  const messageId = String(input.messageId || "").trim();
  const deleterUserId = String(input.deleterUserId || "").trim();
  if (!messageId || !deleterUserId) throw new Error("invalid_input");

  const messages = await getChatMessages();
  const idx = messages.findIndex((row) => String(row.id || "") === messageId);
  if (idx === -1) throw new Error("message_not_found");

  const target = messages[idx];
  if (String(target.senderUserId || "") !== deleterUserId) throw new Error("not_message_owner");
  if (target.isDeleted) return target;

  const now = new Date().toISOString();
  const updated: ChatMessage = {
    ...target,
    text: undefined,
    image: undefined,
    isDeleted: true,
    deletedAt: now,
    deletedByUserId: deleterUserId,
    updatedAt: now,
  };
  messages[idx] = updated;
  await saveChatMessages(messages);
  await refreshChatThreadLastMessage(String(target.threadId || ""));
  return updated;
}

export async function markChatThreadRead(threadId: string, userId: string): Promise<void> {
  if (!threadId || !userId) return;
  const threads = await getChatThreads();
  const idx = threads.findIndex((row) => row.id === threadId);
  if (idx === -1) return;
  const prevReadAt = String(threads[idx].lastReadAtBy?.[userId] || "");
  const lastMessageAt = String(threads[idx].lastMessageAt || "");
  if (prevReadAt && (!lastMessageAt || new Date(prevReadAt).getTime() >= new Date(lastMessageAt).getTime())) {
    return;
  }
  const nextMap = { ...(threads[idx].lastReadAtBy || {}), [userId]: new Date().toISOString() };
  threads[idx] = { ...threads[idx], lastReadAtBy: nextMap, updatedAt: new Date().toISOString() };
  await saveChatThreads(threads);
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
export async function getTransactions(): Promise<Transaction[]> {
  const txns = await safeGet<Transaction[]>(KEYS.TRANSACTIONS, []);
  const index = await buildDeletedTargetIndexFromStorage();
  return filterTransactionsByDeletedIndex(Array.isArray(txns) ? txns : [], index);
}

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
    const safeUpdates = { ...updates };
    if ("id" in safeUpdates) delete safeUpdates.id;
    txns[idx] = { ...txns[idx], ...safeUpdates };
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
export async function getLoans(): Promise<Loan[]> {
  const loans = await safeGet<Loan[]>(KEYS.LOANS, []);
  const index = await buildDeletedTargetIndexFromStorage();
  return filterLoansByDeletedIndex(Array.isArray(loans) ? loans : [], index);
}

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
  const runtimeDefaultSyncServerUrl = getRuntimeDefaultSyncServerUrl();
  const defaults: AccountSettings = {
    orgName: "My Organization",
    orgEmail: "",
    orgPhone: "",
    orgId: "",
    orgSetupAt: "",
    orgSetupCompleted: false,
    openingBalanceCash: 0,
    openingBalanceBank: 0,
    currency: "MMK",
    asOfDate: new Date().toISOString(),
    syncServerUrl: runtimeDefaultSyncServerUrl,
    syncEnabled: true,
    cloudSyncEnabled: true,
    cloudSyncProvider: "google_drive_apps_script",
    cloudSyncEndpoint: DEFAULT_CLOUD_SYNC_ENDPOINT,
    cloudSyncApiKey: "",
    cloudSyncGoogleAccountEmail: "",
    cloudSyncFolderName: DEFAULT_CLOUD_SYNC_FOLDER_NAME,
    receivingBankName: "",
    receivingBankAccountNumber: "",
    receivingBankAccountName: "",
    receivingKbzPayPhone: "",
    receivingKbzPayAccountName: "",
    receivingKbzPayMmqr: "hQZLQlpQYXlhQE8C8FACEFECMTFXFgl3MnOIbSYDEBAfnwgEAQGfJAEwF419ca5a14952",
    receivingWavePayPhone: "",
    receivingWavePayAccountName: "",
    receivingWavePayMmqr: "",
    receivingAyaPayPhone: "",
    receivingAyaPayAccountName: "",
    receivingAyaPayMmqr: "",
    monthlyFeeRateRules: [],
    monthlyFeeReliefRules: [],
    monthlyFeePolicyRequests: [],
  };
  const stored = await safeGet<Partial<AccountSettings> | null>(KEYS.ACCOUNT_SETTINGS, null);
  if (!stored || typeof stored !== "object") return defaults;

  const merged: AccountSettings = {
    ...defaults,
    ...stored,
  };

  if (!String(stored.syncServerUrl || "").trim()) {
    merged.syncServerUrl = defaults.syncServerUrl;
  }
  const normalizedStoredSyncUrl = normalizeSyncServerUrl(String(stored.syncServerUrl || ""));
  const legacyLanDefaults = new Set([
    normalizeSyncServerUrl("http://192.168.99.9:5000"),
    normalizeSyncServerUrl("http://192.168.99.114:5000"),
  ]);
  if (!normalizedStoredSyncUrl || legacyLanDefaults.has(normalizedStoredSyncUrl)) {
    merged.syncServerUrl = runtimeDefaultSyncServerUrl || defaults.syncServerUrl;
  }
  if (stored.syncEnabled === undefined || stored.syncEnabled === null) {
    merged.syncEnabled = defaults.syncEnabled;
  }
  if (stored.cloudSyncEnabled === undefined || stored.cloudSyncEnabled === null) {
    merged.cloudSyncEnabled = defaults.cloudSyncEnabled;
  }
  if (!String(stored.cloudSyncEndpoint || "").trim()) {
    merged.cloudSyncEndpoint = defaults.cloudSyncEndpoint;
  }
  if (!String(stored.cloudSyncFolderName || "").trim()) {
    merged.cloudSyncFolderName = defaults.cloudSyncFolderName;
  }
  if (!Array.isArray(stored.monthlyFeeRateRules)) {
    merged.monthlyFeeRateRules = [];
  }
  if (!Array.isArray(stored.monthlyFeeReliefRules)) {
    merged.monthlyFeeReliefRules = [];
  }
  if (!Array.isArray(stored.monthlyFeePolicyRequests)) {
    merged.monthlyFeePolicyRequests = [];
  }
  return merged;
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

function extractHost(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  try {
    return String(new URL(withProtocol).hostname || "").trim();
  } catch {
    const fallback = value.split("/")[0] || "";
    return String(fallback.split(":")[0] || "").trim();
  }
}

function inferRuntimeLanHost(): string {
  if (Platform.OS === "web") {
    try {
      const host = String((globalThis as any)?.location?.hostname || "").trim();
      if (host && host !== "localhost") return host;
    } catch {}
  }

  const constantCandidates = [
    String((Constants as any)?.expoConfig?.hostUri || ""),
    String((Constants as any)?.expoGoConfig?.debuggerHost || ""),
    String((Constants as any)?.manifest?.debuggerHost || ""),
    String((Constants as any)?.manifest2?.extra?.expoClient?.hostUri || ""),
  ]
    .map((value) => extractHost(value))
    .filter(Boolean);

  for (const host of constantCandidates) {
    if (host === "localhost" || host === "127.0.0.1") continue;
    return host;
  }
  return "";
}

function getRuntimeDefaultSyncServerUrl(): string {
  const fromEnv = normalizeSyncServerUrl(String((process.env as any).EXPO_PUBLIC_SYNC_SERVER_URL || ""));
  if (fromEnv) return fromEnv;

  if (Platform.OS === "web") {
    try {
      const origin = String((globalThis as any)?.location?.origin || "").trim();
      if (/^https?:\/\//i.test(origin)) {
        return normalizeSyncServerUrl(origin);
      }
    } catch {}
  }

  const inferredHost = inferRuntimeLanHost();
  if (inferredHost) {
    return normalizeSyncServerUrl(`http://${inferredHost}:5000`);
  }

  if (Platform.OS === "web") {
    try {
      const host = String((globalThis as any)?.location?.hostname || "").trim();
      if (host) return normalizeSyncServerUrl(`http://${host}:5000`);
    } catch {}
  }

  return normalizeSyncServerUrl(DEFAULT_SYNC_SERVER_URL);
}

function normalizeCloudSyncEndpoint(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

function sanitizeCloudApiKey(raw: string): string {
  return String(raw || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function buildCloudApiKeyCandidates(apiKey: string): string[] {
  const clean = sanitizeCloudApiKey(apiKey);
  const list: string[] = [clean];
  // Backward compatibility for older Apps Script deployments that still use template key.
  if (!clean) {
    list.push("CHANGE_ME");
  } else {
    list.push("");
  }
  return Array.from(new Set(list));
}

function resolveOrgScopedCloudFolderName(baseFolderName: string, orgId?: string | null): string {
  const base = String(baseFolderName || "").trim() || DEFAULT_CLOUD_SYNC_FOLDER_NAME;
  const normalizedOrgId = String(orgId || "").trim().toUpperCase();
  if (!normalizedOrgId) return base;
  // Keep legacy ORG000 on the old shared folder so existing production data remains reachable.
  if (normalizedOrgId === "ORG000") return base;
  const baseLower = base.toLowerCase();
  if (baseLower.includes(normalizedOrgId.toLowerCase())) return base;
  return `${base}-${normalizedOrgId}`;
}

async function resolveCloudSyncConfig(): Promise<{
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  provider: string;
  accountEmail: string;
  folderName: string;
}> {
  const settings = await getAccountSettings();
  const orgId =
    String(settings?.orgId || "").trim().toUpperCase() ||
    String(getActiveOrgId() || "").trim().toUpperCase() ||
    (await resolveExpectedOrgId());
  const managedLockdownEnabled = getManagedSyncLockdownEnabled();
  const manualEndpoint = normalizeCloudSyncEndpoint(settings.cloudSyncEndpoint || "");
  const resolvedManagedEndpoint = resolveConfigValueWithPriorityForOrg({
    key: REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENDPOINT,
    orgId,
  });
  const managedEndpoint = normalizeCloudSyncEndpoint(resolvedManagedEndpoint.value || "");
  const resolvedStandardEndpoint = resolveConfigValueWithPriorityForOrg({
    key: REMOTE_CONFIG_KEYS.CLOUD_SYNC_ENDPOINT,
    orgId,
  });
  const standardEndpoint = normalizeCloudSyncEndpoint(resolvedStandardEndpoint.value || "");
  const managedEnabled = getManagedCloudSyncEnabled();
  const manualApiKey = sanitizeCloudApiKey(settings.cloudSyncApiKey || "");
  const resolvedManagedApiKey = resolveConfigValueWithPriorityForOrg({
    key: REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_API_KEY,
    orgId,
  });
  const managedApiKey = sanitizeCloudApiKey(resolvedManagedApiKey.value || "");
  const resolvedStandardApiKey = resolveConfigValueWithPriorityForOrg({
    key: REMOTE_CONFIG_KEYS.CLOUD_SYNC_API_KEY,
    orgId,
  });
  const standardApiKey = sanitizeCloudApiKey(resolvedStandardApiKey.value || "");
  const provider = String(settings.cloudSyncProvider || "google_drive_apps_script").trim();
  const manualAccountEmail = String(settings.cloudSyncGoogleAccountEmail || "").trim();
  const resolvedManagedAccountEmail = resolveConfigValueWithPriorityForOrg({
    key: REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ACCOUNT_EMAIL,
    orgId,
  });
  const managedAccountEmail = String(resolvedManagedAccountEmail.value || "").trim();
  const resolvedStandardAccountEmail = resolveConfigValueWithPriorityForOrg({
    key: REMOTE_CONFIG_KEYS.CLOUD_SYNC_ACCOUNT_EMAIL,
    orgId,
  });
  const standardAccountEmail = String(resolvedStandardAccountEmail.value || "").trim();
  const manualFolderName = String(settings.cloudSyncFolderName || "").trim();
  const resolvedManagedFolderName = resolveConfigValueWithPriorityForOrg({
    key: REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_FOLDER_NAME,
    orgId,
  });
  const managedFolderName = String(resolvedManagedFolderName.value || "").trim();
  const resolvedStandardFolderName = resolveConfigValueWithPriorityForOrg({
    key: REMOTE_CONFIG_KEYS.CLOUD_SYNC_FOLDER_NAME,
    orgId,
  });
  const standardFolderName = String(resolvedStandardFolderName.value || "").trim();
  const hasManagedCloudMapping = Boolean(
    managedEndpoint || managedApiKey || managedAccountEmail || managedFolderName
  );
  // In managed lockdown mode, enforce org-scoped managed mapping to prevent
  // local manual settings from accidentally pointing to another org's cloud target.
  const enforceManagedCloudMapping = managedLockdownEnabled && hasManagedCloudMapping;
  const endpoint = enforceManagedCloudMapping
    ? managedEndpoint || standardEndpoint || manualEndpoint
    : manualEndpoint || managedEndpoint || standardEndpoint;
  const apiKey = enforceManagedCloudMapping
    ? managedApiKey || standardApiKey || manualApiKey
    : manualApiKey || managedApiKey || standardApiKey;
  const accountEmail = enforceManagedCloudMapping
    ? managedAccountEmail || standardAccountEmail || manualAccountEmail
    : manualAccountEmail || managedAccountEmail || standardAccountEmail;
  const folderName = enforceManagedCloudMapping
    ? managedFolderName || standardFolderName || manualFolderName || DEFAULT_CLOUD_SYNC_FOLDER_NAME
    : manualFolderName || managedFolderName || standardFolderName || DEFAULT_CLOUD_SYNC_FOLDER_NAME;
  const scopedFolderName = resolveOrgScopedCloudFolderName(folderName, orgId);
  const managedCloudOverrideActive = enforceManagedCloudMapping && !!managedEndpoint;
  const enabledFlag =
    managedEnabled !== null
      ? managedEnabled
      : managedCloudOverrideActive
        ? true
        : settings.cloudSyncEnabled === true || !!manualEndpoint || !!managedEndpoint || !!standardEndpoint;
  const enabled = enabledFlag && !!endpoint;
  return { enabled, endpoint, apiKey, provider, accountEmail, folderName: scopedFolderName };
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
  const tempUri = `${baseDir}sync_img_${Date.now()}_${randomToken(12)}.${srcExt}`;

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
  const orgId = settings?.orgId || getActiveOrgId();
  const remoteUrl = normalizeSyncServerUrl(getManagedLanSyncUrlForOrg(orgId) || "");
  const url = normalizeSyncServerUrl(
    settings.syncServerUrl || remoteUrl || getRuntimeDefaultSyncServerUrl() || DEFAULT_SYNC_SERVER_URL
  );
  const hasLocalUrl = !!normalizeSyncServerUrl(String(settings.syncServerUrl || ""));
  const hasManagedUrl = !!remoteUrl;
  const isLegacyOrg = String(orgId || "").trim().toUpperCase() === "ORG000";
  const isWebSameOriginSyncUrl =
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    (() => {
      try {
        const parsed = new URL(url);
        return String(parsed.origin || "").toLowerCase() === String(window.location.origin || "").toLowerCase();
      } catch {
        return false;
      }
    })();
  // Allow same-origin Render URL and explicit local URL for managed orgs.
  // Cross-org mixing is still guarded by org-scoped snapshot validation.
  const allowDefaultLan = isLegacyOrg || hasManagedUrl || hasLocalUrl || isWebSameOriginSyncUrl;
  const enabledFlag = allowDefaultLan ? settings.syncEnabled !== false : false;
  const enabled = enabledFlag && !!url;
  return { url, enabled };
}

export async function getEffectiveSyncRuntimeConfig(): Promise<{
  lan: { enabled: boolean; url: string; source: "managed_remote_config" | "local_settings" | "default" };
  cloud: {
    enabled: boolean;
    endpoint: string;
    hasApiKey: boolean;
    source: "managed_remote_config" | "local_settings" | "default";
  };
  }> {
    const settings = await getAccountSettings();
    const managedLockdownEnabled = getManagedSyncLockdownEnabled();
    const orgId = settings?.orgId || getActiveOrgId();
    const managedLanUrl = normalizeSyncServerUrl(getManagedLanSyncUrlForOrg(orgId) || "");
    const managedLanOverrideActive = false;
    const lanBase = normalizeSyncServerUrl(settings.syncServerUrl || managedLanUrl || getRuntimeDefaultSyncServerUrl() || DEFAULT_SYNC_SERVER_URL);
    const lan = await resolveSyncServerUrl();
    const hasLocalLanSetting = !!String(settings.syncServerUrl || "").trim();
    const lanSource: "managed_remote_config" | "local_settings" | "default" = managedLanOverrideActive
      ? "managed_remote_config"
      : hasLocalLanSetting
      ? "local_settings"
      : managedLanUrl
      ? "managed_remote_config"
      : "default";

    const managedCloudEndpoint = normalizeCloudSyncEndpoint(
      resolveConfigValueWithPriorityForOrg({
        key: REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ENDPOINT,
        orgId,
      }).value || ""
    );
    const managedCloudApiKey = sanitizeCloudApiKey(
      resolveConfigValueWithPriorityForOrg({
        key: REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_API_KEY,
        orgId,
      }).value || ""
    );
    const managedCloudAccountEmail = String(
      resolveConfigValueWithPriorityForOrg({
        key: REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_ACCOUNT_EMAIL,
        orgId,
      }).value || ""
    ).trim();
    const managedCloudFolderName = String(
      resolveConfigValueWithPriorityForOrg({
        key: REMOTE_CONFIG_KEYS.MANAGED_CLOUD_SYNC_FOLDER_NAME,
        orgId,
      }).value || ""
    ).trim();
    const managedCloudOverrideActive =
      managedLockdownEnabled &&
      !!(managedCloudEndpoint || managedCloudApiKey || managedCloudAccountEmail || managedCloudFolderName);
    const localCloudEndpoint = normalizeCloudSyncEndpoint(settings.cloudSyncEndpoint || "");
    const cloud = await resolveCloudSyncConfig();
    const hasLocalCloudSetting = !!localCloudEndpoint;
    const cloudSource: "managed_remote_config" | "local_settings" | "default" = managedCloudOverrideActive
      ? "managed_remote_config"
      : hasLocalCloudSetting
      ? "local_settings"
      : "default";

  return {
    lan: {
      enabled: lan.enabled,
      url: lan.url || lanBase,
      source: lanSource,
    },
    cloud: {
      enabled: cloud.enabled,
      endpoint: cloud.endpoint,
      hasApiKey: !!sanitizeCloudApiKey(cloud.apiKey),
      source: cloudSource,
    },
  };
}

function parsePositiveIntFromEnv(raw: unknown, fallback: number): number {
  const value = Number(String(raw ?? "").trim());
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

const SYNC_REQUEST_TIMEOUT_MS = parsePositiveIntFromEnv(
  (process.env as any).EXPO_PUBLIC_SYNC_REQUEST_TIMEOUT_MS,
  20000
);
const RENDER_COLD_START_TIMEOUT_MS = parsePositiveIntFromEnv(
  (process.env as any).EXPO_PUBLIC_RENDER_COLD_START_TIMEOUT_MS,
  45000
);
const RENDER_COLD_START_ATTEMPTS = parsePositiveIntFromEnv(
  (process.env as any).EXPO_PUBLIC_RENDER_COLD_START_ATTEMPTS,
  8
);
const RENDER_COLD_START_BASE_DELAY_MS = parsePositiveIntFromEnv(
  (process.env as any).EXPO_PUBLIC_RENDER_COLD_START_BASE_DELAY_MS,
  1200
);
const RENDER_COLD_START_WARMUP_TTL_MS = parsePositiveIntFromEnv(
  (process.env as any).EXPO_PUBLIC_RENDER_COLD_START_WARMUP_TTL_MS,
  10 * 60 * 1000
);

const renderWarmupTracker = new Map<string, number>();

function toRequestTargetString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  try {
    if (typeof Request !== "undefined" && input instanceof Request) {
      return String(input.url || "");
    }
  } catch {}
  return String((input as any)?.url || "");
}

function parseRequestTargetUrl(input: RequestInfo | URL): URL | null {
  const raw = String(toRequestTargetString(input) || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isRenderHost(hostname: string): boolean {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return false;
  return host.endsWith(".onrender.com") || host.endsWith(".render.com");
}

function isRenderRequestTarget(input: RequestInfo | URL): boolean {
  const parsed = parseRequestTargetUrl(input);
  if (!parsed) return false;
  return isRenderHost(parsed.hostname);
}

async function maybeWarmupRenderService(input: RequestInfo | URL): Promise<void> {
  const parsed = parseRequestTargetUrl(input);
  if (!parsed || !isRenderHost(parsed.hostname)) return;
  if (parsed.pathname.startsWith("/api/sync/health")) return;

  const origin = parsed.origin;
  const now = Date.now();
  const lastWarmupAt = Number(renderWarmupTracker.get(origin) || 0);
  if (now - lastWarmupAt < RENDER_COLD_START_WARMUP_TTL_MS) return;

  renderWarmupTracker.set(origin, now);
  const warmupUrl = `${origin}/api/sync/health?warmup=1`;
  try {
    await fetchWithTimeout(warmupUrl, { method: "GET" }, RENDER_COLD_START_TIMEOUT_MS);
  } catch {
    // warmup is best-effort only
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = SYNC_REQUEST_TIMEOUT_MS
): Promise<Response> {
  const ms = Math.max(1000, Math.floor(timeoutMs || SYNC_REQUEST_TIMEOUT_MS));
  return await Promise.race([
    fetch(input, init),
    new Promise<Response>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error("timeout"));
      }, ms);
    }),
  ]);
}

function isRetryableHttpStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = SYNC_REQUEST_TIMEOUT_MS,
  attempts = getSyncRetryMaxAttempts(),
  baseDelayMs = getSyncRetryBaseDelayMs()
): Promise<Response> {
  const isRenderTarget = isRenderRequestTarget(input);
  const effectiveTimeoutMs = isRenderTarget
    ? Math.max(Math.floor(timeoutMs || 0), RENDER_COLD_START_TIMEOUT_MS)
    : Math.max(1000, Math.floor(timeoutMs || 0) || SYNC_REQUEST_TIMEOUT_MS);
  const effectiveAttempts = isRenderTarget
    ? Math.max(Math.floor(attempts || 0), RENDER_COLD_START_ATTEMPTS)
    : Math.max(1, Math.floor(attempts || 0) || getSyncRetryMaxAttempts());
  const effectiveBaseDelayMs = isRenderTarget
    ? Math.max(Math.floor(baseDelayMs || 0), RENDER_COLD_START_BASE_DELAY_MS)
    : Math.max(100, Math.floor(baseDelayMs || 0) || getSyncRetryBaseDelayMs());

  if (isRenderTarget) {
    await maybeWarmupRenderService(input);
  }

  return await runWithRetry(async () => {
    const res = await fetchWithTimeout(input, init, effectiveTimeoutMs);
    if (isRetryableHttpStatus(res.status)) {
      throw new Error(`http_${res.status}`);
    }
    return res;
  }, {
    attempts: effectiveAttempts,
    baseDelayMs: effectiveBaseDelayMs,
    maxDelayMs: Math.max(effectiveBaseDelayMs * 8, 20_000),
  });
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
  const expectedOrgId = await resolveExpectedOrgId();
  for (const [key, raw] of Object.entries(data)) {
    try {
      const parsed = JSON.parse(raw);
      if (key === KEYS.ACCOUNT_SETTINGS && parsed && typeof parsed === "object") {
        const currentOrgId = String((parsed as any).orgId || "").trim().toUpperCase();
        // Only auto-fill missing orgId.
        // If orgId already exists and differs, keep it untouched so callers can detect mismatch
        // and block cross-org pushes instead of silently rewriting the snapshot owner.
        if (expectedOrgId && !currentOrgId) {
          (parsed as any).orgId = expectedOrgId;
        }
      }
      const cleaned = await compressLargeDataUrlDeep(parsed);
      result[key] = JSON.stringify(cleaned);
    } catch {
      result[key] = raw;
    }
  }
  if (expectedOrgId) {
    result[SYNC_SCOPE_META_KEY] = JSON.stringify({
      orgId: expectedOrgId,
      version: 1,
      generatedAt: new Date().toISOString(),
    });
  }
  return result;
}

async function ensureSyncLicense(): Promise<{ ok: boolean; reason?: string }> {
  try {
    const settings = await getAccountSettings();
    const orgId = String(settings?.orgId || getActiveOrgId() || "").trim();
    if (!orgId) return { ok: false, reason: "missing_org_id" };
    const license = await ensureOrgLicenseActive({ orgId, forceOnlineCheck: true });
    if (!license.allowed) {
      return { ok: false, reason: license.reason || "license_denied" };
    }
    return { ok: true };
  } catch (error: any) {
    return { ok: false, reason: String(error?.message || "license_check_failed") };
  }
}

export async function checkLanSyncHealth(): Promise<{ ok: boolean; url?: string; reason?: string; status?: number }> {
  try {
    const license = await ensureSyncLicense();
    if (!license.ok) return { ok: false, reason: license.reason || "license_denied" };
    const { url, enabled } = await resolveSyncServerUrl();
    if (!enabled) return { ok: false, url, reason: "disabled_or_empty_url" };
    const res = await fetchWithRetry(`${url}/api/sync/health`, { method: "GET" }, 12000);
    if (!res.ok) return { ok: false, url, status: res.status, reason: "health_http_error" };
    return { ok: true, url, status: res.status };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || "health_fetch_failed") };
  }
}

export type CloudSyncResult = {
  ok: boolean;
  changed?: boolean;
  reason?: string;
  status?: number;
  endpoint?: string;
};

type CloudSnapshotPayload = {
  updatedAt?: string;
  source?: string;
  data?: Record<string, string>;
  snapshotHash?: string;
};

type CloudApiPayload = {
  ok?: boolean;
  reason?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

function safeParseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return null;
}

function normalizeCloudSnapshotData(input: unknown): Record<string, string> | null {
  const parsed = safeParseJsonObject(input);
  if (!parsed) return null;
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") {
      normalized[key] = value;
    } else if (value !== undefined) {
      normalized[key] = JSON.stringify(value);
    }
  }
  return normalized;
}

function looksLikeExportDataMap(candidate: Record<string, unknown>): boolean {
  const keys = Object.keys(candidate);
  if (keys.length === 0) return false;
  if (!keys.some((k) => k.startsWith("@"))) return false;
  const meta = new Set([
    "ok",
    "reason",
    "action",
    "service",
    "hint",
    "status",
    "message",
    "error",
    "updatedAt",
    "source",
    "snapshot",
    "result",
    "payload",
    "data",
  ]);
  return keys.every((k) => !meta.has(k));
}

function extractCloudSnapshot(payload: unknown): CloudSnapshotPayload | null {
  const root = safeParseJsonObject(payload);
  if (!root) return null;

  const candidateContainers: Record<string, unknown>[] = [
    root,
    safeParseJsonObject(root.snapshot),
    safeParseJsonObject(root.result),
    safeParseJsonObject(root.payload),
    safeParseJsonObject(root.data),
    safeParseJsonObject((safeParseJsonObject(root.result) || {}).snapshot),
    safeParseJsonObject((safeParseJsonObject(root.payload) || {}).snapshot),
  ].filter(Boolean) as Record<string, unknown>[];

  for (const candidate of candidateContainers) {
    const nestedSnapshot = safeParseJsonObject(candidate.snapshot);
    const snapshotLike = nestedSnapshot || candidate;
    const snapshotData = snapshotLike.data;
    const data =
      snapshotData !== undefined
        ? normalizeCloudSnapshotData(snapshotData)
        : looksLikeExportDataMap(snapshotLike)
          ? normalizeCloudSnapshotData(snapshotLike)
          : null;
    if (!data) continue;

    return {
      updatedAt: String(snapshotLike.updatedAt || candidate.updatedAt || root.updatedAt || ""),
      source: String(snapshotLike.source || candidate.source || root.source || "cloud"),
      data,
      snapshotHash: String(snapshotLike.snapshotHash || candidate.snapshotHash || root.snapshotHash || ""),
    };
  }

  return null;
}

async function readCloudApiPayload(res: Response): Promise<CloudApiPayload | null> {
  try {
    return (await res.json()) as CloudApiPayload;
  } catch {
    return null;
  }
}

type CloudPostResult = {
  httpOk: boolean;
  status: number;
  body: CloudApiPayload | null;
  usedApiKey: string;
};

async function postCloudSyncWithApiKeyFallback(
  endpoint: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
  apiKey: string
): Promise<CloudPostResult> {
  const keyCandidates = buildCloudApiKeyCandidates(apiKey);
  let last: CloudPostResult | null = null;

  for (const candidate of keyCandidates) {
    const res = await postCloudSyncRequest(
      endpoint,
      {
        ...payload,
        apiKey: candidate,
      },
      timeoutMs
    );
    const body = await readCloudApiPayload(res);
    const result: CloudPostResult = {
      httpOk: res.ok,
      status: res.status,
      body,
      usedApiKey: candidate,
    };
    last = result;

    const isUnauthorized = body?.ok === false && String(body.reason || "").trim() === "unauthorized";
    if (!isUnauthorized) return result;
  }

  return (
    last || {
      httpOk: false,
      status: 0,
      body: { ok: false, reason: "request_failed" },
      usedApiKey: "",
    }
  );
}

export async function checkCloudSyncHealth(): Promise<CloudSyncResult> {
  try {
    const license = await ensureSyncLicense();
    if (!license.ok) return { ok: false, reason: license.reason || "license_denied" };
    const { enabled, endpoint, apiKey, provider, accountEmail, folderName } = await resolveCloudSyncConfig();
    if (!enabled) return { ok: false, reason: "cloud_disabled_or_empty_endpoint", endpoint };
    const result = await postCloudSyncWithApiKeyFallback(endpoint, {
      action: "health",
      provider,
      accountEmail,
      folderName,
    }, 15000, apiKey);
    if (!result.httpOk) return { ok: false, reason: "cloud_health_http_error", status: result.status, endpoint };
    const payload = result.body;
    if (payload?.ok === false) {
      const reason = String(payload.reason || "unknown");
      return { ok: false, reason: `cloud_health_${reason}`, status: result.status, endpoint };
    }
    return { ok: true, status: result.status, endpoint };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || "cloud_health_failed") };
  }
}

async function postCloudSyncRequest(endpoint: string, payload: Record<string, unknown>, timeoutMs: number): Promise<Response> {
  // On web/desktop, prefer proxying cloud calls via the app server to avoid CORS issues.
  if (Platform.OS === "web") {
    const candidates: string[] = [];
    try {
      const origin = String((globalThis as any)?.location?.origin || "").trim().replace(/\/+$/, "");
      if (/^https?:\/\//i.test(origin)) candidates.push(origin);
    } catch {}
    try {
      const settings = await getAccountSettings();
      const configuredUrl = normalizeSyncServerUrl(
        String(settings.syncServerUrl || getRuntimeDefaultSyncServerUrl() || DEFAULT_SYNC_SERVER_URL)
      );
      if (configuredUrl) candidates.push(configuredUrl);
    } catch {}

    const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));
    for (const baseUrl of uniqueCandidates) {
      try {
        const res = await fetchWithRetry(
          `${baseUrl}/api/cloud-sync/proxy`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint, ...payload }),
          },
          timeoutMs
        );
        // If proxy route does not exist on this host, continue to next candidate.
        if (res.status === 404 || res.status === 405) continue;
        return res;
      } catch {
        // try next candidate
      }
    }
  }

  return await fetchWithRetry(
    endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    timeoutMs
  );
}

export type LanSyncResult = {
  ok: boolean;
  changed?: boolean;
  reason?: string;
  status?: number;
  url?: string;
};

function extractScopeOrgIdFromSnapshotData(data?: Record<string, string> | null): string {
  if (!data || typeof data !== "object") return "";
  try {
    const raw = (data as Record<string, string>)[SYNC_SCOPE_META_KEY];
    if (!raw) return "";
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return String(parsed?.orgId || "").trim().toUpperCase();
  } catch {
    return "";
  }
}

function extractOrgIdFromSnapshotData(data?: Record<string, string> | null): string {
  const scopedOrgId = extractScopeOrgIdFromSnapshotData(data);
  if (scopedOrgId) return scopedOrgId;
  if (!data || typeof data !== "object") return "";
  try {
    const raw = (data as Record<string, string>)[KEYS.ACCOUNT_SETTINGS];
    if (!raw) return "";
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const orgId = String(parsed?.orgId || "").trim().toUpperCase();
    return orgId;
  } catch {
    return "";
  }
}

async function resolveExpectedOrgId(): Promise<string> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location?.search || "");
      const fromQuery = String(params.get("orgId") || "").trim().toUpperCase();
      if (fromQuery) return fromQuery;
    } catch {}
    try {
      const fromSession = String(window.sessionStorage?.getItem("@orghub_active_org_id") || "")
        .trim()
        .toUpperCase();
      if (fromSession) return fromSession;
    } catch {}
  }
  const active = String(getActiveOrgId() || "").trim().toUpperCase();
  if (active) return active;
  try {
    const settings = await getAccountSettings();
    const fromSettings = String(settings?.orgId || "").trim().toUpperCase();
    if (fromSettings) return fromSettings;
  } catch {}
  try {
    const raw = await AsyncStorage.getItem("@orghub_active_org_id");
    const normalized = String(raw || "").trim().toUpperCase();
    if (normalized) return normalized;
  } catch {}
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      const fromLocal = String(window.localStorage?.getItem("@orghub_last_connected_org_id") || "")
        .trim()
        .toUpperCase();
      if (fromLocal) return fromLocal;
    } catch {}
  }
  return "";
}

async function buildLanSnapshotUrl(baseUrl: string): Promise<string> {
  const orgId = String(await resolveExpectedOrgId()).trim();
  if (!orgId) return `${baseUrl}/api/sync/snapshot`;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}/api/sync/snapshot${separator}orgId=${encodeURIComponent(orgId)}`;
}

async function applySnapshotDataFromSync(snapshotData: Record<string, string>): Promise<boolean> {
  if (!snapshotData || typeof snapshotData !== "object") return false;

  const incomingEntries: [string, string][] = [];
  const incomingKeySet = new Set<string>();
  for (const [key, rawValue] of Object.entries(snapshotData)) {
    if (!isSharedBackupKey(key)) continue;
    const normalizedValue =
      typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue ?? null);
    incomingEntries.push([key, normalizedValue]);
    incomingKeySet.add(key);
  }

  let changed = false;
  const allKeys = await getAllSharedBackupKeys();
  const removableKeys = allKeys.filter((key) => {
    if (!isSharedBackupKey(key)) return false;
    if (key === KEYS.ACCOUNT_SETTINGS) return false;
    return !incomingKeySet.has(key);
  });
  if (removableKeys.length > 0) {
    await AsyncStorage.multiRemove(removableKeys);
    changed = true;
  }

  if (incomingEntries.length > 0) {
    const existingPairs = await AsyncStorage.multiGet(incomingEntries.map(([key]) => key));
    const existingMap = new Map<string, string | null>(existingPairs);
    const changedEntries = incomingEntries.filter(([key, value]) => {
      return String(existingMap.get(key) ?? "") !== String(value ?? "");
    });
    if (changedEntries.length > 0) {
      await AsyncStorage.multiSet(changedEntries);
      changed = true;
    }
  }

  const members = await getMembers();
  await setEmptyOrgState(!(Array.isArray(members) && members.length > 0));

  const expectedOrgId = await resolveExpectedOrgId();
  if (expectedOrgId) {
    const settings = await getAccountSettings();
    const currentOrgId = String(settings?.orgId || "").trim().toUpperCase();
    if (currentOrgId !== expectedOrgId) {
      await saveAccountSettings({
        ...settings,
        orgId: expectedOrgId,
        orgSetupCompleted: true,
        orgSetupAt: settings.orgSetupAt || new Date().toISOString(),
      });
      changed = true;
    }
  }

  const pruned = await pruneDeletedTargetsFromStorage();
  if (pruned) changed = true;

  return changed;
}

async function validateSnapshotOrgBeforePush(
  snapshotData: Record<string, string>
): Promise<{ ok: boolean; expectedOrgId: string; snapshotOrgId: string; reason?: string }> {
  const expectedOrgId = String(await resolveExpectedOrgId()).trim().toUpperCase();
  const snapshotOrgId = extractOrgIdFromSnapshotData(snapshotData);
  if (!expectedOrgId) {
    return { ok: false, expectedOrgId, snapshotOrgId, reason: "missing_expected_org" };
  }
  if (!snapshotOrgId) {
    return { ok: false, expectedOrgId, snapshotOrgId, reason: "snapshot_org_missing" };
  }
  if (snapshotOrgId !== expectedOrgId) {
    return { ok: false, expectedOrgId, snapshotOrgId, reason: "snapshot_org_mismatch" };
  }
  return { ok: true, expectedOrgId, snapshotOrgId };
}

function validateSnapshotOrgOnPull(snapshotData: Record<string, string>, expectedOrgId: string): {
  ok: boolean;
  snapshotOrgId: string;
  reason?: string;
} {
  const expected = String(expectedOrgId || "").trim().toUpperCase();
  const scopeOrgId = extractScopeOrgIdFromSnapshotData(snapshotData);
  const snapshotOrgId = extractOrgIdFromSnapshotData(snapshotData);
  if (!expected) {
    return { ok: false, snapshotOrgId, reason: "missing_expected_org" };
  }

  if (scopeOrgId) {
    if (scopeOrgId !== expected) {
      return { ok: false, snapshotOrgId: scopeOrgId, reason: "org_mismatch_snapshot_scope" };
    }
    return { ok: true, snapshotOrgId: scopeOrgId };
  }

  // Transitional fallback for ORG001 rename migrations:
  // some historical snapshots may still miss scope meta and carry ORG000/ORG001 only in account_settings.
  if (expected === "ORG001" && (snapshotOrgId === "ORG001" || snapshotOrgId === "ORG000")) {
    return { ok: true, snapshotOrgId, reason: "org001_legacy_scope_missing_fallback" };
  }

  // Legacy fallback: only ORG000 can accept old snapshots without scope meta.
  if (expected !== "ORG000") {
    return { ok: false, snapshotOrgId, reason: "snapshot_scope_missing_non_legacy" };
  }
  // For legacy snapshots without explicit scope metadata, require
  // account_settings.orgId to be present and match the expected org.
  if (snapshotOrgId && snapshotOrgId !== expected) {
    return { ok: false, snapshotOrgId, reason: "org_mismatch_snapshot_legacy" };
  }
  if (!snapshotOrgId) {
    return { ok: false, snapshotOrgId, reason: "snapshot_org_missing_legacy" };
  }
  return { ok: true, snapshotOrgId };
}

async function validateSnapshotMemberCountRegressionOnPull(
  snapshotData: Record<string, string>,
  expectedOrgId: string
): Promise<{ ok: boolean; reason?: string; localMembers: number; incomingMembers: number }> {
  const expected = String(expectedOrgId || "").trim().toUpperCase();
  const incomingMembers = parseMemberCountFromRaw(snapshotData?.[KEYS.MEMBERS] || null);
  const localRows = await getMembers();
  const localMembers = Array.isArray(localRows) ? localRows.length : 0;

  if (!expected || expected === "ORG000") {
    return { ok: true, localMembers, incomingMembers };
  }
  if (localMembers <= 0) {
    return { ok: true, localMembers, incomingMembers };
  }

  const delta = localMembers - incomingMembers;
  const ratio = localMembers > 0 ? incomingMembers / localMembers : 1;
  const isSuspiciousDrop =
    delta > 0 &&
    (
      incomingMembers === 0 ||
      (localMembers >= 20 && delta >= 20) ||
      (localMembers >= 30 && ratio < 0.5)
    );
  if (isSuspiciousDrop) {
    return { ok: false, reason: "snapshot_member_count_regression_guard", localMembers, incomingMembers };
  }
  return { ok: true, localMembers, incomingMembers };
}

function buildCloudFolderPullCandidates(folderName: string, expectedOrgId: string): string[] {
  const primary = String(folderName || "").trim();
  const expected = String(expectedOrgId || "").trim().toUpperCase();
  if (!primary || !expected || expected === "ORG000") return primary ? [primary] : [];

  const candidates = [primary];
  const suffixPattern = new RegExp(`[-_\\s]?${expected}$`, "i");
  const legacyBase = primary.replace(suffixPattern, "").replace(/[-_\s]+$/, "").trim();
  if (legacyBase && legacyBase !== primary) {
    candidates.push(legacyBase);
  }
  if (expected === "ORG001") {
    const org000Variant = primary.replace(/ORG001$/i, "ORG000").trim();
    if (org000Variant && org000Variant !== primary) {
      candidates.push(org000Variant);
    }
    if (legacyBase) {
      candidates.push(`${legacyBase}-ORG000`);
    }
  }
  return Array.from(new Set(candidates.filter(Boolean)));
}

async function tryLegacyOrgSnapshotMigrationForPull(
  snapshotData: Record<string, string>,
  expectedOrgId: string
): Promise<Record<string, string> | null> {
  const expected = String(expectedOrgId || "").trim().toUpperCase();
  if (expected !== "ORG001") return null;
  const snapshotOrgId = extractOrgIdFromSnapshotData(snapshotData);
  const allowLegacySnapshotSource =
    snapshotOrgId === "ORG000" ||
    snapshotOrgId === "ORG001" ||
    !snapshotOrgId;
  if (!allowLegacySnapshotSource) return null;

  const snapshotMembersCount = parseMemberCountFromRaw(snapshotData[KEYS.MEMBERS] || null);
  if (snapshotMembersCount < 10) return null;

  const localMembers = await getMembers();
  const localCount = Array.isArray(localMembers) ? localMembers.length : 0;
  // Allow ORG000 -> ORG001 legacy migration when legacy snapshot is clearly richer.
  if (localCount > 1 && snapshotMembersCount < localCount + 20) return null;

  const next: Record<string, string> = { ...snapshotData };
  try {
    const parsedSettings = JSON.parse(String(snapshotData[KEYS.ACCOUNT_SETTINGS] || "{}")) as Record<string, unknown>;
    next[KEYS.ACCOUNT_SETTINGS] = JSON.stringify({
      ...parsedSettings,
      orgId: expected,
      orgSetupCompleted: true,
      orgSetupAt: parsedSettings?.orgSetupAt || new Date().toISOString(),
    });
  } catch {
    next[KEYS.ACCOUNT_SETTINGS] = JSON.stringify({
      orgId: expected,
      orgSetupCompleted: true,
      orgSetupAt: new Date().toISOString(),
    });
  }

  next[SYNC_SCOPE_META_KEY] = JSON.stringify({
    orgId: expected,
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "legacy_org000_to_org001_pull_migration",
  });
  return next;
}

  export async function pushLanSnapshotFromLocalDetailed(): Promise<LanSyncResult> {
    try {
      const license = await ensureSyncLicense();
      if (!license.ok) return { ok: false, reason: license.reason || "license_denied" };
      const { url, enabled } = await resolveSyncServerUrl();
      if (!enabled) return { ok: false, reason: "disabled_or_empty_url", url };
      const raw = await exportData();
      const data = await sanitizeExportForLanSync(JSON.parse(raw) as Record<string, string>);
      const scopeCheck = await validateSnapshotOrgBeforePush(data);
      if (!scopeCheck.ok) {
        return { ok: false, reason: scopeCheck.reason || "org_scope_invalid_local_snapshot", url };
      }
      const snapshotHash = await computeSnapshotHash(data);
      const payload = {
        updatedAt: new Date().toISOString(),
        source: "mobile",
        orgId: scopeCheck.expectedOrgId || undefined,
        data,
        snapshotHash,
      };
    const res = await fetchWithRetry(await buildLanSnapshotUrl(url), {
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

export async function pushCloudSnapshotFromLocalDetailed(): Promise<CloudSyncResult> {
  try {
    const license = await ensureSyncLicense();
    if (!license.ok) return { ok: false, reason: license.reason || "license_denied" };
    const { enabled, endpoint, apiKey, provider, accountEmail, folderName } = await resolveCloudSyncConfig();
    if (!enabled) return { ok: false, reason: "cloud_disabled_or_empty_endpoint", endpoint };
    const raw = await exportData();
    const data = await sanitizeExportForLanSync(JSON.parse(raw) as Record<string, string>);
    const scopeCheck = await validateSnapshotOrgBeforePush(data);
    if (!scopeCheck.ok) {
      return { ok: false, reason: scopeCheck.reason || "org_scope_invalid_local_snapshot", endpoint };
    }
    const snapshotHash = await computeSnapshotHash(data);
    const payload = {
      action: "pushSnapshot",
      provider,
      accountEmail,
      folderName,
      snapshot: {
        updatedAt: new Date().toISOString(),
        source: "mobile_cloud_sync",
        data,
        snapshotHash,
      },
    };
    const result = await postCloudSyncWithApiKeyFallback(
      endpoint,
      payload as unknown as Record<string, unknown>,
      30000,
      apiKey
    );
    if (!result.httpOk) return { ok: false, reason: "cloud_push_http_error", status: result.status, endpoint };
    const responsePayload = result.body;
    if (responsePayload?.ok === false) {
      return {
        ok: false,
        reason: `cloud_push_${String(responsePayload.reason || "unknown")}`,
        status: result.status,
        endpoint,
      };
    }
    return { ok: true, changed: true, reason: "cloud_pushed", status: result.status, endpoint };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || "cloud_push_failed") };
  }
}

  export async function pullLanSnapshotToLocalDetailed(): Promise<LanSyncResult> {
    try {
      const license = await ensureSyncLicense();
      if (!license.ok) return { ok: false, reason: license.reason || "license_denied" };
      const { url, enabled } = await resolveSyncServerUrl();
      if (!enabled) return { ok: false, reason: "disabled_or_empty_url", url };
      const expectedOrgId = String(await resolveExpectedOrgId()).trim().toUpperCase();
      if (!expectedOrgId) {
        return { ok: false, reason: "missing_expected_org", url };
      }
      const res = await fetchWithRetry(await buildLanSnapshotUrl(url), { method: "GET" }, 20000);
      if (res.status === 404) {
        return { ok: true, changed: false, reason: "snapshot_not_found", status: res.status, url };
      }
      if (!res.ok) return { ok: false, reason: "pull_http_error", status: res.status, url };
      const payload = (await res.json()) as { updatedAt?: string; data?: Record<string, string>; snapshotHash?: string };
      if (!payload || typeof payload !== "object" || !payload.data) {
        return { ok: false, reason: "invalid_snapshot_payload", url };
      }
      const verify = await verifySnapshotHash({ snapshotData: payload.data, expectedHash: payload.snapshotHash });
      if (!verify.ok) {
        return { ok: false, reason: verify.reason || "snapshot_hash_mismatch", url };
      }

      let payloadDataForApply = payload.data;
      let scopeCheck = validateSnapshotOrgOnPull(payloadDataForApply, expectedOrgId);
      if (!scopeCheck.ok) {
        const migrated = await tryLegacyOrgSnapshotMigrationForPull(payloadDataForApply, expectedOrgId);
        if (migrated) {
          payloadDataForApply = migrated;
          scopeCheck = validateSnapshotOrgOnPull(payloadDataForApply, expectedOrgId);
        }
      }
      if (!scopeCheck.ok) {
        return { ok: false, reason: scopeCheck.reason || "org_mismatch_snapshot", url };
      }
      const memberRegression = await validateSnapshotMemberCountRegressionOnPull(payloadDataForApply, expectedOrgId);
      if (!memberRegression.ok) {
        return { ok: false, reason: memberRegression.reason || "snapshot_member_count_regression_guard", url };
      }

    const incomingUpdatedAt = String(payload.updatedAt || "");
    const lastApplied = String((await AsyncStorage.getItem(SYNC_LAST_SERVER_UPDATED_AT_KEY)) || "");
    if (incomingUpdatedAt && incomingUpdatedAt === lastApplied) {
      return { ok: true, changed: false, reason: "already_applied", url };
    }

    const merged = await applySnapshotDataFromSync(payloadDataForApply);
    if (incomingUpdatedAt) {
      await AsyncStorage.setItem(SYNC_LAST_SERVER_UPDATED_AT_KEY, incomingUpdatedAt);
    }
    return { ok: true, changed: merged, reason: merged ? "pulled_applied" : "pulled_no_change", url };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || "pull_failed") };
  }
}

export async function pullCloudSnapshotToLocalDetailed(): Promise<CloudSyncResult> {
  try {
    const license = await ensureSyncLicense();
    if (!license.ok) return { ok: false, reason: license.reason || "license_denied" };
    const expectedOrgId = String(await resolveExpectedOrgId()).trim().toUpperCase();
    if (!expectedOrgId) {
      return { ok: false, reason: "missing_expected_org" };
    }
    const { enabled, endpoint, apiKey, provider, accountEmail, folderName } = await resolveCloudSyncConfig();
    if (!enabled) return { ok: false, reason: "cloud_disabled_or_empty_endpoint", endpoint };
    const folderCandidates = buildCloudFolderPullCandidates(folderName, expectedOrgId);
    if (!folderCandidates.length) {
      return { ok: false, reason: "cloud_folder_missing", endpoint };
    }

    let result = await postCloudSyncWithApiKeyFallback(
      endpoint,
      {
        action: "pullSnapshot",
        provider,
        accountEmail,
        folderName: folderCandidates[0],
      },
      30000,
      apiKey
    );
    for (const candidateFolder of folderCandidates.slice(1)) {
      const payload = (result.body || {}) as { reason?: string };
      const reason = String(payload?.reason || "").trim();
      const notFound = result.status === 404 || reason === "snapshot_not_found";
      if (!notFound) break;
      result = await postCloudSyncWithApiKeyFallback(
        endpoint,
        {
          action: "pullSnapshot",
          provider,
          accountEmail,
          folderName: candidateFolder,
        },
        30000,
        apiKey
      );
    }
    if (result.status === 404) {
      return { ok: true, changed: false, reason: "cloud_snapshot_not_found", status: result.status, endpoint };
    }
    if (!result.httpOk) return { ok: false, reason: "cloud_pull_http_error", status: result.status, endpoint };

    const payload = (result.body || {}) as {
      ok?: boolean;
      snapshot?: unknown;
      updatedAt?: string;
      data?: unknown;
      reason?: string;
    };

    const payloadReason = String(payload?.reason || "").trim();
    if (payloadReason === "snapshot_not_found") {
      return { ok: true, changed: false, reason: "cloud_snapshot_not_found", endpoint };
    }
    // Corrupted/empty remote snapshot ကို push flow နဲ့ self-heal လုပ်နိုင်ရန် pull failure မဖြစ်စေဘဲ skip ပြန်ပေးပါ။
    if (payloadReason === "snapshot_read_failed" || payloadReason === "snapshot_empty") {
      return { ok: true, changed: false, reason: payloadReason, endpoint };
    }
    if (payload?.ok === false && payloadReason) {
      return { ok: false, reason: `cloud_pull_${payloadReason}`, endpoint };
    }

    const snapshot = extractCloudSnapshot(payload);
    if (!snapshot || !snapshot.data) {
      const message = payloadReason
        ? `cloud_pull_${payloadReason}`
        : payload && typeof payload === "object"
          ? `cloud_invalid_snapshot_payload:${Object.keys(payload as Record<string, unknown>).join(",")}`
          : "cloud_invalid_snapshot_payload";
      return { ok: false, reason: message, endpoint };
    }

    const verify = await verifySnapshotHash({ snapshotData: snapshot.data, expectedHash: snapshot.snapshotHash });
    if (!verify.ok) {
      return { ok: false, reason: verify.reason || "snapshot_hash_mismatch", endpoint };
    }

    let snapshotDataForApply = snapshot.data;
    let scopeCheck = validateSnapshotOrgOnPull(snapshotDataForApply, expectedOrgId);
    if (!scopeCheck.ok) {
      const migrated = await tryLegacyOrgSnapshotMigrationForPull(snapshotDataForApply, expectedOrgId);
      if (migrated) {
        snapshotDataForApply = migrated;
        scopeCheck = validateSnapshotOrgOnPull(snapshotDataForApply, expectedOrgId);
      }
    }
    if (!scopeCheck.ok) {
      return { ok: false, reason: scopeCheck.reason || "org_mismatch_snapshot", endpoint };
    }

    let selectedSnapshotData = snapshotDataForApply;
    let selectedIncomingUpdatedAt = String(snapshot.updatedAt || "");
    let selectedIncomingHash = String(snapshot.snapshotHash || "");
    let selectedMemberCount = parseMemberCountFromRaw(selectedSnapshotData?.[KEYS.MEMBERS] || null);

    // ORG000 -> ORG001 rename migration case တွင် ORG001 folder တွင် stale-small snapshot ရှိနိုင်သဖြင့်
    // candidate folders အားလုံးအတွင်း member ပိုများသော valid snapshot ကိုရွေးသည်။
    if (expectedOrgId === "ORG001" && folderCandidates.length > 1) {
      for (const candidateFolder of folderCandidates) {
        try {
          const altResult = await postCloudSyncWithApiKeyFallback(
            endpoint,
            {
              action: "pullSnapshot",
              provider,
              accountEmail,
              folderName: candidateFolder,
            },
            30000,
            apiKey
          );
          if (altResult.status === 404 || !altResult.httpOk) continue;
          const altPayload = (altResult.body || {}) as {
            ok?: boolean;
            snapshot?: unknown;
            updatedAt?: string;
            data?: unknown;
            reason?: string;
          };
          const altReason = String(altPayload?.reason || "").trim();
          if (altReason === "snapshot_not_found" || altReason === "snapshot_read_failed" || altReason === "snapshot_empty") {
            continue;
          }
          if (altPayload?.ok === false && altReason) continue;

          const altSnapshot = extractCloudSnapshot(altPayload);
          if (!altSnapshot || !altSnapshot.data) continue;
          const altVerify = await verifySnapshotHash({
            snapshotData: altSnapshot.data,
            expectedHash: altSnapshot.snapshotHash,
          });
          if (!altVerify.ok) continue;

          let altDataForApply = altSnapshot.data;
          let altScopeCheck = validateSnapshotOrgOnPull(altDataForApply, expectedOrgId);
          if (!altScopeCheck.ok) {
            const altMigrated = await tryLegacyOrgSnapshotMigrationForPull(altDataForApply, expectedOrgId);
            if (altMigrated) {
              altDataForApply = altMigrated;
              altScopeCheck = validateSnapshotOrgOnPull(altDataForApply, expectedOrgId);
            }
          }
          if (!altScopeCheck.ok) continue;

          const altMemberCount = parseMemberCountFromRaw(altDataForApply?.[KEYS.MEMBERS] || null);
          if (altMemberCount > selectedMemberCount) {
            selectedSnapshotData = altDataForApply;
            selectedIncomingUpdatedAt = String(altSnapshot.updatedAt || "");
            selectedIncomingHash = String(altSnapshot.snapshotHash || "");
            selectedMemberCount = altMemberCount;
          }
        } catch {
          // ignore candidate fetch failure and keep best-known snapshot
        }
      }
    }

    const lastApplied = String((await AsyncStorage.getItem(CLOUD_SYNC_LAST_REMOTE_UPDATED_AT_KEY)) || "");
    const lastAppliedHash = String((await AsyncStorage.getItem(CLOUD_SYNC_LAST_REMOTE_HASH_KEY)) || "");
    if (
      selectedIncomingUpdatedAt &&
      selectedIncomingUpdatedAt === lastApplied &&
      selectedIncomingHash &&
      lastAppliedHash &&
      selectedIncomingHash === lastAppliedHash
    ) {
      try {
        const localRaw = await exportData();
        const localData = await sanitizeExportForLanSync(JSON.parse(localRaw) as Record<string, string>);
        const localHash = await computeSnapshotHash(localData);
        if (localHash === selectedIncomingHash) {
          return { ok: true, changed: false, reason: "already_applied", endpoint };
        }
      } catch {
        // If local hash can't be computed, fall through to merge.
      }
    }

    const memberRegression = await validateSnapshotMemberCountRegressionOnPull(selectedSnapshotData, expectedOrgId);
    if (!memberRegression.ok) {
      return { ok: false, reason: memberRegression.reason || "snapshot_member_count_regression_guard", endpoint };
    }

    const merged = await applySnapshotDataFromSync(selectedSnapshotData);
    if (selectedIncomingUpdatedAt) {
      await AsyncStorage.setItem(CLOUD_SYNC_LAST_REMOTE_UPDATED_AT_KEY, selectedIncomingUpdatedAt);
    }
    if (selectedIncomingHash) {
      await AsyncStorage.setItem(CLOUD_SYNC_LAST_REMOTE_HASH_KEY, selectedIncomingHash);
    }
    return { ok: true, changed: merged, reason: merged ? "cloud_pulled_applied" : "cloud_pulled_no_change", endpoint };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message || "cloud_pull_failed") };
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

export async function pushCloudSnapshotFromLocal(): Promise<boolean> {
  const result = await pushCloudSnapshotFromLocalDetailed();
  return result.ok;
}

export async function pullCloudSnapshotToLocal(): Promise<boolean> {
  const result = await pullCloudSnapshotToLocalDetailed();
  return result.ok && !!result.changed;
}

// --- Users ---
export const getUsers = async (): Promise<UserAccount[]> => {
  const rows = await safeGet<UserAccount[]>(KEYS.USERS, []);
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const byUserId = new Map<string, UserAccount>();
  for (const row of rows) {
    const id = String(row?.id || "").trim();
    if (!id) continue;
    const current = byUserId.get(id);
    if (!current) {
      byUserId.set(id, row);
      continue;
    }
    const currentTime = Date.parse(String(current.createdAt || ""));
    const nextTime = Date.parse(String(row?.createdAt || ""));
    if (!Number.isNaN(nextTime) && (Number.isNaN(currentTime) || nextTime > currentTime)) {
      byUserId.set(id, row);
    }
  }

  const deduped = Array.from(byUserId.values());
  if (deduped.length !== rows.length) {
    await saveUsers(deduped);
  }
  return deduped;
};
export const saveUsers = (data: UserAccount[]) => AsyncStorage.setItem(KEYS.USERS, JSON.stringify(data));

export async function seedDefaultAdminUser(options?: { allowDefaultDataSeed?: boolean }) {
  const allowDefaultDataSeed = options?.allowDefaultDataSeed !== false;
  const emptyStateMode = String((await AsyncStorage.getItem(EMPTY_ORG_STATE_KEY)) || "") === "1";
  const settings = await getAccountSettings();
  const orgId = String(settings?.orgId || "").trim().toUpperCase();
  const shouldSeedDefaultData = allowDefaultDataSeed && !emptyStateMode && orgId === "ORG000";
  // 1. Seeding: If no members exist, try to load from default-data.json
  const existingMembers = await getMembers();
  if (existingMembers.length === 0 && shouldSeedDefaultData) {
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
  const filteredUsers = users.filter(u => u.systemRole !== "admin");
  if (filteredUsers.length !== users.length) {
    await saveUsers(filteredUsers);
  }
  await ensureSystemAdminPassword();

  // Sync existing members to user accounts
  const members = await getMembers();
  if (members.length > 0 && emptyStateMode) {
    await AsyncStorage.removeItem(EMPTY_ORG_STATE_KEY);
  }
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
  const keys = await getAllSharedBackupKeys();
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
    
    Object.keys(exportObj || {}).forEach((key) => {
      if (isSharedBackupKey(key) && typeof exportObj[key] === "string") {
        pairs.push([key, exportObj[key]]);
      }
    });

    if (pairs.length === 0) return false;

    // Replace mode: clear all shared keys first so stale keys do not remain.
    const allSharedKeys = await getAllSharedBackupKeys();
    if (allSharedKeys.length > 0) {
      await AsyncStorage.multiRemove(allSharedKeys);
    }
    await AsyncStorage.multiSet(pairs);
    const importedMembers = parseJsonSafe<any[]>(exportObj?.[KEYS.MEMBERS], []);
    if (Array.isArray(importedMembers) && importedMembers.length > 0) {
      await setEmptyOrgState(false);
    }
    const importedLogs = parseJsonSafe<AuditExecutionLog[]>(exportObj?.[KEYS.AUDIT_EXECUTION_LOGS], []);
    if (Array.isArray(importedLogs) && importedLogs.length > 0) {
      const index = collectDeletedTargetsFromExecutionLogs(importedLogs);
      if (index.transactionIds.size || index.loanIds.size) {
        const importedTxns = parseJsonSafe<Transaction[]>(exportObj?.[KEYS.TRANSACTIONS], []);
        const importedLoans = parseJsonSafe<Loan[]>(exportObj?.[KEYS.LOANS], []);
        const nextTxns = filterTransactionsByDeletedIndex(Array.isArray(importedTxns) ? importedTxns : [], index);
        const nextLoans = filterLoansByDeletedIndex(Array.isArray(importedLoans) ? importedLoans : [], index);
        await AsyncStorage.multiSet([
          [KEYS.TRANSACTIONS, JSON.stringify(nextTxns)],
          [KEYS.LOANS, JSON.stringify(nextLoans)],
        ]);
      }
    }
    return true;
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

type AuditTestCleanupTombstone = {
  id?: string;
  requestNumber?: string;
};

async function getAuditTestCleanupTombstones(): Promise<{ idSet: Set<string>; numberSet: Set<string> }> {
  try {
    const raw = await AsyncStorage.getItem(AUDIT_TEST_CLEANUP_TOMBSTONES_KEY);
    const rows = parseJsonSafe<any[]>(raw, []);
    const idSet = new Set<string>();
    const numberSet = new Set<string>();
    if (Array.isArray(rows)) {
      rows.forEach((row) => {
        if (typeof row === "string") {
          const value = String(row || "").trim();
          if (value) {
            idSet.add(value);
            numberSet.add(value);
          }
          return;
        }
        if (row && typeof row === "object") {
          const id = String((row as AuditTestCleanupTombstone).id || "").trim();
          const requestNumber = String((row as AuditTestCleanupTombstone).requestNumber || "").trim();
          if (id) idSet.add(id);
          if (requestNumber) numberSet.add(requestNumber);
        }
      });
    }
    return { idSet, numberSet };
  } catch {
    return { idSet: new Set(), numberSet: new Set() };
  }
}

async function appendAuditTestCleanupTombstones(rows: AuditTestCleanupTombstone[]): Promise<void> {
  if (!rows.length) return;
  const existingRaw = await AsyncStorage.getItem(AUDIT_TEST_CLEANUP_TOMBSTONES_KEY);
  const existing = parseJsonSafe<AuditTestCleanupTombstone[]>(existingRaw, []);
  const next = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set<string>();
  next.forEach((row) => {
    const id = String(row?.id || "").trim();
    const requestNumber = String(row?.requestNumber || "").trim();
    if (id) seen.add(`id:${id}`);
    if (requestNumber) seen.add(`no:${requestNumber}`);
  });
  rows.forEach((row) => {
    const id = String(row?.id || "").trim();
    const requestNumber = String(row?.requestNumber || "").trim();
    const idKey = id ? `id:${id}` : "";
    const noKey = requestNumber ? `no:${requestNumber}` : "";
    if ((idKey && seen.has(idKey)) || (noKey && seen.has(noKey))) return;
    if (idKey) seen.add(idKey);
    if (noKey) seen.add(noKey);
    next.push({ id: id || undefined, requestNumber: requestNumber || undefined });
  });
  await AsyncStorage.setItem(AUDIT_TEST_CLEANUP_TOMBSTONES_KEY, JSON.stringify(next));
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeArrayItemKey(value: unknown): string {
  if (isPlainObject(value)) {
    const id = String((value as any).id || "").trim();
    if (id) return `id:${id}`;
  }
  try {
    return `json:${JSON.stringify(value)}`;
  } catch {
    return `str:${String(value)}`;
  }
}

function mergeArrayValues(existing: unknown[], incoming: unknown[]): unknown[] {
  const allWithId =
    existing.concat(incoming).every((row) => {
      if (!isPlainObject(row)) return false;
      return String((row as any).id || "").trim().length > 0;
    });
  if (allWithId) {
    return mergeRecordsById(existing as any[], incoming as any[]);
  }

  const map = new Map<string, unknown>();
  for (const row of existing) map.set(normalizeArrayItemKey(row), row);
  for (const row of incoming) map.set(normalizeArrayItemKey(row), row);
  return Array.from(map.values());
}

function mergeStorageValues(existingValue: unknown, incomingValue: unknown): unknown {
  if (Array.isArray(existingValue) && Array.isArray(incomingValue)) {
    return mergeArrayValues(existingValue, incomingValue);
  }
  if (isPlainObject(existingValue) && isPlainObject(incomingValue)) {
    return { ...existingValue, ...incomingValue };
  }
  return incomingValue;
}

export async function mergeData(jsonString: string): Promise<boolean> {
  try {
    const exportObj = JSON.parse(jsonString) as Record<string, unknown>;
    const incomingLogs = parseJsonSafe<AuditExecutionLog[]>(exportObj?.[KEYS.AUDIT_EXECUTION_LOGS], []);
    const existingLogs = await getAuditExecutionLogs();
    const mergedLogs = mergeRecordsById(existingLogs, Array.isArray(incomingLogs) ? incomingLogs : []);
    const deletedIndex = collectDeletedTargetsFromExecutionLogs(mergedLogs);
    const tombstones = await getAuditTestCleanupTombstones();

    const keys = Object.keys(exportObj || {}).filter((key) => isSharedBackupKey(key));
    let changed = false;

    for (const key of keys) {
      if (!(key in exportObj)) continue;
      const incomingRaw = exportObj[key];
      const existingRaw = await AsyncStorage.getItem(key);

      if (key === KEYS.ACCOUNT_SETTINGS) {
        const existingSettings = parseJsonSafe<Record<string, unknown>>(existingRaw, {});
        const incomingSettings = parseJsonSafe<Record<string, unknown>>(incomingRaw, {});
        const mergedSettings = { ...existingSettings, ...incomingSettings };
        const mergedSerialized = JSON.stringify(mergedSettings);
        if (String(existingRaw || "") !== mergedSerialized) {
          await AsyncStorage.setItem(key, mergedSerialized);
          changed = true;
        }
        continue;
      }

      if (key === KEYS.USER_PASSWORDS) {
        const existingPasswords = parseJsonSafe<Record<string, string>>(existingRaw, {});
        const incomingPasswords = parseJsonSafe<Record<string, string>>(incomingRaw, {});
        const mergedPasswords = { ...existingPasswords, ...incomingPasswords };
        const mergedSerialized = JSON.stringify(mergedPasswords);
        if (String(existingRaw || "") !== mergedSerialized) {
          await AsyncStorage.setItem(key, mergedSerialized);
          changed = true;
        }
        continue;
      }

      const existingParsed = parseJsonSafe<unknown>(existingRaw, existingRaw || null);
      const incomingParsed = parseJsonSafe<unknown>(incomingRaw, incomingRaw);
      let mergedValue = mergeStorageValues(existingParsed, incomingParsed);
      if (key === KEYS.AUDIT_CHANGE_REQUESTS && Array.isArray(mergedValue)) {
        mergedValue = (mergedValue as any[]).filter((row: any) => {
          const id = String(row?.id || "").trim();
          const requestNumber = String(row?.requestNumber || "").trim();
          if (id && tombstones.idSet.has(id)) return false;
          if (requestNumber && tombstones.numberSet.has(requestNumber)) return false;
          return true;
        });
      }
      if (key === KEYS.AUDIT_EXECUTION_LOGS && Array.isArray(mergedValue)) {
        mergedValue = (mergedValue as any[]).filter((row: any) => {
          const reqId = String(row?.requestId || "").trim();
          const reqNo = String(row?.requestNumber || "").trim();
          if (reqId && tombstones.idSet.has(reqId)) return false;
          if (reqNo && tombstones.numberSet.has(reqNo)) return false;
          return true;
        });
      }
      if (key === KEYS.TRANSACTIONS && Array.isArray(mergedValue)) {
        mergedValue = filterTransactionsByDeletedIndex(mergedValue as Transaction[], deletedIndex);
      }
      if (key === KEYS.LOANS && Array.isArray(mergedValue)) {
        mergedValue = filterLoansByDeletedIndex(mergedValue as Loan[], deletedIndex);
      }
      const mergedSerialized = typeof mergedValue === "string" ? mergedValue : JSON.stringify(mergedValue);
      if (String(existingRaw || "") !== mergedSerialized) {
        await AsyncStorage.setItem(key, mergedSerialized);
        changed = true;
      }
    }

    const mergedMembers = await getMembers();
    if (mergedMembers.length > 0) {
      await setEmptyOrgState(false);
    }

    if (deletedIndex.transactionIds.size || deletedIndex.loanIds.size) {
      const pruned = await pruneDeletedTargetsFromStorage();
      if (pruned) changed = true;
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

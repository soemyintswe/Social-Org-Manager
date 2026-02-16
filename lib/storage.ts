import AsyncStorage from "@react-native-async-storage/async-storage";
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
};

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
  requests[index] = {
    ...requests[index],
    assignedReviewerUserId: targetReviewer || undefined,
    assignedByUserId: targetReviewer ? assignerUserId : undefined,
    assignedAt: targetReviewer ? new Date().toISOString() : undefined,
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
    asOfDate: new Date().toISOString()
  });
}

export async function saveAccountSettings(settings: AccountSettings) {
  await AsyncStorage.setItem(KEYS.ACCOUNT_SETTINGS, JSON.stringify(settings));
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

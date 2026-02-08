import AsyncStorage from "@react-native-async-storage/async-storage";
import { Member, OrgEvent, Group, AttendanceRecord, Transaction, Loan, AccountSettings } from "./types";

const KEYS = {
  MEMBERS: "@orghub_members",
  EVENTS: "@orghub_events",
  GROUPS: "@orghub_groups",
  ATTENDANCE: "@orghub_attendance",
  TRANSACTIONS: "@orghub_transactions",
  LOANS: "@orghub_loans",
  ACCOUNT_SETTINGS: "@orghub_account_settings",
};

const AVATAR_COLORS = ["#0D9488", "#F43F5E", "#8B5CF6", "#F59E0B", "#3B82F6", "#10B981", "#EC4899", "#6366F1"];

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substring(2, 11);
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
export const saveMembers = (data: Member[]) => AsyncStorage.setItem(KEYS.MEMBERS, JSON.stringify(data));

export async function addMember(member: any): Promise<Member> {
  const members = await getMembers();
  const newMember = {
    ...member,
    id: member.id || generateId(),
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    createdAt: new Date().toISOString()
  };
  await saveMembers([...members, newMember]);
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

export function generateReceiptNumber(): string {
  return `REC-${Date.now().toString().slice(-6)}`;
}
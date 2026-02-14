import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import type {
  Member,
  OrgEvent,
  Group,
  AttendanceRecord,
  Transaction,
  Loan,
  AccountSettings,
} from "./types";
import * as store from "./storage";

interface DataContextValue {
  members: Member[];
  events: OrgEvent[];
  groups: Group[];
  attendance: AttendanceRecord[];
  transactions: Transaction[];
  loans: Loan[];
  accountSettings: AccountSettings;
  loading: boolean;
  refreshData: () => Promise<void>;
  addMember: (m: Omit<Member, "id">) => Promise<Member>;
  updateMember: (id: string, u: Partial<Member>) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
  addEvent: (e: Omit<OrgEvent, "id">) => Promise<OrgEvent>;
  editEvent: (id: string, u: Partial<OrgEvent>) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  addGroup: (g: Omit<Group, "id">) => Promise<Group>;
  editGroup: (id: string, u: Partial<Group>) => Promise<void>;
  removeGroup: (id: string) => Promise<void>;
  addTransaction: (t: Omit<Transaction, "id">) => Promise<Transaction>;
  updateTransaction: (id: string, u: Partial<Transaction>) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  addLoan: (l: Omit<Loan, "id">) => Promise<Loan>;
  editLoan: (id: string, u: Partial<Loan>) => Promise<void>;
  removeLoan: (id: string) => Promise<void>;
  updateAccountSettings: (s: AccountSettings) => Promise<void>;
  getLoanOutstanding: (loanId: string) => number;
  getLoanInterestDue: (loanId: string) => number;
  getCashBalance: () => number;
  getBankBalance: () => number;
  getTotalBalance: () => number;
  getEventAttendance: (eventId: string) => AttendanceRecord[];
  markAttendance: (eventId: string, memberId: string, status: "present" | "absent") => Promise<void>;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [accountSettings, setAccountSettings] = useState<AccountSettings>({
    orgName: "My Organization",
    currency: "MMK",
    openingBalanceCash: 0,
    openingBalanceBank: 0,
    asOfDate: new Date().toISOString(),
  });
  const [loading, setLoading] = useState(true);

  const refreshData = useCallback(async () => {
    try {
      const [m, e, g, a, t, l, s] = await Promise.all([
        store.getMembers(),
        store.getEvents(),
        store.getGroups(),
        store.getAttendance(),
        store.getTransactions(),
        store.getLoans(),
        store.getAccountSettings(),
      ]);
      setMembers(m);
      setEvents(e);
      setGroups(g);
      setAttendance(a);
      setTransactions(t);
      setLoans(l);
      if (s) setAccountSettings(s);
    } catch (error) {
      console.error("Refresh Error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // --- Actions ---
  const addMember = async (m: Omit<Member, "id">) => {
    const newMember = await store.addMember(m);
    await refreshData();
    return newMember;
  };

  const updateMember = async (id: string, u: Partial<Member>) => {
    await store.updateMember(id, u);
    await refreshData();
  };

  const deleteMember = async (id: string) => {
    await store.deleteMember(id);
    await refreshData();
  };

  const addEvent = async (e: Omit<OrgEvent, "id">) => {
    const newEvent = await store.addEvent(e);
    await refreshData();
    return newEvent;
  };

  const editEvent = async (id: string, u: Partial<OrgEvent>) => {
    await store.updateEvent(id, u);
    await refreshData();
  };

  const removeEvent = async (id: string) => {
    await store.deleteEvent(id);
    await refreshData();
  };

  const addGroup = async (g: Omit<Group, "id">) => {
    const newGroup = await store.addGroup(g);
    await refreshData();
    return newGroup;
  };

  const editGroup = async (id: string, u: Partial<Group>) => {
    await store.updateGroup(id, u);
    await refreshData();
  };

  const removeGroup = async (id: string) => {
    await store.deleteGroup(id);
    await refreshData();
  };

  const addTransaction = async (t: Omit<Transaction, "id">) => {
    const newTxn = await store.addTransaction(t);
    await refreshData();
    return newTxn;
  };

  const updateTransaction = async (id: string, u: Partial<Transaction>) => {
    await store.updateTransaction(id, u);
    await refreshData();
  };

  const removeTransaction = async (id: string) => {
    await store.deleteTransaction(id);
    await refreshData();
  };

  const addLoan = async (l: Omit<Loan, "id">) => {
    const newLoan = await store.addLoan(l);
    await refreshData();
    return newLoan;
  };

  const editLoan = async (id: string, u: Partial<Loan>) => {
    await store.updateLoan(id, u);
    await refreshData();
  };

  const removeLoan = async (id: string) => {
    await store.deleteLoan(id);
    await refreshData();
  };

  const updateAccountSettings = async (s: AccountSettings) => {
    await store.saveAccountSettings(s);
    await refreshData();
  };

  // --- Calculations ---
  const getLoanOutstanding = (loanId: string) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return 0;
    const repayments = transactions
      .filter((t) => t.loanId === loanId && t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    return (loan.principal || 0) - repayments;
  };

  const getLoanInterestDue = (_loanId: string) => 0;

  const getCashBalance = () => {
    const income = transactions.filter((t) => t.type === "income" && t.paymentMethod === "cash").reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions.filter((t) => t.type === "expense" && t.paymentMethod === "cash").reduce((sum, t) => sum + t.amount, 0);
    return (accountSettings.openingBalanceCash || 0) + income - expense;
  };

  const getBankBalance = () => {
    const income = transactions.filter((t) => t.type === "income" && t.paymentMethod === "bank").reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions.filter((t) => t.type === "expense" && t.paymentMethod === "bank").reduce((sum, t) => sum + t.amount, 0);
    return (accountSettings.openingBalanceBank || 0) + income - expense;
  };

  const getTotalBalance = () => getCashBalance() + getBankBalance();

  // --- Attendance ---
  const getEventAttendance = (eventId: string) => {
    return attendance.filter((a: AttendanceRecord) => a.eventId === eventId);
  };

  const markAttendance = async (eventId: string, memberId: string, status: "present" | "absent") => {
    await store.saveAttendance(eventId, memberId, status);
    await refreshData();
  };

  const value: DataContextValue = {
    members, events, groups, attendance, transactions, loans, accountSettings, loading,
    refreshData, addMember, updateMember, deleteMember,
    addEvent, editEvent, removeEvent,
    addGroup, editGroup, removeGroup,
    addTransaction, updateTransaction, removeTransaction,
    addLoan, editLoan, removeLoan,
    updateAccountSettings,
    getLoanOutstanding, getLoanInterestDue,
    getCashBalance, getBankBalance, getTotalBalance,
    getEventAttendance, markAttendance,
  };

  return React.createElement(DataContext.Provider, { value }, children);
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

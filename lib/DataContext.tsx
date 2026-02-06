import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { Member, OrgEvent, Group, AttendanceRecord, Transaction, Loan, AccountSettings } from "./types";
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
  refresh: () => Promise<void>;
  addMember: (m: Omit<Member, "id" | "avatarColor" | "joinDate">) => Promise<Member>;
  editMember: (id: string, u: Partial<Member>) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  addEvent: (e: Omit<OrgEvent, "id" | "createdAt">) => Promise<OrgEvent>;
  editEvent: (id: string, u: Partial<OrgEvent>) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  addGroup: (g: Omit<Group, "id" | "createdAt">) => Promise<Group>;
  editGroup: (id: string, u: Partial<Group>) => Promise<void>;
  removeGroup: (id: string) => Promise<void>;
  markAttendance: (records: AttendanceRecord[]) => Promise<void>;
  getEventAttendance: (eventId: string) => AttendanceRecord[];
  addTransaction: (t: Omit<Transaction, "id" | "createdAt">) => Promise<Transaction>;
  removeTransaction: (id: string) => Promise<void>;
  addLoan: (l: Omit<Loan, "id" | "createdAt">) => Promise<Loan>;
  editLoan: (id: string, u: Partial<Loan>) => Promise<void>;
  removeLoan: (id: string) => Promise<void>;
  updateAccountSettings: (s: AccountSettings) => Promise<void>;
  getLoanOutstanding: (loanId: string) => number;
  getLoanInterestDue: (loanId: string) => number;
  getCashBalance: () => number;
  getBankBalance: () => number;
  getTotalBalance: () => number;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [accountSettings, setAccountSettings] = useState<AccountSettings>({
    openingBalanceCash: 0,
    openingBalanceBank: 0,
    asOfDate: new Date().toISOString().split("T")[0],
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
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
    setAccountSettings(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addMember = useCallback(async (m: Omit<Member, "id" | "avatarColor" | "joinDate">) => {
    const newMember = await store.saveMember(m);
    setMembers((prev) => [...prev, newMember]);
    return newMember;
  }, []);

  const editMember = useCallback(async (id: string, u: Partial<Member>) => {
    await store.updateMember(id, u);
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...u } : m)));
  }, []);

  const removeMember = useCallback(async (id: string) => {
    await store.deleteMember(id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addEvent = useCallback(async (e: Omit<OrgEvent, "id" | "createdAt">) => {
    const newEvent = await store.saveEvent(e);
    setEvents((prev) => [...prev, newEvent]);
    return newEvent;
  }, []);

  const editEvent = useCallback(async (id: string, u: Partial<OrgEvent>) => {
    await store.updateEvent(id, u);
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...u } : e)));
  }, []);

  const removeEvent = useCallback(async (id: string) => {
    await store.deleteEvent(id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setAttendance((prev) => prev.filter((a) => a.eventId !== id));
  }, []);

  const addGroup = useCallback(async (g: Omit<Group, "id" | "createdAt">) => {
    const newGroup = await store.saveGroup(g);
    setGroups((prev) => [...prev, newGroup]);
    return newGroup;
  }, []);

  const editGroup = useCallback(async (id: string, u: Partial<Group>) => {
    await store.updateGroup(id, u);
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...u } : g)));
  }, []);

  const removeGroup = useCallback(async (id: string) => {
    await store.deleteGroup(id);
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const markAttendance = useCallback(async (records: AttendanceRecord[]) => {
    await store.saveAttendance(records);
    setAttendance((prev) => {
      const updated = [...prev];
      for (const record of records) {
        const idx = updated.findIndex((a) => a.eventId === record.eventId && a.memberId === record.memberId);
        if (idx >= 0) updated[idx] = record;
        else updated.push(record);
      }
      return updated;
    });
  }, []);

  const getEventAttendance = useCallback(
    (eventId: string) => attendance.filter((a) => a.eventId === eventId),
    [attendance]
  );

  const addTransaction = useCallback(async (t: Omit<Transaction, "id" | "createdAt">) => {
    const newTxn = await store.saveTransaction(t);
    setTransactions((prev) => [...prev, newTxn]);
    return newTxn;
  }, []);

  const removeTransaction = useCallback(async (id: string) => {
    await store.deleteTransaction(id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addLoan = useCallback(async (l: Omit<Loan, "id" | "createdAt">) => {
    const newLoan = await store.saveLoan(l);
    setLoans((prev) => [...prev, newLoan]);
    return newLoan;
  }, []);

  const editLoan = useCallback(async (id: string, u: Partial<Loan>) => {
    await store.updateLoan(id, u);
    setLoans((prev) => prev.map((l) => (l.id === id ? { ...l, ...u } : l)));
  }, []);

  const removeLoan = useCallback(async (id: string) => {
    await store.deleteLoan(id);
    setLoans((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const updateAccountSettings = useCallback(async (s: AccountSettings) => {
    await store.saveAccountSettings(s);
    setAccountSettings(s);
  }, []);

  const getLoanOutstanding = useCallback(
    (loanId: string) => {
      const loan = loans.find((l) => l.id === loanId);
      if (!loan) return 0;
      const repayments = transactions.filter(
        (t) => t.loanId === loanId && t.category === "loan_repayment"
      );
      const totalRepaid = repayments.reduce((sum, t) => sum + t.amount, 0);
      const monthsSinceIssue = Math.max(
        0,
        monthsDiff(new Date(loan.issueDate), new Date())
      );
      const totalInterest = loan.principalAmount * (loan.interestRate / 100) * monthsSinceIssue;
      return Math.max(0, loan.principalAmount + totalInterest - totalRepaid);
    },
    [loans, transactions]
  );

  const getLoanInterestDue = useCallback(
    (loanId: string) => {
      const loan = loans.find((l) => l.id === loanId);
      if (!loan) return 0;
      const outstanding = getLoanOutstanding(loanId);
      return outstanding * (loan.interestRate / 100);
    },
    [loans, getLoanOutstanding]
  );

  const getCashBalance = useCallback(() => {
    const cashIncome = transactions
      .filter((t) => t.type === "income" && t.paymentMethod === "cash")
      .reduce((sum, t) => sum + t.amount, 0);
    const cashExpense = transactions
      .filter((t) => t.type === "expense" && t.paymentMethod === "cash")
      .reduce((sum, t) => sum + t.amount, 0);
    return accountSettings.openingBalanceCash + cashIncome - cashExpense;
  }, [transactions, accountSettings]);

  const getBankBalance = useCallback(() => {
    const bankIncome = transactions
      .filter((t) => t.type === "income" && t.paymentMethod === "bank")
      .reduce((sum, t) => sum + t.amount, 0);
    const bankExpense = transactions
      .filter((t) => t.type === "expense" && t.paymentMethod === "bank")
      .reduce((sum, t) => sum + t.amount, 0);
    return accountSettings.openingBalanceBank + bankIncome - bankExpense;
  }, [transactions, accountSettings]);

  const getTotalBalance = useCallback(() => {
    return getCashBalance() + getBankBalance();
  }, [getCashBalance, getBankBalance]);

  const value = useMemo(
    () => ({
      members, events, groups, attendance, transactions, loans, accountSettings, loading, refresh,
      addMember, editMember, removeMember,
      addEvent, editEvent, removeEvent,
      addGroup, editGroup, removeGroup,
      markAttendance, getEventAttendance,
      addTransaction, removeTransaction,
      addLoan, editLoan, removeLoan,
      updateAccountSettings,
      getLoanOutstanding, getLoanInterestDue,
      getCashBalance, getBankBalance, getTotalBalance,
    }),
    [members, events, groups, attendance, transactions, loans, accountSettings, loading, refresh,
      addMember, editMember, removeMember,
      addEvent, editEvent, removeEvent,
      addGroup, editGroup, removeGroup,
      markAttendance, getEventAttendance,
      addTransaction, removeTransaction,
      addLoan, editLoan, removeLoan,
      updateAccountSettings,
      getLoanOutstanding, getLoanInterestDue,
      getCashBalance, getBankBalance, getTotalBalance]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

function monthsDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

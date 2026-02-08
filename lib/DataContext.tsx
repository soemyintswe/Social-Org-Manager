import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from "react";
import {
  Member,
  OrgEvent,
  Group,
  AttendanceRecord,
  Transaction,
  Loan,
  AccountSettings,
} from "./types";
import * as store from "./storage";
import { Alert } from "react-native";

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
    orgName: "",
    currency: "MMK",
    openingBalanceCash: 0,
    openingBalanceBank: 0,
  });
  const [loading, setLoading] = useState(true);

  const refreshData = useCallback(async () => {
    setLoading(true);
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
      setAccountSettings(s);
    } catch (err) {
      console.error("Failed to refresh data:", err);
      // ဒီနေရာမှာ Alert ကို သုံးလိုက်ရင် Error ပျောက်သွားပါလိမ့်မယ်
      Alert.alert("Data Error", "ဒေတာများ ဖတ်မရဖြစ်နေပါသည်။");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // --- Actions ---
  const addMember = async (m: Omit<Member, "id">) => {
    const res = await store.addMember(m);
    await refreshData();
    return res;
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
    const res = await store.addEvent(e);
    await refreshData();
    return res;
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
    const res = await store.addGroup(g);
    await refreshData();
    return res;
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
    const res = await store.addTransaction(t);
    await refreshData();
    return res;
  };

  const removeTransaction = async (id: string) => {
    await store.deleteTransaction(id);
    await refreshData();
  };

  const addLoan = async (l: Omit<Loan, "id">) => {
    const res = await store.addLoan(l);
    await refreshData();
    return res;
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
    await store.updateAccountSettings(s);
    await refreshData();
  };

  // --- Helpers ---
  const getLoanOutstanding = (loanId: string) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return 0;
    const paid = transactions
      .filter((t) => t.loanId === loanId && t.category === "loan_repayment")
      .reduce((sum, t) => sum + t.amount, 0);
    return loan.amount - paid;
  };

  const getLoanInterestDue = (loanId: string) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return 0;
    return (loan.amount * (loan.interestRate / 100));
  };

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

  const getEventAttendance = (eventId: string) => {
    return attendance.filter((a) => a.eventId === eventId);
  };

  const markAttendance = async (eventId: string, memberId: string, status: "present" | "absent") => {
    await store.saveAttendance(eventId, memberId, status);
    await refreshData();
  };

  const value = useMemo(
    () => ({
      members, events, groups, attendance, transactions, loans, accountSettings, loading,
      refreshData, addMember, updateMember, deleteMember,
      addEvent, editEvent, removeEvent,
      addGroup, editGroup, removeGroup,
      addTransaction, removeTransaction,
      addLoan, editLoan, removeLoan,
      updateAccountSettings,
      getLoanOutstanding, getLoanInterestDue,
      getCashBalance, getBankBalance, getTotalBalance,
      getEventAttendance, markAttendance,
    }),
    [members, events, groups, attendance, transactions, loans, accountSettings, loading, refreshData]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
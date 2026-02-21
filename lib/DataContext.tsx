import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
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
  UserAccount,
  MemberChangeRequest,
  ExpenseClaim,
  MemberPaymentRequest,
  MemberPaymentRequestKind,
  MobileWalletProvider,
  StandardAmountRule,
  StandardAmountChangeRequest,
  DisbursementMethod,
} from "./types";
import * as store from "./storage";

interface DataContextValue {
  members: Member[];
  events: OrgEvent[];
  groups: Group[];
  attendance: AttendanceRecord[];
  transactions: Transaction[];
  loans: Loan[];
  users: UserAccount[];
  memberChangeRequests: MemberChangeRequest[];
  expenseClaims: ExpenseClaim[];
  memberPaymentRequests: MemberPaymentRequest[];
  standardAmountRules: StandardAmountRule[];
  standardAmountChangeRequests: StandardAmountChangeRequest[];
  accountSettings: AccountSettings;
  loading: boolean;
  refreshData: (options?: { skipPull?: boolean }) => Promise<void>;
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
  upsertUserAccount: (u: UserAccount) => Promise<void>;
  removeUserAccount: (id: string) => Promise<void>;
  updateAccountSettings: (s: AccountSettings) => Promise<void>;
  createMemberChangeRequest: (input: {
    action: "create" | "update" | "delete";
    targetMemberId?: string;
    payload: {
      member?: Partial<Member>;
      note?: string;
    };
    createdByUserId: string;
    createdByMemberId?: string;
  }) => Promise<MemberChangeRequest>;
  approveMemberChangeRequest: (requestId: string, reviewerUserId: string, reviewNote?: string) => Promise<void>;
  rejectMemberChangeRequest: (requestId: string, reviewerUserId: string, reviewNote?: string) => Promise<void>;
  withdrawMemberChangeRequest: (requestId: string, requesterUserId: string, note?: string) => Promise<void>;
  assignMemberChangeRequest: (requestId: string, assignedReviewerUserId: string | undefined, assignerUserId: string) => Promise<void>;
  createExpenseClaim: (input: Omit<ExpenseClaim, "id" | "claimNumber" | "status" | "createdAt" | "updatedAt">) => Promise<ExpenseClaim>;
  approveExpenseClaim: (input: { claimId: string; approverUserId: string; approvedAmount: number; approvalNote?: string }) => Promise<void>;
  rejectExpenseClaim: (input: { claimId: string; approverUserId: string; approvalNote: string }) => Promise<void>;
  disburseExpenseClaim: (input: {
    claimId: string;
    disburserUserId: string;
    method: DisbursementMethod;
    disbursementDate: string;
    voucherNumber?: string;
    note?: string;
  }) => Promise<void>;
  createMemberPaymentRequest: (input: {
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
    feePeriodStart?: string;
    feePeriodEnd?: string;
    createdByUserId: string;
    createdByMemberId?: string;
  }) => Promise<MemberPaymentRequest>;
  approveMemberPaymentRequest: (input: {
    requestId: string;
    reviewerUserId: string;
    reviewNote?: string;
    acceptedDate?: string;
  }) => Promise<void>;
  rejectMemberPaymentRequest: (input: {
    requestId: string;
    reviewerUserId: string;
    reviewNote: string;
  }) => Promise<void>;
  createStandardAmountChangeRequest: (input: {
    ruleKey: string;
    ruleLabel: string;
    requestedAmount: number;
    reason: string;
    createdByUserId: string;
    createdByMemberId?: string;
  }) => Promise<StandardAmountChangeRequest>;
  approveStandardAmountChangeRequest: (requestId: string, approverUserId: string, approvalNote?: string) => Promise<void>;
  rejectStandardAmountChangeRequest: (requestId: string, approverUserId: string, approvalNote?: string) => Promise<void>;
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
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [memberChangeRequests, setMemberChangeRequests] = useState<MemberChangeRequest[]>([]);
  const [expenseClaims, setExpenseClaims] = useState<ExpenseClaim[]>([]);
  const [memberPaymentRequests, setMemberPaymentRequests] = useState<MemberPaymentRequest[]>([]);
  const [standardAmountRules, setStandardAmountRules] = useState<StandardAmountRule[]>([]);
  const [standardAmountChangeRequests, setStandardAmountChangeRequests] = useState<StandardAmountChangeRequest[]>([]);
  const [accountSettings, setAccountSettings] = useState<AccountSettings>({
    orgName: "My Organization",
    currency: "MMK",
    openingBalanceCash: 0,
    openingBalanceBank: 0,
    asOfDate: new Date().toISOString(),
    syncServerUrl: "",
    syncEnabled: true,
    receivingBankName: "",
    receivingBankAccountNumber: "",
    receivingBankAccountName: "",
    receivingKbzPayPhone: "",
    receivingKbzPayAccountName: "",
    receivingWavePayPhone: "",
    receivingWavePayAccountName: "",
    receivingAyaPayPhone: "",
    receivingAyaPayAccountName: "",
  });
  const [loading, setLoading] = useState(true);
  const bootstrappedRef = useRef(false);

  const refreshData = useCallback(async (options?: { skipPull?: boolean }) => {
    try {
      if (!options?.skipPull) {
        await store.pullLanSnapshotToLocal();
      }
      await store.seedDefaultAdminUser();
      const [m, e, g, a, t, l, u, r, ec, mpr, sar, sacr, s] = await Promise.all([
        store.getMembers(),
        store.getEvents(),
        store.getGroups(),
        store.getAttendance(),
        store.getTransactions(),
        store.getLoans(),
        store.getUsers(),
        store.getMemberChangeRequests(),
        store.getExpenseClaims(),
        store.getMemberPaymentRequests(),
        store.getStandardAmountRules(),
        store.getStandardAmountChangeRequests(),
        store.getAccountSettings(),
      ]);
      setMembers(m);
      setEvents(e);
      setGroups(g);
      setAttendance(a);
      setTransactions(t);
      setLoans(l);
      setUsers(u);
      setMemberChangeRequests(r);
      setExpenseClaims(ec);
      setMemberPaymentRequests(mpr);
      setStandardAmountRules(sar);
      setStandardAmountChangeRequests(sacr);
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

  useEffect(() => {
    if (loading) return;
    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      void store.pushLanSnapshotFromLocal();
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    loading,
    members,
    events,
    groups,
    attendance,
    transactions,
    loans,
    users,
    memberChangeRequests,
    expenseClaims,
    memberPaymentRequests,
    standardAmountRules,
    standardAmountChangeRequests,
    accountSettings,
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      void (async () => {
        const changed = await store.pullLanSnapshotToLocal();
        if (changed) {
          await refreshData({ skipPull: true });
        }
      })();
    }, 10000);
    return () => clearInterval(timer);
  }, [refreshData]);

  // --- Actions ---
  const addMember = async (m: Omit<Member, "id">) => {
    const newMember = await store.addMember(m);
    await refreshData({ skipPull: true });
    return newMember;
  };

  const updateMember = async (id: string, u: Partial<Member>) => {
    await store.updateMember(id, u);
    await refreshData({ skipPull: true });
  };

  const deleteMember = async (id: string) => {
    await store.deleteMember(id);
    await refreshData({ skipPull: true });
  };

  const addEvent = async (e: Omit<OrgEvent, "id">) => {
    const newEvent = await store.addEvent(e);
    await refreshData({ skipPull: true });
    return newEvent;
  };

  const editEvent = async (id: string, u: Partial<OrgEvent>) => {
    await store.updateEvent(id, u);
    await refreshData({ skipPull: true });
  };

  const removeEvent = async (id: string) => {
    await store.deleteEvent(id);
    await refreshData({ skipPull: true });
  };

  const addGroup = async (g: Omit<Group, "id">) => {
    const newGroup = await store.addGroup(g);
    await refreshData({ skipPull: true });
    return newGroup;
  };

  const editGroup = async (id: string, u: Partial<Group>) => {
    await store.updateGroup(id, u);
    await refreshData({ skipPull: true });
  };

  const removeGroup = async (id: string) => {
    await store.deleteGroup(id);
    await refreshData({ skipPull: true });
  };

  const addTransaction = async (t: Omit<Transaction, "id">) => {
    const newTxn = await store.addTransaction(t);
    await refreshData({ skipPull: true });
    return newTxn;
  };

  const updateTransaction = async (id: string, u: Partial<Transaction>) => {
    await store.updateTransaction(id, u);
    await refreshData({ skipPull: true });
  };

  const removeTransaction = async (id: string) => {
    await store.deleteTransaction(id);
    await refreshData({ skipPull: true });
  };

  const addLoan = async (l: Omit<Loan, "id">) => {
    const newLoan = await store.addLoan(l);
    await refreshData({ skipPull: true });
    return newLoan;
  };

  const editLoan = async (id: string, u: Partial<Loan>) => {
    await store.updateLoan(id, u);
    await refreshData({ skipPull: true });
  };

  const removeLoan = async (id: string) => {
    await store.deleteLoan(id);
    await refreshData({ skipPull: true });
  };

  const upsertUserAccount = async (u: UserAccount) => {
    await store.upsertUserAccount(u);
    await refreshData({ skipPull: true });
  };

  const removeUserAccount = async (id: string) => {
    await store.deleteUserAccount(id);
    await refreshData({ skipPull: true });
  };

  const updateAccountSettings = async (s: AccountSettings) => {
    await store.saveAccountSettings(s);
    await refreshData({ skipPull: true });
  };

  const createMemberChangeRequest = async (input: {
    action: "create" | "update" | "delete";
    targetMemberId?: string;
    payload: {
      member?: Partial<Member>;
      note?: string;
    };
    createdByUserId: string;
    createdByMemberId?: string;
  }) => {
    const request = await store.createMemberChangeRequest(input);
    await refreshData({ skipPull: true });
    return request;
  };

  const approveMemberChangeRequest = async (requestId: string, reviewerUserId: string, reviewNote?: string) => {
    await store.approveMemberChangeRequest(requestId, reviewerUserId, reviewNote);
    await refreshData({ skipPull: true });
  };

  const rejectMemberChangeRequest = async (requestId: string, reviewerUserId: string, reviewNote?: string) => {
    await store.rejectMemberChangeRequest(requestId, reviewerUserId, reviewNote);
    await refreshData({ skipPull: true });
  };

  const withdrawMemberChangeRequest = async (requestId: string, requesterUserId: string, note?: string) => {
    await store.withdrawMemberChangeRequest(requestId, requesterUserId, note);
    await refreshData({ skipPull: true });
  };

  const assignMemberChangeRequest = async (
    requestId: string,
    assignedReviewerUserId: string | undefined,
    assignerUserId: string
  ) => {
    await store.assignMemberChangeRequest(requestId, assignedReviewerUserId, assignerUserId);
    await refreshData({ skipPull: true });
  };

  const createExpenseClaim = async (input: Omit<ExpenseClaim, "id" | "claimNumber" | "status" | "createdAt" | "updatedAt">) => {
    const claim = await store.createExpenseClaim(input);
    await refreshData({ skipPull: true });
    return claim;
  };

  const approveExpenseClaim = async (input: {
    claimId: string;
    approverUserId: string;
    approvedAmount: number;
    approvalNote?: string;
  }) => {
    await store.approveExpenseClaim(input);
    await refreshData({ skipPull: true });
  };

  const rejectExpenseClaim = async (input: {
    claimId: string;
    approverUserId: string;
    approvalNote: string;
  }) => {
    await store.rejectExpenseClaim(input);
    await refreshData({ skipPull: true });
  };

  const disburseExpenseClaim = async (input: {
    claimId: string;
    disburserUserId: string;
    method: DisbursementMethod;
    disbursementDate: string;
    voucherNumber?: string;
    note?: string;
  }) => {
    await store.disburseExpenseClaim(input);
    await refreshData({ skipPull: true });
  };

  const createMemberPaymentRequest = async (input: {
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
    feePeriodStart?: string;
    feePeriodEnd?: string;
    createdByUserId: string;
    createdByMemberId?: string;
  }) => {
    const req = await store.createMemberPaymentRequest(input);
    await refreshData({ skipPull: true });
    return req;
  };

  const approveMemberPaymentRequest = async (input: {
    requestId: string;
    reviewerUserId: string;
    reviewNote?: string;
    acceptedDate?: string;
  }) => {
    await store.approveMemberPaymentRequest(input);
    await refreshData({ skipPull: true });
  };

  const rejectMemberPaymentRequest = async (input: {
    requestId: string;
    reviewerUserId: string;
    reviewNote: string;
  }) => {
    await store.rejectMemberPaymentRequest(input);
    await refreshData({ skipPull: true });
  };

  const createStandardAmountChangeRequest = async (input: {
    ruleKey: string;
    ruleLabel: string;
    requestedAmount: number;
    reason: string;
    createdByUserId: string;
    createdByMemberId?: string;
  }) => {
    const req = await store.createStandardAmountChangeRequest(input);
    await refreshData({ skipPull: true });
    return req;
  };

  const approveStandardAmountChangeRequest = async (requestId: string, approverUserId: string, approvalNote?: string) => {
    await store.approveStandardAmountChangeRequest(requestId, approverUserId, approvalNote);
    await refreshData({ skipPull: true });
  };

  const rejectStandardAmountChangeRequest = async (requestId: string, approverUserId: string, approvalNote?: string) => {
    await store.rejectStandardAmountChangeRequest(requestId, approverUserId, approvalNote);
    await refreshData({ skipPull: true });
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
    await refreshData({ skipPull: true });
  };

  const value: DataContextValue = {
    members, events, groups, attendance, transactions, loans, users, memberChangeRequests, expenseClaims, memberPaymentRequests, standardAmountRules, standardAmountChangeRequests, accountSettings, loading,
    refreshData, addMember, updateMember, deleteMember,
    addEvent, editEvent, removeEvent,
    addGroup, editGroup, removeGroup,
    addTransaction, updateTransaction, removeTransaction,
    addLoan, editLoan, removeLoan,
    upsertUserAccount, removeUserAccount,
    updateAccountSettings,
    createMemberChangeRequest, approveMemberChangeRequest, rejectMemberChangeRequest,
    withdrawMemberChangeRequest, assignMemberChangeRequest,
    createExpenseClaim, approveExpenseClaim, rejectExpenseClaim, disburseExpenseClaim,
    createMemberPaymentRequest, approveMemberPaymentRequest, rejectMemberPaymentRequest,
    createStandardAmountChangeRequest, approveStandardAmountChangeRequest, rejectStandardAmountChangeRequest,
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


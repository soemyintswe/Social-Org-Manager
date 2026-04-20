import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
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
  AuditChangeRequest,
  AuditExecutionLog,
  AuditChangeRequestStatus,
  AuditChangeMessageType,
  AuditChangeDrafts,
  ExpenseClaim,
  MemberPaymentRequest,
  MemberPaymentRequestKind,
  MobileWalletProvider,
  StandardAmountRule,
  StandardAmountChangeRequest,
  DisbursementMethod,
  ChatThread,
  ChatMessage,
  AppNotification,
  OrgPosition,
} from "./types";
import { storageService as store } from "./storage-service";
import { computeLoanMetrics } from "./loan-metrics";
import {
  DEFAULT_CLOUD_SYNC_ENDPOINT,
  DEFAULT_CLOUD_SYNC_FOLDER_NAME,
  DEFAULT_LAN_SYNC_URL,
} from "./sync-defaults";
import { syncQueue } from "./sync-queue";
import { setActiveOrgId } from "./remote-config";
import { persistOrgStorageContext } from "./org-storage";

interface DataContextValue {
  members: Member[];
  events: OrgEvent[];
  groups: Group[];
  attendance: AttendanceRecord[];
  transactions: Transaction[];
  loans: Loan[];
  users: UserAccount[];
  memberChangeRequests: MemberChangeRequest[];
  auditChangeRequests: AuditChangeRequest[];
  auditExecutionLogs: AuditExecutionLog[];
  expenseClaims: ExpenseClaim[];
  memberPaymentRequests: MemberPaymentRequest[];
  standardAmountRules: StandardAmountRule[];
  standardAmountChangeRequests: StandardAmountChangeRequest[];
  chatThreads: ChatThread[];
  chatMessages: ChatMessage[];
  notifications: AppNotification[];
  accountSettings: AccountSettings;
  loading: boolean;
  refreshData: (options?: { skipPull?: boolean; markLocalMutation?: boolean }) => Promise<void>;
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
  createInitialOrgUserAccount: (input: {
    displayName: string;
    orgPosition: OrgPosition;
    memberId?: string;
    email?: string;
    phone?: string;
  }) => Promise<{ user: UserAccount; password: string }>;
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
  createAuditChangeRequest: (input: {
    requestKind?: "update" | "delete";
    targetType?: "transaction" | "loan";
    targetId?: string;
    transactionId?: string;
    relatedLoanId?: string;
    auditNote: string;
    createdByUserId: string;
    createdByMemberId?: string;
    createdByDisplayName?: string;
    drafts?: AuditChangeDrafts;
    tagUserIds?: string[];
  }) => Promise<AuditChangeRequest>;
  addAuditChangeRequestMessage: (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    messageType?: AuditChangeMessageType;
    note: string;
    toRole?: any;
    toUserId?: string;
    tagUserIds?: string[];
    replyToMessageId?: string;
    setSuspended?: boolean;
  }) => Promise<void>;
  changeAuditChangeRequestStatus: (input: {
    requestId: string;
    status: AuditChangeRequestStatus;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    note?: string;
    tagUserIds?: string[];
  }) => Promise<void>;
  applyAuditChangeRequestPatch: (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    patch: Record<string, any>;
    note?: string;
    tagUserIds?: string[];
  }) => Promise<void>;
  saveAuditChangeRequestDraft: (input: {
    requestId: string;
    role: "treasurer" | "auditor" | "chairperson";
    values: Record<string, any>;
    note?: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
  }) => Promise<void>;
  deleteAuditChangeRequestsForTesting: (input: {
    requestIds: string[];
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
  }) => Promise<{ removedIds: string[]; removedLogCount: number; cloudPush?: { ok: boolean; reason?: string } }>;
  forwardAuditChangeRequestToChair: (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    note: string;
    tagUserIds?: string[];
  }) => Promise<void>;
  sendAuditRequestBackToTreasurer: (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    note: string;
    tagUserIds?: string[];
  }) => Promise<void>;
  sendAuditRequestBackToAuditor: (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    note: string;
    tagUserIds?: string[];
  }) => Promise<void>;
  chairReviewAuditRequest: (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    approved: boolean;
    note: string;
    tagUserIds?: string[];
  }) => Promise<void>;
  forwardDeleteAuditRequestToChair: (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    note: string;
  }) => Promise<void>;
  chairReviewDeleteAuditRequest: (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    approved: boolean;
    note: string;
    tagUserIds?: string[];
  }) => Promise<void>;
  confirmDeleteAuditRequestExecution: (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    note?: string;
    tagUserIds?: string[];
  }) => Promise<void>;
  createExpenseClaim: (input: Omit<ExpenseClaim, "id" | "claimNumber" | "status" | "createdAt" | "updatedAt">) => Promise<ExpenseClaim>;
  approveExpenseClaim: (input: { claimId: string; approverUserId: string; approvedAmount: number; approvalNote?: string }) => Promise<void>;
  rejectExpenseClaim: (input: { claimId: string; approverUserId: string; approvalNote: string }) => Promise<void>;
  disburseExpenseClaim: (input: {
    claimId: string;
    disburserUserId: string;
    method: DisbursementMethod;
    disbursementDate: string;
    disbursementTime?: string;
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
    requestedTime?: string;
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
    acceptedTime?: string;
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
  createDirectChatThread: (input: { userAId: string; userBId: string; createdByUserId: string }) => Promise<ChatThread>;
  createGroupChatThread: (input: { name: string; participantUserIds: string[]; createdByUserId: string }) => Promise<ChatThread>;
  sendChatMessage: (input: {
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
  }) => Promise<ChatMessage>;
  updateChatMessage: (input: {
    messageId: string;
    editorUserId: string;
    text?: string;
    image?: string;
  }) => Promise<ChatMessage>;
  deleteChatMessage: (input: { messageId: string; deleterUserId: string }) => Promise<ChatMessage>;
  markChatThreadRead: (threadId: string, userId: string) => Promise<void>;
  markNotificationRead: (notificationId: string, userId: string) => Promise<void>;
  deleteNotificationsForUser: (notificationIds: string[], userId: string) => Promise<void>;
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
  const [auditChangeRequests, setAuditChangeRequests] = useState<AuditChangeRequest[]>([]);
  const [auditExecutionLogs, setAuditExecutionLogs] = useState<AuditExecutionLog[]>([]);
  const [expenseClaims, setExpenseClaims] = useState<ExpenseClaim[]>([]);
  const [memberPaymentRequests, setMemberPaymentRequests] = useState<MemberPaymentRequest[]>([]);
  const [standardAmountRules, setStandardAmountRules] = useState<StandardAmountRule[]>([]);
  const [standardAmountChangeRequests, setStandardAmountChangeRequests] = useState<StandardAmountChangeRequest[]>([]);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [accountSettings, setAccountSettings] = useState<AccountSettings>({
    orgName: "My Organization",
    currency: "MMK",
    openingBalanceCash: 0,
    openingBalanceBank: 0,
    asOfDate: new Date().toISOString(),
    syncServerUrl: DEFAULT_LAN_SYNC_URL,
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
    receivingWavePayPhone: "",
    receivingWavePayAccountName: "",
    receivingAyaPayPhone: "",
    receivingAyaPayAccountName: "",
    monthlyFeeRateRules: [],
    monthlyFeeReliefRules: [],
    monthlyFeePolicyRequests: [],
  });
  const [loading, setLoading] = useState(true);
  const bootstrappedRef = useRef(false);
  const lastLocalMutationAtRef = useRef(0);
  const pullInFlightRef = useRef(false);
  const pushInFlightRef = useRef(false);
  const pendingCloudBackfillRef = useRef(false);
  const LOCAL_PULL_GUARD_MS = 12000;
  const LOCAL_MUTATION_PUSH_WINDOW_MS = 15000;
  const AUTO_PUSH_DEBOUNCE_MS = 800;
  // Web မှာ background auto-pull ကြောင့် org data overwrite/cross-mix ဖြစ်နိုင်သောကြောင့်
  // manual sync only mode သို့ default ပြောင်းထားသည်။
  const AUTO_PULL_INTERVAL_MS = Platform.OS === "web" ? 0 : 15000;

  const pushAllSyncTargets = useCallback(async () => {
    try {
      await syncQueue.enqueue(async () => {
        const results = [];
        const cloudPush = await store.pushCloudSnapshotFromLocalDetailed();
        if (cloudPush.ok) {
          pendingCloudBackfillRef.current = false;
        }
        results.push(cloudPush);
        results.push(await store.pushLanSnapshotFromLocalDetailed());
        const hasHealthyResult = results.some((row) => {
          if (row?.ok) return true;
          const reason = String(row?.reason || "");
          return (
            reason === "disabled_or_empty_url" ||
            reason === "cloud_disabled_or_empty_endpoint"
          );
        });
        if (!hasHealthyResult) {
          throw new Error("sync_push_all_failed");
        }
      });
    } catch (error) {
      console.warn("pushAllSyncTargets failed:", error);
    }
  }, []);

  const flushPendingCloudBackfill = useCallback(async () => {
    if (!pendingCloudBackfillRef.current) return;
    try {
      const runtimeConfig = await store.getEffectiveSyncRuntimeConfig();
      if (!runtimeConfig.cloud.enabled) return;
      const result = await store.pushCloudSnapshotFromLocalDetailed();
      if (result.ok) {
        pendingCloudBackfillRef.current = false;
      }
    } catch (error) {
      console.warn("flushPendingCloudBackfill failed:", error);
    }
  }, []);

  const pullAllSyncTargets = useCallback(async (): Promise<boolean> => {
    try {
      return await syncQueue.enqueue(async () => {
        const runtimeConfig = await store.getEffectiveSyncRuntimeConfig();
        const isRenderWebHost =
          Platform.OS === "web" &&
          typeof window !== "undefined" &&
          /\.onrender\.com$/i.test(String(window.location.hostname || "").trim());
        const cloudPull =
          runtimeConfig.cloud.enabled
            ? await store.pullCloudSnapshotToLocalDetailed()
            : ({ ok: false, changed: false, reason: "cloud_disabled_or_empty_endpoint" } as const);
        const shouldUseLanFallback =
          runtimeConfig.lan.enabled &&
          (
            isRenderWebHost ||
            !runtimeConfig.cloud.enabled ||
            !cloudPull.ok ||
            [
              "cloud_snapshot_not_found",
              "snapshot_not_found",
              "snapshot_read_failed",
              "snapshot_empty",
            ].includes(String(cloudPull.reason || ""))
          );
        const lanPull =
          shouldUseLanFallback
            ? await store.pullLanSnapshotToLocalDetailed()
            : ({ ok: true, changed: false, reason: "lan_skipped_cloud_primary" } as const);
        const changedFromCloud = cloudPull.ok && cloudPull.changed === true;
        const changedFromLan = lanPull.ok && lanPull.changed === true;
        if (changedFromLan && runtimeConfig.cloud.enabled && !changedFromCloud) {
          pendingCloudBackfillRef.current = true;
        }
        if (changedFromCloud) {
          pendingCloudBackfillRef.current = false;
        }
        const hasHealthyResult =
          cloudPull.ok ||
          String(cloudPull.reason || "") === "cloud_disabled_or_empty_endpoint" ||
          lanPull.ok ||
          String(lanPull.reason || "") === "disabled_or_empty_url" ||
          String(lanPull.reason || "") === "lan_skipped_cloud_primary";
        if (!hasHealthyResult) {
          throw new Error("sync_pull_all_failed");
        }
        return changedFromLan || changedFromCloud;
      });
    } catch (error) {
      console.warn("pullAllSyncTargets failed:", error);
      return false;
    }
  }, []);

  const refreshData = useCallback(async (options?: { skipPull?: boolean; markLocalMutation?: boolean }) => {
    try {
      if (!options?.skipPull) {
        await pullAllSyncTargets();
      } else {
        if (options?.markLocalMutation !== false) {
          lastLocalMutationAtRef.current = Date.now();
        }
      }
      await store.seedDefaultAdminUser();
      const pruned = await store.pruneDeletedTargetsFromStorage();
      if (pruned) {
        lastLocalMutationAtRef.current = Date.now();
      }
        const s = await store.getAccountSettings();
        await persistOrgStorageContext({ orgId: s?.orgId, orgEmail: s?.orgEmail });
        setActiveOrgId(s?.orgId || null);
      const [m, e, g, a, t, l, u, r, acr, ael, ec, mpr, sar, sacr, cth, ctm, n] = await Promise.all([
        store.getMembers(),
        store.getEvents(),
        store.getGroups(),
        store.getAttendance(),
        store.getTransactions(),
        store.getLoans(),
        store.getUsers(),
        store.getMemberChangeRequests(),
        store.getAuditChangeRequests(),
        store.getAuditExecutionLogs(),
        store.getExpenseClaims(),
        store.getMemberPaymentRequests(),
        store.getStandardAmountRules(),
        store.getStandardAmountChangeRequests(),
        store.getChatThreads(),
        store.getChatMessages(),
        store.getNotifications(),
      ]);
      setMembers(m);
      setEvents(e);
      setGroups(g);
      setAttendance(a);
      setTransactions(t);
      setLoans(l);
      setUsers(u);
      setMemberChangeRequests(r);
      setAuditChangeRequests(acr);
      setAuditExecutionLogs(ael);
      setExpenseClaims(ec);
      setMemberPaymentRequests(mpr);
      setStandardAmountRules(sar);
      setStandardAmountChangeRequests(sacr);
      setChatThreads(cth);
      setChatMessages(ctm);
      setNotifications(n);
      if (s) setAccountSettings(s);
    } catch (error) {
      console.error("Refresh Error:", error);
    } finally {
      setLoading(false);
    }
  }, [pullAllSyncTargets]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cleanupApplied = await store.runAuditRequestCleanupOnce();
        if (!cancelled) {
          await refreshData({ skipPull: cleanupApplied, markLocalMutation: cleanupApplied });
        }
      } catch (error) {
        console.error("Audit cleanup bootstrap failed:", error);
        if (!cancelled) {
          await refreshData();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshData]);

  useEffect(() => {
    if (loading) return;
    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      return;
    }
    const elapsedSinceLocalMutation = Date.now() - lastLocalMutationAtRef.current;
    if (elapsedSinceLocalMutation > LOCAL_MUTATION_PUSH_WINDOW_MS) return;

    const timer = setTimeout(() => {
      if (pushInFlightRef.current) return;
      pushInFlightRef.current = true;
      void (async () => {
        try {
          await pushAllSyncTargets();
        } finally {
          pushInFlightRef.current = false;
        }
      })();
    }, AUTO_PUSH_DEBOUNCE_MS);
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
    auditChangeRequests,
    expenseClaims,
    memberPaymentRequests,
    standardAmountRules,
    standardAmountChangeRequests,
    chatThreads,
    chatMessages,
    notifications,
    accountSettings,
    pushAllSyncTargets,
    LOCAL_MUTATION_PUSH_WINDOW_MS,
    AUTO_PUSH_DEBOUNCE_MS,
  ]);

  const runAutoPull = useCallback(async () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const pathname = String(window.location?.pathname || "").toLowerCase();
      if (
        pathname.includes("/sign-in") ||
        pathname.includes("/admin-sign-in") ||
        pathname.includes("/org-connect") ||
        pathname.includes("/system")
      ) {
        return;
      }
    }
    if (pullInFlightRef.current) return;
    if (Platform.OS === "web") {
      try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      } catch {}
    }
    const runtimeConfig = await store.getEffectiveSyncRuntimeConfig();
    if (!(runtimeConfig.lan.enabled || runtimeConfig.cloud.enabled)) return;
    const elapsed = Date.now() - lastLocalMutationAtRef.current;
    if (elapsed < LOCAL_PULL_GUARD_MS) return;
    pullInFlightRef.current = true;
    try {
      const changed = await pullAllSyncTargets();
      if (changed) {
        await refreshData({ skipPull: true, markLocalMutation: false });
      }
      await flushPendingCloudBackfill();
    } finally {
      pullInFlightRef.current = false;
    }
  }, [pullAllSyncTargets, refreshData, flushPendingCloudBackfill, LOCAL_PULL_GUARD_MS]);

  useEffect(() => {
    if (AUTO_PULL_INTERVAL_MS <= 0) return;
    const timer = setInterval(() => {
      void runAutoPull();
    }, AUTO_PULL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [
    runAutoPull,
    AUTO_PULL_INTERVAL_MS,
  ]);

  useEffect(() => {
    if (Platform.OS === "web") {
      const handler = () => {
        void runAutoPull();
      };
      window.addEventListener("online", handler);
      return () => window.removeEventListener("online", handler);
    }
    const handler = (state: AppStateStatus) => {
      if (state === "active") {
        void runAutoPull();
      }
    };
    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  }, [runAutoPull]);

  // --- Actions ---
  const addMember = async (m: Omit<Member, "id">) => {
    const newMember = await store.addMember(m);
    await refreshData({ skipPull: true });
    void pushAllSyncTargets();
    return newMember;
  };

  const updateMember = async (id: string, u: Partial<Member>) => {
    await store.updateMember(id, u);
    await refreshData({ skipPull: true });
    void pushAllSyncTargets();
  };

  const deleteMember = async (id: string) => {
    await store.deleteMember(id);
    await refreshData({ skipPull: true });
    void pushAllSyncTargets();
  };

  const addEvent = async (e: Omit<OrgEvent, "id">) => {
    lastLocalMutationAtRef.current = Date.now();
    const newEvent = await store.addEvent(e);
    await refreshData({ skipPull: true });
    void pushAllSyncTargets();
    return newEvent;
  };

  const editEvent = async (id: string, u: Partial<OrgEvent>) => {
    lastLocalMutationAtRef.current = Date.now();
    await store.updateEvent(id, u);
    await refreshData({ skipPull: true });
    void pushAllSyncTargets();
  };

  const removeEvent = async (id: string) => {
    lastLocalMutationAtRef.current = Date.now();
    await store.deleteEvent(id);
    await refreshData({ skipPull: true });
    void pushAllSyncTargets();
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

  const createInitialOrgUserAccount = async (input: {
    displayName: string;
    orgPosition: OrgPosition;
    memberId?: string;
    email?: string;
    phone?: string;
  }) => {
    const payload = await store.createInitialOrgUserAccount(input);
    await refreshData({ skipPull: true });
    return payload;
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

  const createAuditChangeRequest = async (input: {
    requestKind?: "update" | "delete";
    targetType?: "transaction" | "loan";
    targetId?: string;
    transactionId?: string;
    relatedLoanId?: string;
    auditNote: string;
    createdByUserId: string;
    createdByMemberId?: string;
    createdByDisplayName?: string;
    drafts?: AuditChangeDrafts;
    tagUserIds?: string[];
  }) => {
    const req = await store.createAuditChangeRequest(input);
    await refreshData({ skipPull: true });
    return req;
  };

  const addAuditChangeRequestMessage = async (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    messageType?: AuditChangeMessageType;
    note: string;
    toRole?: any;
    toUserId?: string;
    tagUserIds?: string[];
    replyToMessageId?: string;
    setSuspended?: boolean;
  }) => {
    await store.addAuditChangeRequestMessage(input);
    await refreshData({ skipPull: true });
  };

  const changeAuditChangeRequestStatus = async (input: {
    requestId: string;
    status: AuditChangeRequestStatus;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    note?: string;
    tagUserIds?: string[];
  }) => {
    await store.changeAuditChangeRequestStatus(input);
    await refreshData({ skipPull: true });
  };

  const applyAuditChangeRequestPatch = async (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    patch: Record<string, any>;
    note?: string;
    tagUserIds?: string[];
  }) => {
    await store.applyAuditChangeRequestPatch(input);
    await refreshData({ skipPull: true });
  };

  const saveAuditChangeRequestDraft = async (input: {
    requestId: string;
    role: "treasurer" | "auditor" | "chairperson";
    values: Record<string, any>;
    note?: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
  }) => {
    await store.saveAuditChangeRequestDraft(input);
    await refreshData({ skipPull: true });
  };

  const deleteAuditChangeRequestsForTesting = async (input: {
    requestIds: string[];
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
  }) => {
    const result = await store.deleteAuditChangeRequestsForTesting(input);
    lastLocalMutationAtRef.current = Date.now();
    const [acr, ael, n, t] = await Promise.all([
      store.getAuditChangeRequests(),
      store.getAuditExecutionLogs(),
      store.getNotifications(),
      store.getTransactions(),
    ]);
    setAuditChangeRequests(acr);
    setAuditExecutionLogs(ael);
    setNotifications(n);
    setTransactions(t);
    let cloudPushResult: { ok: boolean; reason?: string } | undefined;
    try {
      const cloudPush = await store.pushCloudSnapshotFromLocalDetailed();
      cloudPushResult = { ok: cloudPush.ok, reason: cloudPush.reason };
      if (!cloudPush.ok) pendingCloudBackfillRef.current = true;
    } catch (error: any) {
      cloudPushResult = { ok: false, reason: String(error?.message || "cloud_push_failed") };
      pendingCloudBackfillRef.current = true;
    }
    return { ...result, cloudPush: cloudPushResult };
  };

  const forwardAuditChangeRequestToChair = async (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    note: string;
    tagUserIds?: string[];
  }) => {
    await store.forwardAuditChangeRequestToChair(input);
    await refreshData({ skipPull: true });
  };

  const sendAuditRequestBackToTreasurer = async (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    note: string;
    tagUserIds?: string[];
  }) => {
    await store.sendAuditRequestBackToTreasurer(input);
    await refreshData({ skipPull: true });
  };

  const sendAuditRequestBackToAuditor = async (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    note: string;
    tagUserIds?: string[];
  }) => {
    await store.sendAuditRequestBackToAuditor(input);
    await refreshData({ skipPull: true });
  };

  const chairReviewAuditRequest = async (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    approved: boolean;
    note: string;
    tagUserIds?: string[];
  }) => {
    await store.chairReviewAuditRequest(input);
    await refreshData({ skipPull: true });
  };

  const forwardDeleteAuditRequestToChair = async (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    note: string;
  }) => {
    await store.forwardDeleteAuditRequestToChair(input);
    await refreshData({ skipPull: true });
  };

  const chairReviewDeleteAuditRequest = async (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    approved: boolean;
    note: string;
    tagUserIds?: string[];
  }) => {
    await store.chairReviewDeleteAuditRequest(input);
    await refreshData({ skipPull: true });
  };

  const confirmDeleteAuditRequestExecution = async (input: {
    requestId: string;
    byUserId: string;
    byMemberId?: string;
    byDisplayName?: string;
    note?: string;
    tagUserIds?: string[];
  }) => {
    await store.confirmDeleteAuditRequestExecution(input);
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
    disbursementTime?: string;
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
    requestedTime?: string;
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
    acceptedTime?: string;
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

  const createDirectChatThread = async (input: { userAId: string; userBId: string; createdByUserId: string }) => {
    lastLocalMutationAtRef.current = Date.now();
    const thread = await store.createDirectChatThread(input);
    await refreshData({ skipPull: true });
    void pushAllSyncTargets();
    return thread;
  };

  const createGroupChatThread = async (input: { name: string; participantUserIds: string[]; createdByUserId: string }) => {
    lastLocalMutationAtRef.current = Date.now();
    const thread = await store.createGroupChatThread(input);
    await refreshData({ skipPull: true });
    void pushAllSyncTargets();
    return thread;
  };

  const sendChatMessage = async (input: {
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
  }) => {
    lastLocalMutationAtRef.current = Date.now();
    const message = await store.sendChatMessage(input);
    await refreshData({ skipPull: true });
    // Chat UX: push immediately so other devices can see the message with low delay.
    await pushAllSyncTargets();
    return message;
  };

  const updateChatMessage = async (input: {
    messageId: string;
    editorUserId: string;
    text?: string;
    image?: string;
  }) => {
    lastLocalMutationAtRef.current = Date.now();
    const message = await store.updateChatMessage(input);
    await refreshData({ skipPull: true });
    await pushAllSyncTargets();
    return message;
  };

  const deleteChatMessage = async (input: { messageId: string; deleterUserId: string }) => {
    lastLocalMutationAtRef.current = Date.now();
    const message = await store.deleteChatMessage(input);
    await refreshData({ skipPull: true });
    await pushAllSyncTargets();
    return message;
  };

  const markChatThreadRead = useCallback(async (threadId: string, userId: string) => {
    lastLocalMutationAtRef.current = Date.now();
    await store.markChatThreadRead(threadId, userId);
    await refreshData({ skipPull: true });
    void pushAllSyncTargets();
  }, [pushAllSyncTargets, refreshData]);

  const markNotificationRead = useCallback(async (notificationId: string, userId: string) => {
    lastLocalMutationAtRef.current = Date.now();
    await store.markNotificationRead(notificationId, userId);
    await refreshData({ skipPull: true });
    void pushAllSyncTargets();
  }, [pushAllSyncTargets, refreshData]);

  const deleteNotificationsForUser = useCallback(async (notificationIds: string[], userId: string) => {
    lastLocalMutationAtRef.current = Date.now();
    await store.deleteNotificationsForUser({ notificationIds, userId });
    await refreshData({ skipPull: true });
    void pushAllSyncTargets();
  }, [pushAllSyncTargets, refreshData]);

  // --- Calculations ---
  const getLoanOutstanding = (loanId: string) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return 0;
    return computeLoanMetrics(loan as any, transactions as any).principalOutstanding;
  };

  const getLoanInterestDue = (loanId: string) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return 0;
    return computeLoanMetrics(loan as any, transactions as any).interestOutstanding;
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

  // --- Attendance ---
  const getEventAttendance = (eventId: string) => {
    return attendance.filter((a: AttendanceRecord) => a.eventId === eventId);
  };

  const markAttendance = async (eventId: string, memberId: string, status: "present" | "absent") => {
    await store.saveAttendance(eventId, memberId, status);
    await refreshData({ skipPull: true });
  };

  const value: DataContextValue = {
    members, events, groups, attendance, transactions, loans, users, memberChangeRequests, auditChangeRequests, auditExecutionLogs, expenseClaims, memberPaymentRequests, standardAmountRules, standardAmountChangeRequests, chatThreads, chatMessages, notifications, accountSettings, loading,
    refreshData, addMember, updateMember, deleteMember,
    addEvent, editEvent, removeEvent,
    addGroup, editGroup, removeGroup,
    addTransaction, updateTransaction, removeTransaction,
    addLoan, editLoan, removeLoan,
    upsertUserAccount, createInitialOrgUserAccount, removeUserAccount,
    updateAccountSettings,
    createMemberChangeRequest, approveMemberChangeRequest, rejectMemberChangeRequest,
    withdrawMemberChangeRequest, assignMemberChangeRequest,
    createAuditChangeRequest, addAuditChangeRequestMessage, changeAuditChangeRequestStatus, applyAuditChangeRequestPatch,
    saveAuditChangeRequestDraft,
    deleteAuditChangeRequestsForTesting,
    forwardAuditChangeRequestToChair, sendAuditRequestBackToTreasurer, sendAuditRequestBackToAuditor, chairReviewAuditRequest,
    forwardDeleteAuditRequestToChair, chairReviewDeleteAuditRequest, confirmDeleteAuditRequestExecution,
    createExpenseClaim, approveExpenseClaim, rejectExpenseClaim, disburseExpenseClaim,
    createMemberPaymentRequest, approveMemberPaymentRequest, rejectMemberPaymentRequest,
    createStandardAmountChangeRequest, approveStandardAmountChangeRequest, rejectStandardAmountChangeRequest,
    createDirectChatThread, createGroupChatThread, sendChatMessage, updateChatMessage, deleteChatMessage, markChatThreadRead, markNotificationRead, deleteNotificationsForUser,
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


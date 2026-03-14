import React, { useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import AccessDenied from "@/components/AccessDenied";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import { normalizeOrgPosition, type AuditChangeRequestStatus, type AuditChangeWorkflowStage } from "@/lib/types";

const STATUS_ORDER: AuditChangeRequestStatus[] = ["pending", "suspended", "approved", "rejected", "cancelled"];
type DraftRoleKey = "treasurer" | "auditor" | "chairperson";
type AuditFieldType = "text" | "date" | "amount" | "member" | "payment" | "readonly" | "recordType" | "category";

type CategoryFilterOption = { id: string; label: string };

const INCOME_CATEGORY_FILTERS: CategoryFilterOption[] = [
  { id: "member_fees", label: "လစဉ်ကြေးရငွေ" },
  { id: "donations", label: "အလှူငွေရရှိ" },
  { id: "bank_interest", label: "ဘဏ်တိုးရငွေ" },
  { id: "other_income", label: "အခြားရငွေ" },
  { id: "loan_repayment", label: "ချေးငွေပြန်ဆပ်ရရှိငွေ" },
  { id: "interest_income", label: "အတိုးရငွေ" },
];
const EXPENSE_CATEGORY_FILTERS: CategoryFilterOption[] = [
  { id: "health_support", label: "ကျန်းမာရေးထောက်ပံ့ငွေ" },
  { id: "education_support", label: "ပညာရေးထောက်ပံ့ငွေ" },
  { id: "funeral_support", label: "နာရေးကူညီငွေ" },
  { id: "loan_disbursement", label: "ချေးငွေထုတ်ပေးငွေ" },
  { id: "bank_fees", label: "ဘဏ်စရိတ်ပေးငွေ" },
  { id: "general_expense", label: "အထွေထွေအသုံးစရိတ်" },
  { id: "other_expense", label: "အခြားအသုံးစရိတ်" },
  { id: "entertainment", label: "ဧည့်ခံစရိတ်" },
  { id: "donation_expense", label: "လှူဒါန်းငွေ" },
];
const TRANSFER_CATEGORY_FILTERS: CategoryFilterOption[] = [
  { id: "bank_deposit", label: "ဘဏ်သို့ ငွေသွင်းခြင်း (Deposit)" },
  { id: "bank_withdraw", label: "ဘဏ်မှ ငွေထုတ်ခြင်း (Withdraw)" },
  { id: "bank_interest", label: "ဘဏ်တိုးရငွေ (Bank Interest)" },
];

const DRAFT_ROLE_LABELS: Record<DraftRoleKey, string> = {
  treasurer: "ဘဏ္ဍာရေးမှူး",
  auditor: "စာရင်းစစ်",
  chairperson: "ဥက္ကဌ",
};

function statusLabel(status: AuditChangeRequestStatus): string {
  if (status === "pending") return "စောင့်ဆိုင်း";
  if (status === "approved") return "လက်ခံပြီး";
  if (status === "rejected") return "ခွင့်မပြု";
  if (status === "cancelled") return "ရုပ်သိမ်း";
  if (status === "suspended") return "ဆိုင်းငံ့";
  return status;
}

function statusColor(status: AuditChangeRequestStatus): string {
  if (status === "pending") return "#F59E0B";
  if (status === "approved") return "#10B981";
  if (status === "rejected") return "#EF4444";
  if (status === "cancelled") return "#64748B";
  if (status === "suspended") return "#0EA5E9";
  return Colors.light.textSecondary;
}

function stageLabel(stage: AuditChangeWorkflowStage | undefined): string {
  if (stage === "auditor_review") return "Audit စိစစ်ဆဲ";
  if (stage === "chair_approval") return "ဥက္ကဌ အတည်ပြုဆဲ";
  if (stage === "treasurer_execution") return "ဘဏ္ဍာရေးမှူး ဆောင်ရွက်ရန်";
  if (stage === "completed") return "ပြီးစီး";
  return "-";
}

function fmtDateTime(value: unknown): string {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function summarizeRevisionPatch(rev: any): string {
  if (!rev || !rev.patch || typeof rev.patch !== "object") return "ပြင်ဆင်ချက်မရှိ";
  const patch = rev.patch || {};
  const action = String(patch.__action || "");
  if (action === "delete") {
    const linkedCount = Array.isArray(patch.__removedLinkedTransactionIds)
      ? patch.__removedLinkedTransactionIds.length
      : 0;
    return linkedCount > 0
      ? `ပယ်ဖျက်ပြီး (linked transactions ${linkedCount} ခု)`
      : "ပယ်ဖျက်ပြီး";
  }
  const keys = Object.keys(patch).filter((key) => !String(key || "").startsWith("__"));
  if (keys.length === 0) return "ပြင်ဆင်ချက်မရှိ";
  return `ပြင်ဆင်: ${keys.join(", ")}`;
}

export default function AuditChangeRequestsScreen() {
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const insets = useSafeAreaInsets();
  const {
    auditChangeRequests,
    auditExecutionLogs,
    transactions,
    loans,
    members,
    users,
    createAuditChangeRequest,
    addAuditChangeRequestMessage,
    changeAuditChangeRequestStatus,
    applyAuditChangeRequestPatch,
    saveAuditChangeRequestDraft,
    deleteAuditChangeRequestsForTesting,
    forwardAuditChangeRequestToChair,
    sendAuditRequestBackToTreasurer,
    sendAuditRequestBackToAuditor,
    chairReviewAuditRequest,
    confirmDeleteAuditRequestExecution,
  } = useData() as any;
  const { currentUser, can } = useAuth();

  const [statusFilter, setStatusFilter] = useState<"all" | AuditChangeRequestStatus>("all");
  const [selectedRequestId, setSelectedRequestId] = useState<string>("");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [messageNote, setMessageNote] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [forwardToUserId, setForwardToUserId] = useState("");
  const [tagUserIds, setTagUserIds] = useState<string[]>([]);
  const [showForwardPicker, setShowForwardPicker] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [showCreateDeleteModal, setShowCreateDeleteModal] = useState(false);
  const [createDeleteTargetType, setCreateDeleteTargetType] = useState<"transaction" | "loan">("transaction");
  const [createDeleteTargetId, setCreateDeleteTargetId] = useState("");
  const [createDeleteSearch, setCreateDeleteSearch] = useState("");
  const [createDeleteNote, setCreateDeleteNote] = useState("");
  const [showCreateTargetPicker, setShowCreateTargetPicker] = useState(false);
  const [visibleExecutionLogCount, setVisibleExecutionLogCount] = useState(20);
  const [testSelectMode, setTestSelectMode] = useState(false);
  const [selectedTestRequestIds, setSelectedTestRequestIds] = useState<string[]>([]);
  const [testDeleteBusy, setTestDeleteBusy] = useState(false);
  const [draftEdits, setDraftEdits] = useState<Record<DraftRoleKey, Record<string, any>>>({
    treasurer: {},
    auditor: {},
    chairperson: {},
  });
  const [activeDatePicker, setActiveDatePicker] = useState<{ role: DraftRoleKey; fieldKey: string } | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberPickerRole, setMemberPickerRole] = useState<DraftRoleKey | null>(null);
  const [memberPickerField, setMemberPickerField] = useState<string>("");
  const [showOptionPicker, setShowOptionPicker] = useState(false);
  const [optionPickerRole, setOptionPickerRole] = useState<DraftRoleKey | null>(null);
  const [optionPickerField, setOptionPickerField] = useState<string>("");
  const [optionPickerTitle, setOptionPickerTitle] = useState("");
  const [optionPickerItems, setOptionPickerItems] = useState<CategoryFilterOption[]>([]);
  const draftSaveTimers = React.useRef<Record<string, any>>({});

  const myRole = normalizeOrgPosition(currentUser?.orgPosition || "member");
  const isTreasurer = myRole === "treasurer";
  const isAuditor = can("finance.audit_flag") || myRole === "auditor";
  const isChair = myRole === "chairperson";
  const allowTestCleanup = isTreasurer;

  const canView =
    can("finance.view_summary") ||
    can("finance.view_detail") ||
    can("finance.view_all") ||
    can("finance.audit_flag") ||
    isAuditor ||
    isTreasurer ||
    isChair;

  const allRequests = useMemo(() => {
    const list = Array.isArray(auditChangeRequests) ? [...auditChangeRequests] : [];
    return list.sort((a: any, b: any) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
  }, [auditChangeRequests]);

  const visibleRequests = useMemo(() => {
    const base = canView ? allRequests : allRequests.filter((item: any) => item.createdByUserId === currentUser?.id);
    if (statusFilter === "all") return base;
    return base.filter((item: any) => item.status === statusFilter);
  }, [allRequests, canView, currentUser?.id, statusFilter]);
  const selectedTestRequestSet = useMemo(
    () => new Set((selectedTestRequestIds || []).map((id) => String(id || "")).filter(Boolean)),
    [selectedTestRequestIds]
  );

  const counts = useMemo(() => {
    const base = canView ? allRequests : allRequests.filter((item: any) => item.createdByUserId === currentUser?.id);
    const pending = base.filter((item: any) => item.status === "pending").length;
    const approved = base.filter((item: any) => item.status === "approved").length;
    const rejected = base.filter((item: any) => item.status === "rejected").length;
    const cancelled = base.filter((item: any) => item.status === "cancelled").length;
    const suspended = base.filter((item: any) => item.status === "suspended").length;
    return { total: base.length, pending, approved, rejected, cancelled, suspended };
  }, [allRequests, canView, currentUser?.id]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    (Array.isArray(members) ? members : []).forEach((m: any) => {
      const id = String(m?.id || "").trim();
      if (id) map.set(id, String(m?.name || id));
    });
    return map;
  }, [members]);

  const createTargetOptions = useMemo(() => {
    const search = createDeleteSearch.trim().toLowerCase();
    if (createDeleteTargetType === "loan") {
      const rows = (Array.isArray(loans) ? loans : [])
        .map((loan: any) => {
          const id = String(loan?.id || "").trim();
          const memberId = String(loan?.memberId || "").trim();
          const memberName = memberNameById.get(memberId) || memberId || "-";
          const amount = Number(loan?.principal || loan?.amount || 0);
          const issueDate = String(loan?.issueDate || "-");
          const label = `${id} • ${memberName} • ${amount.toLocaleString()} KS • ${issueDate}`;
          return { id, label };
        })
        .filter((row) => row.id);
      if (!search) return rows;
      return rows.filter((row) => row.label.toLowerCase().includes(search) || row.id.toLowerCase().includes(search));
    }

    const rows = (Array.isArray(transactions) ? transactions : [])
      .map((txn: any) => {
        const id = String(txn?.id || "").trim();
        const memberId = String(txn?.memberId || "").trim();
        const memberName = memberNameById.get(memberId) || String(txn?.payerPayee || memberId || "-");
        const amount = Number(txn?.amount || 0);
        const date = String(txn?.date || "-");
        const category = String(txn?.categoryLabel || txn?.category || "-");
        const label = `${id} • ${memberName} • ${category} • ${amount.toLocaleString()} KS • ${date}`;
        return { id, label };
      })
      .filter((row) => row.id);
    if (!search) return rows;
    return rows.filter((row) => row.label.toLowerCase().includes(search) || row.id.toLowerCase().includes(search));
  }, [createDeleteSearch, createDeleteTargetType, loans, memberNameById, transactions]);

  const selectedCreateTarget = useMemo(
    () => createTargetOptions.find((row) => String(row.id || "") === String(createDeleteTargetId || "")) || null,
    [createTargetOptions, createDeleteTargetId]
  );

  const updateAppliedRows = useMemo(
    () =>
      allRequests.filter(
        (row: any) =>
          String(row?.requestKind || "") === "update" &&
          Array.isArray(row?.revisions) &&
          row.revisions.length > 0 &&
          String(row?.status || "") === "approved"
      ),
    [allRequests]
  );

  const deleteExecutedRows = useMemo(
    () =>
      allRequests.filter((row: any) => {
        if (String(row?.requestKind || "") !== "delete") return false;
        if (String(row?.status || "") !== "approved" || String(row?.workflowStage || "") !== "completed") return false;
        return Array.isArray(row?.revisions) && row.revisions.some((rev: any) => String(rev?.patch?.__action || "") === "delete");
      }),
    [allRequests]
  );

  const visibleExecutionLogs = useMemo(() => {
    const list = Array.isArray(auditExecutionLogs) ? [...auditExecutionLogs] : [];
    const statusWeight = (status?: AuditChangeRequestStatus) => {
      if (status === "pending") return 0;
      if (status === "suspended") return 1;
      if (status === "approved") return 2;
      if (status === "rejected") return 3;
      if (status === "cancelled") return 4;
      return 5;
    };
    list.sort((a: any, b: any) => {
      const wa = statusWeight(a?.statusAtExecution as AuditChangeRequestStatus);
      const wb = statusWeight(b?.statusAtExecution as AuditChangeRequestStatus);
      if (wa !== wb) return wa - wb;
      return new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime();
    });
    if (canView) return list;
    const myId = String(currentUser?.id || "");
    return list.filter((row: any) => String(row?.byUserId || "") === myId);
  }, [auditExecutionLogs, canView, currentUser?.id]);

  const pagedExecutionLogs = useMemo(
    () => visibleExecutionLogs.slice(0, visibleExecutionLogCount),
    [visibleExecutionLogs, visibleExecutionLogCount]
  );
  const hasMoreExecutionLogs = pagedExecutionLogs.length < visibleExecutionLogs.length;

  const consistencyReport = useMemo(() => {
    const issues: string[] = [];
    const txById = new Map<string, any>((Array.isArray(transactions) ? transactions : []).map((row: any) => [String(row?.id || ""), row]));
    const loansById = new Map<string, any>((Array.isArray(loans) ? loans : []).map((row: any) => [String(row?.id || ""), row]));

    (visibleExecutionLogs || []).forEach((log: any) => {
      const action = String(log?.action || "");
      if (action === "update_applied") {
        const txnId = String(log?.transactionId || log?.targetId || "");
        const txn = txById.get(txnId);
        if (!txn) {
          issues.push(`${log?.requestNumber || log?.requestId}: update target transaction not found (${txnId})`);
          return;
        }
        const patch = log?.patch && typeof log.patch === "object" ? log.patch : {};
        const after = log?.after && typeof log.after === "object" ? log.after : {};
        Object.keys(patch)
          .filter((key) => !String(key || "").startsWith("__"))
          .forEach((key) => {
            const expected = (after as any)?.[key];
            const current = (txn as any)?.[key];
            const bothNumeric = Number.isFinite(Number(expected)) && Number.isFinite(Number(current));
            const equal = bothNumeric ? Number(expected) === Number(current) : String(expected ?? "") === String(current ?? "");
            if (!equal) {
              issues.push(`${log?.requestNumber || log?.requestId}: field mismatch (${key})`);
            }
          });
        return;
      }

      if (action === "delete_executed") {
        const targetType = String(log?.targetType || "transaction");
        const targetId = String(log?.targetId || log?.transactionId || "");
        if (targetType === "loan") {
          if (loansById.has(targetId)) {
            issues.push(`${log?.requestNumber || log?.requestId}: deleted loan still exists (${targetId})`);
          }
          const linkedIds = Array.isArray(log?.affectedTransactionIds) ? log.affectedTransactionIds : [];
          linkedIds.forEach((linkedId: string) => {
            if (txById.has(String(linkedId || ""))) {
              issues.push(`${log?.requestNumber || log?.requestId}: linked txn still exists (${linkedId})`);
            }
          });
          return;
        }
        const txnId = String(log?.transactionId || targetId);
        if (txById.has(txnId)) {
          issues.push(`${log?.requestNumber || log?.requestId}: deleted transaction still exists (${txnId})`);
        }
      }
    });

    return {
      checked: visibleExecutionLogs.length,
      issueCount: issues.length,
      issues,
    };
  }, [visibleExecutionLogs, transactions, loans]);

  React.useEffect(() => {
    const targetId = String(requestId || "").trim();
    if (!targetId) return;
    const found = visibleRequests.find((item: any) => String(item?.id || "") === targetId);
    if (!found) return;
    setSelectedRequestId(targetId);
    setShowDetailModal(true);
  }, [requestId, visibleRequests]);

  const selectedRequest = useMemo(
    () => allRequests.find((item: any) => String(item.id || "") === String(selectedRequestId || "")) || null,
    [allRequests, selectedRequestId]
  );
  const requestKind = String(selectedRequest?.requestKind || "update");
  const isDeleteRequest = requestKind === "delete";
  const selectedDrafts = useMemo(
    () => ({
      treasurer: selectedRequest?.drafts?.treasurer?.values || {},
      auditor: selectedRequest?.drafts?.auditor?.values || {},
      chairperson: selectedRequest?.drafts?.chairperson?.values || {},
    }),
    [selectedRequest?.drafts]
  );

  React.useEffect(() => {
    if (!selectedRequest) return;
    setDraftEdits({
      treasurer: { ...(selectedDrafts.treasurer || {}) },
      auditor: { ...(selectedDrafts.auditor || {}) },
      chairperson: { ...(selectedDrafts.chairperson || {}) },
    });
  }, [selectedRequest?.id, selectedDrafts.treasurer, selectedDrafts.auditor, selectedDrafts.chairperson]);

  const selectedTxn = useMemo(
    () => transactions.find((row: any) => String(row?.id || "") === String(selectedRequest?.transactionId || "")) || null,
    [transactions, selectedRequest?.transactionId]
  );
  const selectedLoan = useMemo(
    () => loans.find((row: any) => String(row?.id || "") === String(selectedRequest?.targetId || selectedRequest?.relatedLoanId || "")) || null,
    [loans, selectedRequest?.targetId, selectedRequest?.relatedLoanId]
  );

  const selectedMemberName = useMemo(() => {
    const memberId = String((selectedTxn as any)?.memberId || (selectedLoan as any)?.memberId || "");
    if (!memberId) return "-";
    const member = members.find((m: any) => String(m?.id || "") === memberId);
    return member?.name || memberId;
  }, [members, selectedTxn, selectedLoan]);
  const latestRevision = useMemo(() => {
    if (!selectedRequest || !Array.isArray(selectedRequest.revisions) || selectedRequest.revisions.length === 0) return null;
    return selectedRequest.revisions[selectedRequest.revisions.length - 1];
  }, [selectedRequest]);
  const latestMessageNote = useMemo(() => {
    if (!selectedRequest || !Array.isArray(selectedRequest.messages) || selectedRequest.messages.length === 0) return "";
    const msg = selectedRequest.messages[selectedRequest.messages.length - 1] as any;
    return String(msg?.note || "").trim();
  }, [selectedRequest]);
  const compareOriginal = useMemo(() => {
    if (latestRevision?.before) return latestRevision.before;
    return selectedRequest?.targetType === "loan" ? selectedLoan : selectedTxn;
  }, [latestRevision, selectedLoan, selectedTxn, selectedRequest?.targetType]);
  const activeUsers = useMemo(
    () => (Array.isArray(users) ? users : []).filter((row: any) => row?.isActive !== false),
    [users]
  );
  const visibleForwardUsers = useMemo(
    () => activeUsers.filter((row: any) => String(row?.id || "") !== String(currentUser?.id || "")),
    [activeUsers, currentUser?.id]
  );
  const selectedForwardUser = useMemo(
    () => visibleForwardUsers.find((row: any) => String(row?.id || "") === String(forwardToUserId || "")) || null,
    [visibleForwardUsers, forwardToUserId]
  );
  const selectedTagUsers = useMemo(() => {
    const set = new Set((tagUserIds || []).map((v) => String(v || "").trim()).filter(Boolean));
    return activeUsers.filter((row: any) => set.has(String(row?.id || "")));
  }, [activeUsers, tagUserIds]);
  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    activeUsers.forEach((row: any) => {
      const id = String(row?.id || "").trim();
      if (!id) return;
      map.set(id, String(row?.displayName || id));
    });
    return map;
  }, [activeUsers]);

  const getOrgRoleLabel = (value?: string): string => {
    const role = normalizeOrgPosition(value || "member");
    if (role === "patron") return "နာယက";
    if (role === "chairperson") return "ဥက္ကဌ";
    if (role === "vice_chairperson") return "ဒုတိယဥက္ကဌ";
    if (role === "secretary") return "အတွင်းရေးမှူး";
    if (role === "joint_secretary") return "တွဲဘက်အတွင်းရေးမှူး";
    if (role === "treasurer") return "ဘဏ္ဍာရေးမှူး";
    if (role === "auditor") return "စာရင်းစစ်";
    if (role === "committee_member") return "ကော်မတီဝင်";
    if (role === "applicant") return "လျှောက်ထားသူ";
    return "အသင်းဝင်";
  };

  const getUserLabel = (user: any): string => {
    const name = String(user?.displayName || user?.id || "-");
    const memberId = String(user?.memberId || "").trim();
    const roleLabel = getOrgRoleLabel(String(user?.orgPosition || ""));
    return `${name}${memberId ? ` (${memberId})` : ""} • ${roleLabel}`;
  };

  const toYmd = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const ymdToDate = (value?: string): Date => {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (!match) return new Date();
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  };

  const txnFieldDefs: { key: string; label: string; type: AuditFieldType }[] = [
    { key: "type", label: "စာရင်းအမျိုးအစား", type: "recordType" },
    { key: "category", label: "အမျိုးအစား", type: "category" },
    { key: "description", label: "အကြောင်းအရာ", type: "text" },
    { key: "memberId", label: "အသင်းဝင်", type: "member" },
    { key: "payerPayee", label: "ပေးသွင်းသူ", type: "member" },
    { key: "date", label: "ရက်စွဲ", type: "date" },
    { key: "amount", label: "ပမာဏ", type: "amount" },
    { key: "paymentMethod", label: "ငွေပေးချေမှု", type: "payment" },
    { key: "receiptNumber", label: "ပြေစာ", type: "text" },
    { key: "feePeriodStart", label: "လစဉ်ကြေးကာလ (From)", type: "date" },
    { key: "feePeriodEnd", label: "လစဉ်ကြေးကာလ (To)", type: "date" },
    { key: "notes", label: "မှတ်ချက်", type: "text" },
    { key: "relatedIds", label: "Related IDs", type: "readonly" },
  ];

  const loanFieldDefs: { key: string; label: string; type: AuditFieldType }[] = [
    { key: "memberId", label: "အသင်းဝင်", type: "member" },
    { key: "principal", label: "အရင်း", type: "amount" },
    { key: "issueDate", label: "ထုတ်ပေးရက်", type: "date" },
    { key: "dueDate", label: "သတ်မှတ်ရက်", type: "date" },
    { key: "interestRate", label: "အတိုးနှုန်း (%)", type: "amount" },
    { key: "notes", label: "မှတ်ချက်", type: "text" },
    { key: "relatedIds", label: "Related IDs", type: "readonly" },
  ];

  const fieldDefs = selectedRequest?.targetType === "loan" ? loanFieldDefs : txnFieldDefs;

  const canEditTreasurerDraft =
    isTreasurer &&
    !!selectedRequest &&
    (!selectedRequest.workflowStage ||
      selectedRequest.workflowStage === "treasurer_execution" ||
      selectedRequest.workflowStage === "pending");
  const canEditAuditorDraft =
    isAuditor &&
    !!selectedRequest &&
    (!selectedRequest.workflowStage ||
      selectedRequest.workflowStage === "auditor_review" ||
      selectedRequest.workflowStage === "pending");
  const canEditChairDraft =
    isChair &&
    !!selectedRequest &&
    (!selectedRequest.workflowStage ||
      selectedRequest.workflowStage === "chair_approval" ||
      selectedRequest.workflowStage === "pending");

  const memberOptions = useMemo(
    () =>
      (Array.isArray(members) ? members : [])
        .map((row: any) => ({
          id: String(row?.id || "").trim(),
          name: String(row?.name || row?.fullName || row?.displayName || "").trim(),
        }))
        .filter((row: any) => row.id),
    [members]
  );

  const categoryLabelById = useMemo(() => {
    const map = new Map<string, string>();
    [...INCOME_CATEGORY_FILTERS, ...EXPENSE_CATEGORY_FILTERS, ...TRANSFER_CATEGORY_FILTERS].forEach((opt) => {
      map.set(String(opt.id || "").toLowerCase(), opt.label);
    });
    return map;
  }, []);

  const getCategoryOptionsForType = (recordType: string) => {
    if (recordType === "expense") return EXPENSE_CATEGORY_FILTERS;
    if (recordType === "transfer") return TRANSFER_CATEGORY_FILTERS;
    return INCOME_CATEGORY_FILTERS;
  };

  const getEffectiveRecordType = (role: DraftRoleKey) => {
    const raw = String(getDraftValue(role, "type") || "").toLowerCase() || String(getOriginalValue("type") || "").toLowerCase();
    return raw === "expense" || raw === "transfer" ? raw : "income";
  };

  const formatFieldValue = (value: any, field: { key: string; type: AuditFieldType }) => {
    if (value == null || value === "") return "-";
    if (field.type === "recordType") {
      const v = String(value || "").toLowerCase();
      if (v === "expense") return "အသုံးစာရင်း";
      if (v === "transfer") return "ဘဏ်သွင်း/ဘဏ်ထုတ်";
      return "ရငွေစာရင်း";
    }
    if (field.type === "payment") {
      const v = String(value || "").toLowerCase();
      return v === "bank" ? "ဘဏ် (Bank)" : "ငွေသား (Cash)";
    }
    if (field.type === "category") {
      const v = String(value || "").toLowerCase();
      const label = categoryLabelById.get(v) || String((compareOriginal as any)?.categoryLabel || "");
      return label || String(value || "-");
    }
    if (field.type === "amount") {
      const n = Number(value);
      return Number.isFinite(n) ? `${n.toLocaleString()} KS` : String(value);
    }
    if (field.type === "member") {
      const id = String(value || "");
      const name = memberNameById.get(id);
      if (field.key === "payerPayee") return String(value || "-");
      return name ? `${name} (${id})` : id || "-";
    }
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const getOriginalValue = (fieldKey: string) => {
    if (fieldKey === "relatedIds") {
      const base = compareOriginal as any;
      const related =
        base?.relatedIds ||
        base?.linkedTransactionIds ||
        (selectedRequest?.relatedLoanId ? [selectedRequest.relatedLoanId] : []);
      return related || [];
    }
    if (fieldKey === "category") {
      const base = compareOriginal as any;
      return base?.category || base?.categoryLabel || "";
    }
    return (compareOriginal as any)?.[fieldKey];
  };

  const getDraftValue = (role: DraftRoleKey, fieldKey: string) => {
    const roleDraft = draftEdits[role] || {};
    if (fieldKey in roleDraft) return roleDraft[fieldKey];
    return getOriginalValue(fieldKey);
  };

  const scheduleDraftSave = (role: DraftRoleKey, values: Record<string, any>) => {
    if (!selectedRequest || !currentUser?.id) return;
    const key = `${role}`;
    if (draftSaveTimers.current[key]) {
      clearTimeout(draftSaveTimers.current[key]);
    }
    draftSaveTimers.current[key] = setTimeout(() => {
      saveAuditChangeRequestDraft({
        requestId: selectedRequest.id,
        role,
        values,
        byUserId: currentUser.id,
        byMemberId: currentUser.memberId,
        byDisplayName: currentUser.displayName,
      }).catch(() => null);
    }, 450);
  };

  const updateDraftValue = (role: DraftRoleKey, fieldKey: string, value: any, label?: string) => {
    setDraftEdits((prev) => {
      const nextRole = { ...(prev[role] || {}), [fieldKey]: value };
      if (fieldKey === "type") {
        const nextType = String(value || "").toLowerCase();
        const options = getCategoryOptionsForType(nextType);
        if (!options.find((opt) => opt.id === String(nextRole.category || ""))) {
          nextRole.category = options[0]?.id || "";
          nextRole.categoryLabel = options[0]?.label || "";
        }
      }
      if (fieldKey === "category") {
        nextRole.categoryLabel = label || nextRole.categoryLabel;
      }
      scheduleDraftSave(role, nextRole);
      return { ...prev, [role]: nextRole };
    });
  };

  const openDatePicker = (role: DraftRoleKey, fieldKey: string) => {
    setActiveDatePicker({ role, fieldKey });
  };

  const handleDatePicked = (event: any, selected?: Date) => {
    if (!activeDatePicker) return;
    if (event?.type === "dismissed") {
      setActiveDatePicker(null);
      return;
    }
    const next = selected || new Date();
    updateDraftValue(activeDatePicker.role, activeDatePicker.fieldKey, toYmd(next));
    setActiveDatePicker(null);
  };

  const openMemberSelect = (role: DraftRoleKey, fieldKey: string) => {
    setMemberPickerRole(role);
    setMemberPickerField(fieldKey);
    setShowMemberPicker(true);
  };

  const openOptionPicker = (
    role: DraftRoleKey,
    fieldKey: string,
    title: string,
    items: CategoryFilterOption[]
  ) => {
    setOptionPickerRole(role);
    setOptionPickerField(fieldKey);
    setOptionPickerTitle(title);
    setOptionPickerItems(items);
    setShowOptionPicker(true);
  };

  const notePreview = latestMessageNote || selectedRequest?.auditNote || "-";

  const renderDraftCell = (role: DraftRoleKey, field: { key: string; label: string; type: AuditFieldType }) => {
    const canEdit =
      role === "treasurer"
        ? canEditTreasurerDraft
        : role === "auditor"
          ? canEditAuditorDraft
          : canEditChairDraft;
    const rawValue = getDraftValue(role, field.key) ?? getOriginalValue(field.key);
    if (field.type === "readonly") {
      return <Text style={styles.auditTableValue}>{formatFieldValue(rawValue, field)}</Text>;
    }
    if (!canEdit) {
      return <Text style={styles.auditTableValue}>{formatFieldValue(rawValue, field)}</Text>;
    }

    if (field.type === "member") {
      return (
        <Pressable style={styles.auditTablePicker} onPress={() => openMemberSelect(role, field.key)}>
          <Text style={styles.auditTablePickerText}>{formatFieldValue(rawValue, field)}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.light.textSecondary} />
        </Pressable>
      );
    }
    if (field.type === "recordType") {
      return (
        <Pressable
          style={styles.auditTablePicker}
          onPress={() =>
            openOptionPicker(role, field.key, "စာရင်းအမျိုးအစား", [
              { id: "income", label: "ရငွေစာရင်း" },
              { id: "expense", label: "အသုံးစာရင်း" },
              { id: "transfer", label: "ဘဏ်သွင်း/ဘဏ်ထုတ်" },
            ])
          }
        >
          <Text style={styles.auditTablePickerText}>{formatFieldValue(rawValue, field)}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.light.textSecondary} />
        </Pressable>
      );
    }
    if (field.type === "payment") {
      return (
        <Pressable
          style={styles.auditTablePicker}
          onPress={() =>
            openOptionPicker(role, field.key, "ငွေပေးချေမှု ပုံစံ", [
              { id: "cash", label: "ငွေသား (Cash)" },
              { id: "bank", label: "ဘဏ် (Bank)" },
            ])
          }
        >
          <Text style={styles.auditTablePickerText}>{formatFieldValue(rawValue, field)}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.light.textSecondary} />
        </Pressable>
      );
    }
    if (field.type === "category") {
      const recordType = getEffectiveRecordType(role);
      return (
        <Pressable
          style={styles.auditTablePicker}
          onPress={() =>
            openOptionPicker(role, field.key, "အမျိုးအစားရွေးချယ်ရန်", getCategoryOptionsForType(recordType))
          }
        >
          <Text style={styles.auditTablePickerText}>{formatFieldValue(rawValue, field)}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.light.textSecondary} />
        </Pressable>
      );
    }
    if (field.type === "date") {
      return (
        <Pressable style={styles.auditTablePicker} onPress={() => openDatePicker(role, field.key)}>
          <Text style={styles.auditTablePickerText}>{String(rawValue || "") || "-"}</Text>
          <Ionicons name="calendar-outline" size={14} color={Colors.light.textSecondary} />
        </Pressable>
      );
    }
    return (
      <TextInput
        style={styles.auditTableInput}
        value={rawValue == null ? "" : String(rawValue)}
        onChangeText={(text) => updateDraftValue(role, field.key, text)}
        keyboardType={field.type === "amount" ? "decimal-pad" : "default"}
        placeholder={field.type === "amount" ? "0" : "-"}
      />
    );
  };

  const openDetail = (requestId: string) => {
    setSelectedRequestId(requestId);
    setMessageNote("");
    setDecisionNote("");
    setForwardToUserId("");
    setTagUserIds([]);
    setShowDetailModal(true);
  };

  const openCreateDeleteRequestModal = () => {
    setCreateDeleteTargetType("transaction");
    setCreateDeleteTargetId("");
    setCreateDeleteSearch("");
    setCreateDeleteNote("");
    setShowCreateDeleteModal(true);
  };

  const submitCreateDeleteRequest = async () => {
    if (!currentUser?.id) return;
    const note = createDeleteNote.trim();
    if (!note) return Alert.alert("လိုအပ်ချက်", "Delete Request မှတ်ချက်ဖြည့်ပါ။");
    const targetId = String(createDeleteTargetId || "").trim();
    if (!targetId) return Alert.alert("လိုအပ်ချက်", "ဖျက်သိမ်းလိုသော စာရင်းကို ရွေးချယ်ပါ။");

    try {
      if (createDeleteTargetType === "loan") {
        await createAuditChangeRequest({
          requestKind: "delete",
          targetType: "loan",
          targetId,
          relatedLoanId: targetId,
          auditNote: note,
          createdByUserId: currentUser.id,
          createdByMemberId: currentUser.memberId,
          createdByDisplayName: currentUser.displayName,
        });
      } else {
        await createAuditChangeRequest({
          requestKind: "delete",
          targetType: "transaction",
          targetId,
          transactionId: targetId,
          auditNote: note,
          createdByUserId: currentUser.id,
          createdByMemberId: currentUser.memberId,
          createdByDisplayName: currentUser.displayName,
        });
      }
      setShowCreateDeleteModal(false);
      setCreateDeleteTargetId("");
      setCreateDeleteSearch("");
      setCreateDeleteNote("");
      Alert.alert("အောင်မြင်ပါသည်", "Delete Request ကို Audit workflow သို့ တင်သွင်းပြီးပါပြီ။");
    } catch (error: any) {
      const msg = String(error?.message || "");
      if (msg.includes("request_conflict_in_progress")) {
        Alert.alert("တားဆီးထားပါသည်", "ဤစာရင်းအတွက် Request တစ်ခု ဆောင်ရွက်နေပြီးဖြစ်ပါသည်။");
        return;
      }
      Alert.alert("အမှား", "Delete Request တင်သွင်းရာတွင် အဆင်မပြေပါ။");
    }
  };

  const resolveReplyTarget = () => {
    if (!selectedRequest || !currentUser?.id) return { toUserId: "", replyToMessageId: "" };
    const me = String(currentUser.id || "").trim();
    const messages = Array.isArray(selectedRequest.messages) ? selectedRequest.messages : [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i] as any;
      const fromUserId = String(msg?.byUserId || "").trim();
      if (!fromUserId || fromUserId === me) continue;
      return {
        toUserId: fromUserId,
        replyToMessageId: String(msg?.id || "").trim(),
      };
    }
    const creatorId = String(selectedRequest.createdByUserId || "").trim();
    if (creatorId && creatorId !== me) return { toUserId: creatorId, replyToMessageId: "" };
    return { toUserId: "", replyToMessageId: "" };
  };

  const toggleTagUser = (userId: string) => {
    const id = String(userId || "").trim();
    if (!id) return;
    setTagUserIds((prev) => {
      if (prev.includes(id)) return prev.filter((row) => row !== id);
      return [...prev, id];
    });
  };

  const submitMessage = async (isForward = false) => {
    if (!selectedRequest || !currentUser?.id) return;
    const note = messageNote.trim();
    if (!note) return Alert.alert("လိုအပ်ချက်", "Reply/Forward note ဖြည့်ရန်လိုပါသည်။");
    let toUserId = "";
    let replyToMessageId = "";
    let toRole: any = undefined;

    if (isForward) {
      toUserId = String(forwardToUserId || "").trim();
      if (!toUserId) {
        return Alert.alert("လိုအပ်ချက်", "Forward လက်ခံမည့် User ကို ရွေးချယ်ပါ။");
      }
      const targetUser = activeUsers.find((row: any) => String(row?.id || "") === toUserId);
      toRole = targetUser?.orgPosition ? normalizeOrgPosition(String(targetUser.orgPosition)) : undefined;
    } else {
      const target = resolveReplyTarget();
      toUserId = String(target.toUserId || "").trim();
      replyToMessageId = String(target.replyToMessageId || "").trim();
      if (!toUserId) {
        return Alert.alert("မတွေ့ပါ", "Reply ပို့ရန် မူရင်းလက်ခံသူကို မသတ်မှတ်နိုင်ပါ။");
      }
    }

    const tagTargets = (tagUserIds || []).filter((id) => String(id || "").trim() && String(id || "").trim() !== toUserId);

    await addAuditChangeRequestMessage({
      requestId: selectedRequest.id,
      byUserId: currentUser.id,
      byMemberId: currentUser.memberId,
      byDisplayName: currentUser.displayName,
      messageType: isForward ? "forward" : "reply",
      note,
      toRole,
      toUserId,
      tagUserIds: tagTargets,
      replyToMessageId: replyToMessageId || undefined,
      setSuspended: false,
    });
    setMessageNote("");
    setForwardToUserId("");
    setTagUserIds([]);
  };

  const handleAuditRequestError = (error: any) => {
    const reason = String(error?.message || error || "").trim();
    if (!reason) {
      Alert.alert("မအောင်မြင်ပါ", "လုပ်ဆောင်ရာတွင် အမှားရှိပါသည်။");
      return;
    }
    if (reason.includes("duplicate_receipt")) {
      return Alert.alert(
        "ပြေစာအမှတ် ထပ်နေပါသည်",
        "ပြေစာအမှတ် ထပ်နေပါသည်။ မတူညီသော ပြေစာအမှတ် သို့မဟုတ် A/B ကဲ့သို့ suffix ထည့်ပြီး ပြန်လည်ကြိုးစားပါ။"
      );
    }
    if (reason.includes("request_finalized_locked")) {
      return Alert.alert("တင်လို့မရပါ", "ဤစာရင်းတွင် ဥက္ကဌဆုံးဖြတ်ပြီးဖြစ်သောကြောင့် Request ထပ်မလုပ်နိုင်ပါ။");
    }
    if (reason.includes("request_not_ready_for_execution")) {
      return Alert.alert("လုပ်ဆောင်လို့မရပါ", "လုပ်ငန်းစဉ်အဆင့် မပြည့်သေးပါ။");
    }
    if (reason.includes("invalid_stage")) {
      return Alert.alert("လုပ်ဆောင်လို့မရပါ", "လုပ်ငန်းစဉ်အဆင့် မမှန်ပါ။");
    }
    if (reason.includes("note_required")) {
      return Alert.alert("လိုအပ်ချက်", "မှတ်ချက်ဖြည့်ရန်လိုပါသည်။");
    }
    Alert.alert("မအောင်မြင်ပါ", reason);
  };

  const runAuditAction = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error: any) {
      handleAuditRequestError(error);
    }
  };

  const submitStatus = async (status: AuditChangeRequestStatus) => {
    if (!selectedRequest || !currentUser?.id) return;
    const note = decisionNote.trim();
    const tagTargets = (tagUserIds || []).map((id) => String(id || "").trim()).filter(Boolean);
    await runAuditAction(async () => {
      await changeAuditChangeRequestStatus({
        requestId: selectedRequest.id,
        status,
        byUserId: currentUser.id,
        byMemberId: currentUser.memberId,
        byDisplayName: currentUser.displayName,
        note,
        tagUserIds: tagTargets,
      });
      setDecisionNote("");
      setTagUserIds([]);
      if (["approved", "rejected", "cancelled"].includes(status)) {
        setShowDetailModal(false);
      }
    });
  };

  const submitForwardToChair = async () => {
    if (!selectedRequest || !currentUser?.id) return;
    const note = messageNote.trim() || decisionNote.trim();
    if (!note) {
      return Alert.alert("လိုအပ်ချက်", "Chair ထံတင်ပြရန် မှတ်ချက်ဖြည့်ရန်လိုပါသည်။");
    }
    const tagTargets = (tagUserIds || []).map((id) => String(id || "").trim()).filter(Boolean);
    await runAuditAction(async () => {
      await forwardAuditChangeRequestToChair({
        requestId: selectedRequest.id,
        byUserId: currentUser.id,
        byMemberId: currentUser.memberId,
        byDisplayName: currentUser.displayName,
        note,
        tagUserIds: tagTargets,
      });
      setMessageNote("");
      setDecisionNote("");
      setTagUserIds([]);
    });
  };

  const submitChairDecision = async (approved: boolean) => {
    if (!selectedRequest || !currentUser?.id) return;
    const note = decisionNote.trim() || messageNote.trim();
    if (!note) {
      return Alert.alert("လိုအပ်ချက်", "ဆုံးဖြတ်ချက်မှတ်ချက်ဖြည့်ရန်လိုပါသည်။");
    }
    await chairReviewAuditRequest({
      requestId: selectedRequest.id,
      byUserId: currentUser.id,
      byMemberId: currentUser.memberId,
      byDisplayName: currentUser.displayName,
      approved,
      note,
    });
    setDecisionNote("");
    setMessageNote("");
    if (!approved) setShowDetailModal(false);
  };

  const submitReturnToTreasurer = async () => {
    if (!selectedRequest || !currentUser?.id) return;
    const note = messageNote.trim() || decisionNote.trim();
    if (!note) {
      return Alert.alert("လိုအပ်ချက်", "Treasurer ထံပြန်ပေးပို့ရန် မှတ်ချက်ဖြည့်ရန်လိုပါသည်။");
    }
    const tagTargets = (tagUserIds || []).map((id) => String(id || "").trim()).filter(Boolean);
    await runAuditAction(async () => {
      await sendAuditRequestBackToTreasurer({
        requestId: selectedRequest.id,
        byUserId: currentUser.id,
        byMemberId: currentUser.memberId,
        byDisplayName: currentUser.displayName,
        note,
        tagUserIds: tagTargets,
      });
      setDecisionNote("");
      setMessageNote("");
      setTagUserIds([]);
    });
  };

  const submitReturnToAuditor = async () => {
    if (!selectedRequest || !currentUser?.id) return;
    const note = messageNote.trim() || decisionNote.trim();
    if (!note) {
      return Alert.alert("လိုအပ်ချက်", "Audit ထံပြန်ပေးပို့ရန် မှတ်ချက်ဖြည့်ရန်လိုပါသည်။");
    }
    const tagTargets = (tagUserIds || []).map((id) => String(id || "").trim()).filter(Boolean);
    await runAuditAction(async () => {
      await sendAuditRequestBackToAuditor({
        requestId: selectedRequest.id,
        byUserId: currentUser.id,
        byMemberId: currentUser.memberId,
        byDisplayName: currentUser.displayName,
        note,
        tagUserIds: tagTargets,
      });
      setDecisionNote("");
      setMessageNote("");
      setTagUserIds([]);
    });
  };

  const submitConfirmDeleteExecution = async () => {
    if (!selectedRequest || !currentUser?.id) return;
    const note = decisionNote.trim() || "ဥက္ကဌအတည်ပြုချက်အရ စာရင်းကို ပယ်ဖျက်ပြီးပါပြီ။";
    const tagTargets = (tagUserIds || []).map((id) => String(id || "").trim()).filter(Boolean);
    await runAuditAction(async () => {
      await confirmDeleteAuditRequestExecution({
        requestId: selectedRequest.id,
        byUserId: currentUser.id,
        byMemberId: currentUser.memberId,
        byDisplayName: currentUser.displayName,
        note,
        tagUserIds: tagTargets,
      });
      setDecisionNote("");
      setTagUserIds([]);
      setShowDetailModal(false);
      Alert.alert("ပြီးပါပြီ", "Delete ကိုအတည်ပြုပယ်ဖျက်ပြီးပါပြီ။");
    });
  };

  const submitNoChangeApproval = async () => {
    if (!selectedRequest || !selectedTxn || !currentUser?.id) return;
    const note = decisionNote.trim() || "ပြင်ဆင်စရာမရှိ၍ အတည်ပြုပါသည်။";
    const tagTargets = (tagUserIds || []).map((id) => String(id || "").trim()).filter(Boolean);
    await runAuditAction(async () => {
      await applyAuditChangeRequestPatch({
        requestId: selectedRequest.id,
        byUserId: currentUser.id,
        byMemberId: currentUser.memberId,
        byDisplayName: currentUser.displayName,
        patch: {},
        note,
        tagUserIds: tagTargets,
      });
      setDecisionNote("");
      setTagUserIds([]);
      setShowDetailModal(false);
      Alert.alert("ပြီးပါပြီ", "ပြင်ဆင်စရာမရှိသဖြင့် အတည်ပြုပြီးပါပြီ။");
    });
  };
  const buildPatchFromDrafts = () => {
    const chairDraft = selectedRequest?.drafts?.chairperson?.values || {};
    const auditorDraft = selectedRequest?.drafts?.auditor?.values || {};
    const treasurerDraft = selectedRequest?.drafts?.treasurer?.values || {};
    const sourceDraft = Object.keys(chairDraft).length
      ? chairDraft
      : Object.keys(auditorDraft).length
        ? auditorDraft
        : treasurerDraft;

    const patch: Record<string, any> = {};
    fieldDefs.forEach((field) => {
      if (field.type === "readonly") return;
      const originalValue = getOriginalValue(field.key);
      const nextValue = field.key in sourceDraft ? (sourceDraft as any)[field.key] : originalValue;
      if (field.type === "amount") {
        const n1 = Number(originalValue);
        const n2 = Number(nextValue);
        if (Number.isFinite(n2) && n2 !== n1) patch[field.key] = n2;
        return;
      }
      const a = String(originalValue ?? "");
      const b = String(nextValue ?? "");
      if (a !== b) patch[field.key] = b;
    });
    return patch;
  };

  const submitApplyDraftPatch = async () => {
    if (!selectedRequest || !selectedTxn || !currentUser?.id) return;
    const patch = buildPatchFromDrafts();
    if (Object.keys(patch).length === 0) {
      return Alert.alert("အချက်အလက်မပြောင်းပါ", "ပြင်ဆင်ချက်မရှိသေးပါ။");
    }
    const tagTargets = (tagUserIds || []).map((id) => String(id || "").trim()).filter(Boolean);
    await runAuditAction(async () => {
      await applyAuditChangeRequestPatch({
        requestId: selectedRequest.id,
        byUserId: currentUser.id,
        byMemberId: currentUser.memberId,
        byDisplayName: currentUser.displayName,
        patch,
        note: decisionNote.trim() || "Audit flag ကိုပြင်ဆင်ပြီး အတည်ပြုပါသည်။",
        tagUserIds: tagTargets,
      });
      setShowDetailModal(false);
      setDecisionNote("");
      setTagUserIds([]);
      Alert.alert("ပြီးပါပြီ", "စာရင်းပြင်ဆင်ချက်ကို အတည်ပြုပြီးပါပြီ။");
    });
  };

  const selectedStage = String(selectedRequest?.workflowStage || "") as AuditChangeWorkflowStage;
  const requestStatus = String(selectedRequest?.status || "pending") as AuditChangeRequestStatus;

  const canAuditorHandle = !!selectedRequest && isAuditor && selectedStage === "auditor_review";
  const canChairHandle = !!selectedRequest && isChair && selectedStage === "chair_approval";
  const canTreasurerReview =
    !!selectedRequest && isTreasurer && selectedStage === "treasurer_execution" && requestStatus !== "approved";
  const canTreasurerExecute =
    !!selectedRequest && isTreasurer && selectedStage === "treasurer_execution" && requestStatus === "approved";

  const canOwnerCancel =
    !!selectedRequest &&
    ["pending", "suspended"].includes(requestStatus) &&
    String(selectedRequest.createdByUserId || "") === String(currentUser?.id || "");
  const canReopen =
    !!selectedRequest &&
    ["rejected", "cancelled"].includes(requestStatus) &&
    (isAuditor || isTreasurer || isChair);

  const canAuditorForward = canAuditorHandle;
  const canChairApprove = canChairHandle;
  const canTreasurerReturnToAuditor = canTreasurerReview;
  const canTreasurerConfirmDelete = isDeleteRequest && canTreasurerExecute;
  const canTreasurerApplyUpdate = !isDeleteRequest && canTreasurerExecute;

  const toggleTestRequestSelection = (requestId: string) => {
    const id = String(requestId || "").trim();
    if (!id) return;
    setSelectedTestRequestIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  };

  const clearTestSelections = () => setSelectedTestRequestIds([]);

  const selectAllVisibleRequests = () => {
    const ids = visibleRequests.map((row: any) => String(row?.id || "")).filter(Boolean);
    setSelectedTestRequestIds(ids);
  };

  const exitTestSelectMode = () => {
    setTestSelectMode(false);
    clearTestSelections();
  };

  const performTestCleanup = async (useAll: boolean) => {
    setTestDeleteBusy(true);
    try {
      const result = await deleteAuditChangeRequestsForTesting({
        requestIds: useAll ? [] : selectedTestRequestIds,
        byUserId: String(currentUser?.id || ""),
        byMemberId: currentUser?.memberId,
        byDisplayName: currentUser?.displayName,
      });
      exitTestSelectMode();
      const cloudWarning = result.cloudPush && !result.cloudPush.ok
        ? `\nCloud Sync မလုပ်နိုင်ပါ။ (${result.cloudPush.reason || "unknown"})\n`
        : "";
      Alert.alert("ပြီးစီးပါပြီ", `ဖျက်ပြီး Request အရေအတွက်: ${result.removedIds.length}${cloudWarning}`);
    } catch (e: any) {
      Alert.alert("မအောင်မြင်ပါ", String(e?.message || e || "Unknown error"));
    } finally {
      setTestDeleteBusy(false);
    }
  };

  const submitTestCleanup = async () => {
    if (!allowTestCleanup || testDeleteBusy) return;
    const totalCount = allRequests.length;
    const useAll = testSelectMode || selectedTestRequestIds.length === 0;
    const deleteCount = useAll ? totalCount : selectedTestRequestIds.length;
    if (deleteCount === 0) {
      Alert.alert("မတွေ့ပါ", "ဖျက်ရန် Request မရှိပါ။");
      return;
    }
    if (Platform.OS === "web") {
      const ok = typeof window !== "undefined"
        ? window.confirm(
            useAll
              ? `လက်ရှိ Request အားလုံး (${deleteCount}) ကို ဖျက်ပါမည်။ ဆက်လုပ်မလား?`
              : `ရွေးထားသော ${deleteCount} ခုကို ဖျက်ပါမည်။ ဆက်လုပ်မလား?`
          )
        : true;
      if (!ok) return;
      await performTestCleanup(useAll);
      return;
    }
    Alert.alert(
      "Test Records ဖျက်မည်",
      useAll ? `လက်ရှိ Request အားလုံး (${deleteCount}) ကို ဖျက်ပါမည်။ ဆက်လုပ်မလား?` : `ရွေးထားသော ${deleteCount} ခုကို ဖျက်ပါမည်။ ဆက်လုပ်မလား?`,
      [
      { text: "မလုပ်တော့ပါ", style: "cancel" },
      {
        text: "ဖျက်မည်",
        style: "destructive",
        onPress: () => void performTestCleanup(useAll),
      },
      ]
    );
  };

  if (!canView) {
    return <AccessDenied />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Audit Change Requests</Text>
          <Ionicons name="flag-outline" size={20} color={Colors.light.textSecondary} />
        </View>

        {isAuditor ? (
          <View style={styles.inlineActionWrap}>
            <Pressable style={styles.inlineCreateDeleteBtn} onPress={openCreateDeleteRequestModal}>
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.inlineCreateDeleteBtnText}>Audit မှ Delete Request အသစ်တင်မည်</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.countCard}>
          <Text style={styles.countLine}>Total: {counts.total}</Text>
          <Text style={styles.countLine}>Pending: {counts.pending}</Text>
          <Text style={styles.countLine}>Approved: {counts.approved}</Text>
          <Text style={styles.countLine}>Rejected: {counts.rejected}</Text>
          <Text style={styles.countLine}>Cancelled: {counts.cancelled}</Text>
          <Text style={styles.countLine}>Suspended: {counts.suspended}</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Pressable style={[styles.filterChip, statusFilter === "all" && styles.filterChipActive]} onPress={() => setStatusFilter("all")}>
            <Text style={[styles.filterChipText, statusFilter === "all" && styles.filterChipTextActive]}>အားလုံး</Text>
          </Pressable>
          {STATUS_ORDER.map((status) => (
            <Pressable
              key={status}
              style={[styles.filterChip, statusFilter === status && styles.filterChipActive]}
              onPress={() => setStatusFilter(status)}
            >
              <Text style={[styles.filterChipText, statusFilter === status && styles.filterChipTextActive]}>{statusLabel(status)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {allowTestCleanup ? (
          <View style={styles.testCleanupRow}>
            <Pressable
              style={[styles.testCleanupBtn, testSelectMode && styles.testCleanupBtnActive]}
              onPress={() => {
                if (testSelectMode) {
                  exitTestSelectMode();
                } else {
                  setTestSelectMode(true);
                }
              }}
            >
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.testCleanupBtnText}>{testSelectMode ? "Test Cleanup (On)" : "Test Cleanup"}</Text>
            </Pressable>

            {testSelectMode ? (
              <View style={styles.testCleanupActions}>
                <Pressable style={styles.testCleanupMiniBtn} onPress={selectAllVisibleRequests}>
                  <Text style={styles.testCleanupMiniText}>Select All</Text>
                </Pressable>
                <Pressable style={styles.testCleanupMiniBtn} onPress={clearTestSelections}>
                  <Text style={styles.testCleanupMiniText}>Clear</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.testCleanupMiniBtn,
                    styles.testCleanupDeleteBtn,
                    ((selectedTestRequestIds.length === 0 && allRequests.length === 0) || testDeleteBusy) && { opacity: 0.5 },
                  ]}
                  onPress={() => void submitTestCleanup()}
                  disabled={(selectedTestRequestIds.length === 0 && allRequests.length === 0) || testDeleteBusy}
                >
                  {testDeleteBusy ? (
                    <View style={styles.testCleanupBusyRow}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={[styles.testCleanupMiniText, { color: "#fff" }]}>ဖျက်နေပါတယ်...</Text>
                    </View>
                  ) : (
                    <Text style={[styles.testCleanupMiniText, { color: "#fff" }]}>
                      Delete {selectedTestRequestIds.length ? "Selected" : "All"} ({selectedTestRequestIds.length || allRequests.length})
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <Text style={styles.testCleanupHint}>စမ်းသပ်မှတ်တမ်းများကို Select လုပ်ပြီးဖျက်ရန်သုံးပါ။</Text>
            )}
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>ပြင်ဆင်ပြီး ငွေစာရင်းအသေးစိတ် ({updateAppliedRows.length})</Text>
          {updateAppliedRows.length === 0 ? (
            <Text style={styles.sectionEmptyText}>ပြင်ဆင်ပြီးမှတ်တမ်း မရှိသေးပါ။</Text>
          ) : (
            updateAppliedRows.slice(0, 12).map((row: any) => {
              const latestRev = Array.isArray(row?.revisions) ? row.revisions[row.revisions.length - 1] : null;
              const changedFields = latestRev ? Object.keys(latestRev.patch || {}).filter((key) => !key.startsWith("__")) : [];
              const beforeAmount = Number(latestRev?.before?.amount || 0);
              const afterAmount = Number(latestRev?.after?.amount || 0);
              const memberId = String(latestRev?.after?.memberId || latestRev?.before?.memberId || "").trim();
              const memberName = memberNameById.get(memberId) || memberId || "-";
              return (
                <Pressable key={`upd-${row.id}`} style={styles.auditHistoryCard} onPress={() => openDetail(String(row.id || ""))}>
                  <Text style={styles.auditHistoryTitle}>{row.requestNumber || row.id}</Text>
                  <Text style={styles.auditHistoryMeta}>အသင်းဝင်: {memberName}</Text>
                  <Text style={styles.auditHistoryMeta}>Target: {String(row.targetType || "transaction")} / {String(row.targetId || row.transactionId || "-")}</Text>
                  <Text style={styles.auditHistoryMeta}>ပြင်ဆင်ကွက်: {changedFields.length > 0 ? changedFields.join(", ") : "-"}</Text>
                  <Text style={styles.auditHistoryMeta}>ပမာဏ: {beforeAmount.toLocaleString()} KS → {afterAmount.toLocaleString()} KS</Text>
                  <Text style={styles.auditHistoryMeta}>ပြင်ဆင်ချိန်: {fmtDateTime(latestRev?.createdAt || row.reviewedAt || row.updatedAt)}</Text>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>ပယ်ဖျက်ပြီး ငွေစာရင်းအသေးစိတ် ({deleteExecutedRows.length})</Text>
          {deleteExecutedRows.length === 0 ? (
            <Text style={styles.sectionEmptyText}>ပယ်ဖျက်ပြီးမှတ်တမ်း မရှိသေးပါ။</Text>
          ) : (
            deleteExecutedRows.slice(0, 12).map((row: any) => {
              const latestRev = Array.isArray(row?.revisions) ? row.revisions[row.revisions.length - 1] : null;
              const memberId = String(latestRev?.before?.memberId || "").trim();
              const memberName = memberNameById.get(memberId) || memberId || "-";
              const deletedAmount = Number(
                latestRev?.before?.amount ?? latestRev?.before?.principal ?? latestRev?.before?.__linkedTransactions?.[0]?.amount ?? 0
              );
              const linkedCount = Number(latestRev?.patch?.__removedLinkedTransactionIds?.length || 0);
              return (
                <Pressable key={`del-${row.id}`} style={styles.auditHistoryCard} onPress={() => openDetail(String(row.id || ""))}>
                  <Text style={styles.auditHistoryTitle}>{row.requestNumber || row.id}</Text>
                  <Text style={styles.auditHistoryMeta}>အသင်းဝင်: {memberName}</Text>
                  <Text style={styles.auditHistoryMeta}>Target: {String(row.targetType || "-")} / {String(row.targetId || "-")}</Text>
                  <Text style={styles.auditHistoryMeta}>ပယ်ဖျက်ပမာဏ: {deletedAmount.toLocaleString()} KS</Text>
                  <Text style={styles.auditHistoryMeta}>Linked ဖျက်သိမ်းစာရင်း: {linkedCount.toLocaleString()} ခု</Text>
                  <Text style={styles.auditHistoryMeta}>ပယ်ဖျက်ချိန်: {fmtDateTime(latestRev?.createdAt || row.updatedAt)}</Text>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Execution Log သီးခြားမှတ်တမ်း ({visibleExecutionLogs.length})</Text>
          <Text style={[styles.sectionEmptyText, { color: consistencyReport.issueCount > 0 ? "#B91C1C" : "#0F766E" }]}>
            Consistency Check: {consistencyReport.checked} ခုစစ်ပြီး • Issue {consistencyReport.issueCount} ခု
          </Text>
          {consistencyReport.issueCount > 0 ? (
            <View style={[styles.auditHistoryCard, { borderLeftColor: "#B91C1C" }]}>
              {consistencyReport.issues.slice(0, 5).map((issue: string, idx: number) => (
                <Text key={`issue-${idx}`} style={[styles.auditHistoryMeta, { color: "#B91C1C" }]}>- {issue}</Text>
              ))}
            </View>
          ) : null}
          {pagedExecutionLogs.length === 0 ? (
            <Text style={styles.sectionEmptyText}>Execution log မရှိသေးပါ။</Text>
          ) : (
            pagedExecutionLogs.map((log: any) => {
              const requestNo = String(log?.requestNumber || log?.requestId || "-");
              const action = String(log?.action || "");
              const actionLabel = action === "delete_executed" ? "ပယ်ဖျက်ပြီး" : "ပြင်ဆင်ပြီး";
              const amountBefore = Number(log?.before?.amount ?? log?.before?.principal ?? 0);
              const amountAfter = Number(log?.after?.amount ?? 0);
              return (
                <Pressable key={`exec-log-${String(log?.id || requestNo)}`} style={styles.auditHistoryCard} onPress={() => openDetail(String(log?.requestId || ""))}>
                  <Text style={styles.auditHistoryTitle}>{requestNo} • {actionLabel}</Text>
                  <Text style={styles.auditHistoryMeta}>Target: {String(log?.targetType || "-")} / {String(log?.targetId || "-")}</Text>
                  {action === "update_applied" ? (
                    <Text style={styles.auditHistoryMeta}>ပမာဏ: {amountBefore.toLocaleString()} KS → {amountAfter.toLocaleString()} KS</Text>
                  ) : (
                    <Text style={styles.auditHistoryMeta}>ပယ်ဖျက်ပမာဏ: {amountBefore.toLocaleString()} KS</Text>
                  )}
                  <Text style={styles.auditHistoryMeta}>ဆောင်ရွက်သူ: {String(log?.byDisplayName || log?.byUserId || "-")}</Text>
                  <Text style={styles.auditHistoryMeta}>ဆောင်ရွက်ချိန်: {fmtDateTime(log?.createdAt)}</Text>
                </Pressable>
              );
            })
          )}
          {hasMoreExecutionLogs ? (
            <Pressable style={styles.loadMoreBtn} onPress={() => setVisibleExecutionLogCount((prev) => prev + 20)}>
              <Text style={styles.loadMoreBtnText}>နောက်ထပ် မှတ်တမ်းများကြည့်ရန်</Text>
            </Pressable>
          ) : null}
        </View>

        {visibleRequests.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="document-text-outline" size={36} color={Colors.light.textSecondary} />
            <Text style={styles.emptyText}>Audit change request မရှိသေးပါ။</Text>
          </View>
        ) : (
          visibleRequests.map((item: any, idx: number) => {
            const txn = transactions.find((row: any) => String(row?.id || "") === String(item?.transactionId || ""));
            const loan = loans.find((row: any) => String(row?.id || "") === String(item?.targetId || item?.relatedLoanId || ""));
            const member = members.find((m: any) => String(m?.id || "") === String((txn as any)?.memberId || (loan as any)?.memberId || ""));
            const status = String(item?.status || "pending") as AuditChangeRequestStatus;
            const color = statusColor(status);
            const targetType = String(item?.targetType || "transaction");
            const amountValue =
              targetType === "loan"
                ? Number((loan as any)?.principal || (loan as any)?.amount || 0)
                : Number((txn as any)?.amount || 0);
            const isSelected = selectedTestRequestSet.has(String(item?.id || ""));
            return (
              <Pressable
                key={item.id}
                style={styles.requestCard}
                onPress={() => {
                  if (testDeleteBusy) return;
                  if (testSelectMode) {
                    toggleTestRequestSelection(String(item?.id || ""));
                    return;
                  }
                  openDetail(item.id);
                }}
                disabled={testDeleteBusy}
              >
                <View style={styles.requestTopRow}>
                  {testSelectMode ? (
                    <View style={[styles.selectBox, isSelected && styles.selectBoxActive]}>
                      {isSelected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                    </View>
                  ) : null}
                  <Text style={styles.requestTitle}>{idx + 1}. {item.requestNumber || item.id}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: `${color}20` }]}>
                    <Text style={[styles.statusBadgeText, { color }]}>{statusLabel(status)}</Text>
                  </View>
                </View>
                <Text style={styles.requestMeta}>Type: {String(item?.requestKind || "update")} • Target: {targetType}</Text>
                <Text style={styles.requestMeta}>Target ID: {String(item.targetId || item.transactionId || "-")}</Text>
                <Text style={styles.requestMeta}>အသင်းဝင်: {member?.name || (txn as any)?.payerPayee || "-"}</Text>
                <Text style={styles.requestMeta}>ပမာဏ: {amountValue.toLocaleString()} KS</Text>
                <Text style={styles.requestMeta}>Audit Note: {item.auditNote || "-"}</Text>
                <Text style={styles.requestMeta}>Stage: {stageLabel(item?.workflowStage)}</Text>
                <Text style={styles.requestMeta}>Created: {fmtDateTime(item.createdAt)}</Text>
                <Text style={styles.requestMeta}>Messages: {(item.messages || []).length} • Revisions: {(item.revisions || []).length}</Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <Modal animationType="slide" transparent visible={showDetailModal} onRequestClose={() => setShowDetailModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
          style={styles.modalOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDetailModal(false)} />
          <ScrollView style={styles.modalCard} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>Audit Request အသေးစိတ်</Text>
            <Text style={styles.modalMeta}>Request: {selectedRequest?.requestNumber || "-"}</Text>
            <Text style={styles.modalMeta}>Kind: {String(selectedRequest?.requestKind || "update")}</Text>
            <Text style={styles.modalMeta}>Target: {String(selectedRequest?.targetType || "transaction")} / {String(selectedRequest?.targetId || selectedRequest?.transactionId || "-")}</Text>
            <Text style={styles.modalMeta}>Status: {statusLabel((selectedRequest?.status || "pending") as AuditChangeRequestStatus)}</Text>
            <Text style={styles.modalMeta}>Stage: {stageLabel(selectedRequest?.workflowStage as AuditChangeWorkflowStage)}</Text>
            <Text style={styles.modalMeta}>Audit Note: {selectedRequest?.auditNote || "-"}</Text>
            <Text style={styles.modalMeta}>Member: {selectedMemberName}</Text>
            <Text style={styles.modalMeta}>Receipt: {String((selectedTxn as any)?.receiptNumber || "-")}</Text>
            <Text style={styles.modalMeta}>Date: {String((selectedTxn as any)?.date || (selectedLoan as any)?.issueDate || "-")}</Text>
            <Text style={styles.modalMeta}>
              Amount: {Number((selectedTxn as any)?.amount || (selectedLoan as any)?.principal || (selectedLoan as any)?.amount || 0).toLocaleString()} KS
            </Text>

            <Text style={styles.sectionLabel}>မူလ / ပြင်ဆင်မည့်စာရင်း (ဇယား)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.auditTable}>
                <View style={[styles.auditTableRow, styles.auditTableHeaderRow]}>
                  <View style={[styles.auditTableCell, styles.auditTableLabelCell]}>
                    <Text style={styles.auditTableHeaderText}>အချက်</Text>
                  </View>
                  <View style={styles.auditTableCell}>
                    <Text style={styles.auditTableHeaderText}>မူလစာရင်း</Text>
                  </View>
                  <View style={styles.auditTableCell}>
                    <Text style={styles.auditTableHeaderText}>ဘဏ္ဍာရေးမှူး</Text>
                  </View>
                  <View style={styles.auditTableCell}>
                    <Text style={styles.auditTableHeaderText}>စာရင်းစစ်</Text>
                  </View>
                  <View style={styles.auditTableCell}>
                    <Text style={styles.auditTableHeaderText}>ဥက္ကဌ</Text>
                  </View>
                  <View style={styles.auditTableCell}>
                    <Text style={styles.auditTableHeaderText}>မှတ်ချက်</Text>
                  </View>
                </View>
                {fieldDefs.map((field, index) => (
                  <View key={field.key} style={styles.auditTableRow}>
                    <View style={[styles.auditTableCell, styles.auditTableLabelCell]}>
                      <Text style={styles.auditTableLabelText}>{field.label}</Text>
                    </View>
                    <View style={styles.auditTableCell}>
                      <Text style={styles.auditTableValue}>{formatFieldValue(getOriginalValue(field.key), field)}</Text>
                    </View>
                    <View style={styles.auditTableCell}>{renderDraftCell("treasurer", field)}</View>
                    <View style={styles.auditTableCell}>{renderDraftCell("auditor", field)}</View>
                    <View style={styles.auditTableCell}>{renderDraftCell("chairperson", field)}</View>
                    <View style={styles.auditTableCell}>
                      <Text style={styles.auditTableNoteText}>{index === 0 ? notePreview : "-"}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>

            {activeDatePicker ? (
              <DateTimePicker
                value={ymdToDate(String(getDraftValue(activeDatePicker.role, activeDatePicker.fieldKey) || ""))}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={handleDatePicked}
              />
            ) : null}

            <Text style={styles.sectionLabel}>Decision Note</Text>
            <TextInput
              style={styles.input}
              value={decisionNote}
              onChangeText={setDecisionNote}
              placeholder="လက်ခံ/ကန့်ကွက်/ဆိုင်းငံ့ မှတ်ချက်"
            />
            <Pressable style={styles.selectionInput} onPress={() => setShowTagPicker(true)}>
              <Text style={[styles.selectionInputText, selectedTagUsers.length === 0 && styles.selectionInputPlaceholder]} numberOfLines={1}>
                {selectedTagUsers.length > 0
                  ? `Tag Users: ${selectedTagUsers.map((row: any) => String(row?.displayName || row?.id || "-")).join(", ")}`
                  : "Tag တွဲပေးမည့် User များရွေးပါ (Optional)"}
              </Text>
              <Ionicons name="people-outline" size={18} color={Colors.light.textSecondary} />
            </Pressable>
            {selectedTagUsers.length > 0 ? (
              <View style={styles.tagPreviewWrap}>
                {selectedTagUsers.map((user: any) => (
                  <Pressable key={String(user?.id || "")} style={styles.tagChip} onPress={() => toggleTagUser(String(user?.id || ""))}>
                    <Text style={styles.tagChipText}>{String(user?.displayName || user?.id || "-")}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {canAuditorForward ? (
              <View style={styles.actionRow}>
                <Pressable style={[styles.actionBtn, { backgroundColor: "#0EA5E9" }]} onPress={() => void submitForwardToChair()}>
                  <Text style={styles.actionBtnText}>ဥက္ကဌထံ တင်ပြမည်</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, { backgroundColor: "#64748B" }]} onPress={() => void submitReturnToTreasurer()}>
                  <Text style={styles.actionBtnText}>ဘဏ္ဍာရေးမှူးထံ ပြန်ပို့</Text>
                </Pressable>
              </View>
            ) : null}

            {canChairApprove ? (
              <>
                <View style={styles.actionRow}>
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#10B981" }]} onPress={() => void submitChairDecision(true)}>
                    <Text style={styles.actionBtnText}>လက်ခံမည်</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#EF4444" }]} onPress={() => void submitChairDecision(false)}>
                    <Text style={styles.actionBtnText}>ကန့်ကွက်မည်</Text>
                  </Pressable>
                </View>
                <View style={styles.actionRow}>
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#F59E0B" }]} onPress={() => void submitStatus("suspended")}>
                    <Text style={styles.actionBtnText}>ဆိုင်းငံ့မည်</Text>
                  </Pressable>
                </View>
                <View style={styles.actionRow}>
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#475569" }]} onPress={() => void submitReturnToAuditor()}>
                    <Text style={styles.actionBtnText}>စာရင်းစစ်ထံ ပြန်ပို့</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#334155" }]} onPress={() => void submitReturnToTreasurer()}>
                    <Text style={styles.actionBtnText}>ဘဏ္ဍာရေးမှူးထံ ပြန်ပို့</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {canTreasurerApplyUpdate ? (
              <View style={styles.actionRow}>
                <Pressable style={[styles.actionBtn, { backgroundColor: "#10B981" }]} onPress={() => void submitApplyDraftPatch()}>
                  <Text style={styles.actionBtnText}>ပြင်ဆင်ပြီး အတည်ပြု</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, { backgroundColor: "#64748B" }]} onPress={() => void submitNoChangeApproval()}>
                  <Text style={styles.actionBtnText}>ပြင်ဆင်ချက်မရှိ အတည်ပြု</Text>
                </Pressable>
              </View>
            ) : null}

            {canTreasurerConfirmDelete ? (
              <Pressable style={[styles.actionBtn, { backgroundColor: "#B91C1C", marginTop: 8 }]} onPress={() => void submitConfirmDeleteExecution()}>
                <Text style={styles.actionBtnText}>Confirm Delete (အတည်ပြုပယ်ဖျက်မည်)</Text>
              </Pressable>
            ) : null}

            {canTreasurerReturnToAuditor ? (
              <Pressable style={[styles.actionBtn, { backgroundColor: "#475569", marginTop: 8 }]} onPress={() => void submitReturnToAuditor()}>
                <Text style={styles.actionBtnText}>စာရင်းစစ်ထံ ပြန်ပို့</Text>
              </Pressable>
            ) : null}

            {canOwnerCancel ? (
              <Pressable style={[styles.actionBtn, { backgroundColor: "#64748B", marginTop: 8 }]} onPress={() => void submitStatus("cancelled")}>
                <Text style={styles.actionBtnText}>Request ရုပ်သိမ်းမည်</Text>
              </Pressable>
            ) : null}

            {canReopen ? (
              <Pressable style={[styles.actionBtn, { backgroundColor: "#334155", marginTop: 8 }]} onPress={() => void submitStatus("pending")}>
                <Text style={styles.actionBtnText}>Pending ပြန်တင်မည်</Text>
              </Pressable>
            ) : null}

            <Text style={styles.sectionLabel}>Reply / Forward</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={messageNote}
              onChangeText={setMessageNote}
              placeholder="ညှိနှိုင်းမှတ်ချက် / ကန့်ကွက်ရှင်းလင်းချက်"
              multiline
            />
            {!isDeleteRequest ? (
              <Pressable style={styles.selectionInput} onPress={() => setShowForwardPicker(true)}>
                <Text style={[styles.selectionInputText, !selectedForwardUser && styles.selectionInputPlaceholder]} numberOfLines={1}>
                  {selectedForwardUser ? getUserLabel(selectedForwardUser) : "Forward လက်ခံသူရွေးပါ"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={Colors.light.textSecondary} />
              </Pressable>
            ) : null}
            <View style={styles.actionRow}>
              <Pressable style={[styles.actionBtn, { backgroundColor: Colors.light.tint }]} onPress={() => void submitMessage(false)}>
                <Text style={styles.actionBtnText}>Reply ပို့မည်</Text>
              </Pressable>
              {!isDeleteRequest ? (
                <Pressable style={[styles.actionBtn, { backgroundColor: "#0EA5E9" }]} onPress={() => void submitMessage(true)}>
                  <Text style={styles.actionBtnText}>Forward ပို့မည်</Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.sectionLabel}>ပြောင်းလဲမှုမှတ်တမ်း</Text>
            {Array.isArray(selectedRequest?.messages) && selectedRequest.messages.length > 0 ? (
              selectedRequest.messages.map((msg: any) => (
                <View key={msg.id} style={styles.messageCard}>
                  <Text style={styles.messageMeta}>{msg.messageType || "note"} • {msg.byDisplayName || msg.byUserId || "-"}</Text>
                  {msg.toUserId ? (
                    <Text style={styles.messageSubMeta}>
                      To: {activeUsers.find((row: any) => String(row?.id || "") === String(msg.toUserId || ""))?.displayName || msg.toUserId}
                    </Text>
                  ) : null}
                  {Array.isArray(msg.tagUserIds) && msg.tagUserIds.length > 0 ? (
                    <Text style={styles.messageSubMeta}>
                      Tag: {msg.tagUserIds
                        .map((id: string) => activeUsers.find((row: any) => String(row?.id || "") === String(id || ""))?.displayName || id)
                        .join(", ")}
                    </Text>
                  ) : null}
                  <Text style={styles.messageBody}>{msg.note || "-"}</Text>
                  <Text style={styles.messageTime}>{fmtDateTime(msg.createdAt)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.modalMeta}>မှတ်တမ်းမရှိသေးပါ။</Text>
            )}

            {Array.isArray(selectedRequest?.revisions) && selectedRequest.revisions.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>ပြင်ဆင်ချက်များ</Text>
                {selectedRequest.revisions.map((rev: any) => (
                  <View key={rev.id} style={styles.messageCard}>
                    <Text style={styles.messageMeta}>Revision • {userNameById.get(String(rev?.byUserId || "")) || rev.byUserId}</Text>
                    <Text style={styles.messageBody}>{summarizeRevisionPatch(rev)}</Text>
                    {rev?.note ? <Text style={styles.messageSubMeta}>Note: {rev.note}</Text> : null}
                    <Text style={styles.messageTime}>{fmtDateTime(rev.createdAt)}</Text>
                  </View>
                ))}
              </>
            ) : null}

            <Pressable style={styles.closeBtn} onPress={() => setShowDetailModal(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="fade" transparent visible={showMemberPicker} onRequestClose={() => setShowMemberPicker(false)}>
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowMemberPicker(false)} />
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>အသင်းဝင်ရွေးရန်</Text>
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {memberOptions.map((member) => {
                const selected = String(member.id || "") === String(getDraftValue(memberPickerRole || "treasurer", memberPickerField) || "");
                return (
                  <Pressable
                    key={member.id}
                    style={[styles.pickerItem, selected && styles.pickerItemActive]}
                onPress={() => {
                  if (!memberPickerRole) return;
                  const field = memberPickerField;
                  if (field === "payerPayee") {
                    updateDraftValue(memberPickerRole, field, member.name || member.id);
                  } else {
                    updateDraftValue(memberPickerRole, field, member.id);
                  }
                  setShowMemberPicker(false);
                }}
                  >
                    <Text style={[styles.pickerItemText, selected && styles.pickerItemTextActive]}>
                      {member.name} ({member.id})
                    </Text>
                  </Pressable>
                );
              })}
              {memberOptions.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="people-outline" size={24} color={Colors.light.textSecondary} />
                  <Text style={styles.emptyText}>အသင်းဝင်စာရင်းမရှိပါ</Text>
                </View>
              ) : null}
            </ScrollView>
            <Pressable style={styles.closeBtn} onPress={() => setShowMemberPicker(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={showOptionPicker} onRequestClose={() => setShowOptionPicker(false)}>
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowOptionPicker(false)} />
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{optionPickerTitle || "ရွေးချယ်ရန်"}</Text>
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {optionPickerItems.map((item) => {
                const selected =
                  String(item.id || "") ===
                  String(
                    getDraftValue(optionPickerRole || "treasurer", optionPickerField) ||
                      ""
                  );
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.pickerItem, selected && styles.pickerItemActive]}
                    onPress={() => {
                      if (!optionPickerRole) return;
                      updateDraftValue(optionPickerRole, optionPickerField, item.id, item.label);
                      setShowOptionPicker(false);
                    }}
                  >
                    <Text style={[styles.pickerItemText, selected && styles.pickerItemTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}
              {optionPickerItems.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="list-outline" size={24} color={Colors.light.textSecondary} />
                  <Text style={styles.emptyText}>ရွေးချယ်စရာမရှိပါ</Text>
                </View>
              ) : null}
            </ScrollView>
            <Pressable style={styles.closeBtn} onPress={() => setShowOptionPicker(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={showCreateDeleteModal} onRequestClose={() => setShowCreateDeleteModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
          style={styles.modalOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCreateDeleteModal(false)} />
          <ScrollView style={styles.modalCard} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>Delete Request အသစ်</Text>
            <Text style={styles.modalMeta}>Audit Change Requests ထဲမှ တိုက်ရိုက်တင်သွင်းနိုင်ပါသည်။</Text>

            <Text style={styles.sectionLabel}>Target Type</Text>
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: createDeleteTargetType === "transaction" ? Colors.light.tint : "#64748B" }]}
                onPress={() => {
                  setCreateDeleteTargetType("transaction");
                  setCreateDeleteTargetId("");
                  setCreateDeleteSearch("");
                }}
              >
                <Text style={styles.actionBtnText}>Transaction</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: createDeleteTargetType === "loan" ? Colors.light.tint : "#64748B" }]}
                onPress={() => {
                  setCreateDeleteTargetType("loan");
                  setCreateDeleteTargetId("");
                  setCreateDeleteSearch("");
                }}
              >
                <Text style={styles.actionBtnText}>Loan</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>Target စာရင်းရှာရန်</Text>
            <TextInput
              style={styles.input}
              value={createDeleteSearch}
              onChangeText={setCreateDeleteSearch}
              placeholder="ID / အမည် / ခေါင်းစဉ် / ရက်စွဲ"
            />
            <Pressable style={styles.selectionInput} onPress={() => setShowCreateTargetPicker(true)}>
              <Text style={[styles.selectionInputText, !selectedCreateTarget && styles.selectionInputPlaceholder]} numberOfLines={1}>
                {selectedCreateTarget ? selectedCreateTarget.label : "ဖျက်သိမ်းလိုသော စာရင်းကိုရွေးပါ"}
              </Text>
              <Ionicons name="chevron-down" size={18} color={Colors.light.textSecondary} />
            </Pressable>
            <Text style={styles.modalMeta}>တွေ့ရှိသောစာရင်း: {createTargetOptions.length.toLocaleString()} ခု</Text>

            <Text style={styles.sectionLabel}>Delete Request မှတ်ချက်</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={createDeleteNote}
              onChangeText={setCreateDeleteNote}
              placeholder="ပယ်ဖျက်ရန် အကြောင်းပြချက်ကို အသေးစိတ်ရေးပါ"
              multiline
            />

            <Pressable style={[styles.actionBtn, { backgroundColor: "#D97706", marginTop: 8 }]} onPress={() => void submitCreateDeleteRequest()}>
              <Text style={styles.actionBtnText}>Delete Request တင်သွင်းမည်</Text>
            </Pressable>
            <Pressable style={styles.closeBtn} onPress={() => setShowCreateDeleteModal(false)}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="fade" transparent visible={showCreateTargetPicker} onRequestClose={() => setShowCreateTargetPicker(false)}>
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCreateTargetPicker(false)} />
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>ဖျက်သိမ်းမည့် စာရင်းရွေးပါ</Text>
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {createTargetOptions.map((row) => {
                const selected = String(row.id || "") === String(createDeleteTargetId || "");
                return (
                  <Pressable
                    key={String(row.id || "")}
                    style={[styles.pickerItem, selected && styles.pickerItemActive]}
                    onPress={() => {
                      setCreateDeleteTargetId(String(row.id || ""));
                      setShowCreateTargetPicker(false);
                    }}
                  >
                    <Text style={[styles.pickerItemText, selected && styles.pickerItemTextActive]}>{row.label}</Text>
                  </Pressable>
                );
              })}
              {createTargetOptions.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="search-outline" size={24} color={Colors.light.textSecondary} />
                  <Text style={styles.emptyText}>ရွေးချယ်ရန် စာရင်းမတွေ့ပါ</Text>
                </View>
              ) : null}
            </ScrollView>
            <Pressable style={styles.closeBtn} onPress={() => setShowCreateTargetPicker(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={showForwardPicker} onRequestClose={() => setShowForwardPicker(false)}>
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowForwardPicker(false)} />
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Forward လက်ခံသူရွေးရန်</Text>
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {visibleForwardUsers.map((user: any) => {
                const selected = String(user?.id || "") === String(forwardToUserId || "");
                return (
                  <Pressable
                    key={String(user?.id || "")}
                    style={[styles.pickerItem, selected && styles.pickerItemActive]}
                    onPress={() => {
                      setForwardToUserId(String(user?.id || ""));
                      setShowForwardPicker(false);
                    }}
                  >
                    <Text style={[styles.pickerItemText, selected && styles.pickerItemTextActive]}>{getUserLabel(user)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.closeBtn} onPress={() => setShowForwardPicker(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={showTagPicker} onRequestClose={() => setShowTagPicker(false)}>
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowTagPicker(false)} />
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Tag တွဲပေးမည့် User များ</Text>
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {visibleForwardUsers.map((user: any) => {
                const selected = tagUserIds.includes(String(user?.id || ""));
                return (
                  <Pressable
                    key={String(user?.id || "")}
                    style={[styles.pickerItem, selected && styles.pickerItemActive]}
                    onPress={() => toggleTagUser(String(user?.id || ""))}
                  >
                    <Text style={[styles.pickerItemText, selected && styles.pickerItemTextActive]}>{getUserLabel(user)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.closeBtn} onPress={() => setShowTagPicker(false)}>
              <Text style={styles.closeBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  headerRow: { paddingHorizontal: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.light.text },
  countCard: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 12,
    gap: 2,
  },
  countLine: { color: Colors.light.text, fontFamily: "Inter_500Medium", fontSize: 13 },
  inlineActionWrap: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  inlineCreateDeleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#D97706",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  inlineCreateDeleteBtnText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 12.5,
  },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#fff",
  },
  filterChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  filterChipText: { color: Colors.light.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 12.5 },
  filterChipTextActive: { color: "#fff" },
  testCleanupRow: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#fff",
    gap: 8,
  },
  testCleanupBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0F766E",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  testCleanupBtnActive: { backgroundColor: "#0F766E" },
  testCleanupBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 12.5 },
  testCleanupHint: { color: Colors.light.textSecondary, fontFamily: "Inter_500Medium", fontSize: 12 },
  testCleanupActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  testCleanupMiniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#F8FAFC",
  },
  testCleanupDeleteBtn: { backgroundColor: "#DC2626", borderColor: "#DC2626" },
  testCleanupMiniText: { fontSize: 11.5, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  testCleanupBusyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  emptyWrap: { alignItems: "center", paddingVertical: 42, gap: 8 },
  emptyText: { color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  requestCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 3,
  },
  requestTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  selectBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  selectBoxActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  requestTitle: { fontSize: 14.5, color: Colors.light.text, fontFamily: "Inter_700Bold", flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusBadgeText: { fontSize: 11.5, fontFamily: "Inter_700Bold" },
  requestMeta: { fontSize: 12.5, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  sectionCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  sectionTitle: {
    fontSize: 14,
    color: Colors.light.text,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  sectionEmptyText: {
    fontSize: 12.5,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_500Medium",
  },
  auditHistoryCard: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 2,
  },
  auditHistoryTitle: {
    color: Colors.light.text,
    fontFamily: "Inter_700Bold",
    fontSize: 12.5,
  },
  auditHistoryMeta: {
    color: Colors.light.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  loadMoreBtn: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#F8FAFC",
  },
  loadMoreBtnText: {
    color: Colors.light.textSecondary,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "90%", padding: 16 },
  modalTitle: { fontSize: 22, color: Colors.light.text, fontFamily: "Inter_700Bold", marginBottom: 8 },
  modalMeta: { fontSize: 13, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium", marginBottom: 4 },
  sectionLabel: { marginTop: 12, marginBottom: 6, color: Colors.light.text, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  auditTable: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
    minWidth: 920,
  },
  auditTableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  auditTableHeaderRow: {
    backgroundColor: "#F1F5F9",
  },
  auditTableCell: {
    minWidth: 140,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: Colors.light.border,
    justifyContent: "center",
  },
  auditTableLabelCell: {
    minWidth: 160,
  },
  auditTableHeaderText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  auditTableLabelText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  auditTableValue: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  auditTableNoteText: {
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  auditTableInput: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.light.text,
    backgroundColor: "#fff",
  },
  auditTablePicker: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    backgroundColor: "#fff",
  },
  auditTablePickerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  compareRow: { gap: 12, paddingBottom: 4 },
  compareCol: {
    width: 220,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#F8FAFC",
  },
  compareTitle: { fontSize: 12.5, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 6 },
  compareText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.text, marginBottom: 3 },
  compareDelete: { color: "#B91C1C" },
  compareEmpty: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  noteInput: { minHeight: 86, textAlignVertical: "top" },
  selectionInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  selectionInputText: { flex: 1, color: Colors.light.text, fontFamily: "Inter_500Medium", fontSize: 13 },
  selectionInputPlaceholder: { color: Colors.light.textSecondary },
  tagPreviewWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tagChip: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#ECFEFF",
  },
  tagChipText: { color: Colors.light.text, fontFamily: "Inter_500Medium", fontSize: 12 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  actionBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  messageCard: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#fff",
    gap: 2,
  },
  messageMeta: { fontSize: 12, color: Colors.light.textSecondary, fontFamily: "Inter_600SemiBold" },
  messageSubMeta: { fontSize: 11.5, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  messageBody: { fontSize: 13, color: Colors.light.text, fontFamily: "Inter_500Medium" },
  messageTime: { fontSize: 11.5, color: Colors.light.textSecondary, fontFamily: "Inter_400Regular" },
  pickerOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)", padding: 20 },
  pickerCard: {
    width: "100%",
    maxHeight: "75%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  pickerTitle: { fontSize: 18, color: Colors.light.text, fontFamily: "Inter_700Bold", marginBottom: 8 },
  pickerList: { maxHeight: 380 },
  pickerItem: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  pickerItemActive: { backgroundColor: "#ECFEFF", borderColor: Colors.light.tint },
  pickerItemText: { color: Colors.light.text, fontFamily: "Inter_500Medium", fontSize: 13 },
  pickerItemTextActive: { color: Colors.light.tint, fontFamily: "Inter_600SemiBold" },
  closeBtn: { alignItems: "center", paddingVertical: 12, marginTop: 8 },
  closeBtnText: { color: Colors.light.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 14 },
});

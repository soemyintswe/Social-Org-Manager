import React, { useMemo, useState } from "react";
import {
  Alert,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import AccessDenied from "@/components/AccessDenied";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import { normalizeOrgPosition, type AuditChangeRequestStatus, type AuditChangeWorkflowStage } from "@/lib/types";

const STATUS_ORDER: AuditChangeRequestStatus[] = ["pending", "suspended", "approved", "rejected", "cancelled"];

function statusLabel(status: AuditChangeRequestStatus): string {
  if (status === "pending") return "စောင့်ဆိုင်း";
  if (status === "approved") return "လက်ခံပြီး";
  if (status === "rejected") return "ကန့်ကွက်";
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

export default function AuditChangeRequestsScreen() {
  const insets = useSafeAreaInsets();
  const {
    auditChangeRequests,
    transactions,
    loans,
    members,
    addAuditChangeRequestMessage,
    changeAuditChangeRequestStatus,
    applyAuditChangeRequestPatch,
    forwardDeleteAuditRequestToChair,
    chairReviewDeleteAuditRequest,
    confirmDeleteAuditRequestExecution,
  } = useData() as any;
  const { currentUser, can } = useAuth();

  const [statusFilter, setStatusFilter] = useState<"all" | AuditChangeRequestStatus>("all");
  const [selectedRequestId, setSelectedRequestId] = useState<string>("");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showFixModal, setShowFixModal] = useState(false);
  const [messageNote, setMessageNote] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [fixPayerPayee, setFixPayerPayee] = useState("");
  const [fixAmount, setFixAmount] = useState("");
  const [fixDate, setFixDate] = useState("");
  const [fixReceipt, setFixReceipt] = useState("");
  const [fixNotes, setFixNotes] = useState("");

  const myRole = normalizeOrgPosition(currentUser?.orgPosition || "member");
  const isAdmin = currentUser?.systemRole === "admin";
  const isTreasurer = isAdmin || myRole === "treasurer";
  const isAuditor = isAdmin || can("finance.audit_flag") || myRole === "auditor";
  const isChair = isAdmin || myRole === "chairperson";

  const canView =
    can("finance.view_summary") ||
    can("finance.view_detail") ||
    can("finance.view_all") ||
    can("finance.audit_flag") ||
    isAuditor ||
    isTreasurer ||
    isChair ||
    isAdmin;

  const allRequests = useMemo(() => {
    const list = Array.isArray(auditChangeRequests) ? [...auditChangeRequests] : [];
    return list.sort((a: any, b: any) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
  }, [auditChangeRequests]);

  const visibleRequests = useMemo(() => {
    const base = canView ? allRequests : allRequests.filter((item: any) => item.createdByUserId === currentUser?.id);
    if (statusFilter === "all") return base;
    return base.filter((item: any) => item.status === statusFilter);
  }, [allRequests, canView, currentUser?.id, statusFilter]);

  const counts = useMemo(() => {
    const base = canView ? allRequests : allRequests.filter((item: any) => item.createdByUserId === currentUser?.id);
    const pending = base.filter((item: any) => item.status === "pending").length;
    const approved = base.filter((item: any) => item.status === "approved").length;
    const rejected = base.filter((item: any) => item.status === "rejected").length;
    const cancelled = base.filter((item: any) => item.status === "cancelled").length;
    const suspended = base.filter((item: any) => item.status === "suspended").length;
    return { total: base.length, pending, approved, rejected, cancelled, suspended };
  }, [allRequests, canView, currentUser?.id]);

  const selectedRequest = useMemo(
    () => allRequests.find((item: any) => String(item.id || "") === String(selectedRequestId || "")) || null,
    [allRequests, selectedRequestId]
  );

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

  const openDetail = (requestId: string) => {
    setSelectedRequestId(requestId);
    setMessageNote("");
    setDecisionNote("");
    setShowDetailModal(true);
  };

  const openFixModal = () => {
    if (!selectedTxn) {
      Alert.alert("မတွေ့ပါ", "ပြင်ဆင်ရန် transaction မတွေ့ပါ။");
      return;
    }
    setFixPayerPayee(String((selectedTxn as any)?.payerPayee || ""));
    setFixAmount(String((selectedTxn as any)?.amount ?? ""));
    setFixDate(String((selectedTxn as any)?.date || ""));
    setFixReceipt(String((selectedTxn as any)?.receiptNumber || ""));
    setFixNotes(String((selectedTxn as any)?.notes || ""));
    setShowFixModal(true);
  };

  const submitMessage = async (forwardChair = false) => {
    if (!selectedRequest || !currentUser?.id) return;
    const note = messageNote.trim();
    if (!note) return Alert.alert("လိုအပ်ချက်", "Reply/Forward note ဖြည့်ရန်လိုပါသည်။");
    await addAuditChangeRequestMessage({
      requestId: selectedRequest.id,
      byUserId: currentUser.id,
      byMemberId: currentUser.memberId,
      byDisplayName: currentUser.displayName,
      messageType: forwardChair ? "forward" : "reply",
      note,
      toRole: forwardChair ? "chairperson" : undefined,
      setSuspended: forwardChair,
    });
    setMessageNote("");
  };

  const submitStatus = async (status: AuditChangeRequestStatus) => {
    if (!selectedRequest || !currentUser?.id) return;
    const note = decisionNote.trim();
    await changeAuditChangeRequestStatus({
      requestId: selectedRequest.id,
      status,
      byUserId: currentUser.id,
      byMemberId: currentUser.memberId,
      byDisplayName: currentUser.displayName,
      note,
    });
    setDecisionNote("");
    if (["approved", "rejected", "cancelled"].includes(status)) {
      setShowDetailModal(false);
    }
  };

  const submitForwardDeleteToChair = async () => {
    if (!selectedRequest || !currentUser?.id) return;
    const note = messageNote.trim() || decisionNote.trim();
    if (!note) {
      return Alert.alert("လိုအပ်ချက်", "Chair ထံတင်ပြရန် မှတ်ချက်ဖြည့်ရန်လိုပါသည်။");
    }
    await forwardDeleteAuditRequestToChair({
      requestId: selectedRequest.id,
      byUserId: currentUser.id,
      byMemberId: currentUser.memberId,
      byDisplayName: currentUser.displayName,
      note,
    });
    setMessageNote("");
    setDecisionNote("");
  };

  const submitChairDeleteDecision = async (approved: boolean) => {
    if (!selectedRequest || !currentUser?.id) return;
    const note = decisionNote.trim() || messageNote.trim();
    if (!note) {
      return Alert.alert("လိုအပ်ချက်", "ဆုံးဖြတ်ချက်မှတ်ချက်ဖြည့်ရန်လိုပါသည်။");
    }
    await chairReviewDeleteAuditRequest({
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

  const submitConfirmDeleteExecution = async () => {
    if (!selectedRequest || !currentUser?.id) return;
    const note = decisionNote.trim() || "ဥက္ကဌအတည်ပြုချက်အရ စာရင်းကို ပယ်ဖျက်ပြီးပါပြီ။";
    await confirmDeleteAuditRequestExecution({
      requestId: selectedRequest.id,
      byUserId: currentUser.id,
      byMemberId: currentUser.memberId,
      byDisplayName: currentUser.displayName,
      note,
    });
    setDecisionNote("");
    setShowDetailModal(false);
    Alert.alert("ပြီးပါပြီ", "Delete ကိုအတည်ပြုပယ်ဖျက်ပြီးပါပြီ။");
  };

  const submitFix = async () => {
    if (!selectedRequest || !selectedTxn || !currentUser?.id) return;

    const patch: Record<string, any> = {};
    const payerPayee = fixPayerPayee.trim();
    const date = fixDate.trim();
    const receipt = fixReceipt.trim();
    const notes = fixNotes.trim();
    const amountNum = Number(fixAmount);

    if (payerPayee !== String((selectedTxn as any)?.payerPayee || "")) patch.payerPayee = payerPayee;
    if (date !== String((selectedTxn as any)?.date || "")) patch.date = date;
    if (receipt !== String((selectedTxn as any)?.receiptNumber || "")) patch.receiptNumber = receipt;
    if (notes !== String((selectedTxn as any)?.notes || "")) patch.notes = notes;
    if (Number.isFinite(amountNum) && amountNum >= 0 && amountNum !== Number((selectedTxn as any)?.amount || 0)) {
      patch.amount = amountNum;
    }

    if (Object.keys(patch).length === 0) {
      return Alert.alert("အချက်အလက်မပြောင်းပါ", "ပြင်ဆင်ချက်မရှိသေးပါ။");
    }

    await applyAuditChangeRequestPatch({
      requestId: selectedRequest.id,
      byUserId: currentUser.id,
      byMemberId: currentUser.memberId,
      byDisplayName: currentUser.displayName,
      patch,
      note: decisionNote.trim() || "Audit flag ကိုပြင်ဆင်ပြီး အတည်ပြုပါသည်။",
    });

    setShowFixModal(false);
    setShowDetailModal(false);
    setDecisionNote("");
    Alert.alert("ပြီးပါပြီ", "စာရင်းပြင်ဆင်ချက်ကို အတည်ပြုပြီးပါပြီ။");
  };

  const isDeleteRequest = String(selectedRequest?.requestKind || "update") === "delete";
  const canChangeByTreasurer = !!selectedRequest && isTreasurer && ["pending", "suspended"].includes(String(selectedRequest.status || ""));
  const canChairDecide = !!selectedRequest && isChair && String(selectedRequest.status || "") === "suspended";
  const canOwnerCancel = !!selectedRequest && String(selectedRequest.status || "") === "pending" && String(selectedRequest.createdByUserId || "") === String(currentUser?.id || "");
  const canReopen =
    !!selectedRequest &&
    !isDeleteRequest &&
    (isAuditor || isTreasurer || isChair) &&
    ["rejected", "suspended"].includes(String(selectedRequest.status || ""));
  const selectedStage = String(selectedRequest?.workflowStage || "") as AuditChangeWorkflowStage;
  const canAuditorForwardDelete = !!selectedRequest && isDeleteRequest && isAuditor && selectedStage === "auditor_review";
  const canChairApproveDelete = !!selectedRequest && isDeleteRequest && isChair && selectedStage === "chair_approval";
  const canTreasurerConfirmDelete = !!selectedRequest && isDeleteRequest && isTreasurer && selectedStage === "treasurer_execution" && String(selectedRequest?.status || "") === "approved";

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
            return (
              <Pressable key={item.id} style={styles.requestCard} onPress={() => openDetail(item.id)}>
                <View style={styles.requestTopRow}>
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

            <Text style={styles.sectionLabel}>Decision Note</Text>
            <TextInput
              style={styles.input}
              value={decisionNote}
              onChangeText={setDecisionNote}
              placeholder="လက်ခံ/ကန့်ကွက်/ဆိုင်းငံ့ မှတ်ချက်"
            />

            {!isDeleteRequest && (canChangeByTreasurer || canChairDecide) ? (
              <>
                <View style={styles.actionRow}>
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#10B981" }]} onPress={openFixModal}>
                    <Text style={styles.actionBtnText}>ပြင်ဆင်ပြီး လက်ခံမည်</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#EF4444" }]} onPress={() => void submitStatus("rejected")}>
                    <Text style={styles.actionBtnText}>ကန့်ကွက်မည်</Text>
                  </Pressable>
                </View>
                <View style={styles.actionRow}>
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#0EA5E9" }]} onPress={() => void submitStatus("suspended")}>
                    <Text style={styles.actionBtnText}>ဆိုင်းငံ့မည်</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#64748B" }]} onPress={() => void submitStatus("approved")}>
                    <Text style={styles.actionBtnText}>ပြင်ဆင်ချက်မရှိ လက်ခံ</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {isDeleteRequest && canAuditorForwardDelete ? (
              <Pressable style={[styles.actionBtn, { backgroundColor: "#0EA5E9", marginTop: 8 }]} onPress={() => void submitForwardDeleteToChair()}>
                <Text style={styles.actionBtnText}>ဥက္ကဌထံ တင်ပြ/အတည်ပြုတောင်းမည်</Text>
              </Pressable>
            ) : null}

            {isDeleteRequest && canChairApproveDelete ? (
              <View style={styles.actionRow}>
                <Pressable style={[styles.actionBtn, { backgroundColor: "#10B981" }]} onPress={() => void submitChairDeleteDecision(true)}>
                  <Text style={styles.actionBtnText}>Delete ကို လက်ခံမည်</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, { backgroundColor: "#EF4444" }]} onPress={() => void submitChairDeleteDecision(false)}>
                  <Text style={styles.actionBtnText}>Delete ကို ကန့်ကွက်မည်</Text>
                </Pressable>
              </View>
            ) : null}

            {isDeleteRequest && canTreasurerConfirmDelete ? (
              <Pressable style={[styles.actionBtn, { backgroundColor: "#B91C1C", marginTop: 8 }]} onPress={() => void submitConfirmDeleteExecution()}>
                <Text style={styles.actionBtnText}>Confirm Delete (အတည်ပြုပယ်ဖျက်မည်)</Text>
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
            <View style={styles.actionRow}>
              <Pressable style={[styles.actionBtn, { backgroundColor: Colors.light.tint }]} onPress={() => void submitMessage(false)}>
                <Text style={styles.actionBtnText}>Reply ပို့မည်</Text>
              </Pressable>
              {!isDeleteRequest ? (
                <Pressable style={[styles.actionBtn, { backgroundColor: "#0EA5E9" }]} onPress={() => void submitMessage(true)}>
                  <Text style={styles.actionBtnText}>Chair ထံ Forward</Text>
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.sectionLabel}>ပြောင်းလဲမှုမှတ်တမ်း</Text>
            {Array.isArray(selectedRequest?.messages) && selectedRequest.messages.length > 0 ? (
              selectedRequest.messages.map((msg: any) => (
                <View key={msg.id} style={styles.messageCard}>
                  <Text style={styles.messageMeta}>{msg.messageType || "note"} • {msg.byDisplayName || msg.byUserId || "-"}</Text>
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
                    <Text style={styles.messageMeta}>Revision • {rev.byUserId}</Text>
                    <Text style={styles.messageBody}>{JSON.stringify(rev.patch || {})}</Text>
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

      <Modal animationType="slide" transparent visible={showFixModal} onRequestClose={() => setShowFixModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
          style={styles.modalOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowFixModal(false)} />
          <ScrollView style={styles.modalCard} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>မှတ်တမ်းတိုက်ရိုက်ပြင်ဆင်ရန်</Text>
            <Text style={styles.sectionLabel}>ပေးသွင်းသူ/ထုတ်ယူသူ</Text>
            <TextInput style={styles.input} value={fixPayerPayee} onChangeText={setFixPayerPayee} />
            <Text style={styles.sectionLabel}>ပမာဏ</Text>
            <TextInput style={styles.input} value={fixAmount} onChangeText={setFixAmount} keyboardType="decimal-pad" />
            <Text style={styles.sectionLabel}>ရက်စွဲ</Text>
            <TextInput style={styles.input} value={fixDate} onChangeText={setFixDate} placeholder="YYYY-MM-DD" />
            <Text style={styles.sectionLabel}>ပြေစာအမှတ်</Text>
            <TextInput style={styles.input} value={fixReceipt} onChangeText={setFixReceipt} />
            <Text style={styles.sectionLabel}>မှတ်ချက်</Text>
            <TextInput style={[styles.input, styles.noteInput]} value={fixNotes} onChangeText={setFixNotes} multiline />

            <Pressable style={[styles.actionBtn, { backgroundColor: "#10B981", marginTop: 8 }]} onPress={() => void submitFix()}>
              <Text style={styles.actionBtnText}>ပြင်ဆင်ချက် အတည်ပြုမည်</Text>
            </Pressable>
            <Pressable style={styles.closeBtn} onPress={() => setShowFixModal(false)}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
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
  requestTitle: { fontSize: 14.5, color: Colors.light.text, fontFamily: "Inter_700Bold", flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusBadgeText: { fontSize: 11.5, fontFamily: "Inter_700Bold" },
  requestMeta: { fontSize: 12.5, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "90%", padding: 16 },
  modalTitle: { fontSize: 22, color: Colors.light.text, fontFamily: "Inter_700Bold", marginBottom: 8 },
  modalMeta: { fontSize: 13, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium", marginBottom: 4 },
  sectionLabel: { marginTop: 12, marginBottom: 6, color: Colors.light.text, fontFamily: "Inter_600SemiBold", fontSize: 13 },
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
  messageBody: { fontSize: 13, color: Colors.light.text, fontFamily: "Inter_500Medium" },
  messageTime: { fontSize: 11.5, color: Colors.light.textSecondary, fontFamily: "Inter_400Regular" },
  closeBtn: { alignItems: "center", paddingVertical: 12, marginTop: 8 },
  closeBtnText: { color: Colors.light.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 14 },
});

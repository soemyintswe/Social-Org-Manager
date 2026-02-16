import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { useData } from "@/lib/DataContext";
import AccessDenied from "@/components/AccessDenied";
import type { MemberChangeRequest } from "@/lib/types";

const MEMBER_CHANGE_LAST_SEEN_KEY = "@member_change_last_seen_at";
const PENDING_OVERDUE_DAYS = 3;
const MEMBER_FIELD_LABELS: Record<string, string> = {
  name: "အမည်",
  phone: "ဖုန်း",
  email: "အီးမေးလ်",
  dob: "မွေးသက္ကရာဇ်",
  address: "နေရပ်လိပ်စာ",
  orgPosition: "ရာထူး",
  status: "အခြေအနေ",
  statusDate: "အခြေအနေရက်စွဲ",
  statusNote: "မှတ်ချက်",
};

function parseDateInputToMs(input: string, endOfDay = false): number | null {
  const text = String(input || "").trim();
  if (!text) return null;
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPendingAgeDays(createdAt?: string): number {
  const created = new Date(createdAt || 0).getTime();
  if (!Number.isFinite(created) || created <= 0) return 0;
  const diffMs = Date.now() - created;
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

function buildChangeLines(item: MemberChangeRequest, currentMember?: any, maxLines?: number): string[] {
  if (item.action === "delete") return ["အသင်းဝင်ကို ဖျက်ရန် တောင်းဆိုထားသည်။"];
  const requested = item.payload.member || {};
  if (item.action === "create") {
    const lines = Object.entries(requested)
      .filter(([, value]) => value !== undefined && String(value).trim() !== "")
      .map(([key, value]) => `${MEMBER_FIELD_LABELS[key] || key}: ${String(value)}`);
    return typeof maxLines === "number" ? lines.slice(0, maxLines) : lines;
  }

  const keys = Object.keys(requested).filter((key) => key !== "id");
  const lines = keys
    .map((key) => {
      const nextVal = requested[key as keyof typeof requested];
      const prevVal = currentMember?.[key];
      if (String(prevVal ?? "") === String(nextVal ?? "")) return "";
      return `${MEMBER_FIELD_LABELS[key] || key}: ${String(prevVal ?? "-")} -> ${String(nextVal ?? "-")}`;
    })
    .filter(Boolean);
  const output = lines.length ? lines : ["ပြောင်းလဲမှုမတွေ့ပါ။"];
  return typeof maxLines === "number" ? output.slice(0, maxLines) : output;
}

function buildChangeRows(item: MemberChangeRequest, currentMember?: any): { label: string; before: string; after: string }[] {
  if (item.action === "delete") {
    return [{ label: "လုပ်ဆောင်ချက်", before: "ရှိပြီး", after: "ဖျက်မည်" }];
  }
  const requested = item.payload.member || {};
  const keys = Object.keys(requested).filter((key) => key !== "id");

  if (item.action === "create") {
    return keys
      .filter((key) => requested[key as keyof typeof requested] !== undefined)
      .map((key) => ({
        label: MEMBER_FIELD_LABELS[key] || key,
        before: "-",
        after: String(requested[key as keyof typeof requested] ?? "-"),
      }));
  }

  return keys
    .map((key) => {
      const nextVal = String(requested[key as keyof typeof requested] ?? "-");
      const prevVal = String(currentMember?.[key] ?? "-");
      if (nextVal === prevVal) return null;
      return { label: MEMBER_FIELD_LABELS[key] || key, before: prevVal, after: nextVal };
    })
    .filter((row): row is { label: string; before: string; after: string } => Boolean(row));
}

export default function MemberChangeApprovalsScreen() {
  const insets = useSafeAreaInsets();
  const { can, currentUser } = useAuth();
  const {
    members,
    users,
    memberChangeRequests,
    approveMemberChangeRequest,
    rejectMemberChangeRequest,
    withdrawMemberChangeRequest,
    assignMemberChangeRequest,
  } = useData();
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "rejected" | "cancelled">("all");
  const [pendingQueueFilter, setPendingQueueFilter] = useState<"all" | "mine" | "unassigned">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reviewerFilter, setReviewerFilter] = useState("");
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [selectedRequest, setSelectedRequest] = useState<MemberChangeRequest | null>(null);

  const canApprove = can("members.approve_changes");
  const canPropose = can("members.propose_changes");
  const visibleRequests = useMemo(() => {
    if (canApprove) return memberChangeRequests;
    if (!currentUser?.id) return [];
    return memberChangeRequests.filter((item) => item.createdByUserId === currentUser.id);
  }, [memberChangeRequests, canApprove, currentUser?.id]);
  const pendingRequests = useMemo(
    () => visibleRequests.filter((item) => item.status === "pending"),
    [visibleRequests]
  );
  const historyRequests = useMemo(() => {
    const base = visibleRequests.filter((item) => item.status !== "pending");
    if (statusFilter === "all") return base;
    return base.filter((item) => item.status === statusFilter);
  }, [visibleRequests, statusFilter]);

  const filteredPendingRequests = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    return pendingRequests.filter((item) => {
      const matchesQueue =
        pendingQueueFilter === "all" ||
        (pendingQueueFilter === "mine" && item.assignedReviewerUserId === currentUser?.id) ||
        (pendingQueueFilter === "unassigned" && !item.assignedReviewerUserId);
      if (!matchesQueue) return false;

      if (!needle) return true;
      const member = item.payload.member || {};
      return (
        String(item.id).toLowerCase().includes(needle) ||
        String(item.targetMemberId || "").toLowerCase().includes(needle) ||
        String(item.createdByUserId || "").toLowerCase().includes(needle) ||
        String(member.id || "").toLowerCase().includes(needle) ||
        String(member.name || "").toLowerCase().includes(needle) ||
        String(member.phone || "").toLowerCase().includes(needle)
      );
    });
  }, [pendingRequests, searchText, pendingQueueFilter, currentUser?.id]);

  const eligibleApprovers = useMemo(() => {
    return users.filter((user) => {
      if (!user.isActive) return false;
      if (user.systemRole === "admin") return true;
      return user.orgPosition === "chairperson" || user.orgPosition === "vice_chairperson";
    });
  }, [users]);

  const filteredHistoryRequests = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    return historyRequests.filter((item) => {
      const member = item.payload.member || {};
      const fromMs = parseDateInputToMs(dateFrom, false);
      const toMs = parseDateInputToMs(dateTo, true);
      const reviewerNeedle = reviewerFilter.trim().toLowerCase();
      const reviewedAtMs = new Date(item.reviewedAt || item.createdAt || 0).getTime();

      const matchesSearch =
        !needle ||
        String(item.id).toLowerCase().includes(needle) ||
        String(item.targetMemberId || "").toLowerCase().includes(needle) ||
        String(item.createdByUserId || "").toLowerCase().includes(needle) ||
        String(item.reviewedByUserId || "").toLowerCase().includes(needle) ||
        String(member.id || "").toLowerCase().includes(needle) ||
        String(member.name || "").toLowerCase().includes(needle) ||
        String(member.phone || "").toLowerCase().includes(needle);
      const matchesFrom = fromMs == null || reviewedAtMs >= fromMs;
      const matchesTo = toMs == null || reviewedAtMs <= toMs;
      const matchesReviewer =
        !reviewerNeedle || String(item.reviewedByUserId || "").toLowerCase().includes(reviewerNeedle);

      return matchesSearch && matchesFrom && matchesTo && matchesReviewer;
    });
  }, [historyRequests, searchText, dateFrom, dateTo, reviewerFilter]);

  const exportPayload = useMemo(
    () => ({
      type: "member_change_requests",
      exportedAt: new Date().toISOString(),
      exportedByUserId: currentUser?.id || "",
      count: visibleRequests.length,
      requests: visibleRequests,
    }),
    [visibleRequests, currentUser?.id]
  );

  useEffect(() => {
    const persistLastSeen = async () => {
      if (!currentUser?.id) return;
      await AsyncStorage.setItem(MEMBER_CHANGE_LAST_SEEN_KEY, new Date().toISOString());
    };
    void persistLastSeen();
  }, [currentUser?.id, memberChangeRequests.length]);

  const overduePendingCount = useMemo(
    () => pendingRequests.filter((item) => getPendingAgeDays(item.createdAt) >= PENDING_OVERDUE_DAYS).length,
    [pendingRequests]
  );

  if (!canApprove && !canPropose) {
    return <AccessDenied showBack={true} />;
  }

  const handleApprove = async (item: MemberChangeRequest) => {
    if (!currentUser?.id) return;
    if (item.createdByUserId === currentUser.id) {
      Alert.alert("ခွင့်မပြုပါ", "ကိုယ်တင်ထားသော request ကို ကိုယ်တိုင် approve မလုပ်နိုင်ပါ။");
      return;
    }
    const requestId = item.id;
    const reviewNote = (draftNotes[requestId] || "").trim();
    try {
      setProcessingId(requestId);
      await approveMemberChangeRequest(requestId, currentUser.id, reviewNote);
      setDraftNotes((prev) => ({ ...prev, [requestId]: "" }));
      Alert.alert("အောင်မြင်ပါသည်", "Request ကို အတည်ပြုပြီးပါပြီ။");
    } catch (error: any) {
      Alert.alert("အမှား", error?.message || "Approve မလုပ်နိုင်ပါ။");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (item: MemberChangeRequest) => {
    if (!currentUser?.id) return;
    if (item.createdByUserId === currentUser.id) {
      Alert.alert("ခွင့်မပြုပါ", "ကိုယ်တင်ထားသော request ကို ကိုယ်တိုင် reject မလုပ်နိုင်ပါ။");
      return;
    }
    const requestId = item.id;
    const reviewNote = (draftNotes[requestId] || "").trim();
    if (!reviewNote) {
      Alert.alert("လိုအပ်ချက်", "Reject လုပ်ရန် အကြောင်းပြချက် (Review Note) ထည့်ပါ။");
      return;
    }
    try {
      setProcessingId(requestId);
      await rejectMemberChangeRequest(requestId, currentUser.id, reviewNote);
      setDraftNotes((prev) => ({ ...prev, [requestId]: "" }));
      Alert.alert("လုပ်ဆောင်ပြီးပါပြီ", "Request ကို ပယ်ချပြီးပါပြီ။");
    } catch (error: any) {
      Alert.alert("အမှား", error?.message || "Reject မလုပ်နိုင်ပါ။");
    } finally {
      setProcessingId(null);
    }
  };

  const handleWithdraw = async (item: MemberChangeRequest) => {
    if (!currentUser?.id) return;
    const requestId = item.id;
    const reviewNote = (draftNotes[requestId] || "").trim();
    try {
      setProcessingId(requestId);
      await withdrawMemberChangeRequest(requestId, currentUser.id, reviewNote);
      setDraftNotes((prev) => ({ ...prev, [requestId]: "" }));
      Alert.alert("လုပ်ဆောင်ပြီးပါပြီ", "Request ကို ရုပ်သိမ်းပြီးပါပြီ။");
    } catch (error: any) {
      Alert.alert("အမှား", error?.message || "Withdraw မလုပ်နိုင်ပါ။");
    } finally {
      setProcessingId(null);
    }
  };

  const handleAssignReviewer = async (item: MemberChangeRequest, reviewerUserId: string | undefined) => {
    if (!currentUser?.id) return;
    try {
      setProcessingId(item.id);
      await assignMemberChangeRequest(item.id, reviewerUserId, currentUser.id);
      Alert.alert("လုပ်ဆောင်ပြီးပါပြီ", reviewerUserId ? "Reviewer ကို assign လုပ်ပြီးပါပြီ။" : "Assignment ကိုဖြုတ်ပြီးပါပြီ။");
    } catch (error: any) {
      Alert.alert("အမှား", error?.message || "Assign မလုပ်နိုင်ပါ။");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCopyJson = async () => {
    try {
      await Clipboard.setStringAsync(JSON.stringify(exportPayload, null, 2));
      Alert.alert("အောင်မြင်ပါသည်", "Request log JSON ကို clipboard ထဲကူးပြီးပါပြီ။");
    } catch {
      Alert.alert("အမှား", "Copy မအောင်မြင်ပါ။");
    }
  };

  const handleExportJson = async () => {
    try {
      const json = JSON.stringify(exportPayload, null, 2);
      if (Platform.OS === "web") {
        const timestamp = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `member_change_requests_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Alert.alert("အောင်မြင်ပါသည်", "Request log ဖိုင် download ပြီးပါပြီ။");
        return;
      }

      const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!directory) {
        Alert.alert("အမှား", "File directory မတွေ့ပါ။");
        return;
      }
      const timestamp = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
      const fileUri = directory + `member_change_requests_${timestamp}.json`;
      await FileSystem.writeAsStringAsync(fileUri, json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/json",
          dialogTitle: "Request log ဖိုင်သိမ်းမည့်နေရာရွေးပါ",
          UTI: "public.json",
        });
      } else {
        Alert.alert("သိမ်းပြီးပါပြီ", "ဖိုင်ကို local storage ထဲသိမ်းပြီးပါပြီ။");
      }
    } catch {
      Alert.alert("အမှား", "Export မအောင်မြင်ပါ။");
    }
  };

  const handleExportCsv = async () => {
    try {
      const headers = [
        "exported_at",
        "exported_by",
        "request_id",
        "action",
        "status",
        "target_member_id",
        "requested_name",
        "requested_phone",
        "requested_email",
        "requested_org_position",
        "requested_status",
        "created_by",
        "created_at",
        "reviewed_by",
        "reviewed_at",
        "review_note",
      ];
      const rows = filteredHistoryRequests.map((item) => {
        const member = item.payload.member || {};
        const exportedAt = new Date().toISOString();
        const exportedBy = currentUser?.id || "";
        return [
          exportedAt,
          exportedBy,
          item.id,
          item.action,
          item.status,
          item.targetMemberId || member.id || "",
          member.name || "",
          member.phone || "",
          member.email || "",
          member.orgPosition || "",
          member.status || "",
          item.createdByUserId || "",
          item.createdAt || "",
          item.reviewedByUserId || "",
          item.reviewedAt || "",
          item.reviewNote || "",
        ]
          .map(csvEscape)
          .join(",");
      });
      const csv = [headers.join(","), ...rows].join("\n");

      if (Platform.OS === "web") {
        const timestamp = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `member_change_audit_${timestamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Alert.alert("အောင်မြင်ပါသည်", "CSV audit report download ပြီးပါပြီ။");
        return;
      }

      const directory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!directory) {
        Alert.alert("အမှား", "File directory မတွေ့ပါ။");
        return;
      }
      const timestamp = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 19);
      const fileUri = directory + `member_change_audit_${timestamp}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/csv",
          dialogTitle: "CSV audit report သိမ်းမည့်နေရာရွေးပါ",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert("သိမ်းပြီးပါပြီ", "CSV ဖိုင်ကို local storage ထဲသိမ်းပြီးပါပြီ။");
      }
    } catch {
      Alert.alert("အမှား", "CSV export မအောင်မြင်ပါ။");
    }
  };

  const selectedCurrentMember = selectedRequest
    ? members.find((m) => m.id === (selectedRequest.targetMemberId || selectedRequest.payload.member?.id))
    : undefined;
  const selectedChangeLines = selectedRequest ? buildChangeLines(selectedRequest, selectedCurrentMember) : [];
  const selectedChangeRows = selectedRequest ? buildChangeRows(selectedRequest, selectedCurrentMember) : [];

  const setHistoryPreset = (mode: "today" | "7d" | "30d") => {
    const now = new Date();
    if (mode === "today") {
      const ymd = formatYmd(now);
      setDateFrom(ymd);
      setDateTo(ymd);
      return;
    }
    const from = new Date(now);
    from.setDate(now.getDate() - (mode === "7d" ? 7 : 30));
    setDateFrom(formatYmd(from));
    setDateTo(formatYmd(now));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>အသင်းဝင်ပြင်ဆင်ခွင့်တောင်းဆိုမှု</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.noteBox}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCount}>{pendingRequests.length}</Text>
            <Text style={styles.summaryLabel}>စောင့်ဆိုင်း</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCount}>{historyRequests.length}</Text>
            <Text style={styles.summaryLabel}>မှတ်တမ်း</Text>
          </View>
        </View>
        {overduePendingCount > 0 && (
          <View style={styles.slaWarnBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#B45309" />
            <Text style={styles.slaWarnText}>
              SLA သတ်မှတ်ချက် ({PENDING_OVERDUE_DAYS} ရက်) ကျော်နေသော Pending = {overduePendingCount}
            </Text>
          </View>
        )}
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="ရှာရန်: request id / member id / name / phone"
          style={styles.searchInput}
          placeholderTextColor={Colors.light.textSecondary}
        />
        <View style={styles.tabRow}>
          <Pressable style={[styles.tabBtn, tab === "pending" && styles.tabBtnActive]} onPress={() => setTab("pending")}>
            <Text style={[styles.tabText, tab === "pending" && styles.tabTextActive]}>စောင့်ဆိုင်း</Text>
          </Pressable>
          <Pressable style={[styles.tabBtn, tab === "history" && styles.tabBtnActive]} onPress={() => setTab("history")}>
            <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>မှတ်တမ်း</Text>
          </Pressable>
        </View>
        {tab === "pending" && canApprove && (
          <View style={styles.filterRow}>
            <Pressable style={[styles.filterChip, pendingQueueFilter === "all" && styles.filterChipActive]} onPress={() => setPendingQueueFilter("all")}>
              <Text style={[styles.filterChipText, pendingQueueFilter === "all" && styles.filterChipTextActive]}>အားလုံး</Text>
            </Pressable>
            <Pressable style={[styles.filterChip, pendingQueueFilter === "mine" && styles.filterChipActive]} onPress={() => setPendingQueueFilter("mine")}>
              <Text style={[styles.filterChipText, pendingQueueFilter === "mine" && styles.filterChipTextActive]}>My Queue</Text>
            </Pressable>
            <Pressable style={[styles.filterChip, pendingQueueFilter === "unassigned" && styles.filterChipActive]} onPress={() => setPendingQueueFilter("unassigned")}>
              <Text style={[styles.filterChipText, pendingQueueFilter === "unassigned" && styles.filterChipTextActive]}>Unassigned</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.toolRow}>
          <Pressable style={styles.toolBtn} onPress={handleExportJson}>
            <Ionicons name="download-outline" size={16} color={Colors.light.tint} />
            <Text style={styles.toolText}>JSON ထုတ်မည်</Text>
          </Pressable>
          <Pressable style={styles.toolBtn} onPress={handleCopyJson}>
            <Ionicons name="copy-outline" size={16} color={Colors.light.tint} />
            <Text style={styles.toolText}>JSON ကူးယူ</Text>
          </Pressable>
        </View>
        <View style={styles.toolRow}>
          <Pressable style={styles.toolBtn} onPress={handleExportCsv}>
            <Ionicons name="grid-outline" size={16} color={Colors.light.tint} />
            <Text style={styles.toolText}>CSV Audit ထုတ်မည်</Text>
          </Pressable>
        </View>
        {tab === "history" && (
          <View style={styles.historyFiltersWrap}>
            <View style={styles.presetRow}>
              <Pressable style={styles.presetChip} onPress={() => setHistoryPreset("today")}>
                <Text style={styles.presetChipText}>Today</Text>
              </Pressable>
              <Pressable style={styles.presetChip} onPress={() => setHistoryPreset("7d")}>
                <Text style={styles.presetChipText}>Last 7d</Text>
              </Pressable>
              <Pressable style={styles.presetChip} onPress={() => setHistoryPreset("30d")}>
                <Text style={styles.presetChipText}>Last 30d</Text>
              </Pressable>
            </View>
            <View style={styles.filterRow}>
              <Pressable style={[styles.filterChip, statusFilter === "all" && styles.filterChipActive]} onPress={() => setStatusFilter("all")}>
                <Text style={[styles.filterChipText, statusFilter === "all" && styles.filterChipTextActive]}>အားလုံး</Text>
              </Pressable>
              <Pressable style={[styles.filterChip, statusFilter === "approved" && styles.filterChipActive]} onPress={() => setStatusFilter("approved")}>
                <Text style={[styles.filterChipText, statusFilter === "approved" && styles.filterChipTextActive]}>အတည်ပြု</Text>
              </Pressable>
              <Pressable style={[styles.filterChip, statusFilter === "rejected" && styles.filterChipActive]} onPress={() => setStatusFilter("rejected")}>
                <Text style={[styles.filterChipText, statusFilter === "rejected" && styles.filterChipTextActive]}>ပယ်ချ</Text>
              </Pressable>
              <Pressable style={[styles.filterChip, statusFilter === "cancelled" && styles.filterChipActive]} onPress={() => setStatusFilter("cancelled")}>
                <Text style={[styles.filterChipText, statusFilter === "cancelled" && styles.filterChipTextActive]}>ရုပ်သိမ်း</Text>
              </Pressable>
            </View>
            <TextInput
              value={reviewerFilter}
              onChangeText={setReviewerFilter}
              placeholder="Reviewer user id ဖြင့် filter"
              style={styles.searchInput}
              placeholderTextColor={Colors.light.textSecondary}
            />
            <View style={styles.dateRow}>
              <TextInput
                value={dateFrom}
                onChangeText={setDateFrom}
                placeholder="From YYYY-MM-DD"
                style={[styles.searchInput, styles.dateInput]}
                placeholderTextColor={Colors.light.textSecondary}
              />
              <TextInput
                value={dateTo}
                onChangeText={setDateTo}
                placeholder="To YYYY-MM-DD"
                style={[styles.searchInput, styles.dateInput]}
                placeholderTextColor={Colors.light.textSecondary}
              />
            </View>
            <Text style={styles.historyHint}>History filters သာသက်ရောက်သည်</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {(tab === "pending" ? filteredPendingRequests : filteredHistoryRequests).length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {tab === "pending" ? "Pending request မရှိသေးပါ။" : "History မရှိသေးပါ။"}
            </Text>
          </View>
        ) : (
          (tab === "pending" ? filteredPendingRequests : filteredHistoryRequests).map((item) => {
            const member = item.payload.member || {};
            const currentMember = members.find((m) => m.id === (item.targetMemberId || (member.id as string)));
            const changeLines = buildChangeLines(item, currentMember, 8);
            const assignedToOther =
              !!item.assignedReviewerUserId &&
              !!currentUser?.id &&
              item.assignedReviewerUserId !== currentUser.id;
            const assignedUser = users.find((u) => u.id === item.assignedReviewerUserId);
            return (
              <View key={item.id} style={styles.card}>
                <Text style={styles.title}>
                  {item.action.toUpperCase()} {item.targetMemberId || (member.id as string) || "-"}
                </Text>
                <Text style={styles.meta}>By: {item.createdByUserId}</Text>
                <Text style={styles.meta}>At: {new Date(item.createdAt).toLocaleString()}</Text>
                {item.status === "pending" && (
                  <Text style={[styles.meta, getPendingAgeDays(item.createdAt) >= PENDING_OVERDUE_DAYS ? styles.overdueText : undefined]}>
                    Pending Days: {getPendingAgeDays(item.createdAt)}
                    {getPendingAgeDays(item.createdAt) >= PENDING_OVERDUE_DAYS ? " (Overdue)" : ""}
                  </Text>
                )}
                <Text style={styles.meta}>Status: {item.status.toUpperCase()}</Text>
                {!!item.assignedReviewerUserId && (
                  <Text style={styles.meta}>
                    Assigned To: {assignedUser?.displayName || item.assignedReviewerUserId}
                  </Text>
                )}
                {!item.assignedReviewerUserId && tab === "pending" && (
                  <Text style={styles.meta}>Assigned To: -</Text>
                )}
                {!!item.reviewedByUserId && <Text style={styles.meta}>Reviewed By: {item.reviewedByUserId}</Text>}
                {!!item.reviewedAt && <Text style={styles.meta}>Reviewed At: {new Date(item.reviewedAt).toLocaleString()}</Text>}
                {!!item.reviewNote && <Text style={styles.meta}>Review Note: {item.reviewNote}</Text>}
                {!!item.payload.note && <Text style={styles.meta}>Note: {item.payload.note}</Text>}
                {item.action !== "delete" && (
                  <Text style={styles.meta}>
                    Name: {String(member.name || "-")} | Phone: {String(member.phone || "-")}
                  </Text>
                )}
                <View style={styles.changePreview}>
                  <Text style={styles.changePreviewTitle}>ပြင်ဆင်မည့်အချက်များ</Text>
                  {changeLines.map((line, idx) => (
                    <Text key={`${item.id}-change-${idx}`} style={styles.changeLine}>
                      • {line}
                    </Text>
                  ))}
                  <Pressable onPress={() => setSelectedRequest(item)} style={styles.viewDetailBtn}>
                    <Text style={styles.viewDetailText}>အသေးစိတ်ကြည့်ရန်</Text>
                  </Pressable>
                </View>
                {tab === "pending" && (
                  <>
                    {canApprove && (
                      <View style={styles.assignRow}>
                        <Pressable
                          style={styles.assignChip}
                          onPress={() => handleAssignReviewer(item, currentUser?.id)}
                          disabled={processingId === item.id || !currentUser?.id}
                        >
                          <Text style={styles.assignChipText}>Assign Me</Text>
                        </Pressable>
                        <Pressable
                          style={styles.assignChip}
                          onPress={() => handleAssignReviewer(item, undefined)}
                          disabled={processingId === item.id}
                        >
                          <Text style={styles.assignChipText}>Unassign</Text>
                        </Pressable>
                        {eligibleApprovers
                          .filter((user) => user.id !== currentUser?.id)
                          .slice(0, 2)
                          .map((user) => (
                            <Pressable
                              key={`${item.id}-assign-${user.id}`}
                              style={styles.assignChip}
                              onPress={() => handleAssignReviewer(item, user.id)}
                              disabled={processingId === item.id}
                            >
                              <Text style={styles.assignChipText}>{user.displayName}</Text>
                            </Pressable>
                          ))}
                      </View>
                    )}
                    {assignedToOther && (
                      <Text style={styles.assignedWarnText}>
                        ဤ request ကို အခြား reviewer ထံ assign ထားသောကြောင့် Approve/Reject မလုပ်နိုင်ပါ။
                      </Text>
                    )}
                    <Text style={styles.noteLabel}>
                      {canApprove ? "Review Note" : "Withdraw Note"} {canApprove ? "(reject အတွက်လိုအပ်)" : "(optional)"}
                    </Text>
                    <TextInput
                      value={draftNotes[item.id] || ""}
                      onChangeText={(text) => setDraftNotes((prev) => ({ ...prev, [item.id]: text }))}
                      placeholder={canApprove ? "Approve/Reject မှတ်ချက်..." : "ရုပ်သိမ်းရတဲ့အကြောင်း..."}
                      style={styles.noteInput}
                      placeholderTextColor={Colors.light.textSecondary}
                    />
                  </>
                )}
                {canApprove && tab === "pending" && (
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={() => handleReject(item)}
                      disabled={processingId === item.id || assignedToOther}
                    >
                      <Text style={styles.actionText}>ပယ်ချ</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.approveBtn]}
                      onPress={() => handleApprove(item)}
                      disabled={processingId === item.id || assignedToOther}
                    >
                      <Text style={styles.actionText}>အတည်ပြု</Text>
                    </Pressable>
                  </View>
                )}
                {!canApprove && canPropose && tab === "pending" && (
                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={() => handleWithdraw(item)}
                      disabled={processingId === item.id}
                    >
                      <Text style={styles.actionText}>ရုပ်သိမ်း</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!selectedRequest} transparent animationType="fade" onRequestClose={() => setSelectedRequest(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request အသေးစိတ်</Text>
              <Pressable onPress={() => setSelectedRequest(null)}>
                <Ionicons name="close" size={22} color={Colors.light.text} />
              </Pressable>
            </View>
            {selectedRequest && (
              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 6 }}>
                <Text style={styles.modalMeta}>ID: {selectedRequest.id}</Text>
                <Text style={styles.modalMeta}>Action: {selectedRequest.action.toUpperCase()}</Text>
                <Text style={styles.modalMeta}>Status: {selectedRequest.status.toUpperCase()}</Text>
                <Text style={styles.modalMeta}>Created By: {selectedRequest.createdByUserId}</Text>
                <Text style={styles.modalMeta}>Created At: {new Date(selectedRequest.createdAt).toLocaleString()}</Text>
                {!!selectedRequest.reviewedByUserId && (
                  <Text style={styles.modalMeta}>Reviewed By: {selectedRequest.reviewedByUserId}</Text>
                )}
                {!!selectedRequest.reviewedAt && (
                  <Text style={styles.modalMeta}>Reviewed At: {new Date(selectedRequest.reviewedAt).toLocaleString()}</Text>
                )}
                {!!selectedRequest.reviewNote && <Text style={styles.modalMeta}>Review Note: {selectedRequest.reviewNote}</Text>}
                {!!selectedRequest.assignedReviewerUserId && (
                  <Text style={styles.modalMeta}>Assigned Reviewer: {selectedRequest.assignedReviewerUserId}</Text>
                )}
                {!!selectedRequest.assignedByUserId && (
                  <Text style={styles.modalMeta}>Assigned By: {selectedRequest.assignedByUserId}</Text>
                )}
                {!!selectedRequest.assignedAt && (
                  <Text style={styles.modalMeta}>Assigned At: {new Date(selectedRequest.assignedAt).toLocaleString()}</Text>
                )}
                {!!selectedRequest.assignmentHistory?.length && (
                  <>
                    <View style={styles.modalDivider} />
                    <Text style={styles.changePreviewTitle}>Assignment Timeline</Text>
                    {[...selectedRequest.assignmentHistory]
                      .slice()
                      .reverse()
                      .map((entry, idx) => (
                        <Text key={`${selectedRequest.id}-assign-log-${idx}`} style={styles.modalMeta}>
                          {new Date(entry.at).toLocaleString()} | {entry.action.toUpperCase()} | by {entry.byUserId}
                          {entry.toUserId ? ` -> ${entry.toUserId}` : ""}
                        </Text>
                      ))}
                  </>
                )}
                <View style={styles.modalDivider} />
                <Text style={styles.changePreviewTitle}>ပြင်ဆင်မည့်အချက်များ (Full)</Text>
                {selectedChangeRows.length > 0 && (
                  <View style={styles.diffTable}>
                    <View style={styles.diffHeaderRow}>
                      <Text style={[styles.diffCell, styles.diffHeaderCell]}>Field</Text>
                      <Text style={[styles.diffCell, styles.diffHeaderCell]}>Before</Text>
                      <Text style={[styles.diffCell, styles.diffHeaderCell]}>After</Text>
                    </View>
                    {selectedChangeRows.map((row, idx) => (
                      <View key={`${selectedRequest.id}-diff-${idx}`} style={styles.diffRow}>
                        <Text style={styles.diffCell}>{row.label}</Text>
                        <Text style={styles.diffCell}>{row.before}</Text>
                        <Text style={styles.diffCell}>{row.after}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {selectedChangeLines.map((line, idx) => (
                  <Text key={`${selectedRequest.id}-full-${idx}`} style={styles.changeLine}>
                    • {line}
                  </Text>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  noteBox: { padding: 16, gap: 8 },
  summaryRow: { flexDirection: "row", gap: 10 },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    alignItems: "center",
    paddingVertical: 10,
  },
  summaryCount: { fontSize: 18, color: Colors.light.text, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 12, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  slaWarnBox: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: "#FCD34D",
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  slaWarnText: {
    flex: 1,
    color: "#92400E",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  tabRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  tabBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: Colors.light.surface,
  },
  tabBtnActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  tabText: { color: Colors.light.textSecondary, fontFamily: "Inter_600SemiBold" },
  tabTextActive: { color: "#fff" },
  searchInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    color: Colors.light.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  filterChip: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 16,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterChipActive: {
    borderColor: Colors.light.tint,
    backgroundColor: Colors.light.tint + "15",
  },
  filterChipText: {
    color: Colors.light.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  filterChipTextActive: {
    color: Colors.light.tint,
    fontFamily: "Inter_600SemiBold",
  },
  historyFiltersWrap: { gap: 6, marginTop: 2 },
  presetRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  presetChip: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 999,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  presetChipText: {
    color: Colors.light.tint,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  dateRow: { flexDirection: "row", gap: 8 },
  dateInput: { flex: 1 },
  historyHint: {
    color: Colors.light.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  toolRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  toolBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    backgroundColor: Colors.light.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 6,
  },
  toolText: { color: Colors.light.tint, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  noteLabel: { color: Colors.light.textSecondary, fontSize: 12, fontFamily: "Inter_500Medium" },
  assignRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  assignChip: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 999,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  assignChipText: {
    color: Colors.light.tint,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  assignedWarnText: {
    color: "#B45309",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  noteInput: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    color: Colors.light.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  emptyCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
  },
  emptyText: { color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 14,
    gap: 6,
  },
  title: { color: Colors.light.text, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  meta: { color: Colors.light.textSecondary, fontSize: 12 },
  overdueText: { color: "#B45309", fontFamily: "Inter_600SemiBold" },
  changePreview: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  changePreviewTitle: {
    color: Colors.light.text,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  changeLine: {
    color: Colors.light.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  viewDetailBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  viewDetailText: {
    color: Colors.light.tint,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 14,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    color: Colors.light.text,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  modalMeta: {
    color: Colors.light.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  modalDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 4,
  },
  diffTable: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 2,
  },
  diffHeaderRow: {
    flexDirection: "row",
    backgroundColor: Colors.light.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  diffRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  diffCell: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  diffHeaderCell: {
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
  },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 4 },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  approveBtn: { backgroundColor: Colors.light.tint },
  rejectBtn: { backgroundColor: "#EF4444" },
  actionText: { color: "#fff", fontFamily: "Inter_600SemiBold" },
});

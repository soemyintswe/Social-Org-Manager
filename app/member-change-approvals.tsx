import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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

function buildChangeLines(item: MemberChangeRequest, currentMember?: any): string[] {
  if (item.action === "delete") return ["အသင်းဝင်ကို ဖျက်ရန် တောင်းဆိုထားသည်။"];
  const requested = item.payload.member || {};
  if (item.action === "create") {
    return Object.entries(requested)
      .filter(([, value]) => value !== undefined && String(value).trim() !== "")
      .slice(0, 6)
      .map(([key, value]) => `${MEMBER_FIELD_LABELS[key] || key}: ${String(value)}`);
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
  return lines.length ? lines.slice(0, 8) : ["ပြောင်းလဲမှုမတွေ့ပါ။"];
}

export default function MemberChangeApprovalsScreen() {
  const insets = useSafeAreaInsets();
  const { can, currentUser } = useAuth();
  const { members, memberChangeRequests, approveMemberChangeRequest, rejectMemberChangeRequest, withdrawMemberChangeRequest } = useData();
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "rejected" | "cancelled">("all");
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "history">("pending");

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
    if (!needle) return pendingRequests;
    return pendingRequests.filter((item) => {
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
  }, [pendingRequests, searchText]);

  const filteredHistoryRequests = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) return historyRequests;
    return historyRequests.filter((item) => {
      const member = item.payload.member || {};
      return (
        String(item.id).toLowerCase().includes(needle) ||
        String(item.targetMemberId || "").toLowerCase().includes(needle) ||
        String(item.createdByUserId || "").toLowerCase().includes(needle) ||
        String(item.reviewedByUserId || "").toLowerCase().includes(needle) ||
        String(member.id || "").toLowerCase().includes(needle) ||
        String(member.name || "").toLowerCase().includes(needle) ||
        String(member.phone || "").toLowerCase().includes(needle)
      );
    });
  }, [historyRequests, searchText]);

  const exportPayload = useMemo(
    () => ({
      type: "member_change_requests",
      exportedAt: new Date().toISOString(),
      count: visibleRequests.length,
      requests: visibleRequests,
    }),
    [visibleRequests]
  );

  useEffect(() => {
    const persistLastSeen = async () => {
      if (!currentUser?.id) return;
      await AsyncStorage.setItem(MEMBER_CHANGE_LAST_SEEN_KEY, new Date().toISOString());
    };
    void persistLastSeen();
  }, [currentUser?.id, memberChangeRequests.length]);

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
        {tab === "history" && (
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
            const changeLines = buildChangeLines(item, currentMember);
            return (
              <View key={item.id} style={styles.card}>
                <Text style={styles.title}>
                  {item.action.toUpperCase()} {item.targetMemberId || (member.id as string) || "-"}
                </Text>
                <Text style={styles.meta}>By: {item.createdByUserId}</Text>
                <Text style={styles.meta}>At: {new Date(item.createdAt).toLocaleString()}</Text>
                <Text style={styles.meta}>Status: {item.status.toUpperCase()}</Text>
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
                </View>
                {tab === "pending" && (
                  <>
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
                      disabled={processingId === item.id}
                    >
                      <Text style={styles.actionText}>ပယ်ချ</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.approveBtn]}
                      onPress={() => handleApprove(item)}
                      disabled={processingId === item.id}
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
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 4 },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  approveBtn: { backgroundColor: Colors.light.tint },
  rejectBtn: { backgroundColor: "#EF4444" },
  actionText: { color: "#fff", fontFamily: "Inter_600SemiBold" },
});

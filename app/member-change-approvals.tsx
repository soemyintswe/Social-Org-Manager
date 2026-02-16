import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { useData } from "@/lib/DataContext";
import AccessDenied from "@/components/AccessDenied";

export default function MemberChangeApprovalsScreen() {
  const insets = useSafeAreaInsets();
  const { can, currentUser } = useAuth();
  const { memberChangeRequests, approveMemberChangeRequest, rejectMemberChangeRequest } = useData();
  const [reviewNote, setReviewNote] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const canApprove = can("members.approve_changes");
  const pendingRequests = useMemo(
    () => memberChangeRequests.filter((item) => item.status === "pending"),
    [memberChangeRequests]
  );

  if (!canApprove) {
    return <AccessDenied showBack={true} />;
  }

  const handleApprove = async (requestId: string) => {
    if (!currentUser?.id) return;
    try {
      setProcessingId(requestId);
      await approveMemberChangeRequest(requestId, currentUser.id, reviewNote);
      setReviewNote("");
      Alert.alert("အောင်မြင်ပါသည်", "Request ကို အတည်ပြုပြီးပါပြီ။");
    } catch (error: any) {
      Alert.alert("အမှား", error?.message || "Approve မလုပ်နိုင်ပါ။");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!currentUser?.id) return;
    try {
      setProcessingId(requestId);
      await rejectMemberChangeRequest(requestId, currentUser.id, reviewNote);
      setReviewNote("");
      Alert.alert("လုပ်ဆောင်ပြီးပါပြီ", "Request ကို ပယ်ချပြီးပါပြီ။");
    } catch (error: any) {
      Alert.alert("အမှား", error?.message || "Reject မလုပ်နိုင်ပါ။");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Member Change Approvals</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.noteBox}>
        <Text style={styles.noteLabel}>Review Note (optional)</Text>
        <TextInput
          value={reviewNote}
          onChangeText={setReviewNote}
          placeholder="မှတ်ချက်..."
          style={styles.noteInput}
          placeholderTextColor={Colors.light.textSecondary}
        />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {pendingRequests.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Pending request မရှိသေးပါ။</Text>
          </View>
        ) : (
          pendingRequests.map((item) => {
            const member = item.payload.member || {};
            return (
              <View key={item.id} style={styles.card}>
                <Text style={styles.title}>
                  {item.action.toUpperCase()} {item.targetMemberId || (member.id as string) || "-"}
                </Text>
                <Text style={styles.meta}>By: {item.createdByUserId}</Text>
                <Text style={styles.meta}>At: {new Date(item.createdAt).toLocaleString()}</Text>
                {!!item.payload.note && <Text style={styles.meta}>Note: {item.payload.note}</Text>}
                {item.action !== "delete" && (
                  <Text style={styles.meta}>
                    Name: {String(member.name || "-")} | Phone: {String(member.phone || "-")}
                  </Text>
                )}
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={() => handleReject(item.id)}
                    disabled={processingId === item.id}
                  >
                    <Text style={styles.actionText}>Reject</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, styles.approveBtn]}
                    onPress={() => handleApprove(item.id)}
                    disabled={processingId === item.id}
                  >
                    <Text style={styles.actionText}>Approve</Text>
                  </Pressable>
                </View>
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
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 4 },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  approveBtn: { backgroundColor: Colors.light.tint },
  rejectBtn: { backgroundColor: "#EF4444" },
  actionText: { color: "#fff", fontFamily: "Inter_600SemiBold" },
});

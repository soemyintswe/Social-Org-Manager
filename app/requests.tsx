import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Colors from "../../constants/colors";
import { useData } from "../../lib/DataContext";
import { useAuth } from "../../lib/AuthContext";
import { normalizeOrgPosition } from "../../lib/types";
import { isCommitteePosition } from "../../lib/access-control";

const formatDateTime = (value?: string) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export default function RequestsScreen() {
  const insets = useSafeAreaInsets();
  const { memberChangeRequests = [], auditChangeRequests = [], members = [] } = useData() as any;
  const { currentUser, currentMember, can } = useAuth();
  const [activeTab, setActiveTab] = useState<"member" | "audit">("member");

  const canApproveMemberChanges = can("members.approve_changes");
  const canViewAuditRequests =
    can("finance.view_all") ||
    can("finance.view_detail") ||
    can("finance.view_summary") ||
    can("finance.audit_flag") ||
    isCommitteePosition(currentMember?.orgPosition || currentUser?.orgPosition);

  const memberRequests = useMemo(() => {
    const rows = Array.isArray(memberChangeRequests) ? [...memberChangeRequests] : [];
    const visible = canApproveMemberChanges ? rows : rows.filter((r: any) => r.createdByUserId === currentUser?.id);
    return visible.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [memberChangeRequests, canApproveMemberChanges, currentUser?.id]);

  const auditRequests = useMemo(() => {
    const rows = Array.isArray(auditChangeRequests) ? [...auditChangeRequests] : [];
    const visible = canViewAuditRequests ? rows : [];
    return visible.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [auditChangeRequests, canViewAuditRequests]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    (members || []).forEach((m: any) => {
      map.set(String(m?.id || ""), String(m?.name || ""));
    });
    return map;
  }, [members]);

  const memberStats = useMemo(() => {
    const pending = memberRequests.filter((row: any) => row.status === "pending").length;
    const approved = memberRequests.filter((row: any) => row.status === "approved").length;
    const rejected = memberRequests.filter((row: any) => row.status === "rejected").length;
    const cancelled = memberRequests.filter((row: any) => row.status === "cancelled").length;
    return { total: memberRequests.length, pending, approved, rejected, cancelled };
  }, [memberRequests]);

  const auditStats = useMemo(() => {
    const pending = auditRequests.filter((row: any) => row.status === "pending").length;
    const suspended = auditRequests.filter((row: any) => row.status === "suspended").length;
    const approved = auditRequests.filter((row: any) => row.status === "approved").length;
    const rejected = auditRequests.filter((row: any) => row.status === "rejected").length;
    const cancelled = auditRequests.filter((row: any) => row.status === "cancelled").length;
    return { total: auditRequests.length, pending, suspended, approved, rejected, cancelled };
  }, [auditRequests]);

  const tabs = [
    { key: "member" as const, label: "Member Change" },
    ...(canViewAuditRequests ? [{ key: "audit" as const, label: "Audit / Delete" }] : []),
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>ပြင်ဆင်ရန်တောင်းဆိုမှု</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.tabRow}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {activeTab === "member" ? (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>{canApproveMemberChanges ? "Member Change Approval Inbox" : "My Change Requests"}</Text>
              <Text style={styles.summaryMeta}>Total: {memberStats.total}</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryStat}>Pending: {memberStats.pending}</Text>
                <Text style={styles.summaryStat}>Approved: {memberStats.approved}</Text>
                <Text style={styles.summaryStat}>Rejected: {memberStats.rejected}</Text>
                <Text style={styles.summaryStat}>Cancelled: {memberStats.cancelled}</Text>
              </View>
              <Pressable style={styles.openBtn} onPress={() => router.push("/member-change-approvals" as any)}>
                <Text style={styles.openBtnText}>Open Full List</Text>
              </Pressable>
            </View>

            {memberRequests.length === 0 ? (
              <Text style={styles.emptyText}>Request မရှိသေးပါ။</Text>
            ) : (
              memberRequests.slice(0, 8).map((row: any) => {
                const targetId = String(row?.targetMemberId || row?.payload?.member?.id || "");
                const memberName = memberNameById.get(targetId) || String(row?.payload?.member?.name || "");
                const position = normalizeOrgPosition(String(row?.payload?.member?.orgPosition || ""));
                return (
                  <View key={row.id} style={styles.listCard}>
                    <Text style={styles.listTitle}>{memberName || "Member Change"}</Text>
                    <Text style={styles.listMeta}>Action: {String(row?.action || "update").toUpperCase()} • Status: {String(row?.status || "pending").toUpperCase()}</Text>
                    {!!position && <Text style={styles.listMeta}>Role: {position}</Text>}
                    {!!row?.createdAt && <Text style={styles.listMeta}>Date: {formatDateTime(row?.createdAt)}</Text>}
                  </View>
                );
              })
            )}
          </>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Audit Change Requests</Text>
              <Text style={styles.summaryMeta}>Total: {auditStats.total}</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryStat}>Pending: {auditStats.pending}</Text>
                <Text style={styles.summaryStat}>Suspended: {auditStats.suspended}</Text>
                <Text style={styles.summaryStat}>Approved: {auditStats.approved}</Text>
                <Text style={styles.summaryStat}>Rejected: {auditStats.rejected}</Text>
                <Text style={styles.summaryStat}>Cancelled: {auditStats.cancelled}</Text>
              </View>
              <Pressable style={styles.openBtn} onPress={() => router.push("/audit-change-requests" as any)}>
                <Text style={styles.openBtnText}>Open Full List</Text>
              </Pressable>
            </View>

            {auditRequests.length === 0 ? (
              <Text style={styles.emptyText}>Request မရှိသေးပါ။</Text>
            ) : (
              auditRequests.slice(0, 8).map((row: any) => (
                <Pressable
                  key={row.id}
                  style={styles.listCard}
                  onPress={() =>
                    router.push({
                      pathname: "/audit-change-requests",
                      params: { requestId: String(row?.id || "") },
                    } as any)
                  }
                >
                  <Text style={styles.listTitle}>{String(row?.requestNumber || row?.id || "Audit Request")}</Text>
                  <Text style={styles.listMeta}>Type: {String(row?.requestKind || "update")} • Status: {String(row?.status || "pending")}</Text>
                  {!!row?.amount && <Text style={styles.listMeta}>Amount: {Number(row?.amount || 0).toLocaleString()} KS</Text>}
                  {!!row?.createdAt && <Text style={styles.listMeta}>Date: {formatDateTime(row?.createdAt)}</Text>}
                </Pressable>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  headerBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.text },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: Colors.light.border },
  tabBtnActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  tabText: { fontSize: 12.5, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  tabTextActive: { color: "#fff" },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  summaryCard: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, padding: 12, marginBottom: 12 },
  summaryTitle: { fontSize: 14.5, fontFamily: "Inter_700Bold", color: Colors.light.text },
  summaryMeta: { marginTop: 4, fontSize: 12, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  summaryStat: { fontSize: 12, color: Colors.light.text, fontFamily: "Inter_600SemiBold" },
  openBtn: { alignSelf: "flex-start", marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.light.tint },
  openBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 12 },
  listCard: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, padding: 12, marginBottom: 10 },
  listTitle: { fontSize: 13.5, fontFamily: "Inter_700Bold", color: Colors.light.text },
  listMeta: { marginTop: 4, fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  emptyText: { paddingVertical: 40, textAlign: "center", color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
});

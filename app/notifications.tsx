import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "../../constants/colors";
import { useData } from "../../lib/DataContext";
import { useAuth } from "../../lib/AuthContext";
import { resolveNotificationRoute } from "../../lib/notification-routing";

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { notifications = [], markNotificationRead, deleteNotificationsForUser } = useData() as any;
  const { currentUser } = useAuth();
  const me = String(currentUser?.id || "").trim();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const visible = useMemo(() => {
    return [...(notifications || [])]
      .filter((item: any) => {
        const targets = Array.isArray(item?.targetUserIds) ? item.targetUserIds.map((v: any) => String(v || "").trim()) : [];
        return me && targets.includes(me);
      })
      .sort((a: any, b: any) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
  }, [notifications, me]);

  const unreadCount = useMemo(() => {
    return visible.filter((item: any) => {
      const readBy = Array.isArray(item?.readByUserIds) ? item.readByUserIds.map((v: any) => String(v || "").trim()) : [];
      return !readBy.includes(me);
    }).length;
  }, [visible, me]);

  const markAllRead = async () => {
    for (const item of visible) {
      const readBy = Array.isArray(item?.readByUserIds) ? item.readByUserIds.map((v: any) => String(v || "").trim()) : [];
      if (!readBy.includes(me)) {
        await markNotificationRead(String(item.id || ""), me);
      }
    }
  };

  const selectedSet = useMemo(() => new Set((selectedIds || []).map((id) => String(id || ""))), [selectedIds]);
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev.map((row) => String(row || "")));
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return Array.from(next.values());
    });
  };
  const selectAll = () => setSelectedIds(visible.map((item: any) => String(item?.id || "")).filter(Boolean));
  const clearSelection = () => setSelectedIds([]);
  const deleteSelected = async () => {
    if (!me) return;
    if (selectedIds.length === 0) {
      return Alert.alert("လိုအပ်ချက်", "ဖျက်လိုသော အသိပေးချက်ကို ရွေးချယ်ပါ။");
    }
    const ok = Platform.OS === "web"
      ? window.confirm(`ရွေးထားသော ${selectedIds.length} ခုကို ဖျက်ပါမည်။ ဆက်လုပ်မလား?`)
      : await new Promise<boolean>((resolve) => {
          Alert.alert("ဖျက်မည်", `ရွေးထားသော ${selectedIds.length} ခုကို ဖျက်ပါမည်။ ဆက်လုပ်မလား?`, [
            { text: "မလုပ်တော့ပါ", style: "cancel", onPress: () => resolve(false) },
            { text: "လုပ်မည်", style: "destructive", onPress: () => resolve(true) },
          ]);
        });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteNotificationsForUser(selectedIds, me);
      clearSelection();
      setSelectMode(false);
    } finally {
      setDeleting(false);
    }
  };

  const openNotification = async (item: any) => {
    if (selectMode) {
      toggleSelection(String(item?.id || ""));
      return;
    }
    await markNotificationRead(String(item?.id || ""), me);
    const target = resolveNotificationRoute(item);
    if (target.pathname === "/notifications") return;
    router.push(
      target.params
        ? ({ pathname: target.pathname, params: target.params } as any)
        : (target.pathname as any)
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.light.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>အသိပေးချက်များ</Text>
          <Text style={styles.headerSub}>Unread: {unreadCount}</Text>
        </View>
        <Pressable style={styles.headerBtn} onPress={() => setSelectMode((prev) => !prev)}>
          <Ionicons name={selectMode ? "close-circle-outline" : "checkbox-outline"} size={22} color={Colors.light.textSecondary} />
        </Pressable>
        <Pressable style={styles.headerBtn} onPress={() => void markAllRead()}>
          <Ionicons name="checkmark-done-outline" size={22} color={Colors.light.tint} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {selectMode && (
          <View style={styles.selectionBar}>
            <Pressable style={styles.selectionBtn} onPress={selectAll}>
              <Text style={styles.selectionBtnText}>Select All</Text>
            </Pressable>
            <Pressable style={styles.selectionBtn} onPress={clearSelection}>
              <Text style={styles.selectionBtnText}>Deselect All</Text>
            </Pressable>
            <Pressable
              style={[styles.selectionBtn, styles.deleteBtn, (selectedIds.length === 0 || deleting) && { opacity: 0.6 }]}
              disabled={selectedIds.length === 0 || deleting}
              onPress={() => void deleteSelected()}
            >
              {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.deleteBtnText}>Delete Selected ({selectedIds.length})</Text>}
            </Pressable>
          </View>
        )}
        {visible.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="notifications-off-outline" size={42} color={Colors.light.textSecondary} />
            <Text style={styles.emptyText}>အသိပေးချက်မရှိသေးပါ။</Text>
          </View>
        ) : (
          visible.map((item: any) => {
            const readBy = Array.isArray(item?.readByUserIds) ? item.readByUserIds.map((v: any) => String(v || "").trim()) : [];
            const unread = !readBy.includes(me);
            const isSelected = selectedSet.has(String(item?.id || ""));
            return (
              <Pressable
                key={String(item?.id || "")}
                style={[styles.card, unread && styles.cardUnread]}
                onPress={() => void openNotification(item)}
              >
                <View style={styles.row}>
                  <Text style={styles.title}>{String(item?.title || "-")}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {selectMode ? (
                      <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={18} color={isSelected ? Colors.light.tint : Colors.light.textSecondary} />
                    ) : null}
                    {unread ? <View style={styles.dot} /> : null}
                    <Ionicons name="chevron-forward" size={16} color={Colors.light.textSecondary} />
                  </View>
                </View>
                <Text style={styles.desc}>{String(item?.description || "-")}</Text>
                <Text style={styles.meta}>{new Date(String(item?.createdAt || "")).toLocaleString()}</Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingBottom: 10 },
  headerBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  headerSub: { fontSize: 12.5, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  body: { paddingHorizontal: 14, paddingBottom: 24 },
  selectionBar: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  selectionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#fff",
  },
  selectionBtnText: { fontSize: 12.5, color: Colors.light.text, fontFamily: "Inter_600SemiBold" },
  deleteBtn: { backgroundColor: "#EF4444", borderColor: "#EF4444" },
  deleteBtnText: { fontSize: 12.5, color: "#fff", fontFamily: "Inter_700Bold" },
  emptyWrap: { paddingTop: 80, alignItems: "center", gap: 8 },
  emptyText: { color: Colors.light.textSecondary, fontSize: 14, fontFamily: "Inter_500Medium" },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  cardUnread: {
    borderColor: "#67E8F9",
    backgroundColor: "#F0FDFF",
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { flex: 1, fontSize: 14, color: Colors.light.text, fontFamily: "Inter_700Bold" },
  desc: { marginTop: 4, fontSize: 13, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  meta: { marginTop: 6, fontSize: 11.5, color: Colors.light.textSecondary, fontFamily: "Inter_400Regular" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#0EA5E9" },
});

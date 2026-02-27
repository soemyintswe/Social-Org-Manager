import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { notifications = [], markNotificationRead } = useData() as any;
  const { currentUser } = useAuth();
  const me = String(currentUser?.id || "").trim();

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
        <Pressable style={styles.headerBtn} onPress={() => void markAllRead()}>
          <Ionicons name="checkmark-done-outline" size={22} color={Colors.light.tint} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {visible.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="notifications-off-outline" size={42} color={Colors.light.textSecondary} />
            <Text style={styles.emptyText}>အသိပေးချက်မရှိသေးပါ။</Text>
          </View>
        ) : (
          visible.map((item: any) => {
            const readBy = Array.isArray(item?.readByUserIds) ? item.readByUserIds.map((v: any) => String(v || "").trim()) : [];
            const unread = !readBy.includes(me);
            return (
              <Pressable
                key={String(item?.id || "")}
                style={[styles.card, unread && styles.cardUnread]}
                onPress={() => void markNotificationRead(String(item?.id || ""), me)}
              >
                <View style={styles.row}>
                  <Text style={styles.title}>{String(item?.title || "-")}</Text>
                  {unread ? <View style={styles.dot} /> : null}
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


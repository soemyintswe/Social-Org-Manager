import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { useData } from "@/lib/DataContext";
import { normalizeOrgPosition, ORG_POSITION_LABELS } from "@/lib/types";

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { members, refreshData } = useData();
  const { loading, isAuthenticated, availableUsers, signIn } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const memberById = useMemo(() => {
    return new Map(members.map((member) => [member.id, member]));
  }, [members]);

  useEffect(() => {
    if (!availableUsers.length) {
      setSelectedUserId("");
      return;
    }
    if (!selectedUserId || !availableUsers.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(availableUsers[0].id);
    }
  }, [availableUsers, selectedUserId]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/" />;
  }

  const handleSignIn = async () => {
    if (!selectedUserId || submitting) return;
    setSubmitting(true);
    try {
      const ok = await signIn(selectedUserId);
      if (!ok) {
        Alert.alert("Sign In Failed", "ရွေးထားသော account ဖြင့် Sign In မအောင်မြင်ပါ။");
        return;
      }
      router.replace("/");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>OrgHub Sign In</Text>
        <Text style={styles.subtitle}>အသုံးပြုလိုသော Account တစ်ခုရွေးပြီး ဝင်ရောက်ပါ။</Text>

        <View style={styles.card}>
          {availableUsers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={28} color={Colors.light.textSecondary} />
              <Text style={styles.emptyTitle}>အသုံးပြုနိုင်သော Account မရှိပါ</Text>
              <Text style={styles.emptyText}>
                Member data နှင့် user account synchronization ပြန်လုပ်ရန် Refresh ကိုနှိပ်ပါ။
              </Text>
              <Pressable style={styles.refreshBtn} onPress={() => void refreshData()}>
                <Ionicons name="refresh-outline" size={18} color="#fff" />
                <Text style={styles.refreshText}>Refresh</Text>
              </Pressable>
            </View>
          ) : (
            availableUsers.map((user) => {
              const selected = selectedUserId === user.id;
              const member = user.memberId ? memberById.get(user.memberId) : undefined;
              const orgPosition = normalizeOrgPosition(user.orgPosition || member?.orgPosition || member?.status || "member");
              const roleText = user.systemRole === "admin" ? "System Admin" : ORG_POSITION_LABELS[orgPosition];

              return (
                <Pressable
                  key={user.id}
                  style={[styles.userRow, selected && styles.userRowActive]}
                  onPress={() => setSelectedUserId(user.id)}
                >
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{user.displayName}</Text>
                    <Text style={styles.userMeta}>
                      {roleText}
                      {user.memberId ? ` • ${user.memberId}` : ""}
                    </Text>
                  </View>
                  <Ionicons
                    name={selected ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={selected ? Colors.light.tint : Colors.light.textSecondary}
                  />
                </Pressable>
              );
            })
          )}
        </View>

        <Pressable
          style={[styles.signInBtn, (!selectedUserId || submitting) && { opacity: 0.6 }]}
          onPress={handleSignIn}
          disabled={!selectedUserId || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="log-in-outline" size={18} color="#fff" />
              <Text style={styles.signInText}>Sign In</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.light.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    marginTop: 24,
    fontSize: 24,
    color: Colors.light.text,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  card: {
    marginTop: 18,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: "hidden",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  userRowActive: {
    backgroundColor: Colors.light.tint + "12",
  },
  userInfo: {
    flex: 1,
    marginRight: 10,
  },
  userName: {
    fontSize: 15,
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
  },
  userMeta: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  signInBtn: {
    marginTop: 18,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  signInText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  emptyState: {
    padding: 18,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: {
    marginTop: 4,
    fontSize: 15,
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
  },
  emptyText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
  },
  refreshBtn: {
    marginTop: 8,
    minHeight: 38,
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: Colors.light.tint,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  refreshText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});

import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";

export default function GroupDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { groups, members, editGroup, removeGroup } = useData();

  const group = groups.find((g) => g.id === id);
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  if (!group) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyText}>Group not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const groupMembers = members.filter((m) => group.memberIds.includes(m.id));
  const nonMembers = members.filter((m) => !group.memberIds.includes(m.id));

  const handleAddMember = async (memberId: string) => {
    const newIds = [...group.memberIds, memberId];
    await editGroup(group.id, { memberIds: newIds });
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRemoveMember = async (memberId: string) => {
    const newIds = group.memberIds.filter((id) => id !== memberId);
    await editGroup(group.id, { memberIds: newIds });
  };

  const handleDelete = () => {
    Alert.alert("Delete Group", `Remove "${group.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await removeGroup(group.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 + webTopInset }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Pressable onPress={handleDelete} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Ionicons name="trash-outline" size={22} color={Colors.light.accent} />
        </Pressable>
      </View>

      <View style={styles.groupHeader}>
        <View style={[styles.groupIcon, { backgroundColor: group.color + "20" }]}>
          <Ionicons name="people" size={32} color={group.color} />
        </View>
        <Text style={styles.groupName}>{group.name}</Text>
        {group.description ? (
          <Text style={styles.groupDesc}>{group.description}</Text>
        ) : null}
        <Text style={styles.groupMeta}>
          {groupMembers.length} member{groupMembers.length !== 1 ? "s" : ""}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Members</Text>
        {groupMembers.length === 0 ? (
          <View style={styles.emptyMembers}>
            <Text style={styles.emptyMembersText}>No members in this group</Text>
          </View>
        ) : (
          groupMembers.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <View style={[styles.memberAvatar, { backgroundColor: m.avatarColor }]}>
                <Text style={styles.memberInitials}>
                  {(m.firstName[0] + m.lastName[0]).toUpperCase()}
                </Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {m.firstName} {m.lastName}
                </Text>
                <Text style={styles.memberRole}>
                  {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                </Text>
              </View>
              <Pressable onPress={() => handleRemoveMember(m.id)}>
                <Ionicons name="close-circle-outline" size={22} color={Colors.light.textSecondary} />
              </Pressable>
            </View>
          ))
        )}
      </View>

      {nonMembers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Members</Text>
          {nonMembers.map((m) => (
            <Pressable
              key={m.id}
              style={({ pressed }) => [styles.addMemberRow, pressed && { opacity: 0.7 }]}
              onPress={() => handleAddMember(m.id)}
            >
              <View style={[styles.memberAvatar, { backgroundColor: m.avatarColor }]}>
                <Text style={styles.memberInitials}>
                  {(m.firstName[0] + m.lastName[0]).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.memberAddName} numberOfLines={1}>
                {m.firstName} {m.lastName}
              </Text>
              <Ionicons name="add-circle-outline" size={22} color={Colors.light.tint} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  groupHeader: {
    alignItems: "center",
    marginBottom: 28,
  },
  groupIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  groupName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    marginBottom: 6,
  },
  groupDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  groupMeta: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.tint,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 12,
  },
  emptyMembers: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
  },
  emptyMembersText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  memberInitials: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  memberInfo: { flex: 1 },
  memberName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  memberRole: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  addMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderStyle: "dashed",
  },
  memberAddName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginBottom: 12,
  },
  backLink: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
});

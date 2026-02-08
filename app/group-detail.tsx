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
    try {
      await editGroup(group.id, { memberIds: newIds });
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      Alert.alert("Error", "Failed to add member");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    const newIds = group.memberIds.filter((id) => id !== memberId);
    try {
      await editGroup(group.id, { memberIds: newIds });
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      Alert.alert("Error", "Failed to remove member");
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete Group", "Are you sure you want to delete this group?", [
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
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 + webTopInset }]}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{group.name}</Text>
        <Pressable onPress={handleDelete}>
          <Ionicons name="trash-outline" size={22} color={Colors.light.error} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members ({groupMembers.length})</Text>
          {groupMembers.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <View style={[styles.memberAvatar, { backgroundColor: (m as any).color || Colors.light.tint }]}>
                <Text style={styles.memberInitials}>{m.name.charAt(0)}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{m.name}</Text>
                <Text style={styles.memberRole}>{(m as any).status || "Member"}</Text>
              </View>
              <Pressable onPress={() => handleRemoveMember(m.id)}>
                <Ionicons name="remove-circle-outline" size={22} color={Colors.light.error} />
              </Pressable>
            </View>
          ))}
          {groupMembers.length === 0 && (
            <View style={styles.emptyMembers}>
              <Text style={styles.emptyMembersText}>No members in this group</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Members</Text>
          {nonMembers.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => handleAddMember(m.id)}
              style={styles.memberRow}
            >
              <View style={[styles.memberAvatar, { backgroundColor: (m as any).color || Colors.light.tintSecondary }]}>
                <Text style={styles.memberInitials}>{m.name.charAt(0)}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{m.name}</Text>
                <Text style={styles.memberRole}>{(m as any).status || "Member"}</Text>
              </View>
              <Ionicons name="add-circle-outline" size={22} color={Colors.light.tint} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  content: { padding: 20 },
  section: { marginBottom: 30 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
    marginBottom: 12,
    textTransform: "uppercase",
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
  memberAvatar: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  memberInitials: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text },
  memberRole: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  emptyMembers: { backgroundColor: Colors.light.surface, borderRadius: 14, padding: 20, alignItems: "center" },
  emptyMembersText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  emptyText: { fontSize: 16, color: Colors.light.textSecondary, marginBottom: 10 },
  backLink: { color: Colors.light.tint, fontSize: 16 },
});
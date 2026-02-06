import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";

function InfoRow({ icon, label, value }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={Colors.light.tint} />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function MemberDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { members, groups, editMember, removeMember } = useData();
  const [editing, setEditing] = useState(false);

  const member = members.find((m) => m.id === id);
  const memberGroups = groups.filter((g) => member && g.memberIds.includes(member.id));

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const [firstName, setFirstName] = useState(member?.firstName || "");
  const [lastName, setLastName] = useState(member?.lastName || "");
  const [email, setEmail] = useState(member?.email || "");
  const [phone, setPhone] = useState(member?.phone || "");

  if (!member) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyText}>Member not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const initials = (member.firstName[0] || "") + (member.lastName[0] || "");

  const handleSave = async () => {
    await editMember(member.id, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
    });
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditing(false);
  };

  const handleToggleStatus = async () => {
    const newStatus = member.status === "active" ? "inactive" : "active";
    await editMember(member.id, { status: newStatus });
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDelete = () => {
    Alert.alert("Delete Member", `Remove ${member.firstName} ${member.lastName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await removeMember(member.id);
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
        <View style={styles.headerActions}>
          {editing ? (
            <Pressable onPress={handleSave} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
              <Ionicons name="checkmark" size={24} color={Colors.light.tint} />
            </Pressable>
          ) : (
            <Pressable onPress={() => setEditing(true)} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
              <Ionicons name="create-outline" size={22} color={Colors.light.text} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.profileSection}>
        <View style={[styles.bigAvatar, { backgroundColor: member.avatarColor }]}>
          <Text style={styles.bigAvatarText}>{initials.toUpperCase()}</Text>
        </View>
        {editing ? (
          <View style={styles.editNameRow}>
            <TextInput
              style={[styles.editInput, { flex: 1 }]}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First"
              placeholderTextColor={Colors.light.textSecondary}
            />
            <TextInput
              style={[styles.editInput, { flex: 1 }]}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last"
              placeholderTextColor={Colors.light.textSecondary}
            />
          </View>
        ) : (
          <Text style={styles.profileName}>{member.firstName} {member.lastName}</Text>
        )}
        <View style={styles.roleRow}>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
            </Text>
          </View>
          <Pressable
            onPress={handleToggleStatus}
            style={[
              styles.statusBadge,
              member.status === "active" ? styles.statusActive : styles.statusInactive,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                member.status === "active" ? styles.statusActiveText : styles.statusInactiveText,
              ]}
            >
              {member.status === "active" ? "Active" : "Inactive"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Information</Text>
        {editing ? (
          <>
            <Text style={styles.editLabel}>Email</Text>
            <TextInput
              style={styles.editInput}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={Colors.light.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.editLabel}>Phone</Text>
            <TextInput
              style={styles.editInput}
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone"
              placeholderTextColor={Colors.light.textSecondary}
              keyboardType="phone-pad"
            />
          </>
        ) : (
          <View style={styles.infoCard}>
            <InfoRow icon="mail-outline" label="Email" value={member.email} />
            <InfoRow icon="call-outline" label="Phone" value={member.phone} />
            <InfoRow
              icon="calendar-outline"
              label="Joined"
              value={new Date(member.joinDate).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            />
          </View>
        )}
      </View>

      {memberGroups.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Groups</Text>
          {memberGroups.map((g) => (
            <Pressable
              key={g.id}
              style={styles.groupChip}
              onPress={() => router.push({ pathname: "/group-detail", params: { id: g.id } })}
            >
              <View style={[styles.groupDot, { backgroundColor: g.color }]} />
              <Text style={styles.groupChipText}>{g.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable
        onPress={handleDelete}
        style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="trash-outline" size={18} color={Colors.light.accent} />
        <Text style={styles.deleteBtnText}>Delete Member</Text>
      </Pressable>

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
  headerActions: { flexDirection: "row", gap: 16 },
  profileSection: { alignItems: "center", marginBottom: 28 },
  bigAvatar: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  bigAvatarText: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  profileName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    marginBottom: 8,
  },
  editNameRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginBottom: 8,
  },
  roleRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  roleBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.light.tintLight,
  },
  roleBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusActive: { backgroundColor: Colors.light.success + "15" },
  statusInactive: { backgroundColor: Colors.light.accent + "15" },
  statusBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statusActiveText: { color: Colors.light.success },
  statusInactiveText: { color: Colors.light.accent },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 4,
    shadowColor: Colors.light.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.light.tintLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  infoContent: { flex: 1 },
  infoLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    marginTop: 2,
  },
  editLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
    marginTop: 12,
    marginBottom: 4,
  },
  editInput: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  groupChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 10,
  },
  groupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  groupChipText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.light.accent + "10",
    marginTop: 8,
  },
  deleteBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.accent,
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

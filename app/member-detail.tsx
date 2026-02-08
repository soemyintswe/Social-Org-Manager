  import React, { useState } from "react"; 
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
    value: string | undefined;
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
    const { members, groups, updateMember, deleteMember } = useData();
    const [editing, setEditing] = useState(false);

    const member = members.find((m) => m.id === id);

    // Form states
    const [name, setName] = useState(member?.name || "");
    const [phone, setPhone] = useState(member?.phone || "");
    const [email, setEmail] = useState(member?.email || "");
    const [address, setAddress] = useState(member?.address || "");

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

    const memberGroups = groups.filter((g) => g.memberIds.includes(member.id));
    const initials = name ? name.charAt(0).toUpperCase() : "M";

    const handleSave = async () => {
      if (!name.trim() || !phone.trim()) {
        Alert.alert("Required", "Name and Phone are required");
        return;
      }

      try {
        await updateMember(member.id, {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
        });

        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setEditing(false);
      } catch (err) {
        Alert.alert("Error", "Failed to update member");
      }
    };

    const handleDelete = () => {
      Alert.alert("Delete Member", "Are you sure you want to delete this member?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteMember(member.id);
            router.back();
          },
        },
      ]);
    };

    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => (editing ? setEditing(false) : router.back())}>
            <Ionicons name={editing ? "close" : "chevron-back"} size={26} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{editing ? "Edit Member" : "Member Profile"}</Text>
          <Pressable onPress={() => (editing ? handleSave() : setEditing(true))}>
            <Text style={[styles.editBtn, editing && styles.saveBtn]}>{editing ? "Save" : "Edit"}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.profileCard}>
            <View style={[styles.avatar, { backgroundColor: member.avatarColor || Colors.light.tint }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.memberName}>{member.name}</Text>
            <Text style={styles.memberRole}>{(member as any).role || "Member"}</Text>
          </View>

          {editing ? (
            <View style={styles.editForm}>
              <Text style={styles.editLabel}>Full Name</Text>
              <TextInput style={styles.editInput} value={name} onChangeText={setName} placeholder="Enter full name" />

              <Text style={styles.editLabel}>Phone Number</Text>
              <TextInput style={styles.editInput} value={phone} onChangeText={setPhone} placeholder="Enter phone number" keyboardType="phone-pad" />

              <Text style={styles.editLabel}>Email Address</Text>
              <TextInput style={styles.editInput} value={email} onChangeText={setEmail} placeholder="Enter email address" keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.editLabel}>Address</Text>
              <TextInput style={[styles.editInput, { height: 80 }]} value={address} onChangeText={setAddress} placeholder="Enter address" multiline />
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <InfoRow icon="call-outline" label="Phone" value={member.phone} />
                <InfoRow icon="mail-outline" label="Email" value={member.email || "No Email"} />
                <InfoRow icon="location-outline" label="Address" value={member.address || "No Address"} />
                <InfoRow icon="calendar-outline" label="Joined Date" value={new Date(member.joinDate).toLocaleDateString()} />
              </View>

              <Text style={styles.sectionTitle}>Groups</Text>
              {memberGroups.length > 0 ? (
                memberGroups.map((group) => (
                  <View key={group.id} style={styles.groupChip}>
                    <View style={[styles.groupDot, { backgroundColor: group.color }]} />
                    <Text style={styles.groupChipText}>{group.name}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.emptyGroups}>
                  <Text style={styles.emptyGroupsText}>Not in any groups</Text>
                </View>
              )}

              <Pressable style={styles.deleteBtn} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color={Colors.light.error} />
                <Text style={styles.deleteBtnText}>Delete Member</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.light.background },
    center: { justifyContent: "center", alignItems: "center" },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, backgroundColor: Colors.light.surface },
    headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
    editBtn: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.tint },
    saveBtn: { color: Colors.light.success },
    content: { padding: 20 },
    profileCard: { alignItems: "center", marginBottom: 24 },
    avatar: { width: 80, height: 80, borderRadius: 30, justifyContent: "center", alignItems: "center", marginBottom: 12 },
    avatarText: { color: "#fff", fontSize: 32, fontFamily: "Inter_700Bold" },
    memberName: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text },
    memberRole: { fontSize: 14, color: Colors.light.textSecondary, marginTop: 4 },
    section: { backgroundColor: Colors.light.surface, borderRadius: 16, padding: 16, marginBottom: 24 },
    infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
    infoIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.light.background, justifyContent: "center", alignItems: "center", marginRight: 12 },
    infoContent: { flex: 1 },
    infoLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
    infoValue: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.text },
    sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text, marginBottom: 12 },
    groupChip: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surface, borderRadius: 12, padding: 14, marginBottom: 8, gap: 10 },
    groupDot: { width: 10, height: 10, borderRadius: 5 },
    groupChipText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text },
    emptyGroups: { padding: 16, alignItems: "center" },
    emptyGroupsText: { color: Colors.light.textSecondary, fontSize: 14 },
    deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 20, padding: 15, gap: 8 },
    deleteBtnText: { color: Colors.light.error, fontSize: 16, fontFamily: "Inter_600SemiBold" },
    editForm: { gap: 12 },
    editLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginTop: 10 },
    editInput: { backgroundColor: Colors.light.surface, borderRadius: 10, padding: 12, fontSize: 15, color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border },
    emptyText: { fontSize: 16, color: Colors.light.textSecondary, marginBottom: 10 },
    backLink: { color: Colors.light.tint, fontSize: 16 },
  });
  const [address, setAddress] = useState<string>(member?.address || "");

  const webTopInset = Platform.OS === "web" ? 67 : 0;

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

  const memberGroups = groups.filter((g) => g.memberIds.includes(member.id));

  const handleUpdate = async () => {
    try {
      await updateMember(member.id, {
        name,
        phone,
        address,
      });
      setEditing(false);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert("Error", "Failed to update member");
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete Member", "Are you sure you want to delete this member?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteMember(member.id);
          router.back();
        },
      },
    ]);
  };

  // Error အရှင်းဆုံးနည်းလမ်း: name သည် string ဖြစ်ကြောင်း အာမခံလိုက်ပါသည်
  const getAvatarLetter = () => {
    const n = name || "M";
    return n.charAt(0).toUpperCase();
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 + webTopInset }]}>
        <Pressable onPress={() => (editing ? setEditing(false) : router.back())}>
          <Ionicons name={editing ? "close" : "chevron-back"} size={26} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{editing ? "Edit Member" : "Member Detail"}</Text>
        <Pressable onPress={() => (editing ? handleUpdate() : setEditing(true))}>
          <Text style={styles.editBtnText}>{editing ? "Save" : "Edit"}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: (member as any).color || Colors.light.tint }]}>
            <Text style={styles.avatarText}>{getAvatarLetter()}</Text>
          </View>
          {editing ? (
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Full Name"
            />
          ) : (
            <Text style={styles.profileName}>{member.name}</Text>
          )}
          <Text style={styles.profileStatus}>{(member as any).status || "Active"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Information</Text>
          <View style={styles.card}>
            {editing ? (
              <View style={styles.editForm}>
                <Text style={styles.editLabel}>Phone</Text>
                <TextInput style={styles.editInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                <Text style={styles.editLabel}>Address</Text>
                <TextInput style={styles.editInput} value={address} onChangeText={setAddress} multiline />
              </View>
            ) : (
              <>
                <InfoRow icon="call-outline" label="Phone" value={member.phone} />
                <InfoRow icon="location-outline" label="Address" value={member.address} />
                <InfoRow icon="calendar-outline" label="Join Date" value={member.joinDate} />
              </>
            )}
          </View>
        </View>

        {!editing && memberGroups.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Groups</Text>
            {memberGroups.map((group) => (
              <View key={group.id} style={styles.groupChip}>
                <View style={[styles.groupDot, { backgroundColor: Colors.light.tint }]} />
                <Text style={styles.groupChipText}>{group.name}</Text>
              </View>
            ))}
          </View>
        )}

        {!editing && (
          <Pressable style={styles.deleteBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <Text style={styles.deleteBtnText}>Delete Member</Text>
          </Pressable>
        )}
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
  editBtnText: { fontSize: 16, color: Colors.light.tint, fontFamily: "Inter_600SemiBold" },
  content: { padding: 20 },
  profileHeader: { alignItems: "center", marginBottom: 30 },
  avatar: { width: 80, height: 80, borderRadius: 25, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  avatarText: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#fff" },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text },
  nameInput: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text, borderBottomWidth: 1, borderBottomColor: Colors.light.tint, width: '80%', textAlign: 'center' },
  profileStatus: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginBottom: 10, textTransform: "uppercase" },
  card: { backgroundColor: Colors.light.surface, borderRadius: 16, padding: 16 },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.light.background, justifyContent: "center", alignItems: "center", marginRight: 12 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  infoValue: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.text },
  editForm: { gap: 12 },
  editLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginTop: 10 },
  editInput: { backgroundColor: Colors.light.background, borderRadius: 10, padding: 12, fontSize: 15, color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border },
  groupChip: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surface, borderRadius: 12, padding: 14, marginBottom: 8, gap: 10 },
  groupDot: { width: 10, height: 10, borderRadius: 5 },
  groupChipText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20, padding: 16 },
  deleteBtnText: { color: "#EF4444", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 16, color: Colors.light.textSecondary, marginBottom: 10 },
  backLink: { color: Colors.light.tint, fontSize: 16 },
});
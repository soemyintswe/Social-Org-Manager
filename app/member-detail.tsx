import React, { useState } from "react"; 
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  Image,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
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
<<<<<<< HEAD
  const { members, groups, editMember, removeMember } = useData() as any;
  const [editing, setEditing] = useState(false);

  const member = members.find((m: any) => m.id === id);
  const memberGroups = groups.filter((g: any) => member && g.memberIds.includes(member.id));
=======
  const { members, groups, updateMember, deleteMember } = useData();

  const member = members.find((m) => m.id === id);
  const [editing, setEditing] = useState(false);
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee

  const [editName, setEditName] = useState(member?.name || "");
  const [editEmail, setEditEmail] = useState(member?.email || "");
  const [editPhone, setEditPhone] = useState(member?.phone || "");
  const [editAddress, setEditAddress] = useState(member?.address || "");
  const [saving, setSaving] = useState(false);

  if (!member) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text>Member not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: Colors.light.tint }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const memberGroups = groups.filter((g) => g.memberIds.includes(member.id));
  const webTopInset = Platform.OS === "web" ? 67 : 0;

<<<<<<< HEAD
  const handleSave = async () => {
    await editMember(member.id, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
    });
    setEditing(false);
  };

  const handleToggleStatus = async () => {
    const newStatus = member.status === "active" ? "inactive" : "active";
    await editMember(member.id, { status: newStatus });
=======
  const handleUpdate = async () => {
    if (!editName.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }
    setSaving(true);
    try {
      await updateMember(member.id, {
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        address: editAddress.trim(),
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
    } catch (err) {
      Alert.alert("Error", "Could not update member");
    } finally {
      setSaving(false);
    }
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
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

  // createdAt error ကို ရှောင်ရန် helper variable
  const createdAtValue = (member as any).createdAt;

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"} 
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 || webTopInset }]}>
        <Pressable onPress={() => (editing ? setEditing(false) : router.back())}>
          <Ionicons name={editing ? "close" : "arrow-back"} size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{editing ? "Edit Profile" : "Member Profile"}</Text>
        <Pressable onPress={editing ? handleUpdate : () => setEditing(true)} disabled={saving}>
          <Text style={[styles.editBtnText, { color: Colors.light.tint }]}>
            {editing ? (saving ? "Saving..." : "Done") : "Edit"}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: member.avatarColor }]}>
            <Text style={styles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{member.name}</Text>

          {/* createdAt ရှိမှသာ ပြသရန်နှင့် error မတက်စေရန် ပြင်ဆင်ထားပါသည် */}
          {createdAtValue && (
            <Text style={styles.joinDate}>
              Joined on {new Date(createdAtValue).toLocaleDateString()}
            </Text>
          )}
        </View>

<<<<<<< HEAD
      <View style={styles.profileSection}>
        {member.profileImage ? (
          <Image source={{ uri: member.profileImage }} style={styles.bigAvatar} />
        ) : (
          <View style={[styles.bigAvatar, { backgroundColor: member.avatarColor }]}>
            <Text style={styles.bigAvatarText}>{initials.toUpperCase()}</Text>
          </View>
        )}
=======
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
        {editing ? (
          <View style={styles.editForm}>
            <Text style={styles.editLabel}>Full Name</Text>
            <TextInput style={styles.editInput} value={editName} onChangeText={setEditName} />

            <Text style={styles.editLabel}>Email Address</Text>
            <TextInput style={styles.editInput} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" />

<<<<<<< HEAD
      {memberGroups.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Groups</Text>
          {memberGroups.map((g: any) => (
            <Pressable
              key={g.id}
              style={styles.groupChip}
              onPress={() => router.push({ pathname: "/group-detail", params: { id: g.id } })}
            >
              <View style={[styles.groupDot, { backgroundColor: g.color }]} />
              <Text style={styles.groupChipText}>{g.name}</Text>
=======
            <Text style={styles.editLabel}>Phone Number</Text>
            <TextInput style={styles.editInput} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />

            <Text style={styles.editLabel}>Address</Text>
            <TextInput style={styles.editInput} value={editAddress} onChangeText={setEditAddress} multiline />

            <Pressable style={styles.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={styles.deleteBtnText}>Delete Member</Text>
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
            </Pressable>
          </View>
        ) : (
          <View>
            <View style={styles.infoCard}>
              <InfoRow icon="mail-outline" label="Email" value={member.email} />
              <InfoRow icon="call-outline" label="Phone" value={member.phone} />
              <InfoRow icon="location-outline" label="Address" value={member.address} />
            </View>

            <Text style={styles.sectionTitle}>Groups</Text>
            {memberGroups.length > 0 ? (
              memberGroups.map((g) => (
                <View key={g.id} style={styles.groupChip}>
                  <View style={[styles.groupDot, { backgroundColor: g.color }]} />
                  <Text style={styles.groupChipText}>{g.name}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>Not assigned to any groups</Text>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, backgroundColor: Colors.light.surface },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  editBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  content: { padding: 20 },
  profileHeader: { alignItems: "center", marginBottom: 30 },
  avatar: { width: 80, height: 80, borderRadius: 40, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  avatarText: { fontSize: 32, color: "#fff", fontWeight: "bold" },
  name: { fontSize: 22, fontWeight: "700", color: Colors.light.text },
  joinDate: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 4 },
  infoCard: { backgroundColor: Colors.light.surface, borderRadius: 16, padding: 16, marginBottom: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.light.background, justifyContent: "center", alignItems: "center", marginRight: 12 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, color: Colors.light.textSecondary },
  infoValue: { fontSize: 15, color: Colors.light.text },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12, color: Colors.light.text },
  groupChip: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surface, borderRadius: 12, padding: 14, marginBottom: 8, gap: 10 },
  groupDot: { width: 10, height: 10, borderRadius: 5 },
  groupChipText: { fontSize: 14, color: Colors.light.text },
  emptyText: { color: Colors.light.textSecondary, fontSize: 14, fontStyle: "italic" },
  editForm: { gap: 4 },
  editLabel: { fontSize: 12, fontWeight: "600", color: Colors.light.textSecondary, marginTop: 12 },
  editInput: { backgroundColor: Colors.light.surface, borderRadius: 10, padding: 12, fontSize: 16, color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, marginTop: 20 },
  deleteBtnText: { color: "#EF4444", fontWeight: "600" },
});
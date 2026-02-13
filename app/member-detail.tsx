import React, { useState, useMemo } from "react";
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
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { CATEGORY_LABELS } from "@/lib/types";

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
  const { members, groups, updateMember, deleteMember, transactions, loans, getLoanOutstanding } = useData() as any;
  const member = members?.find((m: any) => m.id === id);

  const [editName, setEditName] = useState(member?.name || "");
  const [editEmail, setEditEmail] = useState(member?.email || "");
  const [editPhone, setEditPhone] = useState(member?.phone || "");
  const [editAddress, setEditAddress] = useState(member?.address || "");
  const [editResignDate, setEditResignDate] = useState(member?.resignDate || "");
  const [editing, setEditing] = useState(false);
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

  const memberGroups = groups?.filter((g: any) => g.memberIds.includes(member?.id)) || [];
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  // Financial Calculations
  const memberTxns = useMemo(() => transactions?.filter((t: any) => t.memberId === member.id) || [], [transactions, member.id]);
  const memberLoans = useMemo(() => loans?.filter((l: any) => l.memberId === member.id) || [], [loans, member.id]);

  const stats = useMemo(() => {
    return {
      totalIncome: memberTxns.filter((t: any) => t.type === 'income').reduce((acc: number, t: any) => acc + t.amount, 0),
      totalExpense: memberTxns.filter((t: any) => t.type === 'expense').reduce((acc: number, t: any) => acc + t.amount, 0),
      feesPaid: memberTxns.filter((t: any) => t.category === 'member_fees').reduce((acc: number, t: any) => acc + t.amount, 0),
      loanPrincipal: memberLoans.reduce((acc: number, l: any) => acc + l.amount, 0),
      loanOutstanding: memberLoans.reduce((acc: number, l: any) => acc + getLoanOutstanding(l.id), 0),
      activeLoans: memberLoans.filter((l: any) => l.status === 'active').length,
    };
  }, [memberTxns, memberLoans]);


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
        resignDate: editResignDate.trim(),
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
    } catch (err) {
      Alert.alert("Error", "Could not update member");
    } finally {
      setSaving(false);
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

  // createdAt error ကို ရှောင်ရန် helper variable
  const createdAtValue = (member as any).createdAt;

  // နှုတ်ထွက်သည့်နေ့ ရှိ/မရှိ စစ်ဆေးပြီး Status သတ်မှတ်ခြင်း
  const isResigned = member?.resignDate && String(member.resignDate).trim() !== "";
  const statusLabel = isResigned ? "နှုတ်ထွက်" : "ပုံမှန်";

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
          <View style={[styles.avatar, { backgroundColor: member.avatarColor, overflow: "hidden" }]}>
            {member.profileImage ? (
              <Image source={{ uri: member.profileImage }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.name}>{member.name}</Text>

          {/* createdAt ရှိမှသာ ပြသရန်နှင့် error မတက်စေရန် ပြင်ဆင်ထားပါသည် */}
          {createdAtValue && (
            <Text style={styles.joinDate}>
              Joined on {new Date(createdAtValue).toLocaleDateString()}
            </Text>
          )}
        </View>

        {editing ? (
          <View style={styles.editForm}>
            <Text style={styles.editLabel}>Full Name</Text>
            <TextInput style={styles.editInput} value={editName} onChangeText={setEditName} />

            <Text style={styles.editLabel}>Email Address</Text>
            <TextInput style={styles.editInput} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" />

            <Text style={styles.editLabel}>Phone Number</Text>
            <TextInput style={styles.editInput} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />

            <Text style={styles.editLabel}>Address</Text>
            <TextInput style={styles.editInput} value={editAddress} onChangeText={setEditAddress} multiline />

            <Text style={styles.editLabel}>Resign Date (နှုတ်ထွက်သည့်နေ့)</Text>
            <TextInput 
              style={styles.editInput} 
              value={editResignDate} 
              onChangeText={setEditResignDate} 
              placeholder="YYYY-MM-DD" 
            />

            <Pressable style={styles.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={styles.deleteBtnText}>Delete Member</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <View style={styles.infoCard}>
              <InfoRow 
                icon={isResigned ? "alert-circle-outline" : "checkmark-circle-outline"} 
                label="အခြေအနေ" 
                value={statusLabel} 
              />
              {isResigned && <InfoRow icon="calendar-outline" label="နှုတ်ထွက်သည့်နေ့" value={member.resignDate} />}
              <InfoRow icon="mail-outline" label="Email" value={member.email} />
              <InfoRow icon="call-outline" label="Phone" value={member.phone} />
              <InfoRow icon="location-outline" label="Address" value={member.address} />
            </View>

            <Text style={styles.sectionTitle}>Financial Report</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>စုစုပေါင်း ပေးသွင်း</Text>
                <Text style={[styles.statValue, { color: Colors.light.success }]}>{stats.totalIncome.toLocaleString()} KS</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>စုစုပေါင်း ထုတ်ယူ</Text>
                <Text style={[styles.statValue, { color: Colors.light.accent }]}>{stats.totalExpense.toLocaleString()} KS</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>လစဉ်ကြေး ပေးသွင်း</Text>
                <Text style={[styles.statValue, { color: Colors.light.tint }]}>{stats.feesPaid.toLocaleString()} KS</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>ချေးငွေ လက်ကျန်</Text>
                <Text style={[styles.statValue, { color: "#F59E0B" }]}>{stats.loanOutstanding.toLocaleString()} KS</Text>
                <Text style={styles.statSub}>{stats.activeLoans} active loans</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            {memberTxns.length > 0 ? (
              memberTxns.slice(0, 5).map((t: any) => (
                <View key={t.id} style={styles.txnRow}>
                  <View style={[styles.txnIcon, { backgroundColor: t.type === 'income' ? Colors.light.success + "15" : Colors.light.accent + "15" }]}>
                    <Ionicons name={t.type === 'income' ? "arrow-down" : "arrow-up"} size={16} color={t.type === 'income' ? Colors.light.success : Colors.light.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txnCat}>{t.categoryLabel || CATEGORY_LABELS[t.category as keyof typeof CATEGORY_LABELS] || t.category}</Text>
                    <Text style={styles.txnDate}>{new Date(t.date).toLocaleDateString()}</Text>
                  </View>
                  <Text style={[styles.txnAmount, { color: t.type === 'income' ? Colors.light.success : Colors.light.accent }]}>
                    {t.type === 'income' ? "+" : "-"}{t.amount.toLocaleString()}
                  </Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No transactions found</Text>
              </View>
            )}
            <View style={{ height: 20 }} />

            <Text style={styles.sectionTitle}>Groups</Text>
            {memberGroups.length > 0 ? (
              memberGroups.map((g: any) => (
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
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: { width: '48%', backgroundColor: Colors.light.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border },
  statLabel: { fontSize: 11, color: Colors.light.textSecondary, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: "700" },
  statSub: { fontSize: 10, color: Colors.light.textSecondary, marginTop: 2 },
  txnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.light.border, gap: 12 },
  txnIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  txnCat: { fontSize: 14, fontWeight: "600", color: Colors.light.text },
  txnDate: { fontSize: 11, color: Colors.light.textSecondary },
  txnAmount: { fontSize: 14, fontWeight: "700" },
  emptyState: { padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.surface, borderRadius: 12, marginBottom: 20 },
});
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
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import {
  CATEGORY_LABELS,
  MEMBER_STATUS_LABELS,
  MEMBER_STATUS_VALUES,
  normalizeMemberStatus,
  type MemberStatus,
} from "@/lib/types";
import { formatDateDdMmYyyy, formatPhoneForDisplay, normalizeDateText, parseGregorianDate, splitPhoneNumbers } from "@/lib/member-utils";

const getAvatarLabel = (name: string) => {
  if (!name) return "?";
  let text = name.trim();
  const prefixes = ["ဆရာတော်", "ဦး", "ဒေါ်", "မောင်", "ကို", "မ", "ကိုရင်", "ဦးဇင်း", "ဆရာလေး", "သီလရှင်"];
  prefixes.sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      const remaining = text.slice(prefix.length).trim();
      if (remaining.length > 0) {
        text = remaining;
        break;
      }
    }
  }
  return text.charAt(0).toUpperCase();
};

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
  const { members, groups, updateMember, deleteMember, transactions, loans, getLoanOutstanding, updateTransaction, updateLoan, updateGroup } = useData() as any;
  const member = members?.find((m: any) => m.id === id);

  const [editName, setEditName] = useState(member?.name || "");
  const [editMemberId, setEditMemberId] = useState(member?.id || "");
  const [editEmail, setEditEmail] = useState(member?.email || "");
  const [editDob, setEditDob] = useState(member?.dob || "");
  const [editPhone, setEditPhone] = useState(member?.phone || "");
  const [editSecondaryPhone, setEditSecondaryPhone] = useState((member as any)?.secondaryPhone || "");
  const [editAddress, setEditAddress] = useState(member?.address || "");
  const [editStatus, setEditStatus] = useState<MemberStatus>(normalizeMemberStatus(member?.status));
  const [editStatusDate, setEditStatusDate] = useState((member as any)?.statusDate || member?.resignDate || "");
  const [editStatusReason, setEditStatusReason] = useState((member as any)?.statusReason || "");
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [showStatusDatePicker, setShowStatusDatePicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const memberIdValue = member?.id || "";
  const memberGroups = groups?.filter((g: any) => g.memberIds.includes(memberIdValue)) || [];
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  // Financial Calculations
  const memberTxns = useMemo(() => transactions?.filter((t: any) => t.memberId === memberIdValue) || [], [transactions, memberIdValue]);
  const memberLoans = useMemo(() => loans?.filter((l: any) => l.memberId === memberIdValue) || [], [loans, memberIdValue]);

  const stats = useMemo(() => {
    return {
      totalIncome: memberTxns.filter((t: any) => t.type === 'income').reduce((acc: number, t: any) => acc + t.amount, 0),
      totalExpense: memberTxns.filter((t: any) => t.type === 'expense').reduce((acc: number, t: any) => acc + t.amount, 0),
      feesPaid: memberTxns.filter((t: any) => t.category === 'member_fees').reduce((acc: number, t: any) => acc + t.amount, 0),
      loanPrincipal: memberLoans.reduce((acc: number, l: any) => acc + l.amount, 0),
      loanOutstanding: memberLoans.reduce((acc: number, l: any) => acc + getLoanOutstanding(l.id), 0),
      activeLoans: memberLoans.filter((l: any) => l.status === 'active').length,
    };
  }, [memberTxns, memberLoans, getLoanOutstanding]);

  const handleDobChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDobPicker(false);
    }
    if (selectedDate) {
      setEditDob(formatDateDdMmYyyy(selectedDate));
    }
  };

  const getInitialDate = () => {
    return parseGregorianDate(editDob) || new Date();
  };

  const handleUpdate = async () => {
    if (!editName.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }
    if (!editMemberId.trim()) {
      Alert.alert("Error", "Member ID is required");
      return;
    }

    setSaving(true);
    try {
      // ID ပြောင်းလဲမှုရှိမရှိ စစ်ဆေးခြင်း
      if (editMemberId.trim() !== member.id) {
        const existing = members.find((m: any) => m.id === editMemberId.trim());
        if (existing) {
          Alert.alert("Error", "ဤ Member ID ဖြင့် အသင်းဝင်ရှိပြီးသားဖြစ်နေပါသည်။");
          setSaving(false);
          return;
        }

        // Cascade Update: Transactions
        const memberTxns = transactions.filter((t: any) => t.memberId === member.id);
        for (const txn of memberTxns) {
          if (updateTransaction) await updateTransaction(txn.id, { ...txn, memberId: editMemberId.trim() });
        }

        // Cascade Update: Loans
        const memberLoans = loans.filter((l: any) => l.memberId === member.id);
        for (const loan of memberLoans) {
          if (updateLoan) await updateLoan(loan.id, { ...loan, memberId: editMemberId.trim() });
        }

        // Cascade Update: Groups
        const memberGroups = groups.filter((g: any) => g.memberIds.includes(member.id));
        for (const group of memberGroups) {
          const newMemberIds = group.memberIds.map((mid: string) => mid === member.id ? editMemberId.trim() : mid);
          if (updateGroup) await updateGroup(group.id, { ...group, memberIds: newMemberIds });
        }
      }

      const { primaryPhone, secondaryPhone } = splitPhoneNumbers(editPhone, editSecondaryPhone);
      const normalizedStatusDate = normalizeDateText(editStatusDate);
      await updateMember(member.id, {
        id: editMemberId.trim(),
        name: editName.trim(),
        dob: normalizeDateText(editDob),
        email: editEmail.trim(),
        phone: primaryPhone,
        secondaryPhone: secondaryPhone || undefined,
        address: editAddress.trim(),
        status: normalizeMemberStatus(editStatus),
        statusDate: normalizedStatusDate || undefined,
        resignDate: normalizedStatusDate || undefined,
        statusReason: editStatusReason.trim() || undefined,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
      // ID ပြောင်းသွားရင် Route ပါ ပြောင်းပေးရမယ် (သို့) Back ပြန်
      if (editMemberId.trim() !== member.id) {
        router.replace({ pathname: "/member-detail", params: { id: editMemberId.trim() } } as any);
      }
    } catch {
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
  const createdAtValue = (member as any)?.createdAt;

  const currentStatus = normalizeMemberStatus(member?.status);
  const statusLabel = MEMBER_STATUS_LABELS[currentStatus];
  const statusDateLabel = (member as any)?.statusDate || member?.resignDate || "";
  const statusReasonLabel = (member as any)?.statusReason || "";

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
              <Text style={styles.avatarText}>{getAvatarLabel(member.name)}</Text>
            )}
          </View>
          <Text style={styles.name}>{member.name}</Text>

          {/* createdAt ရှိမှသာ ပြသရန်နှင့် error မတက်စေရန် ပြင်ဆင်ထားပါသည် */}
          {createdAtValue && (
            <Text style={styles.joinDate}>
              Joined on {new Date(createdAtValue).toLocaleDateString()}
            </Text>
          )}

          <Pressable 
            style={styles.cardBtn} 
            onPress={() => router.push({ pathname: "/member-card", params: { id: member.id } } as any)}
          >
            <Ionicons name="card-outline" size={18} color="#fff" />
            <Text style={styles.cardBtnText}>View Member Card</Text>
          </Pressable>
        </View>

        {editing ? (
          <View style={styles.editForm}>
            <Text style={styles.editLabel}>Member ID</Text>
            <TextInput style={styles.editInput} value={editMemberId} onChangeText={setEditMemberId} />

            <Text style={styles.editLabel}>Full Name</Text>
            <TextInput style={styles.editInput} value={editName} onChangeText={setEditName} />

            <Text style={styles.editLabel}>Date of Birth</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TextInput
                style={[styles.editInput, { flex: 1 }]}
                value={editDob}
                onChangeText={setEditDob}
                placeholder="DD/MM/YYYY"
              />
              {Platform.OS === 'web' ? (
                <View style={[styles.editInput, { width: 50, justifyContent: 'center', alignItems: 'center', padding: 0 }]}>
                  <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                  {React.createElement('input', {
                    type: 'date',
                    style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' },
                    onChange: (e: any) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-');
                        setEditDob(normalizeDateText(`${d}/${m}/${y}`));
                      }
                    }
                  })}
                </View>
              ) : (
                <Pressable onPress={() => setShowDobPicker(true)} style={[styles.editInput, { width: 50, justifyContent: 'center', alignItems: 'center', padding: 0 }]}>
                  <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                </Pressable>
              )}
            </View>
            {showDobPicker && Platform.OS !== 'web' && (
              <DateTimePicker
                value={getInitialDate()}
                mode="date"
                display="default"
                onChange={handleDobChange}
              />
            )}

            <Text style={styles.editLabel}>Email Address</Text>
            <TextInput style={styles.editInput} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" />

            <Text style={styles.editLabel}>Phone Number</Text>
            <TextInput style={styles.editInput} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
            <Text style={styles.editLabel}>Secondary Phone Number</Text>
            <TextInput style={styles.editInput} value={editSecondaryPhone} onChangeText={setEditSecondaryPhone} keyboardType="phone-pad" />

            <Text style={styles.editLabel}>Status</Text>
            <View style={styles.statusRow}>
              {MEMBER_STATUS_VALUES.map((statusOption) => (
                <Pressable
                  key={statusOption}
                  style={[styles.statusChip, editStatus === statusOption ? styles.statusChipActive : undefined]}
                  onPress={() => setEditStatus(statusOption)}
                >
                  <Text style={[styles.statusChipText, editStatus === statusOption ? styles.statusChipTextActive : undefined]}>
                    {MEMBER_STATUS_LABELS[statusOption]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.editLabel}>Status Date</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TextInput
                style={[styles.editInput, { flex: 1 }]}
                value={editStatusDate}
                onChangeText={setEditStatusDate}
                placeholder="DD/MM/YYYY"
              />
              {Platform.OS === "web" ? (
                <View style={[styles.editInput, { width: 50, justifyContent: "center", alignItems: "center", padding: 0 }]}>
                  <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                  {React.createElement("input", {
                    type: "date",
                    style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" },
                    onChange: (e: any) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split("-");
                        setEditStatusDate(normalizeDateText(`${d}/${m}/${y}`));
                      }
                    },
                  })}
                </View>
              ) : (
                <Pressable
                  onPress={() => setShowStatusDatePicker(true)}
                  style={[styles.editInput, { width: 50, justifyContent: "center", alignItems: "center", padding: 0 }]}
                >
                  <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                </Pressable>
              )}
            </View>
            {showStatusDatePicker && Platform.OS !== "web" && (
              <DateTimePicker
                value={parseGregorianDate(editStatusDate) || new Date()}
                mode="date"
                display="default"
                onChange={(_event, selectedDate) => {
                  if (Platform.OS === "android") setShowStatusDatePicker(false);
                  if (selectedDate) setEditStatusDate(formatDateDdMmYyyy(selectedDate));
                }}
              />
            )}

            <Text style={styles.editLabel}>Status Note</Text>
            <TextInput
              style={[styles.editInput, { minHeight: 70, textAlignVertical: "top" }]}
              value={editStatusReason}
              onChangeText={setEditStatusReason}
              placeholder="အခြေအနေမှတ်ချက်"
              multiline
            />

            <Text style={styles.editLabel}>Address</Text>
            <TextInput style={styles.editInput} value={editAddress} onChangeText={setEditAddress} multiline />

            <Pressable style={styles.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={styles.deleteBtnText}>Delete Member</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <View style={styles.infoCard}>
              <InfoRow 
                icon={currentStatus === "active" ? "checkmark-circle-outline" : "alert-circle-outline"} 
                label="အခြေအနေ" 
                value={statusLabel} 
              />
              <InfoRow icon="gift-outline" label="မွေးသက္ကရာဇ်" value={member.dob} />
              <InfoRow icon="calendar-outline" label="Status Date" value={statusDateLabel} />
              <InfoRow icon="document-text-outline" label="Status Note" value={statusReasonLabel} />
              <InfoRow icon="mail-outline" label="Email" value={member.email} />
              <InfoRow icon="call-outline" label="Phone" value={formatPhoneForDisplay(member.phone, (member as any).secondaryPhone) || member.phone} />
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
  cardBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.tint, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 16, gap: 6 },
  cardBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
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
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  statusChip: {
    minWidth: "31%",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  statusChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  statusChipText: { fontSize: 12, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  statusChipTextActive: { color: "#fff", fontFamily: "Inter_600SemiBold" },
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

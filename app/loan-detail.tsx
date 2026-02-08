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
    KeyboardAvoidingView,
  } from "react-native";
  import { useSafeAreaInsets } from "react-native-safe-area-context";
  import { Ionicons } from "@expo/vector-icons";
  import { router, useLocalSearchParams } from "expo-router";
  import * as Haptics from "expo-haptics";
  import Colors from "@/constants/colors";
  import { useData } from "@/lib/DataContext";
  import { generateReceiptNumber } from "@/lib/storage";

  export default function LoanDetailScreen() {
    const insets = useSafeAreaInsets();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { 
      loans, 
      members, 
      transactions, 
      getLoanOutstanding, 
      getLoanInterestDue, 
      addTransaction, 
      removeLoan 
    } = useData();

    const loan = loans.find((l) => l.id === id);
    const member = members.find((m) => m.id === loan?.memberId);
    const loanRepayments = useMemo(() => 
      transactions.filter((t) => t.loanId === id && t.type === "income"),
      [transactions, id]
    );

    const [showRepayment, setShowRepayment] = useState(false);
    const [repayAmount, setRepayAmount] = useState("");
    const [repayMethod, setRepayMethod] = useState<"cash" | "bank">("cash");
    const [saving, setSaving] = useState(false);

    if (!loan || !member) {
      return (
        <View style={[styles.container, styles.center]}>
          <Text style={styles.emptyText}>Loan records not found</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backLink}>Go Back</Text>
          </Pressable>
        </View>
      );
    }

    const outstanding = getLoanOutstanding(loan.id);
    const interestDue = getLoanInterestDue(loan.id);

    const handleRepayment = async () => {
      const amount = parseFloat(repayAmount);
      if (isNaN(amount) || amount <= 0) {
        Alert.alert("Invalid Amount", "Please enter a valid amount to repay.");
        return;
      }

      setSaving(true);
      try {
        await addTransaction({
          type: "income",
          category: "loan_repayment",
          amount: amount,
          memberId: member.id,
          loanId: loan.id,
          description: `Loan repayment from ${member.name}`,
          date: new Date().toISOString(),
          paymentMethod: repayMethod,
          receiptNumber: generateReceiptNumber(),
          createdAt: new Date().toISOString(),
        });

        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setRepayAmount("");
        setShowRepayment(false);
        Alert.alert("Success", "Repayment recorded successfully.");
      } catch (err) {
        Alert.alert("Error", "Failed to record repayment.");
      } finally {
        setSaving(false);
      }
    };

    const handleDeleteLoan = () => {
      Alert.alert("Delete Loan", "Are you sure you want to delete this loan record?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await removeLoan(loan.id);
            router.back();
          },
        },
      ]);
    };

    return (
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={styles.container}
      >
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={26} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Loan Details</Text>
          <Pressable onPress={handleDeleteLoan}>
            <Ionicons name="trash-outline" size={22} color={Colors.light.error} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.memberCard}>
            <View style={[styles.avatar, { backgroundColor: member.avatarColor || Colors.light.tint }]}>
              <Text style={styles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{member.name}</Text>
              <Text style={styles.memberSubtitle}>Borrower</Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total Loan</Text>
              <Text style={styles.statValue}>{loan.amount.toLocaleString()} {/* currency */}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Outstanding</Text>
              <Text style={[styles.statValue, { color: Colors.light.error }]}>{outstanding.toLocaleString()}</Text>
            </View>
          </View>

          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Interest Rate</Text>
              <Text style={styles.infoValue}>{loan.interestRate}% monthly</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Interest Due</Text>
              <Text style={styles.infoValue}>{interestDue.toLocaleString()}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Issued Date</Text>
              <Text style={styles.infoValue}>{new Date(loan.startDate).toLocaleDateString()}</Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Repayment History</Text>
            <Pressable 
              style={styles.addRepayBtn} 
              onPress={() => setShowRepayment(!showRepayment)}
            >
              <Ionicons name={showRepayment ? "close" : "add"} size={20} color="#fff" />
              <Text style={styles.addRepayText}>{showRepayment ? "Cancel" : "Add Payment"}</Text>
            </Pressable>
          </View>

          {showRepayment && (
            <View style={styles.repayForm}>
              <TextInput
                style={styles.input}
                placeholder="Amount"
                keyboardType="numeric"
                value={repayAmount}
                onChangeText={setRepayAmount}
              />
              <View style={styles.methodToggle}>
                <Pressable 
                  style={[styles.methodBtn, repayMethod === "cash" && styles.methodBtnActive]}
                  onPress={() => setRepayMethod("cash")}
                >
                  <Text style={[styles.methodText, repayMethod === "cash" && styles.methodTextActive]}>Cash</Text>
                </Pressable>
                <Pressable 
                  style={[styles.methodBtn, repayMethod === "bank" && styles.methodBtnActive]}
                  onPress={() => setRepayMethod("bank")}
                >
                  <Text style={[styles.methodText, repayMethod === "bank" && styles.methodTextActive]}>Bank</Text>
                </Pressable>
              </View>
              <Pressable 
                style={[styles.submitBtn, saving && { opacity: 0.7 }]} 
                onPress={handleRepayment}
                disabled={saving}
              >
                <Text style={styles.submitBtnText}>{saving ? "Saving..." : "Record Repayment"}</Text>
              </Pressable>
            </View>
          )}

          {loanRepayments.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No repayments recorded yet.</Text>
            </View>
          ) : (
            loanRepayments.map((t) => (
              <View key={t.id} style={styles.repayRow}>
                <View>
                  <Text style={styles.repayDate}>{new Date(t.date).toLocaleDateString()}</Text>
                  <Text style={styles.repayMethod}>{t.paymentMethod.toUpperCase()}</Text>
                </View>
                <Text style={styles.repayAmt}>+ {t.amount.toLocaleString()}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.light.background },
    center: { justifyContent: "center", alignItems: "center", padding: 20 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 15, backgroundColor: Colors.light.surface },
    headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
    content: { padding: 20 },
    memberCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surface, padding: 16, borderRadius: 16, marginBottom: 20 },
    avatar: { width: 50, height: 50, borderRadius: 18, justifyContent: "center", alignItems: "center", marginRight: 15 },
    avatarText: { color: "#fff", fontSize: 20, fontWeight: "bold" },
    memberName: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
    memberSubtitle: { fontSize: 13, color: Colors.light.textSecondary },
    statsGrid: { flexDirection: "row", gap: 15, marginBottom: 20 },
    statBox: { flex: 1, backgroundColor: Colors.light.surface, padding: 16, borderRadius: 16 },
    statLabel: { fontSize: 12, color: Colors.light.textSecondary, marginBottom: 5 },
    statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
    infoSection: { backgroundColor: Colors.light.surface, padding: 16, borderRadius: 16, marginBottom: 25 },
    infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
    infoLabel: { color: Colors.light.textSecondary },
    infoValue: { fontFamily: "Inter_500Medium" },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
    sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
    addRepayBtn: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.tint, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 4 },
    addRepayText: { color: "#fff", fontSize: 13, fontWeight: "600" },
    repayForm: { backgroundColor: Colors.light.surface, padding: 15, borderRadius: 16, marginBottom: 20, gap: 12, borderWidth: 1, borderColor: Colors.light.border },
    input: { backgroundColor: Colors.light.background, padding: 12, borderRadius: 10, fontSize: 16 },
    methodToggle: { flexDirection: "row", backgroundColor: Colors.light.background, borderRadius: 10, padding: 4 },
    methodBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
    methodBtnActive: { backgroundColor: Colors.light.surface, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    methodText: { fontSize: 13, color: Colors.light.textSecondary },
    methodTextActive: { color: Colors.light.tint, fontWeight: "600" },
    submitBtn: { backgroundColor: Colors.light.success, padding: 14, borderRadius: 10, alignItems: "center" },
    submitBtnText: { color: "#fff", fontWeight: "700" },
    repayRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.light.surface, padding: 14, borderRadius: 12, marginBottom: 8 },
    repayDate: { fontSize: 14, fontWeight: "500" },
    repayMethod: { fontSize: 11, color: Colors.light.textSecondary },
    repayAmt: { fontSize: 15, fontWeight: "700", color: Colors.light.success },
    emptyBox: { alignItems: "center", padding: 30 },
    emptyText: { color: Colors.light.textSecondary },
    backLink: { color: Colors.light.tint, marginTop: 10, fontWeight: "600" }
  });

  const member = members.find((m) => m.id === id);

  // States initialization
  const [name, setName] = useState<string>(member?.name || "");
  const [email, setEmail] = useState<string>(member?.email || "");
  const [phone, setPhone] = useState<string>(member?.phone || "");

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
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  // Initials logic with type safety
  const safeName: string = name || "Member";
  const initials = safeName.substring(0, 1).toUpperCase();

  const handleSave = async () => {
    try {
      await updateMember(member.id, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
    } catch (err) {
      Alert.alert("Error", "Failed to update member");
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete Member", `Remove ${name}?`, [
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
        <View style={[styles.bigAvatar, { backgroundColor: (member as any).avatarColor || Colors.light.tint }]}>
          <Text style={styles.bigAvatarText}>{initials}</Text>
        </View>
        {editing ? (
          <TextInput
            style={[styles.editInput, { width: "100%" }]}
            value={name}
            onChangeText={setName}
            placeholder="Full Name"
            placeholderTextColor={Colors.light.textSecondary}
          />
        ) : (
          <Text style={styles.profileName}>{member.name}</Text>
        )}
        <View style={styles.roleRow}>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>
              {(member as any).role ? (member as any).role.charAt(0).toUpperCase() + (member as any).role.slice(1) : "Member"}
            </Text>
          </View>
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
              value={member.joinDate ? new Date(member.joinDate).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              }) : ""}
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
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
import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { CATEGORY_LABELS } from "@/lib/types";

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] }]}
      onPress={onPress}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={24} color={Colors.light.tint} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { 
    members, 
    transactions, 
    loans, 
    getTotalBalance, 
    getLoanOutstanding,
    loading 
  } = useData();

  const recentTransactions = transactions
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const totalLoanOutstanding = loans.reduce(
    (acc, loan) => acc + getLoanOutstanding(loan.id),
    0
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>မင်္ဂလာပါ</Text>
          <Text style={styles.orgName}>OrgHub Dashboard</Text>
        </View>
        <Pressable 
          style={styles.profileBtn}
          onPress={() => router.push("/account-settings")}
        >
          <Ionicons name="settings-outline" size={24} color={Colors.light.text} />
        </Pressable>
      </View>

      <View style={styles.statsGrid}>
        <StatCard icon="people" label="အသင်းဝင်" value={members.length.toString()} color="#8B5CF6" />
        <StatCard icon="wallet" label="စုစုပေါင်းလက်ကျန်" value={`${getTotalBalance().toLocaleString()} KS`} color="#10B981" />
        <StatCard icon="cash" label="ချေးငွေလက်ကျန်" value={`${totalLoanOutstanding.toLocaleString()} KS`} color="#F59E0B" />
        <StatCard icon="calendar" label="မှတ်တမ်းများ" value={transactions.length.toString()} color="#3B82F6" />
      </View>

      <Text style={styles.sectionTitle}>အမြန်လုပ်ဆောင်ချက်များ</Text>
      <View style={styles.quickActions}>
        <QuickAction icon="person-add" label="အသင်းဝင်သစ်" onPress={() => router.push("/add-member")} />
        <QuickAction icon="add-circle" label="ငွေစာရင်းသစ်" onPress={() => router.push("/add-transaction")} />
        <QuickAction icon="business" label="ချေးငွေအသစ်" onPress={() => router.push("/add-loan")} />
      </View>

      <View style={styles.recentSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleNoPadding}>နောက်ဆုံးမှတ်တမ်းများ</Text>
          <Pressable onPress={() => router.push("/finance")}>
            <Text style={styles.seeAll}>အားလုံးကြည့်ရန်</Text>
          </Pressable>
        </View>

        {recentTransactions.map((txn) => {
          const isIncome = txn.type === "income";
          return (
            <View key={txn.id} style={styles.recentTxnCard}>
              <View style={[styles.txnIconWrap, { backgroundColor: (isIncome ? "#10B981" : "#F43F5E") + "15" }]}>
                <Ionicons name={isIncome ? "arrow-down" : "arrow-up"} size={18} color={isIncome ? "#10B981" : "#F43F5E"} />
              </View>
              <View style={styles.txnMainInfo}>
                <Text style={styles.txnDesc} numberOfLines={1}>{txn.description}</Text>
                <Text style={styles.recentTxnCat}>
                  {CATEGORY_LABELS[txn.category as keyof typeof CATEGORY_LABELS] || txn.category}
                </Text>
              </View>
              <div style={styles.txnRight}>
                <Text style={[styles.txnAmount, { color: isIncome ? "#10B981" : "#F43F5E" }]}>
                  {isIncome ? "+" : "-"}{txn.amount.toLocaleString()}
                </Text>
                <Text style={styles.txnDate}>{new Date(txn.date).toLocaleDateString("en-GB")}</Text>
              </div>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 20 },
  greeting: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  orgName: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text },
  profileBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "white", justifyContent: "center", alignItems: "center", elevation: 2 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 15, gap: 10, marginBottom: 25 },
  statCard: { flex: 1, minWidth: "45%", backgroundColor: "white", borderRadius: 16, padding: 16, borderLeftWidth: 4, elevation: 1 },
  statIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", marginBottom: 10 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.text },
  statLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.text, paddingHorizontal: 20, marginBottom: 15 },
  sectionTitleNoPadding: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.text },
  quickActions: { flexDirection: "row", paddingHorizontal: 20, gap: 12, marginBottom: 25 },
  quickAction: { flex: 1, backgroundColor: "white", padding: 15, borderRadius: 16, alignItems: "center", elevation: 1 },
  actionIcon: { width: 45, height: 45, borderRadius: 12, backgroundColor: Colors.light.tint + "15", justifyContent: "center", alignItems: "center", marginBottom: 8 },
  actionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  recentSection: { paddingHorizontal: 20 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
  seeAll: { color: Colors.light.tint, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  recentTxnCard: { flexDirection: "row", backgroundColor: "white", padding: 12, borderRadius: 12, alignItems: "center", marginBottom: 10, elevation: 1 },
  txnIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", marginRight: 12 },
  txnMainInfo: { flex: 1 },
  txnDesc: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  recentTxnCat: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  txnRight: { alignItems: "flex-end" },
  txnAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  txnDate: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 2 },
});
import React, { useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { CATEGORY_LABELS, TransactionCategory } from "@/lib/types";

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
      style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] }]}
      onPress={onPress}
    >
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={22} color={Colors.light.tint} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { members, events, groups, transactions, loans, loading, getCashBalance, getBankBalance, getTotalBalance, refreshData } = useData() as any;

  useFocusEffect(
    useCallback(() => {
      if (refreshData) refreshData();
    }, [refreshData])
  );

  const activeMembers = members.filter((m: typeof members[number]) => m.status === "active");
  const activeLoans = loans.filter((l: typeof loans[number]) => l.status === "active");

  const recentTxns = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const upcomingEvents = events
    .filter((e: typeof events[number]) => new Date(e.date) >= new Date())
    .sort((a: typeof events[number], b: typeof events[number]) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const getMemberName = (id?: string) => {
    if (!id) return "";
    const m = members.find((m: typeof members[number]) => m.id === id);
    return m ? `${m.firstName} ${m.lastName}` : "";
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16 + webTopInset, paddingBottom: 100 },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.greeting}>OrgHub</Text>
      <Text style={styles.subtitle}>Organization Overview</Text>

      <View style={styles.balanceBanner}>
        <Text style={styles.balanceBannerLabel}>Total Balance</Text>
        <Text style={styles.balanceBannerAmount}>
          ${getTotalBalance().toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </Text>
        <View style={styles.balanceSplit}>
          <View style={styles.balanceSplitItem}>
            <Ionicons name="cash-outline" size={14} color="#fff" />
            <Text style={styles.balanceSplitText}>
              Cash: ${getCashBalance().toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.balanceSplitItem}>
            <Ionicons name="business-outline" size={14} color="#fff" />
            <Text style={styles.balanceSplitText}>
              Bank: ${getBankBalance().toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCard icon="people" label="Members" value={members.length.toString()} color={Colors.light.tint} />
        <StatCard icon="checkmark-circle" label="Active" value={activeMembers.length.toString()} color={Colors.light.success} />
      </View>
      <View style={styles.statsRow}>
        <StatCard icon="receipt" label="Transactions" value={transactions.length.toString()} color="#3B82F6" />
        <StatCard icon="wallet" label="Active Loans" value={activeLoans.length.toString()} color="#8B5CF6" />
      </View>

      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickActionsRow}>
        <QuickAction icon="receipt-outline" label="Transaction" onPress={() => router.push("/add-transaction")} />
        <QuickAction icon="person-add-outline" label="Member" onPress={() => router.push("/add-member")} />
        <QuickAction icon="wallet-outline" label="Loan" onPress={() => router.push("/add-loan")} />
      </View>

      {recentTxns.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          {recentTxns.map((txn: { id: string; type: string; category: TransactionCategory; memberId?: string; receiptNumber?: string; amount: number }) => {
            const isIncome = txn.type === "income";
            return (
              <View key={txn.id} style={styles.recentTxnRow}>
                <View style={[styles.recentTxnIcon, { backgroundColor: isIncome ? Colors.light.success + "15" : Colors.light.accent + "15" }]}>
                  <Ionicons
                    name={isIncome ? "arrow-down" : "arrow-up"}
                    size={16}
                    color={isIncome ? Colors.light.success : Colors.light.accent}
                  />
                </View>
                <View style={styles.recentTxnInfo}>
                  <Text style={styles.recentTxnCat} numberOfLines={1}>{CATEGORY_LABELS[txn.category]}</Text>
                  <Text style={styles.recentTxnMeta} numberOfLines={1}>
                    {getMemberName(txn.memberId) || txn.receiptNumber}
                  </Text>
                </View>
                <Text style={[styles.recentTxnAmt, isIncome ? styles.incomeText : styles.expenseText]}>
                  {isIncome ? "+" : "-"}${txn.amount.toFixed(2)}
                </Text>
              </View>
            );
          })}
        </>
      )}

      {upcomingEvents.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Upcoming Events</Text>
          {upcomingEvents.map((event: typeof events[number]) => (
            <Pressable key={event.id} onPress={() => router.push({ pathname: "/event-detail", params: { id: event.id } })}>
              <View style={styles.eventCard}>
                <View style={styles.eventDateBadge}>
                  <Text style={styles.eventDateDay}>{new Date(event.date).getDate()}</Text>
                  <Text style={styles.eventDateMonth}>
                    {new Date(event.date).toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                  <View style={styles.eventMeta}>
                    <Ionicons name="people-outline" size={13} color={Colors.light.textSecondary} />
                    <Text style={styles.eventMetaText}>{event.attendeeIds.length} attendees</Text>
                  </View>
                </View>
              </View>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    paddingHorizontal: 20,
  },
  greeting: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginBottom: 20,
  },
  balanceBanner: {
    backgroundColor: Colors.light.tint,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  balanceBannerLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.7)",
    marginBottom: 4,
  },
  balanceBannerAmount: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 12,
  },
  balanceSplit: {
    flexDirection: "row",
    gap: 20,
  },
  balanceSplitItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  balanceSplitText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.85)",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 3,
    shadowColor: Colors.light.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginTop: 20,
    marginBottom: 12,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  quickAction: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    shadowColor: Colors.light.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.light.tintLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  quickActionLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
    textAlign: "center",
  },
  recentTxnRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  recentTxnIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  recentTxnInfo: { flex: 1 },
  recentTxnCat: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  recentTxnMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  recentTxnAmt: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  incomeText: { color: Colors.light.success },
  expenseText: { color: Colors.light.accent },
  eventCard: {
    flexDirection: "row",
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    alignItems: "center",
    shadowColor: Colors.light.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  eventDateBadge: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: Colors.light.tintLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  eventDateDay: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.tint,
  },
  eventDateMonth: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 4,
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  eventMetaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
});

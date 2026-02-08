import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { CATEGORY_LABELS } from "@/lib/types"; // မသုံးတဲ့ types တွေကို ဖယ်ထုတ်လိုက်သည်

const PERIOD_OPTIONS = [
  { label: "1M", months: 1 },
  { label: "3M", months: 3 },
  { label: "4M", months: 4 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
];

type ReportTab = "summary" | "fees";

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { transactions, members, loading } = useData(); // accountSettings ကို ဖယ်ထုတ်လိုက်သည်
  const [period, setPeriod] = useState(3);
  const [reportTab, setReportTab] = useState<ReportTab>("summary");

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - period);
    return d;
  }, [period]);

  const filteredTxns = useMemo(
    () => transactions.filter((t) => new Date(t.date) >= cutoffDate),
    [transactions, cutoffDate]
  );

  const stats = useMemo(() => {
    const income = filteredTxns
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = filteredTxns
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    return { income, expense, net: income - expense };
  }, [filteredTxns]);

  const catData = useMemo(() => {
    const data: Record<string, number> = {};
    filteredTxns.forEach((t) => {
      data[t.category] = (data[t.category] || 0) + t.amount;
    });
    return data;
  }, [filteredTxns]);

  const lastNMonths = useMemo(() => {
    const months = [];
    for (let i = 0; i < period; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push({
        name: d.toLocaleString("default", { month: "short" }),
        year: d.getFullYear(),
        monthIdx: d.getMonth(),
      });
    }
    return months.reverse();
  }, [period]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.title}>အစီရင်ခံစာ</Text>
        <View style={styles.periodPicker}>
          {PERIOD_OPTIONS.map((opt) => (
            <Pressable
              key={opt.label}
              style={[styles.periodBtn, period === opt.months && styles.activePeriodBtn]}
              onPress={() => setPeriod(opt.months)}
            >
              <Text style={[styles.periodText, period === opt.months && styles.activePeriodText]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, reportTab === "summary" && styles.activeTab]}
          onPress={() => setReportTab("summary")}
        >
          <Text style={[styles.tabText, reportTab === "summary" && styles.activeTabText]}>
            အကျဉ်းချုပ်
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, reportTab === "fees" && styles.activeTab]}
          onPress={() => setReportTab("fees")}
        >
          <Text style={[styles.tabText, reportTab === "fees" && styles.activeTabText]}>
            အသင်းဝင်ကြေး
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {reportTab === "summary" ? (
          <>
            <View style={styles.summaryGrid}>
              <View style={[styles.statBox, { borderLeftColor: "#10B981" }]}>
                <Text style={styles.statLabel}>စုစုပေါင်းအဝင်</Text>
                <Text style={[styles.statValue, { color: "#10B981" }]}>
                  {stats.income.toLocaleString()} KS
                </Text>
              </View>
              <View style={[styles.statBox, { borderLeftColor: "#F43F5E" }]}>
                <Text style={styles.statLabel}>စုစုပေါင်းအထွက်</Text>
                <Text style={[styles.statValue, { color: "#F43F5E" }]}>
                  {stats.expense.toLocaleString()} KS
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>အမျိုးအစားအလိုက် ခွဲခြားမှု</Text>
              {Object.entries(catData).map(([cat, val]) => (
                <View key={cat} style={styles.catRow}>
                  <View style={styles.catInfo}>
                    <View style={[styles.catDot, { backgroundColor: Colors.light.tint }]} />
                    <Text style={styles.catLabel}>
                      {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] || cat}
                    </Text>
                  </View>
                  <Text style={styles.catValue}>{val.toLocaleString()} KS</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>အသင်းဝင်ကြေး ပေးဆောင်မှု (နောက်ဆုံး {period} လ)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.tableHeader}>
                  <View style={styles.tableNameCol}>
                    <Text style={styles.tableHeaderText}>အမည်</Text>
                  </View>
                  {lastNMonths.map((m) => (
                    <View key={`${m.monthIdx}-${m.year}`} style={styles.tableMonthCol}>
                      <Text style={styles.tableHeaderText}>{m.name}</Text>
                    </View>
                  ))}
                </View>

                {members.map((member) => (
                  <View key={member.id} style={styles.tableRow}>
                    <View style={styles.tableNameCol}>
                      <Text style={styles.tableName} numberOfLines={1}>
                        {member.name}
                      </Text>
                    </View>
                    {lastNMonths.map((m) => {
                      const isPaid = transactions.some(
                        (t) =>
                          t.memberId === member.id &&
                          (t.category as string) === "membership_fee" && // Type error အတွက် cast လုပ်လိုက်သည်
                          new Date(t.date).getMonth() === m.monthIdx &&
                          new Date(t.date).getFullYear() === m.year
                      );
                      return (
                        <View key={`${m.monthIdx}-${m.year}`} style={styles.tableMonthCol}>
                          {isPaid ? (
                            <View style={styles.paidBadge}>
                              <Ionicons name="checkmark" size={12} color={Colors.light.success} />
                            </View>
                          ) : (
                            <Ionicons name="close" size={14} color={Colors.light.textSecondary + "40"} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.light.text },
  periodPicker: { flexDirection: "row", backgroundColor: "#E2E8F0", borderRadius: 8, padding: 2 },
  periodBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  activePeriodBtn: { backgroundColor: "white", elevation: 2 },
  periodText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  activePeriodText: { color: Colors.light.tint },
  tabBar: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 10, gap: 15 },
  tab: { paddingVertical: 8, paddingHorizontal: 4 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: Colors.light.tint },
  tabText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  activeTabText: { color: Colors.light.tint },
  scrollContent: { paddingBottom: 40 },
  summaryGrid: { flexDirection: "row", paddingHorizontal: 20, gap: 12, marginBottom: 20 },
  statBox: {
    flex: 1,
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  statLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 4 },
  section: { backgroundColor: "white", marginHorizontal: 20, padding: 15, borderRadius: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 15 },
  catRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  catInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.text },
  catValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  tableHeader: { flexDirection: "row", backgroundColor: Colors.light.tint, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 6, marginBottom: 4 },
  tableHeaderText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#fff", textAlign: "center" },
  tableNameCol: { width: 120, paddingHorizontal: 6, justifyContent: "center" },
  tableMonthCol: { width: 70, alignItems: "center", justifyContent: "center" },
  tableRow: { flexDirection: "row", backgroundColor: "#F8FAFC", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 6, marginBottom: 4, borderWidth: 1, borderColor: "#E2E8F0" },
  tableName: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.text },
  paidBadge: { backgroundColor: Colors.light.success + "15", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
});
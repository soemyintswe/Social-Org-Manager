import React, { useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import FloatingTabMenu from "@/components/FloatingTabMenu";

export default function LoansScreen() {
  const insets = useSafeAreaInsets();
  const { loans, transactions, members, getLoanOutstanding } = useData() as any;

  // Loan Stats Calculation
  const stats = useMemo(() => {
    const disbursed = transactions
      .filter((t: any) => t.category === "loan_disbursement")
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const repaid = transactions
      .filter((t: any) => t.category === "loan_repayment")
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const interest = transactions
      .filter((t: any) => t.category === "interest_income" || t.category === "bank_interest")
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    
    const totalOutstanding = (loans || []).reduce((acc: number, l: any) => acc + getLoanOutstanding(l.id), 0);
    
    return { disbursed, repaid, interest, totalOutstanding };
  }, [transactions, loans]);

  const activeLoans = useMemo(() => {
    return (loans || [])
      .filter((l: any) => l.status === 'active')
      .map((l: any) => ({
        ...l,
        memberName: members.find((m: any) => m.id === l.memberId)?.name || "Unknown",
        outstanding: getLoanOutstanding(l.id)
      }))
      .sort((a: any, b: any) => b.outstanding - a.outstanding);
  }, [loans, members]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/')} style={[styles.backBtn, { marginLeft: 130 }]}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { flex: 1, textAlign: 'center' }]}>ချေးငွေစာရင်း</Text>
        <Pressable onPress={() => router.push("/add-loan" as any)} style={styles.addBtn}>
          <Ionicons name="add" size={24} color={Colors.light.tint} />
        </Pressable>
      </View>

      <FlatList
        data={activeLoans}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={{ marginBottom: 20 }}>
            <View style={styles.summaryGrid}>
              <View style={[styles.statBox, { borderLeftColor: "#F59E0B" }]}>
                <Text style={styles.statLabel}>ထုတ်ချေးငွေ</Text>
                <Text style={[styles.statValue, { color: "#F59E0B" }]}>{stats.disbursed.toLocaleString()} KS</Text>
              </View>
              <View style={[styles.statBox, { borderLeftColor: "#10B981" }]}>
                <Text style={styles.statLabel}>ပြန်ဆပ်ငွေ</Text>
                <Text style={[styles.statValue, { color: "#10B981" }]}>{stats.repaid.toLocaleString()} KS</Text>
              </View>
            </View>
            <View style={[styles.summaryGrid, { marginTop: 10 }]}>
               <View style={[styles.statBox, { borderLeftColor: "#8B5CF6" }]}>
                <Text style={styles.statLabel}>အတိုးရငွေ</Text>
                <Text style={[styles.statValue, { color: "#8B5CF6" }]}>{stats.interest.toLocaleString()} KS</Text>
              </View>
              <View style={[styles.statBox, { borderLeftColor: "#EF4444" }]}>
                <Text style={styles.statLabel}>လက်ကျန်ငွေပေါင်း</Text>
                <Text style={[styles.statValue, { color: "#EF4444" }]}>{stats.totalOutstanding.toLocaleString()} KS</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>လက်ရှိချေးငွေရယူထားသူများ ({activeLoans.length})</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable 
            style={styles.loanCard}
            onPress={() => router.push({ pathname: "/loan-detail", params: { id: item.id } } as any)}
          >
            <View style={styles.loanHeader}>
              <Text style={styles.memberName}>{item.memberName}</Text>
              <Text style={styles.loanAmount}>{item.amount.toLocaleString()} KS</Text>
            </View>
            <View style={styles.loanFooter}>
              <Text style={styles.loanDate}>{new Date(item.date).toLocaleDateString()}</Text>
              <Text style={styles.outstanding}>လက်ကျန်: {item.outstanding.toLocaleString()} KS</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { width: `${Math.max(0, Math.min(100, ((item.amount - item.outstanding) / item.amount) * 100))}%` }
                ]} 
              />
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>လက်ရှိ ချေးငွေရယူထားသူ မရှိပါ။</Text>
        }
      />
      <FloatingTabMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 15, backgroundColor: Colors.light.surface, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  backBtn: { padding: 4 },
  addBtn: { padding: 4 },
  content: { padding: 20, paddingBottom: 40 },
  summaryGrid: { flexDirection: "row", gap: 12 },
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
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.text, marginTop: 25, marginBottom: 10 },
  loanCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  loanHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  memberName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  loanAmount: { fontSize: 14, color: Colors.light.textSecondary },
  loanFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  loanDate: { fontSize: 12, color: Colors.light.textSecondary },
  outstanding: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#EF4444" },
  progressBarBg: {
    height: 6,
    backgroundColor: "#F3F4F6",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#10B981",
  },
  emptyText: { textAlign: "center", color: Colors.light.textSecondary, marginTop: 20 },
});
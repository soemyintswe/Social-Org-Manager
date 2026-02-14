import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { Transaction, Loan, CATEGORY_LABELS } from "@/lib/types";
import DateTimePicker from "@react-native-community/datetimepicker";

type Tab = "transactions" | "transfers" | "loans";

function BalanceCard({ label, amount, icon, color }: {
  label: string;
  amount: number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={[styles.balanceCard, { borderLeftColor: color }]}>
      <View style={[styles.balanceIcon, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.balanceLabel}>{label}</Text>
      <Text style={[styles.balanceAmount, { color }]}>
        {amount < 0 ? "-" : ""}{Math.abs(amount).toLocaleString()} <Text style={styles.currencyText}>KS</Text>
      </Text>
    </View>
  );
}

function TransactionRow({ txn, memberName, onDelete }: {
  txn: Transaction;
  memberName?: string;
  onDelete: (id: string) => void;
}) {
  const isIncome = txn.type === "income";
  const isTransfer = (txn.type as string) === "transfer";
  const paymentMethod = (txn as any).paymentMethod || "cash";

  const dateObj = useMemo(() => {
    const d = txn.date as any;
    if (!d) return new Date();
    if (typeof d === 'string' && d.includes('/')) {
      const [day, month, year] = d.split('/');
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    return new Date(d);
  }, [txn.date]);

  return (
    <Pressable
      style={styles.txnRow}
      onPress={() => router.push({ pathname: "/add-transaction", params: { editId: txn.id } })}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert("ဖျက်ရန်", "ဤငွေစာရင်းကို ဖျက်လိုပါသလား?", [
          { text: "မဖျက်တော့ပါ", style: "cancel" },
          { text: "ဖျက်မည်", style: "destructive", onPress: () => onDelete(txn.id) },
        ]);
      }}
    >
      <View style={[styles.txnIcon, { backgroundColor: (isTransfer ? "#8B5CF6" : (isIncome ? "#10B981" : "#F43F5E")) + "15" }]}>
        <Ionicons
          name={isTransfer ? "swap-horizontal" : (isIncome ? "arrow-down" : "arrow-up")}
          size={20}
          color={isTransfer ? "#8B5CF6" : (isIncome ? "#10B981" : "#F43F5E")}
        />
      </View>
      <View style={styles.txnInfo}>
        <Text style={styles.txnCategory} numberOfLines={1}>
          {(txn as any).categoryLabel || CATEGORY_LABELS[txn.category] || txn.category}
        </Text>
        <Text style={styles.txnDesc} numberOfLines={1}>
          {memberName ? memberName + " - " : ""}{(txn as any).notes || (txn as any).description || txn.receiptNumber}
        </Text>
        <Text style={styles.txnDate}>
          {dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {" "}
          <Text style={styles.txnMethod}>{paymentMethod.toUpperCase()}</Text>
        </Text>
      </View>
      <View style={styles.txnRight}>
        <Text style={[styles.txnAmount, { color: isTransfer ? "#8B5CF6" : (isIncome ? "#10B981" : "#F43F5E") }]}>
          {isTransfer ? "" : (isIncome ? "+" : "-")}{txn.amount.toLocaleString()}
        </Text>
      </View>
    </Pressable>
  );
}

function LoanRow({ loan, memberName, outstanding }: {
  loan: Loan;
  memberName?: string;
  outstanding: number;
}) {
  const isPaid = loan.status === "paid";

  const dateStr = useMemo(() => {
    const d = loan.issueDate as any;
    if (!d) return "";
    if (typeof d === 'string' && d.includes('/')) {
      const [day, month, year] = d.split('/');
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }, [loan.issueDate]);

  return (
    <Pressable
      style={styles.loanRow}
      // Route path error အတွက် cast လုပ်ပေးထားပါသည်
      onPress={() => router.push({ pathname: "/loan-details", params: { id: loan.id } } as any)}
    >
      <View style={[styles.loanIcon, { backgroundColor: (isPaid ? Colors.light.success : "#F59E0B") + "15" }]}>
        <Ionicons
          name={isPaid ? "checkmark-circle" : "timer"}
          size={22}
          color={isPaid ? Colors.light.success : "#F59E0B"}
        />
      </View>
      <View style={styles.loanInfo}>
        <Text style={styles.loanName}>{memberName || "အမည်မသိ"}</Text>
        <Text style={styles.loanDesc}>
          အတိုး {loan.interestRate}% • {loan.principal.toLocaleString()} KS
        </Text>
        <Text style={styles.loanDate}>
          {dateStr}
        </Text>
      </View>
      <View style={styles.loanRight}>
        <Text style={styles.loanOutstanding}>
          {outstanding.toLocaleString()} KS
        </Text>
        <View style={[styles.loanStatusBadge, isPaid ? styles.loanPaid : styles.loanActive]}>
          <Text style={[styles.loanStatusText, { color: isPaid ? Colors.light.success : "#3B82F6" }]}>
            {isPaid ? "ဆပ်ပြီး" : "ကျန်ရှိ"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function FinanceScreen() {
  const insets = useSafeAreaInsets();
  const {
    transactions,
    loans,
    members,
    removeTransaction,
    getLoanOutstanding,
    loading,
    accountSettings,
    refreshData,
    updateAccountSettings
  } = useData() as any;

  const [activeTab, setActiveTab] = useState<Tab>("transactions");
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1)); // Jan 1st of current year
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Opening Balance Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempCash, setTempCash] = useState("");
  const [tempBank, setTempBank] = useState("");

  const handleOpenSettings = () => {
    setTempCash(accountSettings?.openingBalanceCash?.toString() || "0");
    setTempBank(accountSettings?.openingBalanceBank?.toString() || "0");
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    if (updateAccountSettings) {
      await updateAccountSettings({
        ...accountSettings,
        openingBalanceCash: parseFloat(tempCash) || 0,
        openingBalanceBank: parseFloat(tempBank) || 0,
      });
    }
    setShowSettingsModal(false);
  };

  const getMemberName = (id?: string) => {
    if (!id) return "";
    const m = members.find((member: any) => member.id === id);
    if (!m) return "";
    const anyM = m as any;
    if (anyM.name) return anyM.name;
    const fullName = [anyM.firstName, anyM.lastName].filter(Boolean).join(" ").trim();
    return fullName || anyM.email || anyM.phone || "";
  };

  // Filter transactions by date range
  const sortedTxns = useMemo(
    () => [...(transactions || [])]
    .sort((a, b) => {
      const getDate = (d: any) => {
        if (!d) return 0;
        if (typeof d === 'string' && d.includes('/')) {
          const [day, month, year] = d.split('/');
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime();
        }
        return new Date(d).getTime();
      };
      return (getDate(b.date) || 0) - (getDate(a.date) || 0);
    })
    .filter(t => {
      const d = new Date(t.date);
      // Reset times for accurate date comparison
      const start = new Date(startDate); start.setHours(0,0,0,0);
      const end = new Date(endDate); end.setHours(23,59,59,999);
      const current = new Date(d);
      if (typeof t.date === 'string' && t.date.includes('/')) {
         const [day, month, year] = t.date.split('/');
         current.setFullYear(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      return current >= start && current <= end;
    }),
    [transactions, startDate, endDate]
  );

  const sortedLoans = useMemo(
    () => [...(loans || [])].sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;
      return new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime();
    }),
    [loans]
  );

  // Calculate Balances locally to include Transfer logic
  const balances = useMemo(() => {
    let cash = (accountSettings?.openingBalanceCash || 0);
    let bank = (accountSettings?.openingBalanceBank || 0);

    (transactions || []).forEach((t: any) => {
      const amt = t.amount || 0;
      if (t.type === 'income') {
        if (t.paymentMethod === 'bank') bank += amt;
        else cash += amt;
      } else if (t.type === 'expense') {
        if (t.paymentMethod === 'bank') bank -= amt;
        else cash -= amt;
      } else if (t.type === 'transfer') {
        if (t.category === 'bank_deposit') { // Cash -> Bank
          cash -= amt;
          bank += amt;
        } else if (t.category === 'bank_withdraw') { // Bank -> Cash
          bank -= amt;
          cash += amt;
        }
      }
    });
    return { cash, bank, total: cash + bank };
  }, [transactions, accountSettings]);

  const formatDateBtn = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ width: 140 }} />
        <Text style={[styles.title, { flex: 1, textAlign: 'center' }]}>ငွေစာရင်းမှတ်တမ်း</Text>
        <View style={[styles.headerButtons, { width: 140, justifyContent: 'flex-end', paddingRight: 110 }]}>
          <Pressable
            style={[styles.addButton, { backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border }]}
            onPress={handleOpenSettings}
          >
            <Ionicons name="wallet-outline" size={20} color={Colors.light.text} {...({ title: "လက်ကျန်ငွေစာရင်း" } as any)} />
          </Pressable>
          <Pressable
            style={styles.addButton}
            onPress={() => router.push(activeTab === "loans" ? "/add-loan" : "/add-transaction" as any)}
          >
            <Ionicons name="add" size={24} color="white" {...({ title: "စာရင်းသစ်ထည့်ရန်" } as any)} />
          </Pressable>
        </View>
      </View>

      <View style={styles.filterContainer}>
        {Platform.OS === 'web' ? (
          <View style={styles.dateBtn}>
            {React.createElement('input', {
              type: 'date',
              value: startDate.toISOString().split('T')[0],
              onChange: (e: any) => e.target.value && setStartDate(new Date(e.target.value)),
              style: {
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontSize: 13,
                fontFamily: 'inherit',
                color: Colors.light.text,
                width: 110
              }
            })}
          </View>
        ) : (
          <Pressable style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
            <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
            <Text style={styles.dateBtnText}>{formatDateBtn(startDate)}</Text>
          </Pressable>
        )}

        <Text style={{ color: Colors.light.textSecondary }}>to</Text>

        {Platform.OS === 'web' ? (
          <View style={styles.dateBtn}>
            {React.createElement('input', {
              type: 'date',
              value: endDate.toISOString().split('T')[0],
              onChange: (e: any) => e.target.value && setEndDate(new Date(e.target.value)),
              style: {
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontSize: 13,
                fontFamily: 'inherit',
                color: Colors.light.text,
                width: 110
              }
            })}
          </View>
        ) : (
          <Pressable style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
            <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
            <Text style={styles.dateBtnText}>{formatDateBtn(endDate)}</Text>
          </Pressable>
        )}
      </View>

      {/* Date Pickers */}
      {(showStartPicker || showEndPicker) && Platform.OS !== 'web' && (
        <DateTimePicker
          value={showStartPicker ? startDate : endDate}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            if (showStartPicker) {
              setShowStartPicker(false);
              if (selectedDate) setStartDate(selectedDate);
            } else {
              setShowEndPicker(false);
              if (selectedDate) setEndDate(selectedDate);
            }
          }}
        />
      )}

      <View style={styles.balanceGrid}>
        <BalanceCard label="လက်ဝယ်ရှိငွေ" amount={balances.cash} icon="cash" color="#10B981" />
        <BalanceCard label="ဘဏ်လက်ကျန်" amount={balances.bank} icon="card" color="#3B82F6" />
        <BalanceCard label="စုစုပေါင်းလက်ကျန်" amount={balances.total} icon="wallet" color="#8B5CF6" />
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === "transactions" && styles.activeTab]}
          onPress={() => setActiveTab("transactions")}
        >
          <Text style={[styles.tabText, activeTab === "transactions" && styles.activeTabText]}>
            အဝင်/အထွက်
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "transfers" && styles.activeTab]}
          onPress={() => setActiveTab("transfers")}
        >
          <Text style={[styles.tabText, activeTab === "transfers" && styles.activeTabText]}>
            ဘဏ်သွင်း/ဘဏ်ထုတ်
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "loans" && styles.activeTab]}
          onPress={() => setActiveTab("loans")}
        >
          <Text style={[styles.tabText, activeTab === "loans" && styles.activeTabText]}>
            ချေးငွေ
          </Text>
        </Pressable>
      </View>

      <FlatList
        // FlatList Error အတွက် explicit typing သုံးပေးထားပါသည်
        data={
          activeTab === "loans" 
            ? (sortedLoans as any[]) 
            : activeTab === "transfers"
              ? (sortedTxns.filter(t => t.type === 'transfer') as any[])
              : (sortedTxns.filter(t => t.type !== 'transfer') as any[])
        }
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          if (activeTab === "transactions" || activeTab === "transfers") {
            const txn = item as Transaction;
            const memberName = getMemberName(txn.memberId);
            const displayName = memberName || (item as any).payerPayee;
            return (
              <TransactionRow
                txn={txn}
                memberName={displayName}
                onDelete={removeTransaction}
              />
            );
          } else {
            const loan = item as Loan;
            const member = members.find((m: any) => m.id === loan.memberId);
            return (
              <LoanRow
                loan={loan}
                memberName={member?.name}
                outstanding={getLoanOutstanding(loan.id)}
              />
            );
          }
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color={Colors.light.textSecondary} />
            <Text style={styles.emptyText}>မှတ်တမ်းများ မရှိသေးပါ</Text>
          </View>
        }
      />

      {/* Opening Balance Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showSettingsModal}
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalContainer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSettingsModal(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Opening Balances (စာရင်းဖွင့်လက်ကျန်)</Text>
            
            <Text style={styles.label}>Opening Cash (ငွေသား)</Text>
            <TextInput style={styles.input} value={tempCash} onChangeText={setTempCash} keyboardType="decimal-pad" placeholder="0.00" />

            <Text style={styles.label}>Opening Bank (ဘဏ်)</Text>
            <TextInput style={styles.input} value={tempBank} onChangeText={setTempBank} keyboardType="decimal-pad" placeholder="0.00" />

            <Pressable style={styles.saveBtn} onPress={handleSaveSettings}>
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setShowSettingsModal(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ... styles remain the same (အပေါ်က ကုဒ်ဟောင်းအတိုင်း သုံးနိုင်ပါသည်)
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
  headerButtons: { flexDirection: "row", gap: 10 },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.tint,
    justifyContent: "center",
    alignItems: "center",
  },
  balanceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 15,
    gap: 10,
    marginBottom: 20,
  },
  balanceCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 15,
    borderLeftWidth: 4,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  balanceIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  balanceLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  balanceAmount: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 4 },
  currencyText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginBottom: 10,
    gap: 15,
  },
  tab: { paddingVertical: 8, paddingHorizontal: 4 },
  activeTab: { borderBottomWidth: 2, borderBottomColor: Colors.light.tint },
  tabText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  activeTabText: { color: Colors.light.tint },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  txnIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  txnInfo: { flex: 1 },
  txnTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  txnCategory: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  txnDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  txnMethod: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: Colors.light.tint },
  txnSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  txnRight: { alignItems: "flex-end", gap: 4 },
  txnAmount: { fontSize: 14, fontFamily: "Inter_700Bold" },
  txnDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary },
  loanRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  loanIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  loanInfo: { flex: 1 },
  loanName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  loanDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 1 },
  loanDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2 },
  loanRight: { alignItems: "flex-end", gap: 4 },
  loanOutstanding: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.light.text },
  loanStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  loanStatusText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  loanActive: { backgroundColor: "#3B82F6" + "15" },
  loanPaid: { backgroundColor: Colors.light.success + "15" },
  emptyContainer: { alignItems: "center", marginTop: 50 },
  emptyText: { marginTop: 10, fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  filterContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 15 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border },
  dateBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.light.text },
  modalContainer: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 20, textAlign: "center" },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: "#F8FAFC", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, borderWidth: 1, borderColor: Colors.light.border },
  saveBtn: { backgroundColor: Colors.light.tint, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 20 },
  saveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  cancelBtn: { paddingVertical: 14, alignItems: "center", marginTop: 5 },
  cancelBtnText: { color: Colors.light.textSecondary, fontSize: 15, fontFamily: "Inter_500Medium" },
});
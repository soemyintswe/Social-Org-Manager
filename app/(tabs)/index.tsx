import React, { useMemo, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
  ToastAndroid,
} from "react-native";
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { CATEGORY_LABELS, TransactionCategory, Loan } from "@/lib/types";
import { exportData } from "@/lib/storage";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface Transaction {
  id: string;
  type: "income" | "expense";
  category: TransactionCategory;
  memberId?: string;
  receiptNumber?: string;
  amount: number;
  date: string;
  categoryLabel?: string;
  payerPayee?: string;
}

// A utility function for consistent currency formatting
const formatCurrency = (amount: number) => `${amount.toLocaleString()} KS`;

interface DataContextType {
  members: { id: string; name?: string; firstName?: string; lastName?: string }[];
  transactions: Transaction[];
  loans: Loan[];
  loading: boolean;
  getTotalBalance: () => number;
  getLoanOutstanding: (id: string) => number;
  refreshData?: () => Promise<void>;
}


function StatCard({
  icon,
  label,
  value,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | React.ReactNode;
  color: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.statCard, { borderLeftColor: color }, pressed && onPress && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={[styles.statIconWrap, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      {typeof value === 'string' ? <Text style={styles.statValue}>{value}</Text> : value}
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
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
  const { members, transactions, loans, loading, getTotalBalance, getLoanOutstanding, refreshData, accountSettings } = useData() as any;

  const getMemberName = (id?: string) => {
    if (!id) return "";
    const m = members?.find((m: any) => m.id === id);
    return m ? (m.name || `${m.firstName || ""} ${m.lastName || ""}`.trim()) : "";
  };

  const recentTxns: Transaction[] = [...(transactions || [])]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const totalLoanOutstanding = (loans || []).reduce((acc: number, loan: any) => acc + (getLoanOutstanding(loan.id) || 0), 0);

  // Calculate Member Gender Stats based on Name Prefixes
  const memberStats = useMemo(() => {
    let male = 0;
    let female = 0;
    (members || []).forEach((m: any) => {
      const name = (m.name || "").trim();
      // Male prefixes
      if (
        name.startsWith("ဦး") || 
        name.startsWith("ကို") || 
        name.startsWith("မောင်") || 
        name.startsWith("ဆရာတော်") || 
        name.startsWith("ကိုရင်") || 
        name.startsWith("ဦးဇင်း") || 
        name.toLowerCase().startsWith("u ") || 
        name.toLowerCase().startsWith("ko ") || 
        name.toLowerCase().startsWith("mg ")
      ) {
        male++;
      } 
      // Female prefixes
      else if (
        name.startsWith("ဒေါ်") || 
        name.startsWith("မ") || 
        name.startsWith("ဆရာလေး") || 
        name.startsWith("သီလရှင်") || 
        name.toLowerCase().startsWith("daw ") || 
        name.toLowerCase().startsWith("ma ")
      ) {
        female++;
      }
    });
    return { male, female, total: members?.length || 0 };
  }, [members]);

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

  // Events Count (for badge)
  const [eventCount, setEventCount] = useState(0);
  useEffect(() => {
    const loadEventCount = async () => {
      const stored = await AsyncStorage.getItem("@org_events");
      if (stored) setEventCount(JSON.parse(stored).length);
    };
    loadEventCount();
  }, []);

  // Auto Backup Logic
  useEffect(() => {
    let timeout: any;
    
    const performAutoBackup = async () => {
      if (Platform.OS === 'web') return;

      try {
        const enabled = await AsyncStorage.getItem("@auto_backup_enabled");
        if (enabled === "true") {
          const data = await exportData();
          const dataString = typeof data === 'string' ? data : JSON.stringify(data);
          const fileUri = FileSystem.documentDirectory + 'auto_backup.json';
          await FileSystem.writeAsStringAsync(fileUri, dataString);
          if (Platform.OS === 'android') {
            ToastAndroid.show("Auto Backup Saved", ToastAndroid.SHORT);
          }
        }
      } catch (e) {
        console.error("Auto backup failed", e);
      }
    };

    // Data ပြောင်းလဲပြီး ၃ စက္ကန့်အကြာမှ Backup လုပ်မည် (Debounce)
    timeout = setTimeout(performAutoBackup, 3000);
    return () => clearTimeout(timeout);
  }, [members, transactions, loans]);

  const convertToEnglishDigits = (str: string) => {
      const myanmarNumbers = ["၀", "၁", "၂", "၃", "၄", "၅", "၆", "၇", "၈", "၉"];
      return str.replace(/[၀-၉]/g, (s) => myanmarNumbers.indexOf(s).toString());
  };

  const getAge = (dob: string) => {
      if (!dob) return 0;
      const clean = convertToEnglishDigits(dob);
      const parts = clean.split(/[\/\.\-]/);
      if (parts.length === 3) {
          const year = parseInt(parts[2], 10);
          if (!isNaN(year)) {
              return new Date().getFullYear() - year;
          }
      }
      return 0;
  };

  const getOccurrenceDate = (dob: string) => {
      if (!dob) return null;
      const cleanDob = convertToEnglishDigits(dob);
      const parts = cleanDob.split(/[\/\.\-]/);
      if (parts.length !== 3) return null;
      
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const currentYear = today.getFullYear();
      
      const dates = [
        new Date(currentYear, month, day),
        new Date(currentYear + 1, month, day),
        new Date(currentYear - 1, month, day)
      ];

      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(today.getDate() - 3);
      const oneMonthLater = new Date(today);
      oneMonthLater.setMonth(today.getMonth() + 1);

      for (const date of dates) {
        if (date >= threeDaysAgo && date <= oneMonthLater) {
           return date;
        }
      }
      return null;
  };

  const getBirthdayColor = (dob: string) => {
      const date = getOccurrenceDate(dob);
      if (!date) return Colors.light.text;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return date < today ? '#EF4444' : '#10B981';
  };

  // မွေးနေ့ရောက်တော့မည့်သူများကို တွက်ချက်ခြင်း (၁ လကြိုတင် / ၃ ရက်နောက်ကျ)
  const upcomingBirthdays = useMemo(() => {
    if (!members) return [];
    
    const filtered = members.filter((m: any) => m.dob && getOccurrenceDate(m.dob) !== null);

    return filtered.sort((a: any, b: any) => {
        const dateA = getOccurrenceDate(a.dob);
        const dateB = getOccurrenceDate(b.dob);
        
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;

        const timeDiff = dateA.getTime() - dateB.getTime();
        if (timeDiff !== 0) return timeDiff;

        return getAge(b.dob) - getAge(a.dob);
    });
  }, [members]);

  // Schedule Birthday Notification
  useEffect(() => {
    const scheduleBirthdayNotification = async () => {
      if (upcomingBirthdays.length > 0 && Platform.OS !== 'web') {
        const today = new Date().toDateString();
        const lastNotified = await AsyncStorage.getItem("@last_birthday_notification");
        
        if (lastNotified !== today) {
          const { status } = await Notifications.getPermissionsAsync();
          let finalStatus = status;
          if (status !== 'granted') {
            const { status: newStatus } = await Notifications.requestPermissionsAsync();
            finalStatus = newStatus;
          }

          if (finalStatus === 'granted') {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: "🎂 မွေးနေ့ရှင်များ ရှိပါသည်",
                body: `မွေးနေ့ကျရောက်မည့်/ကျရောက်ခဲ့သော အသင်းဝင် (${upcomingBirthdays.length}) ဦး ရှိပါသည်။`,
              },
              trigger: null, // Send immediately
            });
            await AsyncStorage.setItem("@last_birthday_notification", today);
          }
        }
      }
    };
    scheduleBirthdayNotification();
  }, [upcomingBirthdays]);

  const handleSendWish = (phone: string, name: string) => {
    if (!phone) {
      Alert.alert("ဖုန်းနံပါတ်မရှိပါ", "ဤအသင်းဝင်တွင် ဖုန်းနံပါတ် ထည့်သွင်းထားခြင်း မရှိပါ။");
      return;
    }
    const message = `Happy Birthday ${name}! 🎂🎁 Best wishes from our Organization.`;
    const url = `sms:${phone}${Platform.OS === "ios" ? "&" : "?"}body=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("Error", "Message ပို့၍ မရနိုင်ပါ။");
    });
  };

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
      <View style={[styles.header, { paddingTop: 10, paddingBottom: 10 }]}>
        <View>
          <Text style={styles.greeting}>မင်္ဂလာပါ</Text>
          <Text style={styles.orgName}>OrgHub Dashboard</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginRight: 110 }}>
          <Pressable 
            style={styles.profileBtn}
            onPress={() => router.replace("/")}
          >
            <Ionicons name="home-outline" size={24} color={Colors.light.text} />
          </Pressable>
          <Pressable 
            style={styles.profileBtn}
            onPress={async () => refreshData && await refreshData()}
          >
            <Ionicons name="refresh-outline" size={24} color={Colors.light.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <StatCard 
          icon="people" 
          label="အသင်းဝင်" 
          value={
            <View>
              <Text style={styles.statValue}>{memberStats.total}</Text>
              <View style={{ marginTop: 4, flexDirection: 'row', gap: 8 }}>
                <Text style={styles.subBalanceText}>ကျား: {memberStats.male}</Text>
                <Text style={styles.subBalanceText}>မ: {memberStats.female}</Text>
              </View>
            </View>
          } 
          color="#8B5CF6" 
          onPress={() => router.push("/members" as any)} 
        />
        <StatCard 
          icon="wallet" 
          label="စုစုပေါင်းလက်ကျန်" 
          value={
            <View>
              <View style={{ marginBottom: 4 }}>
                <Text style={styles.subBalanceText}>လက်ဝယ်: {formatCurrency(balances.cash)}</Text>
                <Text style={styles.subBalanceText}>ဘဏ်: {formatCurrency(balances.bank)}</Text>
              </View>
              <Text style={styles.statValue}>{formatCurrency(balances.total)}</Text>
            </View>
          } 
          color="#10B981" 
          onPress={() => router.push("/finance" as any)} 
        />
        <StatCard icon="cash" label="ချေးငွေလက်ကျန်" value={formatCurrency(totalLoanOutstanding)} color="#F59E0B" onPress={() => router.push("/loans" as any)} />
        <StatCard icon="calendar" label="လှုပ်ရှားမှုများ" value={eventCount.toString()} color="#3B82F6" onPress={() => router.push("/events" as any)} />
      </View>

      {/* Birthday Alert Section */}
      {upcomingBirthdays.length > 0 && (
        <View style={[styles.birthdayCard, { backgroundColor: 'white', borderColor: Colors.light.border }]}>
          <View style={styles.birthdayHeader}>
            <Ionicons name="gift" size={20} color={Colors.light.tint} />
            <Text style={[styles.birthdayTitle, { color: Colors.light.text }]}>မွေးနေ့ရှင်များ (၁ လကြိုတင် / ၃ ရက်နောက်ကျ)</Text>
          </View>
          {upcomingBirthdays.map((m: any) => (
            <View key={m.id} style={styles.birthdayRow}>
              <Pressable 
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: "/member-detail", params: { id: m.id } } as any)}
              >
                <View>
                  <Text style={[styles.birthdayName, { color: Colors.light.text }]}>{m.name}</Text>
                  <Text style={[styles.birthdayDate, { color: getBirthdayColor(m.dob) }]}>
                    {m.dob} • {getAge(m.dob)} နှစ်ပြည့်
                  </Text>
                </View>
              </Pressable>
              <Pressable style={[styles.wishBtn, { backgroundColor: getBirthdayColor(m.dob) + '15' }]} onPress={() => handleSendWish(m.phone, m.name)}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={getBirthdayColor(m.dob)} />
                <Text style={[styles.wishBtnText, { color: getBirthdayColor(m.dob) }]}>Wish</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>အမြန်လုပ်ဆောင်ချက်များ</Text>
      <View style={styles.quickActions}>
        <QuickAction icon="person-add" label="အသင်းဝင်သစ်" onPress={() => router.push("/add-member" as any)} />
        <QuickAction icon="add-circle" label="ငွေစာရင်းသစ်" onPress={() => router.push("/add-transaction" as any)} />
        <QuickAction icon="business" label="ချေးငွေအသစ်" onPress={() => router.push("/add-loan" as any)} />
        <QuickAction icon="qr-code-outline" label="ကတ်ဖတ်မည်" onPress={() => router.push("/qr-scanner" as any)} />
      </View>

      {recentTxns.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          {recentTxns.map((txn) => {
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
                  <Text style={styles.recentTxnCat} numberOfLines={1}>
                    {txn.categoryLabel || CATEGORY_LABELS[txn.category] || txn.category}
                  </Text>
                  <Text style={styles.recentTxnMeta} numberOfLines={1}>
                    {getMemberName(txn.memberId) || txn.payerPayee || txn.receiptNumber} • {new Date(txn.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                <Text style={[styles.recentTxnAmt, isIncome ? styles.incomeText : styles.expenseText]}>
                  {isIncome ? "+" : "-"} {formatCurrency(txn.amount)}
                </Text>
              </View>
            );
          })}
        </>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Project Owner & Developer: MR. SOE MYINT SWE</Text>
        <Text style={styles.footerSubText}>Developed with Gemini AI Assistance</Text>
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
  subBalanceText: { fontSize: 10, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.text, paddingHorizontal: 20, marginBottom: 15 },
  quickActions: { flexDirection: "row", paddingHorizontal: 20, gap: 12, marginBottom: 25 },
  quickAction: { flex: 1, backgroundColor: "white", padding: 15, borderRadius: 16, alignItems: "center", elevation: 1 },
  actionIcon: { width: 45, height: 45, borderRadius: 12, backgroundColor: Colors.light.tint + "15", justifyContent: "center", alignItems: "center", marginBottom: 8 },
  actionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  recentTxnRow: { flexDirection: "row", alignItems: "center", backgroundColor: "white", padding: 12, borderRadius: 12, marginBottom: 10, marginHorizontal: 20 },
  recentTxnIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", marginRight: 12 },
  recentTxnInfo: { flex: 1 },
  recentTxnCat: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  recentTxnMeta: { fontSize: 12, color: Colors.light.textSecondary },
  recentTxnAmt: { fontSize: 14, fontWeight: "bold" },
  incomeText: { color: Colors.light.success },
  expenseText: { color: Colors.light.accent },
  footer: { padding: 20, alignItems: "center", marginTop: 10, opacity: 0.6 },
  footerText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.text, textAlign: "center" },
  footerSubText: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginTop: 2, textAlign: "center" },
  birthdayCard: { backgroundColor: "#FEF2F2", marginHorizontal: 20, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: "#FECACA" },
  birthdayHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 },
  birthdayTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#B91C1C" },
  birthdayRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#FEE2E2" },
  birthdayName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#7F1D1D" },
  birthdayDate: { fontSize: 12, color: "#991B1B", marginTop: 2, fontFamily: "Inter_500Medium" },
  wishBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#FECACA", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 4 },
  wishBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#B91C1C" },
});
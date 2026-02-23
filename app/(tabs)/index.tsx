import React, { useCallback, useMemo, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
} from "react-native";
import * as FileSystem from 'expo-file-system/legacy';
import { default as Constants } from 'expo-constants';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import { isCommitteePosition } from "@/lib/access-control";
import { CATEGORY_LABELS, normalizeMemberStatus, OrgEvent, TransactionCategory, type MemberPaymentRequestKind } from "@/lib/types";
import {
  checkCloudSyncHealth,
  checkLanSyncHealth,
  exportData,
  pullCloudSnapshotToLocalDetailed,
  pullLanSnapshotToLocalDetailed,
  pushCloudSnapshotFromLocalDetailed,
  pushLanSnapshotFromLocalDetailed,
} from "@/lib/storage";
import { parseGregorianDate, splitPhoneNumbers } from "@/lib/member-utils";
import { DEFAULT_LAN_SYNC_URL } from "@/lib/sync-defaults";

const MEMBER_CHANGE_LAST_SEEN_KEY = "@member_change_last_seen_at";

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

const getEventTime = (event: OrgEvent) => {
  const dateText = String((event as any).eventDate || event.date || "").trim();
  const parsed = dateText ? new Date(dateText).getTime() : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
};

// A utility function for consistent currency formatting
const formatCurrency = (amount: number) => `${amount.toLocaleString()} KS`;

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
  const { members, events, transactions, loans, memberChangeRequests, chatThreads, chatMessages, loading, getLoanOutstanding, refreshData, accountSettings } = useData() as any;
  const { currentUser, currentMember, can } = useAuth();
  const userDisplayName = (currentMember?.name || currentUser?.displayName || "").trim();
  const canCreateMember = can("members.create") || can("members.manage");
  const canCreateFinance = can("finance.create") || can("finance.manage");
  const canApproveMemberChanges = can("members.approve_changes");
  const canProposeMemberChanges = can("members.propose_changes");
  const canViewOrgFinanceSummary =
    currentUser?.systemRole === "admin" ||
    isCommitteePosition(currentMember?.orgPosition || currentUser?.orgPosition);
  const hasPersonalFinanceProfile = Boolean(currentUser?.memberId);
  const openPaymentRequest = (kind: MemberPaymentRequestKind) => {
    router.push({ pathname: "/member-payment-requests", params: { kind } } as any);
  };
  const [memberChangeLastSeenAt, setMemberChangeLastSeenAt] = useState<string>("");
  const [syncingNow, setSyncingNow] = useState(false);
  const [refreshingDashboard, setRefreshingDashboard] = useState(false);

  const normalizeUrl = (raw: string): string => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    return withProtocol.replace(/\/+$/, "");
  };

  const handleSyncNow = async () => {
    if (syncingNow) return;
    setSyncingNow(true);
    try {
      const lanEnabled = accountSettings?.syncEnabled !== false;
      const syncServerUrl = normalizeUrl(accountSettings?.syncServerUrl || DEFAULT_LAN_SYNC_URL);
      const cloudEnabled = accountSettings?.cloudSyncEnabled === true;
      const cloudEndpoint = String(accountSettings?.cloudSyncEndpoint || "").trim();

      if ((!lanEnabled || !syncServerUrl) && (!cloudEnabled || !cloudEndpoint)) {
        Alert.alert("Sync", "LAN သို့မဟုတ် Cloud Sync ကို Account Settings မှာ Enable လုပ်ပေးပါ။");
        return;
      }

      let lanHealthLine = "LAN Health: Skip (disabled)";
      if (lanEnabled && syncServerUrl) {
        const health = await checkLanSyncHealth();
        lanHealthLine = health.ok
          ? "LAN Health: OK"
          : `LAN Health: Fail (${health.reason || "unknown"}${health.status ? `/${health.status}` : ""})`;
      }

      let cloudHealthLine = "Cloud Health: Skip (disabled)";
      if (cloudEnabled && cloudEndpoint) {
        const health = await checkCloudSyncHealth();
        cloudHealthLine = health.ok
          ? "Cloud Health: OK"
          : `Cloud Health: Fail (${health.reason || "unknown"}${health.status ? `/${health.status}` : ""})`;
      }

      const pullLan = lanEnabled && syncServerUrl
        ? await pullLanSnapshotToLocalDetailed()
        : ({ ok: false, reason: "disabled_or_empty_url" } as const);
      const pushLan = lanEnabled && syncServerUrl
        ? await pushLanSnapshotFromLocalDetailed()
        : ({ ok: false, reason: "disabled_or_empty_url" } as const);
      const pullCloud = cloudEnabled && cloudEndpoint
        ? await pullCloudSnapshotToLocalDetailed()
        : ({ ok: false, reason: "cloud_disabled_or_empty_endpoint" } as const);
      const pushCloud = cloudEnabled && cloudEndpoint
        ? await pushCloudSnapshotFromLocalDetailed()
        : ({ ok: false, reason: "cloud_disabled_or_empty_endpoint" } as const);

      const asSyncLine = (
        prefix: string,
        result: { ok: boolean; changed?: boolean; reason?: string; status?: number },
        action: "pull" | "push"
      ): string => {
        if (String(result.reason || "").includes("disabled_or_empty")) {
          return `${prefix}: Skip (disabled)`;
        }
        if (action === "pull") {
          return result.ok
            ? `${prefix}: ${result.changed ? "OK" : `Skip (${result.reason || "no_change"})`}`
            : `${prefix}: Fail (${result.reason || "unknown"}${result.status ? `/${result.status}` : ""})`;
        }
        return result.ok
          ? `${prefix}: OK`
          : `${prefix}: Fail (${result.reason || "unknown"}${result.status ? `/${result.status}` : ""})`;
      };

      await refreshData({ skipPull: true });
      const authHintNeeded = [pullCloud.reason, pushCloud.reason].some((r) => String(r || "").includes("unauthorized"));
      const authHint = authHintNeeded
        ? "\nHint: Cloud API Key ကို Google Apps Script API_KEY နဲ့တူအောင် ပြန်စစ်ပါ။ API_KEY မသုံးလျှင် နှစ်ဖက်လုံး အလွတ်ထားပါ။"
        : "";
      Alert.alert(
        "Sync",
        `${asSyncLine("LAN Pull", pullLan, "pull")}\n${asSyncLine("LAN Push", pushLan, "push")}\n${asSyncLine("Cloud Pull", pullCloud, "pull")}\n${asSyncLine("Cloud Push", pushCloud, "push")}\n${lanHealthLine}\n${cloudHealthLine}${authHint}`
      );
    } finally {
      setSyncingNow(false);
    }
  };

  const loadMemberChangeLastSeen = useCallback(async () => {
    const seenAt = (await AsyncStorage.getItem(MEMBER_CHANGE_LAST_SEEN_KEY)) || "";
    setMemberChangeLastSeenAt(seenAt);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadMemberChangeLastSeen();
      void refreshData();
    }, [loadMemberChangeLastSeen, refreshData])
  );

  const handleDashboardRefresh = useCallback(async () => {
    if (refreshingDashboard) return;
    setRefreshingDashboard(true);
    try {
      await refreshData();
    } finally {
      setRefreshingDashboard(false);
    }
  }, [refreshData, refreshingDashboard]);

  const getMemberName = (id?: string) => {
    if (!id) return "";
    const m = members?.find((m: any) => m.id === id);
    return m ? (m.name || `${m.firstName || ""} ${m.lastName || ""}`.trim()) : "";
  };

  const recentTxns: Transaction[] = [...(transactions || [])]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
  const recentEvents: OrgEvent[] = [...(events || [])]
    .sort((a, b) => getEventTime(b) - getEventTime(a))
    .slice(0, 5);

  const totalLoanOutstanding = (loans || []).reduce((acc: number, loan: any) => acc + (getLoanOutstanding(loan.id) || 0), 0);
  const personalLoanOutstanding = useMemo(() => {
    const myMemberId = String(currentUser?.memberId || "");
    if (!myMemberId) return 0;
    return (loans || [])
      .filter((loan: any) => String(loan.memberId || "") === myMemberId)
      .reduce((acc: number, loan: any) => acc + (getLoanOutstanding(loan.id) || 0), 0);
  }, [loans, getLoanOutstanding, currentUser?.memberId]);

  const inferGenderFromName = (rawName: string): "male" | "female" | "other" => {
    const name = String(rawName || "").trim();
    if (!name) return "other";
    const n = name.toLowerCase();
    if (
      name.startsWith("ဆရာတော်") ||
      name.startsWith("ဦး") ||
      name.startsWith("ကို") ||
      name.startsWith("မောင်") ||
      name.startsWith("ကိုရင်") ||
      name.startsWith("ဦးဇင်း") ||
      n.startsWith("u ") ||
      n.startsWith("ko ") ||
      n.startsWith("mg ")
    ) return "male";
    if (
      name.startsWith("ဒေါ်") ||
      name.startsWith("မ") ||
      name.startsWith("မိ") ||
      name.startsWith("သီလရှင်") ||
      name.startsWith("ဆရာလေး") ||
      n.startsWith("daw ") ||
      n.startsWith("ma ")
    ) return "female";
    return "other";
  };

  // Calculate Member Gender Stats
  const memberStats = useMemo(() => {
    let male = 0;
    let female = 0;
    let other = 0;
    (members || []).forEach((m: any) => {
      const explicit = String(m?.gender || "").trim().toLowerCase();
      const resolved =
        explicit === "male" || explicit === "female" || explicit === "other"
          ? explicit
          : inferGenderFromName(m?.name || "");
      if (resolved === "male") {
        male++;
      } else if (resolved === "female") {
        female++;
      } else {
        other++;
      }
    });
    return { male, female, other, total: members?.length || 0 };
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

  const eventCount = Array.isArray(events) ? events.length : 0;
  const personalFinanceStats = useMemo(() => {
    const myMemberId = String(currentUser?.memberId || "");
    if (!myMemberId) return { income: 0, expense: 0, net: 0 };
    const rows = (transactions || []).filter((t: any) => String(t.memberId || "") === myMemberId);
    const income = rows
      .filter((t: any) => t.type === "income" && (t.type as string) !== "transfer")
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
    const expense = rows
      .filter((t: any) => t.type === "expense" && (t.type as string) !== "transfer")
      .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);
    return { income, expense, net: income - expense };
  }, [transactions, currentUser?.memberId]);

  const unreadEventCount = useMemo(() => {
    if (!currentUser?.id) return 0;
    return (events || []).filter((item: any) => !item?.readBy?.[currentUser.id]).length;
  }, [events, currentUser?.id]);

  const unreadMessageCount = useMemo(() => {
    if (!currentUser?.id) return 0;
    const me = String(currentUser.id);
    const myThreads = (chatThreads || []).filter((t: any) => (t.participantUserIds || []).includes(me));
    let total = 0;
    for (const thread of myThreads) {
      const lastRead = String(thread?.lastReadAtBy?.[me] || "");
      const rows = (chatMessages || []).filter((m: any) => String(m.threadId) === String(thread.id) && String(m.senderUserId) !== me);
      if (!lastRead) {
        total += rows.length;
      } else {
        const since = new Date(lastRead).getTime();
        total += rows.filter((m: any) => new Date(m.createdAt || 0).getTime() > since).length;
      }
    }
    return total;
  }, [chatThreads, chatMessages, currentUser?.id]);

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
          // Keep auto backup silent to avoid frequent toast spam during normal usage.
        }
      } catch (e) {
        console.error("Auto backup failed", e);
      }
    };

    // Data ပြောင်းလဲပြီး ၃ စက္ကန့်အကြာမှ Backup လုပ်မည် (Debounce)
    timeout = setTimeout(performAutoBackup, 3000);
    return () => clearTimeout(timeout);
  }, [members, transactions, loans]);

  const getAge = (dob: string) => {
      const birthDate = parseGregorianDate(dob);
      if (!birthDate) return 0;
      const now = new Date();
      let age = now.getFullYear() - birthDate.getFullYear();
      const monthDiff = now.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
  };

  const getOccurrenceDate = (dob: string) => {
      const birthDate = parseGregorianDate(dob);
      if (!birthDate) return null;
      const day = birthDate.getDate();
      const month = birthDate.getMonth();

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
    
    const filtered = members.filter(
      (m: any) => normalizeMemberStatus(m.status) === "active" && m.dob && getOccurrenceDate(m.dob) !== null
    );

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

  const requestInbox = useMemo(() => {
    const all = memberChangeRequests || [];
    const visible = canApproveMemberChanges
      ? all
      : all.filter((item: any) => item.createdByUserId === currentUser?.id);
    const pending = visible.filter((item: any) => item.status === "pending").length;
    const approved = visible.filter((item: any) => item.status === "approved").length;
    const rejected = visible.filter((item: any) => item.status === "rejected").length;
    const cancelled = visible.filter((item: any) => item.status === "cancelled").length;
    const newPending = visible.filter((item: any) => {
      if (item.status !== "pending") return false;
      if (!memberChangeLastSeenAt) return true;
      const created = new Date(item.createdAt || 0).getTime();
      const seen = new Date(memberChangeLastSeenAt || 0).getTime();
      return created > seen;
    }).length;
    return {
      visibleCount: visible.length,
      pending,
      approved,
      rejected,
      cancelled,
      newPending,
    };
  }, [memberChangeRequests, canApproveMemberChanges, currentUser?.id, memberChangeLastSeenAt]);

  // Schedule Birthday Notification
  useEffect(() => {
    const scheduleBirthdayNotification = async () => {
      // Expo Go (Android) တွင် Notification မရသဖြင့် Development Build တွင်သာ အလုပ်လုပ်စေမည်
      const isExpoGo = Constants.appOwnership === 'expo';
      if (upcomingBirthdays.length > 0 && Platform.OS !== 'web' && !(Platform.OS === 'android' && isExpoGo)) {
        try {
          const Notifications = require('expo-notifications');
          
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowAlert: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
              shouldShowBanner: true,
              shouldShowList: true,
            }),
          });

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
        } catch (error) {
          console.log("Notification scheduling failed:", error);
        }
      }
    };
    scheduleBirthdayNotification();
  }, [upcomingBirthdays]);

  // Schedule Event Notifications for newly arrived events (sync-friendly, per-user local delivery)
  useEffect(() => {
    const scheduleEventNotifications = async () => {
      const isExpoGo = Constants.appOwnership === 'expo';
      if (Platform.OS === "web" || (Platform.OS === "android" && isExpoGo)) return;
      if (!currentUser?.id) return;
      if (!Array.isArray(events) || events.length === 0) return;
      try {
        const Notifications = require('expo-notifications');
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });

        const key = `@event_notification_seen_ids_${currentUser.id}`;
        const existingRaw = await AsyncStorage.getItem(key);
        const existingIds = new Set<string>(existingRaw ? JSON.parse(existingRaw) : []);
        if (!existingRaw) {
          // First run: baseline only, do not spam old events.
          const baseline = events.map((e: any) => String(e?.id || "")).filter(Boolean);
          await AsyncStorage.setItem(key, JSON.stringify(baseline));
          return;
        }

        const { status } = await Notifications.getPermissionsAsync();
        let finalStatus = status;
        if (status !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          finalStatus = req.status;
        }
        if (finalStatus !== "granted") return;

        let changed = false;
        const sorted = [...events].sort((a: any, b: any) => new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime());
        for (const item of sorted) {
          const eventId = String(item?.id || "");
          if (!eventId || existingIds.has(eventId)) continue;
          if (item?.createdByUserId && item.createdByUserId === currentUser.id) {
            existingIds.add(eventId);
            changed = true;
            continue;
          }
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `📢 ${item?.topic || item?.title || "Event အသစ်"}`,
              body: String(item?.summary || item?.description || "အသစ်တင်ထားသော event ကိုဖတ်ရှုပါ"),
            },
            trigger: null,
          });
          existingIds.add(eventId);
          changed = true;
        }
        if (changed) {
          await AsyncStorage.setItem(key, JSON.stringify(Array.from(existingIds)));
        }
      } catch (error) {
        console.log("Event notification scheduling failed:", error);
      }
    };
    void scheduleEventNotifications();
  }, [events, currentUser?.id]);

  useEffect(() => {
    const scheduleCommentMentionNotifications = async () => {
      const isExpoGo = Constants.appOwnership === 'expo';
      if (Platform.OS === "web" || (Platform.OS === "android" && isExpoGo)) return;
      if (!currentUser?.id) return;
      if (!Array.isArray(events) || events.length === 0) return;
      try {
        const Notifications = require('expo-notifications');
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });

        const key = `@comment_notification_seen_ids_${currentUser.id}`;
        const existingRaw = await AsyncStorage.getItem(key);
        const seen = new Set<string>(existingRaw ? JSON.parse(existingRaw) : []);

        const allCommentKeys: string[] = [];
        for (const eventItem of events as any[]) {
          const eventId = String(eventItem?.id || "");
          const comments = Array.isArray(eventItem?.comments) ? eventItem.comments : [];
          for (const comment of comments) {
            const commentId = String(comment?.id || "");
            if (!eventId || !commentId) continue;
            allCommentKeys.push(`${eventId}:${commentId}`);
          }
        }
        if (!existingRaw) {
          await AsyncStorage.setItem(key, JSON.stringify(allCommentKeys));
          return;
        }

        const { status } = await Notifications.getPermissionsAsync();
        let finalStatus = status;
        if (status !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          finalStatus = req.status;
        }
        if (finalStatus !== "granted") return;

        let changed = false;
        const orderedEvents = [...(events as any[])].sort((a, b) => new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime());
        for (const eventItem of orderedEvents) {
          const eventId = String(eventItem?.id || "");
          const eventTitle = String(eventItem?.topic || eventItem?.title || "သတင်း");
          const comments = Array.isArray(eventItem?.comments) ? [...eventItem.comments] : [];
          comments.sort((a: any, b: any) => new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime());
          for (const comment of comments) {
            const commentId = String(comment?.id || "");
            if (!eventId || !commentId) continue;
            const marker = `${eventId}:${commentId}`;
            if (seen.has(marker)) continue;

            const byMe = String(comment?.userId || "") === String(currentUser.id || "");
            const mentionIds = Array.isArray(comment?.mentionUserIds) ? comment.mentionUserIds.map((v: any) => String(v)) : [];
            const mentionedMe = mentionIds.includes(String(currentUser.id));
            const replyToMe = String(comment?.replyToUserId || "") === String(currentUser.id || "");
            if (!byMe && (mentionedMe || replyToMe)) {
              const author = String(comment?.displayName || comment?.memberId || "တစ်ဦး");
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `💬 ${author} က သင့်ကို reply/tag လုပ်ထားသည်`,
                  body: `${eventTitle} - ${String(comment?.message || "").slice(0, 80)}`,
                },
                trigger: null,
              });
            }
            seen.add(marker);
            changed = true;
          }
        }
        if (changed) {
          await AsyncStorage.setItem(key, JSON.stringify(Array.from(seen)));
        }
      } catch (error) {
        console.log("Comment notification scheduling failed:", error);
      }
    };
    void scheduleCommentMentionNotifications();
  }, [events, currentUser?.id]);

  const handleSendWish = (phone: string, name: string, secondaryPhone?: string) => {
    const { primaryPhone, secondaryPhone: fallbackPhone } = splitPhoneNumbers(phone, secondaryPhone);
    const targetPhone = primaryPhone || fallbackPhone;
    if (!targetPhone) {
      Alert.alert("ဖုန်းနံပါတ်မရှိပါ", "ဤအသင်းဝင်တွင် ဖုန်းနံပါတ် ထည့်သွင်းထားခြင်း မရှိပါ။");
      return;
    }
    const message = `Happy Birthday ${name}! 🎂🎁 Best wishes from our Organization.`;
    const url = `sms:${targetPhone}${Platform.OS === "ios" ? "&" : "?"}body=${encodeURIComponent(message)}`;
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
      refreshControl={
        <RefreshControl
          refreshing={refreshingDashboard}
          onRefresh={() => void handleDashboardRefresh()}
          tintColor={Colors.light.tint}
          colors={[Colors.light.tint]}
        />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>မင်္ဂလာပါ{userDisplayName ? `၊ ${userDisplayName}` : ""}</Text>
          <Text style={styles.orgName}>OrgHub Dashboard</Text>
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
                <Text style={styles.subBalanceText}>အခြား: {memberStats.other}</Text>
              </View>
            </View>
          } 
          color="#8B5CF6" 
          onPress={() => router.push("/members" as any)} 
        />
        {canViewOrgFinanceSummary && (
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
        )}
        {(!canViewOrgFinanceSummary || hasPersonalFinanceProfile) && (
          <StatCard
            icon="wallet"
            label="ကိုယ်ပိုင်ငွေစာရင်း"
            value={
              <View>
                <View style={{ marginBottom: 4 }}>
                  <Text style={styles.subBalanceText}>အသင်းသို့ပေးသွင်းငွေများ: {formatCurrency(personalFinanceStats.income)}</Text>
                  <Text style={styles.subBalanceText}>အသင်းမှထုတ်ယူငွေ: {formatCurrency(personalFinanceStats.expense)}</Text>
                </View>
                <Text style={styles.statValue}>စုစုပေါင်းကွာဟချက်: {formatCurrency(personalFinanceStats.net)}</Text>
              </View>
            }
            color="#10B981"
            onPress={() => router.push("/finance" as any)}
          />
        )}
        {canViewOrgFinanceSummary && (
          <StatCard
            icon="cash"
            label="ချေးငွေလက်ကျန် (စုစုပေါင်း)"
            value={formatCurrency(totalLoanOutstanding)}
            color="#F59E0B"
            onPress={() => router.push("/loans" as any)}
          />
        )}
        {(!canViewOrgFinanceSummary || hasPersonalFinanceProfile) && (
          <StatCard
            icon="cash"
            label="ချေးငွေလက်ကျန် (ကိုယ်ပိုင်)"
            value={formatCurrency(personalLoanOutstanding)}
            color="#F59E0B"
            onPress={() => router.push("/loans" as any)}
          />
        )}
        <StatCard icon="calendar" label="သတင်းပို့ရန်" value={eventCount.toString()} color="#3B82F6" onPress={() => router.push("/events" as any)} />
      </View>

      <View style={styles.noticeRow}>
        <Pressable style={styles.noticeCard} onPress={() => router.push("/events" as any)}>
          <Text style={styles.noticeTitle}>📰 Event အသစ်</Text>
          <Text style={styles.noticeCount}>{unreadEventCount}</Text>
        </Pressable>
        <Pressable style={styles.noticeCard} onPress={() => router.push("/messages" as any)}>
          <Text style={styles.noticeTitle}>💬 Message အသစ်</Text>
          <Text style={styles.noticeCount}>{unreadMessageCount}</Text>
        </Pressable>
      </View>

      {(canApproveMemberChanges || canProposeMemberChanges) && (
        <Pressable style={styles.requestInboxCard} onPress={() => router.push("/member-change-approvals" as any)}>
          <View style={styles.requestInboxHeader}>
            <View style={styles.requestInboxIconWrap}>
              <Ionicons name="checkmark-done-outline" size={18} color={Colors.light.tint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.requestInboxTitle}>
                {canApproveMemberChanges ? "Member Change Approval Inbox" : "My Change Requests"}
              </Text>
              <Text style={styles.requestInboxSubtitle}>
                Total: {requestInbox.visibleCount}
                {requestInbox.newPending > 0 ? ` • New Pending: ${requestInbox.newPending}` : ""}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.light.textSecondary} />
          </View>
          <View style={styles.requestInboxStats}>
            <Text style={styles.requestStatText}>Pending: {requestInbox.pending}</Text>
            <Text style={styles.requestStatText}>Approved: {requestInbox.approved}</Text>
            <Text style={styles.requestStatText}>Rejected: {requestInbox.rejected}</Text>
            <Text style={styles.requestStatText}>Cancelled: {requestInbox.cancelled}</Text>
          </View>
        </Pressable>
      )}

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
              <Pressable
                style={[styles.wishBtn, { backgroundColor: getBirthdayColor(m.dob) + '15' }]}
                onPress={() => handleSendWish(m.phone, m.name, (m as any).secondaryPhone)}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={getBirthdayColor(m.dob)} />
                <Text style={[styles.wishBtnText, { color: getBirthdayColor(m.dob) }]}>Wish</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>အမြန်လုပ်ဆောင်ချက်များ</Text>
      <View style={styles.quickActions}>
        <QuickAction icon="sync-outline" label={syncingNow ? "Syncing..." : "Sync Now"} onPress={() => void handleSyncNow()} />
        <QuickAction icon="chatbubbles-outline" label="Messages" onPress={() => router.push("/messages" as any)} />
        {canCreateMember && <QuickAction icon="person-add" label="အသင်းဝင်သစ်" onPress={() => router.push("/add-member" as any)} />}
        {canCreateFinance && <QuickAction icon="add-circle" label="ငွေစာရင်းသစ်" onPress={() => router.push("/add-transaction" as any)} />}
        {canCreateFinance && <QuickAction icon="business" label="ချေးငွေအသစ်" onPress={() => router.push("/add-loan" as any)} />}
        <QuickAction icon="megaphone-outline" label="သတင်းပို့ရန်" onPress={() => router.push("/events" as any)} />
        <QuickAction icon="card-outline" label="လစဉ်ကြေးပေးသွင်းရန်" onPress={() => openPaymentRequest("member_fees")} />
        <QuickAction icon="gift-outline" label="လှူဒါန်းရန်" onPress={() => openPaymentRequest("donations")} />
        <QuickAction icon="cash-outline" label="ချေးငွေဆပ်ရန်" onPress={() => openPaymentRequest("loan_repayment")} />
        <QuickAction icon="trending-up-outline" label="အတိုးဆပ်ရန်" onPress={() => openPaymentRequest("interest_income")} />
        <QuickAction icon="document-text-outline" label="ငွေတောင်းခံရန်" onPress={() => router.push("/expense-claims" as any)} />
      </View>

      {recentEvents.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent Events</Text>
          {recentEvents.map((event) => (
            <Pressable key={event.id} style={styles.recentEventRow} onPress={() => router.push({ pathname: "/event-detail", params: { id: event.id } } as any)}>
              <View style={styles.recentEventIcon}>
                <Ionicons name="calendar-outline" size={16} color="#3B82F6" />
              </View>
              <View style={styles.recentEventInfo}>
                <Text style={styles.recentEventTitle} numberOfLines={1}>{event.title || "Untitled Event"}</Text>
                <Text style={styles.recentEventMeta} numberOfLines={1}>
                  {(event as any).eventDate || event.date || "-"} {(event as any).eventTime || ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.light.textSecondary} />
            </Pressable>
          ))}
        </>
      )}

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
  noticeRow: { flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 18 },
  noticeCard: { flex: 1, backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, padding: 12 },
  noticeTitle: { fontSize: 12, color: Colors.light.textSecondary, fontFamily: "Inter_600SemiBold" },
  noticeCount: { fontSize: 20, color: Colors.light.text, fontFamily: "Inter_700Bold", marginTop: 4 },
  statCard: { flex: 1, minWidth: "45%", backgroundColor: "white", borderRadius: 16, padding: 16, borderLeftWidth: 4, elevation: 1 },
  statIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", marginBottom: 10 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.text },
  statLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary, marginTop: 2 },
  subBalanceText: { fontSize: 10, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.text, paddingHorizontal: 20, marginBottom: 15 },
  quickActions: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, gap: 12, marginBottom: 25 },
  quickAction: { width: "31%", minWidth: 95, backgroundColor: "white", padding: 12, borderRadius: 16, alignItems: "center", elevation: 1 },
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
  recentEventRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    marginHorizontal: 20,
  },
  recentEventIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    backgroundColor: "#DBEAFE",
  },
  recentEventInfo: { flex: 1 },
  recentEventTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  recentEventMeta: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
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
  requestInboxCard: {
    backgroundColor: "white",
    marginHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 14,
    marginBottom: 20,
  },
  requestInboxHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  requestInboxIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.light.tint + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  requestInboxTitle: {
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  requestInboxSubtitle: {
    color: Colors.light.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  requestInboxStats: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  requestStatText: {
    color: Colors.light.textSecondary,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    backgroundColor: Colors.light.background,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});

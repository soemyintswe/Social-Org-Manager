import React, { useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  FlatList,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import {
  MEMBER_PAYMENT_REQUEST_KIND_LABELS,
  MOBILE_WALLET_PROVIDER_LABELS,
  normalizeOrgPosition,
  type MemberPaymentRequestKind,
  type MobileWalletProvider,
} from "@/lib/types";

const KIND_TO_CATEGORY_HINT: Record<MemberPaymentRequestKind, string> = {
  member_fees: "လစဉ်ကြေးရငွေ",
  donations: "အလှူငွေရရှိ",
  loan_repayment: "ချေးငွေပြန်ဆပ်ရရှိငွေ",
  interest_income: "အတိုးရငွေ",
};

const REQUEST_KIND_OPTIONS: MemberPaymentRequestKind[] = [
  "member_fees",
  "donations",
  "loan_repayment",
  "interest_income",
];

const WALLET_OPTIONS: MobileWalletProvider[] = ["kbz_pay", "wave_pay", "aya_pay"];
const WALLET_APP_URLS: Record<MobileWalletProvider, string[]> = {
  kbz_pay: [
    "intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.kbzbank.kpaycustomer;end",
    "intent://#Intent;package=com.kbzbank.kpaycustomer;scheme=kbzpay;end",
    "kbzpay://",
    "kpay://",
  ],
  wave_pay: [
    "intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=mm.com.wavemoney.wavepay;end",
    "intent://#Intent;package=mm.com.wavemoney.wavepay;scheme=wavepay;end",
    "wavepay://",
  ],
  aya_pay: [
    "intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.ayapay.wallet;end",
    "intent://#Intent;package=com.ayapay.wallet;scheme=ayapay;end",
    "ayapay://",
  ],
};

const formatDateYmd = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export default function MemberPaymentRequestsScreen() {
  const insets = useSafeAreaInsets();
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const {
    memberPaymentRequests = [],
    members = [],
    transactions = [],
    createMemberPaymentRequest,
    approveMemberPaymentRequest,
    rejectMemberPaymentRequest,
    accountSettings,
  } = useData() as any;
  const { currentUser, currentMember } = useAuth();
  const [openCreate, setOpenCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [requestKind, setRequestKind] = useState<MemberPaymentRequestKind>(
    REQUEST_KIND_OPTIONS.includes(kind as MemberPaymentRequestKind)
      ? (kind as MemberPaymentRequestKind)
      : "member_fees"
  );
  const [amount, setAmount] = useState("");
  const [payerName, setPayerName] = useState(currentMember?.name || currentUser?.displayName || "");
  const [payForType, setPayForType] = useState<"self" | "other">("self");
  const [selectedForMemberId, setSelectedForMemberId] = useState(currentMember?.id || "");
  const [selectedForMemberName, setSelectedForMemberName] = useState(currentMember?.name || currentUser?.displayName || "");
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [feeStartDate, setFeeStartDate] = useState(new Date());
  const [feeEndDate, setFeeEndDate] = useState(new Date());
  const [showFeeStartPicker, setShowFeeStartPicker] = useState(false);
  const [showFeeEndPicker, setShowFeeEndPicker] = useState(false);
  const [walletProvider, setWalletProvider] = useState<MobileWalletProvider>("kbz_pay");
  const [walletAccountName, setWalletAccountName] = useState("");
  const [walletAccountNumber, setWalletAccountNumber] = useState("");
  const [walletReference, setWalletReference] = useState("");
  const [note, setNote] = useState("");
  const [proofImage, setProofImage] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [reviewModalId, setReviewModalId] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"approved" | "rejected">("approved");
  const [reviewNote, setReviewNote] = useState("");

  const role = normalizeOrgPosition(currentMember?.orgPosition || currentUser?.orgPosition || "member");
  const canReview = currentUser?.systemRole === "admin" || role === "treasurer";

  const visibleRequests = useMemo(() => {
    const sorted = [...memberPaymentRequests].sort(
      (a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
    );
    if (canReview) return sorted;
    return sorted.filter((item: any) => item.createdByUserId === currentUser?.id);
  }, [memberPaymentRequests, canReview, currentUser?.id]);

  const pendingCount = useMemo(
    () => visibleRequests.filter((item: any) => item.status === "pending_treasurer_review").length,
    [visibleRequests]
  );
  const selectedReviewRequest = useMemo(
    () => visibleRequests.find((item: any) => item.id === reviewModalId),
    [visibleRequests, reviewModalId]
  );

  const feeOverlapRecords = useMemo(() => {
    if (requestKind !== "member_fees" || !selectedForMemberId) return [];
    const start = new Date(feeStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(feeEndDate);
    end.setHours(23, 59, 59, 999);
    return (transactions || []).filter((t: any) => {
      if (t?.type !== "income" || t?.category !== "member_fees") return false;
      if (String(t?.memberId || "") !== String(selectedForMemberId)) return false;
      if (!t?.feePeriodStart || !t?.feePeriodEnd) return false;
      const tStart = new Date(t.feePeriodStart);
      tStart.setHours(0, 0, 0, 0);
      const tEnd = new Date(t.feePeriodEnd);
      tEnd.setHours(23, 59, 59, 999);
      return start <= tEnd && end >= tStart;
    });
  }, [transactions, requestKind, selectedForMemberId, feeStartDate, feeEndDate]);

  const openWalletApp = async (provider: MobileWalletProvider) => {
    const urls = WALLET_APP_URLS[provider];
    for (const url of urls) {
      try {
        await Linking.openURL(url);
        return;
      } catch {}
    }
    Alert.alert("Wallet App မဖွင့်နိုင်ပါ", "သက်ဆိုင်ရာ Wallet App ကို ဖုန်းတွင် install လုပ်ထားသလား စစ်ပါ။");
  };

  const selectSelf = () => {
    setPayForType("self");
    setSelectedForMemberId(currentMember?.id || "");
    setSelectedForMemberName(currentMember?.name || currentUser?.displayName || "");
  };

  const openOtherMemberPicker = () => {
    setPayForType("other");
    setMemberPickerOpen(true);
  };

  const onPickMember = (member: any) => {
    setSelectedForMemberId(String(member?.id || ""));
    setSelectedForMemberName(String(member?.name || ""));
    setMemberPickerOpen(false);
  };

  const pickProofImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("လိုအပ်ချက်", "ပြေစာပုံတင်ရန် Photo permission လိုအပ်ပါသည်။");
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.65,
        base64: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      if (asset.base64) {
        const mime = asset.mimeType || "image/jpeg";
        setProofImage(`data:${mime};base64,${asset.base64}`);
        return;
      }
      if (asset.uri) {
        setProofImage(asset.uri);
      }
    } catch {
      Alert.alert("အမှားအယွင်း", "ပြေစာပုံ ရွေးရာတွင် အဆင်မပြေပါ။");
    }
  };

  const submitRequest = async () => {
    if (!currentUser?.id) return;
    const numericAmount = Number(amount || 0);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert("လိုအပ်ချက်", "ငွေပမာဏကို မှန်ကန်စွာ ဖြည့်ပါ။");
      return;
    }
    if (!payerName.trim()) {
      Alert.alert("လိုအပ်ချက်", "ငွေပေးသွင်းသူအမည် ဖြည့်ပါ။");
      return;
    }
    if (!walletReference.trim()) {
      Alert.alert("လိုအပ်ချက်", "Wallet Transaction Ref/မှတ်ပုံတင်နံပါတ် ဖြည့်ပါ။");
      return;
    }
    if (!selectedForMemberId || !selectedForMemberName.trim()) {
      Alert.alert("လိုအပ်ချက်", "ငွေပေးသွင်းမည့် အသင်းဝင်ကို ရွေးချယ်ပေးပါ။");
      return;
    }
    if (requestKind === "member_fees") {
      if (feeEndDate < feeStartDate) {
        Alert.alert("လိုအပ်ချက်", "To Date သည် From Date ထက်နောက်ကျရပါမည်။");
        return;
      }
      if (feeOverlapRecords.length > 0) {
        const info = feeOverlapRecords
          .slice(0, 3)
          .map((t: any) => `• ${t.date || "-"} (Ref: ${t.receiptNumber || "-"})`)
          .join("\n");
        Alert.alert("ယခင်ကပေးသွင်းပြီးဖြစ်ပါသည်", `ဤကာလနှင့် ထပ်နေသော ပေးသွင်းမှုရှိပါသည်:\n${info}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      await createMemberPaymentRequest({
        kind: requestKind,
        amount: numericAmount,
        forMemberId: selectedForMemberId,
        forMemberName: selectedForMemberName.trim(),
        payerMemberId: currentMember?.id,
        payerName: payerName.trim(),
        walletProvider,
        walletAccountName: walletAccountName.trim() || undefined,
        walletAccountNumber: walletAccountNumber.trim() || undefined,
        walletReference: walletReference.trim(),
        proofImage: proofImage || undefined,
        note: note.trim() || undefined,
        feePeriodStart: requestKind === "member_fees" ? formatDateYmd(feeStartDate) : undefined,
        feePeriodEnd: requestKind === "member_fees" ? formatDateYmd(feeEndDate) : undefined,
        createdByUserId: currentUser.id,
        createdByMemberId: currentMember?.id,
      });
      setOpenCreate(false);
      setAmount("");
      setWalletReference("");
      setNote("");
      setProofImage("");
      selectSelf();
      Alert.alert(
        "တင်သွင်းပြီးပါပြီ",
        "ငွေပေးသွင်းတောင်းခံမှုကို ဘဏ္ဍာရေးမှူးထံ ပို့ပြီးပါပြီ။ အတည်ပြုပြီးမှ ရငွေစာရင်းသို့ သွင်းပါမည်။"
      );
    } catch {
      Alert.alert("အမှားအယွင်း", "တင်သွင်းရာတွင် အဆင်မပြေပါ။");
    } finally {
      setSubmitting(false);
    }
  };

  const submitReview = async () => {
    if (!currentUser?.id || !reviewModalId) return;
    if (reviewDecision === "rejected" && !reviewNote.trim()) {
      Alert.alert("လိုအပ်ချက်", "Reject ပြုလုပ်မယ်ဆိုရင် မှတ်ချက်ရေးပေးပါ။");
      return;
    }
    setSavingReview(true);
    try {
      if (reviewDecision === "approved") {
        await approveMemberPaymentRequest({
          requestId: reviewModalId,
          reviewerUserId: currentUser.id,
          reviewNote: reviewNote.trim() || undefined,
        });
      } else {
        await rejectMemberPaymentRequest({
          requestId: reviewModalId,
          reviewerUserId: currentUser.id,
          reviewNote: reviewNote.trim(),
        });
      }
      setReviewModalId(null);
      setReviewNote("");
    } catch {
      Alert.alert("အမှားအယွင်း", "Review သိမ်းရာတွင် မအောင်မြင်ပါ။");
    } finally {
      setSavingReview(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.light.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>ငွေပေးသွင်းတောင်းခံမှု</Text>
          <Text style={styles.headerSub}>
            Pending: {pendingCount} {canReview ? "(Treasurer Inbox)" : "(My Requests)"}
          </Text>
        </View>
        <Pressable onPress={() => setOpenCreate(true)} style={styles.addBtn}>
          <Ionicons name="add" size={18} color="#fff" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {visibleRequests.map((item: any) => {
          const isPending = item.status === "pending_treasurer_review";
          const statusColor = item.status === "approved" ? "#10B981" : item.status === "rejected" ? "#EF4444" : "#F59E0B";
          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.reqNumber}>{item.requestNumber}</Text>
                <Text style={[styles.statusBadge, { color: statusColor }]}>
                  {item.status === "approved" ? "Approved" : item.status === "rejected" ? "Rejected" : "Pending"}
                </Text>
              </View>
              <Text style={styles.mainLine}>
                {item.payerName} • {Number(item.amount || 0).toLocaleString()} KS
              </Text>
              <Text style={styles.subLine}>
                For: {item.forMemberName || "-"} ({item.forMemberId || "-"})
              </Text>
              <Text style={styles.subLine}>
                {MEMBER_PAYMENT_REQUEST_KIND_LABELS[item.kind as MemberPaymentRequestKind]} → {item.categoryLabel}
              </Text>
              {item.kind === "member_fees" ? (
                <Text style={styles.subLine}>
                  Period: {item.feePeriodStart || "-"} to {item.feePeriodEnd || "-"}
                </Text>
              ) : null}
              <Text style={styles.subLine}>
                Wallet: {MOBILE_WALLET_PROVIDER_LABELS[item.walletProvider as MobileWalletProvider]} • Ref: {item.walletReference || "-"}
              </Text>
              {!!item.proofImage && (
                <Pressable style={styles.proofChip} onPress={() => setPreviewImage(String(item.proofImage))}>
                  <Ionicons name="image-outline" size={14} color={Colors.light.tint} />
                  <Text style={styles.proofChipText}>ပြေစာပုံ ကြည့်ရန်</Text>
                </Pressable>
              )}
              {!!item.reviewNote && <Text style={styles.reviewNote}>Review: {item.reviewNote}</Text>}
              {canReview && isPending && (
                <View style={styles.rowActions}>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: "#10B981" }]}
                    onPress={() => {
                      setReviewDecision("approved");
                      setReviewNote("");
                      setReviewModalId(item.id);
                    }}
                  >
                    <Text style={styles.actionText}>Approve</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: "#EF4444" }]}
                    onPress={() => {
                      setReviewDecision("rejected");
                      setReviewNote("");
                      setReviewModalId(item.id);
                    }}
                  >
                    <Text style={styles.actionText}>Reject</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
        {visibleRequests.length === 0 && <Text style={styles.empty}>မှတ်တမ်းမရှိသေးပါ။</Text>}
      </ScrollView>

      <Modal visible={openCreate} animationType="slide" onRequestClose={() => setOpenCreate(false)}>
        <View style={[styles.modalWrap, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setOpenCreate(false)} style={styles.headerBtn}>
              <Ionicons name="close" size={24} color={Colors.light.text} />
            </Pressable>
            <Text style={styles.modalTitle}>ငွေပေးသွင်းတောင်းခံရန်</Text>
            <Pressable onPress={() => void submitRequest()} disabled={submitting}>
              <Text style={styles.saveBtn}>{submitting ? "Saving..." : "တင်မည်"}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}>
            <Text style={styles.label}>တောင်းခံအမျိုးအစား</Text>
            <View style={styles.pillRow}>
              {REQUEST_KIND_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.pill, requestKind === option && styles.pillActive]}
                  onPress={() => setRequestKind(option)}
                >
                  <Text style={[styles.pillText, requestKind === option && styles.pillTextActive]}>
                    {MEMBER_PAYMENT_REQUEST_KIND_LABELS[option]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.hint}>ရငွေစာရင်း ချိတ်ဆက်မည့်အမျိုးအစား: {KIND_TO_CATEGORY_HINT[requestKind]}</Text>

            <Text style={styles.label}>ငွေပမာဏ (KS)</Text>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0" />

            <Text style={styles.label}>ငွေပေးသွင်းသူ (လက်ရှိ account)</Text>
            <TextInput style={styles.input} value={payerName} onChangeText={setPayerName} placeholder="အမည်" />

            <Text style={styles.label}>ငွေပေးသွင်းမည့် အသင်းဝင်</Text>
            <View style={styles.walletRow}>
              <Pressable style={[styles.walletBtn, payForType === "self" && styles.walletBtnActive]} onPress={selectSelf}>
                <Text style={[styles.walletText, payForType === "self" && styles.walletTextActive]}>ကိုယ်တိုင်</Text>
              </Pressable>
              <Pressable style={[styles.walletBtn, payForType === "other" && styles.walletBtnActive]} onPress={openOtherMemberPicker}>
                <Text style={[styles.walletText, payForType === "other" && styles.walletTextActive]}>အခြားအသင်းဝင်</Text>
              </Pressable>
            </View>
            <Pressable style={styles.memberPreview} onPress={() => payForType === "other" && setMemberPickerOpen(true)}>
              <Text style={styles.memberPreviewText}>
                {selectedForMemberName || "-"} ({selectedForMemberId || "-"})
              </Text>
              {payForType === "other" ? <Ionicons name="chevron-down" size={18} color={Colors.light.textSecondary} /> : null}
            </Pressable>

            {requestKind === "member_fees" ? (
              <>
                <Text style={styles.label}>လစဉ်ကြေး ကာလ (From - To)</Text>
                <View style={styles.dateRow}>
                  <Pressable style={styles.dateBtn} onPress={() => setShowFeeStartPicker(true)}>
                    <Text style={styles.dateBtnText}>{formatDateYmd(feeStartDate)}</Text>
                  </Pressable>
                  <Text style={styles.dateDash}>-</Text>
                  <Pressable style={styles.dateBtn} onPress={() => setShowFeeEndPicker(true)}>
                    <Text style={styles.dateBtnText}>{formatDateYmd(feeEndDate)}</Text>
                  </Pressable>
                </View>
                {showFeeStartPicker && (
                  <DateTimePicker
                    value={feeStartDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(_, d) => {
                      setShowFeeStartPicker(false);
                      if (d) setFeeStartDate(d);
                    }}
                  />
                )}
                {showFeeEndPicker && (
                  <DateTimePicker
                    value={feeEndDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(_, d) => {
                      setShowFeeEndPicker(false);
                      if (d) setFeeEndDate(d);
                    }}
                  />
                )}
                {feeOverlapRecords.length > 0 ? (
                  <Text style={styles.dupWarn}>
                    ယခင်ကပေးထားပြီးဖြစ်နိုင်ပါသည်: {feeOverlapRecords.map((t: any) => t.date || "-").join(", ")}
                  </Text>
                ) : null}
              </>
            ) : null}

            <Text style={styles.label}>Mobile Wallet</Text>
            <View style={styles.walletRow}>
              {WALLET_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.walletBtn, walletProvider === option && styles.walletBtnActive]}
                  onPress={() => setWalletProvider(option)}
                >
                  <Text style={[styles.walletText, walletProvider === option && styles.walletTextActive]}>
                    {MOBILE_WALLET_PROVIDER_LABELS[option]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.walletOpenRow}>
              <Pressable style={styles.walletOpenBtn} onPress={() => void openWalletApp("kbz_pay")}>
                <Text style={styles.walletOpenText}>Open KBZ Pay</Text>
              </Pressable>
              <Pressable style={styles.walletOpenBtn} onPress={() => void openWalletApp("wave_pay")}>
                <Text style={styles.walletOpenText}>Open Wave Pay</Text>
              </Pressable>
              <Pressable style={styles.walletOpenBtn} onPress={() => void openWalletApp("aya_pay")}>
                <Text style={styles.walletOpenText}>Open AYA Pay</Text>
              </Pressable>
            </View>
            <View style={styles.recvCard}>
              <Text style={styles.recvTitle}>ဘဏ္ဍာရေးမှူး လက်ခံမည့်အကောင့်များ</Text>
              {(accountSettings?.receivingBankAccountNumber || accountSettings?.receivingBankAccountName || accountSettings?.receivingBankName) ? (
                <Text style={styles.recvLine}>
                  Bank: {accountSettings?.receivingBankName || "-"} / {accountSettings?.receivingBankAccountNumber || "-"} / {accountSettings?.receivingBankAccountName || "-"}
                </Text>
              ) : null}
              {(accountSettings?.receivingKbzPayPhone || accountSettings?.receivingKbzPayAccountName) ? (
                <Text style={styles.recvLine}>
                  KBZ Pay: {accountSettings?.receivingKbzPayPhone || "-"} / {accountSettings?.receivingKbzPayAccountName || "-"}
                </Text>
              ) : null}
              {(accountSettings?.receivingWavePayPhone || accountSettings?.receivingWavePayAccountName) ? (
                <Text style={styles.recvLine}>
                  Wave Pay: {accountSettings?.receivingWavePayPhone || "-"} / {accountSettings?.receivingWavePayAccountName || "-"}
                </Text>
              ) : null}
              {(accountSettings?.receivingAyaPayPhone || accountSettings?.receivingAyaPayAccountName) ? (
                <Text style={styles.recvLine}>
                  AYA Pay: {accountSettings?.receivingAyaPayPhone || "-"} / {accountSettings?.receivingAyaPayAccountName || "-"}
                </Text>
              ) : null}
              {!accountSettings?.receivingBankAccountNumber &&
                !accountSettings?.receivingKbzPayPhone &&
                !accountSettings?.receivingWavePayPhone &&
                !accountSettings?.receivingAyaPayPhone ? (
                <Text style={styles.recvHint}>Account Settings တွင် receiving account များကို အရင်သတ်မှတ်ပေးပါ။</Text>
              ) : null}
            </View>

            <Text style={styles.label}>Wallet Account Name (Optional)</Text>
            <TextInput style={styles.input} value={walletAccountName} onChangeText={setWalletAccountName} placeholder="Account Name" />

            <Text style={styles.label}>Wallet Account Number (Optional)</Text>
            <TextInput style={styles.input} value={walletAccountNumber} onChangeText={setWalletAccountNumber} placeholder="09xxxx" />

            <Text style={styles.label}>Transaction Ref</Text>
            <TextInput style={styles.input} value={walletReference} onChangeText={setWalletReference} placeholder="Wallet Txn Ref" />

            <Text style={styles.label}>ပြေစာပုံ (Receipt Proof)</Text>
            <View style={styles.proofRow}>
              <Pressable style={styles.proofBtn} onPress={() => void pickProofImage()}>
                <Ionicons name="cloud-upload-outline" size={16} color={Colors.light.tint} />
                <Text style={styles.proofBtnText}>Image Upload</Text>
              </Pressable>
              {!!proofImage && (
                <Pressable style={styles.proofBtn} onPress={() => setProofImage("")}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  <Text style={[styles.proofBtnText, { color: "#EF4444" }]}>Remove</Text>
                </Pressable>
              )}
            </View>
            {!!proofImage && (
              <Pressable onPress={() => setPreviewImage(proofImage)} style={styles.proofPreviewWrap}>
                <Image source={{ uri: proofImage }} style={styles.proofPreview} resizeMode="cover" />
              </Pressable>
            )}

            <Text style={styles.label}>မှတ်ချက်</Text>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="အထောက်အထား/မှတ်ချက်"
            />
          </ScrollView>
        </View>
      </Modal>

      <Modal transparent visible={memberPickerOpen} animationType="slide" onRequestClose={() => setMemberPickerOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.memberPickerBox}>
            <Text style={styles.reviewTitle}>အသင်းဝင်ရွေးချယ်ရန်</Text>
            <FlatList
              data={members}
              keyExtractor={(item: any) => String(item.id)}
              renderItem={({ item }) => (
                <Pressable style={styles.memberRow} onPress={() => onPickMember(item)}>
                  <Text style={styles.memberRowName}>{item.name}</Text>
                  <Text style={styles.memberRowId}>{item.id}</Text>
                </Pressable>
              )}
              style={{ maxHeight: 360 }}
            />
            <Pressable style={[styles.actionBtn, { backgroundColor: "#CBD5E1", alignSelf: "flex-end", marginTop: 8 }]} onPress={() => setMemberPickerOpen(false)}>
              <Text style={[styles.actionText, { color: Colors.light.text }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={!!reviewModalId} animationType="fade" onRequestClose={() => setReviewModalId(null)}>
        <View style={styles.overlay}>
          <View style={styles.reviewBox}>
            <Text style={styles.reviewTitle}>{reviewDecision === "approved" ? "Approve Request" : "Reject Request"}</Text>
            {!!selectedReviewRequest?.proofImage && (
              <Pressable onPress={() => setPreviewImage(String(selectedReviewRequest.proofImage))} style={{ marginBottom: 10 }}>
                <Image source={{ uri: String(selectedReviewRequest.proofImage) }} style={styles.reviewProofImage} resizeMode="cover" />
              </Pressable>
            )}
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
              multiline
              value={reviewNote}
              onChangeText={setReviewNote}
              placeholder={reviewDecision === "approved" ? "Optional note" : "Reject reason"}
            />
            <View style={styles.rowActions}>
              <Pressable style={[styles.actionBtn, { backgroundColor: "#CBD5E1" }]} onPress={() => setReviewModalId(null)}>
                <Text style={[styles.actionText, { color: Colors.light.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: reviewDecision === "approved" ? "#10B981" : "#EF4444" }]}
                onPress={() => void submitReview()}
                disabled={savingReview}
              >
                <Text style={styles.actionText}>{savingReview ? "Saving..." : "Confirm"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={!!previewImage} animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPreviewImage(null)} />
          <View style={styles.imageViewer}>
            {!!previewImage && <Image source={{ uri: previewImage }} style={styles.viewerImage} resizeMode="contain" />}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerBtn: { padding: 6 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.text },
  headerSub: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  reqNumber: { fontSize: 12, fontFamily: "Inter_700Bold", color: Colors.light.tint },
  statusBadge: { fontSize: 12, fontFamily: "Inter_700Bold" },
  mainLine: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  subLine: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  reviewNote: { fontSize: 12, color: Colors.light.text, marginTop: 6 },
  rowActions: { flexDirection: "row", gap: 8, marginTop: 10, justifyContent: "flex-end" },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  actionText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 12 },
  empty: { textAlign: "center", marginTop: 26, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  modalWrap: { flex: 1, backgroundColor: Colors.light.background },
  modalHeader: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: Colors.light.text },
  saveBtn: { color: Colors.light.tint, fontFamily: "Inter_700Bold", fontSize: 15 },
  label: { marginTop: 12, marginBottom: 6, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.light.text,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Colors.light.surface,
  },
  pillActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  pillText: { fontSize: 12, color: Colors.light.text },
  pillTextActive: { color: "#fff", fontFamily: "Inter_700Bold" },
  hint: { marginTop: 8, fontSize: 12, color: Colors.light.textSecondary },
  walletRow: { flexDirection: "row", gap: 8 },
  walletBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: Colors.light.surface,
  },
  walletBtnActive: { borderColor: Colors.light.tint, backgroundColor: Colors.light.tint + "20" },
  walletText: { fontSize: 12, color: Colors.light.textSecondary, fontFamily: "Inter_600SemiBold" },
  walletTextActive: { color: Colors.light.tint },
  walletOpenRow: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  walletOpenBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.tint,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Colors.light.tint + "14",
  },
  walletOpenText: { color: Colors.light.tint, fontSize: 12, fontFamily: "Inter_700Bold" },
  memberPreview: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  memberPreviewText: { fontSize: 13, color: Colors.light.text, fontFamily: "Inter_600SemiBold" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  dateBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    backgroundColor: Colors.light.surface,
    paddingVertical: 10,
    alignItems: "center",
  },
  dateBtnText: { fontSize: 13, color: Colors.light.text, fontFamily: "Inter_600SemiBold" },
  dateDash: { color: Colors.light.textSecondary, fontFamily: "Inter_700Bold" },
  dupWarn: { marginTop: 6, color: "#DC2626", fontSize: 12, fontFamily: "Inter_500Medium" },
  recvCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    padding: 10,
    gap: 4,
  },
  recvTitle: { fontSize: 12, fontFamily: "Inter_700Bold", color: Colors.light.text },
  recvLine: { fontSize: 12, color: Colors.light.textSecondary, fontFamily: "Inter_500Medium" },
  recvHint: { fontSize: 12, color: "#DC2626", fontFamily: "Inter_500Medium" },
  proofRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  proofBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  proofBtnText: { fontSize: 12, color: Colors.light.tint, fontFamily: "Inter_600SemiBold" },
  proofPreviewWrap: { marginTop: 8, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: Colors.light.border },
  proofPreview: { width: "100%", height: 150, backgroundColor: "#E2E8F0" },
  proofChip: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: Colors.light.tint,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: Colors.light.tint + "15",
  },
  proofChipText: { color: Colors.light.tint, fontFamily: "Inter_600SemiBold", fontSize: 11 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  reviewBox: {
    width: "100%",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  reviewTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 10 },
  memberPickerBox: {
    width: "100%",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  memberRow: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    paddingVertical: 10,
  },
  memberRowName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  memberRowId: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  reviewProofImage: {
    width: "100%",
    height: 150,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#E2E8F0",
  },
  imageViewer: {
    width: "100%",
    maxHeight: "85%",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: "hidden",
  },
  viewerImage: { width: "100%", height: 420, backgroundColor: "#0F172A" },
});

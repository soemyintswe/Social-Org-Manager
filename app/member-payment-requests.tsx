import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
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
import QRCode from "react-native-qrcode-svg";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
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
const DEFAULT_RECEIVING_WALLET_NUMBER = "09773273886";
const DEFAULT_KBZ_PAY_RAW_QR = "hQZLQlpQYXlhQE8C8FACEFECMTFXFgl3MnOIbSYDEBAfnwgEAQGfJAEwF419ca5a14952";
type TlvNode = { tag: string; value: string };

const formatDateYmd = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatTimeHm = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const parseHm = (raw: string) => {
  const text = String(raw || "").trim();
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [h, m] = text.split(":").map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const parseRootTlv = (raw: string): TlvNode[] | null => {
  const text = String(raw || "").trim();
  if (!text) return null;
  let cursor = 0;
  const nodes: TlvNode[] = [];
  while (cursor < text.length) {
    if (cursor + 4 > text.length) return null;
    const tag = text.slice(cursor, cursor + 2);
    const lenRaw = text.slice(cursor + 2, cursor + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenRaw)) return null;
    const len = Number(lenRaw);
    const valueStart = cursor + 4;
    const valueEnd = valueStart + len;
    if (valueEnd > text.length) return null;
    nodes.push({ tag, value: text.slice(valueStart, valueEnd) });
    cursor = valueEnd;
  }
  return nodes;
};

const buildRootTlv = (nodes: TlvNode[]): string =>
  nodes.map((node) => `${node.tag}${String(node.value.length).padStart(2, "0")}${node.value}`).join("");

const crc16CcittFalse = (data: string): string => {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
};

const buildMmqrPayloadWithAmount = (rawPayload: string, amountKs: number): { payload: string; error: string } => {
  const compact = String(rawPayload || "").replace(/\s+/g, "").trim().toUpperCase();
  if (!compact) return { payload: "", error: "MMQR payload မရှိသေးပါ။" };
  const parsed = parseRootTlv(compact);
  if (!parsed || parsed.length === 0) return { payload: "", error: "MMQR payload format မမှန်ပါ။" };
  const rootIndicator = parsed.find((node) => node.tag === "00");
  if (!rootIndicator?.value?.startsWith("01")) {
    return { payload: "", error: "MMQR payload မမှန်ပါ (Tag 00 မကိုက်ညီ)။" };
  }

  const items = parsed.filter((node) => node.tag !== "63" && node.tag !== "54");
  const amountValue = Number(amountKs).toFixed(2);
  const insertBefore = items.findIndex((node) => ["58", "59", "60", "62"].includes(node.tag));
  const nextItems = [...items];
  const modeIndex = nextItems.findIndex((node) => node.tag === "01");
  if (modeIndex >= 0) {
    nextItems[modeIndex] = { tag: "01", value: "12" };
  } else {
    const rootIndex = nextItems.findIndex((node) => node.tag === "00");
    if (rootIndex >= 0) nextItems.splice(rootIndex + 1, 0, { tag: "01", value: "12" });
  }
  if (insertBefore >= 0) {
    nextItems.splice(insertBefore, 0, { tag: "54", value: amountValue });
  } else {
    nextItems.push({ tag: "54", value: amountValue });
  }

  const withoutCrc = `${buildRootTlv(nextItems)}6304`;
  const crc = crc16CcittFalse(withoutCrc);
  return { payload: `${withoutCrc}${crc}`, error: "" };
};

const applyRawAmountTemplate = (
  rawPayload: string,
  amountKs: number
): { payload: string; usedTemplate: boolean } => {
  const raw = String(rawPayload || "").trim();
  if (!raw) return { payload: "", usedTemplate: false };
  const amountInt = String(Math.round(Number(amountKs) || 0));
  const amount2dp = Number(amountKs).toFixed(2);
  const amountCents = String(Math.round((Number(amountKs) || 0) * 100));
  const replacements: [string, string][] = [
    ["{AMOUNT}", amountInt],
    ["{{AMOUNT}}", amountInt],
    ["{AMOUNT_INT}", amountInt],
    ["{AMOUNT_2DP}", amount2dp],
    ["{AMOUNT_CENTS}", amountCents],
  ];

  let next = raw;
  let usedTemplate = false;
  for (const [token, value] of replacements) {
    if (!next.includes(token)) continue;
    next = next.split(token).join(value);
    usedTemplate = true;
  }
  return { payload: next, usedTemplate };
};

const sanitizeMerchantName = (name: string): string => {
  const raw = String(name || "").trim().toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9 .,\-_/]/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || "ORGHUB").slice(0, 25);
};

const buildGenericMmqrFromPhone = (
  phoneNumber: string,
  amountKs: number,
  merchantName?: string
): { payload: string; error: string; isFallback: boolean } => {
  const digits = String(phoneNumber || "").replace(/\D/g, "");
  if (!digits) return { payload: "", error: "လက်ခံမည့်ဖုန်းနံပါတ် မရှိသေးပါ။", isFallback: true };
  const local = digits.startsWith("0") ? digits.slice(1) : digits.startsWith("95") ? digits.slice(2) : digits;
  if (!local) return { payload: "", error: "လက်ခံမည့်ဖုန်းနံပါတ် မမှန်ပါ။", isFallback: true };
  const mmMobile = `0095${local}`;
  const gui = "A000000677010111";
  const merchantAccount = buildRootTlv([
    { tag: "00", value: gui },
    { tag: "01", value: mmMobile },
  ]);
  const amountValue = Number(amountKs).toFixed(2);
  const payloadNoCrc = buildRootTlv([
    { tag: "00", value: "01" },
    { tag: "01", value: "12" },
    { tag: "26", value: merchantAccount },
    { tag: "52", value: "0000" },
    { tag: "53", value: "104" },
    { tag: "54", value: amountValue },
    { tag: "58", value: "MM" },
    { tag: "59", value: sanitizeMerchantName(merchantName || "") },
    { tag: "60", value: "YANGON" },
    { tag: "62", value: buildRootTlv([{ tag: "01", value: "ORGHUB" }]) },
  ]) + "6304";
  const crc = crc16CcittFalse(payloadNoCrc);
  return { payload: `${payloadNoCrc}${crc}`, error: "", isFallback: true };
};

const toDisplayDateTime = (date?: string, time?: string, fallbackIso?: string) => {
  const d = String(date || "").trim();
  const t = String(time || "").trim();
  if (d) {
    const composed = `${d}T${t || "00:00"}:00`;
    const dt = new Date(composed);
    if (!Number.isNaN(dt.getTime())) return dt.toLocaleString();
    return `${d}${t ? ` ${t}` : ""}`;
  }
  if (fallbackIso) {
    const dt = new Date(fallbackIso);
    if (!Number.isNaN(dt.getTime())) return dt.toLocaleString();
  }
  return "-";
};

export default function MemberPaymentRequestsScreen() {
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const { kind, openCreate: openCreateParam, requestId } = useLocalSearchParams<{ kind?: string; openCreate?: string; requestId?: string }>();
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
  const [requestDate, setRequestDate] = useState(formatDateYmd(new Date()));
  const [requestTime, setRequestTime] = useState(formatTimeHm(new Date()));
  const [showRequestDatePicker, setShowRequestDatePicker] = useState(false);
  const [walletProvider, setWalletProvider] = useState<MobileWalletProvider>("kbz_pay");
  const [walletAccountName, setWalletAccountName] = useState("");
  const [walletAccountNumber, setWalletAccountNumber] = useState("");
  const [walletReference, setWalletReference] = useState("");
  const [note, setNote] = useState("");
  const [proofImage, setProofImage] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [amountTouched, setAmountTouched] = useState(false);
  const amountInputRef = useRef<TextInput | null>(null);

  const [reviewModalId, setReviewModalId] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"approved" | "rejected">("approved");
  const [reviewNote, setReviewNote] = useState("");
  const [acceptedDate, setAcceptedDate] = useState(formatDateYmd(new Date()));
  const [acceptedTime, setAcceptedTime] = useState(formatTimeHm(new Date()));
  const [showAcceptedDatePicker, setShowAcceptedDatePicker] = useState(false);

  const role = normalizeOrgPosition(currentMember?.orgPosition || currentUser?.orgPosition || "member");
  const canReview = role === "treasurer";
  const shouldOpenCreateFromParam = useMemo(() => {
    const value = String(openCreateParam || "").trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "open";
  }, [openCreateParam]);

  useEffect(() => {
    const normalizedKind = String(kind || "").trim() as MemberPaymentRequestKind;
    if (!REQUEST_KIND_OPTIONS.includes(normalizedKind)) return;
    setRequestKind(normalizedKind);
  }, [kind]);

  useEffect(() => {
    if (!shouldOpenCreateFromParam) return;
    setOpenCreate(true);
  }, [shouldOpenCreateFromParam]);

  const visibleRequests = useMemo(() => {
    const sorted = [...memberPaymentRequests].sort(
      (a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
    );
    if (canReview) return sorted;
    return sorted.filter((item: any) => item.createdByUserId === currentUser?.id);
  }, [memberPaymentRequests, canReview, currentUser?.id]);

  useEffect(() => {
    const targetId = String(requestId || "").trim();
    if (!targetId) return;
    const found = visibleRequests.find((item: any) => String(item?.id || "") === targetId);
    if (found) setReviewModalId(targetId);
  }, [requestId, visibleRequests]);

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

  const numericAmount = useMemo(() => {
    const cleaned = String(amount || "").replace(/[^\d.]/g, "");
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed);
  }, [amount]);

  const selectedReceivingWallet = useMemo(() => {
    if (walletProvider === "kbz_pay") {
      return {
        number: String(accountSettings?.receivingKbzPayPhone || "").trim(),
        name: String(accountSettings?.receivingKbzPayAccountName || "").trim(),
        mmqr: String(accountSettings?.receivingKbzPayMmqr || DEFAULT_KBZ_PAY_RAW_QR).trim(),
      };
    }
    if (walletProvider === "wave_pay") {
      return {
        number: String(accountSettings?.receivingWavePayPhone || "").trim(),
        name: String(accountSettings?.receivingWavePayAccountName || "").trim(),
        mmqr: String(accountSettings?.receivingWavePayMmqr || "").trim(),
      };
    }
    return {
      number: String(accountSettings?.receivingAyaPayPhone || "").trim(),
      name: String(accountSettings?.receivingAyaPayAccountName || "").trim(),
      mmqr: String(accountSettings?.receivingAyaPayMmqr || "").trim(),
    };
  }, [
    walletProvider,
    accountSettings?.receivingKbzPayPhone,
    accountSettings?.receivingKbzPayAccountName,
    accountSettings?.receivingKbzPayMmqr,
    accountSettings?.receivingWavePayPhone,
    accountSettings?.receivingWavePayAccountName,
    accountSettings?.receivingWavePayMmqr,
    accountSettings?.receivingAyaPayPhone,
    accountSettings?.receivingAyaPayAccountName,
    accountSettings?.receivingAyaPayMmqr,
  ]);

  const receivingWalletNumber = selectedReceivingWallet.number || DEFAULT_RECEIVING_WALLET_NUMBER;
  const receivingWalletName = selectedReceivingWallet.name;
  const hasValidAmount = numericAmount > 0;
  const mmqrBuild = useMemo(() => {
    if (!hasValidAmount) return { payload: "", error: "", isFallback: false, mode: "none" as const, amountInQr: false };
    const rawPayload = String(selectedReceivingWallet.mmqr || "").trim();
    const rawTemplate = applyRawAmountTemplate(rawPayload, numericAmount);
    const preparedRawPayload = rawTemplate.payload;
    if (rawPayload) {
      const emvResult = buildMmqrPayloadWithAmount(preparedRawPayload, numericAmount);
      if (emvResult.payload) {
        return { payload: emvResult.payload, error: "", isFallback: false, mode: "emv" as const, amountInQr: true };
      }
      if (rawTemplate.usedTemplate) {
        return {
          payload: preparedRawPayload,
          error: "",
          isFallback: false,
          mode: "raw_template" as const,
          amountInQr: true,
        };
      }
      // Non-EMV raw payload:
      // - KBZ: keep static raw because user provided proprietary payload that scans reliably.
      // - Wave/AYA: prefer generic MMQR-with-amount so wallets can receive amount in QR.
      if (walletProvider === "kbz_pay") {
        return { payload: rawPayload, error: "", isFallback: false, mode: "raw" as const, amountInQr: false };
      }
      const genericFromPhone = buildGenericMmqrFromPhone(receivingWalletNumber, numericAmount, receivingWalletName);
      if (genericFromPhone.payload) {
        return {
          ...genericFromPhone,
          mode: "generic_from_phone" as const,
          amountInQr: true,
        };
      }
      return { payload: rawPayload, error: "", isFallback: false, mode: "raw" as const, amountInQr: false };
    }
    const generic = buildGenericMmqrFromPhone(receivingWalletNumber, numericAmount, receivingWalletName);
    if (generic.payload) return { ...generic, mode: "generic" as const, amountInQr: true };
    return { payload: "", error: generic.error || "MMQR မပြနိုင်ပါ။", isFallback: false, mode: "none" as const, amountInQr: false };
  }, [hasValidAmount, selectedReceivingWallet.mmqr, numericAmount, receivingWalletNumber, receivingWalletName, walletProvider]);

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
    const parsedRequestTime = parseHm(requestTime);
    if (!parsedRequestTime) {
      Alert.alert("လိုအပ်ချက်", "တောင်းခံအချိန်ကို HH:mm ပုံစံဖြင့် ဖြည့်ပါ။");
      return;
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
        requestedDate: requestDate,
        requestedTime: parsedRequestTime,
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
      setRequestDate(formatDateYmd(new Date()));
      setRequestTime(formatTimeHm(new Date()));
      selectSelf();
      Alert.alert(
        "တင်သွင်းပြီးပါပြီ",
        "ငွေပေးသွင်းတောင်းခံမှုကို ဘဏ္ဍာရေးမှူးထံ ပို့ပြီးပါပြီ။ အတည်ပြုပြီးမှ ရငွေစာရင်းသို့ သွင်းပါမည်။"
      );
    } catch (error: any) {
      const reason = String(error?.message || "");
      if (reason.includes("request_conflict_in_progress")) {
        Alert.alert("မရပါ", "ဤအကြောင်းအရာအတွက် Pending Request တစ်ခုရှိနေပြီးဖြစ်သဖြင့် အသစ်တင်သွင်းလို့မရပါ။");
        return;
      }
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
        const parsedAcceptedTime = parseHm(acceptedTime);
        if (!parsedAcceptedTime) {
          Alert.alert("လိုအပ်ချက်", "လက်ခံချိန်ကို HH:mm ပုံစံဖြင့် ဖြည့်ပါ။");
          return;
        }
        await approveMemberPaymentRequest({
          requestId: reviewModalId,
          reviewerUserId: currentUser.id,
          reviewNote: reviewNote.trim() || undefined,
          acceptedDate,
          acceptedTime: parsedAcceptedTime,
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
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
    >
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
          <Text style={styles.addBtnText}>အသစ်ထည့်ရန်</Text>
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      >
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
              <Text style={styles.subLine}>
                Requested: {toDisplayDateTime(item.requestedDate, item.requestedTime, item.createdAt)}
              </Text>
              {item.status !== "pending_treasurer_review" ? (
                <Text style={styles.subLine}>
                  Reviewed: {toDisplayDateTime(item.acceptedDate, item.acceptedTime, item.reviewedAt)}
                </Text>
              ) : null}
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
                      setAcceptedDate(formatDateYmd(new Date()));
                      setAcceptedTime(formatTimeHm(new Date()));
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
        <KeyboardAvoidingView
          style={[styles.modalWrap, { paddingTop: insets.top }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setOpenCreate(false)} style={styles.headerBtn}>
              <Ionicons name="close" size={24} color={Colors.light.text} />
            </Pressable>
            <Text style={styles.modalTitle}>ငွေပေးသွင်းတောင်းခံရန်</Text>
            <Pressable onPress={() => void submitRequest()} disabled={submitting}>
              <Text style={styles.saveBtn}>{submitting ? "Saving..." : "တင်မည်"}</Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{
              padding: 16,
              paddingBottom: insets.bottom + 120 + (Platform.OS === "android" ? keyboardInset : 0),
            }}
          >
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

            <Text style={styles.label}>တောင်းခံသည့်နေ့စွဲ / အချိန်</Text>
            <View style={styles.dateRow}>
              {Platform.OS === "web" ? (
                <View style={styles.dateBtn}>
                  {React.createElement("input", {
                    type: "date",
                    value: requestDate,
                    onChange: (e: any) => e.target.value && setRequestDate(e.target.value),
                    style: {
                      border: "none",
                      outline: "none",
                      backgroundColor: "transparent",
                      color: Colors.light.text,
                      fontSize: 13,
                      fontFamily: "inherit",
                      width: 120,
                    },
                  })}
                </View>
              ) : (
                <Pressable style={styles.dateBtn} onPress={() => setShowRequestDatePicker(true)}>
                  <Text style={styles.dateBtnText}>{requestDate}</Text>
                </Pressable>
              )}
              <TextInput
                style={[styles.input, styles.timeInput]}
                value={requestTime}
                onChangeText={setRequestTime}
                placeholder="HH:mm"
                maxLength={5}
              />
            </View>
            {showRequestDatePicker && Platform.OS !== "web" && (
              <DateTimePicker
                value={new Date(`${requestDate}T00:00:00`)}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, d) => {
                  setShowRequestDatePicker(false);
                  if (d) setRequestDate(formatDateYmd(d));
                }}
              />
            )}

            <Text style={styles.label}>ငွေပမာဏ (KS)</Text>
            <TextInput
              ref={amountInputRef}
              style={[styles.input, amountTouched && !hasValidAmount && styles.inputRequired]}
              value={amount}
              onChangeText={setAmount}
              onBlur={() => setAmountTouched(true)}
              keyboardType="numeric"
              placeholder="0"
            />
            {amountTouched && !hasValidAmount ? (
              <Text style={styles.requiredHint}>QR ထုတ်ရန် ငွေပမာဏ (KS) ကို အရင်ဖြည့်ပါ။</Text>
            ) : null}

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
                  {Platform.OS === "web" ? (
                    <View style={styles.dateBtn}>
                      {React.createElement("input", {
                        type: "date",
                        value: formatDateYmd(feeStartDate),
                        onChange: (e: any) => e.target.value && setFeeStartDate(new Date(`${e.target.value}T00:00:00`)),
                        style: {
                          border: "none",
                          outline: "none",
                          backgroundColor: "transparent",
                          color: Colors.light.text,
                          fontSize: 13,
                          fontFamily: "inherit",
                          width: 120,
                        },
                      })}
                    </View>
                  ) : (
                    <Pressable style={styles.dateBtn} onPress={() => setShowFeeStartPicker(true)}>
                      <Text style={styles.dateBtnText}>{formatDateYmd(feeStartDate)}</Text>
                    </Pressable>
                  )}
                  <Text style={styles.dateDash}>-</Text>
                  {Platform.OS === "web" ? (
                    <View style={styles.dateBtn}>
                      {React.createElement("input", {
                        type: "date",
                        value: formatDateYmd(feeEndDate),
                        onChange: (e: any) => e.target.value && setFeeEndDate(new Date(`${e.target.value}T00:00:00`)),
                        style: {
                          border: "none",
                          outline: "none",
                          backgroundColor: "transparent",
                          color: Colors.light.text,
                          fontSize: 13,
                          fontFamily: "inherit",
                          width: 120,
                        },
                      })}
                    </View>
                  ) : (
                    <Pressable style={styles.dateBtn} onPress={() => setShowFeeEndPicker(true)}>
                      <Text style={styles.dateBtnText}>{formatDateYmd(feeEndDate)}</Text>
                    </Pressable>
                  )}
                </View>
                {showFeeStartPicker && Platform.OS !== "web" && (
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
                {showFeeEndPicker && Platform.OS !== "web" && (
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
            <View style={styles.walletQrCard}>
              <Text style={styles.walletQrTitle}>MMQR Scan ဖြင့် ငွေပေးချေရန်</Text>
              {hasValidAmount && mmqrBuild.payload ? (
                <View style={styles.walletQrBox}>
                  <QRCode value={mmqrBuild.payload} size={170} />
                </View>
              ) : (
                <Pressable
                  style={styles.walletQrBlocked}
                  onPress={() => {
                    if (!hasValidAmount) {
                      setAmountTouched(true);
                      amountInputRef.current?.focus();
                    }
                  }}
                >
                  <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
                  <Text style={styles.walletQrBlockedText}>
                    {!hasValidAmount
                      ? "Amount ဖြည့်ပြီးမှ QR ထွက်ပါမည်"
                      : `MMQR မပြနိုင်ပါ: ${mmqrBuild.error || "Settings တွင် MMQR payload ထည့်ပါ"}`}
                  </Text>
                </Pressable>
              )}
              <Text style={styles.walletQrMeta}>
                Wallet: {MOBILE_WALLET_PROVIDER_LABELS[walletProvider]}
              </Text>
              <Text style={styles.walletQrMeta}>
                Account: {receivingWalletNumber}
                {receivingWalletName ? ` / ${receivingWalletName}` : ""}
              </Text>
              <Text style={styles.walletQrMeta}>Amount: {hasValidAmount ? `${numericAmount.toLocaleString()} KS` : "-"}</Text>
              <Text style={styles.walletQrHint}>
                Mobile Wallet App ၏ MMQR Scan ဖြင့်ဖတ်ပြီး ငွေပေးချေပါ။
              </Text>
              {mmqrBuild.mode === "raw" ? (
                <Text style={styles.walletQrWarn}>
                  Note: KBZ static raw QR ဖြစ်သောကြောင့် Amount auto-fill မဝင်နိုင်ပါ။ Scan ပြီး Wallet app ထဲတွင် Amount ကိုထည့်ပါ၊ သို့မဟုတ်
                  Settings မှာ MMQR payload template (`{"{AMOUNT}"}` / `{"{AMOUNT_2DP}"}` / `{"{AMOUNT_CENTS}"}`) အသုံးပြုပါ။
                </Text>
              ) : null}
              {mmqrBuild.mode === "raw_template" ? (
                <Text style={styles.walletQrHint}>
                  Template payload ဖြင့် Amount ထည့်သွင်းထားပါသည်။
                </Text>
              ) : null}
              {mmqrBuild.mode === "generic_from_phone" ? (
                <Text style={styles.walletQrHint}>
                  Wallet raw QR သည် amount field မပါတာကြောင့် phone-based MMQR ဖြင့် amount ကို ထည့်ပြထားပါသည်။
                </Text>
              ) : null}
              {mmqrBuild.isFallback ? (
                <Text style={styles.walletQrWarn}>
                  Note: Settings တွင် raw MMQR payload မသတ်မှတ်ရသေးသောကြောင့် generic MMQR ဖြင့်ပြထားပါသည်။
                </Text>
              ) : null}
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
              {accountSettings?.receivingKbzPayMmqr ? <Text style={styles.recvLine}>KBZ Pay MMQR: configured</Text> : null}
              {(accountSettings?.receivingWavePayPhone || accountSettings?.receivingWavePayAccountName) ? (
                <Text style={styles.recvLine}>
                  Wave Pay: {accountSettings?.receivingWavePayPhone || "-"} / {accountSettings?.receivingWavePayAccountName || "-"}
                </Text>
              ) : null}
              {accountSettings?.receivingWavePayMmqr ? <Text style={styles.recvLine}>Wave Pay MMQR: configured</Text> : null}
              {(accountSettings?.receivingAyaPayPhone || accountSettings?.receivingAyaPayAccountName) ? (
                <Text style={styles.recvLine}>
                  AYA Pay: {accountSettings?.receivingAyaPayPhone || "-"} / {accountSettings?.receivingAyaPayAccountName || "-"}
                </Text>
              ) : null}
              {accountSettings?.receivingAyaPayMmqr ? <Text style={styles.recvLine}>AYA Pay MMQR: configured</Text> : null}
              {!accountSettings?.receivingBankAccountNumber &&
                !accountSettings?.receivingKbzPayPhone &&
                !accountSettings?.receivingWavePayPhone &&
                !accountSettings?.receivingAyaPayPhone &&
                !accountSettings?.receivingKbzPayMmqr &&
                !accountSettings?.receivingWavePayMmqr &&
                !accountSettings?.receivingAyaPayMmqr ? (
                <Text style={styles.recvHint}>
                  Account Settings တွင် receiving account နှင့် MMQR payload ကို သတ်မှတ်ပေးပါ။
                </Text>
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
        </KeyboardAvoidingView>
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
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
          <View style={[styles.reviewBox, Platform.OS === "android" ? { marginBottom: keyboardInset } : null]}>
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
            {reviewDecision === "approved" ? (
              <>
                <Text style={styles.label}>လက်ခံသည့်နေ့စွဲ / အချိန်</Text>
                <View style={styles.dateRow}>
                  {Platform.OS === "web" ? (
                    <View style={styles.dateBtn}>
                      {React.createElement("input", {
                        type: "date",
                        value: acceptedDate,
                        onChange: (e: any) => e.target.value && setAcceptedDate(e.target.value),
                        style: {
                          border: "none",
                          outline: "none",
                          backgroundColor: "transparent",
                          color: Colors.light.text,
                          fontSize: 13,
                          fontFamily: "inherit",
                          width: 120,
                        },
                      })}
                    </View>
                  ) : (
                    <Pressable style={styles.dateBtn} onPress={() => setShowAcceptedDatePicker(true)}>
                      <Text style={styles.dateBtnText}>{acceptedDate}</Text>
                    </Pressable>
                  )}
                  <TextInput
                    style={[styles.input, styles.timeInput]}
                    value={acceptedTime}
                    onChangeText={setAcceptedTime}
                    placeholder="HH:mm"
                    maxLength={5}
                  />
                </View>
                {showAcceptedDatePicker && Platform.OS !== "web" ? (
                  <DateTimePicker
                    value={new Date(`${acceptedDate}T00:00:00`)}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(_, d) => {
                      setShowAcceptedDatePicker(false);
                      if (d) setAcceptedDate(formatDateYmd(d));
                    }}
                  />
                ) : null}
              </>
            ) : null}
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
        </KeyboardAvoidingView>
      </Modal>

      <Modal transparent visible={!!previewImage} animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPreviewImage(null)} />
          <View style={styles.imageViewer}>
            {!!previewImage && <Image source={{ uri: previewImage }} style={styles.viewerImage} resizeMode="contain" />}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  addBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
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
  inputRequired: {
    borderColor: "#DC2626",
  },
  requiredHint: {
    marginTop: 4,
    color: "#DC2626",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
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
  walletQrCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    backgroundColor: Colors.light.surface,
    padding: 12,
    alignItems: "center",
  },
  walletQrTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.light.text },
  walletQrBox: {
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    padding: 10,
  },
  walletQrBlocked: {
    marginTop: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderStyle: "dashed",
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  walletQrBlockedText: {
    color: "#92400E",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  walletQrMeta: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
    textAlign: "center",
  },
  walletQrHint: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  walletQrWarn: {
    marginTop: 6,
    fontSize: 11.5,
    color: "#B45309",
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
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
  timeInput: { flex: 0.55, paddingVertical: 10 },
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

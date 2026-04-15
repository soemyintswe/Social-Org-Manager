
import orgStorage from "@/lib/org-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AccessDenied from "@/components/AccessDenied";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { useData } from "@/lib/DataContext";
import { CUSTOM_RELATION_STORAGE_KEY, DEFAULT_RELATION_OPTIONS_WITH_SELF, mergeRelationOptions } from "@/lib/relation-options";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { normalizeOrgPosition, type ExpenseClaim, type StandardAmountChangeRequest, type StandardAmountRule } from "@/lib/types";

const AsyncStorage = orgStorage;

type Tab = "claims" | "amounts";
type ClaimantType = "SELF" | "BEHALF_MEMBER" | "BEHALF_FAMILY" | "OTHER";
type OtherRelatedScope = "org" | "member";
type PickerTarget = "category" | "claimantType" | "member" | "familyOwner" | "otherMember" | "relation" | "event" | "rule";

const CLAIMANT_OPTIONS: { id: ClaimantType; label: string }[] = [
  { id: "SELF", label: "ကိုယ်တိုင်" },
  { id: "BEHALF_MEMBER", label: "ကိုယ်စား(အခြားအသင်းဝင်)" },
  { id: "BEHALF_FAMILY", label: "ကိုယ်စား(မိသားစုဝင်)" },
  { id: "OTHER", label: "အခြားပုဂ္ဂိုလ်" },
];

const BASE_EXPENSE_CATEGORIES = [
  { id: "health_support", label: "ကျန်းမာရေးထောက်ပံ့ငွေ" },
  { id: "education_support", label: "ပညာရေးထောက်ပံ့ငွေ" },
  { id: "funeral_support", label: "နာရေးကူညီငွေ" },
  { id: "loan_disbursement", label: "ချေးငွေထုတ်ပေးငွေ" },
  { id: "bank_charges", label: "ဘဏ်စရိတ်ပေးငွေ" },
  { id: "general_expenses", label: "အထွေထွေအသုံးစရိတ်" },
  { id: "other_expenses", label: "အခြားအသုံးစရိတ်" },
];

const FUNERAL_SUBTYPES = [
  { id: "funeral_support_self", label: "နာရေးကူညီငွေ (ကိုယ်တိုင်)" },
  { id: "funeral_support_family", label: "နာရေးကူညီငွေ (မိသားစုဝင်)" },
  { id: "funeral_support_association_member", label: "နာရေးကူညီငွေ (ဆင်သေရွာအသင်းဝင်)" },
];

const DEFAULT_RELATIONS = DEFAULT_RELATION_OPTIONS_WITH_SELF;
const CLAIM_DRAFT_KEY = "@orghub_expense_claim_draft";

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowHm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function normalizeHm(raw: string): string | null {
  const text = String(raw || "").trim();
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [h, m] = text.split(":").map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function statusLabel(status: string): string {
  if (status === "pending_approval") return "စိစစ်ဆဲ";
  if (status === "approved") return "အတည်ပြု";
  if (status === "rejected") return "ပယ်ချ";
  if (status === "disbursed") return "ငွေထုတ်ပြီး";
  return status;
}

function statusColor(status: string): string {
  if (status === "pending_approval") return "#F59E0B";
  if (status === "approved") return "#10B981";
  if (status === "rejected") return "#EF4444";
  if (status === "disbursed") return "#3B82F6";
  return "#6B7280";
}

function normalizeText(input: any): string {
  return String(input || "").trim();
}

function eventMatchesCategory(event: any, categoryId: string): boolean {
  const text = `${normalizeText(event?.topic)} ${normalizeText(event?.title)} ${normalizeText(event?.summary)} ${normalizeText(event?.detail)}`.toLowerCase();
  if (categoryId === "health_support") return text.includes("ကျန်းမာရေး");
  if (categoryId === "funeral_support") return text.includes("နာရေး");
  if (categoryId === "education_support") return text.includes("ပညာရေး");
  return true;
}

function eventRequiredForCategory(categoryId: string): boolean {
  return categoryId === "health_support" || categoryId === "funeral_support" || categoryId === "education_support";
}

export default function ExpenseClaimsScreen() {
  const { openCreate: openCreateParam } = useLocalSearchParams<{ openCreate?: string }>();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const {
    members = [],
    events = [],
    expenseClaims = [],
    standardAmountRules = [],
    standardAmountChangeRequests = [],
    createExpenseClaim,
    approveExpenseClaim,
    rejectExpenseClaim,
    disburseExpenseClaim,
    createStandardAmountChangeRequest,
    approveStandardAmountChangeRequest,
    rejectStandardAmountChangeRequest,
  } = useData() as any;
  const { can, currentUser, currentMember } = useAuth();

  const canViewFinance = can("finance.view_summary") || can("finance.view_detail") || can("finance.view_self") || can("finance.view_all");
  const role = normalizeOrgPosition(currentMember?.orgPosition || currentUser?.orgPosition || "member");
  const canApprove = role === "patron" || role === "chairperson" || role === "vice_chairperson";
  const canDisburse = role === "treasurer";
  const shouldOpenCreateFromParam = useMemo(() => {
    const value = String(openCreateParam || "").trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "open";
  }, [openCreateParam]);

  const [tab, setTab] = useState<Tab>("claims");
  const [customExpenseCategories, setCustomExpenseCategories] = useState<{ id: string; label: string }[]>([]);
  const [customRelations, setCustomRelations] = useState<string[]>([]);

  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>("category");

  const [claimDate, setClaimDate] = useState(todayYmd());
  const [claimTime, setClaimTime] = useState(nowHm());
  const [categoryId, setCategoryId] = useState("health_support");
  const [categoryLabel, setCategoryLabel] = useState("ကျန်းမာရေးထောက်ပံ့ငွေ");
  const [funeralSubtype, setFuneralSubtype] = useState("funeral_support_self");
  const [claimantType, setClaimantType] = useState<ClaimantType>("SELF");
  const [selectedMemberId, setSelectedMemberId] = useState(currentMember?.id || "");
  const [familyOwnerMemberId, setFamilyOwnerMemberId] = useState(currentMember?.id || "");
  const [familyRelation, setFamilyRelation] = useState<string>(DEFAULT_RELATIONS[0]);
  const [familyClaimantName, setFamilyClaimantName] = useState("");
  const [otherRelatedScope, setOtherRelatedScope] = useState<OtherRelatedScope>("org");
  const [otherRelatedMemberId, setOtherRelatedMemberId] = useState("");
  const [otherRelationDescription, setOtherRelationDescription] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualNrc, setManualNrc] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [reason, setReason] = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewClaim, setReviewClaim] = useState<ExpenseClaim | null>(null);
  const [reviewMode, setReviewMode] = useState<"approve" | "reject">("approve");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [reviewNote, setReviewNote] = useState("");

  const [showDisburseModal, setShowDisburseModal] = useState(false);
  const [disburseClaim, setDisburseClaim] = useState<ExpenseClaim | null>(null);
  const [disbursementMethod, setDisbursementMethod] = useState<"cash" | "bank">("cash");
  const [disbursementDate, setDisbursementDate] = useState(todayYmd());
  const [disbursementTime, setDisbursementTime] = useState(nowHm());
  const [voucherNumber, setVoucherNumber] = useState("");
  const [disbursementNote, setDisbursementNote] = useState("");

  const [showAmountReqModal, setShowAmountReqModal] = useState(false);
  const [ruleKey, setRuleKey] = useState("health_support");
  const [requestedRuleAmount, setRequestedRuleAmount] = useState("");
  const [ruleReason, setRuleReason] = useState("");
  const [showRuleReviewModal, setShowRuleReviewModal] = useState(false);
  const [ruleReviewReq, setRuleReviewReq] = useState<StandardAmountChangeRequest | null>(null);
  const [ruleReviewMode, setRuleReviewMode] = useState<"approve" | "reject">("approve");
  const [ruleReviewNote, setRuleReviewNote] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [catRaw, relationRaw] = await Promise.all([
          AsyncStorage.getItem("@custom_categories"),
          AsyncStorage.getItem(CUSTOM_RELATION_STORAGE_KEY),
        ]);
        if (!mounted) return;
        const parsedCats = catRaw ? JSON.parse(catRaw) : [];
        const parsedRelations = relationRaw ? JSON.parse(relationRaw) : [];
        if (Array.isArray(parsedCats)) {
          setCustomExpenseCategories(parsedCats.filter((x: any) => x?.type === "expense").map((x: any) => ({ id: String(x.id), label: String(x.label || x.id) })));
        }
        if (Array.isArray(parsedRelations)) {
          setCustomRelations(parsedRelations.map((x: any) => String(x)).filter(Boolean));
        }
      } catch {
        setCustomExpenseCategories([]);
        setCustomRelations([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const memberOptions = useMemo(() => [...members].sort((a: any, b: any) => String(a?.name || "").localeCompare(String(b?.name || ""))), [members]);
  const categoryOptions = useMemo(() => {
    const extra = customExpenseCategories.filter((x) => !BASE_EXPENSE_CATEGORIES.some((y) => y.id === x.id));
    return [...BASE_EXPENSE_CATEGORIES, ...extra];
  }, [customExpenseCategories]);
  const relationOptions = useMemo(() => mergeRelationOptions(customRelations, true), [customRelations]);

  const selectedMember = useMemo(() => memberOptions.find((m: any) => String(m.id) === String(selectedMemberId)), [memberOptions, selectedMemberId]);
  const familyOwner = useMemo(() => memberOptions.find((m: any) => String(m.id) === String(familyOwnerMemberId)), [memberOptions, familyOwnerMemberId]);
  const otherRelatedMember = useMemo(() => memberOptions.find((m: any) => String(m.id) === String(otherRelatedMemberId)), [memberOptions, otherRelatedMemberId]);

  const selectedRule = useMemo(() => (standardAmountRules || []).find((r: StandardAmountRule) => r.key === ruleKey), [standardAmountRules, ruleKey]);
  const claimRuleKey = useMemo(() => {
    if (categoryId === "funeral_support") return funeralSubtype;
    if (categoryId.startsWith("custom_")) return `custom_expense:${categoryId}`;
    return categoryId;
  }, [categoryId, funeralSubtype]);
  const claimRule = useMemo(() => (standardAmountRules || []).find((r: StandardAmountRule) => r.key === claimRuleKey), [standardAmountRules, claimRuleKey]);

  const eligibleEvents = useMemo(() => {
    return [...(events || [])]
      .filter((e: any) => eventMatchesCategory(e, categoryId))
      .sort((a: any, b: any) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime());
  }, [events, categoryId]);
  const selectedEvent = useMemo(() => eligibleEvents.find((e: any) => String(e.id) === String(selectedEventId)), [eligibleEvents, selectedEventId]);

  useEffect(() => {
    if (claimRule && claimRule.enabled && Number(claimRule.amount || 0) > 0) {
      setRequestedAmount(String(claimRule.amount));
    }
  }, [claimRule]);

  useEffect(() => {
    if (!selectedEvent) return;
    if (normalizeText(reason)) return;
    const text = normalizeText(selectedEvent?.summary) || normalizeText(selectedEvent?.detail) || normalizeText(selectedEvent?.description);
    if (text) setReason(text);
  }, [selectedEvent, reason]);

  const visibleClaims = useMemo(() => {
    const rows: ExpenseClaim[] = [...(expenseClaims || [])].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    if (canApprove || canDisburse || can("finance.view_detail") || can("finance.view_all")) return rows;
    return rows.filter((x) => x.createdByUserId === currentUser?.id || x.claimantMemberId === currentUser?.memberId || x.relatedMemberId === currentUser?.memberId);
  }, [expenseClaims, canApprove, canDisburse, can, currentUser?.id, currentUser?.memberId]);

  const visibleAmountRequests = useMemo(() => {
    const rows: StandardAmountChangeRequest[] = [...(standardAmountChangeRequests || [])].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    if (canApprove || can("finance.view_detail") || can("finance.view_all")) return rows;
    return rows.filter((x) => x.createdByUserId === currentUser?.id);
  }, [standardAmountChangeRequests, canApprove, can, currentUser?.id]);

  const claimSubject = useMemo(() => {
    if (claimantType === "SELF") {
      return {
        name: currentMember?.name || currentUser?.displayName || "",
        memberId: currentMember?.id || currentUser?.memberId || "",
        nrc: currentMember?.nrc || "",
        phone: currentMember?.phone || "",
        address: (currentMember as any)?.address || "",
      };
    }
    if (claimantType === "BEHALF_MEMBER") {
      return {
        name: selectedMember?.name || "",
        memberId: selectedMember?.id || "",
        nrc: selectedMember?.nrc || "",
        phone: selectedMember?.phone || "",
        address: (selectedMember as any)?.address || "",
      };
    }
    if (claimantType === "BEHALF_FAMILY") {
      return {
        name: familyClaimantName,
        memberId: "",
        nrc: manualNrc,
        phone: manualPhone,
        address: manualAddress,
      };
    }
    return {
      name: manualName,
      memberId: "",
      nrc: manualNrc,
      phone: manualPhone,
      address: manualAddress,
    };
  }, [
    claimantType,
    currentMember,
    currentUser,
    selectedMember,
    familyClaimantName,
    manualName,
    manualNrc,
    manualPhone,
    manualAddress,
  ]);

  const openPicker = (target: PickerTarget) => {
    setPickerTarget(target);
    setShowPicker(true);
  };

  const pickerTitle = useMemo(() => {
    if (pickerTarget === "category") return "Category ရွေးချယ်ရန်";
    if (pickerTarget === "claimantType") return "Claimant Type ရွေးချယ်ရန်";
    if (pickerTarget === "member") return "Member ရွေးချယ်ရန်";
    if (pickerTarget === "familyOwner") return "သက်ဆိုင်သူ Member ရွေးချယ်ရန်";
    if (pickerTarget === "otherMember") return "သက်ဆိုင်သော Member ရွေးချယ်ရန်";
    if (pickerTarget === "relation") return "တော်စပ်ပုံ ရွေးချယ်ရန်";
    if (pickerTarget === "event") return "ဆက်စပ် Event ရွေးချယ်ရန်";
    return "Rule ရွေးချယ်ရန်";
  }, [pickerTarget]);

  const pickerOptions = useMemo(() => {
    if (pickerTarget === "category") return categoryOptions.map((x) => ({ id: x.id, label: x.label }));
    if (pickerTarget === "claimantType") return CLAIMANT_OPTIONS.map((x) => ({ id: x.id, label: x.label }));
    if (pickerTarget === "member" || pickerTarget === "familyOwner" || pickerTarget === "otherMember") {
      return memberOptions.map((m: any) => ({ id: String(m.id), label: `${m.name || "-"} (${m.id || "-"})` }));
    }
    if (pickerTarget === "relation") return relationOptions.map((x) => ({ id: x, label: x }));
    if (pickerTarget === "event") {
      return eligibleEvents.map((e: any) => ({ id: String(e.id), label: `${normalizeText(e.topic) || normalizeText(e.title) || "Event"} - ${normalizeText(e.summary) || normalizeText(e.detail) || normalizeText(e.description) || "-"}` }));
    }
    return (standardAmountRules || []).map((r: StandardAmountRule) => ({ id: r.key, label: r.label }));
  }, [pickerTarget, categoryOptions, memberOptions, relationOptions, eligibleEvents, standardAmountRules]);

  const onSelectPickerOption = (id: string) => {
    if (pickerTarget === "category") {
      const selected = categoryOptions.find((x) => x.id === id);
      setCategoryId(id);
      setCategoryLabel(selected?.label || id);
      setSelectedEventId("");
    } else if (pickerTarget === "claimantType") {
      setClaimantType(id as ClaimantType);
    } else if (pickerTarget === "member") {
      setSelectedMemberId(id);
    } else if (pickerTarget === "familyOwner") {
      setFamilyOwnerMemberId(id);
    } else if (pickerTarget === "otherMember") {
      setOtherRelatedMemberId(id);
    } else if (pickerTarget === "relation") {
      setFamilyRelation(id);
    } else if (pickerTarget === "event") {
      setSelectedEventId(id);
    } else if (pickerTarget === "rule") {
      setRuleKey(id);
    }
    setShowPicker(false);
  };

  const getCurrentPickerSelected = () => {
    if (pickerTarget === "category") return categoryId;
    if (pickerTarget === "claimantType") return claimantType;
    if (pickerTarget === "member") return selectedMemberId;
    if (pickerTarget === "familyOwner") return familyOwnerMemberId;
    if (pickerTarget === "otherMember") return otherRelatedMemberId;
    if (pickerTarget === "relation") return familyRelation;
    if (pickerTarget === "event") return selectedEventId;
    return ruleKey;
  };

  const resetClaimForm = useCallback(() => {
    setClaimDate(todayYmd());
    setClaimTime(nowHm());
    setCategoryId("health_support");
    setCategoryLabel("ကျန်းမာရေးထောက်ပံ့ငွေ");
    setFuneralSubtype("funeral_support_self");
    setClaimantType("SELF");
    setSelectedMemberId(currentMember?.id || "");
    setFamilyOwnerMemberId(currentMember?.id || "");
    setFamilyRelation(DEFAULT_RELATIONS[0]);
    setFamilyClaimantName("");
    setOtherRelatedScope("org");
    setOtherRelatedMemberId("");
    setOtherRelationDescription("");
    setManualName("");
    setManualNrc("");
    setManualPhone("");
    setManualAddress("");
    setReason("");
    setRequestedAmount("");
    setSelectedEventId("");
  }, [currentMember?.id]);

  const openClaimModal = useCallback(() => {
    resetClaimForm();
    setShowClaimModal(true);
  }, [resetClaimForm]);

  useEffect(() => {
    if (!shouldOpenCreateFromParam) return;
    openClaimModal();
  }, [shouldOpenCreateFromParam, openClaimModal]);

  const navigateToAddEvent = async () => {
    await saveClaimDraft();
    setShowClaimModal(false);
    router.push({ pathname: "/events", params: { source: "expense_claim", claimCategory: categoryId } } as any);
  };

  const buildClaimDraft = () => ({
    resumePending: true,
    claimDate,
    claimTime,
    categoryId,
    categoryLabel,
    funeralSubtype,
    claimantType,
    selectedMemberId,
    familyOwnerMemberId,
    familyRelation,
    familyClaimantName,
    otherRelatedScope,
    otherRelatedMemberId,
    otherRelationDescription,
    manualName,
    manualNrc,
    manualPhone,
    manualAddress,
    reason,
    requestedAmount,
    selectedEventId,
    eligibleEventIdsAtNavigate: eligibleEvents.map((e: any) => String(e.id)),
  });

  const applyClaimDraft = (draft: any) => {
    if (!draft || typeof draft !== "object") return;
    setClaimDate(String(draft.claimDate || todayYmd()));
    setClaimTime(String(draft.claimTime || nowHm()));
    setCategoryId(String(draft.categoryId || "health_support"));
    setCategoryLabel(String(draft.categoryLabel || "ကျန်းမာရေးထောက်ပံ့ငွေ"));
    setFuneralSubtype(String(draft.funeralSubtype || "funeral_support_self"));
    setClaimantType((draft.claimantType as ClaimantType) || "SELF");
    setSelectedMemberId(String(draft.selectedMemberId || ""));
    setFamilyOwnerMemberId(String(draft.familyOwnerMemberId || ""));
    setFamilyRelation(String(draft.familyRelation || DEFAULT_RELATIONS[0]));
    setFamilyClaimantName(String(draft.familyClaimantName || ""));
    setOtherRelatedScope((draft.otherRelatedScope as OtherRelatedScope) || "org");
    setOtherRelatedMemberId(String(draft.otherRelatedMemberId || ""));
    setOtherRelationDescription(String(draft.otherRelationDescription || ""));
    setManualName(String(draft.manualName || ""));
    setManualNrc(String(draft.manualNrc || ""));
    setManualPhone(String(draft.manualPhone || ""));
    setManualAddress(String(draft.manualAddress || ""));
    setReason(String(draft.reason || ""));
    setRequestedAmount(String(draft.requestedAmount || ""));
    setSelectedEventId(String(draft.selectedEventId || ""));
    setShowClaimModal(true);
  };

  const saveClaimDraft = async () => {
    try {
      await AsyncStorage.setItem(CLAIM_DRAFT_KEY, JSON.stringify(buildClaimDraft()));
    } catch {
      // ignore
    }
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(CLAIM_DRAFT_KEY);
          if (!raw || !active) return;
          const draft = JSON.parse(raw);
          if (!draft?.resumePending) return;
          applyClaimDraft(draft);

          const previousIds = Array.isArray(draft.eligibleEventIdsAtNavigate)
            ? draft.eligibleEventIdsAtNavigate.map((x: any) => String(x))
            : [];
          const matchingNow = [...(events || [])]
            .filter((e: any) => eventMatchesCategory(e, String(draft.categoryId || "health_support")))
            .sort((a: any, b: any) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime());
          const newlyAdded = matchingNow.find((e: any) => !previousIds.includes(String(e.id)));
          if (newlyAdded) {
            setSelectedEventId(String(newlyAdded.id));
            const eventText =
              normalizeText(newlyAdded?.summary) ||
              normalizeText(newlyAdded?.detail) ||
              normalizeText(newlyAdded?.description);
            if (eventText && !normalizeText(String(draft.reason || ""))) {
              setReason(eventText);
            }
          } else if (matchingNow.length > 0 && !normalizeText(String(draft.selectedEventId || ""))) {
            setSelectedEventId(String(matchingNow[0].id));
          }
          await AsyncStorage.removeItem(CLAIM_DRAFT_KEY);
        } catch {
          // ignore
        }
      })();
      return () => {
        active = false;
      };
    }, [events])
  );

  const openEventPicker = () => {
    if (!eventRequiredForCategory(categoryId)) {
      openPicker("event");
      return;
    }
    if (eligibleEvents.length > 0) {
      openPicker("event");
      return;
    }

    if (Platform.OS === "web") {
      const yes = typeof window !== "undefined"
        ? window.confirm("ဤအမျိုးအစားနှင့်သက်ဆိုင်သော Event မတွေ့ပါ။ Event အသစ်တည်ဆောက်ရန် Add Event သို့သွားမည်လား?")
        : false;
      if (yes) {
        void navigateToAddEvent();
      }
      return;
    }

    Alert.alert(
      "ဆက်စပ် Event မရှိပါ",
      "ဤအမျိုးအစားနှင့်သက်ဆိုင်သော Event မတွေ့ပါ။ Event အသစ်တည်ဆောက်ရန် Add Event စာမျက်နှာသို့သွားမည်လား?",
      [
        { text: "မသွားတော့ပါ", style: "cancel" },
        {
          text: "Add Event",
          onPress: () => {
            void navigateToAddEvent();
          },
        },
      ]
    );
  };

  const validateBeforeSubmit = (): string | null => {
    const amountNum = Number(requestedAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return "ငွေပမာဏ မှန်ကန်စွာ ဖြည့်ပါ။";
    if (!normalizeText(reason)) return "ငွေတောင်းခံရသည့် အကြောင်းအရာအကျဉ်း ဖြည့်ပါ။";
    if (!normalizeText(claimSubject.name)) return "ငွေတောင်းခံသူအမည် ဖြည့်ပါ။";

    if (claimantType === "BEHALF_MEMBER" && !selectedMemberId) return "ကိုယ်စားတင်မည့် Member ရွေးချယ်ပါ။";

    if (claimantType === "BEHALF_FAMILY") {
      if (!familyOwnerMemberId) return "မည်သူ၏ မိသားစုဝင်ဖြစ်သည်ကို Member ရွေးချယ်ပါ။";
      if (!normalizeText(familyRelation)) return "တော်စပ်ပုံ ရွေးချယ်ပါ။";
      if (!normalizeText(familyClaimantName)) return "မိသားစုဝင်အမည် ဖြည့်ပါ။";
      if (!normalizeText(manualNrc) || !normalizeText(manualPhone) || !normalizeText(manualAddress)) {
        return "မိသားစုဝင်၏ NRC / Phone / Address ဖြည့်ရန်လိုပါသည်။";
      }
    }

    if (claimantType === "OTHER") {
      if (!normalizeText(otherRelationDescription)) return "အခြားပုဂ္ဂိုလ်၏ ဆက်စပ်ပုံကို ရှင်းလင်းဖော်ပြပါ။";
      if (otherRelatedScope === "member" && !otherRelatedMemberId) return "သက်ဆိုင်သည့် Member ကိုရွေးချယ်ပါ။";
      if (!normalizeText(manualName) || !normalizeText(manualNrc) || !normalizeText(manualPhone) || !normalizeText(manualAddress)) {
        return "အခြားပုဂ္ဂိုလ်၏ အမည် / NRC / Phone / Address ဖြည့်ရန်လိုပါသည်။";
      }
    }

    if (eventRequiredForCategory(categoryId) && !selectedEventId) return "အမျိုးအစားနှင့်သက်ဆိုင်သည့် Event တစ်ခု ရွေးချယ်ပေးပါ။";

    return null;
  };

  const submitClaim = async () => {
    if (!currentUser?.id) return;
    const validationError = validateBeforeSubmit();
    if (validationError) return Alert.alert("လိုအပ်ချက်", validationError);
    const parsedClaimTime = normalizeHm(claimTime);
    if (!parsedClaimTime) return Alert.alert("လိုအပ်ချက်", "Claim Time ကို HH:mm ပုံစံဖြင့် ဖြည့်ပါ။");

    const amountNum = Number(requestedAmount);
    const relatedMemberId = claimantType === "BEHALF_FAMILY" ? familyOwnerMemberId || undefined : claimantType === "OTHER" && otherRelatedScope === "member" ? otherRelatedMemberId || undefined : undefined;
    const relatedMemberName = claimantType === "BEHALF_FAMILY" ? familyOwner?.name : claimantType === "OTHER" && otherRelatedScope === "member" ? otherRelatedMember?.name : undefined;

    await createExpenseClaim({
      claimDate,
      claimTime: parsedClaimTime,
      expenseCategory: categoryId,
      expenseCategoryLabel: categoryLabel,
      claimantType,
      claimantMemberId:
        claimantType === "SELF"
          ? currentMember?.id || currentUser?.memberId || undefined
          : claimantType === "BEHALF_MEMBER"
          ? selectedMemberId || undefined
          : claimantType === "OTHER" && otherRelatedScope === "member"
          ? otherRelatedMemberId || undefined
          : undefined,
      relatedMemberId,
      relatedMemberName,
      claimantName: normalizeText(claimSubject.name),
      claimantAddress: normalizeText(claimSubject.address) || undefined,
      familyMemberName: claimantType === "BEHALF_FAMILY" ? normalizeText(familyClaimantName) : undefined,
      familyRelation: claimantType === "BEHALF_FAMILY" ? normalizeText(familyRelation) : undefined,
      relationDescription: claimantType === "OTHER" ? normalizeText(otherRelationDescription) : claimantType === "BEHALF_FAMILY" ? `မိသားစုဝင် (${normalizeText(familyRelation)})` : undefined,
      nrc: normalizeText(claimSubject.nrc) || undefined,
      phone: normalizeText(claimSubject.phone) || undefined,
      reason: normalizeText(reason),
      linkedEventId: selectedEventId || undefined,
      linkedEventTitle: selectedEvent && (normalizeText(selectedEvent.topic) || normalizeText(selectedEvent.title) || normalizeText(selectedEvent.summary)),
      requestedAmount: amountNum,
      createdByUserId: currentUser.id,
      createdByMemberId: currentUser.memberId,
    });

    setShowClaimModal(false);
    Alert.alert("အောင်မြင်ပါသည်", "ငွေတောင်းခံလွှာ တင်သွင်းပြီးပါပြီ။");
  };

  const submitReview = async () => {
    if (!currentUser?.id || !reviewClaim) return;
    if (reviewMode === "approve") {
      const n = Number(approvedAmount);
      if (!Number.isFinite(n) || n <= 0) return Alert.alert("လိုအပ်ချက်", "Approved amount ကို မှန်ကန်စွာ ဖြည့်ပါ။");
      if (n !== Number(reviewClaim.requestedAmount || 0) && !normalizeText(reviewNote)) return Alert.alert("လိုအပ်ချက်", "ပမာဏပြင်ပါက မှတ်ချက်ထည့်ရန်လိုပါသည်။");
      await approveExpenseClaim({ claimId: reviewClaim.id, approverUserId: currentUser.id, approvedAmount: n, approvalNote: normalizeText(reviewNote) || undefined });
      setShowReviewModal(false);
      return Alert.alert("အောင်မြင်ပါသည်", "Claim ကို approve လုပ်ပြီးပါပြီ။");
    }
    if (!normalizeText(reviewNote)) return Alert.alert("လိုအပ်ချက်", "Reject note ဖြည့်ရန်လိုပါသည်။");
    await rejectExpenseClaim({ claimId: reviewClaim.id, approverUserId: currentUser.id, approvalNote: normalizeText(reviewNote) });
    setShowReviewModal(false);
    Alert.alert("ပြီးပါပြီ", "Claim ကို reject လုပ်ပြီးပါပြီ။");
  };

  const submitDisburse = async () => {
    if (!currentUser?.id || !disburseClaim) return;
    const parsedTime = normalizeHm(disbursementTime);
    if (!parsedTime) return Alert.alert("လိုအပ်ချက်", "Disburse Time ကို HH:mm ပုံစံဖြင့် ဖြည့်ပါ။");
    await disburseExpenseClaim({
      claimId: disburseClaim.id,
      disburserUserId: currentUser.id,
      method: disbursementMethod,
      disbursementDate: disbursementDate || todayYmd(),
      disbursementTime: parsedTime,
      voucherNumber: normalizeText(voucherNumber) || undefined,
      note: normalizeText(disbursementNote) || undefined,
    });
    setShowDisburseModal(false);
    Alert.alert("အောင်မြင်ပါသည်", "ငွေထုတ်ပေးမှု မှတ်တမ်းတင်ပြီး Auto Transaction ထည့်ပြီးပါပြီ။");
  };

  const submitAmountRequest = async () => {
    if (!currentUser?.id || !selectedRule) return;
    const n = Number(requestedRuleAmount);
    if (!Number.isFinite(n) || n < 0) return Alert.alert("လိုအပ်ချက်", "Requested amount ကို မှန်ကန်စွာဖြည့်ပါ။");
    if (!normalizeText(ruleReason)) return Alert.alert("လိုအပ်ချက်", "ပြင်ဆင်ရသည့်အကြောင်းရင်း ဖြည့်ပါ။");
    await createStandardAmountChangeRequest({ ruleKey: selectedRule.key, ruleLabel: selectedRule.label, requestedAmount: n, reason: normalizeText(ruleReason), createdByUserId: currentUser.id, createdByMemberId: currentUser.memberId });
    setShowAmountReqModal(false);
    Alert.alert("အောင်မြင်ပါသည်", "Amount change request တင်သွင်းပြီးပါပြီ။");
  };

  const submitRuleReview = async () => {
    if (!currentUser?.id || !ruleReviewReq) return;
    if (ruleReviewMode === "approve") {
      await approveStandardAmountChangeRequest(ruleReviewReq.id, currentUser.id, normalizeText(ruleReviewNote) || undefined);
      setShowRuleReviewModal(false);
      return Alert.alert("အောင်မြင်ပါသည်", "Request approve လုပ်ပြီးပါပြီ။");
    }
    if (!normalizeText(ruleReviewNote)) return Alert.alert("လိုအပ်ချက်", "Reject note ဖြည့်ရန်လိုပါသည်။");
    await rejectStandardAmountChangeRequest(ruleReviewReq.id, currentUser.id, normalizeText(ruleReviewNote));
    setShowRuleReviewModal(false);
    Alert.alert("ပြီးပါပြီ", "Request reject လုပ်ပြီးပါပြီ။");
  };

  if (!canViewFinance) return <AccessDenied showBack={true} />;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
    >
      <View style={styles.header}>
        <View style={styles.topRow}>
          <Pressable style={styles.createBtn} onPress={openClaimModal}>
            <Ionicons name="add-circle-outline" size={18} color="white" />
            <Text style={styles.createBtnText}>ငွေတောင်းခံရန်</Text>
          </Pressable>
        </View>
        <Text style={styles.headerTitle}>ငွေတောင်းခံလွှာများ</Text>
      </View>

      <View style={styles.tabs}>
        <Pressable style={[styles.tabBtn, tab === "claims" && styles.tabBtnActive]} onPress={() => setTab("claims")}><Text style={[styles.tabText, tab === "claims" && styles.tabTextActive]}>Claims</Text></Pressable>
        <Pressable style={[styles.tabBtn, tab === "amounts" && styles.tabBtnActive]} onPress={() => setTab("amounts")}><Text style={[styles.tabText, tab === "amounts" && styles.tabTextActive]}>Amount Rules</Text></Pressable>
      </View>

      {tab === "claims" ? (
        <FlatList
          data={visibleClaims}
          keyExtractor={(item: ExpenseClaim) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }: { item: ExpenseClaim }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardNo}>{item.claimNumber}</Text>
                <View style={[styles.statusChip, { backgroundColor: statusColor(item.status) + "20" }]}><Text style={[styles.statusText, { color: statusColor(item.status) }]}>{statusLabel(item.status)}</Text></View>
              </View>
              <Text style={styles.title}>{item.claimantName}</Text>
              <Text style={styles.meta}>{item.expenseCategoryLabel} • {Number(item.requestedAmount || 0).toLocaleString()} KS</Text>
              <Text style={styles.meta}>Claimed At: {item.claimDate || "-"} {item.claimTime || ""}</Text>
              <Text style={styles.meta}>Submitted At: {item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}</Text>
              {item.relatedMemberName ? <Text style={styles.meta}>သက်ဆိုင်သူ: {item.relatedMemberName} ({item.relatedMemberId || "-"})</Text> : null}
              {item.linkedEventTitle ? <Text style={styles.meta}>Event: {item.linkedEventTitle}</Text> : null}
              {item.approvedAmount != null ? <Text style={styles.meta}>Approved: {Number(item.approvedAmount).toLocaleString()} KS</Text> : null}
              {item.approvedAt ? <Text style={styles.meta}>Approved At: {new Date(item.approvedAt).toLocaleString()}</Text> : null}
              {item.disbursementDate ? <Text style={styles.meta}>Disbursed At: {item.disbursementDate} {item.disbursementTime || ""}</Text> : null}
              <Text style={styles.meta}>Reason: {item.reason}</Text>
              <View style={styles.actions}>
                {canApprove && item.status === "pending_approval" ? (
                  <>
                    <Pressable style={[styles.actionBtn, { backgroundColor: "#10B981" }]} onPress={() => { setReviewClaim(item); setReviewMode("approve"); setApprovedAmount(String(item.requestedAmount || "")); setReviewNote(""); setShowReviewModal(true); }}><Text style={styles.actionText}>Approve</Text></Pressable>
                    <Pressable style={[styles.actionBtn, { backgroundColor: "#EF4444" }]} onPress={() => { setReviewClaim(item); setReviewMode("reject"); setReviewNote(""); setShowReviewModal(true); }}><Text style={styles.actionText}>Reject</Text></Pressable>
                  </>
                ) : null}
                {canDisburse && item.status === "approved" ? (
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#3B82F6" }]} onPress={() => { setDisburseClaim(item); setDisbursementDate(todayYmd()); setDisbursementTime(nowHm()); setDisbursementMethod("cash"); setVoucherNumber(item.claimNumber); setDisbursementNote(""); setShowDisburseModal(true); }}><Text style={styles.actionText}>Disburse</Text></Pressable>
                ) : null}
              </View>
            </View>
          )}
          ListFooterComponent={<Pressable style={styles.restoreBtn} onPress={() => router.push("/transaction-data-management" as any)}><Text style={styles.restoreText}>Error ဖြစ်ပါက Transaction Restore Tools ကိုဖွင့်ရန်</Text></Pressable>}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.meta}>Claim မရှိသေးပါ</Text></View>}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {(standardAmountRules || []).map((r: StandardAmountRule) => <View key={r.key} style={styles.card}><Text style={styles.title}>{r.label}</Text><Text style={styles.meta}>{Number(r.amount || 0).toLocaleString()} KS • {r.enabled ? "Auto" : "Manual"}</Text></View>)}
          <Text style={styles.sectionTitle}>Change Requests</Text>
          {visibleAmountRequests.map((r: StandardAmountChangeRequest) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.title}>{r.ruleLabel}</Text>
                <View style={[styles.statusChip, { backgroundColor: statusColor(r.status) + "20" }]}><Text style={[styles.statusText, { color: statusColor(r.status) }]}>{statusLabel(r.status)}</Text></View>
              </View>
              <Text style={styles.meta}>{Number(r.previousAmount || 0).toLocaleString()} → {Number(r.requestedAmount || 0).toLocaleString()} KS</Text>
              <Text style={styles.meta}>{r.reason}</Text>
              {canApprove && r.status === "pending_approval" ? (
                <View style={styles.actions}>
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#10B981" }]} onPress={() => { setRuleReviewReq(r); setRuleReviewMode("approve"); setRuleReviewNote(""); setShowRuleReviewModal(true); }}><Text style={styles.actionText}>Approve</Text></Pressable>
                  <Pressable style={[styles.actionBtn, { backgroundColor: "#EF4444" }]} onPress={() => { setRuleReviewReq(r); setRuleReviewMode("reject"); setRuleReviewNote(""); setShowRuleReviewModal(true); }}><Text style={styles.actionText}>Reject</Text></Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={showClaimModal} transparent animationType="slide" onRequestClose={() => setShowClaimModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalWrap}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
          <View style={[styles.modalBox, Platform.OS === "android" ? { marginBottom: keyboardInset } : null]}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + (Platform.OS === "android" ? keyboardInset : 0) + 24 }}
            >
          <Text style={styles.modalTitle}>ငွေတောင်းခံလွှာ</Text>
          <Text style={styles.label}>Claim Date / Time</Text>
          <View style={styles.dateTimeRow}>
            {Platform.OS === "web" ? (
              <View style={styles.webDateInputWrap}>
                {React.createElement("input", {
                  type: "date",
                  value: claimDate,
                  onChange: (e: any) => e.target.value && setClaimDate(e.target.value),
                  style: {
                    border: "none",
                    outline: "none",
                    backgroundColor: "transparent",
                    color: Colors.light.text,
                    fontSize: 13,
                    fontFamily: "inherit",
                    width: 130,
                  },
                })}
              </View>
            ) : (
              <TextInput style={[styles.input, styles.halfInput]} value={claimDate} onChangeText={setClaimDate} />
            )}
            <TextInput style={[styles.input, styles.halfInput]} value={claimTime} onChangeText={setClaimTime} placeholder="HH:mm" maxLength={5} />
          </View>

          <Text style={styles.label}>Category (Dropdown)</Text>
          <Pressable style={styles.inputLike} onPress={() => openPicker("category")}><Text style={styles.inputLikeText}>{categoryLabel}</Text><Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} /></Pressable>

          {categoryId === "funeral_support" ? (
            <>
              <Text style={styles.label}>နာရေးကူညီငွေအမျိုးအစား</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>{FUNERAL_SUBTYPES.map((x) => <Pressable key={x.id} style={[styles.chip, funeralSubtype === x.id && styles.chipActive]} onPress={() => setFuneralSubtype(x.id)}><Text style={[styles.chipText, funeralSubtype === x.id && styles.chipTextActive]}>{x.label}</Text></Pressable>)}</ScrollView>
            </>
          ) : null}

          <Text style={styles.label}>Claimant Type (Dropdown)</Text>
          <Pressable style={styles.inputLike} onPress={() => openPicker("claimantType")}><Text style={styles.inputLikeText}>{CLAIMANT_OPTIONS.find((x) => x.id === claimantType)?.label || claimantType}</Text><Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} /></Pressable>

          {claimantType === "BEHALF_MEMBER" ? (
            <>
              <Text style={styles.label}>Member (Dropdown)</Text>
              <Pressable style={styles.inputLike} onPress={() => openPicker("member")}><Text style={styles.inputLikeText}>{selectedMember ? `${selectedMember.name || "-"} (${selectedMember.id || "-"})` : "ရွေးချယ်ပါ"}</Text><Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} /></Pressable>
            </>
          ) : null}

          {claimantType === "BEHALF_FAMILY" ? (
            <>
              <Text style={styles.label}>မည်သူ၏ မိသားစုဝင် (Member Dropdown)</Text>
              <Pressable style={styles.inputLike} onPress={() => openPicker("familyOwner")}><Text style={styles.inputLikeText}>{familyOwner ? `${familyOwner.name || "-"} (${familyOwner.id || "-"})` : "ရွေးချယ်ပါ"}</Text><Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} /></Pressable>
              <Text style={styles.label}>တော်စပ်ပုံ (Dropdown)</Text>
              <Pressable style={styles.inputLike} onPress={() => openPicker("relation")}><Text style={styles.inputLikeText}>{familyRelation || "ရွေးချယ်ပါ"}</Text><Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} /></Pressable>
              <Text style={styles.label}>နာမည်အပြည့်အစုံ</Text><TextInput style={styles.input} value={familyClaimantName} onChangeText={setFamilyClaimantName} placeholder="မိသားစုဝင်အမည်" />
              <Text style={styles.label}>နိုင်ငံသားစီစစ်ရေးအမှတ်</Text><TextInput style={styles.input} value={manualNrc} onChangeText={setManualNrc} />
              <Text style={styles.label}>ဖုန်းနံပါတ်</Text><TextInput style={styles.input} value={manualPhone} onChangeText={setManualPhone} />
              <Text style={styles.label}>နေရပ်လိပ်စာ</Text><TextInput style={styles.input} value={manualAddress} onChangeText={setManualAddress} />
            </>
          ) : null}

          {claimantType === "OTHER" ? (
            <>
              <Text style={styles.label}>သက်ဆိုင်ပုံ</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable style={[styles.chip, otherRelatedScope === "org" && styles.chipActive]} onPress={() => setOtherRelatedScope("org")}><Text style={[styles.chipText, otherRelatedScope === "org" && styles.chipTextActive]}>အသင်းတစ်ခုလုံး</Text></Pressable>
                <Pressable style={[styles.chip, otherRelatedScope === "member" && styles.chipActive]} onPress={() => setOtherRelatedScope("member")}><Text style={[styles.chipText, otherRelatedScope === "member" && styles.chipTextActive]}>အသင်းဝင်တစ်ဦး</Text></Pressable>
              </View>
              {otherRelatedScope === "member" ? (
                <>
                  <Text style={styles.label}>သက်ဆိုင် Member (Dropdown)</Text>
                  <Pressable style={styles.inputLike} onPress={() => openPicker("otherMember")}><Text style={styles.inputLikeText}>{otherRelatedMember ? `${otherRelatedMember.name || "-"} (${otherRelatedMember.id || "-"})` : "ရွေးချယ်ပါ"}</Text><Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} /></Pressable>
                </>
              ) : null}
              <Text style={styles.label}>ဆက်စပ်ပတ်သက်မှု ရှင်းလင်းချက်</Text><TextInput style={[styles.input, { minHeight: 70 }]} multiline value={otherRelationDescription} onChangeText={setOtherRelationDescription} />
              <Text style={styles.label}>နာမည်အပြည့်အစုံ</Text><TextInput style={styles.input} value={manualName} onChangeText={setManualName} />
              <Text style={styles.label}>နိုင်ငံသားစီစစ်ရေးအမှတ်</Text><TextInput style={styles.input} value={manualNrc} onChangeText={setManualNrc} />
              <Text style={styles.label}>ဖုန်းနံပါတ်</Text><TextInput style={styles.input} value={manualPhone} onChangeText={setManualPhone} />
              <Text style={styles.label}>နေရပ်လိပ်စာ</Text><TextInput style={styles.input} value={manualAddress} onChangeText={setManualAddress} />
            </>
          ) : null}

          {(claimantType === "SELF" || claimantType === "BEHALF_MEMBER") ? (
            <>
              <Text style={styles.label}>သက်ဆိုင်သူ (အမည် နှင့် ID)</Text><Text style={styles.readOnlyBox}>{claimSubject.name || "-"} ({claimSubject.memberId || "-"})</Text>
              <Text style={styles.label}>နာမည်အပြည့်အစုံ</Text><Text style={styles.readOnlyBox}>{claimSubject.name || "-"}</Text>
              <Text style={styles.label}>နိုင်ငံသားစီစစ်ရေးအမှတ်</Text><Text style={styles.readOnlyBox}>{claimSubject.nrc || "-"}</Text>
              <Text style={styles.label}>ဖုန်းနံပါတ်</Text><Text style={styles.readOnlyBox}>{claimSubject.phone || "-"}</Text>
              <Text style={styles.label}>နေရပ်လိပ်စာ</Text><Text style={styles.readOnlyBox}>{claimSubject.address || "-"}</Text>
            </>
          ) : (
            <>
              <Text style={styles.label}>သက်ဆိုင်သူ (အမည် နှင့် ID)</Text>
              <Text style={styles.readOnlyBox}>{claimantType === "BEHALF_FAMILY" ? `${familyOwner?.name || "-"} (${familyOwner?.id || "-"})` : otherRelatedScope === "member" ? `${otherRelatedMember?.name || "-"} (${otherRelatedMember?.id || "-"})` : "အသင်းတစ်ခုလုံး"}</Text>
            </>
          )}

          {eventRequiredForCategory(categoryId) ? (
            <>
              <Text style={styles.label}>ဆက်စပ် Event (Dropdown)</Text>
              <TouchableOpacity activeOpacity={0.75} hitSlop={10} style={styles.inputLike} onPress={openEventPicker}>
                <Text style={styles.inputLikeText}>
                  {selectedEvent
                    ? `${normalizeText(selectedEvent.topic) || normalizeText(selectedEvent.title)} - ${normalizeText(selectedEvent.summary) || normalizeText(selectedEvent.detail) || "-"}`
                    : "Event ရွေးချယ်ပါ"}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} />
              </TouchableOpacity>
              <Pressable
                style={[styles.actionBtn, { alignSelf: "flex-start", marginTop: 8, backgroundColor: Colors.light.tint }]}
                onPress={() => void navigateToAddEvent()}
              >
                <Text style={styles.actionText}>Event အသစ်ထည့်ရန်</Text>
              </Pressable>
              {eligibleEvents.length === 0 ? <Text style={styles.warningText}>ဤအမျိုးအစားအတွက် Event ထဲတွင် သတင်းပေးပို့ထားသော မှတ်တမ်းမတွေ့ပါ။</Text> : null}
            </>
          ) : null}

          <Text style={styles.label}>ငွေတောင်းခံရသည့် အကြောင်းအရာအကျဉ်း</Text><TextInput style={[styles.input, { minHeight: 80 }]} multiline value={reason} onChangeText={setReason} />
          <Text style={styles.label}>တောင်းခံငွေပမာဏ</Text><TextInput style={styles.input} keyboardType="numeric" value={requestedAmount} onChangeText={setRequestedAmount} />
          {claimRule ? <Text style={styles.meta}>Rule: {claimRule.label} ({claimRule.enabled ? "Auto" : "Manual"}) • {Number(claimRule.amount || 0).toLocaleString()} KS</Text> : null}

          <View style={styles.rowEnd}><Pressable onPress={() => setShowClaimModal(false)}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable style={styles.okBtn} onPress={() => void submitClaim()}><Text style={styles.okTxt}>Submit</Text></Pressable></View>
        </ScrollView></View></KeyboardAvoidingView>
      </Modal>

      <Modal visible={showReviewModal} transparent animationType="fade" onRequestClose={() => setShowReviewModal(false)}>
        <View style={styles.modalWrap}><View style={styles.modalBox}><Text style={styles.modalTitle}>{reviewMode === "approve" ? "Approve" : "Reject"} Claim</Text>{reviewMode === "approve" ? <><Text style={styles.label}>Approved Amount</Text><TextInput style={styles.input} keyboardType="numeric" value={approvedAmount} onChangeText={setApprovedAmount} /></> : null}<Text style={styles.label}>Note</Text><TextInput style={[styles.input, { minHeight: 70 }]} multiline value={reviewNote} onChangeText={setReviewNote} /><View style={styles.rowEnd}><Pressable onPress={() => setShowReviewModal(false)}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable style={styles.okBtn} onPress={() => void submitReview()}><Text style={styles.okTxt}>Confirm</Text></Pressable></View></View></View>
      </Modal>

      <Modal visible={showDisburseModal} transparent animationType="fade" onRequestClose={() => setShowDisburseModal(false)}>
        <View style={styles.modalWrap}><View style={styles.modalBox}><Text style={styles.modalTitle}>Disburse</Text><View style={{ flexDirection: "row", gap: 8 }}><Pressable style={[styles.chip, disbursementMethod === "cash" && styles.chipActive]} onPress={() => setDisbursementMethod("cash")}><Text style={[styles.chipText, disbursementMethod === "cash" && styles.chipTextActive]}>Cash</Text></Pressable><Pressable style={[styles.chip, disbursementMethod === "bank" && styles.chipActive]} onPress={() => setDisbursementMethod("bank")}><Text style={[styles.chipText, disbursementMethod === "bank" && styles.chipTextActive]}>Bank</Text></Pressable></View><Text style={styles.label}>Disburse Date / Time</Text><View style={styles.dateTimeRow}>{Platform.OS === "web" ? (<View style={styles.webDateInputWrap}>{React.createElement("input", { type: "date", value: disbursementDate, onChange: (e: any) => e.target.value && setDisbursementDate(e.target.value), style: { border: "none", outline: "none", backgroundColor: "transparent", color: Colors.light.text, fontSize: 13, fontFamily: "inherit", width: 130 } })}</View>) : (<TextInput style={[styles.input, styles.halfInput]} value={disbursementDate} onChangeText={setDisbursementDate} />)}<TextInput style={[styles.input, styles.halfInput]} value={disbursementTime} onChangeText={setDisbursementTime} placeholder="HH:mm" maxLength={5} /></View><Text style={styles.label}>Voucher Number</Text><TextInput style={styles.input} value={voucherNumber} onChangeText={setVoucherNumber} /><Text style={styles.label}>Note</Text><TextInput style={[styles.input, { minHeight: 70 }]} multiline value={disbursementNote} onChangeText={setDisbursementNote} /><View style={styles.rowEnd}><Pressable onPress={() => setShowDisburseModal(false)}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable style={styles.okBtn} onPress={() => void submitDisburse()}><Text style={styles.okTxt}>Disburse</Text></Pressable></View></View></View>
      </Modal>

      <Modal visible={showAmountReqModal} transparent animationType="fade" onRequestClose={() => setShowAmountReqModal(false)}>
        <View style={styles.modalWrap}><View style={styles.modalBox}><ScrollView><Text style={styles.modalTitle}>Amount Change Request</Text><Text style={styles.label}>Rule (Dropdown)</Text><Pressable style={styles.inputLike} onPress={() => openPicker("rule")}><Text style={styles.inputLikeText}>{selectedRule?.label || "ရွေးချယ်ပါ"}</Text><Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} /></Pressable><Text style={styles.meta}>Current: {Number(selectedRule?.amount || 0).toLocaleString()} KS</Text><Text style={styles.label}>Requested Amount</Text><TextInput style={styles.input} keyboardType="numeric" value={requestedRuleAmount} onChangeText={setRequestedRuleAmount} /><Text style={styles.label}>Reason</Text><TextInput style={[styles.input, { minHeight: 70 }]} multiline value={ruleReason} onChangeText={setRuleReason} /><View style={styles.rowEnd}><Pressable onPress={() => setShowAmountReqModal(false)}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable style={styles.okBtn} onPress={() => void submitAmountRequest()}><Text style={styles.okTxt}>Submit</Text></Pressable></View></ScrollView></View></View>
      </Modal>

      <Modal visible={showRuleReviewModal} transparent animationType="fade" onRequestClose={() => setShowRuleReviewModal(false)}>
        <View style={styles.modalWrap}><View style={styles.modalBox}><Text style={styles.modalTitle}>{ruleReviewMode === "approve" ? "Approve" : "Reject"} Amount Request</Text><Text style={styles.label}>Note</Text><TextInput style={[styles.input, { minHeight: 70 }]} multiline value={ruleReviewNote} onChangeText={setRuleReviewNote} /><View style={styles.rowEnd}><Pressable onPress={() => setShowRuleReviewModal(false)}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable style={styles.okBtn} onPress={() => void submitRuleReview()}><Text style={styles.okTxt}>Confirm</Text></Pressable></View></View></View>
      </Modal>

      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <View style={styles.modalWrap}><View style={styles.pickerBox}><Text style={styles.modalTitle}>{pickerTitle}</Text><ScrollView style={{ maxHeight: 340 }}>{pickerOptions.map((opt: { id: string; label: string }) => { const active = getCurrentPickerSelected() === opt.id; return (<Pressable key={opt.id} style={[styles.pickerRow, active && styles.pickerRowActive]} onPress={() => onSelectPickerOption(opt.id)}><Text style={[styles.pickerText, active && styles.pickerTextActive]}>{opt.label}</Text></Pressable>); })}</ScrollView><View style={styles.rowEnd}><Pressable onPress={() => setShowPicker(false)}><Text style={styles.cancel}>Close</Text></Pressable></View></View></View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.light.border, backgroundColor: "white" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end" },
  createBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 38, borderRadius: 10, backgroundColor: Colors.light.tint },
  createBtnText: { color: "white", fontSize: 13, fontFamily: "Inter_700Bold" },
  headerTitle: { marginTop: 10, fontSize: 16, color: Colors.light.text, fontFamily: "Inter_700Bold" },
  tabs: { flexDirection: "row", gap: 8, padding: 12 },
  tabBtn: { flex: 1, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 999, alignItems: "center", paddingVertical: 8, backgroundColor: "white" },
  tabBtnActive: { borderColor: Colors.light.tint, backgroundColor: Colors.light.tint + "15" },
  tabText: { color: Colors.light.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  tabTextActive: { color: Colors.light.tint },
  list: { padding: 12, paddingBottom: 110, gap: 10 },
  card: { backgroundColor: "white", borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, padding: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardNo: { fontSize: 12, color: Colors.light.textSecondary },
  title: { fontSize: 14, color: Colors.light.text, fontFamily: "Inter_700Bold" },
  meta: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 3, lineHeight: 18 },
  statusChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  actions: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  actionBtn: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  actionText: { color: "white", fontSize: 12, fontFamily: "Inter_700Bold" },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.light.text, marginTop: 6 },
  empty: { alignItems: "center", marginTop: 60 },
  restoreBtn: { marginTop: 8, alignItems: "center", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.light.border, backgroundColor: "white" },
  restoreText: { color: Colors.light.tint, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 12 },
  modalBox: { backgroundColor: "white", borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, padding: 12, maxHeight: "90%" },
  pickerBox: { backgroundColor: "white", borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, padding: 12, maxHeight: "80%" },
  modalTitle: { fontSize: 16, color: Colors.light.text, textAlign: "center", fontFamily: "Inter_700Bold", marginBottom: 6 },
  label: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 8, marginBottom: 4, fontFamily: "Inter_600SemiBold" },
  input: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: "#F8FAFC", color: Colors.light.text },
  dateTimeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  halfInput: { flex: 1 },
  webDateInputWrap: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "#F8FAFC",
  },
  inputLike: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: "#F8FAFC", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  inputLikeText: { color: Colors.light.text, flex: 1, fontSize: 13 },
  readOnlyBox: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: "#E2E8F0", color: Colors.light.text, fontSize: 13 },
  warningText: { color: "#EF4444", fontSize: 12, marginTop: 6, lineHeight: 18 },
  chip: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#F8FAFC", marginRight: 6, marginBottom: 6 },
  chipActive: { borderColor: Colors.light.tint, backgroundColor: Colors.light.tint + "15" },
  chipText: { fontSize: 12, color: Colors.light.textSecondary },
  chipTextActive: { color: Colors.light.tint, fontFamily: "Inter_700Bold" },
  rowEnd: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 },
  cancel: { color: Colors.light.textSecondary, paddingHorizontal: 8, paddingVertical: 8, fontFamily: "Inter_600SemiBold" },
  okBtn: { backgroundColor: Colors.light.tint, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  okTxt: { color: "white", fontFamily: "Inter_700Bold" },
  pickerRow: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  pickerRowActive: { backgroundColor: Colors.light.tint + "15" },
  pickerText: { color: Colors.light.text, fontSize: 13 },
  pickerTextActive: { color: Colors.light.tint, fontFamily: "Inter_700Bold" },
});


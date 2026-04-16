import orgStorage from "../lib/org-storage";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AccessDenied from "../components/AccessDenied";
import Colors from "../constants/colors";
import { useAuth } from "../lib/AuthContext";
import { useData } from "../lib/DataContext";
import { CUSTOM_RELATION_STORAGE_KEY, DEFAULT_RELATION_OPTIONS_WITH_SELF, mergeRelationOptions } from "../lib/relation-options";
import { useKeyboardInset } from "../lib/use-keyboard-inset";

const AsyncStorage = orgStorage;

type EventType = "activity" | "news" | "announcement";

interface OrgEventNotice {
  id: string;
  title: string;
  description: string;
  date: string;
  type: EventType;
  image?: string;
  images?: string[];
  createdByUserId?: string;
  createdByMemberId?: string;
  senderName?: string;
  senderMemberId?: string;
  senderPhone?: string;
  senderDate?: string;
  senderTime?: string;
  summary?: string;
  detail?: string;
  topic?: string;
  subjectMemberName?: string;
  subjectMemberId?: string;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  eventLocationMapUrl?: string;
  healthPatientName?: string;
  healthPatientMemberId?: string;
  healthPatientAge?: string;
  healthRelation?: string;
  healthIllnessSummary?: string;
  healthCondition?: string;
  healthTreatmentType?: "hospital" | "clinic_home";
  healthFacilityName?: string;
  healthFacilityLocation?: string;
  healthFacilityMapUrl?: string;
  healthStartDate?: string;
  healthEndDate?: string;
  healthProgressStatus?: "ကုသပြီး" | "ကုသနေဆဲ";
  funeralDeceasedName?: string;
  funeralAge?: string;
  funeralDeceasedDate?: string;
  funeralRelation?: string;
  funeralIllnessSummary?: string;
  funeralBurialDate?: string;
  funeralBurialTime?: string;
  funeralCemetery?: string;
  funeralCemeteryMapUrl?: string;
  funeralTransportLocation?: string;
  funeralTransportMapUrl?: string;
  funeralTransportDate?: string;
  funeralTransportTime?: string;
  funeralMemorialLocation?: string;
  funeralMemorialMapUrl?: string;
  funeralMemorialDate?: string;
  funeralMemorialTime?: string;
  readBy?: Record<string, { userId: string; memberId?: string; displayName?: string; readAt: string }>;
  reactions?: Record<string, "like" | "love" | "sad">;
  comments?: {
    id: string;
    userId: string;
    memberId?: string;
    displayName?: string;
    message: string;
    createdAt: string;
  }[];
}

const CUSTOM_TOPIC_KEY = "@org_notice_custom_topics";
const CUSTOM_CONDITION_KEY = "@org_notice_custom_conditions";
const PRESET_TOPICS = [
  "အလှူပွဲတက်ရောက်ရန်ဖိတ်ကြားခြင်း",
  "မင်္ဂလာပွဲတက်ရောက်ရန်ဖိတ်ကြားခြင်း",
  "ကျန်းမာရေးအခြေအနေအကြောင်းကြားခြင်း",
  "နာရေး အကြောင်းကြားခြင်း",
  "ပညာရေးဆိုင်ရာသတင်းပေးပို့ခြင်း",
  "အခြားကိစ္စ",
] as const;
const PRESET_RELATIONS = DEFAULT_RELATION_OPTIONS_WITH_SELF;
const PRESET_HEALTH_CONDITIONS = ["အသဲအသန်", "ခွဲစိတ်ကုသ", "ထိခိုက်ဒဏ်ရာရ", "ဖျားနာ"] as const;

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatHm(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function parseFlexibleDate(input?: string): Date | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const parsed = new Date(year, month - 1, day);
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    ) return null;
    return parsed;
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function calculateAgeFromDob(dob?: string, onDate?: string): string {
  if (!dob) return "";
  const birth = parseFlexibleDate(dob);
  if (!birth) return "";
  const ref = onDate ? parseFlexibleDate(onDate) : new Date();
  if (!ref) return "";
  let age = ref.getFullYear() - birth.getFullYear();
  const monthDelta = ref.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && ref.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? String(age) : "";
}

function getTopicColor(topic?: string): string {
  if (!topic) return "#6B7280";
  if (topic.includes("အလှူ")) return "#3B82F6";
  if (topic.includes("မင်္ဂလာ")) return "#EC4899";
  if (topic.includes("ကျန်းမာရေး")) return "#10B981";
  if (topic.includes("နာရေး")) return "#EF4444";
  if (topic.includes("အခြား")) return "#F59E0B";
  return "#0EA5A4";
}

function countReactions(reactions?: Record<string, "like" | "love" | "sad">): { like: number; love: number; sad: number } {
  const result = { like: 0, love: 0, sad: 0 };
  if (!reactions) return result;
  Object.values(reactions).forEach((r) => {
    if (r === "like") result.like += 1;
    if (r === "love") result.love += 1;
    if (r === "sad") result.sad += 1;
  });
  return result;
}

function mapClaimCategoryToTopic(categoryId?: string): string {
  const id = String(categoryId || "");
  if (id === "health_support") return "ကျန်းမာရေးအခြေအနေအကြောင်းကြားခြင်း";
  if (id === "funeral_support") return "နာရေး အကြောင်းကြားခြင်း";
  if (id === "education_support") return "ပညာရေးဆိုင်ရာသတင်းပေးပို့ခြင်း";
  return "";
}

export default function EventsScreen() {
  const params = useLocalSearchParams<{ source?: string; claimCategory?: string; openCreate?: string }>();
  const insets = useSafeAreaInsets();
  const keyboardInset = useKeyboardInset();
  const { events, addEvent, editEvent, removeEvent, members } = useData() as any;
  const safeEvents = Array.isArray(events) ? events : [];
  const safeMembers = Array.isArray(members) ? members : [];
  const { can, currentUser } = useAuth();
  const canViewEvents = can("events.view_public");
  const canCreateOwnEvent = can("events.create_own");
  const canCreateAllEvent = can("events.create_all");
  const canEditOwnEvent = can("events.edit_own");
  const canEditAllEvent = can("events.edit_all");
  const canDeleteOwnEvent = can("events.delete_own");
  const canDeleteAllEvent = can("events.delete_all");
  const canCreateEvent = canCreateAllEvent || canCreateOwnEvent;

  const [modalVisible, setModalVisible] = useState(false);
  const [claimPrefillApplied, setClaimPrefillApplied] = useState(false);
  const [quickCreateApplied, setQuickCreateApplied] = useState(false);
  const [topicPickerVisible, setTopicPickerVisible] = useState(false);
  const [relationPickerVisible, setRelationPickerVisible] = useState(false);
  const [conditionPickerVisible, setConditionPickerVisible] = useState(false);
  const [subjectPickerVisible, setSubjectPickerVisible] = useState(false);
  const [senderPickerVisible, setSenderPickerVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [topic, setTopic] = useState<string>(PRESET_TOPICS[0]);
  const [customTopics, setCustomTopics] = useState<string[]>([]);
  const [customRelations, setCustomRelations] = useState<string[]>([]);
  const [customConditions, setCustomConditions] = useState<string[]>([]);
  const [newCustomTopic, setNewCustomTopic] = useState("");
  const [newCustomRelation, setNewCustomRelation] = useState("");
  const [newCustomCondition, setNewCustomCondition] = useState("");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [eventDate, setEventDate] = useState(formatYmd(new Date()));
  const [eventTime, setEventTime] = useState(formatHm(new Date()));
  const [eventLocation, setEventLocation] = useState("");
  const [eventLocationMapUrl, setEventLocationMapUrl] = useState("");
  const [images, setImages] = useState<string[]>([]);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showHealthDatePicker, setShowHealthDatePicker] = useState(false);
  const [healthDateTarget, setHealthDateTarget] = useState<"start" | "end" | null>(null);
  const [showFuneralDatePicker, setShowFuneralDatePicker] = useState(false);
  const [funeralDateTarget, setFuneralDateTarget] = useState<"deceased" | "burial" | "transport" | "memorial" | null>(null);
  const [showFuneralTimePicker, setShowFuneralTimePicker] = useState(false);
  const [funeralTimeTarget, setFuneralTimeTarget] = useState<"burial" | "transport" | "memorial" | null>(null);

  const [healthPatientName, setHealthPatientName] = useState("");
  const [healthPatientMemberId, setHealthPatientMemberId] = useState("");
  const [healthPatientAge, setHealthPatientAge] = useState("");
  const [healthRelation, setHealthRelation] = useState<string>(PRESET_RELATIONS[0]);
  const [healthIllnessSummary, setHealthIllnessSummary] = useState("");
  const [healthCondition, setHealthCondition] = useState<string>(PRESET_HEALTH_CONDITIONS[0]);
  const [healthTreatmentType, setHealthTreatmentType] = useState<"hospital" | "clinic_home">("hospital");
  const [healthFacilityName, setHealthFacilityName] = useState("");
  const [healthFacilityLocation, setHealthFacilityLocation] = useState("");
  const [healthFacilityMapUrl, setHealthFacilityMapUrl] = useState("");
  const [healthStartDate, setHealthStartDate] = useState(formatYmd(new Date()));
  const [healthEndDate, setHealthEndDate] = useState("");
  const [healthProgressStatus, setHealthProgressStatus] = useState<"ကုသပြီး" | "ကုသနေဆဲ">("ကုသနေဆဲ");
  const [funeralDeceasedName, setFuneralDeceasedName] = useState("");
  const [funeralAge, setFuneralAge] = useState("");
  const [funeralDeceasedDate, setFuneralDeceasedDate] = useState(formatYmd(new Date()));
  const [funeralRelation, setFuneralRelation] = useState<string>(PRESET_RELATIONS[0]);
  const [funeralIllnessSummary, setFuneralIllnessSummary] = useState("");
  const [funeralBurialDate, setFuneralBurialDate] = useState(formatYmd(new Date()));
  const [funeralBurialTime, setFuneralBurialTime] = useState(formatHm(new Date()));
  const [funeralCemetery, setFuneralCemetery] = useState("");
  const [funeralCemeteryMapUrl, setFuneralCemeteryMapUrl] = useState("");
  const [funeralTransportLocation, setFuneralTransportLocation] = useState("");
  const [funeralTransportMapUrl, setFuneralTransportMapUrl] = useState("");
  const [funeralTransportDate, setFuneralTransportDate] = useState(formatYmd(new Date()));
  const [funeralTransportTime, setFuneralTransportTime] = useState(formatHm(new Date()));
  const [funeralMemorialLocation, setFuneralMemorialLocation] = useState("");
  const [funeralMemorialMapUrl, setFuneralMemorialMapUrl] = useState("");
  const [funeralMemorialDate, setFuneralMemorialDate] = useState(formatYmd(new Date()));
  const [funeralMemorialTime, setFuneralMemorialTime] = useState(formatHm(new Date()));
  const [selectedSubjectMemberId, setSelectedSubjectMemberId] = useState<string>(currentUser?.memberId || "");
  const [subjectMemberNameInput, setSubjectMemberNameInput] = useState(currentUser?.displayName || "");
  const [subjectMemberIdInput, setSubjectMemberIdInput] = useState(currentUser?.memberId || "");
  const [selectedSenderMemberId, setSelectedSenderMemberId] = useState<string>("");
  const [senderNameInput, setSenderNameInput] = useState(currentUser?.displayName || "");
  const [senderMemberIdInput, setSenderMemberIdInput] = useState(currentUser?.memberId || "");
  const [senderPhoneInput, setSenderPhoneInput] = useState("");

  const allTopics = useMemo(() => [...PRESET_TOPICS, ...customTopics], [customTopics]);
  const allRelations = useMemo(() => mergeRelationOptions(customRelations, true), [customRelations]);
  const allHealthConditions = useMemo(() => [...PRESET_HEALTH_CONDITIONS, ...customConditions], [customConditions]);
  const senderMembers = useMemo(
    () => [...safeMembers].sort((a: any, b: any) => String(a?.name || "").localeCompare(String(b?.name || ""))),
    [safeMembers]
  );
  const currentMemberRecord = useMemo(
    () => senderMembers.find((m: any) => String(m?.id) === String(currentUser?.memberId || "")),
    [senderMembers, currentUser?.memberId]
  );
  const selectedSubjectMember = useMemo(
    () => senderMembers.find((m: any) => String(m?.id) === String(selectedSubjectMemberId)),
    [senderMembers, selectedSubjectMemberId]
  );
  const isHealthNotice = topic.includes("ကျန်းမာရေး");
  const isFuneralNotice = topic.includes("နာရေး");
  const launchedFromClaim = String(params?.source || "") === "expense_claim";
  const launchedFromQuickAction =
    !launchedFromClaim &&
    (String(params?.source || "") === "quick_action" ||
      ["1", "true", "yes", "open"].includes(String(params?.openCreate || "").trim().toLowerCase()));
  const claimPrefillTopic = mapClaimCategoryToTopic(String(params?.claimCategory || ""));

  const resetForm = useCallback(() => {
    setEditingId(null);
    setTopic(PRESET_TOPICS[0]);
    setSummary("");
    setDetail("");
    setEventDate(formatYmd(new Date()));
    setEventTime(formatHm(new Date()));
    setEventLocation("");
    setEventLocationMapUrl("");
    setImages([]);
    setNewCustomTopic("");
    setNewCustomRelation("");
    setNewCustomCondition("");
    setSelectedSubjectMemberId(currentUser?.memberId || "");
    setSubjectMemberNameInput(String(currentMemberRecord?.name || currentUser?.displayName || ""));
    setSubjectMemberIdInput(String(currentMemberRecord?.id || currentUser?.memberId || ""));
    setHealthPatientName("");
    setHealthPatientMemberId("");
    setHealthPatientAge("");
    setHealthRelation(PRESET_RELATIONS[0]);
    setHealthIllnessSummary("");
    setHealthCondition(PRESET_HEALTH_CONDITIONS[0]);
    setHealthTreatmentType("hospital");
    setHealthFacilityName("");
    setHealthFacilityLocation("");
    setHealthFacilityMapUrl("");
    setHealthStartDate(formatYmd(new Date()));
    setHealthEndDate("");
    setHealthProgressStatus("ကုသနေဆဲ");
    setFuneralDeceasedName("");
    setFuneralAge("");
    setFuneralDeceasedDate(formatYmd(new Date()));
    setFuneralRelation(PRESET_RELATIONS[0]);
    setFuneralIllnessSummary("");
    setFuneralBurialDate(formatYmd(new Date()));
    setFuneralBurialTime(formatHm(new Date()));
    setFuneralCemetery("");
    setFuneralCemeteryMapUrl("");
    setFuneralTransportLocation("");
    setFuneralTransportMapUrl("");
    setFuneralTransportDate(formatYmd(new Date()));
    setFuneralTransportTime(formatHm(new Date()));
    setFuneralMemorialLocation("");
    setFuneralMemorialMapUrl("");
    setFuneralMemorialDate(formatYmd(new Date()));
    setFuneralMemorialTime(formatHm(new Date()));
    setSelectedSenderMemberId(currentUser?.memberId || "");
    setSenderNameInput(currentUser?.displayName || "");
    setSenderMemberIdInput(currentUser?.memberId || "");
    setSenderPhoneInput(String(currentMemberRecord?.phone || ""));
  }, [
    currentUser?.memberId,
    currentUser?.displayName,
    currentMemberRecord?.name,
    currentMemberRecord?.id,
    currentMemberRecord?.phone,
  ]);

  useEffect(() => {
    if (!launchedFromClaim || claimPrefillApplied) return;
    if (!canCreateEvent) {
      Alert.alert("ခွင့်မပြုပါ", "သတင်းအသစ်တင်ခွင့် မရှိပါ။");
      setClaimPrefillApplied(true);
      return;
    }
    resetForm();
    if (claimPrefillTopic) setTopic(claimPrefillTopic);
    setModalVisible(true);
    setClaimPrefillApplied(true);
  }, [launchedFromClaim, claimPrefillApplied, canCreateEvent, claimPrefillTopic, resetForm]);

  useEffect(() => {
    if (!launchedFromQuickAction || quickCreateApplied) return;
    if (!canCreateEvent) {
      Alert.alert("ခွင့်မပြုပါ", "သတင်းအသစ်တင်ခွင့် မရှိပါ။");
      setQuickCreateApplied(true);
      return;
    }
    resetForm();
    setModalVisible(true);
    setQuickCreateApplied(true);
  }, [launchedFromQuickAction, quickCreateApplied, canCreateEvent, resetForm]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CUSTOM_TOPIC_KEY);
        if (!mounted || !raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setCustomTopics(parsed.map((x) => String(x)).filter(Boolean));
        }
      } catch {
        // ignore storage parse error
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isHealthNotice || healthRelation !== "ကိုယ်တိုင်") return;
    setHealthPatientName(String(selectedSubjectMember?.name || subjectMemberNameInput || ""));
    setHealthPatientMemberId(String(selectedSubjectMember?.id || subjectMemberIdInput || ""));
    setHealthPatientAge(calculateAgeFromDob(selectedSubjectMember?.dob, healthStartDate));
  }, [
    isHealthNotice,
    healthRelation,
    selectedSubjectMember?.id,
    selectedSubjectMember?.name,
    selectedSubjectMember?.dob,
    subjectMemberNameInput,
    subjectMemberIdInput,
    healthStartDate,
  ]);

  useEffect(() => {
    if (!isFuneralNotice || funeralRelation !== "ကိုယ်တိုင်") return;
    setFuneralDeceasedName(String(selectedSubjectMember?.name || subjectMemberNameInput || ""));
    setFuneralAge(calculateAgeFromDob(selectedSubjectMember?.dob, funeralDeceasedDate));
  }, [
    isFuneralNotice,
    funeralRelation,
    selectedSubjectMember?.name,
    selectedSubjectMember?.dob,
    subjectMemberNameInput,
    funeralDeceasedDate,
  ]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [rawRelations, rawConditions] = await Promise.all([
          AsyncStorage.getItem(CUSTOM_RELATION_STORAGE_KEY),
          AsyncStorage.getItem(CUSTOM_CONDITION_KEY),
        ]);
        if (!mounted) return;
        if (rawRelations) {
          const parsed = JSON.parse(rawRelations);
          if (Array.isArray(parsed)) setCustomRelations(parsed.map((x) => String(x)).filter(Boolean));
        }
        if (rawConditions) {
          const parsed = JSON.parse(rawConditions);
          if (Array.isArray(parsed)) setCustomConditions(parsed.map((x) => String(x)).filter(Boolean));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const isOwnNotice = (item: OrgEventNotice) => {
    if (!currentUser) return false;
    if (item.createdByUserId && item.createdByUserId === currentUser.id) return true;
    if (item.createdByMemberId && currentUser.memberId && item.createdByMemberId === currentUser.memberId) return true;
    return false;
  };

  const canEditItem = (item: OrgEventNotice) => canEditAllEvent || (canEditOwnEvent && isOwnNotice(item));
  const canDeleteItem = (item: OrgEventNotice) => canDeleteAllEvent || (canDeleteOwnEvent && isOwnNotice(item));
  const visibleEvents = useMemo(
    () =>
      [...safeEvents].filter(
        (item: any) => String(item?.location || "").trim().toLowerCase() !== "system"
      ),
    [safeEvents]
  );

  const pickImages = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.5,
        base64: true,
      });
      if (result.canceled) return;
      const next = result.assets
        .map((asset) => (asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri))
        .filter(Boolean);
      if (!next.length) return;
      setImages((prev) => [...prev, ...next].slice(0, 6));
    } catch {
      Alert.alert("အမှား", "ပုံများရွေးမရပါ။");
    }
  };

  const addCustomTopic = async () => {
    const name = newCustomTopic.trim();
    if (!name) return;
    if (allTopics.includes(name)) {
      setTopic(name);
      setNewCustomTopic("");
      return;
    }
    const next = [...customTopics, name];
    setCustomTopics(next);
    await AsyncStorage.setItem(CUSTOM_TOPIC_KEY, JSON.stringify(next));
    setTopic(name);
    setNewCustomTopic("");
  };

  const addCustomRelation = async () => {
    const value = newCustomRelation.trim();
    if (!value) return;
    if (allRelations.includes(value)) {
      if (isFuneralNotice) {
        applyFuneralRelation(value);
      } else {
        applyHealthRelation(value);
      }
      setNewCustomRelation("");
      return;
    }
    const next = [...customRelations, value];
    setCustomRelations(next);
    await AsyncStorage.setItem(CUSTOM_RELATION_STORAGE_KEY, JSON.stringify(next));
    if (isFuneralNotice) {
      applyFuneralRelation(value);
    } else {
      applyHealthRelation(value);
    }
    setNewCustomRelation("");
  };

  const addCustomCondition = async () => {
    const value = newCustomCondition.trim();
    if (!value) return;
    if (allHealthConditions.includes(value)) {
      setHealthCondition(value);
      setNewCustomCondition("");
      return;
    }
    const next = [...customConditions, value];
    setCustomConditions(next);
    await AsyncStorage.setItem(CUSTOM_CONDITION_KEY, JSON.stringify(next));
    setHealthCondition(value);
    setNewCustomCondition("");
  };

  const chooseSubjectMember = (memberId: string) => {
    if (!memberId) {
      setSelectedSubjectMemberId("");
      setSubjectMemberNameInput("");
      setSubjectMemberIdInput("");
      return;
    }
    const selected = senderMembers.find((m: any) => String(m?.id) === String(memberId));
    if (!selected) return;
    setSelectedSubjectMemberId(String(selected.id));
    setSubjectMemberNameInput(String(selected.name || ""));
    setSubjectMemberIdInput(String(selected.id || ""));
    if (healthRelation === "ကိုယ်တိုင်") {
      setHealthPatientName(String(selected.name || ""));
      setHealthPatientMemberId(String(selected.id || ""));
      setHealthPatientAge(calculateAgeFromDob(selected.dob, healthStartDate));
    }
    if (funeralRelation === "ကိုယ်တိုင်") {
      setFuneralDeceasedName(String(selected.name || ""));
      setFuneralAge(calculateAgeFromDob(selected.dob, funeralDeceasedDate));
    }
  };

  const chooseSenderMember = (memberId: string) => {
    if (!memberId) {
      setSelectedSenderMemberId("");
      return;
    }
    const selected = senderMembers.find((m: any) => String(m?.id) === String(memberId));
    if (!selected) return;
    setSelectedSenderMemberId(String(selected.id));
    setSenderNameInput(String(selected.name || ""));
    setSenderMemberIdInput(String(selected.id || ""));
    setSenderPhoneInput(String(selected.phone || ""));
  };

  const onChangeSenderName = (value: string) => {
    setSenderNameInput(value);
    if (selectedSenderMemberId) setSelectedSenderMemberId("");
  };

  const onChangeSenderMemberId = (value: string) => {
    setSenderMemberIdInput(value);
    if (selectedSenderMemberId) setSelectedSenderMemberId("");
  };

  const applyHealthRelation = (relation: string) => {
    setHealthRelation(relation);
    if (relation !== "ကိုယ်တိုင်") {
      setHealthPatientName("");
      setHealthPatientMemberId("");
      setHealthPatientAge("");
      return;
    }
    setHealthPatientName(String(selectedSubjectMember?.name || subjectMemberNameInput || ""));
    setHealthPatientMemberId(String(selectedSubjectMember?.id || subjectMemberIdInput || ""));
    setHealthPatientAge(calculateAgeFromDob(selectedSubjectMember?.dob, healthStartDate));
  };

  const applyFuneralRelation = (relation: string) => {
    setFuneralRelation(relation);
    if (relation !== "ကိုယ်တိုင်") {
      setFuneralDeceasedName("");
      setFuneralAge("");
      return;
    }
    setFuneralDeceasedName(String(selectedSubjectMember?.name || subjectMemberNameInput || ""));
    setFuneralAge(calculateAgeFromDob(selectedSubjectMember?.dob, funeralDeceasedDate));
  };

  const handleEdit = (item: OrgEventNotice) => {
    if (!canEditItem(item)) {
      Alert.alert("ခွင့်မပြုပါ", "ဤသတင်းကို ပြင်ဆင်ခွင့် မရှိပါ။");
      return;
    }
    setEditingId(item.id);
    setTopic(item.topic || item.title || PRESET_TOPICS[0]);
    setSummary(item.summary || item.title || "");
    setDetail(item.detail || item.description || "");
    const savedSubjectId = String(item.subjectMemberId || item.healthPatientMemberId || "");
    const matchedSubjectMember = senderMembers.find((m: any) => String(m?.id) === savedSubjectId);
    setSelectedSubjectMemberId(matchedSubjectMember ? String(matchedSubjectMember.id) : savedSubjectId);
    setSubjectMemberNameInput(item.subjectMemberName || matchedSubjectMember?.name || "");
    setSubjectMemberIdInput(savedSubjectId || "");
    setEventDate(item.eventDate || formatYmd(new Date(item.date || Date.now())));
    setEventTime(item.eventTime || item.senderTime || formatHm(new Date()));
    setEventLocation(item.eventLocation || "");
    setEventLocationMapUrl(item.eventLocationMapUrl || "");
    setHealthPatientName(item.healthPatientName || "");
    setHealthPatientMemberId(item.healthPatientMemberId || "");
    setHealthPatientAge(item.healthPatientAge || "");
    setHealthRelation(item.healthRelation || PRESET_RELATIONS[0]);
    setHealthIllnessSummary(item.healthIllnessSummary || "");
    setHealthCondition(item.healthCondition || PRESET_HEALTH_CONDITIONS[0]);
    setHealthTreatmentType(item.healthTreatmentType || "hospital");
    setHealthFacilityName(item.healthFacilityName || "");
    setHealthFacilityLocation(item.healthFacilityLocation || "");
    setHealthFacilityMapUrl(item.healthFacilityMapUrl || "");
    setHealthStartDate(item.healthStartDate || formatYmd(new Date(item.date || Date.now())));
    setHealthEndDate(item.healthEndDate || "");
    setHealthProgressStatus(item.healthProgressStatus || "ကုသနေဆဲ");
    setFuneralDeceasedName(item.funeralDeceasedName || "");
    setFuneralAge(item.funeralAge || "");
    setFuneralDeceasedDate(item.funeralDeceasedDate || formatYmd(new Date(item.date || Date.now())));
    setFuneralRelation(item.funeralRelation || PRESET_RELATIONS[0]);
    setFuneralIllnessSummary(item.funeralIllnessSummary || "");
    setFuneralBurialDate(item.funeralBurialDate || formatYmd(new Date(item.date || Date.now())));
    setFuneralBurialTime(item.funeralBurialTime || formatHm(new Date(item.date || Date.now())));
    setFuneralCemetery(item.funeralCemetery || "");
    setFuneralCemeteryMapUrl(item.funeralCemeteryMapUrl || "");
    setFuneralTransportLocation(item.funeralTransportLocation || "");
    setFuneralTransportMapUrl(item.funeralTransportMapUrl || "");
    setFuneralTransportDate(item.funeralTransportDate || formatYmd(new Date(item.date || Date.now())));
    setFuneralTransportTime(item.funeralTransportTime || formatHm(new Date(item.date || Date.now())));
    setFuneralMemorialLocation(item.funeralMemorialLocation || "");
    setFuneralMemorialMapUrl(item.funeralMemorialMapUrl || "");
    setFuneralMemorialDate(item.funeralMemorialDate || formatYmd(new Date(item.date || Date.now())));
    setFuneralMemorialTime(item.funeralMemorialTime || formatHm(new Date(item.date || Date.now())));
    const matchedSenderMember = senderMembers.find((m: any) => String(m?.id) === String(item.senderMemberId || ""));
    setSelectedSenderMemberId(matchedSenderMember ? String(matchedSenderMember.id) : "");
    setSenderNameInput(item.senderName || "");
    setSenderMemberIdInput(item.senderMemberId || "");
    setSenderPhoneInput(item.senderPhone || String(matchedSenderMember?.phone || ""));
    setImages(item.images && item.images.length ? item.images : item.image ? [item.image] : []);
    setModalVisible(true);
  };

  const saveNotice = async () => {
    if (!summary.trim() || !detail.trim()) {
      Alert.alert("လိုအပ်ချက်", "အကြောင်းအရာအကျဉ်းချုပ် နှင့် အကြောင်းအရာအပြည့်အစုံ ဖြည့်ပါ။");
      return;
    }
    if (!topic.trim()) {
      Alert.alert("လိုအပ်ချက်", "သတင်းခေါင်းစဉ် ရွေးချယ်ပါ။");
      return;
    }
    if (!subjectMemberNameInput.trim() || !subjectMemberIdInput.trim()) {
      Alert.alert("လိုအပ်ချက်", "သက်ဆိုင်သည့် အသင်းဝင်အမည် နှင့် အသင်းဝင်အမှတ် ရွေးချယ်ပါ။");
      return;
    }
    if (!senderNameInput.trim()) {
      Alert.alert("လိုအပ်ချက်", "ပေးပို့သူအမည် ဖြည့်ပါ။");
      return;
    }
    const isInvite = topic.includes("ဖိတ်ကြား");
    if (isInvite && (!eventDate.trim() || !eventTime.trim() || !eventLocation.trim())) {
      Alert.alert("လိုအပ်ချက်", "ဖိတ်ကြားသတင်းအတွက် နေ့ရက်၊ အချိန်၊ နေရာ ထည့်ပါ။");
      return;
    }
    if (isHealthNotice) {
      if (!healthPatientName.trim()) {
        Alert.alert("လိုအပ်ချက်", "နာမကျန်းဖြစ်သူအမည် ဖြည့်ပါ။");
        return;
      }
      if (!healthRelation.trim()) {
        Alert.alert("လိုအပ်ချက်", "တော်စပ်ပုံ ရွေးချယ်ပါ။");
        return;
      }
      if (!healthIllnessSummary.trim()) {
        Alert.alert("လိုအပ်ချက်", "ရောဂါအမျိုးဖြစ်စဉ်အကျဉ်း ဖြည့်ပါ။");
        return;
      }
      if (!healthCondition.trim()) {
        Alert.alert("လိုအပ်ချက်", "ရောဂါအခြေအနေ ရွေးချယ်ပါ။");
        return;
      }
      if (!healthFacilityName.trim() || !healthFacilityLocation.trim() || !healthStartDate.trim()) {
        Alert.alert("လိုအပ်ချက်", "ကုသမှုအခြေအနေအတွက် ဆေးရုံ/ဆေးခန်း အချက်အလက်များဖြည့်ပါ။");
        return;
      }
      if (healthProgressStatus === "ကုသပြီး" && !healthEndDate.trim()) {
        Alert.alert("လိုအပ်ချက်", "ကုသပြီး ဖြစ်ပါက ပြီးဆုံးသည့်နေ့ ဖြည့်ပါ။");
        return;
      }
    }
    if (isFuneralNotice) {
      if (!funeralDeceasedName.trim()) {
        Alert.alert("လိုအပ်ချက်", "ကွယ်လွန်သူအမည် ဖြည့်ပါ။");
        return;
      }
      if (!funeralAge.trim()) {
        Alert.alert("လိုအပ်ချက်", "အသက် ဖြည့်ပါ။");
        return;
      }
      if (!funeralDeceasedDate.trim()) {
        Alert.alert("လိုအပ်ချက်", "ကွယ်လွန်သည့်နေ့ရက် ဖြည့်ပါ။");
        return;
      }
      if (!funeralRelation.trim()) {
        Alert.alert("လိုအပ်ချက်", "တော်စပ်ပုံ ရွေးချယ်ပါ။");
        return;
      }
      if (!funeralIllnessSummary.trim()) {
        Alert.alert("လိုအပ်ချက်", "ရောဂါအမျိုးအစားဖြစ်စဉ်အကျဉ်း ဖြည့်ပါ။");
        return;
      }
      if (!funeralBurialDate.trim() || !funeralBurialTime.trim() || !funeralCemetery.trim()) {
        Alert.alert("လိုအပ်ချက်", "သင်္ဂြိုလ်မည့် နေ့ရက်၊ အချိန်၊ သုဿာန် ဖြည့်ပါ။");
        return;
      }
      if (!funeralTransportLocation.trim() || !funeralTransportDate.trim() || !funeralTransportTime.trim()) {
        Alert.alert("လိုအပ်ချက်", "ကြို/ပို့ယာဉ်ထွက်ခွာမည့် အချက်အလက်များ ဖြည့်ပါ။");
        return;
      }
      if (!funeralMemorialLocation.trim() || !funeralMemorialDate.trim() || !funeralMemorialTime.trim()) {
        Alert.alert("လိုအပ်ချက်", "ရက်လည်ကျင်းပမည့် အချက်အလက်များ ဖြည့်ပါ။");
        return;
      }
    }

    const now = new Date();
    const payload: OrgEventNotice = {
      id: editingId || Date.now().toString(),
      title: topic.trim(),
      description: detail.trim(),
      date: now.toISOString(),
      type: "announcement",
      image: images[0],
      images,
      topic: topic.trim(),
      subjectMemberName: subjectMemberNameInput.trim(),
      subjectMemberId: subjectMemberIdInput.trim(),
      summary: summary.trim(),
      detail: detail.trim(),
      eventDate: eventDate.trim(),
      eventTime: eventTime.trim(),
      eventLocation: eventLocation.trim(),
      eventLocationMapUrl: eventLocationMapUrl.trim(),
      healthPatientName: healthPatientName.trim(),
      healthPatientMemberId: healthPatientMemberId.trim(),
      healthPatientAge: healthPatientAge.trim(),
      healthRelation: healthRelation.trim(),
      healthIllnessSummary: healthIllnessSummary.trim(),
      healthCondition: healthCondition.trim(),
      healthTreatmentType,
      healthFacilityName: healthFacilityName.trim(),
      healthFacilityLocation: healthFacilityLocation.trim(),
      healthFacilityMapUrl: healthFacilityMapUrl.trim(),
      healthStartDate: healthStartDate.trim(),
      healthEndDate: healthEndDate.trim(),
      healthProgressStatus,
      funeralDeceasedName: funeralDeceasedName.trim(),
      funeralAge: funeralAge.trim(),
      funeralDeceasedDate: funeralDeceasedDate.trim(),
      funeralRelation: funeralRelation.trim(),
      funeralIllnessSummary: funeralIllnessSummary.trim(),
      funeralBurialDate: funeralBurialDate.trim(),
      funeralBurialTime: funeralBurialTime.trim(),
      funeralCemetery: funeralCemetery.trim(),
      funeralCemeteryMapUrl: funeralCemeteryMapUrl.trim(),
      funeralTransportLocation: funeralTransportLocation.trim(),
      funeralTransportMapUrl: funeralTransportMapUrl.trim(),
      funeralTransportDate: funeralTransportDate.trim(),
      funeralTransportTime: funeralTransportTime.trim(),
      funeralMemorialLocation: funeralMemorialLocation.trim(),
      funeralMemorialMapUrl: funeralMemorialMapUrl.trim(),
      funeralMemorialDate: funeralMemorialDate.trim(),
      funeralMemorialTime: funeralMemorialTime.trim(),
      senderName: senderNameInput.trim(),
      senderMemberId: senderMemberIdInput.trim(),
      senderPhone: senderPhoneInput.trim(),
      senderDate: formatYmd(now),
      senderTime: formatHm(now),
      createdByUserId: currentUser?.id,
      createdByMemberId: currentUser?.memberId,
      readBy: editingId
        ? undefined
        : (currentUser?.id
            ? {
                [currentUser.id]: {
                  userId: currentUser.id,
                  memberId: currentUser.memberId,
                  displayName: currentUser.displayName,
                  readAt: now.toISOString(),
                },
              }
            : {}),
      reactions: editingId ? undefined : {},
      comments: editingId ? undefined : [],
    };

    if (editingId) {
      const existing = safeEvents.find((e: any) => e.id === editingId) as OrgEventNotice | undefined;
      if (!existing) {
        Alert.alert("အမှား", "သတင်းမတွေ့ပါ။");
        return;
      }
      if (!canEditItem(existing)) {
        Alert.alert("ခွင့်မပြုပါ", "ပြင်ဆင်ခွင့် မရှိပါ။");
        return;
      }
      await editEvent(editingId, {
        ...existing,
        ...payload,
        readBy: existing.readBy || {},
        reactions: existing.reactions || {},
        comments: existing.comments || [],
      });
    } else {
      if (!canCreateEvent) {
        Alert.alert("ခွင့်မပြုပါ", "သတင်းအသစ်တင်ခွင့် မရှိပါ။");
        return;
      }
      await addEvent(payload);
    }

    setModalVisible(false);
    resetForm();
    if (launchedFromClaim && !editingId) {
      router.replace("/expense-claims" as any);
    }
  };

  const handleDelete = async (id: string) => {
    const existing = safeEvents.find((e: any) => e.id === id) as OrgEventNotice | undefined;
    if (!existing || !canDeleteItem(existing)) {
      Alert.alert("ခွင့်မပြုပါ", "ဖျက်ခွင့် မရှိပါ။");
      return;
    }
    Alert.alert("ဖျက်ရန်", "ဤသတင်းကို ဖျက်မည်လား?", [
      { text: "မဖျက်တော့ပါ", style: "cancel" },
      { text: "ဖျက်မည်", style: "destructive", onPress: () => removeEvent(id) },
    ]);
  };

  const onShare = async (item: OrgEventNotice) => {
    try {
      await Share.share({
        title: item.topic || item.title,
        message: `${item.topic || item.title}\n\n${item.summary || ""}\n\n${item.detail || item.description || ""}\n\nပေးပို့သူ: ${
          item.senderName || "-"
        } (${item.senderMemberId || "-"})\nဖုန်း: ${item.senderPhone || "-"}`,
      });
    } catch {
      Alert.alert("အမှား", "မျှဝေမရပါ။");
    }
  };

  if (!canViewEvents) {
    return <AccessDenied showBack={false} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingVertical: 10 }]}>
        <Text style={styles.headerTitle}>အသင်းသို့သတင်းပို့</Text>
        {canCreateEvent ? (
          <Pressable onPress={() => { resetForm(); setModalVisible(true); }} style={styles.headerActionBtn}>
            <Ionicons name="add-circle" size={20} color={Colors.light.tint} />
            <Text style={styles.headerActionText}>အသစ်ထည့်ရန်</Text>
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <FlatList
        data={visibleEvents}
        keyExtractor={(item: any) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }: { item: OrgEventNotice }) => {
          const topicColor = getTopicColor(item.topic || item.title);
          const primaryImage = item.images?.[0] || item.image;
          const reactionCounts = countReactions(item.reactions);
          const readCount = Object.keys(item.readBy || {}).length;
          const commentCount = (item.comments || []).length;
          return (
            <Pressable style={styles.card} onPress={() => router.push({ pathname: "/event-detail", params: { id: item.id } } as any)}>
              {primaryImage ? <Image source={{ uri: primaryImage }} style={styles.cardImage} resizeMode="cover" /> : null}
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <View style={[styles.badge, { backgroundColor: `${topicColor}20` }]}>
                    <Text style={[styles.badgeText, { color: topicColor }]} numberOfLines={1}>
                      {item.topic || item.title}
                    </Text>
                  </View>
                  <Text style={styles.date}>
                    {item.senderDate || new Date(item.date).toLocaleDateString()} {item.senderTime || ""}
                  </Text>
                </View>
                <Text style={styles.title} numberOfLines={2}>{item.summary || item.title}</Text>
                <Text style={styles.desc} numberOfLines={3}>{item.detail || item.description}</Text>
                <Text style={styles.metaLine}>
                  ပေးပို့သူ: {item.senderName || "-"} ({item.senderMemberId || "-"})
                </Text>
                <Text style={styles.metaLine}>
                  ဆက်သွယ်ရန်: {item.senderPhone || "-"}
                </Text>
                <Text style={styles.metaLine}>
                  ဖတ်ရှု့ပြီး: {readCount} | 💬 {commentCount} | 👍 {reactionCounts.like} ❤️ {reactionCounts.love} 😢 {reactionCounts.sad}
                </Text>
              </View>
              <View style={styles.actionRow}>
                <Pressable style={styles.iconBtn} onPress={(e) => { e.stopPropagation(); void onShare(item); }}>
                  <Ionicons name="share-social-outline" size={19} color={Colors.light.text} />
                </Pressable>
                {canEditItem(item) && (
                  <Pressable style={styles.iconBtn} onPress={(e) => { e.stopPropagation(); handleEdit(item); }}>
                    <Ionicons name="create-outline" size={19} color={Colors.light.tint} />
                  </Pressable>
                )}
                {canDeleteItem(item) && (
                  <Pressable style={styles.iconBtn} onPress={(e) => { e.stopPropagation(); void handleDelete(item.id); }}>
                    <Ionicons name="trash-outline" size={19} color="#EF4444" />
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="notifications-outline" size={48} color={Colors.light.textSecondary} />
            <Text style={styles.emptyText}>သတင်းမရှိသေးပါ</Text>
          </View>
        }
      />

      <Modal animationType="slide" transparent visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
          <ScrollView
            style={[styles.modalContent, Platform.OS === "android" ? { marginBottom: keyboardInset } : null]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{
              paddingBottom: 20 + insets.bottom + (Platform.OS === "android" ? keyboardInset : 0),
            }}
          >
            <Text style={styles.modalTitle}>{editingId ? "သတင်းပြင်ဆင်ရန်" : "သတင်းအသစ်ပို့ရန်"}</Text>

            <Text style={styles.label}>သတင်းခေါင်းစဉ် (Dropdown)</Text>
            <Pressable style={styles.inputLike} onPress={() => setTopicPickerVisible(true)}>
              <Text style={{ color: Colors.light.text }}>{topic || "ခေါင်းစဉ်ရွေးပါ"}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} />
            </Pressable>

            <Text style={styles.label}>သက်ဆိုင်သည့် အသင်းဝင် (Dropdown)</Text>
            <Pressable style={styles.inputLike} onPress={() => setSubjectPickerVisible(true)}>
              <Text style={{ color: Colors.light.text }}>
                {selectedSubjectMemberId
                  ? `${subjectMemberNameInput || "-"} (${subjectMemberIdInput || "-"})`
                  : "အသင်းဝင်ရွေးချယ်ပါ"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} />
            </Pressable>
            <Text style={styles.label}>သက်ဆိုင်သည့် အသင်းဝင်အမည်</Text>
            <View style={styles.inputLike}>
              <Text style={{ color: Colors.light.text }}>{subjectMemberNameInput || "-"}</Text>
            </View>
            <Text style={styles.label}>သက်ဆိုင်သည့် အသင်းဝင်အမှတ်</Text>
            <View style={styles.inputLike}>
              <Text style={{ color: Colors.light.text }}>{subjectMemberIdInput || "-"}</Text>
            </View>

            {(topic.includes("ဖိတ်ကြား")) && (
              <>
                <Text style={styles.label}>ကျင်းပမည့်နေ့ရက် (Date)</Text>
                {Platform.OS === "web" ? (
                  <View style={styles.inputLike}>
                    {React.createElement("input", {
                      type: "date",
                      value: eventDate,
                      onChange: (e: any) => setEventDate(String(e?.target?.value || "")),
                      style: { border: "none", outline: "none", backgroundColor: "transparent", width: "100%", fontSize: 14 },
                    })}
                  </View>
                ) : (
                  <>
                    <Pressable style={styles.inputLike} onPress={() => setShowDatePicker(true)}>
                      <Text>{eventDate || "YYYY-MM-DD"}</Text>
                      <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
                    </Pressable>
                    {showDatePicker && (
                      <DateTimePicker
                        value={new Date()}
                        mode="date"
                        display="default"
                        onChange={(_, selectedDate) => {
                          setShowDatePicker(false);
                          if (selectedDate) setEventDate(formatYmd(selectedDate));
                        }}
                      />
                    )}
                  </>
                )}

                <Text style={styles.label}>ကျင်းပမည့်အချိန် (Time)</Text>
                {Platform.OS === "web" ? (
                  <View style={styles.inputLike}>
                    {React.createElement("input", {
                      type: "time",
                      value: eventTime,
                      onChange: (e: any) => setEventTime(String(e?.target?.value || "")),
                      style: { border: "none", outline: "none", backgroundColor: "transparent", width: "100%", fontSize: 14 },
                    })}
                  </View>
                ) : (
                  <>
                    <Pressable style={styles.inputLike} onPress={() => setShowTimePicker(true)}>
                      <Text>{eventTime || "HH:mm"}</Text>
                      <Ionicons name="time-outline" size={16} color={Colors.light.textSecondary} />
                    </Pressable>
                    {showTimePicker && (
                      <DateTimePicker
                        value={new Date()}
                        mode="time"
                        display="default"
                        onChange={(_, selectedDate) => {
                          setShowTimePicker(false);
                          if (selectedDate) setEventTime(formatHm(selectedDate));
                        }}
                      />
                    )}
                  </>
                )}

                <Text style={styles.label}>ကျင်းပမည့်နေရာ</Text>
                <TextInput style={styles.input} value={eventLocation} onChangeText={setEventLocation} placeholder="နေရာထည့်ပါ" />
                <Text style={styles.label}>Google Maps Link (URL)</Text>
                <View style={styles.locationRow}>
                  <TextInput style={[styles.input, styles.locationInput]} value={eventLocationMapUrl} onChangeText={setEventLocationMapUrl} placeholder="https://maps.google.com/..." autoCapitalize="none" />
                  <Pressable
                    style={styles.mapBtn}
                    onPress={() => {
                      const url = eventLocationMapUrl.trim();
                      if (!url) return;
                      void Linking.openURL(url);
                    }}
                  >
                    <Ionicons name="open-outline" size={16} color={Colors.light.tint} />
                  </Pressable>
                </View>
              </>
            )}

            {isHealthNotice && (
              <>
                <Text style={styles.label}>တော်စပ်ပုံ (Dropdown)</Text>
                <Pressable style={styles.inputLike} onPress={() => setRelationPickerVisible(true)}>
                  <Text style={{ color: Colors.light.text }}>{healthRelation || "တော်စပ်ပုံရွေးပါ"}</Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} />
                </Pressable>

                <Text style={styles.label}>နာမကျန်းဖြစ်သူအမည်</Text>
                <TextInput
                  style={styles.input}
                  value={healthPatientName}
                  onChangeText={setHealthPatientName}
                  editable={healthRelation !== "ကိုယ်တိုင်"}
                  placeholder={healthRelation === "ကိုယ်တိုင်" ? "Auto ဖြည့်သွားမည်" : "အမည်"}
                />

                <Text style={styles.label}>အသင်းဝင်အမှတ်</Text>
                <TextInput
                  style={styles.input}
                  value={healthPatientMemberId}
                  onChangeText={setHealthPatientMemberId}
                  editable={healthRelation !== "ကိုယ်တိုင်"}
                  placeholder={healthRelation === "ကိုယ်တိုင်" ? "Auto ဖြည့်သွားမည်" : "အသင်းဝင် ID"}
                />

                <Text style={styles.label}>အသက်</Text>
                <TextInput
                  style={styles.input}
                  value={healthPatientAge}
                  onChangeText={setHealthPatientAge}
                  editable={healthRelation !== "ကိုယ်တိုင်"}
                  placeholder={healthRelation === "ကိုယ်တိုင်" ? "Auto ဖြည့်သွားမည်" : "အသက်"}
                  keyboardType="numeric"
                />

                <Text style={styles.label}>ရောဂါအမျိုးဖြစ်စဉ်အကျဉ်း</Text>
                <TextInput
                  style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
                  value={healthIllnessSummary}
                  onChangeText={setHealthIllnessSummary}
                  multiline
                  placeholder="ဖြစ်စဉ်အကျဉ်း"
                />

                <Text style={styles.label}>ရောဂါအခြေအနေ (Dropdown)</Text>
                <Pressable style={styles.inputLike} onPress={() => setConditionPickerVisible(true)}>
                  <Text style={{ color: Colors.light.text }}>{healthCondition || "ရောဂါအခြေအနေရွေးပါ"}</Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} />
                </Pressable>

                <Text style={styles.label}>ကုသမှုအခြေအနေ</Text>
                <View style={styles.typeRow}>
                  <Pressable
                    style={[styles.typeChip, healthTreatmentType === "hospital" && styles.typeChipActive]}
                    onPress={() => setHealthTreatmentType("hospital")}
                  >
                    <Text style={[styles.typeText, healthTreatmentType === "hospital" && styles.typeTextActive]}>ဆေးရုံတက်ရောက်</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.typeChip, healthTreatmentType === "clinic_home" && styles.typeChipActive]}
                    onPress={() => setHealthTreatmentType("clinic_home")}
                  >
                    <Text style={[styles.typeText, healthTreatmentType === "clinic_home" && styles.typeTextActive]}>ဆေးခန်း/အိမ်တွင်ကုသ</Text>
                  </Pressable>
                </View>

                <Text style={styles.label}>{healthTreatmentType === "hospital" ? "ဆေးရုံအမည်" : "ဆေးခန်းအမည်"}</Text>
                <TextInput style={styles.input} value={healthFacilityName} onChangeText={setHealthFacilityName} placeholder="အမည်" />

                <Text style={styles.label}>တည်နေရာ</Text>
                <TextInput style={styles.input} value={healthFacilityLocation} onChangeText={setHealthFacilityLocation} placeholder="တည်နေရာ" />
                <Text style={styles.label}>Google Maps Link (URL)</Text>
                <View style={styles.locationRow}>
                  <TextInput style={[styles.input, styles.locationInput]} value={healthFacilityMapUrl} onChangeText={setHealthFacilityMapUrl} placeholder="https://maps.google.com/..." autoCapitalize="none" />
                  <Pressable
                    style={styles.mapBtn}
                    onPress={() => {
                      const url = healthFacilityMapUrl.trim();
                      if (!url) return;
                      void Linking.openURL(url);
                    }}
                  >
                    <Ionicons name="open-outline" size={16} color={Colors.light.tint} />
                  </Pressable>
                </View>

                <Text style={styles.label}>{healthTreatmentType === "hospital" ? "စတင်တက်ရောက်သည့်နေ့" : "စတင်ကုသသည့်နေ့"}</Text>
                {Platform.OS === "web" ? (
                  <View style={styles.inputLike}>
                    {React.createElement("input", {
                      type: "date",
                      value: healthStartDate,
                      onChange: (e: any) => setHealthStartDate(String(e?.target?.value || "")),
                      style: { border: "none", outline: "none", backgroundColor: "transparent", width: "100%", fontSize: 14 },
                    })}
                  </View>
                ) : (
                  <Pressable style={styles.inputLike} onPress={() => { setHealthDateTarget("start"); setShowHealthDatePicker(true); }}>
                    <Text>{healthStartDate || "YYYY-MM-DD"}</Text>
                    <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
                  </Pressable>
                )}

                <Text style={styles.label}>{healthTreatmentType === "hospital" ? "ဆင်းသည့်နေ့/တက်ရောက်နေဆဲ" : "ကုသပြီးသည့်နေ့/ကုသနေဆဲ"}</Text>
                <View style={styles.typeRow}>
                  <Pressable
                    style={[styles.typeChip, healthProgressStatus === "ကုသနေဆဲ" && styles.typeChipActive]}
                    onPress={() => setHealthProgressStatus("ကုသနေဆဲ")}
                  >
                    <Text style={[styles.typeText, healthProgressStatus === "ကုသနေဆဲ" && styles.typeTextActive]}>ကုသနေဆဲ</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.typeChip, healthProgressStatus === "ကုသပြီး" && styles.typeChipActive]}
                    onPress={() => setHealthProgressStatus("ကုသပြီး")}
                  >
                    <Text style={[styles.typeText, healthProgressStatus === "ကုသပြီး" && styles.typeTextActive]}>ကုသပြီး</Text>
                  </Pressable>
                </View>
                {healthProgressStatus === "ကုသပြီး" && (
                  <>
                    {Platform.OS === "web" ? (
                      <View style={styles.inputLike}>
                        {React.createElement("input", {
                          type: "date",
                          value: healthEndDate,
                          onChange: (e: any) => setHealthEndDate(String(e?.target?.value || "")),
                          style: { border: "none", outline: "none", backgroundColor: "transparent", width: "100%", fontSize: 14 },
                        })}
                      </View>
                    ) : (
                      <Pressable style={styles.inputLike} onPress={() => { setHealthDateTarget("end"); setShowHealthDatePicker(true); }}>
                        <Text>{healthEndDate || "YYYY-MM-DD"}</Text>
                        <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
                      </Pressable>
                    )}
                  </>
                )}
              </>
            )}

            {isFuneralNotice && (
              <>
                <Text style={styles.label}>တော်စပ်ပုံ (Dropdown)</Text>
                <Pressable style={styles.inputLike} onPress={() => setRelationPickerVisible(true)}>
                  <Text style={{ color: Colors.light.text }}>{funeralRelation || "တော်စပ်ပုံရွေးပါ"}</Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} />
                </Pressable>

                <Text style={styles.label}>ကွယ်လွန်သူအမည်</Text>
                <TextInput
                  style={styles.input}
                  value={funeralDeceasedName}
                  onChangeText={setFuneralDeceasedName}
                  editable={funeralRelation !== "ကိုယ်တိုင်"}
                  placeholder={funeralRelation === "ကိုယ်တိုင်" ? "Auto ဖြည့်သွားမည်" : "အမည်"}
                />

                <Text style={styles.label}>အသက်</Text>
                <TextInput
                  style={styles.input}
                  value={funeralAge}
                  onChangeText={setFuneralAge}
                  editable={funeralRelation !== "ကိုယ်တိုင်"}
                  placeholder={funeralRelation === "ကိုယ်တိုင်" ? "Auto ဖြည့်သွားမည်" : "အသက်"}
                  keyboardType="numeric"
                />

                <Text style={styles.label}>ကွယ်လွန်သည့်နေ့ရက်</Text>
                {Platform.OS === "web" ? (
                  <View style={styles.inputLike}>
                    {React.createElement("input", {
                      type: "date",
                      value: funeralDeceasedDate,
                      onChange: (e: any) => setFuneralDeceasedDate(String(e?.target?.value || "")),
                      style: { border: "none", outline: "none", backgroundColor: "transparent", width: "100%", fontSize: 14 },
                    })}
                  </View>
                ) : (
                  <Pressable style={styles.inputLike} onPress={() => { setFuneralDateTarget("deceased"); setShowFuneralDatePicker(true); }}>
                    <Text>{funeralDeceasedDate || "YYYY-MM-DD"}</Text>
                    <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
                  </Pressable>
                )}

                <Text style={styles.label}>ရောဂါအမျိုးအစားဖြစ်စဉ်အကျဉ်း</Text>
                <TextInput
                  style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
                  value={funeralIllnessSummary}
                  onChangeText={setFuneralIllnessSummary}
                  multiline
                  placeholder="ဖြစ်စဉ်အကျဉ်း"
                />

                <Text style={styles.label}>သင်္ဂြိုလ်မည့်နေ့ရက်</Text>
                {Platform.OS === "web" ? (
                  <View style={styles.inputLike}>
                    {React.createElement("input", {
                      type: "date",
                      value: funeralBurialDate,
                      onChange: (e: any) => setFuneralBurialDate(String(e?.target?.value || "")),
                      style: { border: "none", outline: "none", backgroundColor: "transparent", width: "100%", fontSize: 14 },
                    })}
                  </View>
                ) : (
                  <Pressable style={styles.inputLike} onPress={() => { setFuneralDateTarget("burial"); setShowFuneralDatePicker(true); }}>
                    <Text>{funeralBurialDate || "YYYY-MM-DD"}</Text>
                    <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
                  </Pressable>
                )}

                <Text style={styles.label}>သင်္ဂြိုလ်မည့်အချိန်</Text>
                {Platform.OS === "web" ? (
                  <View style={styles.inputLike}>
                    {React.createElement("input", {
                      type: "time",
                      value: funeralBurialTime,
                      onChange: (e: any) => setFuneralBurialTime(String(e?.target?.value || "")),
                      style: { border: "none", outline: "none", backgroundColor: "transparent", width: "100%", fontSize: 14 },
                    })}
                  </View>
                ) : (
                  <Pressable style={styles.inputLike} onPress={() => { setFuneralTimeTarget("burial"); setShowFuneralTimePicker(true); }}>
                    <Text>{funeralBurialTime || "HH:mm"}</Text>
                    <Ionicons name="time-outline" size={16} color={Colors.light.textSecondary} />
                  </Pressable>
                )}

                <Text style={styles.label}>သင်္ဂြိုလ်မည့် သုဿာန်</Text>
                <TextInput style={styles.input} value={funeralCemetery} onChangeText={setFuneralCemetery} placeholder="သုဿာန်" />
                <Text style={styles.label}>Google Maps Link (URL)</Text>
                <View style={styles.locationRow}>
                  <TextInput style={[styles.input, styles.locationInput]} value={funeralCemeteryMapUrl} onChangeText={setFuneralCemeteryMapUrl} placeholder="https://maps.google.com/..." autoCapitalize="none" />
                  <Pressable
                    style={styles.mapBtn}
                    onPress={() => {
                      const url = funeralCemeteryMapUrl.trim();
                      if (!url) return;
                      void Linking.openURL(url);
                    }}
                  >
                    <Ionicons name="open-outline" size={16} color={Colors.light.tint} />
                  </Pressable>
                </View>

                <Text style={styles.label}>ကြို/ပို့ယာဉ်ထွက်ခွာမည့် နေရာလိပ်စာ / Google Map link</Text>
                <TextInput
                  style={styles.input}
                  value={funeralTransportLocation}
                  onChangeText={setFuneralTransportLocation}
                  placeholder="နေရာလိပ်စာ သို့ Google Map link"
                />
                <Text style={styles.label}>Google Maps Link (URL)</Text>
                <View style={styles.locationRow}>
                  <TextInput style={[styles.input, styles.locationInput]} value={funeralTransportMapUrl} onChangeText={setFuneralTransportMapUrl} placeholder="https://maps.google.com/..." autoCapitalize="none" />
                  <Pressable
                    style={styles.mapBtn}
                    onPress={() => {
                      const url = funeralTransportMapUrl.trim();
                      if (!url) return;
                      void Linking.openURL(url);
                    }}
                  >
                    <Ionicons name="open-outline" size={16} color={Colors.light.tint} />
                  </Pressable>
                </View>

                <Text style={styles.label}>ကြို/ပို့ယာဉ်ထွက်ခွာမည့် နေ့ရက်</Text>
                {Platform.OS === "web" ? (
                  <View style={styles.inputLike}>
                    {React.createElement("input", {
                      type: "date",
                      value: funeralTransportDate,
                      onChange: (e: any) => setFuneralTransportDate(String(e?.target?.value || "")),
                      style: { border: "none", outline: "none", backgroundColor: "transparent", width: "100%", fontSize: 14 },
                    })}
                  </View>
                ) : (
                  <Pressable style={styles.inputLike} onPress={() => { setFuneralDateTarget("transport"); setShowFuneralDatePicker(true); }}>
                    <Text>{funeralTransportDate || "YYYY-MM-DD"}</Text>
                    <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
                  </Pressable>
                )}

                <Text style={styles.label}>ကြို/ပို့ယာဉ်ထွက်ခွာမည့် အချိန်</Text>
                {Platform.OS === "web" ? (
                  <View style={styles.inputLike}>
                    {React.createElement("input", {
                      type: "time",
                      value: funeralTransportTime,
                      onChange: (e: any) => setFuneralTransportTime(String(e?.target?.value || "")),
                      style: { border: "none", outline: "none", backgroundColor: "transparent", width: "100%", fontSize: 14 },
                    })}
                  </View>
                ) : (
                  <Pressable style={styles.inputLike} onPress={() => { setFuneralTimeTarget("transport"); setShowFuneralTimePicker(true); }}>
                    <Text>{funeralTransportTime || "HH:mm"}</Text>
                    <Ionicons name="time-outline" size={16} color={Colors.light.textSecondary} />
                  </Pressable>
                )}

                <Text style={styles.label}>ရက်လည် ကျင်းပမည့် နေရာလိပ်စာ / Google Map link</Text>
                <TextInput
                  style={styles.input}
                  value={funeralMemorialLocation}
                  onChangeText={setFuneralMemorialLocation}
                  placeholder="နေရာလိပ်စာ သို့ Google Map link"
                />
                <Text style={styles.label}>Google Maps Link (URL)</Text>
                <View style={styles.locationRow}>
                  <TextInput style={[styles.input, styles.locationInput]} value={funeralMemorialMapUrl} onChangeText={setFuneralMemorialMapUrl} placeholder="https://maps.google.com/..." autoCapitalize="none" />
                  <Pressable
                    style={styles.mapBtn}
                    onPress={() => {
                      const url = funeralMemorialMapUrl.trim();
                      if (!url) return;
                      void Linking.openURL(url);
                    }}
                  >
                    <Ionicons name="open-outline" size={16} color={Colors.light.tint} />
                  </Pressable>
                </View>

                <Text style={styles.label}>ရက်လည် ကျင်းပမည့် နေ့ရက်</Text>
                {Platform.OS === "web" ? (
                  <View style={styles.inputLike}>
                    {React.createElement("input", {
                      type: "date",
                      value: funeralMemorialDate,
                      onChange: (e: any) => setFuneralMemorialDate(String(e?.target?.value || "")),
                      style: { border: "none", outline: "none", backgroundColor: "transparent", width: "100%", fontSize: 14 },
                    })}
                  </View>
                ) : (
                  <Pressable style={styles.inputLike} onPress={() => { setFuneralDateTarget("memorial"); setShowFuneralDatePicker(true); }}>
                    <Text>{funeralMemorialDate || "YYYY-MM-DD"}</Text>
                    <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
                  </Pressable>
                )}

                <Text style={styles.label}>ရက်လည် ကျင်းပမည့် အချိန်</Text>
                {Platform.OS === "web" ? (
                  <View style={styles.inputLike}>
                    {React.createElement("input", {
                      type: "time",
                      value: funeralMemorialTime,
                      onChange: (e: any) => setFuneralMemorialTime(String(e?.target?.value || "")),
                      style: { border: "none", outline: "none", backgroundColor: "transparent", width: "100%", fontSize: 14 },
                    })}
                  </View>
                ) : (
                  <Pressable style={styles.inputLike} onPress={() => { setFuneralTimeTarget("memorial"); setShowFuneralTimePicker(true); }}>
                    <Text>{funeralMemorialTime || "HH:mm"}</Text>
                    <Ionicons name="time-outline" size={16} color={Colors.light.textSecondary} />
                  </Pressable>
                )}
              </>
            )}

            <Text style={styles.label}>အကြောင်းအရာအကျဉ်းချုပ်</Text>
            <TextInput style={styles.input} value={summary} onChangeText={setSummary} placeholder="အကျဉ်းချုပ်" />

            <Text style={styles.label}>အကြောင်းအရာအပြည့်အစုံ</Text>
            <TextInput
              style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
              value={detail}
              onChangeText={setDetail}
              placeholder="အသေးစိတ်ရေးပါ..."
              multiline
            />

            <Text style={styles.label}>ပုံများ (လိုအပ်ပါက)</Text>
            <Pressable style={styles.imagePickerBtn} onPress={() => void pickImages()}>
              <Ionicons name="images-outline" size={18} color={Colors.light.tint} />
              <Text style={styles.imagePickerBtnText}>ပုံထည့်မည်</Text>
            </Pressable>
            {images.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {images.map((img, idx) => (
                    <View key={`${img.slice(0, 20)}-${idx}`} style={{ position: "relative" }}>
                      <Image source={{ uri: img }} style={styles.previewImage} />
                      <Pressable
                        style={styles.removeImageBtn}
                        onPress={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Ionicons name="close-circle" size={18} color="#EF4444" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}

            {showHealthDatePicker && Platform.OS !== "web" && (
              <DateTimePicker
                value={
                  healthDateTarget === "end" && healthEndDate
                    ? new Date(healthEndDate)
                    : healthStartDate
                      ? new Date(healthStartDate)
                      : new Date()
                }
                mode="date"
                display="default"
                onChange={(_, selectedDate) => {
                  setShowHealthDatePicker(false);
                  setHealthDateTarget(null);
                  if (!selectedDate) return;
                  if (healthDateTarget === "start") setHealthStartDate(formatYmd(selectedDate));
                  if (healthDateTarget === "end") setHealthEndDate(formatYmd(selectedDate));
                }}
              />
            )}

            {showFuneralDatePicker && Platform.OS !== "web" && (
              <DateTimePicker
                value={
                  funeralDateTarget === "deceased"
                    ? new Date(funeralDeceasedDate || formatYmd(new Date()))
                    : funeralDateTarget === "transport"
                    ? new Date(funeralTransportDate || formatYmd(new Date()))
                    : funeralDateTarget === "memorial"
                      ? new Date(funeralMemorialDate || formatYmd(new Date()))
                      : new Date(funeralBurialDate || formatYmd(new Date()))
                }
                mode="date"
                display="default"
                onChange={(_, selectedDate) => {
                  setShowFuneralDatePicker(false);
                  if (!selectedDate) return;
                  if (funeralDateTarget === "deceased") setFuneralDeceasedDate(formatYmd(selectedDate));
                  if (funeralDateTarget === "burial") setFuneralBurialDate(formatYmd(selectedDate));
                  if (funeralDateTarget === "transport") setFuneralTransportDate(formatYmd(selectedDate));
                  if (funeralDateTarget === "memorial") setFuneralMemorialDate(formatYmd(selectedDate));
                  setFuneralDateTarget(null);
                }}
              />
            )}

            {showFuneralTimePicker && Platform.OS !== "web" && (
              <DateTimePicker
                value={new Date()}
                mode="time"
                display="default"
                onChange={(_, selectedDate) => {
                  setShowFuneralTimePicker(false);
                  if (!selectedDate) return;
                  if (funeralTimeTarget === "burial") setFuneralBurialTime(formatHm(selectedDate));
                  if (funeralTimeTarget === "transport") setFuneralTransportTime(formatHm(selectedDate));
                  if (funeralTimeTarget === "memorial") setFuneralMemorialTime(formatHm(selectedDate));
                  setFuneralTimeTarget(null);
                }}
              />
            )}

            <Text style={styles.label}>ပေးပို့သူ (Member Dropdown)</Text>
            <Pressable style={styles.inputLike} onPress={() => setSenderPickerVisible(true)}>
              <Text style={{ color: Colors.light.text }}>
                {selectedSenderMemberId
                  ? `${senderNameInput || "-"} (${senderMemberIdInput || "-"})`
                  : "Member ရွေးချယ်ပါ (မရွေးလည်းရသည်)"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} />
            </Pressable>

            <Text style={styles.label}>ပေးပို့သူအမည် (Textbox)</Text>
            <TextInput style={styles.input} value={senderNameInput} onChangeText={onChangeSenderName} placeholder="အမည်" />

            <Text style={styles.label}>အဖွဲ့ဝင် ID (Textbox - optional)</Text>
            <TextInput style={styles.input} value={senderMemberIdInput} onChangeText={onChangeSenderMemberId} placeholder="ဥပမာ - ရဆသ-001" />

            <Text style={styles.label}>ဆက်သွယ်ရန်ဖုန်း (member phone auto / manual edit)</Text>
            <TextInput style={styles.input} value={senderPhoneInput} onChangeText={setSenderPhoneInput} placeholder="09xxxxxxxxx" keyboardType="phone-pad" />

            <View style={styles.senderBox}>
              <Text style={styles.senderText}>ပေးပို့သူ: {senderNameInput || "-"} ({senderMemberIdInput || "-"})</Text>
              <Text style={styles.senderText}>ဖုန်း: {senderPhoneInput || "-"}</Text>
              <Text style={styles.senderText}>နေ့/အချိန်: {formatYmd(new Date())} {formatHm(new Date())}</Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => { setModalVisible(false); resetForm(); }}>
                <Text style={styles.cancelText}>မလုပ်တော့ပါ</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={() => void saveNotice()}>
                <Text style={styles.saveText}>{editingId ? "ပြင်ဆင်မည်" : "ပို့မည်"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal animationType="slide" transparent visible={topicPickerVisible} onRequestClose={() => setTopicPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.topicModalContent}>
            <Text style={styles.modalTitle}>သတင်းခေါင်းစဉ်ရွေးချယ်ရန်</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {allTopics.map((t) => (
                <Pressable
                  key={t}
                  style={[styles.topicRow, topic === t && styles.topicRowActive]}
                  onPress={() => {
                    setTopic(t);
                    setTopicPickerVisible(false);
                  }}
                >
                  <Text style={[styles.topicRowText, topic === t && styles.topicRowTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.label}>ခေါင်းစဉ်အသစ်ထည့်ရန်</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={newCustomTopic}
                onChangeText={setNewCustomTopic}
                placeholder="ခေါင်းစဉ်အသစ်"
              />
              <Pressable style={[styles.saveBtn, { paddingHorizontal: 14 }]} onPress={() => void addCustomTopic()}>
                <Text style={styles.saveText}>ထည့်မည်</Text>
              </Pressable>
            </View>
            <Pressable style={[styles.cancelBtn, { alignSelf: "flex-end", marginTop: 8 }]} onPress={() => setTopicPickerVisible(false)}>
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={relationPickerVisible} onRequestClose={() => setRelationPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.topicModalContent}>
            <Text style={styles.modalTitle}>တော်စပ်ပုံရွေးချယ်ရန်</Text>
            <ScrollView style={{ maxHeight: 240 }}>
              {allRelations.map((r) => (
                <Pressable
                  key={r}
                  style={[styles.topicRow, (isFuneralNotice ? funeralRelation : healthRelation) === r && styles.topicRowActive]}
                  onPress={() => {
                    if (isFuneralNotice) applyFuneralRelation(r);
                    else applyHealthRelation(r);
                    setRelationPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.topicRowText,
                      (isFuneralNotice ? funeralRelation : healthRelation) === r && styles.topicRowTextActive,
                    ]}
                  >
                    {r}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.label}>တော်စပ်ပုံအသစ်ထည့်ရန်</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput style={[styles.input, { flex: 1 }]} value={newCustomRelation} onChangeText={setNewCustomRelation} placeholder="အသစ်ထည့်ရန်" />
              <Pressable style={[styles.saveBtn, { paddingHorizontal: 14 }]} onPress={() => void addCustomRelation()}>
                <Text style={styles.saveText}>ထည့်မည်</Text>
              </Pressable>
            </View>
            <Pressable style={[styles.cancelBtn, { alignSelf: "flex-end", marginTop: 8 }]} onPress={() => setRelationPickerVisible(false)}>
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={conditionPickerVisible} onRequestClose={() => setConditionPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.topicModalContent}>
            <Text style={styles.modalTitle}>ရောဂါအခြေအနေရွေးချယ်ရန်</Text>
            <ScrollView style={{ maxHeight: 240 }}>
              {allHealthConditions.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.topicRow, healthCondition === c && styles.topicRowActive]}
                  onPress={() => {
                    setHealthCondition(c);
                    setConditionPickerVisible(false);
                  }}
                >
                  <Text style={[styles.topicRowText, healthCondition === c && styles.topicRowTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.label}>အခြေအနေအသစ်ထည့်ရန်</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput style={[styles.input, { flex: 1 }]} value={newCustomCondition} onChangeText={setNewCustomCondition} placeholder="အသစ်ထည့်ရန်" />
              <Pressable style={[styles.saveBtn, { paddingHorizontal: 14 }]} onPress={() => void addCustomCondition()}>
                <Text style={styles.saveText}>ထည့်မည်</Text>
              </Pressable>
            </View>
            <Pressable style={[styles.cancelBtn, { alignSelf: "flex-end", marginTop: 8 }]} onPress={() => setConditionPickerVisible(false)}>
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={subjectPickerVisible} onRequestClose={() => setSubjectPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.topicModalContent}>
            <Text style={styles.modalTitle}>သက်ဆိုင်သည့်အသင်းဝင် ရွေးချယ်ရန်</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {senderMembers.map((member: any) => {
                const id = String(member?.id || "");
                const label = `${member?.name || "-"} (${id || "-"})`;
                const active = selectedSubjectMemberId === id;
                return (
                  <Pressable
                    key={id}
                    style={[styles.topicRow, active && styles.topicRowActive]}
                    onPress={() => {
                      chooseSubjectMember(id);
                      setSubjectPickerVisible(false);
                    }}
                  >
                    <Text style={[styles.topicRowText, active && styles.topicRowTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={[styles.cancelBtn, { alignSelf: "flex-end", marginTop: 8 }]} onPress={() => setSubjectPickerVisible(false)}>
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={senderPickerVisible} onRequestClose={() => setSenderPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.topicModalContent}>
            <Text style={styles.modalTitle}>ပေးပို့သူ Member ရွေးချယ်ရန်</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              <Pressable
                style={[styles.topicRow, !selectedSenderMemberId && styles.topicRowActive]}
                onPress={() => {
                  setSelectedSenderMemberId("");
                  setSenderPickerVisible(false);
                }}
              >
                <Text style={[styles.topicRowText, !selectedSenderMemberId && styles.topicRowTextActive]}>မရွေးပါ (Textbox ဖြင့်ထည့်မည်)</Text>
              </Pressable>
              {senderMembers.map((member: any) => {
                const id = String(member?.id || "");
                const label = `${member?.name || "-"} (${id || "-"})`;
                const active = selectedSenderMemberId === id;
                return (
                  <Pressable
                    key={id}
                    style={[styles.topicRow, active && styles.topicRowActive]}
                    onPress={() => {
                      chooseSenderMember(id);
                      setSenderPickerVisible(false);
                    }}
                  >
                    <Text style={[styles.topicRowText, active && styles.topicRowTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={[styles.cancelBtn, { alignSelf: "flex-end", marginTop: 8 }]} onPress={() => setSenderPickerVisible(false)}>
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text, flex: 1 },
  headerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  headerActionText: { fontSize: 12, color: Colors.light.tint, fontFamily: "Inter_600SemiBold", marginLeft: 4 },
  list: { padding: 20, paddingBottom: 120 },
  card: { backgroundColor: "white", borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: Colors.light.border, overflow: "hidden" },
  cardImage: { width: "100%", height: 170 },
  cardContent: { padding: 15 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, maxWidth: "68%" },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  date: { fontSize: 12, color: Colors.light.textSecondary },
  title: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 6 },
  desc: { fontSize: 13, color: Colors.light.textSecondary, lineHeight: 20 },
  metaLine: { marginTop: 6, fontSize: 12, color: Colors.light.textSecondary },
  actionRow: { position: "absolute", bottom: 10, right: 10, flexDirection: "row", gap: 8 },
  iconBtn: { padding: 8, backgroundColor: "#F3F4F6", borderRadius: 20 },
  emptyState: { alignItems: "center", marginTop: 50 },
  emptyText: { marginTop: 10, color: Colors.light.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 },
  modalContent: { backgroundColor: "white", borderRadius: 16, padding: 16, maxHeight: "90%" },
  topicModalContent: { backgroundColor: "white", borderRadius: 16, padding: 16 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 10, textAlign: "center" },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, padding: 10, fontSize: 14, color: Colors.light.text },
  inputLike: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  locationInput: { flex: 1 },
  mapBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  imagePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: "#F8FAFC",
    alignSelf: "flex-start",
  },
  imagePickerBtnText: { fontSize: 13, color: Colors.light.tint, fontFamily: "Inter_600SemiBold" },
  previewImage: { width: 96, height: 72, borderRadius: 8 },
  removeImageBtn: { position: "absolute", top: -8, right: -8, backgroundColor: "white", borderRadius: 10 },
  senderBox: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: Colors.light.border },
  senderText: { fontSize: 12, color: Colors.light.textSecondary, lineHeight: 18 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 16 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  cancelText: { color: Colors.light.textSecondary, fontFamily: "Inter_600SemiBold" },
  saveBtn: { backgroundColor: Colors.light.tint, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  saveText: { color: "white", fontFamily: "Inter_700Bold" },
  topicRow: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, marginBottom: 4 },
  topicRowActive: { backgroundColor: `${Colors.light.tint}20` },
  topicRowText: { color: Colors.light.text, fontSize: 14 },
  topicRowTextActive: { color: Colors.light.tint, fontFamily: "Inter_700Bold" },
  typeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  typeChip: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F8FAFC",
  },
  typeChipActive: { backgroundColor: `${Colors.light.tint}16`, borderColor: Colors.light.tint },
  typeText: { color: Colors.light.textSecondary, fontSize: 13, fontFamily: "Inter_500Medium" },
  typeTextActive: { color: Colors.light.tint, fontFamily: "Inter_700Bold" },
});


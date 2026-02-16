import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
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
import AccessDenied from "@/components/AccessDenied";
import FloatingTabMenu from "@/components/FloatingTabMenu";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { useData } from "@/lib/DataContext";

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
  senderDate?: string;
  senderTime?: string;
  summary?: string;
  detail?: string;
  topic?: string;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
}

const CUSTOM_TOPIC_KEY = "@org_notice_custom_topics";
const PRESET_TOPICS = [
  "အလှူပွဲတက်ရောက်ရန်ဖိတ်ကြားခြင်း",
  "မင်္ဂလာပွဲတက်ရောက်ရန်ဖိတ်ကြားခြင်း",
  "ကျန်းမာရေးအခြေအနေအကြောင်းကြားခြင်း",
  "နာရေး အကြောင်းကြားခြင်း",
  "အခြားကိစ္စ",
] as const;

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

function getTopicColor(topic?: string): string {
  if (!topic) return "#6B7280";
  if (topic.includes("အလှူ")) return "#3B82F6";
  if (topic.includes("မင်္ဂလာ")) return "#EC4899";
  if (topic.includes("ကျန်းမာရေး")) return "#10B981";
  if (topic.includes("နာရေး")) return "#EF4444";
  if (topic.includes("အခြား")) return "#F59E0B";
  return "#0EA5A4";
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const { events, addEvent, editEvent, removeEvent } = useData() as any;
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
  const [topicPickerVisible, setTopicPickerVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [topic, setTopic] = useState<string>(PRESET_TOPICS[0]);
  const [customTopics, setCustomTopics] = useState<string[]>([]);
  const [newCustomTopic, setNewCustomTopic] = useState("");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [eventDate, setEventDate] = useState(formatYmd(new Date()));
  const [eventTime, setEventTime] = useState(formatHm(new Date()));
  const [eventLocation, setEventLocation] = useState("");
  const [images, setImages] = useState<string[]>([]);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const allTopics = useMemo(() => [...PRESET_TOPICS, ...customTopics], [customTopics]);

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

  const isOwnNotice = (item: OrgEventNotice) => {
    if (!currentUser) return false;
    if (item.createdByUserId && item.createdByUserId === currentUser.id) return true;
    if (item.createdByMemberId && currentUser.memberId && item.createdByMemberId === currentUser.memberId) return true;
    return false;
  };

  const canEditItem = (item: OrgEventNotice) => canEditAllEvent || (canEditOwnEvent && isOwnNotice(item));
  const canDeleteItem = (item: OrgEventNotice) => canDeleteAllEvent || (canDeleteOwnEvent && isOwnNotice(item));

  const resetForm = () => {
    setEditingId(null);
    setTopic(PRESET_TOPICS[0]);
    setSummary("");
    setDetail("");
    setEventDate(formatYmd(new Date()));
    setEventTime(formatHm(new Date()));
    setEventLocation("");
    setImages([]);
    setNewCustomTopic("");
  };

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

  const handleEdit = (item: OrgEventNotice) => {
    if (!canEditItem(item)) {
      Alert.alert("ခွင့်မပြုပါ", "ဤသတင်းကို ပြင်ဆင်ခွင့် မရှိပါ။");
      return;
    }
    setEditingId(item.id);
    setTopic(item.topic || item.title || PRESET_TOPICS[0]);
    setSummary(item.summary || item.title || "");
    setDetail(item.detail || item.description || "");
    setEventDate(item.eventDate || formatYmd(new Date(item.date || Date.now())));
    setEventTime(item.eventTime || item.senderTime || formatHm(new Date()));
    setEventLocation(item.eventLocation || "");
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
    const isInvite = topic.includes("ဖိတ်ကြား");
    if (isInvite && (!eventDate.trim() || !eventTime.trim() || !eventLocation.trim())) {
      Alert.alert("လိုအပ်ချက်", "ဖိတ်ကြားသတင်းအတွက် နေ့ရက်၊ အချိန်၊ နေရာ ထည့်ပါ။");
      return;
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
      summary: summary.trim(),
      detail: detail.trim(),
      eventDate: eventDate.trim(),
      eventTime: eventTime.trim(),
      eventLocation: eventLocation.trim(),
      senderName: currentUser?.displayName || "",
      senderMemberId: currentUser?.memberId || "",
      senderDate: formatYmd(now),
      senderTime: formatHm(now),
      createdByUserId: currentUser?.id,
      createdByMemberId: currentUser?.memberId,
    };

    if (editingId) {
      const existing = events.find((e: any) => e.id === editingId) as OrgEventNotice | undefined;
      if (!existing) {
        Alert.alert("အမှား", "သတင်းမတွေ့ပါ။");
        return;
      }
      if (!canEditItem(existing)) {
        Alert.alert("ခွင့်မပြုပါ", "ပြင်ဆင်ခွင့် မရှိပါ။");
        return;
      }
      await editEvent(editingId, { ...existing, ...payload });
    } else {
      if (!canCreateEvent) {
        Alert.alert("ခွင့်မပြုပါ", "သတင်းအသစ်တင်ခွင့် မရှိပါ။");
        return;
      }
      await addEvent(payload);
    }

    setModalVisible(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    const existing = events.find((e: any) => e.id === id) as OrgEventNotice | undefined;
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
        } (${item.senderMemberId || "-"})`,
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
        <Pressable onPress={() => router.replace("/")} style={{ marginRight: 5, padding: 4 }}>
          <Ionicons name="home" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>အသင်းသို့သတင်းပို့</Text>
        {canCreateEvent ? (
          <Pressable onPress={() => { resetForm(); setModalVisible(true); }} style={[styles.headerActionBtn, { marginRight: 40 }]}>
            <Ionicons name="add-circle" size={20} color={Colors.light.tint} />
            <Text style={styles.headerActionText}>အသစ်</Text>
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <FlatList
        data={events}
        keyExtractor={(item: any) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }: { item: OrgEventNotice }) => {
          const topicColor = getTopicColor(item.topic || item.title);
          const primaryImage = item.images?.[0] || item.image;
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
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent} contentContainerStyle={{ paddingBottom: 20 }}>
            <Text style={styles.modalTitle}>{editingId ? "သတင်းပြင်ဆင်ရန်" : "သတင်းအသစ်ပို့ရန်"}</Text>

            <Text style={styles.label}>သတင်းခေါင်းစဉ် (Dropdown)</Text>
            <Pressable style={styles.inputLike} onPress={() => setTopicPickerVisible(true)}>
              <Text style={{ color: Colors.light.text }}>{topic || "ခေါင်းစဉ်ရွေးပါ"}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} />
            </Pressable>

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

            <View style={styles.senderBox}>
              <Text style={styles.senderText}>ပေးပို့သူ: {currentUser?.displayName || "-"} ({currentUser?.memberId || "-"})</Text>
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
        </View>
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

      <FloatingTabMenu />
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
});


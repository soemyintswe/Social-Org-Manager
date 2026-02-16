import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface OrgEventNotice {
  id: string;
  title: string;
  description: string;
  date: string;
  type: "activity" | "news" | "announcement";
  image?: string;
  images?: string[];
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

function getTopicColor(topic?: string): string {
  if (!topic) return "#6B7280";
  if (topic.includes("အလှူ")) return "#3B82F6";
  if (topic.includes("မင်္ဂလာ")) return "#EC4899";
  if (topic.includes("ကျန်းမာရေး")) return "#10B981";
  if (topic.includes("နာရေး")) return "#EF4444";
  if (topic.includes("အခြား")) return "#F59E0B";
  return "#0EA5A4";
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<OrgEventNotice | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("@orghub_events");
        if (!raw || !mounted) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        const found = parsed.find((item) => String(item?.id) === String(id));
        if (mounted) setEvent(found || null);
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  const images = useMemo(() => {
    if (!event) return [] as string[];
    if (Array.isArray(event.images) && event.images.length) return event.images;
    if (event.image) return [event.image];
    return [] as string[];
  }, [event]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>သတင်းမတွေ့ပါ</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>နောက်သို့ပြန်ရန်</Text>
        </Pressable>
      </View>
    );
  }

  const topic = event.topic || event.title;
  const topicColor = getTopicColor(topic);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBackBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>သတင်းအသေးစိတ်</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.imageRow}>
              {images.map((img, idx) => (
                <Image key={`${img.slice(0, 16)}-${idx}`} source={{ uri: img }} style={styles.image} resizeMode="cover" />
              ))}
            </View>
          </ScrollView>
        )}

        <View style={styles.body}>
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: `${topicColor}20` }]}>
              <Text style={[styles.badgeText, { color: topicColor }]}>{topic}</Text>
            </View>
            <Text style={styles.date}>{event.senderDate || new Date(event.date).toLocaleDateString()} {event.senderTime || ""}</Text>
          </View>

          <Text style={styles.summaryTitle}>အကျဉ်းချုပ်</Text>
          <Text style={styles.summaryText}>{event.summary || event.title}</Text>

          <Text style={styles.summaryTitle}>အပြည့်အစုံ</Text>
          <Text style={styles.description}>{event.detail || event.description}</Text>

          {(event.eventDate || event.eventTime || event.eventLocation) && (
            <View style={styles.scheduleBox}>
              <Text style={styles.scheduleTitle}>ကျင်းပမှုအချက်အလက်</Text>
              <Text style={styles.scheduleText}>နေ့ရက်: {event.eventDate || "-"}</Text>
              <Text style={styles.scheduleText}>အချိန်: {event.eventTime || "-"}</Text>
              <Text style={styles.scheduleText}>နေရာ: {event.eventLocation || "-"}</Text>
            </View>
          )}

          <View style={styles.senderBox}>
            <Text style={styles.senderText}>သတင်းပေးပို့သူ: {event.senderName || "-"}</Text>
            <Text style={styles.senderText}>အဖွဲ့ဝင် ID: {event.senderMemberId || "-"}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerBackBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  content: { paddingBottom: 40 },
  imageRow: { flexDirection: "row", gap: 10, padding: 12 },
  image: { width: 280, height: 180, borderRadius: 12 },
  body: { padding: 20 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, maxWidth: "72%" },
  badgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  date: { fontSize: 13, color: Colors.light.textSecondary },
  summaryTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.light.text, marginTop: 8, marginBottom: 6 },
  summaryText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text, lineHeight: 24 },
  description: { fontSize: 15, lineHeight: 23, color: Colors.light.text, marginTop: 2 },
  scheduleBox: { marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: Colors.light.border },
  scheduleTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 6 },
  scheduleText: { fontSize: 13, color: Colors.light.textSecondary, lineHeight: 20 },
  senderBox: { marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: "#ECFEFF", borderWidth: 1, borderColor: "#A5F3FC" },
  senderText: { fontSize: 13, color: "#0F766E", lineHeight: 20 },
  errorText: { fontSize: 16, color: Colors.light.textSecondary, marginBottom: 10 },
  backButton: { padding: 10 },
  backButtonText: { color: Colors.light.tint, fontSize: 16, fontFamily: "Inter_600SemiBold" },
});


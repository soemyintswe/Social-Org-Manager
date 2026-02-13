import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

interface OrgEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  type: "activity" | "news" | "announcement";
  image?: string;
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<OrgEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvent();
  }, [id]);

  const loadEvent = async () => {
    try {
      const stored = await AsyncStorage.getItem("@org_events");
      if (stored) {
        const events: OrgEvent[] = JSON.parse(stored);
        const found = events.find((e) => e.id === id);
        setEvent(found || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (t: string) => {
    switch(t) {
      case "activity": return "လှုပ်ရှားမှု";
      case "news": return "သတင်း";
      case "announcement": return "ကြေညာချက်";
      default: return t;
    }
  };

  const getTypeColor = (t: string) => {
    switch(t) {
      case "activity": return "#3B82F6";
      case "news": return "#10B981";
      case "announcement": return "#F59E0B";
      default: return "#6B7280";
    }
  };

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
        <Text style={styles.errorText}>Event not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBackBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>အသေးစိတ်</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {event.image && (
          <Image source={{ uri: event.image }} style={styles.image} resizeMode="cover" />
        )}
        
        <View style={styles.body}>
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: getTypeColor(event.type) + "20" }]}>
              <Text style={[styles.badgeText, { color: getTypeColor(event.type) }]}>
                {getTypeLabel(event.type)}
              </Text>
            </View>
            <Text style={styles.date}>{new Date(event.date).toLocaleDateString()}</Text>
          </View>

          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.description}>{event.description}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 15, backgroundColor: Colors.light.surface, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  headerBackBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  content: { paddingBottom: 40 },
  image: { width: "100%", height: 250 },
  body: { padding: 20 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 12, fontWeight: "bold" },
  date: { fontSize: 14, color: Colors.light.textSecondary },
  title: { fontSize: 24, fontWeight: "bold", color: Colors.light.text, marginBottom: 15 },
  description: { fontSize: 16, lineHeight: 24, color: Colors.light.text },
  errorText: { fontSize: 16, color: Colors.light.textSecondary, marginBottom: 10 },
  backButton: { padding: 10 },
  backButtonText: { color: Colors.light.tint, fontSize: 16, fontWeight: "600" },
});
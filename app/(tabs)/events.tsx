import React from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { OrgEvent } from "@/lib/types";

function EventCard({ event, onPress, onDelete }: { event: OrgEvent; onPress: () => void; onDelete: () => void }) {
  const eventDate = new Date(event.date);
  const isPast = eventDate < new Date();

  return (
    <Pressable
      style={({ pressed }) => [styles.eventCard, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      onLongPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert("Delete Event", `Remove "${event.title}"?`, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: onDelete },
        ]);
      }}
    >
      <View style={[styles.dateBadge, isPast && styles.dateBadgePast]}>
        <Text style={[styles.dateDay, isPast && styles.dateDayPast]}>{eventDate.getDate()}</Text>
        <Text style={[styles.dateMonth, isPast && styles.dateMonthPast]}>
          {eventDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
        </Text>
      </View>
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
        {event.time ? (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={13} color={Colors.light.textSecondary} />
            <Text style={styles.metaText}>{event.time}</Text>
          </View>
        ) : null}
        {event.location ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={Colors.light.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1}>{event.location}</Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Ionicons name="people-outline" size={13} color={Colors.light.textSecondary} />
          <Text style={styles.metaText}>{event.attendeeIds.length} attendees</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.light.textSecondary} />
    </Pressable>
  );
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const { events, removeEvent, loading } = useData();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const sorted = [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 + webTopInset }]}>
        <Text style={styles.headerTitle}>Events</Text>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/add-event");
          }}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="add" size={24} color={Colors.light.surface} />
        </Pressable>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={() => router.push({ pathname: "/event-detail", params: { id: item.id } })}
            onDelete={() => removeEvent(item.id)}
          />
        )}
        contentContainerStyle={[styles.list, sorted.length === 0 && styles.center]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={40} color={Colors.light.textSecondary} />
            <Text style={styles.emptyTitle}>No events yet</Text>
            <Text style={styles.emptyText}>Tap + to create your first event</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center", flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 100,
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: Colors.light.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  dateBadge: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: Colors.light.tintLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  dateBadgePast: {
    backgroundColor: Colors.light.border,
  },
  dateDay: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.tint,
  },
  dateDayPast: {
    color: Colors.light.textSecondary,
  },
  dateMonth: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
  dateMonthPast: {
    color: Colors.light.textSecondary,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    flex: 1,
  },
  emptyState: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
});

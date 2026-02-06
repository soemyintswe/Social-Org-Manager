import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";

export default function EventDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { events, members, removeEvent, editEvent, getEventAttendance, markAttendance } = useData();

  const event = events.find((e) => e.id === id);
  const attendanceRecords = event ? getEventAttendance(event.id) : [];
  const [showAttendance, setShowAttendance] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  if (!event) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyText}>Event not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const eventDate = new Date(event.date);
  const isPast = eventDate < new Date();
  const attendeeMembers = members.filter((m) => event.attendeeIds.includes(m.id));
  const nonAttendees = members.filter((m) => !event.attendeeIds.includes(m.id));

  const handleAddAttendee = async (memberId: string) => {
    const newIds = [...event.attendeeIds, memberId];
    await editEvent(event.id, { attendeeIds: newIds });
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRemoveAttendee = async (memberId: string) => {
    const newIds = event.attendeeIds.filter((id) => id !== memberId);
    await editEvent(event.id, { attendeeIds: newIds });
  };

  const handleTogglePresent = async (memberId: string) => {
    const existing = attendanceRecords.find((a) => a.memberId === memberId);
    const present = existing ? !existing.present : true;
    await markAttendance([{ eventId: event.id, memberId, present }]);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDelete = () => {
    Alert.alert("Delete Event", `Remove "${event.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await removeEvent(event.id);
          router.back();
        },
      },
    ]);
  };

  const presentCount = attendanceRecords.filter((a) => a.present).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 + webTopInset }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Pressable onPress={handleDelete} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Ionicons name="trash-outline" size={22} color={Colors.light.accent} />
        </Pressable>
      </View>

      <View style={styles.eventHeader}>
        <View style={[styles.dateBadge, isPast && styles.dateBadgePast]}>
          <Text style={[styles.dateDay, isPast && styles.dateDayPast]}>{eventDate.getDate()}</Text>
          <Text style={[styles.dateMonth, isPast && styles.dateMonthPast]}>
            {eventDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
          </Text>
          <Text style={[styles.dateYear, isPast && styles.dateDayPast]}>
            {eventDate.getFullYear()}
          </Text>
        </View>
        <View style={styles.eventTitleSection}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          {isPast && (
            <View style={styles.pastBadge}>
              <Text style={styles.pastBadgeText}>Past Event</Text>
            </View>
          )}
        </View>
      </View>

      {(event.time || event.location) && (
        <View style={styles.detailsCard}>
          {event.time ? (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="time-outline" size={18} color={Colors.light.tint} />
              </View>
              <Text style={styles.detailText}>{event.time}</Text>
            </View>
          ) : null}
          {event.location ? (
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="location-outline" size={18} color={Colors.light.tint} />
              </View>
              <Text style={styles.detailText}>{event.location}</Text>
            </View>
          ) : null}
        </View>
      )}

      {event.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <View style={styles.descCard}>
            <Text style={styles.descText}>{event.description}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Attendees ({attendeeMembers.length})
          </Text>
          {attendeeMembers.length > 0 && (
            <Pressable
              onPress={() => setShowAttendance(!showAttendance)}
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.toggleText}>
                {showAttendance ? "Hide Attendance" : "Take Attendance"}
              </Text>
            </Pressable>
          )}
        </View>

        {showAttendance && attendeeMembers.length > 0 && (
          <View style={styles.attendanceSummary}>
            <Text style={styles.attendanceSummaryText}>
              {presentCount} of {attendeeMembers.length} present
            </Text>
          </View>
        )}

        {attendeeMembers.length === 0 ? (
          <View style={styles.emptyAttendees}>
            <Text style={styles.emptyAttendeesText}>No attendees added yet</Text>
          </View>
        ) : (
          attendeeMembers.map((m) => {
            const record = attendanceRecords.find((a) => a.memberId === m.id);
            const isPresent = record?.present ?? false;
            return (
              <View key={m.id} style={styles.attendeeRow}>
                <View style={[styles.attendeeAvatar, { backgroundColor: m.avatarColor }]}>
                  <Text style={styles.attendeeInitials}>
                    {(m.firstName[0] + m.lastName[0]).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.attendeeName} numberOfLines={1}>
                  {m.firstName} {m.lastName}
                </Text>
                {showAttendance && (
                  <Pressable onPress={() => handleTogglePresent(m.id)}>
                    <Ionicons
                      name={isPresent ? "checkmark-circle" : "ellipse-outline"}
                      size={26}
                      color={isPresent ? Colors.light.success : Colors.light.textSecondary}
                    />
                  </Pressable>
                )}
                {!showAttendance && (
                  <Pressable onPress={() => handleRemoveAttendee(m.id)}>
                    <Ionicons name="close-circle-outline" size={22} color={Colors.light.textSecondary} />
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </View>

      {nonAttendees.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Attendees</Text>
          {nonAttendees.map((m) => (
            <Pressable
              key={m.id}
              style={({ pressed }) => [styles.addAttendeeRow, pressed && { opacity: 0.7 }]}
              onPress={() => handleAddAttendee(m.id)}
            >
              <View style={[styles.attendeeAvatar, { backgroundColor: m.avatarColor }]}>
                <Text style={styles.attendeeInitials}>
                  {(m.firstName[0] + m.lastName[0]).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.attendeeName} numberOfLines={1}>
                {m.firstName} {m.lastName}
              </Text>
              <Ionicons name="add-circle-outline" size={22} color={Colors.light.tint} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 16,
  },
  dateBadge: {
    width: 70,
    height: 70,
    borderRadius: 18,
    backgroundColor: Colors.light.tintLight,
    justifyContent: "center",
    alignItems: "center",
  },
  dateBadgePast: { backgroundColor: Colors.light.border },
  dateDay: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.light.tint,
  },
  dateDayPast: { color: Colors.light.textSecondary },
  dateMonth: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
    marginTop: -2,
  },
  dateMonthPast: { color: Colors.light.textSecondary },
  dateYear: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.tint,
  },
  eventTitleSection: { flex: 1 },
  eventTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  pastBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.light.textSecondary + "15",
    marginTop: 6,
  },
  pastBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
  },
  detailsCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
    shadowColor: Colors.light.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.light.tintLight,
    justifyContent: "center",
    alignItems: "center",
  },
  detailText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    flex: 1,
  },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 12,
  },
  toggleText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
  attendanceSummary: {
    backgroundColor: Colors.light.tintLight,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    alignItems: "center",
  },
  attendanceSummaryText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
  descCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
  },
  descText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    lineHeight: 22,
  },
  emptyAttendees: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
  },
  emptyAttendeesText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  attendeeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  attendeeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  attendeeInitials: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  attendeeName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  addAttendeeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderStyle: "dashed",
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginBottom: 12,
  },
  backLink: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
});

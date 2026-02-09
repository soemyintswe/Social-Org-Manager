import React, { useMemo } from "react";
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
  // DataContext မှ function များကို မှန်ကန်စွာ ယူပါသည်
  const { events, members, markAttendance, getEventAttendance } = useData();

  const event = events.find((e) => e.id === id);
  const eventAttendance = useMemo(() => getEventAttendance(id || ""), [getEventAttendance, id]);

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

  const handleToggleAttendance = async (memberId: string) => {
    const attendance = eventAttendance.find(a => a.memberId === memberId);
    // status မရှိပါက record ရှိနေလျှင် present ဟု ယူဆသည်
    const newStatus = attendance ? "absent" : "present";

    try {
      // argument ၃ ခုပေးပို့ပါသည်
      await markAttendance(event.id, memberId, newStatus);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      Alert.alert("Error", "Failed to mark attendance");
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 + webTopInset }]}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Attendance</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.eventCard}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          <View style={styles.eventInfo}>
            <Ionicons name="calendar-outline" size={16} color={Colors.light.textSecondary} />
            <Text style={styles.eventDate}>
              {new Date(event.date).toLocaleDateString("en-US", {
                month: "long", day: "numeric", year: "numeric"
              })}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Members</Text>

        {members.map((member) => {
          const isPresent = eventAttendance.some((a) => a.memberId === member.id);
          // Member name မှ initials ကို ယူပါသည်
          const initials = member.name ? member.name.charAt(0).toUpperCase() : "M";

          return (
            <Pressable
              key={member.id}
              style={[styles.memberRow, isPresent && styles.memberRowActive]}
              onPress={() => handleToggleAttendance(member.id)}
            >
              <View style={[styles.avatar, { backgroundColor: (member as any).avatarColor || Colors.light.tint }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>

              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.name}</Text>
                <Text style={styles.memberRole}>{(member as any).role || "Member"}</Text>
              </View>

              <View style={styles.statusIndicator}>
                <Ionicons 
                  name={isPresent ? "checkmark-circle" : "ellipse-outline"} 
                  size={24} 
                  color={isPresent ? Colors.light.success : Colors.light.textSecondary} 
                />
              </View>
            </Pressable>
          );
        })}
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
    paddingBottom: 14,
    backgroundColor: Colors.light.surface,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  content: { padding: 20 },
  eventCard: { 
    backgroundColor: Colors.light.surface, 
    padding: 20, 
    borderRadius: 16, 
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  eventTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 8 },
  eventInfo: { flexDirection: "row", alignItems: "center", gap: 6 },
  eventDate: { fontSize: 14, color: Colors.light.textSecondary },
  sectionTitle: { 
    fontSize: 13, 
    fontFamily: "Inter_600SemiBold", 
    color: Colors.light.textSecondary, 
    marginBottom: 12, 
    textTransform: "uppercase",
    letterSpacing: 1
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  memberRowActive: { 
    borderColor: Colors.light.success + '40', 
    backgroundColor: Colors.light.success + '05' 
  },
  avatar: { width: 44, height: 44, borderRadius: 15, justifyContent: "center", alignItems: "center", marginRight: 12 },
  avatarText: { color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  memberRole: { fontSize: 12, color: Colors.light.textSecondary },
  statusIndicator: { paddingLeft: 10 },
  emptyText: { fontSize: 16, color: Colors.light.textSecondary, marginBottom: 10 },
  backLink: { color: Colors.light.tint, fontSize: 16, fontWeight: '600' },
});
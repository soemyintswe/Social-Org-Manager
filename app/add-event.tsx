import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";

export default function AddEventScreen() {
  const insets = useSafeAreaInsets();
  const { addEvent } = useData();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const canSave = title.trim().length > 0 && date.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date.trim())) {
      Alert.alert("Invalid Date", "Please enter date in YYYY-MM-DD format");
      return;
    }

    setSaving(true);
    try {
      await addEvent({
        title: title.trim(),
        description: description.trim(),
        date: date.trim(),
        time: time.trim(),
        location: location.trim(),
        attendeeIds: [],
        createdAt: new Date().toISOString(),
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert("Error", "Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 + webTopInset }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Ionicons name="close" size={26} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>New Event</Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSave || saving}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.saveBtn, (!canSave || saving) && { opacity: 0.4 }]}>Save</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Annual General Meeting"
          placeholderTextColor={Colors.light.textSecondary}
          autoFocus
        />

        <Text style={styles.label}>Date * (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="2026-03-15"
          placeholderTextColor={Colors.light.textSecondary}
        />

        <Text style={styles.label}>Time</Text>
        <TextInput
          style={styles.input}
          value={time}
          onChangeText={setTime}
          placeholder="2:00 PM"
          placeholderTextColor={Colors.light.textSecondary}
        />

        <Text style={styles.label}>Location</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="Community Center"
          placeholderTextColor={Colors.light.textSecondary}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Event details..."
          placeholderTextColor={Colors.light.textSecondary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  saveBtn: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.tint,
  },
  form: {
    padding: 20,
    paddingBottom: 60,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
    marginBottom: 6,
    marginTop: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
});

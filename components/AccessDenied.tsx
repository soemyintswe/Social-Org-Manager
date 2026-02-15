import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

export default function AccessDenied({
  title = "လုပ်ဆောင်ခွင့်မရှိပါ",
  message = "သင့် User Level ဖြင့် ဤစာမျက်နှာကို အသုံးပြုခွင့်မရှိပါ။",
  showBack = true,
  showHome = true,
}: {
  title?: string;
  message?: string;
  showBack?: boolean;
  showHome?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed-outline" size={30} color={Colors.light.tint} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          {showBack ? (
            <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => router.back()}>
              <Text style={styles.secondaryText}>နောက်သို့</Text>
            </Pressable>
          ) : null}
          {showHome ? (
            <Pressable style={[styles.button, styles.primaryButton]} onPress={() => router.replace("/")}>
              <Text style={styles.primaryText}>Dashboard</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 20,
  },
  card: {
    marginTop: 36,
    borderRadius: 16,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 20,
    alignItems: "center",
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.light.tint + "18",
  },
  title: {
    marginTop: 12,
    fontSize: 17,
    color: Colors.light.text,
    fontFamily: "Inter_700Bold",
  },
  message: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: Colors.light.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  actions: {
    marginTop: 16,
    width: "100%",
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: Colors.light.tint,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  primaryText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  secondaryText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});

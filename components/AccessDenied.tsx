import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface AccessDeniedProps {
  title?: string;
  message?: string;
  onGoBack?: () => void;
  showBack?: boolean;
}

export default function AccessDenied({ title, message, onGoBack, showBack = true }: AccessDeniedProps) {
  const router = useRouter();

  const handleGoBack = () => {
    if (onGoBack) {
      onGoBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="lock-closed" size={48} color="#EF4444" />
      </View>
      <Text style={styles.title}>{title || "Access Denied"}</Text>
      <Text style={styles.message}>
        {message || "သင့်တွင် ဤစာမျက်နှာကို ကြည့်ရှုခွင့်မရှိပါ။"}
      </Text>
      {showBack && (
        <TouchableOpacity style={styles.button} onPress={handleGoBack}>
          <Text style={styles.buttonText}>နောက်သို့ပြန်သွားရန်</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: "center", justifyContent: "center",
    padding: 24, backgroundColor: "#F9FAFB",
  },
  iconContainer: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: "#FEE2E2",
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: "bold", color: "#1F2937", marginBottom: 8 },
  message: { fontSize: 16, color: "#6B7280", textAlign: "center", marginBottom: 24 },
  button: {
    paddingVertical: 12, paddingHorizontal: 24,
    backgroundColor: "#3B82F6", borderRadius: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
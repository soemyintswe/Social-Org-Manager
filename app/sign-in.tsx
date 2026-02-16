import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/AuthContext";
import { ORG_POSITION_LABELS } from "../lib/types";

export default function SignInScreen() {
  const { availableUsers, signIn } = useAuth();
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSignIn = async (userId: string) => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const success = await signIn(userId);
      if (success) {
        // Navigate to root (which redirects to tabs)
        router.replace("/");
      } else {
        Alert.alert("အကောင့်ဝင်မရပါ", "အသုံးပြုသူအကောင့်ကို ရှာမတွေ့ပါ သို့မဟုတ် ပိတ်ထားပါသည်။");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "အကောင့်ဝင်ရာတွင် ပြဿနာရှိနေပါသည်။");
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Ionicons name="people" size={40} color="#fff" />
        </View>
        <Text style={styles.appName}>Social Org Manager</Text>
        <Text style={styles.title}>အကောင့်ဝင်ရန် ရွေးချယ်ပါ</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {availableUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.emptyText}>အသုံးပြုသူများ ရှာဖွေနေပါသည်...</Text>
          </View>
        ) : (
          availableUsers.map((user) => (
            <TouchableOpacity
              key={user.id}
              style={styles.userCard}
              onPress={() => handleSignIn(user.id)}
              disabled={isSigningIn}
            >
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: user.systemRole === "admin" ? "#1F2937" : "#3B82F6" },
                ]}
              >
                <Ionicons
                  name={user.systemRole === "admin" ? "settings" : "person"}
                  size={20}
                  color="#fff"
                />
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.displayName}>{user.displayName}</Text>
                <Text style={styles.roleText}>
                  {user.systemRole === "admin"
                    ? "System Admin"
                    : ORG_POSITION_LABELS[user.orgPosition || "member"] || user.orgPosition}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
      
      <View style={styles.footer}>
        <Text style={styles.footerText}>Expo Go Version</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  header: {
    backgroundColor: "#3B82F6",
    padding: 24,
    paddingTop: 40,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logoContainer: {
    width: 64, height: 64, backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  appName: { fontSize: 18, color: "#EBF8FF", fontWeight: "600", marginBottom: 4 },
  title: { fontSize: 24, fontWeight: "bold", color: "#fff" },
  scrollContent: { padding: 16, paddingBottom: 40 },
  emptyState: { padding: 40, alignItems: "center" },
  emptyText: { marginTop: 12, color: "#6B7280" },
  userCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    padding: 16, borderRadius: 16, marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24, alignItems: "center",
    justifyContent: "center", marginRight: 16,
  },
  userInfo: { flex: 1 },
  displayName: { fontSize: 16, fontWeight: "600", color: "#111827", marginBottom: 2 },
  roleText: { fontSize: 14, color: "#6B7280" },
  footer: { padding: 16, alignItems: "center" },
  footerText: { color: "#9CA3AF", fontSize: 12 }
});
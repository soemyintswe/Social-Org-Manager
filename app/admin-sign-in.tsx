import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/AuthContext";
import { getCurrentAppVersion } from "../lib/app-update";

export default function AdminSignInScreen() {
  const { attemptAdminLogin, loading } = useAuth();
  const router = useRouter();
  const appVersion = getCurrentAppVersion();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordValid, setPasswordValid] = useState<boolean | null>(null);

  const canSubmit = useMemo(() => {
    return !loading && !signingIn && password.trim().length > 0;
  }, [loading, signingIn, password]);

  const handleAdminSignIn = async () => {
    if (!canSubmit) return;
    setSigningIn(true);
    try {
      const result = await attemptAdminLogin("admin", password.trim());
      if (result.ok) {
        setPasswordTouched(false);
        setPasswordValid(true);
        router.replace("/system" as any);
        return;
      }
      setPasswordTouched(true);
      setPasswordValid(false);
      if (result.reason === "invalid_username") {
        Alert.alert("မအောင်မြင်ပါ", "Admin username မမှန်ကန်ပါ။");
      } else {
        Alert.alert("Password မမှန်ကန်ပါ", "Admin Password ကိုပြန်စစ်ပြီး ထပ်မံကြိုးစားပါ။");
      }
    } catch {
      Alert.alert("Error", "Admin login ပြုလုပ်ရာတွင် ပြဿနာရှိနေပါသည်။");
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={["#0F766E", "#115E59"]} style={styles.heroCard}>
            <View style={styles.logoContainer}>
              <Image source={require("../assets/images/icon.png")} style={styles.logoImage} />
            </View>
            <Text style={styles.appName}>Social Org Manager</Text>
            <Text style={styles.title}>System Admin Login</Text>
            <Text style={styles.subtitle}>Admin account ဖြင့် system management အတွက်သာ ဝင်ရောက်ပါ။</Text>
            <Text style={styles.versionText}>Version {appVersion}</Text>
          </LinearGradient>

          <View style={styles.formCard}>
            <Text style={styles.label}>Username</Text>
            <TextInput value="admin" editable={false} style={[styles.input, styles.readonlyInput]} />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setPasswordTouched(false);
                  setPasswordValid(null);
                }}
                placeholder="Admin Password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={() => {
                  void handleAdminSignIn();
                }}
                style={styles.passwordInput}
              />
              <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            {passwordTouched && passwordValid === false ? (
              <Text style={styles.errorText}>Password မမှန်ကန်ပါ။</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.submitButton, !canSubmit && styles.submitDisabled]}
              onPress={handleAdminSignIn}
              disabled={!canSubmit}
            >
              <Text style={styles.submitText}>{signingIn ? "Logging in..." : "Admin Login"}</Text>
            </TouchableOpacity>

            <Pressable style={styles.backBtn} onPress={() => router.replace("/sign-in" as any)}>
              <Text style={styles.backBtnText}>Org User Login သို့ ပြန်သွားမည်</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ECFDF5" },
  scrollContent: { flexGrow: 1, padding: 18, justifyContent: "center" },
  heroCard: { borderRadius: 20, padding: 22, marginBottom: 16 },
  logoContainer: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    overflow: "hidden",
  },
  logoImage: { width: 48, height: 48, borderRadius: 24 },
  appName: { color: "rgba(255,255,255,0.9)", fontSize: 14, marginBottom: 4 },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 19 },
  versionText: { color: "rgba(255,255,255,0.95)", fontSize: 12, marginTop: 10, fontWeight: "600" },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  label: { fontSize: 13, color: "#334155", fontWeight: "600", marginBottom: 8, marginTop: 6 },
  input: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0F172A",
  },
  readonlyInput: { color: "#475569" },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    overflow: "hidden",
  },
  passwordInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A" },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  submitButton: {
    marginTop: 16,
    backgroundColor: "#0F766E",
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 13,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  errorText: { marginTop: 6, color: "#DC2626", fontSize: 12, fontWeight: "600" },
  backBtn: { marginTop: 10, alignItems: "center" },
  backBtnText: { color: "#0369A1", fontSize: 13, fontWeight: "700" },
});


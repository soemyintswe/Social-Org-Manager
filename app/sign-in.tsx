import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/AuthContext";

export default function SignInScreen() {
  const { attemptLogin, checkUsername, getLoginLockInfo, loading } = useAuth();
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameValid, setUsernameValid] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordValid, setPasswordValid] = useState<boolean | null>(null);
  const [lockRemainingMs, setLockRemainingMs] = useState(0);
  const passwordInputRef = useRef<TextInput>(null);

  const canSubmit = useMemo(() => {
    return !loading && !isSigningIn && lockRemainingMs <= 0 && username.trim().length > 0 && password.trim().length > 0;
  }, [loading, isSigningIn, lockRemainingMs, username, password]);

  const lockMessage = useMemo(() => {
    if (lockRemainingMs <= 0) return "";
    const totalMinutes = Math.ceil(lockRemainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours} နာရီ ${minutes} မိနစ်`;
    return `${minutes} မိနစ်`;
  }, [lockRemainingMs]);

  const validateUsername = async () => {
    const raw = username.trim();
    setUsernameTouched(true);
    if (!raw) {
      setUsernameValid(null);
      return false;
    }
    setCheckingUsername(true);
    try {
      const ok = await checkUsername(raw);
      setUsernameValid(ok);
      return ok;
    } finally {
      setCheckingUsername(false);
    }
  };

  useEffect(() => {
    let active = true;
    const refreshLock = async () => {
      const info = await getLoginLockInfo();
      if (!active) return;
      setLockRemainingMs(info.remainingMs);
    };
    void refreshLock();

    const timer = setInterval(() => {
      setLockRemainingMs((prev) => Math.max(0, prev - 1000));
    }, 1000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [getLoginLockInfo]);

  const handleSignIn = async () => {
    if (!canSubmit) return;
    const isUserValid = await validateUsername();
    if (!isUserValid) {
      setPasswordTouched(false);
      setPasswordValid(null);
      Alert.alert("Username မမှန်ကန်ပါ", "Member ID / ID### / Name / Phone / Email / Admin ကို မှန်ကန်စွာထည့်ပါ။");
      return;
    }
    setIsSigningIn(true);
    try {
      const result = await attemptLogin(username.trim(), password.trim());
      if (result.ok) {
        router.replace("/");
      } else if (result.reason === "locked") {
        const remaining = result.remainingMs || 0;
        setLockRemainingMs(remaining);
        Alert.alert("ယာယီပိတ်ထားပါသည်", `Login အကြိမ်ကြိမ်မှားနေသောကြောင့် ${Math.ceil(remaining / 60000)} မိနစ်ခန့် ထပ်မံကြိုးစားခွင့်ပိတ်ထားပါသည်။`);
      } else if (result.reason === "invalid_username") {
        setUsernameTouched(true);
        setUsernameValid(false);
        setPasswordTouched(false);
        setPasswordValid(null);
        Alert.alert("Username မမှန်ကန်ပါ", "User account ကိုမတွေ့ပါ။");
      } else {
        setPasswordTouched(true);
        setPasswordValid(false);
        Alert.alert("Password မမှန်ကန်ပါ", "Password ကိုပြန်စစ်ပြီး ထပ်မံကြိုးစားပါ။");
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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={["#0F766E", "#115E59"]} style={styles.heroCard}>
            <View style={styles.logoContainer}>
              <Ionicons name="shield-checkmark" size={28} color="#fff" />
            </View>
            <Text style={styles.appName}>Social Org Manager</Text>
            <Text style={styles.title}>User Login</Text>
            <Text style={styles.subtitle}>Member ID / Full Name / Phone / Email / ID### ဖြင့် ဝင်ရောက်နိုင်သည်</Text>
          </LinearGradient>

          <View style={styles.formCard}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              value={username}
              onChangeText={(value) => {
                setUsername(value);
                setUsernameTouched(false);
                setUsernameValid(null);
              }}
              placeholder="ဥပမာ - ID001 / ဦးစိုးမြင့်ဆွေ / စိုးမြင့်ဆွေ / 09xxxxxxxxx / mail@example.com / Admin"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              onBlur={() => {
                void validateUsername();
              }}
              style={styles.input}
            />
            {checkingUsername ? <Text style={styles.helperText}>Username စစ်ဆေးနေပါသည်...</Text> : null}
            {!checkingUsername && usernameTouched && usernameValid === false ? (
              <Text style={styles.errorText}>Username မမှန်ကန်ပါ။</Text>
            ) : null}
            {!checkingUsername && usernameTouched && usernameValid === true ? (
              <Text style={styles.successText}>Username မှန်ကန်ပါသည်။</Text>
            ) : null}

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                ref={passwordInputRef}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setPasswordTouched(false);
                  setPasswordValid(null);
                }}
                placeholder="Password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  void handleSignIn();
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
              onPress={handleSignIn}
              disabled={!canSubmit}
            >
              <Text style={styles.submitText}>{isSigningIn ? "Logging in..." : "Login"}</Text>
            </TouchableOpacity>
            {lockRemainingMs > 0 ? (
              <Text style={styles.lockText}>ယာယီပိတ်ထားပါသည်။ ထပ်မံကြိုးစားရန် ကျန်ချိန်: {lockMessage}</Text>
            ) : null}

            <View style={styles.hintCard}>
              <Text style={styles.hintTitle}>Default Credentials</Text>
              <Text style={styles.hintText}>Member ID: ရဆသ-001 ဆိုရင် Username = ID001, Password = 001</Text>
              <Text style={styles.hintText}>Name Login: ဦးစိုးမြင့်ဆွေ / စိုးမြင့်ဆွေ လည်းအသုံးပြုနိုင်သည်</Text>
              <Text style={styles.hintText}>Admin Account: Username = Admin, Password = Admin</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ECFDF5" },
  flex: { flex: 1 },
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
  },
  appName: { color: "rgba(255,255,255,0.9)", fontSize: 14, marginBottom: 4 },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 19 },
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
  helperText: { marginTop: 6, color: "#64748B", fontSize: 12 },
  errorText: { marginTop: 6, color: "#DC2626", fontSize: 12, fontWeight: "600" },
  successText: { marginTop: 6, color: "#059669", fontSize: 12, fontWeight: "600" },
  lockText: { marginTop: 10, color: "#B45309", fontSize: 12, fontWeight: "600" },
  hintCard: { marginTop: 16, borderRadius: 12, padding: 12, backgroundColor: "#F0FDFA", borderWidth: 1, borderColor: "#99F6E4" },
  hintTitle: { color: "#0F766E", fontWeight: "700", marginBottom: 6, fontSize: 13 },
  hintText: { color: "#115E59", fontSize: 12, lineHeight: 18 },
});

import React, { useEffect, useMemo, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../../constants/colors";
import { ensureChairAccountFromRegistry, getAccountSettings, saveAccountSettings } from "../../lib/storage-service";
import { persistOrgStorageContext } from "../../lib/org-storage";
import { prewarmOrgScopedRemoteConfig, setActiveOrgId } from "../../lib/remote-config";
import { verifyOrgRegistryCredentials } from "../../lib/org-registry";

export default function OrgConnectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [orgEmail, setOrgEmail] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [orgId, setOrgId] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const canSubmit = useMemo(() => {
    const hasId = orgId.trim().length > 0;
    const hasContact = orgEmail.trim().length > 0 || orgPhone.trim().length > 0;
    return hasId && hasContact;
  }, [orgEmail, orgId, orgPhone]);

  useEffect(() => {
    const paramOrgId = String(params?.orgId || "").trim();
    const paramEmail = String(params?.orgEmail || "").trim();
    const paramPhone = String(params?.orgPhone || "").trim();
    if (paramOrgId && !orgId.trim()) setOrgId(paramOrgId);
    if (paramEmail && !orgEmail.trim()) setOrgEmail(paramEmail);
    if (paramPhone && !orgPhone.trim()) setOrgPhone(paramPhone);
  }, [params?.orgEmail, params?.orgId, params?.orgPhone, orgEmail, orgId, orgPhone]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const settings = await getAccountSettings();
      const hasEmail = Boolean(String(settings.orgEmail || "").trim());
      const hasPhone = Boolean(String(settings.orgPhone || "").trim());
      const hasOrg = Boolean(String(settings.orgId || "").trim());
      const allowOverride =
        String(params?.orgConnect || "").trim() === "1" ||
        (Platform.OS === "web" &&
          (() => {
            try {
              const query = window.location?.search || "";
              if (query && new URLSearchParams(query).get("orgConnect") === "1") return true;
              return (
                window.sessionStorage?.getItem("@orghub_org_connect_override") === "1" ||
                window.localStorage?.getItem("@orghub_org_connect_override") === "1"
              );
            } catch {
              return false;
            }
          })());
      if (active && hasOrg && (hasEmail || hasPhone) && !allowOverride) {
        router.replace("/sign-in" as any);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [router, params]);

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setErrorMessage("");
    const email = orgEmail.trim();
    const phone = orgPhone.trim();
    const id = orgId.trim();

    if (!id) {
      const msg = "Org ID ကိုဖြည့်ပါ။";
      setErrorMessage(msg);
      Alert.alert("လိုအပ်ချက်", msg);
      return;
    }
    if (!email && !phone) {
      const msg = "Org Email သို့မဟုတ် Phone ကိုဖြည့်ပါ။";
      setErrorMessage(msg);
      Alert.alert("လိုအပ်ချက်", msg);
      return;
    }

    setSaving(true);
    const result = await verifyOrgRegistryCredentials({ orgId: id, orgEmail: email, orgPhone: phone });
    if (!result.ok || !result.entry) {
      let message = "Org Validation မအောင်မြင်ပါ။";
      switch (result.reason) {
        case "missing_org_credentials":
          message = "Org Email သို့မဟုတ် Phone ကိုဖြည့်ပါ။";
          break;
        case "org_not_registered":
          message = "Org ID ကို Registry တွင် မတွေ့ပါ။ Org ID ကို စစ်ဆေးပါ။";
          break;
        case "org_email_missing":
          message = "Registry တွင် Org Email မရှိပါ။ Phone ဖြင့်သာ လုပ်ဆောင်ပါ။";
          break;
        case "org_email_mismatch":
          message = "Org Email မကိုက်ညီပါ။";
          break;
        case "org_phone_missing":
          message = "Registry တွင် Org Phone မရှိပါ။ Org Admin ကိုဆက်သွယ်ပါ။";
          break;
        case "org_phone_mismatch":
          message = "Org Phone မကိုက်ညီပါ။";
          break;
        case "firestore_unavailable":
          message = "Registry ကို မချိတ်ဆက်နိုင်ပါ။ Internet ကိုစစ်ဆေးပါ။";
          break;
        default:
          message = "Org Validation မအောင်မြင်ပါ။ Org ID နှင့် Contact ကို စစ်ဆေးပါ။";
          break;
      }
      setErrorMessage(message);
      Alert.alert("Org Validation", message);
      setSaving(false);
      return;
    }

    if (result.license && !result.license.allowed) {
      const status = String(result.license.status || "").trim();
      const expiry = String(result.license.expiryDate || "").trim();
      const reason = String(result.license.reason || "").trim();
      const parts = [
        "License သက်တမ်းမရှိပါ။",
        status ? `Status: ${status}` : "",
        expiry ? `Expiry: ${expiry}` : "",
        reason ? `Reason: ${reason}` : "",
      ].filter(Boolean);
      const msg = parts.join("\n");
      setErrorMessage(msg);
      Alert.alert("License Blocked", msg);
      setSaving(false);
      return;
    }

    try {
      const entry = result.entry;
      const orgEmail = entry.org.email || email;
      const orgPhone = entry.org.phone || phone;

      await persistOrgStorageContext({ orgId: entry.orgId, orgEmail });
      setActiveOrgId(entry.orgId);
      prewarmOrgScopedRemoteConfig(entry.orgId);

      const chairSeed = await ensureChairAccountFromRegistry({
        chairName: entry.chair.name,
        chairEmail: entry.chair.email,
        chairPhone: entry.chair.phone,
        chairPassword: entry.chair.password,
      });
      if (!chairSeed.ok) {
        const msg = "Chair account ကို မတည်ဆောက်နိုင်သေးပါ။ System Admin ကိုဆက်သွယ်ပါ။";
        setErrorMessage(msg);
        Alert.alert("Chair Setup Error", msg);
        setSaving(false);
        return;
      }

      const current = await getAccountSettings();
      const nextSettings = {
        ...current,
        orgEmail,
        orgPhone,
        orgId: entry.orgId,
        orgName: entry.org.name || current.orgName,
        orgSetupAt: new Date().toISOString(),
        orgSetupCompleted: true,
      };
      if (entry.technical.managed_cloud_sync_endpoint) {
        nextSettings.cloudSyncEndpoint = entry.technical.managed_cloud_sync_endpoint;
        nextSettings.cloudSyncEnabled = true;
        nextSettings.cloudSyncProvider = "google_drive_apps_script";
      }
      await saveAccountSettings(nextSettings);
      Alert.alert("အောင်မြင်ပါသည်", "Org Registry မှအချက်အလက်များကိုရယူပြီးပါပြီ။");
      if (Platform.OS === "web" && typeof window !== "undefined") {
        try {
          window.sessionStorage?.setItem("@orghub_org_connect_override", "1");
          window.sessionStorage?.setItem("@orghub_last_connected_org_id", entry.orgId);
          window.localStorage?.setItem("@orghub_org_connect_override", "1");
          window.localStorage?.setItem("@orghub_last_connected_org_id", entry.orgId);
        } catch {}
        const nextUrl = `/sign-in?orgConnect=1&orgId=${encodeURIComponent(entry.orgId)}`;
        window.location.href = nextUrl;
      } else {
        router.replace("/sign-in" as any);
      }
    } catch (error) {
      const msg = "Org setup လုပ်ရာတွင် ပြဿနာရှိနေပါသည်။ နောက်ထပ်ကြိုးစားပါ။";
      setErrorMessage(msg);
      Alert.alert("အမှား", msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>Org Connect</Text>
            <Text style={styles.subtitle}>
              Org ID နှင့် Org Email/Phone ကိုသတ်မှတ်ပါ။ Registry မှ sync endpoint များကို အလိုအလျောက်ရယူပါမည်။
            </Text>

            <Text style={styles.label}>Organization ID (OrgID)</Text>
            <TextInput
              value={orgId}
              onChangeText={setOrgId}
              placeholder="ဥပမာ - ORG-001"
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
            />

            <Text style={styles.label}>Organization Email (Optional)</Text>
            <TextInput
              value={orgEmail}
              onChangeText={setOrgEmail}
              placeholder="ဥပမာ - org@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              style={styles.input}
            />

            <Text style={styles.label}>Organization Phone (Required if no Email)</Text>
            <TextInput
              value={orgPhone}
              onChangeText={setOrgPhone}
              placeholder="ဥပမာ - 09xxxxxxxxx"
              autoCapitalize="none"
              keyboardType="phone-pad"
              autoCorrect={false}
              style={styles.input}
            />

            <TouchableOpacity
              style={[styles.primaryButton, (!canSubmit || saving) && styles.disabledButton]}
              onPress={handleSubmit}
              disabled={!canSubmit || saving}
            >
              <Text style={styles.primaryButtonText}>{saving ? "Checking..." : "Verify & Continue"}</Text>
            </TouchableOpacity>
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7FAF9",
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#475569",
    marginBottom: 20,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: "#F8FAFC",
    color: "#0F172A",
  },
  primaryButton: {
    marginTop: 24,
    backgroundColor: Colors.light.tint,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  errorText: {
    marginTop: 12,
    color: "#B91C1C",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});

import React from "react";
import { StyleSheet, Text, View, Pressable, Alert, Platform, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import Colors from "../../constants/colors";
import { useData } from "../../lib/DataContext";
import { getAccountSettings } from "../../lib/storage-service";
import { useAuth } from "../../lib/AuthContext";
import { clearAllLocalDataKeepSystemConfig } from "../../lib/storage-service";
import { checkForAppUpdate, getCurrentAppVersion, getCurrentBuildNumber } from "../../lib/app-update";
import {
  buildOrgRegistryEntry,
  deleteOrgRegistryEntry,
  fetchOrgRegistryEntry,
  generateOrgChairPassword,
  listOrgRegistryEntries,
  upsertOrgRegistryEntry,
  type OrgRegistryEntry,
} from "../../lib/org-registry";
import { getAppVariantLabel, isCentralAdminVariant, isOrgClientVariant } from "../../lib/app-variant";

const RegistryRow = ({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) => (
  <View style={styles.registryRow}>
    <View style={styles.registryLabelCell}>
      <Text style={styles.registryLabelText}>
        {label}
        {required ? <Text style={styles.requiredStar}> *</Text> : null}
      </Text>
      {helper ? <Text style={styles.registryHelperText}>{helper}</Text> : null}
    </View>
    <View style={styles.registryInputCell}>{children}</View>
  </View>
);

export default function SystemScreen() {
  const insets = useSafeAreaInsets();
  const { refreshData } = useData() as any;
  const { can } = useAuth();
  const orgClientVariant = isOrgClientVariant();
  const centralAdminVariant = isCentralAdminVariant();
  const appVariantLabel = getAppVariantLabel();
  const canManageSystem = can("system.manage");
  const currentVersion = getCurrentAppVersion();
  const currentBuild = getCurrentBuildNumber();
  const [registryOrgId, setRegistryOrgId] = React.useState("");
  const [registryOrgName, setRegistryOrgName] = React.useState("");
  const [registryOrgLocation, setRegistryOrgLocation] = React.useState("");
  const [registryOrgEmail, setRegistryOrgEmail] = React.useState("");
  const [registryOrgPhone, setRegistryOrgPhone] = React.useState("");
  const [registryMemberCount, setRegistryMemberCount] = React.useState("");
  const [registryContactName, setRegistryContactName] = React.useState("");
  const [registryContactEmail, setRegistryContactEmail] = React.useState("");
  const [registryContactPhone, setRegistryContactPhone] = React.useState("");
  const [registryContactAddress, setRegistryContactAddress] = React.useState("");
  const [registrySyncEndpoint, setRegistrySyncEndpoint] = React.useState("");
  const [registrySyncApiKey, setRegistrySyncApiKey] = React.useState("");
  const [registrySyncAccountEmail, setRegistrySyncAccountEmail] = React.useState("");
  const [registrySyncFolderName, setRegistrySyncFolderName] = React.useState("");
  const [registryLicenseStatus, setRegistryLicenseStatus] = React.useState<"allow" | "deny">("allow");
  const [registryLicenseStartDate, setRegistryLicenseStartDate] = React.useState("");
  const [registryLicenseExpiry, setRegistryLicenseExpiry] = React.useState("");
  const [registryLicenseDenyExpiry, setRegistryLicenseDenyExpiry] = React.useState("");
  const [registryChairName, setRegistryChairName] = React.useState("");
  const [registryChairEmail, setRegistryChairEmail] = React.useState("");
  const [registryChairPhone, setRegistryChairPhone] = React.useState("");
  const [registryChairPassword, setRegistryChairPassword] = React.useState("");
  const [regenerateChairPassword, setRegenerateChairPassword] = React.useState(false);
  const [loadingRegistry, setLoadingRegistry] = React.useState(false);
  const [savingRegistry, setSavingRegistry] = React.useState(false);
  const [registryMessage, setRegistryMessage] = React.useState("");
  const [registryMessageTone, setRegistryMessageTone] = React.useState<"idle" | "info" | "error" | "success">("idle");
  const [registryProgressTick, setRegistryProgressTick] = React.useState(0);
  const [registryList, setRegistryList] = React.useState<OrgRegistryEntry[]>([]);
  const [registryListLoading, setRegistryListLoading] = React.useState(false);
  const [registryListError, setRegistryListError] = React.useState("");
  const [registryListInfo, setRegistryListInfo] = React.useState("");
  const [registrySelectedOrgId, setRegistrySelectedOrgId] = React.useState<string | null>(null);
  const [deletingRegistryOrgId, setDeletingRegistryOrgId] = React.useState<string | null>(null);
  const [showRegistryForm, setShowRegistryForm] = React.useState(false);
  const [registryDetailEntry, setRegistryDetailEntry] = React.useState<OrgRegistryEntry | null>(null);
  const registryListLoadingRef = React.useRef(false);
  const registryDefaultsAppliedRef = React.useRef(false);
  const [showStartDatePicker, setShowStartDatePicker] = React.useState(false);
  const [showExpiryDatePicker, setShowExpiryDatePicker] = React.useState(false);
  const [showDenyExpiryDatePicker, setShowDenyExpiryDatePicker] = React.useState(false);
  const systemInfo = {
    releaseDate: "2026-02-21",
    developer: "MR. SOE MYINT SWE",
    packageId: centralAdminVariant ? "com.soemyintswe.orghub.centraladmin" : "com.soemyintswe.orghub",
    copyright: "Copyright (c) 2026 Social Org Manager. All rights reserved.",
  };

  React.useEffect(() => {
    if (!orgClientVariant) return;
    router.replace("/" as any);
  }, [orgClientVariant]);

  const formatDateDdMmYyyy = (date: Date): string => {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  const formatDateForDisplay = (raw?: string | null): string => {
    const value = String(raw || "").trim();
    if (!value) return "";
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      return `${iso[3]}-${iso[2]}-${iso[1]}`;
    }
    const dmy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dmy) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return formatDateDdMmYyyy(parsed);
    return value;
  };

  const parseDateForPicker = (raw?: string | null): Date => {
    const value = String(raw || "").trim();
    if (!value) return new Date();
    const dmy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dmy) {
      return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    }
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const formatDateForInput = (raw?: string | null): string => {
    const value = String(raw || "").trim();
    if (!value) return "";
    const dmy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return value;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const dd = String(parsed.getDate()).padStart(2, "0");
      const mm = String(parsed.getMonth() + 1).padStart(2, "0");
      return `${parsed.getFullYear()}-${mm}-${dd}`;
    }
    return value;
  };

  const DateInput = ({
    value,
    onChangeText,
    placeholder,
    onOpenPicker,
  }: {
    value: string;
    onChangeText: (text: string) => void;
    placeholder: string;
    onOpenPicker?: () => void;
  }) => {
    if (Platform.OS === "web") {
      return (
        <TextInput
          style={styles.input}
          value={formatDateForInput(value)}
          onChangeText={(text) => onChangeText(formatDateForDisplay(text))}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={placeholder}
          // @ts-ignore - react-native-web passes this to the underlying input
          type="date"
        />
      );
    }
    return (
      <Pressable onPress={onOpenPicker}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={placeholder}
        />
      </Pressable>
    );
  };

  const populateRegistryForm = (entry: OrgRegistryEntry) => {
    setRegistryOrgId(entry.orgId || "");
    setRegistryOrgName(entry.org.name || "");
    setRegistryOrgLocation(entry.org.location || "");
    setRegistryOrgEmail(entry.org.email || "");
    setRegistryOrgPhone(entry.org.phone || "");
    setRegistryMemberCount(entry.org.memberCount ? String(entry.org.memberCount) : "");
    setRegistryContactName(entry.contact.name || "");
    setRegistryContactEmail(entry.contact.email || "");
    setRegistryContactPhone(entry.contact.phone || "");
    setRegistryContactAddress(entry.contact.address || "");
    setRegistrySyncEndpoint(entry.technical.managed_cloud_sync_endpoint || "");
    setRegistrySyncApiKey(entry.technical.managed_cloud_sync_api_key || "");
    setRegistrySyncAccountEmail(entry.technical.managed_cloud_sync_account_email || "");
    setRegistrySyncFolderName(entry.technical.managed_cloud_sync_folder_name || "");
    setRegistryLicenseStatus(entry.license.status === "deny" ? "deny" : "allow");
    setRegistryLicenseStartDate(formatDateForDisplay(entry.license.startDate || ""));
    setRegistryLicenseExpiry(formatDateForDisplay(entry.license.expiryDate || ""));
    setRegistryLicenseDenyExpiry(formatDateForDisplay(entry.license.denyExpiryDate || ""));
    setRegistryChairName(entry.chair.name || "");
    setRegistryChairEmail(entry.chair.email || "");
    setRegistryChairPhone(entry.chair.phone || "");
    setRegistryChairPassword(entry.chair.password || "");
    setRegenerateChairPassword(false);
  };

  React.useEffect(() => {
    let active = true;
    const loadDefaults = async () => {
      try {
        const settings = await getAccountSettings();
        if (!active) return;
        if (!registryDefaultsAppliedRef.current) {
          if (!registryOrgId.trim()) setRegistryOrgId("ORG000");
          if (!registryOrgName.trim() && settings.orgName) setRegistryOrgName(String(settings.orgName));
          if (!registryOrgEmail.trim() && settings.orgEmail) setRegistryOrgEmail(String(settings.orgEmail));
          if (!registryOrgPhone.trim() && settings.orgPhone) setRegistryOrgPhone(String(settings.orgPhone));
          registryDefaultsAppliedRef.current = true;
        }
      } catch {}
    };
    void loadDefaults();
    return () => {
      active = false;
    };
  }, [registryOrgEmail, registryOrgId, registryOrgName, registryOrgPhone]);

  React.useEffect(() => {
    if (!savingRegistry && !loadingRegistry) {
      setRegistryProgressTick(0);
      return;
    }
    const timer = setInterval(() => {
      setRegistryProgressTick((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [savingRegistry, loadingRegistry]);

  const registryMessageDisplay = React.useMemo(() => {
    if (!registryMessage) return "";
    if (!savingRegistry && !loadingRegistry) return registryMessage;
    const dots = ".".repeat((registryProgressTick % 3) + 1);
    return `${registryMessage}${dots}`;
  }, [loadingRegistry, registryMessage, registryProgressTick, savingRegistry]);

  const handleLoadRegistry = async () => {
    if (!registryOrgId.trim() || loadingRegistry) {
      const msg = "Org ID ကိုဖြည့်ပါ။";
      setRegistryStatus("error", msg);
      Alert.alert("လိုအပ်ချက်", msg);
      return;
    }
    try {
      setLoadingRegistry(true);
      setRegistryStatus("info", "Registry ကိုဖတ်နေပါသည်...");
      const result = await fetchOrgRegistryEntry(registryOrgId.trim());
      if (!result.ok || !result.entry) {
        const msg =
          result.reason === "firebase_web_not_configured"
            ? "Firebase Web Config မရှိပါ။ .env မှာ EXPO_PUBLIC_FIREBASE_CONFIG_JSON သို့မဟုတ် EXPO_PUBLIC_FIREBASE_API_KEY/PROJECT_ID/APP_ID ထည့်ပါ။"
            : result.reason === "firestore_unavailable"
              ? "Firestore မချိတ်ဆက်နိုင်ပါ။ Web build ဖြစ်နိုင်ပါတယ်။"
              : "Org ID ကို Registry တွင် မတွေ့ပါ။";
        setRegistryStatus("error", msg);
        Alert.alert("Registry", msg);
        return;
      }
      populateRegistryForm(result.entry);
      setRegistrySelectedOrgId(result.entry.orgId);
      setShowRegistryForm(true);
      setRegistryStatus("success", "Org Registry အချက်အလက်ကို ဖတ်ယူပြီးပါပြီ။");
      Alert.alert("Registry", "Org Registry အချက်အလက်ကို ဖတ်ယူပြီးပါပြီ။");
    } catch (error) {
      const msg = "Org Registry ကိုဖတ်ရာတွင် အမှားဖြစ်နေပါသည်။";
      setRegistryStatus("error", msg);
      Alert.alert("Registry", msg);
    } finally {
      setLoadingRegistry(false);
    }
  };

  const deliverChairPassword = async (
    email: string,
    phone: string,
    messageBody: string
  ): Promise<"email" | "sms" | "both" | "none"> => {
    let emailSent = false;
    let smsSent = false;

    if (email) {
      try {
        await Linking.openURL(
          `mailto:${email}?subject=${encodeURIComponent("Org Registry Credentials")}&body=${encodeURIComponent(messageBody)}`
        );
        emailSent = true;
      } catch {}
    }

    if (phone) {
      let allowSms = true;
      if (emailSent) {
        if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
          allowSms = window.confirm("Email ပို့ပြီးပါပြီ။ SMS လည်း ပို့မလား?");
        } else {
          allowSms = await new Promise<boolean>((resolve) => {
            Alert.alert(
              "SMS ပို့မလား",
              "Email ပို့ပြီးပါပြီ။ SMS လည်း ပို့မလား?",
              [
                { text: "မပို့ပါ", style: "cancel", onPress: () => resolve(false) },
                { text: "ပို့မည်", onPress: () => resolve(true) },
              ]
            );
          });
        }
      }
      if (allowSms) {
        try {
          const separator = Platform.OS === "ios" ? "&" : "?";
          await Linking.openURL(`sms:${phone}${separator}body=${encodeURIComponent(messageBody)}`);
          smsSent = true;
        } catch {}
      }
    }

    if (emailSent && smsSent) return "both";
    if (emailSent) return "email";
    if (smsSent) return "sms";
    return "none";
  };

  const setRegistryStatus = (tone: "idle" | "info" | "error" | "success", message: string) => {
    setRegistryMessageTone(tone);
    setRegistryMessage(message);
  };

  const handleLoadRegistryList = React.useCallback(async () => {
    if (!canManageSystem || registryListLoadingRef.current) return;
    try {
      registryListLoadingRef.current = true;
      setRegistryListLoading(true);
      setRegistryListError("");
      setRegistryListInfo("");
      const result = await listOrgRegistryEntries();
      if (!result.ok || !result.entries) {
        setRegistryListError(result.reason || "registry_list_failed");
        return;
      }
      setRegistryList(result.entries);
      if (result.reason && result.reason.startsWith("cache_fallback")) {
        setRegistryListInfo("Firestore မရပါ။ Cache ထဲမှ data ကိုပြထားပါသည်။");
      }
    } catch (error: any) {
      setRegistryListError(String(error?.message || "registry_list_failed"));
    } finally {
      setRegistryListLoading(false);
      registryListLoadingRef.current = false;
    }
  }, [canManageSystem]);

  const handleOpenOrgConnect = (entry?: OrgRegistryEntry | null) => {
    const orgId = String(entry?.orgId || "").trim();
    const orgEmail = String(entry?.org?.email || "").trim();
    const orgPhone = String(entry?.org?.phone || "").trim();
    const params = new URLSearchParams();
    params.set("orgConnect", "1");
    if (orgId) params.set("orgId", orgId);
    if (orgEmail) params.set("orgEmail", orgEmail);
    if (orgPhone) params.set("orgPhone", orgPhone);
    const target = `/org-connect?${params.toString()}`;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        window.sessionStorage?.setItem("@orghub_org_connect_override", "1");
        window.localStorage?.setItem("@orghub_org_connect_override", "1");
        window.open(target, "_blank", "noopener,noreferrer");
        return;
      } catch {}
    }
    router.push(target as any);
  };

  React.useEffect(() => {
    if (!canManageSystem) return;
    if (registryList.length > 0) return;
    void handleLoadRegistryList();
  }, [canManageSystem, handleLoadRegistryList, registryList.length]);

  const handleDateChange = (setter: (value: string) => void, close: () => void) => {
    return (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS !== "ios") close();
      if (!selectedDate) return;
      setter(formatDateDdMmYyyy(selectedDate));
    };
  };

  const confirmDeleteRegistry = async (orgId: string): Promise<boolean> => {
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
      return window.confirm(`${orgId} ကို Registry မှ ဖျက်မည်လား?\n\nဒီအချက်အလက်ကို ပြန်ယူဖို့ Firestore history မရှိလျှင် မရနိုင်ပါ။`);
    }
    return await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Delete Org Registry",
        `${orgId} ကို Registry မှ ဖျက်မည်လား?\nဒီအချက်အလက်ကို ပြန်ယူဖို့ Firestore history မရှိလျှင် မရနိုင်ပါ။`,
        [
          { text: "မဖျက်ပါ", style: "cancel", onPress: () => resolve(false) },
          { text: "ဖျက်မည်", style: "destructive", onPress: () => resolve(true) },
        ]
      );
    });
  };

  const handleDeleteRegistry = async (entry?: OrgRegistryEntry | null) => {
    if (!canManageSystem || !entry || deletingRegistryOrgId) return;
    const orgId = String(entry.orgId || "").trim().toUpperCase();
    if (!orgId) return;

    const confirmed = await confirmDeleteRegistry(orgId);
    if (!confirmed) return;

    try {
      setDeletingRegistryOrgId(orgId);
      setRegistryStatus("info", `${orgId} ကို ဖျက်နေပါသည်...`);
      const result = await deleteOrgRegistryEntry(orgId);
      if (!result.ok) {
        const msg =
          result.reason === "firebase_web_not_configured"
            ? "Firebase Web Config မရှိပါ။"
            : result.reason === "firestore_unavailable"
              ? "Firestore မချိတ်ဆက်နိုင်ပါ။"
              : `ဖျက်ရာတွင် အမှားဖြစ်နေပါသည်။ ${result.reason || ""}`;
        setRegistryStatus("error", msg);
        Alert.alert("Registry", msg);
        return;
      }

      setRegistryList((prev) => prev.filter((item) => item.orgId !== orgId));
      if (registrySelectedOrgId === orgId) setRegistrySelectedOrgId(null);
      if (registryDetailEntry?.orgId === orgId) setRegistryDetailEntry(null);
      if (String(registryOrgId || "").trim().toUpperCase() === orgId) setShowRegistryForm(false);
      setRegistryStatus("success", `${orgId} ကို Registry မှ ဖျက်ပြီးပါပြီ။`);
      void handleLoadRegistryList();
    } catch {
      setRegistryStatus("error", "Registry ဖျက်ရာတွင် အမှားဖြစ်နေပါသည်။");
      Alert.alert("Registry", "Registry ဖျက်ရာတွင် အမှားဖြစ်နေပါသည်။");
    } finally {
      setDeletingRegistryOrgId(null);
    }
  };

  const handleSaveRegistry = async () => {
    if (!canManageSystem || savingRegistry) return;
    const orgId = registryOrgId.trim().toUpperCase();
    const orgName = registryOrgName.trim();
    const orgLocation = registryOrgLocation.trim();
    const orgEmail = registryOrgEmail.trim();
    const orgPhone = registryOrgPhone.trim();
    const memberCount = registryMemberCount.trim();
    const contactName = registryContactName.trim();
    const contactEmail = registryContactEmail.trim();
    const contactPhone = registryContactPhone.trim();
    const contactAddress = registryContactAddress.trim();
    const syncEndpoint = registrySyncEndpoint.trim();
    const syncApiKey = registrySyncApiKey.trim();
    const syncAccountEmail = registrySyncAccountEmail.trim();
    const syncFolderName = registrySyncFolderName.trim();
    const licenseStartDate = registryLicenseStartDate.trim();
    const licenseExpiry = registryLicenseExpiry.trim();
    const licenseDenyExpiry = registryLicenseDenyExpiry.trim();
    const chairName = registryChairName.trim();
    const chairEmail = registryChairEmail.trim();
    const chairPhone = registryChairPhone.trim();
    const previousOrgId = String(registrySelectedOrgId || "").trim().toUpperCase();
    const isRename = Boolean(previousOrgId && previousOrgId !== orgId);

    if (!orgId) {
      Alert.alert("လိုအပ်ချက်", "Org ID ကိုဖြည့်ပါ။");
      return;
    }
    if (!orgName) {
      Alert.alert("လိုအပ်ချက်", "Org Name ကိုဖြည့်ပါ။");
      return;
    }
    if (!orgPhone) {
      Alert.alert("လိုအပ်ချက်", "Org Phone ကိုဖြည့်ပါ။");
      return;
    }
    if (!contactName || !contactPhone) {
      Alert.alert("လိုအပ်ချက်", "Contact Person Name နှင့် Phone ကိုဖြည့်ပါ။");
      return;
    }
    if (!syncEndpoint) {
      const msg = "Managed Cloud Sync Endpoint ကိုဖြည့်ပါ။ (Google Script URL ဖြစ်ရမည်)";
      setRegistryStatus("error", msg);
      Alert.alert("လိုအပ်ချက်", msg);
      return;
    }
    if (syncEndpoint.toLowerCase().includes("managed_org_configs")) {
      const msg = "managed_org_configs ကို ဒီ field ထဲမထည့်ပါနှင့်။ Google Script URL ကိုသာ ထည့်ပါ။";
      setRegistryStatus("error", msg);
      Alert.alert("လိုအပ်ချက်", msg);
      return;
    }
    if (!/^https?:\/\//i.test(syncEndpoint)) {
      const msg = "Managed Cloud Sync Endpoint သည် https:// မှစတင်ရပါမည်။";
      setRegistryStatus("error", msg);
      Alert.alert("လိုအပ်ချက်", msg);
      return;
    }
    if (!syncApiKey) {
      const msg = "Managed Cloud Sync API Key ကိုဖြည့်ပါ။ (Apps Script API_KEY နဲ့တူရမည်)";
      setRegistryStatus("error", msg);
      Alert.alert("လိုအပ်ချက်", msg);
      return;
    }
    if (!licenseExpiry) {
      const msg = "License Expiry Date ကိုဖြည့်ပါ။";
      setRegistryStatus("error", msg);
      Alert.alert("လိုအပ်ချက်", msg);
      return;
    }
    if (!chairName) {
      Alert.alert("လိုအပ်ချက်", "Chair Name ကိုဖြည့်ပါ။");
      return;
    }
    if (!chairEmail && !chairPhone) {
      const msg = "Chair Email မရှိပါက Phone ကိုဖြည့်ပါ။";
      setRegistryStatus("error", msg);
      Alert.alert("လိုအပ်ချက်", msg);
      return;
    }
    if (isRename) {
      const confirmed = await (async () => {
        if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
          return window.confirm(`${previousOrgId} ကို ${orgId} သို့ ပြောင်းမည်လား?`);
        }
        return await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Org ID ပြောင်းမည်",
            `${previousOrgId} ကို ${orgId} သို့ ပြောင်းမည်လား?`,
            [
              { text: "မပြောင်းပါ", style: "cancel", onPress: () => resolve(false) },
              { text: "ပြောင်းမည်", onPress: () => resolve(true) },
            ]
          );
        });
      })();
      if (!confirmed) return;
    }

    try {
      setSavingRegistry(true);
      setRegistryStatus("info", "Registry သိမ်းနေပါသည်...");
      const password =
        regenerateChairPassword || !registryChairPassword.trim()
          ? generateOrgChairPassword()
          : registryChairPassword.trim();
      const entry = buildOrgRegistryEntry({
        orgId,
        orgName,
        orgLocation: orgLocation || undefined,
        orgEmail: orgEmail || undefined,
        orgPhone,
        memberCount: memberCount || undefined,
        contactName,
        contactEmail: contactEmail || undefined,
        contactPhone,
        contactAddress: contactAddress || undefined,
        managedCloudSyncEndpoint: syncEndpoint,
        managedCloudSyncApiKey: syncApiKey,
        managedCloudSyncAccountEmail: syncAccountEmail || undefined,
        managedCloudSyncFolderName: syncFolderName || undefined,
        managedCloudSyncEnabled: true,
        licenseStatus: registryLicenseStatus,
        licenseStartDate,
        licenseExpiry,
        licenseDenyExpiryDate: licenseDenyExpiry,
        chairName,
        chairEmail: chairEmail || undefined,
        chairPhone,
        chairPassword: password,
        chairPasswordUpdatedAt: new Date().toISOString(),
      });
      const result = await upsertOrgRegistryEntry(entry, {
        previousOrgId: isRename ? previousOrgId : undefined,
      });
      if (!result.ok || !result.entry) {
        const msg =
          result.reason === "firebase_web_not_configured"
            ? "Firebase Web Config မရှိပါ။ .env မှာ EXPO_PUBLIC_FIREBASE_CONFIG_JSON သို့မဟုတ် EXPO_PUBLIC_FIREBASE_API_KEY/PROJECT_ID/APP_ID ထည့်ပါ။"
            : result.reason === "firestore_unavailable"
              ? "Firestore မချိတ်ဆက်နိုင်ပါ။ Web build ဖြစ်နိုင်ပါတယ်။"
              : result.reason === "target_org_id_exists"
                ? `Target Org ID (${orgId}) ရှိပြီးသားဖြစ်နေပါသည်။ Org ID အသစ်တစ်ခု သုံးပါ။`
                : result.reason === "previous_org_id_missing"
                  ? `မူလ Org ID (${previousOrgId}) ကို မတွေ့ပါ။ Refresh List နှိပ်ပြီး ထပ်စမ်းပါ။`
              : `သိမ်းဆည်းရာတွင် အမှားဖြစ်နေပါသည်။ ${result.reason || ""}`;
        setRegistryStatus("error", msg);
        Alert.alert("Registry", msg);
        return;
      }
      populateRegistryForm(result.entry);
      setRegistrySelectedOrgId(result.entry.orgId);
      if (registryDetailEntry?.orgId === previousOrgId || registryDetailEntry?.orgId === result.entry.orgId) {
        setRegistryDetailEntry(result.entry);
      }
      const messageBody =
        `Org Registry Credentials\n` +
        `Org ID: ${result.entry.orgId}\n` +
        `Chair: ${result.entry.chair.name}\n` +
        `Temporary Password: ${result.entry.chair.password}\n` +
        `Please change password after first login.`;
      const delivery = await deliverChairPassword(
        result.entry.chair.email || "",
        result.entry.chair.phone || "",
        messageBody
      );
      const deliveryLabel =
        delivery === "both" ? "Email + SMS" : delivery === "email" ? "Email" : delivery === "sms" ? "SMS" : "Not sent";

      setRegistryStatus("success", "Registry သိမ်းပြီးပါပြီ။");
      setShowRegistryForm(false);
      void handleLoadRegistryList();
      Alert.alert(
        "Registry Saved",
        `Org ID: ${result.entry.orgId}\nChair Password: ${result.entry.chair.password}\nDelivery: ${deliveryLabel}`,
        [
          {
            text: "Copy",
            onPress: () => {
              void Clipboard.setStringAsync(messageBody);
            },
          },
          { text: "OK", style: "cancel" },
        ]
      );
    } catch (error) {
      Alert.alert("Registry", "Registry သိမ်းဆည်းရာတွင် အမှားဖြစ်နေပါသည်။");
    } finally {
      setSavingRegistry(false);
      setRegenerateChairPassword(false);
    }
  };

  const handleSystemReset = () => {
    if (Platform.OS === "web") {
      if (window.confirm("System Reset သတိပေးချက်\n\nဤလုပ်ဆောင်ချက်သည် အသင်းဝင်များ၊ ငွေစာရင်းများ၊ မှတ်တမ်းများ အားလုံးကို အပြီးတိုင် ဖျက်ဆီးပါမည်။ ပြန်ယူ၍ မရနိုင်ပါ။ ဆက်လုပ်မည်လား။")) {
        if (window.confirm("နောက်ဆုံးအဆင့် အတည်ပြုခြင်း\n\nတကယ်ဖျက်မည်မှာ သေချာပါသလား။")) {
          clearAllLocalDataKeepSystemConfig().then(async () => {
            window.alert("အောင်မြင်ပါသည်\nSystem Reset ပြုလုပ်ပြီးပါပြီ။");
            window.location.href = "/";
          });
        }
      }
      return;
    }

    Alert.alert(
      "System Reset သတိပေးချက်",
      "ဤလုပ်ဆောင်ချက်သည် အသင်းဝင်များ၊ ငွေစာရင်းများ၊ မှတ်တမ်းများ အားလုံးကို အပြီးတိုင် ဖျက်ဆီးပါမည်။ ပြန်ယူ၍ မရနိုင်ပါ။ ဆက်လုပ်မည်လား။",
      [
        { text: "မဖျက်ပါ", style: "cancel" },
        {
          text: "အတည်ပြုသည်",
          style: "destructive",
          onPress: () => {
            Alert.alert("နောက်ဆုံးအဆင့် အတည်ပြုခြင်း", "တကယ်ဖျက်မည်မှာ သေချာပါသလား။", [
              { text: "မဖျက်ပါ", style: "cancel" },
              {
                text: "ဖျက်မည်",
                style: "destructive",
                onPress: async () => {
                  await clearAllLocalDataKeepSystemConfig();
                  if (refreshData) await refreshData();
                  setTimeout(() => {
                    Alert.alert("အောင်မြင်ပါသည်", "System Reset ပြုလုပ်ပြီးပါပြီ။");
                  }, 100);
                },
              },
            ]);
          },
        },
      ]
    );
  };

  const handleCheckForUpdate = async () => {
    const info = await checkForAppUpdate();
    if (!info.ok) {
      Alert.alert("Update Check", `Update စစ်ဆေးရာတွင် မအောင်မြင်ပါ။\nReason: ${info.reason || "unknown"}`);
      return;
    }
    const latestBuild = String(info.latestBuildNumber || "-");
    if (!info.hasUpdate) {
      Alert.alert(
        "Update Check",
        `အသစ်မရှိသေးပါ။\nCurrent Version: ${currentVersion} (${currentBuild || "-"})\nLatest: ${info.latestVersion || "-"} (${latestBuild})`
      );
      return;
    }
    Alert.alert(
      "Update Available",
      `Current: ${currentVersion} (${currentBuild || "-"})\nLatest: ${info.latestVersion} (${latestBuild})\n\n${info.notes || ""}`,
      [
        { text: "Later", style: "cancel" },
        {
          text: "Update Now",
          onPress: () => {
            if (info.downloadUrl) {
              void Linking.openURL(info.downloadUrl);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 20 }]}
      contentContainerStyle={styles.content}
    >
      {orgClientVariant ? (
        <View style={{ minHeight: 320, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }}>
          <ActivityIndicator size="large" color={Colors.light.tint} />
          <Text style={[styles.title, { marginTop: 16, textAlign: "center" }]}>Org Client Build</Text>
          <Text style={[styles.subtitle, { textAlign: "center", marginBottom: 0 }]}>
            System Management ကို org-client build တွင်ပိတ်ထားပါသည်။
          </Text>
        </View>
      ) : (
        <>
      <Text style={styles.title}>{centralAdminVariant ? "Central Admin Management" : "System Management"}</Text>
      <Text style={styles.subtitle}>
        {centralAdminVariant ? `Manage central registry and system settings (${appVariantLabel})` : "Manage your data and settings"}
      </Text>

      {canManageSystem ? (
        <View style={styles.menuContainer}>
          <View style={styles.bootstrapCard}>
            <Text style={styles.bootstrapTitle}>Org Registry (Central)</Text>
            <Text style={styles.bootstrapDesc}>
              Central Registry တွင် Org အချက်အလက်များကို သိမ်းဆည်းပြီး OrgID ဖြင့် App ချိတ်ဆက်နိုင်ပါသည်။
            </Text>
            <View style={styles.bootstrapForm}>
              <View style={styles.registryListCard}>
                <View style={styles.registryListHeader}>
                  <Text style={styles.registryListTitle}>Org Registry List</Text>
                  <View style={styles.registryListHeaderActions}>
                    <Pressable style={styles.registryListButton} onPress={handleLoadRegistryList} disabled={registryListLoading}>
                      <Text style={styles.registryListButtonText}>
                        {registryListLoading ? "Loading..." : "Refresh List"}
                      </Text>
                    </Pressable>
                    <Pressable style={styles.registryListButton} onPress={() => handleOpenOrgConnect()}>
                      <Text style={styles.registryListButtonText}>Org Connect</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.registryListButton, styles.registryListAddButton]}
                      onPress={() => {
                        setShowRegistryForm(true);
                        setRegistrySelectedOrgId(null);
                        setRegistryStatus("idle", "");
                        setRegistryOrgId("");
                        setRegistryOrgName("");
                        setRegistryOrgLocation("");
                        setRegistryOrgEmail("");
                        setRegistryOrgPhone("");
                        setRegistryMemberCount("");
                        setRegistryContactName("");
                        setRegistryContactEmail("");
                        setRegistryContactPhone("");
                        setRegistryContactAddress("");
                        setRegistrySyncEndpoint("");
                        setRegistrySyncApiKey("");
                        setRegistrySyncAccountEmail("");
                        setRegistrySyncFolderName("");
                        setRegistryLicenseStatus("allow");
                        setRegistryLicenseStartDate("");
                        setRegistryLicenseExpiry("");
                        setRegistryLicenseDenyExpiry("");
                        setRegistryChairName("");
                        setRegistryChairEmail("");
                        setRegistryChairPhone("");
                        setRegistryChairPassword("");
                        setRegenerateChairPassword(false);
                      }}
                    >
                      <Text style={styles.registryListButtonText}>Add New Org</Text>
                    </Pressable>
                  </View>
                </View>
                {registryListError ? (
                  <Text style={styles.registryListError}>
                    {registryListError === "firestore_unavailable"
                      ? "Firestore မချိတ်ဆက်နိုင်ပါ။"
                      : registryListError}
                  </Text>
                ) : null}
                {registryListInfo ? (
                  <Text style={styles.registryListInfo}>{registryListInfo}</Text>
                ) : null}
                <View style={styles.registryListTable}>
                  <View style={[styles.registryListRow, styles.registryListHeaderRow]}>
                    <Text style={[styles.registryListCell, styles.registryListColId]}>Org ID</Text>
                    <Text style={[styles.registryListCell, styles.registryListColName]}>Org Name</Text>
                    <Text style={[styles.registryListCell, styles.registryListColPhone]}>Phone</Text>
                    <Text style={[styles.registryListCell, styles.registryListColStatus]}>Status</Text>
                    <Text style={[styles.registryListCell, styles.registryListColExpiry]}>Expiry</Text>
                    <Text style={[styles.registryListCell, styles.registryListColAction]}>Action</Text>
                  </View>
                  {registryListLoading ? (
                    <View style={styles.registryListLoadingRow}>
                      <ActivityIndicator size="small" color={Colors.light.tint} />
                      <Text style={styles.registryListLoadingText}>Loading registry list...</Text>
                    </View>
                  ) : null}
                  {!registryListLoading && registryList.length === 0 ? (
                    <Text style={styles.registryListEmpty}>Registry ထဲမှာ Org မတွေ့ပါ။</Text>
                  ) : null}
                  {registryList.map((entry) => (
                    <View
                      key={entry.orgId}
                      style={[
                        styles.registryListRow,
                        registrySelectedOrgId === entry.orgId && styles.registryListRowActive,
                      ]}
                    >
                      <Text style={[styles.registryListCell, styles.registryListColId]}>{entry.orgId}</Text>
                      <Text style={[styles.registryListCell, styles.registryListColName]}>{entry.org.name}</Text>
                      <Text style={[styles.registryListCell, styles.registryListColPhone]}>{entry.org.phone}</Text>
                      <Text style={[styles.registryListCell, styles.registryListColStatus]}>
                        {entry.license.status === "deny" ? "Deny" : "Allow"}
                      </Text>
                      <Text style={[styles.registryListCell, styles.registryListColExpiry]}>
                        {formatDateForDisplay(entry.license.expiryDate || "") || "-"}
                      </Text>
                      <View style={[styles.registryListCell, styles.registryListColAction]}>
                        <View style={styles.registryListActionRow}>
                        <Pressable
                          style={styles.registryListDetailButton}
                          onPress={() => {
                            setRegistryDetailEntry(entry);
                            setRegistrySelectedOrgId(entry.orgId);
                            setShowRegistryForm(false);
                          }}
                        >
                          <Text style={styles.registryListDetailButtonText}>Detail</Text>
                        </Pressable>
                        <Pressable
                          style={styles.registryListConnectButton}
                          onPress={() => handleOpenOrgConnect(entry)}
                        >
                          <Text style={styles.registryListConnectButtonText}>Connect</Text>
                        </Pressable>
                        <Pressable
                          style={styles.registryListUseButton}
                          onPress={() => {
                            populateRegistryForm(entry);
                            setRegistrySelectedOrgId(entry.orgId);
                              setShowRegistryForm(true);
                              setRegistryStatus("success", `${entry.orgId} ကို လိုဒ်ပြီးပါပြီ။`);
                            }}
                          >
                            <Text style={styles.registryListUseButtonText}>Edit</Text>
                          </Pressable>
                        <Pressable
                          style={[
                            styles.registryListDeleteButton,
                            deletingRegistryOrgId === entry.orgId && styles.registryListDeleteButtonDisabled,
                          ]}
                          onPress={() => void handleDeleteRegistry(entry)}
                          disabled={Boolean(deletingRegistryOrgId)}
                        >
                          <Text style={styles.registryListDeleteButtonText}>
                            {deletingRegistryOrgId === entry.orgId ? "Deleting..." : "Delete"}
                          </Text>
                        </Pressable>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {registryDetailEntry ? (
                <View style={styles.registryDetailCard}>
                  <View style={styles.registryDetailHeader}>
                    <Text style={styles.registryDetailTitle}>Org Detail</Text>
                    <Pressable style={styles.registryDetailClose} onPress={() => setRegistryDetailEntry(null)}>
                      <Text style={styles.registryDetailCloseText}>Close</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>Org ID:</Text> {registryDetailEntry.orgId}</Text>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>Org Name:</Text> {registryDetailEntry.org.name}</Text>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>Location:</Text> {registryDetailEntry.org.location || "-"}</Text>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>Email:</Text> {registryDetailEntry.org.email || "-"}</Text>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>Phone:</Text> {registryDetailEntry.org.phone}</Text>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>Member Count:</Text> {registryDetailEntry.org.memberCount ?? "-"}</Text>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>Contact:</Text> {registryDetailEntry.contact.name}</Text>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>Contact Phone:</Text> {registryDetailEntry.contact.phone}</Text>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>Endpoint:</Text> {registryDetailEntry.technical.managed_cloud_sync_endpoint || "-"}</Text>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>License:</Text> {registryDetailEntry.license.status}</Text>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>Start Date:</Text> {formatDateForDisplay(registryDetailEntry.license.startDate || "") || "-"}</Text>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>Expiry:</Text> {formatDateForDisplay(registryDetailEntry.license.expiryDate || "") || "-"}</Text>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>Deny Expiry:</Text> {formatDateForDisplay(registryDetailEntry.license.denyExpiryDate || "") || "-"}</Text>
                  <Text style={styles.registryDetailLine}><Text style={styles.registryDetailLabel}>Chair:</Text> {registryDetailEntry.chair.name}</Text>
                  <View style={styles.registryDetailActions}>
                    <Pressable
                      style={[
                        styles.registryDetailDeleteButton,
                        deletingRegistryOrgId === registryDetailEntry.orgId && styles.registryListDeleteButtonDisabled,
                      ]}
                      onPress={() => void handleDeleteRegistry(registryDetailEntry)}
                      disabled={Boolean(deletingRegistryOrgId)}
                    >
                      <Text style={styles.registryDetailDeleteButtonText}>
                        {deletingRegistryOrgId === registryDetailEntry.orgId ? "Deleting..." : "Delete This Org"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.registryDetailEditButton}
                      onPress={() => {
                        populateRegistryForm(registryDetailEntry);
                        setRegistrySelectedOrgId(registryDetailEntry.orgId);
                        setShowRegistryForm(true);
                      }}
                    >
                      <Text style={styles.registryDetailEditButtonText}>Edit This Org</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              {showRegistryForm ? (
                <>
                  {registryMessage ? (
                    <View
                      style={[
                        styles.registryNotice,
                        registryMessageTone === "error" && styles.registryNoticeError,
                        registryMessageTone === "success" && styles.registryNoticeSuccess,
                      ]}
                    >
                      {savingRegistry || loadingRegistry ? (
                        <ActivityIndicator size="small" color={Colors.light.tint} />
                      ) : null}
                      <Text style={styles.registryNoticeText}>{registryMessageDisplay}</Text>
                    </View>
                  ) : null}
                  <View style={styles.registryTable}>
                <RegistryRow label="Org ID" required>
                  <TextInput
                    style={styles.input}
                    value={registryOrgId}
                    onChangeText={setRegistryOrgId}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="ဥပမာ - ORG-001"
                  />
                </RegistryRow>
                <RegistryRow label="Registry Actions">
                  <View style={styles.registryActionRow}>
                    <Pressable
                      style={[styles.secondaryButton, styles.tableButton]}
                      onPress={() => void handleLoadRegistry()}
                      disabled={loadingRegistry}
                    >
                      <Text style={styles.secondaryButtonText}>{loadingRegistry ? "Loading..." : "Load Registry"}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.secondaryButton, styles.tableButton]}
                      onPress={() => setShowRegistryForm(false)}
                    >
                      <Text style={styles.secondaryButtonText}>Close Form</Text>
                    </Pressable>
                  </View>
                </RegistryRow>

                <View style={styles.registrySectionRow}>
                  <Text style={styles.registrySectionText}>Org Info</Text>
                </View>
                <RegistryRow label="Org Name" required>
                  <TextInput style={styles.input} value={registryOrgName} onChangeText={setRegistryOrgName} placeholder="Organization Name" />
                </RegistryRow>
                <RegistryRow label="Location">
                  <TextInput style={styles.input} value={registryOrgLocation} onChangeText={setRegistryOrgLocation} placeholder="City / Township" />
                </RegistryRow>
                <RegistryRow label="Org Email (Optional)">
                  <TextInput
                    style={styles.input}
                    value={registryOrgEmail}
                    onChangeText={setRegistryOrgEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    placeholder="org@example.com"
                  />
                </RegistryRow>
                <RegistryRow label="Org Phone" required>
                  <TextInput
                    style={styles.input}
                    value={registryOrgPhone}
                    onChangeText={setRegistryOrgPhone}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="phone-pad"
                    placeholder="09xxxxxxxxx"
                  />
                </RegistryRow>
                <RegistryRow label="Member Count">
                  <TextInput
                    style={styles.input}
                    value={registryMemberCount}
                    onChangeText={setRegistryMemberCount}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="number-pad"
                    placeholder="ဥပမာ - 120"
                  />
                </RegistryRow>

                <View style={styles.registrySectionRow}>
                  <Text style={styles.registrySectionText}>Contact Person</Text>
                </View>
                <RegistryRow label="Name" required>
                  <TextInput style={styles.input} value={registryContactName} onChangeText={setRegistryContactName} placeholder="Contact Name" />
                </RegistryRow>
                <RegistryRow label="Email (Optional)">
                  <TextInput
                    style={styles.input}
                    value={registryContactEmail}
                    onChangeText={setRegistryContactEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    placeholder="contact@example.com"
                  />
                </RegistryRow>
                <RegistryRow label="Phone" required>
                  <TextInput
                    style={styles.input}
                    value={registryContactPhone}
                    onChangeText={setRegistryContactPhone}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="phone-pad"
                    placeholder="09xxxxxxxxx"
                  />
                </RegistryRow>
                <RegistryRow label="Address">
                  <TextInput style={styles.input} value={registryContactAddress} onChangeText={setRegistryContactAddress} placeholder="Address" />
                </RegistryRow>

                <View style={styles.registrySectionRow}>
                  <Text style={styles.registrySectionText}>Technical</Text>
                </View>
                <RegistryRow
                  label="Managed Cloud Sync Endpoint"
                  required
                  helper="Org တစ်ခုချင်း Google Script URL ကို ထည့်ပါ။"
                >
                  <TextInput
                    style={styles.input}
                    value={registrySyncEndpoint}
                    onChangeText={setRegistrySyncEndpoint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="https://script.google.com/..."
                  />
                </RegistryRow>
                <RegistryRow
                  label="Managed Cloud Sync API Key"
                  required
                  helper="Apps Script API_KEY နဲ့တူရမည်"
                >
                  <TextInput
                    style={styles.input}
                    value={registrySyncApiKey}
                    onChangeText={setRegistrySyncApiKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="sms*>IWT801680"
                  />
                </RegistryRow>
                <RegistryRow label="Cloud Sync Account Email (Optional)" helper="Google Account Email">
                  <TextInput
                    style={styles.input}
                    value={registrySyncAccountEmail}
                    onChangeText={setRegistrySyncAccountEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="org@example.com"
                  />
                </RegistryRow>
                <RegistryRow label="Cloud Sync Folder Name (Optional)" helper="Default: OrgHub Sync">
                  <TextInput
                    style={styles.input}
                    value={registrySyncFolderName}
                    onChangeText={setRegistrySyncFolderName}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="OrgHub Sync"
                  />
                </RegistryRow>

                <View style={styles.registrySectionRow}>
                  <Text style={styles.registrySectionText}>Licensing</Text>
                </View>
                <RegistryRow label="Status" required>
                  <View style={styles.toggleRow}>
                    <Pressable
                      style={[
                        styles.toggleButton,
                        registryLicenseStatus === "allow" && styles.toggleButtonActive,
                      ]}
                      onPress={() => setRegistryLicenseStatus("allow")}
                    >
                      <Text style={styles.toggleButtonText}>Allow</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.toggleButton,
                        registryLicenseStatus === "deny" && styles.toggleButtonActive,
                      ]}
                      onPress={() => setRegistryLicenseStatus("deny")}
                    >
                      <Text style={styles.toggleButtonText}>Deny</Text>
                    </Pressable>
                  </View>
                </RegistryRow>
                <RegistryRow label="Start Date (DD-MM-YYYY)">
                  <DateInput
                    value={registryLicenseStartDate}
                    onChangeText={setRegistryLicenseStartDate}
                    placeholder="25-03-2026"
                    onOpenPicker={() => setShowStartDatePicker(true)}
                  />
                </RegistryRow>
                <RegistryRow label="Expiry Date (DD-MM-YYYY)" required>
                  <DateInput
                    value={registryLicenseExpiry}
                    onChangeText={setRegistryLicenseExpiry}
                    placeholder="24-03-2027"
                    onOpenPicker={() => setShowExpiryDatePicker(true)}
                  />
                </RegistryRow>
                <RegistryRow label="Deny Expiry Date (DD-MM-YYYY)">
                  <DateInput
                    value={registryLicenseDenyExpiry}
                    onChangeText={setRegistryLicenseDenyExpiry}
                    placeholder="30-06-2026"
                    onOpenPicker={() => setShowDenyExpiryDatePicker(true)}
                  />
                </RegistryRow>

                <View style={styles.registrySectionRow}>
                  <Text style={styles.registrySectionText}>Chair Account</Text>
                </View>
                <RegistryRow label="Name" required>
                  <TextInput style={styles.input} value={registryChairName} onChangeText={setRegistryChairName} placeholder="Chair Name" />
                </RegistryRow>
                <RegistryRow label="Email (Optional)">
                  <TextInput
                    style={styles.input}
                    value={registryChairEmail}
                    onChangeText={setRegistryChairEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    placeholder="chair@example.com"
                  />
                </RegistryRow>
                <RegistryRow label="Phone (Required if no Email)">
                  <TextInput
                    style={styles.input}
                    value={registryChairPhone}
                    onChangeText={setRegistryChairPhone}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="phone-pad"
                    placeholder="09xxxxxxxxx"
                  />
                </RegistryRow>
                <RegistryRow label="Auto-generated Password">
                  <TextInput style={styles.input} value={registryChairPassword} editable={false} placeholder="Auto-generate on save" />
                </RegistryRow>
                <RegistryRow label="Password Actions">
                  <Pressable
                    style={[styles.secondaryButton, styles.tableButton, regenerateChairPassword && styles.toggleButtonActive]}
                    onPress={() => setRegenerateChairPassword((prev) => !prev)}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {regenerateChairPassword ? "Will Regenerate Password" : "Regenerate Password"}
                    </Text>
                  </Pressable>
                </RegistryRow>

                <View style={styles.registryFooterRow}>
                  <Pressable style={styles.bootstrapButton} onPress={() => void handleSaveRegistry()} disabled={savingRegistry}>
                    <Text style={styles.bootstrapButtonText}>{savingRegistry ? "Saving..." : "Save Registry"}</Text>
                  </Pressable>
                </View>
              </View>
                </>
              ) : (
                <View style={styles.registryFormCollapsed}>
                  <Text style={styles.registryFormCollapsedText}>
                    Org အသစ်ထည့်ရန် "Add New Org" ကိုနှိပ်ပါ။
                  </Text>
                  <Text style={styles.registryFormCollapsedText}>
                    ရှိပြီးသား Org ကို ပြင်ရန် List မှ "Edit" ကိုနှိပ်ပါ။
                  </Text>
                </View>
              )}
            </View>
            {Platform.OS !== "web" && showStartDatePicker ? (
              <DateTimePicker
                value={parseDateForPicker(registryLicenseStartDate)}
                mode="date"
                display="default"
                onChange={handleDateChange(setRegistryLicenseStartDate, () => setShowStartDatePicker(false))}
              />
            ) : null}
            {Platform.OS !== "web" && showExpiryDatePicker ? (
              <DateTimePicker
                value={parseDateForPicker(registryLicenseExpiry)}
                mode="date"
                display="default"
                onChange={handleDateChange(setRegistryLicenseExpiry, () => setShowExpiryDatePicker(false))}
              />
            ) : null}
            {Platform.OS !== "web" && showDenyExpiryDatePicker ? (
              <DateTimePicker
                value={parseDateForPicker(registryLicenseDenyExpiry)}
                mode="date"
                display="default"
                onChange={handleDateChange(setRegistryLicenseDenyExpiry, () => setShowDenyExpiryDatePicker(false))}
              />
            ) : null}
          </View>

          <Pressable
            style={[styles.menuItem, { backgroundColor: Colors.light.tint }]}
            onPress={() => router.push("/data-management")}
          >
            <View style={styles.iconBox}>
              <Ionicons name="settings-outline" size={24} color="#fff" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuTitle}>Data & Backup</Text>
              <Text style={styles.menuDesc}>Import, Export and Restore Data</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
          </Pressable>

          <Pressable
            style={[styles.menuItem, { backgroundColor: "#2563EB" }]}
            onPress={() => void handleCheckForUpdate()}
          >
            <View style={styles.iconBox}>
              <Ionicons name="download-outline" size={24} color="#fff" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuTitle}>Check App Update</Text>
              <Text style={styles.menuDesc}>Latest version ရှိ/မရှိ စစ်ဆေးမည်</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
          </Pressable>

          <Pressable
            style={[styles.menuItem, { backgroundColor: "#EF4444" }]}
            onPress={handleSystemReset}
          >
            <View style={styles.iconBox}>
              <Ionicons name="trash-outline" size={24} color="#fff" />
            </View>
            <View style={styles.menuTextContainer}>
              <Text style={styles.menuTitle}>System Reset</Text>
              <Text style={styles.menuDesc}>Delete all data permanently</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
      ) : (
        <View style={styles.infoSection}>
          <Text style={styles.sectionHeader}>About</Text>
          <Text style={styles.guideText}>
            ဒီစာမျက်နှာတွင် App Version နှင့် System Information များကို ကြည့်ရှုနိုင်ပါသည်။
          </Text>
        </View>
      )}

      <View style={styles.infoSection}>
        <Text style={styles.sectionHeader}>System Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>App Version</Text>
          <Text style={styles.infoValue}>{currentVersion}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Build Number</Text>
          <Text style={styles.infoValue}>{currentBuild || "-"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Release Date</Text>
          <Text style={styles.infoValue}>{systemInfo.releaseDate}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Developer</Text>
          <Text style={styles.infoValue}>{systemInfo.developer}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Package ID</Text>
          <Text style={styles.infoValue}>{systemInfo.packageId}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Technology</Text>
          <Text style={styles.infoValue}>React Native / Expo / Gemini AI / OpenAI GPT-5 Codex</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Copyright</Text>
          <Text style={styles.infoValue}>{systemInfo.copyright}</Text>
        </View>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.sectionHeader}>အသုံးပြုနည်း လမ်းညွှန် (User Guide)</Text>
        <Text style={styles.guideText}>
          ၁။ <Text style={{ fontWeight: "bold" }}>Login ဝင်ခြင်း</Text>: Member ID (ID001), Full Name, Phone, Email သို့မဟုတ် Admin account ဖြင့် ဝင်ရောက်နိုင်ပါသည်။{"\n\n"}
          ၂။ <Text style={{ fontWeight: "bold" }}>Dashboard</Text>: အသင်းဝင်အရေအတွက်၊ ငွေစာရင်းအနှစ်ချုပ်၊ ချေးငွေလက်ကျန်၊ Event/Message unread count နှင့် အမြန်လုပ်ဆောင်ချက်များကို ကြည့်နိုင်ပါသည်။{"\n\n"}
          ၃။ <Text style={{ fontWeight: "bold" }}>အမြန်လုပ်ဆောင်ချက်များ</Text>: Sync Now, Messages, သတင်းပို့ရန်, ငွေတောင်းခံရန်, လစဉ်ကြေးပေးသွင်းရန်, လှူဒါန်းရန်, ချေးငွေဆပ်ရန်, အတိုးဆပ်ရန် စသည့်လုပ်ဆောင်ချက်များကို တိုက်ရိုက်နှိပ်ပြီး အသုံးပြုနိုင်ပါသည်။{"\n\n"}
          ၄။ <Text style={{ fontWeight: "bold" }}>Members</Text>: အသင်းဝင်စာရင်းကြည့်ရှုခြင်း၊ ကိုယ်ပိုင် profile ပြင်ဆင်ခြင်း၊ profile ပုံတင်ခြင်း၊ မိသားစုဝင်အချက်အလက် ဖြည့်ခြင်းများ ဆောင်ရွက်နိုင်ပါသည်။{"\n\n"}
          ၅။ <Text style={{ fontWeight: "bold" }}>Member Change Approval</Text>: MemberID/Position/Status/Status Date ကဲ့သို့ အရေးကြီးအချက်များကို proposal + approval workflow ဖြင့် ဥက္ကဌ/ဒုဥက္ကဌ အတည်ပြုမှ အသက်ဝင်ပါသည်။{"\n\n"}
          ၆။ <Text style={{ fontWeight: "bold" }}>Events (သတင်းပို့ရန်)</Text>: Events စာရင်းတွင် သတင်းအသစ်တင်ခြင်း၊ ဖတ်ရှုမှုအခြေအနေ၊ reaction, comment, reply နှင့် mention notification များကို စီမံနိုင်ပါသည်။{"\n\n"}
          ၇။ <Text style={{ fontWeight: "bold" }}>Messages</Text>: Member to Member chat သို့မဟုတ် Group chat တွင် message, image ပို့ခြင်းနှင့် unread badge ကြည့်ရှုနိုင်ပါသည်။{"\n\n"}
          ၈။ <Text style={{ fontWeight: "bold" }}>Finance</Text>: ရငွေ/သုံးငွေ/လွှဲငွေ စာရင်းသွင်းခြင်း၊ receipt/remark ဖြည့်ခြင်း၊ payment request workflow ဖြင့် ဘဏ္ဍာရေးမှူးထံ စစ်ဆေးအတည်ပြုတင်သွင်းနိုင်ပါသည်။{"\n\n"}
          ၉။ <Text style={{ fontWeight: "bold" }}>Loans</Text>: ချေးငွေထုတ်ပေးခြင်း၊ ပြန်ဆပ်ငွေတင်ခြင်း၊ အတိုး/ကျန်ငွေကို member အလိုက်စစ်ဆေးနိုင်ပါသည်။{"\n\n"}
          ၁၀။ <Text style={{ fontWeight: "bold" }}>Reports</Text>: လအလိုက်၊ နှစ်အလိုက်၊ category အလိုက် ငွေစာရင်းရှင်းတမ်းများနှင့် audit/report export များကို ပြုလုပ်နိုင်ပါသည်။{"\n\n"}
          ၁၁။ <Text style={{ fontWeight: "bold" }}>Sync (LAN + Cloud)</Text>: Sync Now နှိပ်လျှင် pull/push ကို တစ်ခါတည်းလုပ်ဆောင်ပြီး LAN/Cloud setting အလိုက် data update ကို တစ်ပြိုင်တည်းညှိပေးပါသည်။{"\n\n"}
          ၁၂။ <Text style={{ fontWeight: "bold" }}>Backup / Restore</Text>: JSON backup export လုပ်ခြင်း၊ restore (merge/replace) ပြုလုပ်ခြင်းဖြင့် data လုံခြုံစွာ သိမ်းဆည်းနိုင်ပါသည်။{"\n\n"}
          ၁၃။ <Text style={{ fontWeight: "bold" }}>App Update</Text>: App ဖွင့်ချိန်တွင် update ရှိ/မရှိ စစ်ပြီး update ရှိလျှင် Update Now ဖြင့် APK download + install prompt ဖြင့် update ဆက်လုပ်နိုင်ပါသည်။{"\n\n"}
          ၁၄။ <Text style={{ fontWeight: "bold" }}>Security & Roles</Text>: Role-based access control ဖြင့် member/committee/admin အလိုက် မတူညီသောလုပ်ပိုင်ခွင့်များကို အလိုအလျောက်ကန့်သတ်ထားပါသည်။
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>© 2024 OrgHub Manager</Text>
        <Text style={styles.footerSubText}>Created by MR. SOE MYINT SWE</Text>
      </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 20 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 4 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.light.textSecondary, marginBottom: 30 },
  menuContainer: { gap: 16 },
  bootstrapCard: { backgroundColor: Colors.light.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.light.border, padding: 18 },
  bootstrapTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 6 },
  bootstrapDesc: { fontSize: 13, lineHeight: 20, color: Colors.light.textSecondary, marginBottom: 14 },
  bootstrapForm: { gap: 8 },
  registryListCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 12,
  },
  registryListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  registryListHeaderActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  registryListTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  registryListButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  registryListAddButton: {
    backgroundColor: Colors.light.tintLight,
    borderColor: Colors.light.tint,
  },
  registryListButtonText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  registryListError: {
    fontSize: 12,
    color: "#DC2626",
    marginBottom: 6,
  },
  registryListInfo: {
    fontSize: 12,
    color: "#1F7A6C",
    marginBottom: 6,
  },
  registryListTable: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  registryListRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  registryListHeaderRow: {
    backgroundColor: Colors.light.tintLight,
  },
  registryListRowActive: {
    backgroundColor: "#ECFDF3",
  },
  registryListCell: {
    fontSize: 12,
    color: Colors.light.text,
    paddingRight: 8,
  },
  registryListColId: { width: 80, fontFamily: "Inter_700Bold" },
  registryListColName: { flex: 1, minWidth: 140 },
  registryListColPhone: { width: 120 },
  registryListColStatus: { width: 70 },
  registryListColExpiry: { width: 110 },
  registryListColAction: { width: 260, alignItems: "flex-end" },
  registryListActionRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  registryListDetailButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  registryListDetailButtonText: {
    fontSize: 11,
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
  },
  registryListConnectButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#E6F4F1",
    borderWidth: 1,
    borderColor: "#B7E3DA",
  },
  registryListConnectButtonText: {
    fontSize: 11,
    color: "#1F7A6C",
    fontFamily: "Inter_700Bold",
  },
  registryListUseButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.light.tint,
  },
  registryListUseButtonText: {
    fontSize: 11,
    color: "#fff",
    fontFamily: "Inter_700Bold",
  },
  registryListDeleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  registryListDeleteButtonDisabled: {
    opacity: 0.6,
  },
  registryListDeleteButtonText: {
    fontSize: 11,
    color: "#B91C1C",
    fontFamily: "Inter_700Bold",
  },
  registryListLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  registryListLoadingText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  registryListEmpty: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  registryFormCollapsed: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    gap: 6,
  },
  registryFormCollapsedText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  registryDetailCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    padding: 14,
    gap: 6,
  },
  registryDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  registryDetailTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  registryDetailClose: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  registryDetailCloseText: {
    fontSize: 11,
    color: Colors.light.text,
    fontFamily: "Inter_600SemiBold",
  },
  registryDetailLine: {
    fontSize: 12,
    color: Colors.light.text,
  },
  registryDetailLabel: {
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
  },
  registryDetailActions: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  registryDetailDeleteButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEE2E2",
  },
  registryDetailDeleteButtonText: {
    fontSize: 12,
    color: "#B91C1C",
    fontFamily: "Inter_700Bold",
  },
  registryDetailEditButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
  },
  registryDetailEditButtonText: {
    fontSize: 12,
    color: "#fff",
    fontFamily: "Inter_700Bold",
  },
  registryTable: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  registryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  registryLabelCell: {
    width: 190,
    minWidth: 150,
  },
  registryInputCell: {
    flex: 1,
  },
  registryLabelText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
  },
  registryHelperText: {
    marginTop: 4,
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  requiredStar: {
    color: "#EF4444",
  },
  registrySectionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.light.tintLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  registrySectionText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  registryActionRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  registryFooterRow: {
    padding: 14,
    backgroundColor: Colors.light.surface,
  },
  bootstrapSummary: { backgroundColor: Colors.light.tintLight, borderRadius: 12, padding: 14, gap: 6 },
  bootstrapSummaryLine: { fontSize: 14, color: Colors.light.text, fontFamily: "Inter_600SemiBold" },
  bootstrapHint: { marginTop: 6, fontSize: 12, lineHeight: 18, color: Colors.light.textSecondary },
  sectionTitle: { marginTop: 14, fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.light.text },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginTop: 2 },
  input: {
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.light.text,
    width: "100%",
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  registryNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFEFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#BAE6FD",
    marginBottom: 8,
  },
  registryNoticeError: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
  },
  registryNoticeSuccess: {
    backgroundColor: "#ECFDF3",
    borderColor: "#86EFAC",
  },
  registryNoticeText: {
    fontSize: 12,
    color: Colors.light.text,
    flex: 1,
  },
  toggleRow: { flexDirection: "row", gap: 10, marginTop: 6 },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
    backgroundColor: Colors.light.background,
  },
  toggleButtonActive: {
    borderColor: Colors.light.tint,
    backgroundColor: Colors.light.tintLight,
  },
  toggleButtonText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  secondaryButton: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: Colors.light.background,
  },
  tableButton: {
    marginTop: 0,
    paddingVertical: 10,
    flexGrow: 1,
  },
  secondaryButtonText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  bootstrapButton: {
    marginTop: 8,
    backgroundColor: Colors.light.tint,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    width: "100%",
  },
  bootstrapButtonText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#fff" },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 20, borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  iconBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center", marginRight: 16 },
  menuTextContainer: { flex: 1 },
  menuTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#fff", marginBottom: 4 },
  menuDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.9)" },
  infoSection: { marginTop: 30, backgroundColor: Colors.light.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: Colors.light.border },
  sectionHeader: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.light.text, marginBottom: 15 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  infoLabel: { fontSize: 14, color: Colors.light.textSecondary },
  infoValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  guideText: { fontSize: 14, lineHeight: 22, color: Colors.light.text },
  footer: { marginTop: 40, alignItems: "center", opacity: 0.5, marginBottom: 20 },
  footerText: { fontSize: 12, fontWeight: "600" },
  footerSubText: { fontSize: 10, marginTop: 2 },
});

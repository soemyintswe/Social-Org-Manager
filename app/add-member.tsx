import React, { useState, useEffect, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  Image,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import { isCommitteePosition } from "@/lib/access-control";
import { CUSTOM_RELATION_STORAGE_KEY, mergeRelationOptions } from "@/lib/relation-options";
import {
  ORG_POSITION_LABELS,
  OrgPosition,
  MemberStatus,
  MemberGender,
  MemberFamilyMember,
  MEMBER_STATUS_VALUES,
  MEMBER_STATUS_LABELS,
  MEMBER_GENDER_VALUES,
  MEMBER_GENDER_LABELS,
  normalizeOrgPosition,
} from "@/lib/types";
import AccessDenied from "@/components/AccessDenied";
// AVATAR အတွက် အရောင်ကျပန်း ရွေးချယ်ပေးရန်
const AVATAR_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

const getAvatarLabel = (name: string) => {
  if (!name) return "?";
  let text = name.trim();
  const prefixes = ["ဆရာတော်", "ဦး", "ဒေါ်", "မောင်", "ကို", "မ", "ကိုရင်", "ဦးဇင်း", "ဆရာလေး", "သီလရှင်"];
  prefixes.sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      const remaining = text.slice(prefix.length).trim();
      if (remaining.length > 0) {
        text = remaining;
        break;
      }
    }
  }
  return text.charAt(0).toUpperCase();
};

const inferGenderFromName = (rawName: string): MemberGender => {
  const name = String(rawName || "").trim();
  if (!name) return "other";
  const n = name.toLowerCase();
  if (
    name.startsWith("ဆရာတော်") ||
    name.startsWith("ဦး") ||
    name.startsWith("ကို") ||
    name.startsWith("မောင်") ||
    name.startsWith("ကိုရင်") ||
    name.startsWith("ဦးဇင်း") ||
    n.startsWith("u ") ||
    n.startsWith("ko ") ||
    n.startsWith("mg ")
  ) {
    return "male";
  }
  if (
    name.startsWith("ဒေါ်") ||
    name.startsWith("မ") ||
    name.startsWith("မိ") ||
    name.startsWith("သီလရှင်") ||
    name.startsWith("ဆရာလေး") ||
    n.startsWith("daw ") ||
    n.startsWith("ma ")
  ) {
    return "female";
  }
  return "other";
};

const RESTRICTED_MEMBER_FIELDS = ["id", "orgPosition", "status", "statusDate"] as const;
type RestrictedMemberField = (typeof RESTRICTED_MEMBER_FIELDS)[number];

function hasValueChanged(before: unknown, after: unknown): boolean {
  try {
    return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
  } catch {
    return String(before ?? "") !== String(after ?? "");
  }
}

type FamilyFormMember = MemberFamilyMember & { _localId: string };

function toFamilyFormRows(input: unknown): FamilyFormMember[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row, index) => {
      const item = (row || {}) as any;
      const name = String(item.name || "").trim();
      if (!name) return null;
      return {
        _localId: String(item.id || `fm-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`),
        id: item.id ? String(item.id) : undefined,
        name,
        gender: item.gender === "male" || item.gender === "female" || item.gender === "other" ? item.gender : "other",
        relation: item.relation ? String(item.relation) : "",
        dob: item.dob ? String(item.dob) : "",
        nrc: item.nrc ? String(item.nrc) : "",
        occupation: item.occupation ? String(item.occupation) : "",
      } as FamilyFormMember;
    })
    .filter(Boolean) as FamilyFormMember[];
}

function toFamilyPayload(rows: FamilyFormMember[]): MemberFamilyMember[] {
  return rows
    .map((row) => ({
      id: row.id,
      name: String(row.name || "").trim(),
      gender: row.gender,
      relation: row.relation ? String(row.relation).trim() : undefined,
      dob: row.dob ? String(row.dob).trim() : undefined,
      nrc: row.nrc ? String(row.nrc).trim() : undefined,
      occupation: row.occupation ? String(row.occupation).trim() : undefined,
    }))
    .filter((row) => row.name);
}

export default function AddMemberScreen() {
  const insets = useSafeAreaInsets();
  const { members, addMember, updateMember, createMemberChangeRequest } = useData() as any;
  const { can, currentUser, profile } = useAuth();
  const { editId } = useLocalSearchParams<{ editId: string }>();
  const normalizedEditId = String(editId || "").trim();
  const isEditMode = normalizedEditId.length > 0;
  const canCreateMember = can("members.create");
  const canProposeMemberChanges = can("members.propose_changes");

  // Form States
  const [name, setName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [gender, setGender] = useState<MemberGender>("other");
  const [phone, setPhone] = useState("");
  const [occupation, setOccupation] = useState("");
  const [nrc, setNrc] = useState("");
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
  const [joinDate, setJoinDate] = useState(new Date().toLocaleDateString("en-GB"));
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<MemberStatus>("active");
  const [statusDate, setStatusDate] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [orgPosition, setOrgPosition] = useState<OrgPosition>("member");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyFormMember[]>([]);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [showJoinDatePicker, setShowJoinDatePicker] = useState(false);
  const [showStatusDatePicker, setShowStatusDatePicker] = useState(false);
  const [showPositionPicker, setShowPositionPicker] = useState(false);
  const [familyDobPickerRowId, setFamilyDobPickerRowId] = useState<string | null>(null);
  const [showFamilyRelationPicker, setShowFamilyRelationPicker] = useState(false);
  const [familyRelationPickerRowId, setFamilyRelationPickerRowId] = useState<string | null>(null);
  const [customRelations, setCustomRelations] = useState<string[]>([]);
  const [newCustomRelation, setNewCustomRelation] = useState("");
  const [saving, setSaving] = useState(false);
  const actorPosition = normalizeOrgPosition(profile?.orgPosition || currentUser?.orgPosition || "member");
  const isChairOrVice =
    actorPosition === "chairperson" ||
    actorPosition === "vice_chairperson";
  const isEditingOwnRecord =
    !!normalizedEditId &&
    !!currentUser?.memberId &&
    String(currentUser.memberId).trim() === normalizedEditId;
  const canProposeRestricted = Boolean(canProposeMemberChanges && !isChairOrVice && isCommitteePosition(actorPosition));
  const canEditRestrictedDirectly = isChairOrVice;
  const canEditGeneralOwnInfo = Boolean(
    currentUser?.id &&
    profile?.memberStatus !== "applicant" &&
    (!isEditMode || isEditingOwnRecord)
  );
  const canEditGeneralCommitteeInfo = Boolean(isEditMode && can("members.edit") && isCommitteePosition(actorPosition));
  const canEditGeneralFields = !isEditMode || canEditGeneralOwnInfo || canEditGeneralCommitteeInfo;
  const canEditRestrictedFields = !isEditMode || canEditRestrictedDirectly || canProposeRestricted;
  const canOpenEditForm = !isEditMode || canEditGeneralFields || canEditRestrictedDirectly || canProposeRestricted;
  const relationOptions = useMemo(() => mergeRelationOptions(customRelations, false), [customRelations]);

  const addFamilyMember = () => {
    setFamilyMembers((prev) => [
      ...prev,
      {
        _localId: `fm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: "",
        gender: "other",
        relation: "",
        dob: "",
        nrc: "",
        occupation: "",
      },
    ]);
  };

  const updateFamilyMember = (localId: string, key: keyof FamilyFormMember, value: string) => {
    setFamilyMembers((prev) =>
      prev.map((row) => (row._localId === localId ? { ...row, [key]: value } : row))
    );
  };

  const removeFamilyMember = (localId: string) => {
    setFamilyMembers((prev) => prev.filter((row) => row._localId !== localId));
    if (familyRelationPickerRowId === localId) {
      setFamilyRelationPickerRowId(null);
      setShowFamilyRelationPicker(false);
    }
    if (familyDobPickerRowId === localId) {
      setFamilyDobPickerRowId(null);
    }
  };

  const openFamilyRelationPicker = (localId: string) => {
    if (!canEditGeneralFields) return;
    setFamilyRelationPickerRowId(localId);
    setShowFamilyRelationPicker(true);
  };

  const applyFamilyRelation = (relation: string) => {
    if (!familyRelationPickerRowId) return;
    updateFamilyMember(familyRelationPickerRowId, "relation", relation);
    setShowFamilyRelationPicker(false);
  };

  const saveCustomRelation = async () => {
    const value = String(newCustomRelation || "").trim();
    if (!value) {
      Alert.alert("လိုအပ်ချက်", "တော်စပ်ပုံအသစ်ကို ရိုက်ထည့်ပါ။");
      return;
    }
    const alreadyExists = relationOptions.some((item) => item === value);
    const nextCustomRelations = alreadyExists ? customRelations : [...customRelations, value];
    try {
      if (!alreadyExists) {
        await AsyncStorage.setItem(CUSTOM_RELATION_STORAGE_KEY, JSON.stringify(nextCustomRelations));
      }
      setCustomRelations(nextCustomRelations);
      if (familyRelationPickerRowId) {
        updateFamilyMember(familyRelationPickerRowId, "relation", value);
      }
      setNewCustomRelation("");
      setShowFamilyRelationPicker(false);
    } catch {
      Alert.alert("အမှား", "တော်စပ်ပုံ အသစ်သိမ်းရာတွင် အဆင်မပြေပါ။");
    }
  };

  const handleFamilyDobChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setFamilyDobPickerRowId(null);
    }
    if (!selectedDate || !familyDobPickerRowId) return;
    const day = String(selectedDate.getDate()).padStart(2, "0");
    const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
    const year = selectedDate.getFullYear();
    updateFamilyMember(familyDobPickerRowId, "dob", `${day}/${month}/${year}`);
  };

  useEffect(() => {
    if (editId) {
      const member = members.find((m: any) => m.id === editId);
      if (member) {
        setName(member.name);
        setMemberId(member.id);
        setGender(member.gender || inferGenderFromName(member.name || ""));
        setPhone(member.phone);
        setOccupation((member as any).occupation || "");
        // @ts-ignore - nrc နှင့် dob က type ထဲမှာ မပါခဲ့ရင် error မတက်စေရန်
        setNrc(member.nrc || "");
        // @ts-ignore
        setDob(member.dob || "");
        setAddress(member.address || "");
        setJoinDate(member.joinDate || "");
        setEmail(member.email || "");
        setStatus(member.status);
        setStatusDate(member.statusDate || member.resignDate || "");
        setStatusNote(member.statusNote || "");
        setOrgPosition(member.orgPosition || "member");
        setProfileImage(member.profileImage || null);
        setFamilyMembers(toFamilyFormRows((member as any).familyMembers));
      }
    }
  }, [editId, members]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CUSTOM_RELATION_STORAGE_KEY);
        if (!mounted || !raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setCustomRelations(parsed.map((x: any) => String(x || "").trim()).filter(Boolean));
        }
      } catch {
        // ignore malformed storage
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3,
        base64: true,
      });

      if (!result.canceled) {
        const source = result.assets[0].base64 
          ? `data:image/jpeg;base64,${result.assets[0].base64}`
          : result.assets[0].uri;
        setProfileImage(source);
      }
    } catch {
      Alert.alert("Error", "ပုံရွေးချယ်၍ မရပါ။");
    }
  };

  const canSave = name.trim().length > 0 && memberId.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    try {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

      const memberData: any = {
        id: memberId,
        name: name.trim(),
        gender,
        occupation: occupation.trim(),
        phone: phone.trim(),
        nrc: nrc.trim(),
        dob: dob.trim(),
        address: address.trim(),
        joinDate: joinDate.trim(),
        email: email.trim(),
        status: status,
        statusDate: statusDate.trim(),
        statusNote: statusNote.trim(),
        role: "member", // Missing 'role' ကို ထည့်လိုက်ပါသည်
        orgPosition: orgPosition,
        avatarColor: randomColor, // Missing 'color' (သို့) 'avatarColor' အတွက်
        color: randomColor, 
        profileImage: profileImage || undefined,
        familyMembers: toFamilyPayload(familyMembers),
        createdAt: new Date().toISOString(),
      };

      if (editId) {
        const existingMember = members.find((m: any) => m.id === editId);
        if (!existingMember) {
          Alert.alert("Error", "Member not found.");
          setSaving(false);
          return;
        }
        if (memberId.trim() !== editId) {
          const duplicate = members.find((m: any) => m.id === memberId.trim() && m.id !== editId);
          if (duplicate) {
            Alert.alert("Error", "ဤ Member ID ဖြင့် အသင်းဝင်ရှိပြီးသားဖြစ်နေပါသည်။");
            setSaving(false);
            return;
          }
        }

        const restrictedPatch: Partial<Record<RestrictedMemberField, any>> = {};
        const restrictedCurrent: Record<RestrictedMemberField, any> = {
          id: existingMember.id,
          orgPosition: existingMember.orgPosition || "member",
          status: existingMember.status || "active",
          statusDate: existingMember.statusDate || existingMember.resignDate || "",
        };
        const restrictedNext: Record<RestrictedMemberField, any> = {
          id: memberData.id,
          orgPosition: memberData.orgPosition,
          status: memberData.status,
          statusDate: memberData.statusDate || "",
        };
        RESTRICTED_MEMBER_FIELDS.forEach((field) => {
          if (hasValueChanged(restrictedCurrent[field], restrictedNext[field])) {
            restrictedPatch[field] = restrictedNext[field];
          }
        });

        const unrestrictedPayload: any = { ...memberData };
        RESTRICTED_MEMBER_FIELDS.forEach((field) => delete unrestrictedPayload[field]);
        delete unrestrictedPayload.createdAt;
        const unrestrictedPatch: any = {};
        Object.keys(unrestrictedPayload).forEach((key) => {
          if (hasValueChanged((existingMember as any)[key], unrestrictedPayload[key])) {
            unrestrictedPatch[key] = unrestrictedPayload[key];
          }
        });

        const hasRestrictedChanges = Object.keys(restrictedPatch).length > 0;
        const hasUnrestrictedChanges = Object.keys(unrestrictedPatch).length > 0;
        if (!hasRestrictedChanges && !hasUnrestrictedChanges) {
          Alert.alert("အသိပေးချက်", "ပြင်ဆင်ထားသည့် အပြောင်းအလဲ မတွေ့ပါ။");
          setSaving(false);
          return;
        }

        if (canEditRestrictedDirectly) {
          if (hasUnrestrictedChanges && !canEditGeneralFields) {
            Alert.alert("ခွင့်မပြုပါ", "အခြားအသင်းဝင်၏ ကိုယ်ရေးအချက်အလက်များကို တိုက်ရိုက်မပြင်နိုင်ပါ။");
            setSaving(false);
            return;
          }
          await updateMember(editId, {
            ...(hasUnrestrictedChanges ? unrestrictedPatch : {}),
            ...(hasRestrictedChanges ? restrictedPatch : {}),
          });
          Alert.alert("အောင်မြင်ပါသည်", "အသင်းဝင်အချက်အလက် ပြင်ဆင်ပြီးပါပြီ။");
        } else {
          if (hasUnrestrictedChanges && !canEditGeneralFields) {
            Alert.alert("ခွင့်မပြုပါ", "ကော်မတီအဖွဲ့ဝင်များသာ ဤအချက်အလက်များကို ပြင်ဆင်ခွင့်ရှိပါသည်။");
            setSaving(false);
            return;
          }

          if (hasRestrictedChanges && (!canProposeRestricted || !currentUser?.id)) {
            Alert.alert(
              "ခွင့်မပြုပါ",
              "Member ID / Position / Status / Status Date ကို ဥက္ကဋ္ဌ နှင့် ဒုတိယဥက္ကဋ္ဌသာ တိုက်ရိုက်ပြင်နိုင်ပါသည်။ အခြားကော်မတီဝင်များသာ proposal တင်နိုင်ပါသည်။"
            );
            setSaving(false);
            return;
          }

          if (hasUnrestrictedChanges) {
            await updateMember(editId, unrestrictedPatch);
          }
          if (hasRestrictedChanges) {
            if (!currentUser?.id) {
              Alert.alert("ခွင့်မပြုပါ", "အသုံးပြုသူအချက်အလက် မပြည့်စုံသဖြင့် proposal မပို့နိုင်ပါ။");
              setSaving(false);
              return;
            }
            await createMemberChangeRequest({
              action: "update",
              targetMemberId: editId,
              payload: {
                member: restrictedPatch as any,
                note: "Restricted member fields update proposal",
              },
              createdByUserId: currentUser.id,
              createdByMemberId: currentUser.memberId,
            });
          }

          if (hasRestrictedChanges && hasUnrestrictedChanges) {
            Alert.alert("အောင်မြင်ပါသည်", "ကိုယ်ပိုင်အချက်အလက်များကို သိမ်းပြီး Restricted fields proposal ကိုလည်း Approver ထံပို့ပြီးပါပြီ။");
          } else if (hasRestrictedChanges) {
            Alert.alert("အောင်မြင်ပါသည်", "Restricted fields ပြင်ဆင်မှုကို Approver ထံ proposal ပို့ပြီးပါပြီ။");
          } else {
            Alert.alert("အောင်မြင်ပါသည်", "အသင်းဝင်အချက်အလက် ပြင်ဆင်ပြီးပါပြီ။");
          }
        }
      } else {
        if (canCreateMember) {
          await addMember(memberData);
        } else if (canProposeMemberChanges && currentUser?.id) {
          await createMemberChangeRequest({
            action: "create",
            payload: {
              member: memberData,
              note: "New member proposal",
            },
            createdByUserId: currentUser.id,
            createdByMemberId: currentUser.memberId,
          });
          Alert.alert("အောင်မြင်ပါသည်", "အသင်းဝင်အသစ် request ကို approver ထံပို့ပြီးပါပြီ။");
        }
      }
      router.back();
    } catch (error) {
      console.error("member-save-error", error);
      Alert.alert("အမှားအယွင်း", `သိမ်းဆည်းရာတွင် အဆင်မပြေပါ။ (${String((error as any)?.message || "")})`);
    } finally {
      setSaving(false);
    }
  };

  const handleDobChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDobPicker(false);
    }
    if (selectedDate) {
      const day = String(selectedDate.getDate()).padStart(2, "0");
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const year = selectedDate.getFullYear();
      setDob(`${day}/${month}/${year}`);
    }
  };

  const handleJoinDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowJoinDatePicker(false);
    }
    if (selectedDate) {
      const day = String(selectedDate.getDate()).padStart(2, "0");
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const year = selectedDate.getFullYear();
      setJoinDate(`${day}/${month}/${year}`);
    }
  };

  const handleStatusDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowStatusDatePicker(false);
    }
    if (selectedDate) {
      const day = String(selectedDate.getDate()).padStart(2, "0");
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const year = selectedDate.getFullYear();
      setStatusDate(`${day}/${month}/${year}`);
    }
  };

  const getInitialDate = () => {
    if (!dob) return new Date();
    const parts = dob.split('/');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  const getParsedDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  if ((!editId && !canCreateMember && !canProposeMemberChanges) || (editId && !canOpenEditForm)) {
    return <AccessDenied showBack={true} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{editId ? "အချက်အလက်ပြင်ရန်" : "အသင်းဝင်သစ်ထည့်ရန်"}</Text>
        <Pressable onPress={handleSave} disabled={!canSave || saving}>
          {saving ? (
            <ActivityIndicator size="small" color={Colors.light.tint} />
          ) : (
            <Text style={[styles.saveBtn, !canSave ? { opacity: 0.5 } : undefined]}>သိမ်းမည်</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardAvoidingView}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.imageContainer}>
            <Pressable
              onPress={canEditGeneralFields ? pickImage : undefined}
              style={[
                styles.imagePicker,
                !profileImage && name ? { backgroundColor: Colors.light.tint } : undefined,
                !canEditGeneralFields ? styles.inputReadOnly : undefined,
              ]}
            >
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.profileImage} resizeMode="cover" />
              ) : name ? (
                <View style={styles.placeholderImage}>
                  <Text style={{ fontSize: 40, color: "#fff", fontWeight: "bold" }}>{getAvatarLabel(name)}</Text>
                </View>
              ) : (
                <View style={styles.placeholderImage}>
                  <Ionicons name="person-add" size={32} color={Colors.light.textSecondary} />
                  <Text style={styles.addPhotoText}>ဓာတ်ပုံ</Text>
                </View>
              )}
            </Pressable>
            {profileImage && (
              <Pressable onPress={canEditGeneralFields ? () => setProfileImage(null) : undefined} style={styles.removeImageBtn}>
                <Text style={styles.removeImageText}>ဖယ်ရှားမည်</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.label}>အသင်းဝင်အမှတ် (ID)</Text>
          <TextInput
            style={[styles.input, !canEditRestrictedFields ? styles.inputReadOnly : undefined]}
            placeholder="ဥပမာ- ရဆသ-၀၀၁"
            value={memberId}
            onChangeText={setMemberId}
            placeholderTextColor={Colors.light.textSecondary}
            editable={canEditRestrictedFields}
          />

          <Text style={styles.label}>အမည်</Text>
          <TextInput
            style={[styles.input, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
            placeholder="အမည်အပြည့်အစုံ"
            value={name}
            onChangeText={setName}
            placeholderTextColor={Colors.light.textSecondary}
            editable={canEditGeneralFields}
          />

          <Text style={styles.label}>ကျား / မ / အခြား</Text>
          <View style={styles.statusRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {MEMBER_GENDER_VALUES.map((g) => (
                <Pressable
                  key={g}
                  style={[
                    styles.statusChip,
                    gender === g ? styles.statusChipActive : undefined,
                    !canEditGeneralFields ? styles.inputReadOnly : undefined,
                  ]}
                  onPress={() => canEditGeneralFields && setGender(g)}
                >
                  <Text style={[styles.statusChipText, gender === g ? styles.statusChipTextActive : undefined]}>
                    {MEMBER_GENDER_LABELS[g]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <Text style={styles.label}>ဖုန်းနံပါတ်</Text>
          <TextInput
            style={[styles.input, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
            placeholder="၀၉..."
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholderTextColor={Colors.light.textSecondary}
            editable={canEditGeneralFields}
          />

          <Text style={styles.label}>အလုပ်အကိုင်</Text>
          <TextInput
            style={[styles.input, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
            placeholder="အလုပ်အကိုင်"
            value={occupation}
            onChangeText={setOccupation}
            placeholderTextColor={Colors.light.textSecondary}
            editable={canEditGeneralFields}
          />

          <Text style={styles.label}>မှတ်ပုံတင်အမှတ်</Text>
          <TextInput
            style={[styles.input, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
            placeholder="၁၂/သကတ(နိုင်)...."
            value={nrc}
            onChangeText={setNrc}
            placeholderTextColor={Colors.light.textSecondary}
            editable={canEditGeneralFields}
          />

          <Text style={styles.label}>မွေးသက္ကရာဇ်</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              style={[styles.input, { flex: 1 }, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
              placeholder="ရက်.လ.ခုနှစ် (သို့) မြန်မာသက္ကရာဇ်"
              value={dob}
              onChangeText={setDob}
              placeholderTextColor={Colors.light.textSecondary}
              editable={canEditGeneralFields}
            />
            {Platform.OS === 'web' ? (
              <View style={[styles.datePickerBtn, { position: 'relative' }, !canEditGeneralFields ? styles.inputReadOnly : undefined]}>
                <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                {React.createElement('input', {
                  type: 'date',
                  style: {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer'
                  },
                  disabled: !canEditGeneralFields,
                  onChange: (e: any) => {
                    if (e.target.value) {
                      const [y, m, d] = e.target.value.split('-');
                      setDob(`${d}/${m}/${y}`);
                    }
                  }
                })}
              </View>
            ) : (
              <Pressable
                style={[styles.datePickerBtn, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
                onPress={() => canEditGeneralFields && setShowDobPicker(true)}
              >
                <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
              </Pressable>
            )}
          </View>
          {showDobPicker && Platform.OS !== 'web' && (
            Platform.OS === 'ios' ? (
              <View style={styles.datePickerContainer}>
                <DateTimePicker
                  value={getInitialDate()}
                  mode="date"
                  display="spinner"
                  onChange={handleDobChange}
                  style={{ alignSelf: "center" }}
                />
                <Pressable onPress={() => setShowDobPicker(false)} style={styles.iosDateCloseBtn}>
                  <Text style={styles.iosDateCloseText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <DateTimePicker
                value={getInitialDate()}
                mode="date"
                display="default"
                onChange={handleDobChange}
              />
            )
          )}

          <Text style={styles.label}>နေရပ်လိပ်စာ</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: "top" }, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
            placeholder="အိမ်အမှတ်၊ လမ်း၊ ရပ်ကွက်..."
            value={address}
            onChangeText={setAddress}
            multiline
            placeholderTextColor={Colors.light.textSecondary}
            editable={canEditGeneralFields}
          />

          <Text style={styles.label}>အသင်းဝင်သည့်နေ့</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              style={[styles.input, { flex: 1 }, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
              placeholder="ရက်.လ.ခုနှစ် (DD/MM/YYYY)"
              value={joinDate}
              onChangeText={setJoinDate}
              placeholderTextColor={Colors.light.textSecondary}
              editable={canEditGeneralFields}
            />
            {Platform.OS === 'web' ? (
              <View style={[styles.datePickerBtn, { position: 'relative' }, !canEditGeneralFields ? styles.inputReadOnly : undefined]}>
                <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                {React.createElement('input', {
                  type: 'date',
                  style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' },
                  disabled: !canEditGeneralFields,
                  onChange: (e: any) => {
                    if (e.target.value) {
                      const [y, m, d] = e.target.value.split('-');
                      setJoinDate(`${d}/${m}/${y}`);
                    }
                  }
                })}
              </View>
            ) : (
              <Pressable
                style={[styles.datePickerBtn, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
                onPress={() => canEditGeneralFields && setShowJoinDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
              </Pressable>
            )}
          </View>
          {showJoinDatePicker && Platform.OS !== 'web' && (
            Platform.OS === 'ios' ? (
              <View style={styles.datePickerContainer}>
                <DateTimePicker
                  value={getParsedDate(joinDate)}
                  mode="date"
                  display="spinner"
                  onChange={handleJoinDateChange}
                  style={{ alignSelf: "center" }}
                />
                <Pressable onPress={() => setShowJoinDatePicker(false)} style={styles.iosDateCloseBtn}>
                  <Text style={styles.iosDateCloseText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <DateTimePicker
                value={getParsedDate(joinDate)}
                mode="date"
                display="default"
                onChange={handleJoinDateChange}
              />
            )
          )}

          <Text style={styles.label}>အသင်းဝင် အဆင့်အတန်း (Position)</Text>
          <Pressable
            style={[styles.dropdown, !canEditRestrictedFields ? styles.inputReadOnly : undefined]}
            onPress={() => canEditRestrictedFields && setShowPositionPicker(true)}
          >
            <Text style={styles.dropdownText}>{ORG_POSITION_LABELS[orgPosition]}</Text>
            <Ionicons name="chevron-down" size={20} color={Colors.light.textSecondary} />
          </Pressable>

          <Text style={styles.label}>အခြေအနေ (Status)</Text>
          <View style={styles.statusRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MEMBER_STATUS_VALUES.map((s) => (
              <Pressable
                key={s}
                style={[
                  styles.statusChip,
                  status === s ? styles.statusChipActive : undefined,
                  !canEditRestrictedFields ? styles.inputReadOnly : undefined,
                ]}
                onPress={() => canEditRestrictedFields && setStatus(s)}
              >
                <Text style={[styles.statusChipText, status === s ? styles.statusChipTextActive : undefined]}>
                  {MEMBER_STATUS_LABELS[s]}
                </Text>
              </Pressable>
            ))}
            </ScrollView>
          </View>

          <Text style={styles.label}>အခြေအနေပြောင်းလဲသည့်နေ့ (Status Date)</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              style={[styles.input, { flex: 1 }, !canEditRestrictedFields ? styles.inputReadOnly : undefined]}
              placeholder="ရက်.လ.ခုနှစ် (ရှိလျှင်)"
              value={statusDate}
              onChangeText={setStatusDate}
              placeholderTextColor={Colors.light.textSecondary}
              editable={canEditRestrictedFields}
            />
            {Platform.OS === 'web' ? (
              <View style={[styles.datePickerBtn, { position: 'relative' }, !canEditRestrictedFields ? styles.inputReadOnly : undefined]}>
                <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                {React.createElement('input', {
                  type: 'date',
                  style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' },
                  disabled: !canEditRestrictedFields,
                  onChange: (e: any) => {
                    if (e.target.value) {
                      const [y, m, d] = e.target.value.split('-');
                      setStatusDate(`${d}/${m}/${y}`);
                    }
                  }
                })}
              </View>
            ) : (
              <Pressable
                style={[styles.datePickerBtn, !canEditRestrictedFields ? styles.inputReadOnly : undefined]}
                onPress={() => canEditRestrictedFields && setShowStatusDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
              </Pressable>
            )}
          </View>
          {showStatusDatePicker && Platform.OS !== 'web' && (
            Platform.OS === 'ios' ? (
              <View style={styles.datePickerContainer}>
                <DateTimePicker
                  value={getParsedDate(statusDate)}
                  mode="date"
                  display="spinner"
                  onChange={handleStatusDateChange}
                  style={{ alignSelf: "center" }}
                />
                <Pressable onPress={() => setShowStatusDatePicker(false)} style={styles.iosDateCloseBtn}>
                  <Text style={styles.iosDateCloseText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <DateTimePicker
                value={getParsedDate(statusDate)}
                mode="date"
                display="default"
                onChange={handleStatusDateChange}
              />
            )
          )}

          <Text style={styles.label}>မှတ်ချက် (Status Note)</Text>
          <TextInput
            style={[styles.input, { height: 60, textAlignVertical: "top" }, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
            placeholder="အကြောင်းအရင်း..."
            value={statusNote}
            onChangeText={setStatusNote}
            multiline
            placeholderTextColor={Colors.light.textSecondary}
            editable={canEditGeneralFields}
          />

          <View style={styles.familySectionHeader}>
            <Text style={styles.label}>မိသားစုဝင်များ</Text>
            <Pressable
              style={[styles.addFamilyBtn, !canEditGeneralFields ? styles.disabledButton : undefined]}
              onPress={canEditGeneralFields ? addFamilyMember : undefined}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addFamilyBtnText}>ထည့်မည်</Text>
            </Pressable>
          </View>
          {familyMembers.length === 0 ? (
            <Text style={styles.familyHint}>မိသားစုဝင်အချက်အလက် မထည့်ရသေးပါ။</Text>
          ) : (
            familyMembers.map((row, index) => (
              <View key={row._localId} style={styles.familyCard}>
                <View style={styles.familyCardHeader}>
                  <Text style={styles.familyCardTitle}>မိသားစုဝင် #{index + 1}</Text>
                  <Pressable onPress={canEditGeneralFields ? () => removeFamilyMember(row._localId) : undefined}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </Pressable>
                </View>

                <Text style={styles.familyInputLabel}>အမည်</Text>
                <TextInput
                  style={[styles.input, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
                  placeholder="အမည်"
                  value={row.name}
                  onChangeText={(value) => updateFamilyMember(row._localId, "name", value)}
                  placeholderTextColor={Colors.light.textSecondary}
                  editable={canEditGeneralFields}
                />

                <Text style={styles.familyInputLabel}>ကျား / မ / အခြား</Text>
                <View style={styles.statusRow}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {MEMBER_GENDER_VALUES.map((g) => (
                      <Pressable
                        key={`${row._localId}-${g}`}
                        style={[
                          styles.statusChip,
                          row.gender === g ? styles.statusChipActive : undefined,
                          !canEditGeneralFields ? styles.inputReadOnly : undefined,
                        ]}
                        onPress={() => canEditGeneralFields && updateFamilyMember(row._localId, "gender", g)}
                      >
                        <Text style={[styles.statusChipText, row.gender === g ? styles.statusChipTextActive : undefined]}>
                          {MEMBER_GENDER_LABELS[g]}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                <Text style={styles.familyInputLabel}>တော်စပ်ပုံ</Text>
                <Pressable
                  style={[styles.dropdown, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
                  onPress={() => openFamilyRelationPicker(row._localId)}
                >
                  <Text style={[styles.dropdownText, !row.relation ? styles.placeholderText : undefined]}>
                    {row.relation || "တော်စပ်ပုံရွေးချယ်ရန်"}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={Colors.light.textSecondary} />
                </Pressable>

                <Text style={styles.familyInputLabel}>မွေးသက္ကရာဇ်</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
                    placeholder="DD/MM/YYYY"
                    value={row.dob || ""}
                    onChangeText={(value) => updateFamilyMember(row._localId, "dob", value)}
                    placeholderTextColor={Colors.light.textSecondary}
                    editable={canEditGeneralFields}
                  />
                  {Platform.OS === "web" ? (
                    <View style={[styles.datePickerBtn, { position: "relative" }, !canEditGeneralFields ? styles.inputReadOnly : undefined]}>
                      <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                      {React.createElement("input", {
                        type: "date",
                        style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" },
                        disabled: !canEditGeneralFields,
                        onChange: (e: any) => {
                          if (e.target.value) {
                            const [y, m, d] = e.target.value.split("-");
                            updateFamilyMember(row._localId, "dob", `${d}/${m}/${y}`);
                          }
                        },
                      })}
                    </View>
                  ) : (
                    <Pressable
                      style={[styles.datePickerBtn, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
                      onPress={() => canEditGeneralFields && setFamilyDobPickerRowId(row._localId)}
                    >
                      <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                    </Pressable>
                  )}
                </View>

                <Text style={styles.familyInputLabel}>နိုင်ငံသားစီစစ်ရေးကဒ်အမှတ်</Text>
                <TextInput
                  style={[styles.input, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
                  placeholder="နိုင်ငံသားစီစစ်ရေးကဒ်အမှတ်"
                  value={row.nrc || ""}
                  onChangeText={(value) => updateFamilyMember(row._localId, "nrc", value)}
                  placeholderTextColor={Colors.light.textSecondary}
                  editable={canEditGeneralFields}
                />
                <Text style={styles.familyInputLabel}>အလုပ်အကိုင်</Text>
                <TextInput
                  style={[styles.input, !canEditGeneralFields ? styles.inputReadOnly : undefined]}
                  placeholder="အလုပ်အကိုင်"
                  value={row.occupation || ""}
                  onChangeText={(value) => updateFamilyMember(row._localId, "occupation", value)}
                  placeholderTextColor={Colors.light.textSecondary}
                  editable={canEditGeneralFields}
                />
              </View>
            ))
          )}
        </ScrollView>

        {familyDobPickerRowId && Platform.OS !== "web" && (
          Platform.OS === "ios" ? (
            <View style={styles.datePickerContainer}>
              <DateTimePicker
                value={getParsedDate(
                  familyMembers.find((x) => x._localId === familyDobPickerRowId)?.dob || ""
                )}
                mode="date"
                display="spinner"
                onChange={handleFamilyDobChange}
                style={{ alignSelf: "center" }}
              />
              <Pressable onPress={() => setFamilyDobPickerRowId(null)} style={styles.iosDateCloseBtn}>
                <Text style={styles.iosDateCloseText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <DateTimePicker
              value={getParsedDate(
                familyMembers.find((x) => x._localId === familyDobPickerRowId)?.dob || ""
              )}
              mode="date"
              display="default"
              onChange={handleFamilyDobChange}
            />
          )
        )}

        <Modal
          visible={showFamilyRelationPicker}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowFamilyRelationPicker(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowFamilyRelationPicker(false)}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>တော်စပ်ပုံရွေးချယ်ရန်</Text>
              <ScrollView style={{ maxHeight: 300 }}>
                {relationOptions.map((item) => (
                  <Pressable
                    key={item}
                    style={styles.modalOption}
                    onPress={() => applyFamilyRelation(item)}
                  >
                    <Text style={styles.modalOptionText}>{item}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.label}>တော်စပ်ပုံအသစ်ထည့်ရန်</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={newCustomRelation}
                  onChangeText={setNewCustomRelation}
                  placeholder="တော်စပ်ပုံအသစ်ထည့်ရန်"
                  placeholderTextColor={Colors.light.textSecondary}
                />
                <Pressable style={[styles.addFamilyBtn, { alignSelf: "stretch", justifyContent: "center" }]} onPress={() => void saveCustomRelation()}>
                  <Text style={styles.addFamilyBtnText}>ထည့်မည်</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Modal>

        <Modal
          visible={showPositionPicker}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowPositionPicker(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowPositionPicker(false)}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>ရာထူး ရွေးချယ်ပါ</Text>
              <ScrollView style={{ maxHeight: 400 }}>
                {Object.entries(ORG_POSITION_LABELS).map(([key, label]) => (
                  <Pressable key={key} style={styles.modalOption} onPress={() => { setOrgPosition(key as OrgPosition); setShowPositionPicker(false); }}>
                    <Text style={[styles.modalOptionText, orgPosition === key && { color: Colors.light.tint, fontWeight: '600' }]}>{label}</Text>
                    {orgPosition === key && <Ionicons name="checkmark" size={20} color={Colors.light.tint} />}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  backBtn: { padding: 4 },
  saveBtn: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.tint },
  form: { padding: 20, paddingBottom: 50 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginTop: 15, marginBottom: 6, textTransform: "uppercase" },
  input: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  inputReadOnly: { opacity: 0.6 },
  placeholderText: { color: Colors.light.textSecondary },
  dropdown: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.light.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: Colors.light.border },
  dropdownText: { fontSize: 16, color: Colors.light.text },
  
  statusRow: { marginTop: 5 },
  statusChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  statusChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  statusChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  statusChipTextActive: { color: "#fff" },
  keyboardAvoidingView: { flex: 1 },
  imageContainer: { alignItems: "center", marginBottom: 24 },
  imagePicker: { width: 100, height: 100, borderRadius: 50, overflow: "hidden", backgroundColor: Colors.light.surface, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Colors.light.border },
  profileImage: { width: "100%", height: "100%" },
  placeholderImage: { alignItems: "center", justifyContent: "center" },
  addPhotoText: { fontSize: 10, color: Colors.light.textSecondary, marginTop: 4, fontFamily: "Inter_500Medium" },
  removeImageBtn: { marginTop: 8 },
  removeImageText: { color: "#EF4444", fontSize: 13, fontFamily: "Inter_500Medium" },
  datePickerBtn: { justifyContent: "center", alignItems: "center", backgroundColor: Colors.light.surface, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border },
  datePickerContainer: { backgroundColor: Colors.light.surface, marginTop: 8, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: Colors.light.border },
  iosDateCloseBtn: { alignItems: "center", padding: 10, backgroundColor: Colors.light.tint + "15", borderRadius: 8, marginTop: 8 },
  iosDateCloseText: { color: Colors.light.tint, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { width: "80%", backgroundColor: Colors.light.surface, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 15, textAlign: "center" },
  modalOption: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  modalOptionText: { fontSize: 16, color: Colors.light.text },
  familySectionHeader: {
    marginTop: 16,
    marginBottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addFamilyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addFamilyBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  disabledButton: { opacity: 0.55 },
  familyHint: { color: Colors.light.textSecondary, fontSize: 12, marginTop: 2 },
  familyInputLabel: {
    color: Colors.light.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
    marginBottom: -2,
  },
  familyCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    gap: 8,
  },
  familyCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  familyCardTitle: {
    color: Colors.light.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});

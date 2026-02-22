import React, { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/AuthContext";
import { isCommitteePosition } from "@/lib/access-control";
import {
  CATEGORY_LABELS,
  ORG_POSITION_LABELS,
  OrgPosition,
  MEMBER_GENDER_LABELS,
  MEMBER_STATUS_LABELS,
  MemberStatus,
  MEMBER_STATUS_VALUES,
  MEMBER_GENDER_VALUES,
  MemberFamilyMember,
  normalizeOrgPosition,
} from "@/lib/types";

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

const inferGenderFromName = (rawName: string): "male" | "female" | "other" => {
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
  ) return "male";
  if (
    name.startsWith("ဒေါ်") ||
    name.startsWith("မ") ||
    name.startsWith("မိ") ||
    name.startsWith("သီလရှင်") ||
    name.startsWith("ဆရာလေး") ||
    n.startsWith("daw ") ||
    n.startsWith("ma ")
  ) return "female";
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

function InfoRow({ icon, label, value }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | undefined;
}) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={Colors.light.tint} />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function MemberDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { members, groups, updateMember, deleteMember, createMemberChangeRequest, transactions, loans, getLoanOutstanding } = useData() as any;
  const { can, currentUser, profile } = useAuth();
  const member = members?.find((m: any) => m.id === id);
  const memberId = member?.id || "";

  const [editName, setEditName] = useState(member?.name || "");
  const [editMemberId, setEditMemberId] = useState(member?.id || "");
  const [editEmail, setEditEmail] = useState(member?.email || "");
  const [editDob, setEditDob] = useState(member?.dob || "");
  const [editPhone, setEditPhone] = useState(member?.phone || "");
  const [editOccupation, setEditOccupation] = useState((member as any)?.occupation || "");
  const [editAddress, setEditAddress] = useState(member?.address || "");
  const [editProfileImage, setEditProfileImage] = useState<string | undefined>(member?.profileImage || undefined);
  const [editStatus, setEditStatus] = useState<MemberStatus>(member?.status || "active");
  const [editStatusDate, setEditStatusDate] = useState(member?.statusDate || member?.resignDate || "");
  const [editStatusNote, setEditStatusNote] = useState(member?.statusNote || "");
  const [editOrgPosition, setEditOrgPosition] = useState<OrgPosition>(member?.orgPosition || "member");
  const [editFamilyMembers, setEditFamilyMembers] = useState<FamilyFormMember[]>(toFamilyFormRows((member as any)?.familyMembers));
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [showStatusDatePicker, setShowStatusDatePicker] = useState(false);
  const [showPositionPicker, setShowPositionPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const actorPosition = normalizeOrgPosition(profile?.orgPosition || currentUser?.orgPosition || "member");
  const isChairOrVice =
    currentUser?.systemRole === "admin" ||
    actorPosition === "chairperson" ||
    actorPosition === "vice_chairperson";
  const canProposeRestricted = Boolean(can("members.propose_changes") && !isChairOrVice && isCommitteePosition(actorPosition));
  const canEditGeneralMemberInfo = Boolean(currentUser?.id && profile?.memberStatus !== "applicant");

  const memberGroups = useMemo(
    () => groups?.filter((g: any) => g.memberIds.includes(memberId)) || [],
    [groups, memberId]
  );
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  useEffect(() => {
    if (!member) return;
    setEditName(member.name || "");
    setEditMemberId(member.id || "");
    setEditEmail(member.email || "");
    setEditDob(member.dob || "");
    setEditPhone(member.phone || "");
    setEditOccupation((member as any).occupation || "");
    setEditAddress(member.address || "");
    setEditProfileImage(member.profileImage || undefined);
    setEditStatus((member.status as MemberStatus) || "active");
    setEditStatusDate(member.statusDate || member.resignDate || "");
    setEditStatusNote(member.statusNote || "");
    setEditOrgPosition((member.orgPosition as OrgPosition) || "member");
    setEditFamilyMembers(toFamilyFormRows((member as any).familyMembers));
  }, [member]);

  // Financial Calculations
  const memberTxns = useMemo(() => transactions?.filter((t: any) => t.memberId === memberId) || [], [transactions, memberId]);
  const memberLoans = useMemo(() => loans?.filter((l: any) => l.memberId === memberId) || [], [loans, memberId]);

  const stats = useMemo(() => {
    return {
      totalIncome: memberTxns.filter((t: any) => t.type === 'income').reduce((acc: number, t: any) => acc + t.amount, 0),
      totalExpense: memberTxns.filter((t: any) => t.type === 'expense').reduce((acc: number, t: any) => acc + t.amount, 0),
      feesPaid: memberTxns.filter((t: any) => t.category === 'member_fees').reduce((acc: number, t: any) => acc + t.amount, 0),
      loanPrincipal: memberLoans.reduce((acc: number, l: any) => acc + l.amount, 0),
      loanOutstanding: memberLoans.reduce((acc: number, l: any) => acc + getLoanOutstanding(l.id), 0),
      activeLoans: memberLoans.filter((l: any) => l.status === 'active').length,
    };
  }, [memberTxns, memberLoans, getLoanOutstanding]);

  if (!member) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text>Member not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: Colors.light.tint }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const handleDobChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDobPicker(false);
    }
    if (selectedDate) {
      const day = String(selectedDate.getDate()).padStart(2, "0");
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const year = selectedDate.getFullYear();
      setEditDob(`${day}/${month}/${year}`);
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
      setEditStatusDate(`${day}/${month}/${year}`);
    }
  };

  const getInitialDate = () => {
    if (!editDob) return new Date();
    const parts = editDob.split(/[\/\.\-]/);
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  const getParsedDate = (value: string) => {
    if (!value) return new Date();
    const parts = value.split(/[\/\.\-]/);
    if (parts.length === 3) {
      const dt = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (!isNaN(dt.getTime())) return dt;
    }
    return new Date();
  };

  const addFamilyMember = () => {
    setEditFamilyMembers((prev) => [
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
    setEditFamilyMembers((prev) =>
      prev.map((row) => (row._localId === localId ? { ...row, [key]: value } : row))
    );
  };

  const removeFamilyMember = (localId: string) => {
    setEditFamilyMembers((prev) => prev.filter((row) => row._localId !== localId));
  };

  const pickProfileImage = async () => {
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
        setEditProfileImage(source);
      }
    } catch {
      Alert.alert("Error", "Profile ပုံရွေးချယ်၍ မရပါ။");
    }
  };

  const handleUpdate = async () => {
    if (!editName.trim()) {
      Alert.alert("Error", "Name is required");
      return;
    }
    if (!editMemberId.trim()) {
      Alert.alert("Error", "Member ID is required");
      return;
    }

    setSaving(true);
    try {
      const duplicate = members.find((m: any) => m.id === editMemberId.trim() && m.id !== member.id);
      if (duplicate) {
        Alert.alert("Error", "ဤ Member ID ဖြင့် အသင်းဝင်ရှိပြီးသားဖြစ်နေပါသည်။");
        setSaving(false);
        return;
      }

      const nextPayload: any = {
        id: editMemberId.trim(),
        name: editName.trim(),
        dob: editDob.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        occupation: editOccupation.trim(),
        address: editAddress.trim(),
        profileImage: editProfileImage || undefined,
        familyMembers: toFamilyPayload(editFamilyMembers),
        status: editStatus,
        statusDate: editStatusDate.trim(),
        statusNote: editStatusNote.trim(),
        orgPosition: editOrgPosition,
      };

      const restrictedCurrent: Record<RestrictedMemberField, any> = {
        id: member.id,
        orgPosition: member.orgPosition || "member",
        status: member.status || "active",
        statusDate: member.statusDate || member.resignDate || "",
      };
      const restrictedNext: Record<RestrictedMemberField, any> = {
        id: nextPayload.id,
        orgPosition: nextPayload.orgPosition,
        status: nextPayload.status,
        statusDate: nextPayload.statusDate || "",
      };
      const restrictedPatch: Partial<Record<RestrictedMemberField, any>> = {};
      RESTRICTED_MEMBER_FIELDS.forEach((field) => {
        if (hasValueChanged(restrictedCurrent[field], restrictedNext[field])) {
          restrictedPatch[field] = restrictedNext[field];
        }
      });

      const unrestrictedPayload: any = { ...nextPayload };
      RESTRICTED_MEMBER_FIELDS.forEach((field) => delete unrestrictedPayload[field]);
      const unrestrictedPatch: any = {};
      Object.keys(unrestrictedPayload).forEach((key) => {
        if (hasValueChanged((member as any)[key], unrestrictedPayload[key])) {
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

      if (isChairOrVice) {
        await updateMember(member.id, { ...unrestrictedPatch, ...restrictedPatch });
        Alert.alert("အောင်မြင်ပါသည်", "အသင်းဝင်အချက်အလက် ပြင်ဆင်ပြီးပါပြီ။");
      } else {
        if (!canEditGeneralMemberInfo) {
          Alert.alert("ခွင့်မပြုပါ", "ဤအချက်အလက်များကို ပြင်ဆင်ခွင့်မရှိပါ။");
          setSaving(false);
          return;
        }

        if (hasUnrestrictedChanges) {
          await updateMember(member.id, unrestrictedPatch);
        }

        if (hasRestrictedChanges) {
          if (!canProposeRestricted || !currentUser?.id) {
            Alert.alert(
              "ခွင့်မပြုပါ",
              "MemberID / Position / Status / Status Date ပြောင်းလိုပါက ကော်မတီဝင်ဖြစ်ရပြီး proposal တင်ရန်လိုပါသည်။ အတည်ပြုခြင်းကို ဥက္ကဋ္ဌ/ဒုဥက္ကဋ္ဌသာ လုပ်နိုင်ပါသည်။"
            );
          } else {
            await createMemberChangeRequest({
              action: "update",
              targetMemberId: member.id,
              payload: {
                member: restrictedPatch as any,
                note: "Restricted member fields update proposal",
              },
              createdByUserId: currentUser.id,
              createdByMemberId: currentUser.memberId,
            });
            Alert.alert("အောင်မြင်ပါသည်", "Restricted fields proposal ကို approver ထံပို့ပြီးပါပြီ။");
          }
        } else {
          Alert.alert("အောင်မြင်ပါသည်", "အသင်းဝင်အချက်အလက် ပြင်ဆင်ပြီးပါပြီ။");
        }
      }

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
      if (editMemberId.trim() !== member.id) {
        router.replace({ pathname: "/member-detail", params: { id: editMemberId.trim() } } as any);
      }
    } catch (error) {
      Alert.alert("Error", `Could not update member (${String((error as any)?.message || "")})`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete Member", "Are you sure you want to delete this member?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (canDeleteAll) {
            await deleteMember(member.id);
            router.back();
            return;
          }
          if (canProposeChanges && currentUser?.id) {
            await createMemberChangeRequest({
              action: "delete",
              targetMemberId: member.id,
              payload: {
                note: "Member delete proposal",
              },
              createdByUserId: currentUser.id,
              createdByMemberId: currentUser.memberId,
            });
            Alert.alert("အောင်မြင်ပါသည်", "Delete request ကို approver ထံပို့ပြီးပါပြီ။");
            router.back();
          }
        },
      },
    ]);
  };

  // createdAt error ကို ရှောင်ရန် helper variable
  const createdAtValue = (member as any).createdAt;

  // နှုတ်ထွက်သည့်နေ့ ရှိ/မရှိ စစ်ဆေးပြီး Status သတ်မှတ်ခြင်း
  const statusLabel = MEMBER_STATUS_LABELS[member.status as MemberStatus] || member.status;

  const canDeleteAll = can("members.delete");
  const canProposeChanges = can("members.propose_changes");
  const canManage = canEditGeneralMemberInfo || isChairOrVice || canProposeRestricted;
  const canViewFinanceDetail = can("finance.view_detail") || can("finance.view_all");
  const canViewFinanceSelf = can("finance.view_self") && currentUser?.memberId === member.id;
  const canViewFinanceSection = canViewFinanceDetail || canViewFinanceSelf;
  const resolvedGender: "male" | "female" | "other" =
    (member as any).gender === "male" || (member as any).gender === "female" || (member as any).gender === "other"
      ? ((member as any).gender as "male" | "female" | "other")
      : inferGenderFromName(member.name || "");

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"} 
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 || webTopInset }]}>
        <Pressable onPress={() => (editing ? setEditing(false) : router.back())}>
          <Ionicons name={editing ? "close" : "arrow-back"} size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{editing ? "Edit Profile" : "Member Profile"}</Text>
        {canManage && (
          <Pressable onPress={editing ? handleUpdate : () => setEditing(true)} disabled={saving}>
            <Text style={[styles.editBtnText, { color: Colors.light.tint }]}>
              {editing ? (saving ? "Saving..." : "Done") : "Edit"}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: member.avatarColor, overflow: "hidden" }]}>
            {member.profileImage ? (
              <Image source={{ uri: member.profileImage }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarText}>{getAvatarLabel(member.name)}</Text>
            )}
          </View>
          <Text style={styles.name}>{member.name}</Text>

          {/* createdAt ရှိမှသာ ပြသရန်နှင့် error မတက်စေရန် ပြင်ဆင်ထားပါသည် */}
          {createdAtValue && (
            <Text style={styles.joinDate}>
              Joined on {new Date(createdAtValue).toLocaleDateString()}
            </Text>
          )}

          <Pressable 
            style={styles.cardBtn} 
            onPress={() => router.push({ pathname: "/member-card", params: { id: member.id } } as any)}
          >
            <Ionicons name="card-outline" size={18} color="#fff" />
            <Text style={styles.cardBtnText}>View Member Card</Text>
          </Pressable>
        </View>

        {editing ? (
          <View style={styles.editForm}>
            <Text style={styles.editLabel}>Profile ပုံ</Text>
            <View style={styles.profileEditRow}>
              <Pressable onPress={pickProfileImage} style={styles.profileEditBtn}>
                {editProfileImage ? (
                  <Image source={{ uri: editProfileImage }} style={styles.profileEditPreview} resizeMode="cover" />
                ) : (
                  <Ionicons name="camera-outline" size={22} color={Colors.light.textSecondary} />
                )}
              </Pressable>
              <Pressable style={styles.profileTextBtn} onPress={pickProfileImage}>
                <Text style={styles.profileTextBtnLabel}>ပုံရွေးချယ်မည်</Text>
              </Pressable>
              {!!editProfileImage && (
                <Pressable style={styles.profileRemoveBtn} onPress={() => setEditProfileImage(undefined)}>
                  <Text style={styles.profileRemoveBtnText}>ဖယ်ရှား</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.editLabel}>Member ID</Text>
            <TextInput
              style={[styles.editInput, !(isChairOrVice || canProposeRestricted) && styles.inputReadOnly]}
              value={editMemberId}
              onChangeText={setEditMemberId}
              editable={isChairOrVice || canProposeRestricted}
            />

            <Text style={styles.editLabel}>Full Name</Text>
            <TextInput style={styles.editInput} value={editName} onChangeText={setEditName} />

            <Text style={styles.editLabel}>Gender</Text>
            <TextInput style={styles.editInput} value={MEMBER_GENDER_LABELS[resolvedGender]} editable={false} />

            <Text style={styles.editLabel}>Position</Text>
            <Pressable
              style={[styles.dropdown, !(isChairOrVice || canProposeRestricted) && styles.inputReadOnly]}
              onPress={() => (isChairOrVice || canProposeRestricted) && setShowPositionPicker(true)}
            >
              <Text style={styles.dropdownText}>{ORG_POSITION_LABELS[editOrgPosition]}</Text>
              <Ionicons name="chevron-down" size={20} color={Colors.light.textSecondary} />
            </Pressable>

            <Text style={styles.editLabel}>Date of Birth</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TextInput
                style={[styles.editInput, { flex: 1 }]}
                value={editDob}
                onChangeText={setEditDob}
                placeholder="DD/MM/YYYY"
              />
              {Platform.OS === 'web' ? (
                <View style={[styles.editInput, { width: 50, justifyContent: 'center', alignItems: 'center', padding: 0 }]}>
                  <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                  {React.createElement('input', {
                    type: 'date',
                    style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' },
                    onChange: (e: any) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-');
                        setEditDob(`${d}/${m}/${y}`);
                      }
                    }
                  })}
                </View>
              ) : (
                <Pressable onPress={() => setShowDobPicker(true)} style={[styles.editInput, { width: 50, justifyContent: 'center', alignItems: 'center', padding: 0 }]}>
                  <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                </Pressable>
              )}
            </View>
            {showDobPicker && Platform.OS !== 'web' && (
              <DateTimePicker
                value={getInitialDate()}
                mode="date"
                display="default"
                onChange={handleDobChange}
              />
            )}

            <Text style={styles.editLabel}>Email Address</Text>
            <TextInput style={styles.editInput} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" />

            <Text style={styles.editLabel}>Phone Number</Text>
            <TextInput style={styles.editInput} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />

            <Text style={styles.editLabel}>Occupation</Text>
            <TextInput style={styles.editInput} value={editOccupation} onChangeText={setEditOccupation} />

            <Text style={styles.editLabel}>Address</Text>
            <TextInput style={styles.editInput} value={editAddress} onChangeText={setEditAddress} multiline />

            <Text style={styles.editLabel}>Status</Text>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
              {MEMBER_STATUS_VALUES.map(s => (
                <Pressable 
                  key={s} 
                  style={[
                    styles.statusChip,
                    editStatus === s && styles.statusChipActive,
                    !(isChairOrVice || canProposeRestricted) && styles.inputReadOnly,
                  ]}
                  onPress={() => (isChairOrVice || canProposeRestricted) && setEditStatus(s)}
                >
                  <Text style={[styles.statusChipText, editStatus === s && styles.statusChipTextActive]}>{MEMBER_STATUS_LABELS[s]}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.editLabel}>Status Date</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TextInput
                style={[styles.editInput, { flex: 1 }, !(isChairOrVice || canProposeRestricted) && styles.inputReadOnly]}
                value={editStatusDate}
                onChangeText={setEditStatusDate}
                placeholder="DD/MM/YYYY"
                editable={isChairOrVice || canProposeRestricted}
              />
              {Platform.OS === "web" ? (
                <View style={[styles.editInput, { width: 50, justifyContent: "center", alignItems: "center", padding: 0, position: "relative" }]}>
                  <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                  {React.createElement("input", {
                    type: "date",
                    style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" },
                    disabled: !(isChairOrVice || canProposeRestricted),
                    onChange: (e: any) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split("-");
                        setEditStatusDate(`${d}/${m}/${y}`);
                      }
                    },
                  })}
                </View>
              ) : (
                <Pressable
                  onPress={() => (isChairOrVice || canProposeRestricted) && setShowStatusDatePicker(true)}
                  style={[styles.editInput, { width: 50, justifyContent: "center", alignItems: "center", padding: 0 }, !(isChairOrVice || canProposeRestricted) && styles.inputReadOnly]}
                >
                  <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                </Pressable>
              )}
            </View>
            {showStatusDatePicker && Platform.OS !== "web" && (
              <DateTimePicker value={getParsedDate(editStatusDate)} mode="date" display="default" onChange={handleStatusDateChange} />
            )}

            <Text style={styles.editLabel}>Status Note</Text>
            <TextInput style={styles.editInput} value={editStatusNote} onChangeText={setEditStatusNote} multiline />

            <View style={styles.familySectionHeader}>
              <Text style={styles.editLabel}>မိသားစုဝင်များ</Text>
              <Pressable style={styles.addFamilyBtn} onPress={addFamilyMember}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addFamilyBtnText}>ထည့်မည်</Text>
              </Pressable>
            </View>
            {editFamilyMembers.length === 0 ? (
              <Text style={styles.emptyText}>မိသားစုဝင်အချက်အလက် မထည့်ရသေးပါ။</Text>
            ) : (
              editFamilyMembers.map((row, index) => (
                <View key={row._localId} style={styles.familyCard}>
                  <View style={styles.familyCardHeader}>
                    <Text style={styles.familyCardTitle}>မိသားစုဝင် #{index + 1}</Text>
                    <Pressable onPress={() => removeFamilyMember(row._localId)}>
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </Pressable>
                  </View>

                  <TextInput
                    style={styles.editInput}
                    value={row.name}
                    onChangeText={(value) => updateFamilyMember(row._localId, "name", value)}
                    placeholder="အမည်"
                  />
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {MEMBER_GENDER_VALUES.map((g) => (
                      <Pressable
                        key={`${row._localId}-${g}`}
                        style={[styles.statusChip, row.gender === g && styles.statusChipActive]}
                        onPress={() => updateFamilyMember(row._localId, "gender", g)}
                      >
                        <Text style={[styles.statusChipText, row.gender === g && styles.statusChipTextActive]}>
                          {MEMBER_GENDER_LABELS[g]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    style={styles.editInput}
                    value={row.relation || ""}
                    onChangeText={(value) => updateFamilyMember(row._localId, "relation", value)}
                    placeholder="တော်စပ်ပုံ"
                  />
                  <TextInput
                    style={styles.editInput}
                    value={row.dob || ""}
                    onChangeText={(value) => updateFamilyMember(row._localId, "dob", value)}
                    placeholder="မွေးသက္ကရာဇ်"
                  />
                  <TextInput
                    style={styles.editInput}
                    value={row.nrc || ""}
                    onChangeText={(value) => updateFamilyMember(row._localId, "nrc", value)}
                    placeholder="နိုင်ငံသားစီစစ်ရေးကဒ်အမှတ်"
                  />
                  <TextInput
                    style={styles.editInput}
                    value={row.occupation || ""}
                    onChangeText={(value) => updateFamilyMember(row._localId, "occupation", value)}
                    placeholder="အလုပ်အကိုင်"
                  />
                </View>
              ))
            )}

            {(canDeleteAll || canProposeChanges) && (
              <Pressable style={styles.deleteBtn} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
                <Text style={styles.deleteBtnText}>{canDeleteAll ? "Delete Member" : "Propose Delete"}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View>
            <View style={styles.infoCard}>
              <InfoRow 
                icon={member.status === 'active' ? "checkmark-circle-outline" : "alert-circle-outline"} 
                label="အခြေအနေ" 
                value={statusLabel} 
              />
              <InfoRow icon="male-female-outline" label="ကျား / မ / အခြား" value={MEMBER_GENDER_LABELS[resolvedGender]} />
              <InfoRow icon="ribbon-outline" label="ရာထူး" value={ORG_POSITION_LABELS[(member.orgPosition || "member") as OrgPosition]} />
              <InfoRow icon="gift-outline" label="မွေးသက္ကရာဇ်" value={member.dob} />
              {member.status !== 'active' && <InfoRow icon="calendar-outline" label="ရက်စွဲ" value={member.statusDate || member.resignDate} />}
              {member.status !== 'active' && member.statusNote && <InfoRow icon="document-text-outline" label="မှတ်ချက်" value={member.statusNote} />}
              <InfoRow icon="mail-outline" label="Email" value={member.email} />
              <InfoRow icon="call-outline" label="Phone" value={member.phone} />
              <InfoRow icon="briefcase-outline" label="Occupation" value={(member as any).occupation} />
              <InfoRow icon="location-outline" label="Address" value={member.address} />
            </View>

            {canViewFinanceSection && (
              <>
                <Text style={styles.sectionTitle}>Financial Report</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>စုစုပေါင်း ပေးသွင်း</Text>
                    <Text style={[styles.statValue, { color: Colors.light.success }]}>{stats.totalIncome.toLocaleString()} KS</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>စုစုပေါင်း ထုတ်ယူ</Text>
                    <Text style={[styles.statValue, { color: Colors.light.accent }]}>{stats.totalExpense.toLocaleString()} KS</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>လစဉ်ကြေး ပေးသွင်း</Text>
                    <Text style={[styles.statValue, { color: Colors.light.tint }]}>{stats.feesPaid.toLocaleString()} KS</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statLabel}>ချေးငွေ လက်ကျန်</Text>
                    <Text style={[styles.statValue, { color: "#F59E0B" }]}>{stats.loanOutstanding.toLocaleString()} KS</Text>
                    <Text style={styles.statSub}>{stats.activeLoans} active loans</Text>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>Recent Transactions</Text>
                {memberTxns.length > 0 ? (
                  memberTxns.slice(0, 5).map((t: any) => (
                    <View key={t.id} style={styles.txnRow}>
                      <View style={[styles.txnIcon, { backgroundColor: t.type === 'income' ? Colors.light.success + "15" : Colors.light.accent + "15" }]}>
                        <Ionicons name={t.type === 'income' ? "arrow-down" : "arrow-up"} size={16} color={t.type === 'income' ? Colors.light.success : Colors.light.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txnCat}>{t.categoryLabel || CATEGORY_LABELS[t.category as keyof typeof CATEGORY_LABELS] || t.category}</Text>
                        <Text style={styles.txnDate}>{new Date(t.date).toLocaleDateString()}</Text>
                      </View>
                      <Text style={[styles.txnAmount, { color: t.type === 'income' ? Colors.light.success : Colors.light.accent }]}>
                        {t.type === 'income' ? "+" : "-"}{t.amount.toLocaleString()}
                      </Text>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No transactions found</Text>
                  </View>
                )}
                <View style={{ height: 20 }} />
              </>
            )}

            <Text style={styles.sectionTitle}>Groups</Text>
            {memberGroups.length > 0 ? (
              memberGroups.map((g: any) => (
                <View key={g.id} style={styles.groupChip}>
                  <View style={[styles.groupDot, { backgroundColor: g.color }]} />
                  <Text style={styles.groupChipText}>{g.name}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>Not assigned to any groups</Text>
            )}

            <Text style={styles.sectionTitle}>မိသားစုဝင်များ</Text>
            {Array.isArray((member as any).familyMembers) && (member as any).familyMembers.length > 0 ? (
              ((member as any).familyMembers as MemberFamilyMember[]).map((row, idx) => (
                <View key={`${member.id}-family-${idx}`} style={styles.groupChip}>
                  <View style={styles.infoContent}>
                    <Text style={styles.groupChipText}>
                      {row.name} {row.relation ? `(${row.relation})` : ""}
                    </Text>
                    <Text style={styles.emptyText}>
                      {row.gender ? MEMBER_GENDER_LABELS[row.gender] : "-"} • DOB: {row.dob || "-"} • NRC: {row.nrc || "-"}
                    </Text>
                    <Text style={styles.emptyText}>Occupation: {row.occupation || "-"}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>မိသားစုဝင်အချက်အလက် မရှိသေးပါ။</Text>
            )}
          </View>
        )}
      </ScrollView>

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
                <Pressable key={key} style={styles.modalOption} onPress={() => { setEditOrgPosition(key as OrgPosition); setShowPositionPicker(false); }}>
                  <Text style={[styles.modalOptionText, editOrgPosition === key && { color: Colors.light.tint, fontWeight: '600' }]}>{label}</Text>
                  {editOrgPosition === key && <Ionicons name="checkmark" size={20} color={Colors.light.tint} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, backgroundColor: Colors.light.surface },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  editBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  content: { padding: 20 },
  profileHeader: { alignItems: "center", marginBottom: 30 },
  avatar: { width: 80, height: 80, borderRadius: 40, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  avatarText: { fontSize: 32, color: "#fff", fontWeight: "bold" },
  name: { fontSize: 22, fontWeight: "700", color: Colors.light.text },
  joinDate: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 4 },
  cardBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.tint, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 16, gap: 6 },
  cardBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  infoCard: { backgroundColor: Colors.light.surface, borderRadius: 16, padding: 16, marginBottom: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.light.background, justifyContent: "center", alignItems: "center", marginRight: 12 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, color: Colors.light.textSecondary },
  infoValue: { fontSize: 15, color: Colors.light.text },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12, color: Colors.light.text },
  groupChip: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surface, borderRadius: 12, padding: 14, marginBottom: 8, gap: 10 },
  groupDot: { width: 10, height: 10, borderRadius: 5 },
  groupChipText: { fontSize: 14, color: Colors.light.text },
  emptyText: { color: Colors.light.textSecondary, fontSize: 14, fontStyle: "italic" },
  editForm: { gap: 4 },
  editLabel: { fontSize: 12, fontWeight: "600", color: Colors.light.textSecondary, marginTop: 12 },
  editInput: { backgroundColor: Colors.light.surface, borderRadius: 10, padding: 12, fontSize: 16, color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border },
  inputReadOnly: { opacity: 0.65 },
  dropdown: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.light.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.light.border },
  dropdownText: { fontSize: 16, color: Colors.light.text },
  profileEditRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  profileEditBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: Colors.light.surface,
  },
  profileEditPreview: { width: "100%", height: "100%" },
  profileTextBtn: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Colors.light.surface,
  },
  profileTextBtnLabel: { color: Colors.light.tint, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  profileRemoveBtn: {
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FEF2F2",
  },
  profileRemoveBtnText: { color: "#DC2626", fontSize: 12, fontFamily: "Inter_600SemiBold" },
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
  familyCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    gap: 8,
  },
  familyCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  familyCardTitle: { color: Colors.light.text, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, marginTop: 20 },
  deleteBtnText: { color: "#EF4444", fontWeight: "600" },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: { width: '48%', backgroundColor: Colors.light.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border },
  statLabel: { fontSize: 11, color: Colors.light.textSecondary, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: "700" },
  statSub: { fontSize: 10, color: Colors.light.textSecondary, marginTop: 2 },
  txnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.light.border, gap: 12 },
  txnIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  txnCat: { fontSize: 14, fontWeight: "600", color: Colors.light.text },
  txnDate: { fontSize: 11, color: Colors.light.textSecondary },
  txnAmount: { fontSize: 14, fontWeight: "700" },
  emptyState: { padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.surface, borderRadius: 12, marginBottom: 20 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { width: "80%", backgroundColor: Colors.light.surface, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 15, textAlign: "center" },
  modalOption: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  modalOptionText: { fontSize: 16, color: Colors.light.text },
  statusChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  statusChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  statusChipText: { fontSize: 12, color: Colors.light.textSecondary },
  statusChipTextActive: { color: "#fff" },
});

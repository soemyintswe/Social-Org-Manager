import React, { useState, useEffect } from "react";
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
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { ORG_POSITION_LABELS, OrgPosition, MemberStatus, MEMBER_STATUS_VALUES, MEMBER_STATUS_LABELS } from "@/lib/types";
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

export default function AddMemberScreen() {
  const insets = useSafeAreaInsets();
  const { members, addMember, updateMember, transactions, loans, groups, updateTransaction, updateLoan, updateGroup } = useData() as any;
  const { editId } = useLocalSearchParams<{ editId: string }>();

  // Form States
  const [name, setName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [phone, setPhone] = useState("");
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
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [showJoinDatePicker, setShowJoinDatePicker] = useState(false);
  const [showStatusDatePicker, setShowStatusDatePicker] = useState(false);
  const [showPositionPicker, setShowPositionPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editId) {
      const member = members.find((m: any) => m.id === editId);
      if (member) {
        setName(member.name);
        setMemberId(member.id);
        setPhone(member.phone);
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
      }
    }
  }, [editId, members]);

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
    } catch (e) {
      Alert.alert("Error", "ပုံရွေးချယ်၍ မရပါ။");
    }
  };

  const canSave = name.trim().length > 0 && memberId.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    try {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // ID ပြောင်းလဲမှုရှိမရှိ စစ်ဆေးခြင်း (Edit Mode တွင်သာ)
      if (editId && memberId.trim() !== editId) {
        const existing = members.find((m: any) => m.id === memberId.trim());
        if (existing) {
          Alert.alert("Error", "ဤ Member ID ဖြင့် အသင်းဝင်ရှိပြီးသားဖြစ်နေပါသည်။");
          setSaving(false);
          return;
        }

        // Cascade Update: Transactions
        const memberTxns = transactions?.filter((t: any) => t.memberId === editId) || [];
        for (const txn of memberTxns) {
          if (updateTransaction) await updateTransaction(txn.id, { ...txn, memberId: memberId.trim() });
        }

        // Cascade Update: Loans
        const memberLoans = loans?.filter((l: any) => l.memberId === editId) || [];
        for (const loan of memberLoans) {
          if (updateLoan) await updateLoan(loan.id, { ...loan, memberId: memberId.trim() });
        }

        // Cascade Update: Groups
        const memberGroups = groups?.filter((g: any) => g.memberIds.includes(editId)) || [];
        for (const group of memberGroups) {
          const newMemberIds = group.memberIds.map((mid: string) => mid === editId ? memberId.trim() : mid);
          if (updateGroup) await updateGroup(group.id, { ...group, memberIds: newMemberIds });
        }
      }

      const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

      // TypeScript Error ကို ရှင်းရန် 'any' သုံးပြီး property အားလုံးကို ထည့်သွင်းပါမည်
      const memberData: any = {
        id: memberId,
        name: name.trim(),
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
        createdAt: new Date().toISOString(),
      };

      if (editId) {
        await updateMember(editId, memberData);
      } else {
        await addMember(memberData);
      }
      router.back();
    } catch (error) {
      console.error(error);
      Alert.alert("အမှားအယွင်း", "သိမ်းဆည်းရာတွင် အဆင်မပြေပါ။");
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
            <Pressable onPress={pickImage} style={[styles.imagePicker, !profileImage && name ? { backgroundColor: Colors.light.tint } : undefined]}>
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
              <Pressable onPress={() => setProfileImage(null)} style={styles.removeImageBtn}>
                <Text style={styles.removeImageText}>ဖယ်ရှားမည်</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.label}>အသင်းဝင်အမှတ် (ID)</Text>
          <TextInput
            style={styles.input}
            placeholder="ဥပမာ- ရဆသ-၀၀၁"
            value={memberId}
            onChangeText={setMemberId}
            placeholderTextColor={Colors.light.textSecondary}
            editable={true} 
          />

          <Text style={styles.label}>အမည်</Text>
          <TextInput
            style={styles.input}
            placeholder="အမည်အပြည့်အစုံ"
            value={name}
            onChangeText={setName}
            placeholderTextColor={Colors.light.textSecondary}
          />

          <Text style={styles.label}>ဖုန်းနံပါတ်</Text>
          <TextInput
            style={styles.input}
            placeholder="၀၉..."
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholderTextColor={Colors.light.textSecondary}
          />

          <Text style={styles.label}>မှတ်ပုံတင်အမှတ်</Text>
          <TextInput
            style={styles.input}
            placeholder="၁၂/သကတ(နိုင်)...."
            value={nrc}
            onChangeText={setNrc}
            placeholderTextColor={Colors.light.textSecondary}
          />

          <Text style={styles.label}>မွေးသက္ကရာဇ်</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="ရက်.လ.ခုနှစ် (သို့) မြန်မာသက္ကရာဇ်"
              value={dob}
              onChangeText={setDob}
              placeholderTextColor={Colors.light.textSecondary}
            />
            {Platform.OS === 'web' ? (
              <View style={[styles.datePickerBtn, { position: 'relative' }]}>
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
                style={styles.datePickerBtn}
                onPress={() => setShowDobPicker(true)}
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
            style={[styles.input, { height: 80, textAlignVertical: "top" }]}
            placeholder="အိမ်အမှတ်၊ လမ်း၊ ရပ်ကွက်..."
            value={address}
            onChangeText={setAddress}
            multiline
            placeholderTextColor={Colors.light.textSecondary}
          />

          <Text style={styles.label}>အသင်းဝင်သည့်နေ့</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="ရက်.လ.ခုနှစ် (DD/MM/YYYY)"
              value={joinDate}
              onChangeText={setJoinDate}
              placeholderTextColor={Colors.light.textSecondary}
            />
            {Platform.OS === 'web' ? (
              <View style={[styles.datePickerBtn, { position: 'relative' }]}>
                <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                {React.createElement('input', {
                  type: 'date',
                  style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' },
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
                style={styles.datePickerBtn}
                onPress={() => setShowJoinDatePicker(true)}
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
          <Pressable style={styles.dropdown} onPress={() => setShowPositionPicker(true)}>
            <Text style={styles.dropdownText}>{ORG_POSITION_LABELS[orgPosition]}</Text>
            <Ionicons name="chevron-down" size={20} color={Colors.light.textSecondary} />
          </Pressable>

          <Text style={styles.label}>အခြေအနေ (Status)</Text>
          <View style={styles.statusRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MEMBER_STATUS_VALUES.map((s) => (
              <Pressable
                key={s}
                style={[styles.statusChip, status === s ? styles.statusChipActive : undefined]}
                onPress={() => setStatus(s)}
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
              style={[styles.input, { flex: 1 }]}
              placeholder="ရက်.လ.ခုနှစ် (ရှိလျှင်)"
              value={statusDate}
              onChangeText={setStatusDate}
              placeholderTextColor={Colors.light.textSecondary}
            />
            {Platform.OS === 'web' ? (
              <View style={[styles.datePickerBtn, { position: 'relative' }]}>
                <Ionicons name="calendar-outline" size={24} color={Colors.light.textSecondary} />
                {React.createElement('input', {
                  type: 'date',
                  style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' },
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
                style={styles.datePickerBtn}
                onPress={() => setShowStatusDatePicker(true)}
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
            style={[styles.input, { height: 60, textAlignVertical: "top" }]}
            placeholder="အကြောင်းအရင်း..."
            value={statusNote}
            onChangeText={setStatusNote}
            multiline
            placeholderTextColor={Colors.light.textSecondary}
          />
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
});
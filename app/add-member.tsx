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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
<<<<<<< HEAD
import * as ImagePicker from "expo-image-picker";
=======
import * as Haptics from "expo-haptics";
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";

// AVATAR အတွက် အရောင်ကျပန်း ရွေးချယ်ပေးရန်
const AVATAR_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

export default function AddMemberScreen() {
  const insets = useSafeAreaInsets();
<<<<<<< HEAD
  const { members, addMember, editMember } = useData() as any;
=======
  const { members, addMember, updateMember } = useData();
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
  const { editId } = useLocalSearchParams<{ editId: string }>();

  // Form States
  const [name, setName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [phone, setPhone] = useState("");
  const [nrc, setNrc] = useState("");
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
<<<<<<< HEAD
  const [joinDate, setJoinDate] = useState(new Date().toLocaleDateString("en-GB"));
  const [resignDate, setResignDate] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [profileImage, setProfileImage] = useState<string | null>(null);
=======
  const [status, setStatus] = useState<"active" | "inactive">("active");
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editId) {
<<<<<<< HEAD
      const member = members.find((m: any) => m.id === editId);
=======
      const member = members.find((m) => m.id === editId);
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
      if (member) {
        setName(member.name);
        setMemberId(member.id);
        setPhone(member.phone);
        // @ts-ignore - nrc နှင့် dob က type ထဲမှာ မပါခဲ့ရင် error မတက်စေရန်
        setNrc(member.nrc || "");
        // @ts-ignore
        setDob(member.dob || "");
        setAddress(member.address || "");
<<<<<<< HEAD
        setJoinDate(member.joinDate || "");
        setResignDate(member.resignDate || "");
        setStatus(member.status);
        setProfileImage(member.profileImage || null);
=======
        setStatus(member.status);
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
      }
    }
  }, [editId, members]);

<<<<<<< HEAD
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
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

=======
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
  const canSave = name.trim().length > 0 && memberId.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    try {
<<<<<<< HEAD
=======
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
      const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

      // TypeScript Error ကို ရှင်းရန် 'any' သုံးပြီး property အားလုံးကို ထည့်သွင်းပါမည်
      const memberData: any = {
        id: memberId,
        name: name.trim(),
        phone: phone.trim(),
        nrc: nrc.trim(),
        dob: dob.trim(),
        address: address.trim(),
<<<<<<< HEAD
        joinDate: joinDate.trim(),
        resignDate: resignDate.trim(),
=======
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
        status: status,
        role: "member", // Missing 'role' ကို ထည့်လိုက်ပါသည်
        avatarColor: randomColor, // Missing 'color' (သို့) 'avatarColor' အတွက်
        color: randomColor, 
<<<<<<< HEAD
        profileImage: profileImage || undefined,
        createdAt: new Date().toISOString(),
      };

      if (editId) {
        await editMember(editId, memberData);
=======
        createdAt: new Date().toISOString(),
        joinDate: new Date().toLocaleDateString("en-GB"),
      };

      if (editId) {
        await updateMember(editId, memberData);
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
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
<<<<<<< HEAD
            <Text style={[styles.saveBtn, !canSave ? { opacity: 0.5 } : undefined]}>သိမ်းမည်</Text>
=======
            <Text style={[styles.saveBtn, !canSave && { opacity: 0.5 }]}>သိမ်းမည်</Text>
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
          )}
        </Pressable>
      </View>

<<<<<<< HEAD
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardAvoidingView}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.imageContainer}>
            <Pressable onPress={pickImage} style={styles.imagePicker}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.profileImage} />
              ) : (
                <View style={styles.placeholderImage}>
                  <Ionicons name="camera" size={32} color={Colors.light.textSecondary} />
                  <Text style={styles.addPhotoText}>ဓာတ်ပုံထည့်ရန်</Text>
                </View>
              )}
            </Pressable>
            {profileImage && (
              <Pressable onPress={() => setProfileImage(null)} style={styles.removeImageBtn}>
                <Text style={styles.removeImageText}>ဖယ်ရှားမည်</Text>
              </Pressable>
            )}
          </View>

=======
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
          <Text style={styles.label}>အသင်းဝင်အမှတ် (ID)</Text>
          <TextInput
            style={styles.input}
            placeholder="ဥပမာ- ရဆသ-၀၀၁"
            value={memberId}
            onChangeText={setMemberId}
            placeholderTextColor={Colors.light.textSecondary}
            editable={!editId} // Edit လုပ်ချိန်တွင် ID ပြောင်းမရအောင် တားထားခြင်း
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
          <TextInput
            style={styles.input}
            placeholder="ရက်.လ.ခုနှစ် သို့မဟုတ် မြန်မာသက္ကရာဇ်"
            value={dob}
            onChangeText={setDob}
            placeholderTextColor={Colors.light.textSecondary}
          />

          <Text style={styles.label}>နေရပ်လိပ်စာ</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: "top" }]}
            placeholder="အိမ်အမှတ်၊ လမ်း၊ ရပ်ကွက်..."
            value={address}
            onChangeText={setAddress}
            multiline
            placeholderTextColor={Colors.light.textSecondary}
          />

<<<<<<< HEAD
          <Text style={styles.label}>အသင်းဝင်သည့်နေ့</Text>
          <TextInput
            style={styles.input}
            placeholder="ရက်.လ.ခုနှစ် (DD/MM/YYYY)"
            value={joinDate}
            onChangeText={setJoinDate}
            placeholderTextColor={Colors.light.textSecondary}
          />

=======
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
          <Text style={styles.label}>အခြေအနေ (Status)</Text>
          <View style={styles.statusRow}>
            {(["active", "inactive"] as const).map((s) => (
              <Pressable
                key={s}
<<<<<<< HEAD
                style={[styles.statusChip, status === s ? styles.statusChipActive : undefined]}
                onPress={() => setStatus(s)}
              >
                <Text style={[styles.statusChipText, status === s ? styles.statusChipTextActive : undefined]}>
=======
                style={[styles.statusChip, status === s && styles.statusChipActive]}
                onPress={() => setStatus(s)}
              >
                <Text style={[styles.statusChipText, status === s && styles.statusChipTextActive]}>
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
                  {s === "active" ? "ပုံမှန်" : "နုတ်ထွက်"}
                </Text>
              </Pressable>
            ))}
          </View>
<<<<<<< HEAD

          <Text style={styles.label}>နှုတ်ထွက်သည့်နေ့</Text>
          <TextInput
            style={styles.input}
            placeholder="ရက်.လ.ခုနှစ် (ရှိလျှင်)"
            value={resignDate}
            onChangeText={setResignDate}
            placeholderTextColor={Colors.light.textSecondary}
          />
=======
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
        </ScrollView>
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
  statusRow: { flexDirection: "row", gap: 10, marginTop: 5 },
  statusChip: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  statusChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  statusChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  statusChipTextActive: { color: "#fff" },
<<<<<<< HEAD
  keyboardAvoidingView: { flex: 1 },
  imageContainer: { alignItems: "center", marginBottom: 24 },
  imagePicker: { width: 100, height: 100, borderRadius: 50, overflow: "hidden", backgroundColor: Colors.light.surface, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Colors.light.border },
  profileImage: { width: "100%", height: "100%" },
  placeholderImage: { alignItems: "center", justifyContent: "center" },
  addPhotoText: { fontSize: 10, color: Colors.light.textSecondary, marginTop: 4, fontFamily: "Inter_500Medium" },
  removeImageBtn: { marginTop: 8 },
  removeImageText: { color: "#EF4444", fontSize: 13, fontFamily: "Inter_500Medium" },
=======
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
});
import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  Modal,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";

const getAvatarLabel = (name: string) => {
  if (!name) return "?";
  let text = name.trim();
  const prefixes = ["ဆရာတော်", "ဦး", "ဒေါ်", "မောင်", "ကို", "မ"];
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
  return text.charAt(0);
};

export default function AddLoanScreen() {
  const insets = useSafeAreaInsets();
<<<<<<< HEAD
  const { members, addLoan } = useData() as any;

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
=======
  const { addLoan, addTransaction, members } = useData();

  const [memberId, setMemberId] = useState("");
  const [principal, setPrincipal] = useState("");
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
  const [interestRate, setInterestRate] = useState("");
  const [loanDate, setLoanDate] = useState(new Date().toLocaleDateString("en-GB"));
  const [notes, setNotes] = useState("");
  
  const [isDropdownVisible, setDropdownVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedMember = members.find((m: any) => m.id === selectedMemberId);

  const handleSave = async () => {
<<<<<<< HEAD
    if (!selectedMemberId) {
      Alert.alert("လိုအပ်ချက်", "အသင်းဝင်ကို ရွေးချယ်ပေးပါ။");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("လိုအပ်ချက်", "ချေးငွေပမာဏကို မှန်ကန်စွာ ထည့်သွင်းပေးပါ။");
      return;
    }
    
    setSaving(true);
    try {
      const loanData = {
        id: Date.now().toString(),
        memberId: selectedMemberId,
        amount: parseFloat(amount),
        interestRate: parseFloat(interestRate) || 0,
        date: loanDate,
        status: 'active',
        notes: notes,
      };
      // await addLoan(loanData); // You might need to implement this in your DataContext
      console.log("Saving Loan:", loanData);
      Alert.alert("အောင်မြင်ပါသည်", "ချေးငွေစာရင်းကို မှတ်တမ်းတင်ပြီးပါပြီ။");
      router.back();

    } catch (error) {
      Alert.alert("အမှားအယွင်း", "သိမ်းဆည်းရာတွင် အဆင်မပြေပါ။");
=======
    if (!canSave) return;

    setSaving(true);
    try {
      const amountValue = parseFloat(principal);
      const now = new Date().toISOString();

      // နာမည် နှစ်မျိုးလုံးထည့်ပေးခြင်းဖြင့် TypeScript Error ကို ကျော်ဖြတ်ပါမည်
      const loanData: any = {
        memberId,
        amount: amountValue,
        principalAmount: amountValue,
        interestRate: parseFloat(interestRate),
        startDate: issueDate,
        issueDate: issueDate,
        status: "active",
        description: description.trim(),
        createdAt: now,
      };

      const newLoan = await addLoan(loanData);

      await addTransaction({
        type: "expense",
        category: "loan_issued",
        amount: amountValue,
        memberId,
        description: `Loan issued to ${members.find(m => m.id === memberId)?.name || 'Member'}`,
        date: issueDate,
        paymentMethod,
        receiptNumber: generateReceiptNumber(),
        loanId: newLoan.id,
        createdAt: now,
      });

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "ချေးငွေစာရင်း သိမ်းဆည်း၍ မရပါ။");
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
    } finally {
      setSaving(false);
    }
  };

  return (
<<<<<<< HEAD
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>ချေးငွေထုတ်ပေးရန်</Text>
        <Pressable onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtn}>သိမ်းမည်</Text>
=======
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 || webTopInset }]}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="close" size={26} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>New Loan</Text>
        <Pressable 
          onPress={handleSave} 
          disabled={!canSave || saving}
          style={({ pressed }) => [{ opacity: !canSave || saving ? 0.5 : pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.saveBtn}>{saving ? "Saving..." : "Save"}</Text>
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.form}>
<<<<<<< HEAD
        <Text style={styles.label}>အသင်းဝင် ရွေးချယ်ရန်</Text>
        <Pressable style={styles.dropdown} onPress={() => setDropdownVisible(true)}>
          <Text style={selectedMember ? styles.dropdownText : styles.dropdownPlaceholder}>
            {selectedMember ? selectedMember.name : "အသင်းဝင်ကို ရွေးပါ"}
          </Text>
          <Ionicons name="chevron-down" size={20} color={Colors.light.textSecondary} />
        </Pressable>

        <Text style={styles.label}>ချေးငွေ ပမာဏ</Text>
        <TextInput style={styles.input} placeholder="ဥပမာ- 100000" value={amount} onChangeText={setAmount} keyboardType="numeric" />

        <Text style={styles.label}>အတိုးနှုန်း (%)</Text>
        <TextInput style={styles.input} placeholder="ဥပမာ- 3" value={interestRate} onChangeText={setInterestRate} keyboardType="numeric" />

        <Text style={styles.label}>ထုတ်ချေးသည့်နေ့</Text>
        <TextInput style={styles.input} value={loanDate} onChangeText={setLoanDate} />

        <Text style={styles.label}>မှတ်ချက်</Text>
        <TextInput style={[styles.input, { height: 100, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} multiline />
=======
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Select Member</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberScroll}>
            {members.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => setMemberId(m.id)}
                style={[styles.memberChip, memberId === m.id && styles.memberChipActive]}
              >
                <Text style={[styles.memberChipText, memberId === m.id && styles.memberChipTextActive]}>
                  {m.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Principal Amount</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            keyboardType="numeric"
            value={principal}
            onChangeText={setPrincipal}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Interest Rate (%)</Text>
          <TextInput
            style={styles.input}
            placeholder="0.0"
            keyboardType="numeric"
            value={interestRate}
            onChangeText={setInterestRate}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Issue Date</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={issueDate}
            onChangeText={setIssueDate}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Payment Method</Text>
          <View style={styles.typeRow}>
            {["cash", "bank"].map((method) => (
              <Pressable
                key={method}
                style={[styles.methodChip, paymentMethod === method && styles.methodChipActive]}
                onPress={() => setPaymentMethod(method as any)}
              >
                <Text style={[styles.methodText, paymentMethod === method && styles.methodTextActive]}>
                  {method.charAt(0).toUpperCase() + method.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, { height: 100 }]}
            placeholder="Notes..."
            multiline
            value={description}
            onChangeText={setDescription}
          />
        </View>
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
      </ScrollView>

      <Modal animationType="slide" transparent={true} visible={isDropdownVisible} onRequestClose={() => setDropdownVisible(false)}>
        <View style={styles.modalContainer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDropdownVisible(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>အသင်းဝင်များ</Text>
            <FlatList
              data={members}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable style={styles.memberItem} onPress={() => { setSelectedMemberId(item.id); setDropdownVisible(false); }}>
                  {item.profileImage ? ( <Image source={{ uri: item.profileImage }} style={styles.avatar} /> ) : (
                   <View style={[styles.avatar, { backgroundColor: item.avatarColor || Colors.light.tint }]}>
                      <Text style={styles.avatarText}>{getAvatarLabel(item.name)}</Text>
                   </View>
                  )}
                  <View>
                    <Text style={styles.memberName}>{item.name}</Text>
                    <Text style={styles.memberId}>ID: {item.id}</Text>
                  </View>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
<<<<<<< HEAD
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  backBtn: { padding: 4 },
  saveBtn: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.tint },
  form: { padding: 20 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginTop: 15, marginBottom: 6, textTransform: "uppercase" },
  input: { backgroundColor: Colors.light.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border },
  dropdown: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.light.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: Colors.light.border },
  dropdownText: { fontSize: 16, color: Colors.light.text },
  dropdownPlaceholder: { fontSize: 16, color: Colors.light.textSecondary },
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: Colors.light.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 20, textAlign: 'center' },
  memberItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold' },
  memberName: { fontSize: 16, fontFamily: "Inter_500Medium" },
  memberId: { fontSize: 12, color: Colors.light.textSecondary },
=======
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, backgroundColor: Colors.light.surface },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  saveBtn: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.tint },
  form: { padding: 20 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginBottom: 8, textTransform: "uppercase" },
  input: { backgroundColor: Colors.light.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border },
  memberScroll: { flexDirection: "row" },
  memberChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border, marginRight: 8 },
  memberChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  memberChipText: { fontSize: 13, color: Colors.light.text },
  memberChipTextActive: { color: "#fff" },
  typeRow: { flexDirection: "row", gap: 10 },
  methodChip: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  methodChipActive: { backgroundColor: Colors.light.tintLight, borderColor: Colors.light.tint },
  methodText: { fontSize: 14, color: Colors.light.text },
  methodTextActive: { color: Colors.light.tint, fontWeight: "600" },
>>>>>>> a5960b4fec64dd34e440040cc6c44fa542597eee
});
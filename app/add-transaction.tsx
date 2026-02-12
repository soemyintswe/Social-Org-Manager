import React, { useState, useMemo, useEffect } from "react";
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
import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { CATEGORY_LABELS, TransactionCategory } from "@/lib/types";

if (Platform.OS === 'web') {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (args[0] && typeof args[0] === 'string' && (args[0].includes('shadow*') || args[0].includes('pointerEvents'))) {
      return;
    }
    originalWarn(...args);
  };
}

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

const formatDateDisplay = (date: Date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const INCOME_CATEGORIES = [
  { id: "member_fees", label: "လစဉ်ကြေးရငွေ" },
  { id: "donations", label: "အလှူငွေရရှိ" },
  { id: "bank_interest", label: "ဘဏ်တိုးရငွေ" },
  { id: "other_income", label: "အခြားရငွေ" },
  { id: "loan_repayment", label: "ချေးငွေပြန်ဆပ်ရရှိငွေ" },
  { id: "interest_income", label: "အတိုးရငွေ" },
];

const EXPENSE_CATEGORIES = [
  { id: "health_support", label: "ကျန်းမာရေးထောက်ပံ့ငွေ" },
  { id: "education_support", label: "ပညာရေးထောက်ပံ့ငွေ" },
  { id: "funeral_support", label: "နာရေးကူညီငွေ" },
  { id: "loan_disbursement", label: "ချေးငွေထုတ်ပေးငွေ" },
  { id: "bank_charges", label: "ဘဏ်စရိတ်ပေးငွေ" },
  { id: "general_expenses", label: "အထွေထွေအသုံးစရိတ်" },
  { id: "other_expenses", label: "အခြားအသုံးစရိတ်" },
];

export default function AddTransactionScreen() {
  const insets = useSafeAreaInsets();
  const { members = [], addTransaction } = useData() as any;

  const [type, setType] = useState<"expense" | "income">("expense");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [payerPayeeName, setPayerPayeeName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [date, setDate] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");

  const [isMemberModalVisible, setMemberModalVisible] = useState(false);
  const [isCategoryModalVisible, setCategoryModalVisible] = useState(false);
  const [customCategories, setCustomCategories] = useState<{id: string, label: string, type: 'income' | 'expense'}[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showAddCategoryInput, setShowAddCategoryInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    let prefix = type === "income" ? "I-" : "O-";

    if (category === "bank_interest" && type === "income") {
      prefix = "BI-";
    } else if (category === "bank_charges" && type === "expense") {
      prefix = "BO-";
    }

    setReceiptNumber((prev) => {
      const knownPrefixes = ["BI-", "BO-", "I-", "O-"];
      let numberPart = prev;
      for (const p of knownPrefixes) {
        if (prev.startsWith(p)) {
          numberPart = prev.slice(p.length);
          break;
        }
      }
      return prefix + numberPart;
    });
  }, [type, category]);

  useEffect(() => {
    const loadCustomCategories = async () => {
      try {
        const stored = await AsyncStorage.getItem("@custom_categories");
        if (stored) setCustomCategories(JSON.parse(stored));
      } catch (e) {}
    };
    loadCustomCategories();
  }, []);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    const newCat = {
      id: `custom_${Date.now()}`,
      label: newCategoryName.trim(),
      type: type,
    };
    const updated = [...customCategories, newCat];
    setCustomCategories(updated);
    await AsyncStorage.setItem("@custom_categories", JSON.stringify(updated));
    setNewCategoryName("");
    setShowAddCategoryInput(false);
  };

  const availableCategories = useMemo(() => {
    const defaults = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const customs = customCategories.filter((c) => c.type === type);
    return [...defaults, ...customs];
  }, [type, customCategories]);

  const getCategoryLabel = (catId: string) => {
    const all = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, ...customCategories];
    const found = all.find((c) => c.id === catId);
    return found ? found.label : (CATEGORY_LABELS[catId as TransactionCategory] || catId);
  };

  useEffect(() => {
    if (category && !availableCategories.find(c => c.id === category)) {
      setCategory(null);
    }
  }, [type, availableCategories, category]);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDate) {
        setDate(selectedDate);
      }
    } else if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const handleSave = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("လိုအပ်ချက်", "ငွေပမာဏကို မှန်ကန်စွာ ထည့်သွင်းပေးပါ။");
      return;
    }
    if (!category) {
      Alert.alert("လိုအပ်ချက်", "အမျိုးအစားကို ရွေးချယ်ပေးပါ။");
      return;
    }

    setSaving(true);
    try {
      const transactionData = {
        id: Date.now().toString(),
        memberId: selectedMemberId || undefined,
        payerPayee: payerPayeeName.trim(),
        amount: parseFloat(amount),
        type: type,
        category: category,
        date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        notes: notes,
        receiptNumber: receiptNumber,
        categoryLabel: getCategoryLabel(category),
      };
      await addTransaction(transactionData);
      Alert.alert("အောင်မြင်ပါသည်", "ငွေစာရင်းကို မှတ်တမ်းတင်ပြီးပါပြီ။");
      router.back();
    } catch (error) {
      Alert.alert("အမှားအယွင်း", "သိမ်းဆည်းရာတွင် အဆင်မပြေပါ။");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"} 
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>ငွေစာရင်းသွင်းရန်</Text>
        <Pressable onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtn}>သိမ်းမည်</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>စာရင်းအမျိုးအစား</Text>
        <View style={styles.typeSelector}>
          <Pressable style={[styles.typeButton, type === "income" && styles.typeButtonActive]} onPress={() => setType("income")}>
            <Text style={[styles.typeButtonText, type === "income" && styles.typeButtonTextActive]}>ရငွေစာရင်း</Text>
          </Pressable>
          <Pressable style={[styles.typeButton, type === "expense" && styles.typeButtonActive]} onPress={() => setType("expense")}>
            <Text style={[styles.typeButtonText, type === "expense" && styles.typeButtonTextActive]}>အသုံးစာရင်း</Text>
          </Pressable>
          
        </View>

        <Text style={styles.label}>ငွေပမာဏ</Text>
        <TextInput 
          style={styles.input} 
          placeholder="0.00" 
          value={amount} 
          onChangeText={(text) => {
            const valid = text.replace(/[^0-9.]/g, '');
            if ((valid.match(/\./g) || []).length <= 1) setAmount(valid);
          }} 
          keyboardType="decimal-pad" 
        />

        <Text style={styles.label}>အမျိုးအစား</Text>
        <Pressable style={styles.dropdown} onPress={() => setCategoryModalVisible(true)}>
          <Text style={category ? styles.dropdownText : styles.dropdownPlaceholder}>
            {category ? getCategoryLabel(category) : "အမျိုးအစား ရွေးပါ"}
          </Text>
          <Ionicons name="chevron-down" size={20} color={Colors.light.textSecondary} />
        </Pressable>

        <Text style={styles.label}>{type === 'income' ? 'ငွေပေးသွင်းသူအမည်' : 'ငွေလက်ခံသူအမည်'}</Text>
        <View style={styles.inputWithButtonContainer}>
          <TextInput
            style={styles.inputWithButton}
            placeholder={type === 'income' ? 'အမည် ရိုက်ထည့်ပါ (သို့) စာရင်းမှရွေးပါ' : 'အမည် ရိုက်ထည့်ပါ (သို့) စာရင်းမှရွေးပါ'}
            value={payerPayeeName}
            onChangeText={(text) => {
              setPayerPayeeName(text);
              if (selectedMemberId) {
                setSelectedMemberId(null);
              }
            }}
          />
          <Pressable style={styles.inputButton} onPress={() => setMemberModalVisible(true)}>
            <Ionicons name="people-outline" size={22} color={Colors.light.tint} />
          </Pressable>
        </View>

        <Text style={styles.label}>ရက်စွဲ</Text>
        {Platform.OS === 'web' ? (
          <View style={styles.dropdown}>
            {React.createElement('input', {
              type: 'date',
              value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
              onChange: (event: any) => {
                if (event.target.value) {
                  const [y, m, d] = event.target.value.split('-');
                  setDate(new Date(+y, +m - 1, +d));
                }
              },
              style: {
                width: '100%',
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontSize: 16,
                color: Colors.light.text,
                fontFamily: 'inherit'
              } as any
            })}
          </View>
        ) : (
          <>
            <Pressable style={styles.dropdown} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.dropdownText}>{formatDateDisplay(date)}</Text>
              <Ionicons name="calendar-outline" size={20} color={Colors.light.textSecondary} />
            </Pressable>

            {showDatePicker && (
              Platform.OS === 'ios' ? (
                <Modal transparent={true} visible={showDatePicker} animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
                  <View style={styles.modalContainer}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDatePicker(false)} />
                    <View style={styles.modalContent}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
                        <Text style={[styles.modalTitle, { marginBottom: 0 }]}>ရက်စွဲရွေးပါ</Text>
                        <Pressable onPress={() => setShowDatePicker(false)}><Text style={{ color: Colors.light.tint, fontSize: 16, fontWeight: "600" }}>Done</Text></Pressable>
                      </View>
                      <DateTimePicker 
                        value={date} 
                        mode="date" 
                        display="inline" 
                        onChange={handleDateChange} 
                        style={{ alignSelf: "center", width: 320 }}
                        themeVariant="light"
                      />
                    </View>
                  </View>
                </Modal>
              ) : (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                />
              )
            )}
          </>
        )}

        <Text style={styles.label}>ဘောင်ချာနံပါတ် (ရှိလျှင်)</Text>
        <TextInput style={styles.input} placeholder="ဥပမာ- 2024-001" value={receiptNumber} onChangeText={setReceiptNumber} />

        <Text style={styles.label}>မှတ်ချက်</Text>
        <TextInput style={[styles.input, { height: 100, textAlignVertical: "top" }]} value={notes} onChangeText={setNotes} multiline />
      </ScrollView>

      <Modal animationType="slide" transparent={true} visible={isMemberModalVisible} onRequestClose={() => setMemberModalVisible(false)}>
        <View style={styles.modalContainer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMemberModalVisible(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>အသင်းဝင်များ</Text>
            <FlatList
              data={members}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable style={styles.memberItem} onPress={() => {
                  setSelectedMemberId(item.id);
                  setPayerPayeeName(item.name);
                  setMemberModalVisible(false);
                }}>
                  {item.profileImage ? <Image source={{ uri: item.profileImage }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: item.avatarColor || Colors.light.tint }]}><Text style={styles.avatarText}>{getAvatarLabel(item.name)}</Text></View>}
                  <View><Text style={styles.memberName}>{item.name}</Text><Text style={styles.memberId}>ID: {item.id}</Text></View>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent={true} visible={isCategoryModalVisible} onRequestClose={() => setCategoryModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalContainer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCategoryModalVisible(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>အမျိုးအစားများ</Text>
            
            <FlatList 
              data={availableCategories} 
              keyExtractor={(item) => item.id} 
              renderItem={({ item }) => (
                <Pressable style={styles.categoryItem} onPress={() => { setCategory(item.id); setCategoryModalVisible(false); }}>
                  <Text style={styles.categoryName}>{item.label}</Text>
                </Pressable>
              )} 
              ListFooterComponent={
                <View style={{ marginTop: 10, paddingBottom: 20 }}>
                  {showAddCategoryInput ? (
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <TextInput 
                        style={[styles.input, { flex: 1, marginBottom: 0, paddingVertical: 8 }]} 
                        placeholder="ခေါင်းစဉ်အသစ်..." 
                        value={newCategoryName}
                        onChangeText={setNewCategoryName}
                        autoFocus
                      />
                      <Pressable 
                        style={{ backgroundColor: Colors.light.tint, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 }}
                        onPress={handleAddCategory}
                      >
                        <Text style={{ color: 'white', fontWeight: 'bold' }}>Add</Text>
                      </Pressable>
                      <Pressable 
                        style={{ justifyContent: 'center', paddingHorizontal: 4 }}
                        onPress={() => setShowAddCategoryInput(false)}
                      >
                        <Ionicons name="close" size={24} color={Colors.light.text} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable 
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 12, justifyContent: 'center', borderWidth: 1, borderColor: Colors.light.border, borderRadius: 8, borderStyle: 'dashed', backgroundColor: Colors.light.surface }}
                      onPress={() => setShowAddCategoryInput(true)}
                    >
                      <Ionicons name="add" size={20} color={Colors.light.tint} />
                      <Text style={{ marginLeft: 8, color: Colors.light.tint, fontWeight: '600' }}>ခေါင်းစဉ်အသစ် ထည့်ရန်</Text>
                    </Pressable>
                  )}
                </View>
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  backBtn: { padding: 4 },
  saveBtn: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.tint },
  form: { padding: 20 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary, marginTop: 15, marginBottom: 6, textTransform: "uppercase" },
  input: { backgroundColor: Colors.light.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border },
  dropdown: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.light.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: Colors.light.border, position: 'relative' },
  dropdownText: { fontSize: 16, color: Colors.light.text },
  dropdownPlaceholder: { fontSize: 16, color: Colors.light.textSecondary },
  modalContainer: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: Colors.light.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "70%" },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 20, textAlign: "center" },
  memberItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontWeight: "bold" },
  memberName: { fontSize: 16, fontFamily: "Inter_500Medium" },
  memberId: { fontSize: 12, color: Colors.light.textSecondary },
  typeSelector: { flexDirection: "row", gap: 10, backgroundColor: Colors.light.surface, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: Colors.light.border },
  typeButton: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  typeButtonActive: { backgroundColor: Colors.light.tint },
  typeButtonText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.light.textSecondary },
  typeButtonTextActive: { color: "#fff" },
  categoryItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  categoryName: { fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center" },
  inputWithButtonContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border },
  inputWithButton: { flex: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: Colors.light.text },
  inputButton: { paddingHorizontal: 12 },
});

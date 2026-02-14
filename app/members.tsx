import React, { useState, useMemo, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  Image,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import FloatingTabMenu from "@/components/FloatingTabMenu";
import DateTimePicker from "@react-native-community/datetimepicker";

type SortOption = "id" | "name" | "joinDate" | "dob" | "age";

export default function MembersScreen() {
  const insets = useSafeAreaInsets();
  const { members, loading, refreshData } = useData() as any;
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterGender, setFilterGender] = useState<"all" | "male" | "female">("all");
  const [filterAge, setFilterAge] = useState<"all" | "under18" | "18-60" | "over60" | "upcoming" | "custom">("all");
  const [showSortModal, setShowSortModal] = useState(false);

  // Custom Age Filter State
  const [customAgeModalVisible, setCustomAgeModalVisible] = useState(false);
  const [targetDate, setTargetDate] = useState(new Date());
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [showTargetDatePicker, setShowTargetDatePicker] = useState(false);

  const convertToEnglishDigits = (str: string) => {
    const myanmarNumbers = ["၀", "၁", "၂", "၃", "၄", "၅", "၆", "၇", "၈", "၉"];
    return str.replace(/[၀-၉]/g, (s) => myanmarNumbers.indexOf(s).toString());
  };

  // DD/MM/YYYY format ကို Timestamp ပြောင်းရန်
  const parseDate = (dateStr: string) => {
    if (!dateStr) return 0;
    const cleanStr = convertToEnglishDigits(dateStr);
    const parts = cleanStr.split(/[\/\.\-]/);
    if (parts.length === 3) {
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
    }
    return 0;
  };

  // အသက်တွက်ချက်ရန်
  const calculateAge = (dobStr: string, refDate: Date = new Date()) => {
    if (!dobStr) return "";
    const cleanStr = convertToEnglishDigits(dobStr);
    const parts = cleanStr.split(/[\/\.\-]/);
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (isNaN(day) || isNaN(month) || isNaN(year)) return "";

      if (year < 1900) return ""; // Myanmar Era or invalid year

      const birthDate = new Date(year, month - 1, day);
      let age = refDate.getFullYear() - birthDate.getFullYear();
      const m = refDate.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && refDate.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    }
    return "";
  };

  const getUpcomingBirthdayDate = (dobStr: string) => {
    if (!dobStr) return null;
    const cleanStr = convertToEnglishDigits(dobStr);
    const parts = cleanStr.split(/[\/\.\-]/);
    if (parts.length !== 3) return null;
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (isNaN(day) || isNaN(month)) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);

    const oneMonthLater = new Date(today);
    oneMonthLater.setMonth(today.getMonth() + 1);
    
    const currentYear = today.getFullYear();
    const datesToCheck = [
        new Date(currentYear, month - 1, day),
        new Date(currentYear + 1, month - 1, day),
        new Date(currentYear - 1, month - 1, day)
    ];
    
    for (const date of datesToCheck) {
        if (date >= threeDaysAgo && date <= oneMonthLater) {
            return date;
        }
    }
    return null;
  };

  const sortedMembers = useMemo(() => {
    let data = [...(members || [])];

    if (filterStatus !== "all") {
      data = data.filter((m: any) => m.status === filterStatus);
    }

    if (filterAge !== "all") {
      data = data.filter((m: any) => {
        const refDate = filterAge === "custom" ? targetDate : new Date();
        const age = calculateAge(m.dob, refDate);
        
        if (filterAge === "upcoming") return !!getUpcomingBirthdayDate(m.dob);
        if (age === "") return false;
        const ageNum = typeof age === 'number' ? age : parseInt(age as string);
        if (filterAge === "under18") return ageNum < 18;
        if (filterAge === "18-60") return ageNum >= 18 && ageNum <= 60;
        if (filterAge === "over60") return ageNum > 60;
        if (filterAge === "custom") {
             const min = minAge ? parseInt(minAge) : 0;
             const max = maxAge ? parseInt(maxAge) : 999;
             return ageNum >= min && ageNum <= max;
        }
        return true;
      });
    }

    if (filterGender !== "all") {
      data = data.filter((m: any) => {
        const name = (m.name || "").trim();
        const isMale = 
          name.startsWith("ဦး") || 
          name.startsWith("ကို") || 
          name.startsWith("မောင်") || 
          name.startsWith("ဆရာတော်") || 
          name.startsWith("ကိုရင်") || 
          name.startsWith("ဦးဇင်း") || 
          name.toLowerCase().startsWith("u ") || 
          name.toLowerCase().startsWith("ko ") || 
          name.toLowerCase().startsWith("mg ");
        
        const isFemale = 
          name.startsWith("ဒေါ်") || 
          name.startsWith("မ") || 
          name.startsWith("ဆရာလေး") || 
          name.startsWith("သီလရှင်") || 
          name.toLowerCase().startsWith("daw ") || 
          name.toLowerCase().startsWith("ma ");

        if (filterGender === "male") return isMale;
        if (filterGender === "female") return isFemale;
        return true;
      });
    }

    if (search) {
      data = data.filter(m => 
        m.name.toLowerCase().includes(search.toLowerCase()) || 
        m.id.toLowerCase().includes(search.toLowerCase())
      );
    }

    return data.sort((a, b) => {
      let valA, valB;

      switch (sortBy) {
        case "id":
          valA = a.id.toString();
          valB = b.id.toString();
          return sortOrder === "asc" ? valA.localeCompare(valB, undefined, { numeric: true }) : valB.localeCompare(valA, undefined, { numeric: true });

        case "name":
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
        
        case "joinDate":
          valA = parseDate(a.joinDate);
          valB = parseDate(b.joinDate);
          return sortOrder === "asc" ? valA - valB : valB - valA;

        case "dob": 
          valA = parseDate(a.dob);
          valB = parseDate(b.dob);
          return sortOrder === "asc" ? valA - valB : valB - valA;

        case "age": 
           // Age Asc (အသက်အငယ်ဆုံးမှ အကြီးဆုံး) -> DOB Desc
           valA = parseDate(a.dob);
           valB = parseDate(b.dob);
           return sortOrder === "asc" ? valB - valA : valA - valB;
           
        default:
          return 0;
      }
    });
  }, [members, search, sortBy, sortOrder, filterStatus, filterGender, filterAge, targetDate, minAge, maxAge]);

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

  const getSortLabel = () => {
    switch (sortBy) {
      case "id": return "အသင်းဝင်အမှတ် (ID)";
      case "name": return "အမည်";
      case "joinDate": return "အသင်းဝင်ရက်";
      case "dob": return "မွေးသက္ကရာဇ်";
      case "age": return "အသက်";
    }
  };

  const handleTargetDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowTargetDatePicker(false);
    }
    if (selectedDate) {
      setTargetDate(selectedDate);
    }
  };

  const formatDateDisplay = (date: Date) => date.toLocaleDateString('en-GB');

  if (loading && (!members || members.length === 0)) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingVertical: 10 }]}>
   <Text style={styles.headerTitle}>အသင်းဝင်များ ({members?.length || 0})</Text>
        <View style={{ flexDirection: 'row', marginRight: 50, alignItems: 'center', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => router.push("/data-management")} style={styles.addBtn}>
        <Ionicons name="cloud-download-outline" size={24} color={Colors.light.tint} />
         </Pressable>
           <Pressable onPress={() => router.push("/add-member" as any)} style={styles.addBtn}>
        <Ionicons name="add" size={24} color={Colors.light.tint} />
         </Pressable>
             <Pressable  style={styles.addBtn}>
             <Ionicons name="menu-outline" size={24} color={Colors.light.tint} />
             </Pressable>
        

        </View>
      </View>


      <View>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.light.textSecondary} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="အမည် သို့မဟုတ် ID ရှာရန်..." 
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View style={styles.statusFilterRow}>
          <Pressable
            style={[styles.statusChip, filterStatus === "all" && styles.statusChipActive]}
            onPress={() => setFilterStatus("all")}
          >
            <Text style={[styles.statusChipText, filterStatus === "all" && styles.statusChipTextActive]}>အားလုံး</Text>
          </Pressable>
          <Pressable
            style={[styles.statusChip, filterStatus === "active" && styles.statusChipActive]}
            onPress={() => setFilterStatus("active")}
          >
            <Text style={[styles.statusChipText, filterStatus === "active" && styles.statusChipTextActive]}>Active</Text>
          </Pressable>
          <Pressable
            style={[styles.statusChip, filterStatus === "inactive" && styles.statusChipActive]}
            onPress={() => setFilterStatus("inactive")}
          >
            <Text style={[styles.statusChipText, filterStatus === "inactive" && styles.statusChipTextActive]}>နှုတ်ထွက်</Text>
          </Pressable>

          <Pressable
              style={[styles.statusChip, filterAge === "upcoming" && styles.statusChipActive]}
              onPress={() => setFilterAge("upcoming")}
            >
              <Text style={[styles.statusChipText, filterAge === "upcoming" && styles.statusChipTextActive]}>မွေးနေ့နီးသူများ</Text>
            </Pressable>
        </View>

        <View style={styles.statusFilterRow}>
          <Pressable
            style={[styles.statusChip, filterGender === "all" && styles.statusChipActive]}
            onPress={() => setFilterGender("all")}
          >
            <Text style={[styles.statusChipText, filterGender === "all" && styles.statusChipTextActive]}>ကျား/မ အားလုံး</Text>
          </Pressable>
          <Pressable
            style={[styles.statusChip, filterGender === "male" && styles.statusChipActive]}
            onPress={() => setFilterGender("male")}
          >
            <Text style={[styles.statusChipText, filterGender === "male" && styles.statusChipTextActive]}>အမျိုးသား</Text>
          </Pressable>
          <Pressable
            style={[styles.statusChip, filterGender === "female" && styles.statusChipActive]}
            onPress={() => setFilterGender("female")}
          >
            <Text style={[styles.statusChipText, filterGender === "female" && styles.statusChipTextActive]}>အမျိုးသမီး</Text>
          </Pressable>
        </View>

        <View style={styles.statusFilterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 3 }}>
            <Pressable
              style={[styles.statusChip, filterAge === "all" && styles.statusChipActive]}
              onPress={() => setFilterAge("all")}
            >
              <Text style={[styles.statusChipText, filterAge === "all" && styles.statusChipTextActive]}>အသက် အားလုံး</Text>
            </Pressable>

           <Pressable
              style={[styles.statusChip, filterAge === "under18" && styles.statusChipActive]}
              onPress={() => setFilterAge("under18")}
            >
              <Text style={[styles.statusChipText, filterAge === "under18" && styles.statusChipTextActive]}>18 နှစ်အောက်</Text>
            </Pressable>

            <Pressable
              style={[styles.statusChip, filterAge === "18-60" && styles.statusChipActive]}
              onPress={() => setFilterAge("18-60")}
            >
              <Text style={[styles.statusChipText, filterAge === "18-60" && styles.statusChipTextActive]}>18-60 နှစ်</Text>
            </Pressable>
            <Pressable
              style={[styles.statusChip, filterAge === "over60" && styles.statusChipActive]}
              onPress={() => setFilterAge("over60")}
            >
              <Text style={[styles.statusChipText, filterAge === "over60" && styles.statusChipTextActive]}>60 နှစ်အထက်</Text>
            </Pressable>
            
                <Pressable
                  style={[styles.statusChip, filterAge === "custom" && styles.statusChipActive]}
                  onPress={() => { setFilterAge("custom"); setCustomAgeModalVisible(true); }}
                >
                  <Text style={[styles.statusChipText, filterAge === "custom" && styles.statusChipTextActive]}>စိတ်ကြိုက် (Custom)</Text>
                </Pressable>
          </ScrollView>
        </View>

        <View style={styles.filterRow}>
          <Pressable style={styles.sortBtn} onPress={() => setShowSortModal(true)}>
            <Ionicons name="filter" size={16} color={Colors.light.text} />
            <Text style={styles.sortBtnText}>Sort by: {getSortLabel()}</Text>
            <Ionicons name="chevron-down" size={16} color={Colors.light.textSecondary} />
          </Pressable>

          <Pressable style={styles.orderBtn} onPress={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}>
            <Ionicons name={sortOrder === "asc" ? "arrow-up" : "arrow-down"} size={16} color={Colors.light.tint} />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={sortedMembers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        style={{ flex: 1 }}
        renderItem={({ item }) => (
          <Pressable 
            style={styles.memberItem} 
            onPress={() => router.push({ pathname: "/member-detail", params: { id: item.id } } as any)}
          >
            {item.profileImage ? (
              <Image source={{ uri: item.profileImage }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View style={[styles.avatar, { backgroundColor: item.avatarColor || Colors.light.tint }]}>
                <Text style={styles.avatarText}>{getAvatarLabel(item.name)}</Text>
              </View>
            )}
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{item.name}</Text>
              <Text style={styles.memberId}>ID: {item.id}</Text>
              <View style={styles.metaRow}>
                {calculateAge(item.dob, filterAge === 'custom' ? targetDate : new Date()) !== "" && (
                  <Text style={styles.metaText}>အသက်: {calculateAge(item.dob, filterAge === 'custom' ? targetDate : new Date())} နှစ်</Text>
                )}
                {(() => {
                  const upcoming = getUpcomingBirthdayDate(item.dob);
                  if (upcoming) {
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const color = upcoming < today ? '#EF4444' : '#10B981';
                    return (
                      <Text style={[styles.metaText, { color: color, marginLeft: 8, fontWeight: 'bold' }]}>
                        🎂 {upcoming.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </Text>
                    );
                  }
                  return null;
                })()}
              </View>
              <View style={styles.metaRow}>
                {sortBy === 'joinDate' && <Text style={styles.metaText}>Joined: {item.joinDate}</Text>}
                {sortBy === 'dob' && <Text style={styles.metaText}>DOB: {item.dob}</Text>}
                {sortBy === 'name' && <Text style={styles.metaText}>{item.phone}</Text>}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.light.textSecondary} />
          </Pressable>
        )}
      />

      <Modal
        visible={showSortModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSortModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSortModal(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sort By</Text>
            {["id", "name", "joinDate", "dob", "age"].map((option) => (
              <Pressable 
                key={option}
                style={styles.modalOption} 
                onPress={() => { setSortBy(option as SortOption); setShowSortModal(false); }}
              >
                <Text style={[styles.optionText, sortBy === option && styles.activeOption]}>
                  {option === "id" ? "အသင်းဝင်အမှတ် (ID)" :
                   option === "name" ? "အမည် (Name)" : 
                   option === "joinDate" ? "အသင်းဝင်ရက် (Join Date)" :
                   option === "dob" ? "မွေးသက္ကရာဇ် (Date of Birth)" : "အသက် (Age)"}
                </Text>
                {sortBy === option && <Ionicons name="checkmark" size={20} color={Colors.light.tint} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={customAgeModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCustomAgeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>စိတ်ကြိုက် အသက် Filter</Text>
            
            <Text style={styles.label}>ရည်ညွှန်းရက်စွဲ (Target Date)</Text>
            {Platform.OS === 'web' ? (
              <View style={styles.dateInputContainer}>
                {React.createElement('input', {
                  type: 'date',
                  value: targetDate.toISOString().split('T')[0],
                  onChange: (e: any) => e.target.value && setTargetDate(new Date(e.target.value)),
                  style: { border: 'none', outline: 'none', backgroundColor: 'transparent', fontSize: 16, width: '100%', color: Colors.light.text }
                })}
              </View>
            ) : (
              <>
                <Pressable style={styles.dateInputContainer} onPress={() => setShowTargetDatePicker(true)}>
                  <Text style={{ fontSize: 16, color: Colors.light.text }}>{formatDateDisplay(targetDate)}</Text>
                  <Ionicons name="calendar-outline" size={20} color={Colors.light.textSecondary} />
                </Pressable>
                {showTargetDatePicker && (
                  <DateTimePicker value={targetDate} mode="date" display="default" onChange={handleTargetDateChange} />
                )}
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>အနည်းဆုံး (Min Age)</Text>
                <TextInput style={styles.input} value={minAge} onChangeText={setMinAge} keyboardType="numeric" placeholder="0" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>အများဆုံး (Max Age)</Text>
                <TextInput style={styles.input} value={maxAge} onChangeText={setMaxAge} keyboardType="numeric" placeholder="100" />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setCustomAgeModalVisible(false)}>
                <Text style={styles.cancelText}>ပိတ်မည်</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={() => { setFilterAge("custom"); setCustomAgeModalVisible(false); }}>
                <Text style={styles.saveText}>Filter လုပ်မည်</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <FloatingTabMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
 header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 15, backgroundColor: Colors.light.surface, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  backBtn: { padding: 4 },
  addBtn: { padding: 8 },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surface, margin: 15, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.light.border, height: 44 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: Colors.light.text },
  filterRow: { flexDirection: "row", paddingHorizontal: 15, marginBottom: 10, gap: 10 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.light.text, flex: 1, textAlign: 'center' },
  sortBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: Colors.light.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border },
  sortBtnText: { fontSize: 13, color: Colors.light.text, fontFamily: "Inter_500Medium" },
  orderBtn: { width: 40, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.light.border },
  list: { paddingBottom: 40 },
  memberItem: { flexDirection: "row", alignItems: "center", padding: 15, backgroundColor: Colors.light.surface, marginHorizontal: 15, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border },
  avatar: { width: 50, height: 50, borderRadius: 25, justifyContent: "center", alignItems: "center", marginRight: 12 },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.light.text },
  memberId: { fontSize: 12, color: Colors.light.textSecondary },
  metaRow: { marginTop: 4 },
  metaText: { fontSize: 12, color: Colors.light.tint, fontFamily: "Inter_500Medium" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { width: "80%", backgroundColor: Colors.light.surface, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 15, textAlign: "center" },
  modalOption: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  optionText: { fontSize: 16, color: Colors.light.text },
  activeOption: { color: Colors.light.tint, fontFamily: "Inter_600SemiBold" },
  statusFilterRow: { flexDirection: "row", paddingHorizontal: 15, marginBottom: 10, gap: 8 },
  statusChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.light.border },
  statusChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  statusChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.light.textSecondary },
  statusChipTextActive: { color: "#fff" },
  label: { fontSize: 12, fontWeight: "600", color: Colors.light.textSecondary, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 8, padding: 10, fontSize: 14, color: Colors.light.text },
  dateInputContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: Colors.light.border, borderRadius: 8, padding: 10 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 15, marginTop: 20 },
  cancelBtn: { padding: 10 },
  cancelText: { color: Colors.light.textSecondary },
  saveBtn: { backgroundColor: Colors.light.tint, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  saveText: { color: "white", fontWeight: "bold" },
});
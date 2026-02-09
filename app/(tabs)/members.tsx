import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { Member } from "@/lib/types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function MembersScreen() {
  const insets = useSafeAreaInsets();
  const dataContext = useData(); // Context တစ်ခုလုံးကို ယူလိုက်ပါ
  const [search, setSearch] = useState("");

  // ဒေတာအဟောင်းဖျက်ပြီး ၅၇ ဦးစာရင်း ပြန်ယူရန်
  const resetToInitialData = async () => {
    Alert.alert(
      "ဒေတာများ ပြန်ယူရန်",
      "လက်ရှိဒေတာများကို ဖျက်ပြီး မူလအသင်းဝင် ၅၇ ဦးစာရင်းကို ပြန်ထည့်သွင်းမှာလား?",
      [
        { text: "မလုပ်တော့ပါ", style: "cancel" },
        { 
          text: "ပြန်ယူမည်", 
          onPress: async () => {
            try {
              await AsyncStorage.removeItem("@orghub_members");
              // App ကို Reload လုပ်ခိုင်းခြင်း သို့မဟုတ် refreshData ခေါ်ခြင်း
              if (dataContext.refreshData) {
                await dataContext.refreshData();
              } else {
                Alert.alert("အောင်မြင်ပါသည်", "အပြောင်းအလဲများ မြင်ရရန် App ကို ပိတ်ပြီး ပြန်ဖွင့်ပေးပါ။");
              }
            } catch (e) {
              Alert.alert("အမှား", "ဒေတာဖျက်၍မရပါ။");
            }
          } 
        }
      ]
    );
  };

  const filteredMembers = useMemo(() => {
    const membersList = dataContext.members || [];
    return membersList.filter((m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.id.toLowerCase().includes(search.toLowerCase())
    );
  }, [dataContext.members, search]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>အသင်းဝင်များ</Text>
          <Text style={styles.subtitle}>စုစုပေါင်း {dataContext.members?.length || 0} ဦး</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable style={styles.resetButton} onPress={resetToInitialData}>
            <Ionicons name="refresh" size={20} color={Colors.light.textSecondary} />
          </Pressable>
          <Pressable style={styles.addButton} onPress={() => router.push("/add-member")}>
            <Ionicons name="person-add" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.light.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="ရှာဖွေရန်..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {dataContext.loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.light.tint} />
        </View>
      ) : (
        <FlatList
          data={filteredMembers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable 
              style={styles.memberRow}
              onPress={() => router.push({ pathname: "/add-member", params: { editId: item.id } })}
            >
               <View style={[styles.avatar, { backgroundColor: item.avatarColor || Colors.light.tint }]}>
                  <Text style={styles.avatarText}>{item.name?.charAt(0) || "?"}</Text>
               </View>
               <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{item.name}</Text>
                  <Text style={styles.memberIdText}>{item.id}</Text>
                  <Text style={styles.memberSubText}>{item.phone}</Text>
               </View>
               <Ionicons name="chevron-forward" size={18} color={Colors.light.textSecondary} />
            </Pressable>
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>အသင်းဝင် ရှာမတွေ့ပါ။</Text>
              <Pressable onPress={resetToInitialData} style={{ marginTop: 20 }}>
                <Text style={{ color: Colors.light.tint }}>ဒေတာများ ပြန်ယူရန် နှိပ်ပါ</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 15 },
  title: { fontSize: 26, fontWeight: "bold", color: Colors.light.text },
  subtitle: { fontSize: 14, color: Colors.light.textSecondary },
  addButton: { backgroundColor: Colors.light.tint, width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  resetButton: { backgroundColor: Colors.light.surface, width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: Colors.light.border },
  searchContainer: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surface, marginHorizontal: 20, paddingHorizontal: 12, borderRadius: 12, height: 46, marginBottom: 16, borderWidth: 1, borderColor: Colors.light.border },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: Colors.light.text },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  memberRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surface, borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: Colors.light.border },
  avatar: { width: 48, height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginRight: 12 },
  avatarText: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: "600", color: Colors.light.text },
  memberIdText: { fontSize: 12, color: Colors.light.tint, fontWeight: "600", marginTop: 2 },
  memberSubText: { fontSize: 13, color: Colors.light.textSecondary },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { alignItems: "center", marginTop: 40 },
  emptyText: { color: Colors.light.textSecondary, fontSize: 15 },
});
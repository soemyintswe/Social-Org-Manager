import React, { useState, useMemo, useCallback } from "react";
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
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useData } from "@/lib/DataContext";
import { Member } from "@/lib/types";
import AsyncStorage from "@react-native-async-storage/async-storage";

const getAvatarLabel = (name: string) => {
  if (!name) return "?";
  let text = name.trim();
  const prefixes = ["ဆရာတော်", "ဦး", "ဒေါ်", "မောင်", "ကို", "မ"];
  
  // အရှည်ဆုံး Prefix ကို အရင်စစ်ရန် (ဥပမာ - ဆရာတော်)
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

export default function MembersScreen() {
  const insets = useSafeAreaInsets();
  const dataContext = useData() as any; // Context တစ်ခုလုံးကို ယူလိုက်ပါ
  const [search, setSearch] = useState("");

  useFocusEffect(
    useCallback(() => {
      if (dataContext.refreshData) dataContext.refreshData();
    }, [dataContext.refreshData])
  );

  // အသင်းဝင်အားလုံးကို ဖျက်ရန် (Clear All)
  const handleClearAll = async () => {
    if (Platform.OS === "web") {
      if (window.confirm("အသင်းဝင်များအားလုံးကို ဖျက်မည်\n\nလက်ရှိအသင်းဝင်စာရင်းအားလုံးကို ဖျက်ပစ်မည်မှာ သေချာပါသလား? (ပြန်ယူ၍ မရနိုင်ပါ)")) {
        try {
          await AsyncStorage.setItem("@orghub_members", JSON.stringify([]));
          window.alert("အောင်မြင်ပါသည်\nအသင်းဝင်စာရင်းကို ဖျက်ပြီးပါပြီ။");
          window.location.reload();
        } catch (e) {
          window.alert("အမှား\nဒေတာဖျက်၍မရပါ။");
        }
      }
      return;
    }

    Alert.alert(
      "အသင်းဝင်များအားလုံးကို ဖျက်မည်",
      "လက်ရှိအသင်းဝင်စာရင်းအားလုံးကို ဖျက်ပစ်မည်မှာ သေချာပါသလား? (ပြန်ယူ၍ မရနိုင်ပါ)",
      [
        { text: "မဖျက်ပါ", style: "cancel" },
        { 
          text: "ဖျက်မည်", 
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.setItem("@orghub_members", JSON.stringify([]));

              if (Platform.OS === "web") {
                window.alert("အောင်မြင်ပါသည်\nအသင်းဝင်စာရင်းကို ဖျက်ပြီးပါပြီ။");
                window.location.reload();
                return;
              }

              // App ကို Reload လုပ်ခိုင်းခြင်း သို့မဟုတ် refreshData ခေါ်ခြင်း
              if (dataContext.refreshData) {
                await dataContext.refreshData();
                setTimeout(() => {
                  Alert.alert("အောင်မြင်ပါသည်", "အသင်းဝင်စာရင်းကို ဖျက်ပြီးပါပြီ။");
                }, 100);
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

  const handleDeleteMember = async (id: string) => {
    const deleteAction = async () => {
      try {
        const currentMembers = dataContext.members || [];
        const newMembers = currentMembers.filter((m: any) => m.id !== id);
        await AsyncStorage.setItem("@orghub_members", JSON.stringify(newMembers));
        if (dataContext.refreshData) await dataContext.refreshData();
        setTimeout(() => {
          if (Platform.OS === "web") {
            window.alert("အောင်မြင်ပါသည်\nအသင်းဝင်ကို ဖျက်ပြီးပါပြီ။");
            window.location.reload();
          } else {
            Alert.alert("အောင်မြင်ပါသည်", "အသင်းဝင်ကို ဖျက်ပြီးပါပြီ။");
          }
        }, 100);
      } catch (e) {
        Alert.alert("အမှား", "ဖျက်၍မရပါ။");
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("ဤအသင်းဝင်ကို ဖျက်မည်မှာ သေချာပါသလား?")) await deleteAction();
    } else {
      Alert.alert("သတိပေးချက်", "ဤအသင်းဝင်ကို ဖျက်မည်မှာ သေချာပါသလား?", [
        { text: "မဖျက်ပါ", style: "cancel" },
        { text: "ဖျက်မည်", style: "destructive", onPress: deleteAction },
      ]);
    }
  };

  const filteredMembers = useMemo(() => {
    const membersList = dataContext.members || [];
    return membersList.filter((m: any) =>
      (m.name?.toLowerCase() || "").includes(search.toLowerCase()) ||
      (m.id?.toLowerCase() || "").includes(search.toLowerCase())
    );
  }, [dataContext.members, search]);

  return (
    <>
      {/* Set the status bar style imperatively */}
      {Platform.OS === "ios" && StatusBar.setBarStyle("dark-content")}
      <View style={[
        styles.container,
        { paddingTop: typeof insets.top === "number" ? (insets.top + 20) : 20 }
      ]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>အသင်းဝင်များ</Text>
            <Text style={styles.subtitle}>စုစုပေါင်း {dataContext.members?.length || 0} ဦး</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable style={styles.headerAction} onPress={() => router.push("/import-members")}>
              <Ionicons name="cloud-upload-outline" size={22} color={Colors.light.text} />
              <Text style={styles.headerActionText}>Import</Text>
            </Pressable>
            <Pressable style={styles.headerAction} onPress={handleClearAll}>
              <Ionicons name="trash-outline" size={22} color={Colors.light.text} />
              <Text style={styles.headerActionText}>Clear</Text>
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
            <View style={styles.memberRow}>
              <Pressable 
                style={styles.memberRowContent}
                onPress={() => router.push({ pathname: "/add-member", params: { editId: item.id } })}
              >
                 {item.profileImage ? (
                   <Image source={{ uri: item.profileImage }} style={styles.avatar} />
                 ) : (
                   <View style={[styles.avatar, { backgroundColor: item.avatarColor || Colors.light.tint }]}>
                      <Text style={styles.avatarText}>{getAvatarLabel(item.name)}</Text>
                   </View>
                 )}
                 <View style={styles.memberInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.memberName}>{item.name}</Text>
                      {item.resignDate && String(item.resignDate).trim() !== "" && (
                        <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '600' }}>နှုတ်ထွက်</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.memberIdText}>{item.id}</Text>
                    <Text style={styles.memberSubText}>{item.phone}</Text>
                 </View>
              </Pressable>
              <Pressable style={styles.deleteBtn} onPress={() => handleDeleteMember(item.id)}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </Pressable>
            </View>
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>အသင်းဝင် ရှာမတွေ့ပါ။</Text>
              <Pressable onPress={() => router.push("/add-member")} style={{ marginTop: 20 }}>
                <Text style={{ color: Colors.light.tint }}>အသင်းဝင်သစ် ထည့်ရန် နှိပ်ပါ</Text>
              </Pressable>
            </View>
          }
        />
      )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 15 },
  title: { fontSize: 26, fontWeight: "bold", color: Colors.light.text },
  subtitle: { fontSize: 14, color: Colors.light.textSecondary },
  addButton: { backgroundColor: Colors.light.tint, width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  headerAction: { alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  headerActionText: { fontSize: 10, color: Colors.light.textSecondary, marginTop: 2, fontWeight: "500" },
  searchContainer: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surface, marginHorizontal: 20, paddingHorizontal: 12, borderRadius: 12, height: 46, marginBottom: 16, borderWidth: 1, borderColor: Colors.light.border },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: Colors.light.text },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  memberRow: { flexDirection: "row", backgroundColor: Colors.light.surface, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.light.border, overflow: "hidden" },
  memberRowContent: { flex: 1, flexDirection: "row", alignItems: "center", padding: 12 },
  deleteBtn: { padding: 12, justifyContent: "center", alignItems: "center", borderLeftWidth: 1, borderLeftColor: Colors.light.border },
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
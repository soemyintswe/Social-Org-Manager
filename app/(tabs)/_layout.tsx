// import { useAuth } from "../../lib/AuthContext";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";
// လမ်းကြောင်းကို Folder တစ်ဆင့်ပဲ ပြန်ထွက်ရန် ပြင်ဆင်ထားသည်
import { useAuth } from "../lib/AuthContext";

export default function TabLayout() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0EA5A4" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="finance" />
        <Tabs.Screen name="reports" />
        <Tabs.Screen name="system" />
      </Tabs>
    </View>
  );
}
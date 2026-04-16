// import { useAuth } from "../../lib/AuthContext";
import { Redirect, Tabs, useSegments } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";
// လမ်းကြောင်းကို Folder တစ်ဆင့်ပဲ ပြန်ထွက်ရန် ပြင်ဆင်ထားသည်
import { useAuth } from "../../lib/AuthContext";

export default function TabLayout() {
  const { loading, isAuthenticated } = useAuth();
  const segments = useSegments();
  const rootSegment = String(segments[0] || "");
  const childSegment = String(segments[1] || "");
  const inSystemTab = (rootSegment === "(tabs)" && childSegment === "system") || rootSegment === "system";

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0EA5A4" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href={inSystemTab ? "/admin-sign-in" : "/sign-in"} />;
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

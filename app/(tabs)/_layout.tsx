// import { useAuth } from "../../lib/AuthContext";
import { Redirect, Tabs, useSegments } from "expo-router";
import React from "react";
import { ActivityIndicator, Platform, View } from "react-native";
// လမ်းကြောင်းကို Folder တစ်ဆင့်ပဲ ပြန်ထွက်ရန် ပြင်ဆင်ထားသည်
import { useAuth } from "../../lib/AuthContext";
import { isCentralAdminVariant, isOrgClientVariant } from "../../lib/app-variant";

export default function TabLayout() {
  const { loading, isAuthenticated } = useAuth();
  const orgClientVariant = isOrgClientVariant();
  const centralAdminVariant = isCentralAdminVariant();
  const segments = useSegments();
  const rootSegment = String(segments[0] || "");
  const childSegment = String(segments[1] || "");
  const webPathname =
    Platform.OS === "web" && typeof window !== "undefined"
      ? String(window.location.pathname || "").trim().toLowerCase()
      : "";
  const webSystemPath =
    !!webPathname &&
    (webPathname === "/system" || webPathname === "/system/" || webPathname.endsWith("/system") || webPathname.endsWith("/system/"));
  const inSystemTab = (rootSegment === "(tabs)" && childSegment === "system") || rootSegment === "system" || webSystemPath;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0EA5A4" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href={inSystemTab || centralAdminVariant ? "/admin-sign-in" : "/sign-in"} />;
  }

  if (orgClientVariant && inSystemTab) {
    return <Redirect href="/" />;
  }

  if (centralAdminVariant && !inSystemTab) {
    return <Redirect href="/system" />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        {!centralAdminVariant && <Tabs.Screen name="index" />}
        {!centralAdminVariant && <Tabs.Screen name="finance" />}
        {!centralAdminVariant && <Tabs.Screen name="reports" />}
        <Tabs.Screen name="system" />
      </Tabs>
    </View>
  );
}

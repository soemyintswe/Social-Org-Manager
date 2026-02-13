import { Tabs } from "expo-router";
import React from "react";
import { View } from "react-native";
import FloatingTabMenu from "@/components/FloatingTabMenu";

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="finance" />
        <Tabs.Screen name="reports" />
      </Tabs>
      <FloatingTabMenu />
    </View>
  );
}
// _layout.tsx ထဲတွင် အစားထိုးရန်
import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import Colors from "@/constants/colors";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.light.tint,
        tabBarInactiveTintColor: Colors.light.textSecondary,
        tabBarStyle: {
          position: "absolute",
          borderTopWidth: 0,
          elevation: 0,
          height: Platform.OS === "ios" ? 88 : 65,
          paddingBottom: Platform.OS === "ios" ? 30 : 10,
        },
        tabBarBackground: () => (
          <BlurView intensity={80} style={{ flex: 1 }} tint="light" />
        ),
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: "Inter_600SemiBold",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "ပင်မစာမျက်နှာ", // Dashboard -> ပင်မစာမျက်နှာ
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: "အသင်းဝင်များ", // Members -> အသင်းဝင်များ
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: "ငွေစာရင်း", // Finance -> ငွေစာရင်း
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "မှတ်တမ်းများ", // Reports -> မှတ်တမ်းများ
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "လှုပ်ရှားမှုများ", // Events -> လှုပ်ရှားမှုများ
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
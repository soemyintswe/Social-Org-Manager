import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";

export default function FloatingTabMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { can, signOut, isAuthenticated } = useAuth();

  const menuItems = useMemo(() => {
    return [
      { name: "ပင်မစာမျက်နှာ", icon: "home-outline", route: "/" },
      {
        name: "အသင်းဝင်များ",
        icon: "people-outline",
        route: "/members",
        enabled: can("members.view_all") || can("members.view_self"),
      },
      {
        name: "လှုပ်ရှားမှုများ",
        icon: "calendar-outline",
        route: "/events",
        enabled: can("events.view_public"),
      },
      {
        name: "ချေးငွေများ",
        icon: "cash-outline",
        route: "/loans",
        enabled: can("finance.view_all") || can("finance.view_self"),
      },
      {
        name: "ငွေစာရင်း",
        icon: "wallet-outline",
        route: "/finance",
        enabled: can("finance.view_all") || can("finance.view_self"),
      },
      {
        name: "အစီရင်ခံစာ",
        icon: "bar-chart-outline",
        route: "/reports",
        enabled: can("reports.view_all"),
      },
      {
        name: "စနစ်ပိုင်းဆိုင်ရာ",
        icon: "settings-outline",
        route: "/data-management",
        enabled: can("system.manage"),
      },
    ].filter((item) => item.enabled !== false);
  }, [can]);

  const handleNavigate = (route: string) => {
    setIsOpen(false);
    router.push(route);
  };

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
    router.replace("/sign-in");
  };

  if (!isAuthenticated) return null;

  return (
    <>
      {isOpen && (
        <Pressable style={styles.overlay} onPress={() => setIsOpen(false)} />
      )}
      
      <View style={[styles.container, { top: insets.top + 10, right: 20 }]}>
        <Pressable
          style={[styles.fab, isOpen && styles.fabActive]}
          onPress={() => setIsOpen(!isOpen)}
        >
          <Ionicons name={isOpen ? "close" : "menu"} size={20} color="#fff" />
          <Text style={styles.fabText}>Menu</Text>
        </Pressable>

        {isOpen && (
          <View style={styles.menuContainer}>
            {menuItems.map((item) => {
              const isActive = pathname === item.route || (item.route !== '/' && pathname.startsWith(item.route));
              return (
                <Pressable
                  key={item.route}
                  style={[styles.menuItem, isActive && styles.menuItemActive]}
                  onPress={() => handleNavigate(item.route)}
                >
                  <Ionicons name={item.icon as any} size={20} color={isActive ? Colors.light.tint : Colors.light.text} />
                  <Text style={[styles.menuText, isActive && styles.menuTextActive]}>{item.name}</Text>
                </Pressable>
              );
            })}
            <Pressable style={styles.signOutItem} onPress={() => void handleSignOut()}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignItems: 'flex-end',
    zIndex: 9999,
  },
  fab: {
    flexDirection: 'row',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabActive: {
    backgroundColor: Colors.light.text,
  },
  fabText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 9998,
  },
  menuContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 8,
    minWidth: 180,
    marginTop: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  menuItemActive: {
    backgroundColor: Colors.light.tint + '15',
  },
  menuText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  menuTextActive: {
    color: Colors.light.tint,
  },
  signOutItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    marginTop: 4,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EF4444",
  },
});

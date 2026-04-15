import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, ScrollView, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { isCommitteePosition } from "@/lib/access-control";

type FloatingTabMenuProps = {
  mode?: "floating" | "topbar";
  containerStyle?: StyleProp<ViewStyle>;
  menuTopOffset?: number;
};

export default function FloatingTabMenu({
  mode = "floating",
  containerStyle,
  menuTopOffset,
}: FloatingTabMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { can, signOut, isAuthenticated, currentUser, currentMember } = useAuth();
  const isSystemAdmin = currentUser?.systemRole === "admin";
  const isTopBar = mode === "topbar";
  const isPhoneNarrow = windowWidth <= 430;
  const gridColumnCount = isPhoneNarrow ? 2 : 1;
  const estimatedTopOffset = menuTopOffset ?? insets.top + 52;
  const menuMaxHeight = Math.max(280, windowHeight - estimatedTopOffset - insets.bottom - 18);

  const menuItems = useMemo(() => {
    if (isSystemAdmin) {
      return [
        { name: "ပင်မစာမျက်နှာ", icon: "home-outline", route: "/" },
        { name: "System Information", icon: "settings-outline", route: "/system", enabled: true },
        { name: "ချိန်ညှိရန်", icon: "options-outline", route: "/account-settings", enabled: true },
      ];
    }
    return [
      { name: "ပင်မစာမျက်နှာ", icon: "home-outline", route: "/" },
      {
        name: "အသင်းဝင်များ",
        icon: "people-outline",
        route: "/members",
        enabled: can("members.view_all") || can("members.view_self"),
      },
      {
        name: "ပြင်ဆင်ရန်တောင်းဆိုမှု",
        icon: "checkmark-done-outline",
        route: "/requests",
        enabled: can("members.approve_changes") || can("members.propose_changes"),
      },
      {
        name: "သတင်းပို့ရန်",
        icon: "calendar-outline",
        route: "/events",
        enabled: can("events.view_public"),
      },
      {
        name: "Messages",
        icon: "chatbubbles-outline",
        route: "/messages",
        enabled: true,
      },
      {
        name: "အသိပေးချက်များ",
        icon: "notifications-outline",
        route: "/notifications",
        enabled: true,
      },
      {
        name: "ချေးငွေများ",
        icon: "cash-outline",
        route: "/loans",
        enabled: can("finance.view_detail") || can("finance.view_summary") || can("finance.view_self") || can("finance.view_all"),
      },
      {
        name: "ငွေစာရင်း",
        icon: "wallet-outline",
        route: "/finance",
        enabled: can("finance.view_detail") || can("finance.view_summary") || can("finance.view_self") || can("finance.view_all"),
      },
      {
        name: "အစီရင်ခံစာ",
        icon: "bar-chart-outline",
        route: "/reports",
        enabled: can("reports.view_all") || can("reports.view_summary"),
      },
      {
        name: "လစဉ်ကြေး",
        icon: "calendar-number-outline",
        route: "/monthly-fees",
        enabled: isCommitteePosition(currentMember?.orgPosition || currentUser?.orgPosition),
      },
      {
        name: "System Information",
        icon: "settings-outline",
        route: "/system",
        enabled: true,
      },
      {
        name: "ချိန်ညှိရန်",
        icon: "options-outline",
        route: "/account-settings",
      },
    ].filter((item) => item.enabled !== false);
  }, [can, currentMember?.orgPosition, currentUser?.orgPosition, isSystemAdmin]);

  const handleNavigate = (route: string) => {
    setIsOpen(false);
    router.push(route as any);
  };

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
    router.replace("/sign-in");
  };

  if (!isAuthenticated) return null;

  const menuContent = (
    <View style={[styles.menuContainer, { maxHeight: menuMaxHeight }]}>
      <ScrollView
        style={styles.menuScroll}
        contentContainerStyle={[
          styles.menuScrollContent,
          gridColumnCount === 2 && styles.menuScrollContentTwoCol,
        ]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        {menuItems.map((item) => {
          const isActive = pathname === item.route || (item.route !== "/" && pathname.startsWith(item.route));
          return (
            <Pressable
              key={item.route}
              style={[
                styles.menuItem,
                gridColumnCount === 2 && styles.menuItemTwoCol,
                isActive && styles.menuItemActive,
              ]}
              onPress={() => handleNavigate(item.route)}
            >
              <Ionicons name={item.icon as any} size={20} color={isActive ? Colors.light.tint : Colors.light.text} />
              <Text style={[styles.menuText, isActive && styles.menuTextActive]} numberOfLines={2}>
                {item.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable style={styles.signOutItem} onPress={() => void handleSignOut()}>
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </View>
  );

  if (isTopBar) {
    return (
      <>
        <View style={[styles.topBarButtonWrap, containerStyle]}>
          <Pressable style={styles.topBarFab} onPress={() => setIsOpen(true)}>
            <Ionicons name="menu" size={20} color="#fff" />
          </Pressable>
        </View>

        <Modal transparent animationType="fade" visible={isOpen} onRequestClose={() => setIsOpen(false)}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalOverlay} onPress={() => setIsOpen(false)} />
            <View
              pointerEvents="box-none"
              style={[
                styles.modalMenuAnchor,
                {
                  top: menuTopOffset ?? insets.top + 52,
                  right: insets.right + 12,
                },
              ]}
            >
              {menuContent}
            </View>
          </View>
        </Modal>
      </>
    );
  }

  return (
    <>
      {isOpen && (
        <Pressable style={styles.overlay} onPress={() => setIsOpen(false)} />
      )}
      
      <View style={[styles.container, { top: insets.top + 10, right: 20 }, containerStyle]}>
        <Pressable
          style={[styles.fab, isOpen && styles.fabActive]}
          onPress={() => setIsOpen(!isOpen)}
        >
          <Ionicons name={isOpen ? "close" : "menu"} size={20} color="#fff" />
          <Text style={styles.fabText}>Menu</Text>
        </Pressable>

        {isOpen && menuContent}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  topBarButtonWrap: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  topBarFab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  modalRoot: {
    flex: 1,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  modalMenuAnchor: {
    position: "absolute",
    zIndex: 10000,
  },
  container: {
    position: "absolute",
    alignItems: "flex-end",
    zIndex: 9999,
  },
  fab: {
    flexDirection: "row",
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
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 9998,
  },
  menuContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
    minWidth: 250,
    maxWidth: 470,
    marginTop: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  menuScroll: {
    flexGrow: 0,
  },
  menuScrollContent: {
    gap: 2,
    paddingBottom: 6,
  },
  menuScrollContentTwoCol: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  menuItemTwoCol: {
    width: "48%",
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  menuItemActive: {
    backgroundColor: Colors.light.tint + "15",
  },
  menuText: {
    flexShrink: 1,
    fontSize: 14,
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
    marginTop: 2,
    backgroundColor: "white",
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EF4444",
  },
});

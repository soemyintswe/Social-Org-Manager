import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import Colors from "../constants/colors";

export default function SettingsRedirectScreen() {
  useEffect(() => {
    router.replace("/account-settings");
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.background }}>
      <ActivityIndicator color={Colors.light.tint} />
    </View>
  );
}

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

function normalizeOrgId(raw: string): string {
  return String(raw || "").trim().toUpperCase();
}

function isValidOrgId(orgId: string): boolean {
  return /^ORG\d{3,}$/.test(orgId);
}

export default function OrgIdEntryRedirectScreen() {
  const params = useLocalSearchParams<{ orgId?: string }>();
  const router = useRouter();

  useEffect(() => {
    const rawOrgId = String(params?.orgId || "");
    const orgId = normalizeOrgId(rawOrgId);
    if (!isValidOrgId(orgId)) {
      router.replace("/sign-in" as any);
      return;
    }
    router.replace({ pathname: "/sign-in", params: { orgId } } as any);
  }, [params?.orgId, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0F766E" />
      <Text style={styles.text}>Org Login Page သို့ ပြောင်းနေပါသည်…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 20,
  },
  text: {
    marginTop: 10,
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
    textAlign: "center",
  },
});


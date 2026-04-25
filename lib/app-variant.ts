import Constants from "expo-constants";

export type AppVariant = "unified" | "org-client" | "central-admin";

function normalizeVariant(raw?: string | null): AppVariant {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  if (value === "org-client" || value === "client" || value === "org") {
    return "org-client";
  }
  if (value === "central-admin" || value === "admin" || value === "central") {
    return "central-admin";
  }
  return "unified";
}

export function getAppVariant(): AppVariant {
  const queryVariant = (() => {
    try {
      if (typeof window === "undefined") return undefined;
      const params = new URLSearchParams(window.location.search || "");
      return params.get("appVariant") || params.get("variant") || undefined;
    } catch {
      return undefined;
    }
  })();

  const globalVariant = (() => {
    try {
      const globalAny = globalThis as Record<string, any> | undefined;
      return globalAny?.__APP_CONFIG__?.appVariant;
    } catch {
      return undefined;
    }
  })();

  const expoExtraVariant =
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.appVariant ||
    (Constants.manifest2?.extra as Record<string, unknown> | undefined)?.expoClient?.extra?.appVariant;

  return normalizeVariant(
    String(
      queryVariant ||
        globalVariant ||
        expoExtraVariant ||
        process.env.EXPO_PUBLIC_APP_VARIANT ||
        process.env.APP_VARIANT ||
        "unified"
    )
  );
}

export function isUnifiedVariant(): boolean {
  return getAppVariant() === "unified";
}

export function isOrgClientVariant(): boolean {
  return getAppVariant() === "org-client";
}

export function isCentralAdminVariant(): boolean {
  return getAppVariant() === "central-admin";
}

export function getAppVariantLabel(): string {
  const variant = getAppVariant();
  if (variant === "org-client") return "Org Client";
  if (variant === "central-admin") return "Central Admin";
  return "Unified";
}

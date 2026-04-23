const baseConfig = require("./app.json");

function normalizeVariant(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (value === "org-client" || value === "client" || value === "org") return "org-client";
  if (value === "central-admin" || value === "admin" || value === "central") return "central-admin";
  return "unified";
}

module.exports = ({ config }) => {
  const resolved = config?.expo ? config.expo : config || baseConfig.expo;
  const extra = resolved?.extra || {};
  const variant = normalizeVariant(process.env.APP_VARIANT || process.env.EXPO_PUBLIC_APP_VARIANT);
  const nextName =
    variant === "central-admin" ? "Org Registry Central Admin" : resolved?.name || baseConfig.expo.name;
  const nextSlug =
    variant === "central-admin" ? "orghub-central-admin" : resolved?.slug || baseConfig.expo.slug;
  const nextScheme = variant === "central-admin" ? "orghubadmin" : resolved?.scheme || "myapp";
  const nextAndroidPackage =
    variant === "central-admin"
      ? "com.soemyintswe.orghub.centraladmin"
      : resolved?.android?.package || baseConfig.expo.android?.package;
  const nextIosBundleId =
    variant === "central-admin"
      ? "com.soemyintswe.orghub.centraladmin"
      : resolved?.ios?.bundleIdentifier || baseConfig.expo.ios?.bundleIdentifier;

  return {
    ...(resolved || {}),
    name: nextName,
    slug: nextSlug,
    scheme: nextScheme,
    android: {
      ...(resolved?.android || {}),
      package: nextAndroidPackage,
    },
    ios: {
      ...(resolved?.ios || {}),
      bundleIdentifier: nextIosBundleId,
    },
    extra: {
      ...extra,
      appVariant: variant,
      managedOrgConfigs:
        process.env.EXPO_PUBLIC_MANAGED_ORG_CONFIGS ||
        extra.managedOrgConfigs ||
        "",
    },
  };
};

const baseConfig = require("./app.json");

module.exports = ({ config }) => {
  const resolved = config?.expo ? config.expo : config || baseConfig.expo;
  const extra = resolved?.extra || {};

  return {
    ...(resolved || {}),
    extra: {
      ...extra,
      managedOrgConfigs:
        process.env.EXPO_PUBLIC_MANAGED_ORG_CONFIGS ||
        extra.managedOrgConfigs ||
        "",
    },
  };
};

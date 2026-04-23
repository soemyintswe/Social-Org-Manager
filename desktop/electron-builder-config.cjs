const path = require("path");

function normalizeVariant(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (value === "org-client" || value === "client" || value === "org") return "org-client";
  if (value === "central-admin" || value === "admin" || value === "central") return "central-admin";
  return "unified";
}

const variant = normalizeVariant(process.env.APP_VARIANT || process.env.EXPO_PUBLIC_APP_VARIANT || "unified");

const productName = variant === "central-admin" ? "Org Registry Central Admin" : "Social Org Manager";
const appId =
  variant === "central-admin"
    ? "com.soemyintswe.orghub.centraladmin.desktop"
    : "com.soemyintswe.orghub.desktop";
const executableName =
  variant === "central-admin" ? "Org-Registry-Central-Admin-Setup" : "Social-Org-Manager-Setup";

module.exports = {
  appId,
  productName,
  extraMetadata: {
    main: "desktop/main.cjs",
  },
  directories: {
    output: "desktop-dist",
  },
  win: {
    icon: path.resolve(__dirname, "..", "build", "icon.ico"),
    target: ["portable", "nsis"],
    signAndEditExecutable: false,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    artifactName: `${executableName}-v\${version}.\${ext}`,
  },
  artifactName: `${executableName}-v\${version}.\${ext}`,
  files: [
    "desktop/**/*",
    "server_dist/**/*",
    "web-build/**/*",
    "server/templates/**/*",
    "server/config/**/*",
    "assets/**/*",
    "package.json",
    "!**/node_modules/**/android/**",
    "!**/node_modules/**/ios/**",
    "!**/node_modules/**/build/**",
    "!**/node_modules/**/example/**",
    "!**/node_modules/**/examples/**",
    "!**/node_modules/**/sample/**",
    "!**/node_modules/**/samples/**",
    "!**/node_modules/**/docs/**",
    "!**/node_modules/**/test/**",
    "!**/node_modules/**/tests/**",
    "web-build/assets/node_modules/**",
  ],
};

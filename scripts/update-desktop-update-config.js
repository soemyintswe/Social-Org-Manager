const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function normalizeVariant(raw) {
  const value = String(raw || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (value === "org-client" || value === "client" || value === "org") return "org-client";
  if (value === "central-admin" || value === "admin" || value === "central") return "central-admin";
  return "unified";
}

function getAppVariant() {
  return normalizeVariant(process.env.APP_VARIANT || process.env.EXPO_PUBLIC_APP_VARIANT || "unified");
}

function getDesktopArtifactBaseName() {
  const variant = getAppVariant();
  if (variant === "central-admin") return "Org-Registry-Central-Admin-Setup";
  return "Social-Org-Manager-Setup";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readAppVersion() {
  const appJsonPath = path.resolve(__dirname, "..", "app.json");
  const packageJsonPath = path.resolve(__dirname, "..", "package.json");
  try {
    const appJson = readJson(appJsonPath);
    const fromExpo = String(appJson?.expo?.version || "").trim();
    if (fromExpo) return fromExpo;
  } catch {}
  try {
    const packageJson = readJson(packageJsonPath);
    const fromPkg = String(packageJson?.version || "").trim();
    if (fromPkg) return fromPkg;
  } catch {}
  return "0.0.0";
}

function readDesktopBuildNumber(version) {
  const parts = String(version || "")
    .split(".")
    .map((item) => Number(String(item).replace(/[^\d]/g, "")));
  const patch = parts.length >= 3 && Number.isFinite(parts[2]) ? parts[2] : NaN;
  if (Number.isFinite(patch) && patch >= 0) return String(patch);
  return "";
}

function getGitRemoteMeta() {
  try {
    const raw = execSync("git remote get-url origin", {
      cwd: path.resolve(__dirname, ".."),
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    const normalized = raw.replace(/\.git$/, "");
    const match = normalized.match(/github\.com[:/]([^/]+)\/([^/]+)$/i);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  } catch {
    return null;
  }
}

function resolveDownloadUrl(version) {
  const explicitUrl = String(process.env.DESKTOP_UPDATE_DOWNLOAD_URL || "").trim();
  if (explicitUrl) return explicitUrl;
  const artifactBaseName = getDesktopArtifactBaseName();

  const baseUrl = String(process.env.DESKTOP_UPDATE_DOWNLOAD_BASE_URL || "").trim().replace(/\/+$/, "");
  if (baseUrl) {
    return `${baseUrl}/${artifactBaseName}-v${version}.exe`;
  }

  const meta = getGitRemoteMeta();
  if (meta) {
    return `https://github.com/${meta.owner}/${meta.repo}/releases/latest/download/${artifactBaseName}-v${version}.exe`;
  }

  return "";
}

function getDesktopUpdateConfigPath() {
  const variant = getAppVariant();
  const filename = variant === "unified" ? "desktop-update.json" : `desktop-update.${variant}.json`;
  return path.resolve(__dirname, "..", "server", "config", filename);
}

function main() {
  const version = readAppVersion();
  const buildNumber = readDesktopBuildNumber(version);
  const configPath = getDesktopUpdateConfigPath();
  let config = {};

  if (fs.existsSync(configPath)) {
    try {
      config = readJson(configPath);
    } catch {
      config = {};
    }
  }

  const downloadUrl = resolveDownloadUrl(version) || String(config.downloadUrl || "");

  const next = {
    ...config,
    variant: getAppVariant(),
    latestVersion: version,
    latestBuildNumber: buildNumber || String(config.latestBuildNumber || ""),
    minimumVersion: String(config.minimumVersion || "1.0.0"),
    downloadUrl,
    notes: String(config.notes || "Desktop update available for Social Org Manager."),
    force: Boolean(config.force),
    publishedAt: new Date().toISOString(),
  };

  fs.writeFileSync(configPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  console.log(`Updated desktop update config: ${configPath}`);
  console.log(`latestVersion=${next.latestVersion}`);
  console.log(`downloadUrl=${next.downloadUrl}`);
}

main();

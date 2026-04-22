/* global __dirname */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..", "..");
const releasesDir = path.resolve(rootDir, "releases");
const desktopReleasesDir = path.resolve(rootDir, "releases-desktop");
const renderVerifyScript = path.resolve(rootDir, "scripts", "deploy", "verify-render-deploy-commit.ps1");

function parseArgs(argv) {
  const options = {
    includePortable: false,
    includeBlockmap: false,
    verifyRender: false,
    expectedRef: "HEAD",
    tag: "",
    version: "",
    renderBaseUrl: "",
    notes: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--include-portable") {
      options.includePortable = true;
      continue;
    }
    if (token === "--include-blockmap") {
      options.includeBlockmap = true;
      continue;
    }
    if (token === "--verify-render") {
      options.verifyRender = true;
      continue;
    }
    if (token === "--tag" && argv[i + 1]) {
      options.tag = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === "--version" && argv[i + 1]) {
      options.version = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === "--render-base-url" && argv[i + 1]) {
      options.renderBaseUrl = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === "--expected-ref" && argv[i + 1]) {
      options.expectedRef = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === "--notes" && argv[i + 1]) {
      options.notes = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readAppVersion() {
  const appJsonPath = path.resolve(rootDir, "app.json");
  const packageJsonPath = path.resolve(rootDir, "package.json");

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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runCommand(command, args, options = {}) {
  const cwd = options.cwd || rootDir;
  const stdio = options.stdio || "pipe";
  return execFileSync(command, args, {
    cwd,
    stdio,
    encoding: "utf8",
  });
}

function ensureGhReady() {
  try {
    runCommand("gh", ["--version"]);
    runCommand("gh", ["auth", "status"], { stdio: "inherit" });
  } catch (error) {
    throw new Error("GitHub CLI is not ready. Please run `gh auth login` first.");
  }
}

function ensureReleaseExists(tag, notes) {
  try {
    runCommand("gh", ["release", "view", tag, "--json", "tagName"]);
    console.log(`Release already exists: ${tag}`);
  } catch {
    const safeNotes = String(notes || "").trim() || `Automated asset upload for ${tag}`;
    console.log(`Release not found. Creating ${tag}...`);
    runCommand("gh", ["release", "create", tag, "--title", `Release ${tag}`, "--notes", safeNotes], {
      stdio: "inherit",
    });
  }
}

function resolveLatestApk(version) {
  if (!fs.existsSync(releasesDir)) {
    throw new Error(`Releases folder not found: ${releasesDir}`);
  }

  const apkPattern = new RegExp(`^release-lan-sync-v${escapeRegExp(version)}-(\\d{12})\\.apk$`, "i");
  const candidates = fs
    .readdirSync(releasesDir)
    .map((name) => {
      const match = name.match(apkPattern);
      if (!match) return null;
      return {
        name,
        stamp: String(match[1]),
        fullPath: path.join(releasesDir, name),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.stamp.localeCompare(a.stamp));

  if (!candidates.length) {
    throw new Error(`No APK found for version ${version} in ${releasesDir}`);
  }

  return candidates[0];
}

function resolveDesktopAssets(version, includePortable, includeBlockmap) {
  if (!fs.existsSync(desktopReleasesDir)) {
    throw new Error(`Desktop releases folder not found: ${desktopReleasesDir}`);
  }

  const setupName = `Social-Org-Manager-Setup-v${version}.exe`;
  const setupPath = path.join(desktopReleasesDir, setupName);
  if (!fs.existsSync(setupPath)) {
    throw new Error(`Desktop setup EXE not found: ${setupPath}`);
  }

  const files = [setupPath];

  if (includePortable) {
    const portableName = `Social-Org-Manager-Portable-v${version}.exe`;
    const portablePath = path.join(desktopReleasesDir, portableName);
    if (!fs.existsSync(portablePath)) {
      throw new Error(`Portable EXE requested but not found: ${portablePath}`);
    }
    files.push(portablePath);
  }

  if (includeBlockmap) {
    const blockmapPath = `${setupPath}.blockmap`;
    if (!fs.existsSync(blockmapPath)) {
      throw new Error(`Blockmap requested but not found: ${blockmapPath}`);
    }
    files.push(blockmapPath);
  }

  return files;
}

function uploadAssets(tag, filePaths) {
  console.log(`Uploading ${filePaths.length} asset(s) to ${tag}...`);
  runCommand("gh", ["release", "upload", tag, ...filePaths, "--clobber"], { stdio: "inherit" });
}

function verifyReleaseAssets(tag, expectedNames) {
  const raw = runCommand("gh", ["release", "view", tag, "--json", "url,assets"]);
  const payload = JSON.parse(raw);
  const assets = Array.isArray(payload.assets) ? payload.assets : [];
  const existing = new Set(assets.map((item) => item.name));
  const missing = expectedNames.filter((name) => !existing.has(name));
  if (missing.length) {
    throw new Error(`Uploaded assets missing from release ${tag}: ${missing.join(", ")}`);
  }

  console.log(`Release verified: ${payload.url}`);
  for (const name of expectedNames) {
    const match = assets.find((item) => item.name === name);
    if (match?.url) {
      console.log(`- ${name}: ${match.url}`);
    }
  }
}

function verifyRenderDeploy(options) {
  if (!options.verifyRender) return;
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", renderVerifyScript];
  if (options.renderBaseUrl) {
    args.push("-RenderBaseUrl", options.renderBaseUrl);
  }
  if (options.expectedRef) {
    args.push("-LocalRef", options.expectedRef);
  }
  console.log("Verifying Render deployed commit via /api/sync/health...");
  runCommand("powershell", args, { stdio: "inherit" });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const version = options.version || readAppVersion();
  const tag = options.tag || `v${version}`;

  ensureGhReady();
  ensureReleaseExists(tag, options.notes);

  const apk = resolveLatestApk(version);
  const desktopFiles = resolveDesktopAssets(version, options.includePortable, options.includeBlockmap);
  const uploadFiles = [apk.fullPath, ...desktopFiles];
  const expectedNames = uploadFiles.map((item) => path.basename(item));

  uploadAssets(tag, uploadFiles);
  verifyReleaseAssets(tag, expectedNames);
  verifyRenderDeploy(options);

  console.log("Release asset automation completed.");
}

main();

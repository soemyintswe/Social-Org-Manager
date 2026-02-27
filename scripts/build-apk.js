/* global __dirname */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function readAppVersion() {
  try {
    const appJson = require('../app.json');
    const expoVersion = String(appJson?.expo?.version || '').trim();
    if (expoVersion) return expoVersion;
  } catch {}
  try {
    const packageJson = require('../package.json');
    const packageVersion = String(packageJson?.version || '').trim();
    if (packageVersion) return packageVersion;
  } catch {}
  return '0.0.0';
}

function readBuildNumber() {
  try {
    const appJson = require('../app.json');
    const raw = appJson?.expo?.android?.versionCode;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return String(n);
  } catch {}

  try {
    const gradlePath = path.resolve(__dirname, '../android/app/build.gradle');
    const raw = fs.readFileSync(gradlePath, 'utf8');
    const match = raw.match(/versionCode\s+(\d+)/);
    if (match?.[1]) return String(match[1]);
  } catch {}

  return '';
}

function getGitRemoteMeta() {
  try {
    const raw = execSync('git remote get-url origin', {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    const normalized = raw.replace(/\.git$/, '');
    const match = normalized.match(/github\.com[:/]([^/]+)\/([^/]+)$/i);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  } catch {
    return null;
  }
}

function getCurrentBranchName() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function getDownloadBaseUrl() {
  const envBase = String(process.env.APP_UPDATE_DOWNLOAD_BASE_URL || '').trim().replace(/\/+$/, '');
  if (envBase) return envBase;
  const meta = getGitRemoteMeta();
  const branch = getCurrentBranchName();
  if (!meta || !branch) return '';
  return `https://media.githubusercontent.com/media/${meta.owner}/${meta.repo}/${branch}/releases`;
}

function updateAppUpdateConfig({ version, buildNumber, filename }) {
  const configPath = path.resolve(__dirname, '../server/config/app-update.json');
  if (!fs.existsSync(configPath)) return;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    console.warn('Could not parse server/config/app-update.json (skip auto update)');
    return;
  }

  config.latestVersion = version;
  if (buildNumber) config.latestBuildNumber = String(buildNumber);
  config.publishedAt = new Date().toISOString();

  const baseUrl = getDownloadBaseUrl();
  if (baseUrl) {
    config.downloadUrl = `${baseUrl}/${filename}`;
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log(`Updated app update config: ${configPath}`);
}

const version = readAppVersion();
const buildNumber = readBuildNumber();

// Ensure releases directory exists
const releasesDir = path.resolve(__dirname, '../releases');
if (!fs.existsSync(releasesDir)) {
  fs.mkdirSync(releasesDir);
}

console.log('Building Android Release APK...');

try {
  // Execute Gradle build from android directory
  const androidDir = path.resolve(__dirname, '../android');
  
  // Use gradlew.bat on Windows, ./gradlew on Unix-like
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  
  execSync(`${gradlew} assembleRelease`, {
    cwd: androidDir,
    stdio: 'inherit'
  });

  const sourceApk = path.resolve(androidDir, 'app/build/outputs/apk/release/app-release.apk');
  
  if (fs.existsSync(sourceApk)) {
    // Generate filename: release-lan-sync-v1.1.35-202602252001.apk
    const now = new Date();
    const dateStr = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0');
    
    const filename = `release-lan-sync-v${version}-${dateStr}.apk`;
    const destApk = path.join(releasesDir, filename);

    fs.copyFileSync(sourceApk, destApk);
    console.log(`\n✅ Success! APK copied to:\n${destApk}`);
    updateAppUpdateConfig({ version, buildNumber, filename });
  } else {
    console.error('\n❌ Build finished but APK file not found at expected location.');
  }

} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}

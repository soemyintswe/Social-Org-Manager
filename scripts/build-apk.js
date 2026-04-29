/* global __dirname */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const cleanupReleases = path.resolve(__dirname, './cleanup-releases.js');

function normalizeVariant(raw) {
  const value = String(raw || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (value === 'org-client' || value === 'client' || value === 'org') return 'org-client';
  if (value === 'central-admin' || value === 'admin' || value === 'central') return 'central-admin';
  return 'unified';
}

function getAppVariant() {
  return normalizeVariant(process.env.APP_VARIANT || process.env.EXPO_PUBLIC_APP_VARIANT || 'unified');
}

function getReleaseArtifactBaseName() {
  const variant = getAppVariant();
  if (variant === 'central-admin') return 'org-registry-central-admin';
  if (variant === 'org-client') return 'social-org-manager-org-client';
  return 'release-lan-sync';
}

function readAppVersion() {
  try {
    const appJsonRaw = fs.readFileSync(path.resolve(__dirname, '../app.json'), 'utf8');
    const appJson = JSON.parse(appJsonRaw);
    const expoVersion = String(appJson?.expo?.version || '').trim();
    if (expoVersion) return expoVersion;
  } catch {}
  try {
    const packageJsonRaw = fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8');
    const packageJson = JSON.parse(packageJsonRaw);
    const packageVersion = String(packageJson?.version || '').trim();
    if (packageVersion) return packageVersion;
  } catch {}
  return '0.0.0';
}

function readBuildNumber() {
  try {
    const appJsonRaw = fs.readFileSync(path.resolve(__dirname, '../app.json'), 'utf8');
    const appJson = JSON.parse(appJsonRaw);
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
  if (!meta) return '';
  return `https://github.com/${meta.owner}/${meta.repo}/releases/latest/download`;
}

function getAppUpdateConfigPath() {
  const variant = getAppVariant();
  const filename = variant === 'unified' ? 'app-update.json' : `app-update.${variant}.json`;
  return path.resolve(__dirname, '../server/config', filename);
}

function prepareGoogleServicesConfig() {
  const variant = getAppVariant();
  const appDir = path.resolve(__dirname, '../android/app');
  const sourceName =
    variant === 'central-admin'
      ? 'google-services.central-admin.json'
      : variant === 'org-client'
        ? 'google-services.org-client.json'
        : 'google-services.unified.json';
  const sourcePath = path.join(appDir, sourceName);
  const destPath = path.join(appDir, 'google-services.json');

  if (!fs.existsSync(sourcePath)) {
    console.warn(`Google services variant file not found (skip): ${sourcePath}`);
    return;
  }

  const sourceRaw = fs.readFileSync(sourcePath, 'utf8');
  const destRaw = fs.existsSync(destPath) ? fs.readFileSync(destPath, 'utf8') : '';
  if (sourceRaw !== destRaw) {
    fs.writeFileSync(destPath, sourceRaw, 'utf8');
    console.log(`Prepared google services config: ${sourceName}`);
  } else {
    console.log(`Google services config already ready: ${sourceName}`);
  }
}

function syncAndroidNativeVersion({ version, buildNumber }) {
  const gradlePath = path.resolve(__dirname, '../android/app/build.gradle');
  if (!fs.existsSync(gradlePath)) {
    console.warn('android/app/build.gradle not found (skip native version sync)');
    return;
  }
  const original = fs.readFileSync(gradlePath, 'utf8');
  let next = original;

  const buildNum = Number(buildNumber);
  if (Number.isFinite(buildNum) && buildNum > 0) {
    next = next.replace(/versionCode\s+\d+/, `versionCode ${buildNum}`);
  }
  if (String(version || '').trim()) {
    next = next.replace(/versionName\s+["'][^"']+["']/, `versionName "${String(version).trim()}"`);
  }

  if (next !== original) {
    fs.writeFileSync(gradlePath, next, 'utf8');
    console.log(`Synced native Android version in ${gradlePath}`);
  } else {
    console.log('Native Android version already in sync.');
  }
}

function updateAppUpdateConfig({ version, buildNumber, filename }) {
  const configPath = getAppUpdateConfigPath();
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
  config.variant = getAppVariant();

  const baseUrl = getDownloadBaseUrl();
  if (baseUrl) {
    config.downloadUrl = `${baseUrl}/${filename}`;
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log(`Updated app update config: ${configPath}`);
}

const version = readAppVersion();
const buildNumber = readBuildNumber();
syncAndroidNativeVersion({ version, buildNumber });
prepareGoogleServicesConfig();

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
  
  const gradleFlags = [
    '--no-daemon',
    '-Dkotlin.incremental=false',
    '-Dkotlin.incremental.useClasspathSnapshot=false',
    '-Dorg.gradle.caching=false'
  ];

  const gradleUserHome = process.platform === 'win32'
    ? 'C:\\g'
    : (process.env.GRADLE_USER_HOME || path.resolve(__dirname, '../.gradle-user-home'));
  if (!fs.existsSync(gradleUserHome)) {
    fs.mkdirSync(gradleUserHome, { recursive: true });
  }

  execSync(`${gradlew} assembleRelease ${gradleFlags.join(' ')}`, {
    cwd: androidDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      GRADLE_USER_HOME: gradleUserHome,
    },
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
    
    const filename = `${getReleaseArtifactBaseName()}-v${version}-${dateStr}.apk`;
    const destApk = path.join(releasesDir, filename);

    fs.copyFileSync(sourceApk, destApk);
    console.log(`\n✅ Success! APK copied to:\n${destApk}`);
    updateAppUpdateConfig({ version, buildNumber, filename });
    execSync(`node "${cleanupReleases}"`, {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    });
  } else {
    console.error('\n❌ Build finished but APK file not found at expected location.');
  }

} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}

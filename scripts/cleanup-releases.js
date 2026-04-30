/* global __dirname */

const fs = require('fs');
const path = require('path');

const releasesDir = path.resolve(__dirname, '../releases');
const KEEP_VERSIONS = Math.max(1, Number(process.env.RELEASES_KEEP_VERSIONS || 4));
const APK_PATTERN = /^release-lan-sync-v(?<version>\d+\.\d+\.\d+)-(?<stamp>\d{12})\.apk$/i;

function readReleaseEntries() {
  if (!fs.existsSync(releasesDir)) return [];
  return fs.readdirSync(releasesDir)
    .map((name) => {
      const match = name.match(APK_PATTERN);
      if (!match?.groups) return null;
      return {
        name,
        version: match.groups.version,
        stamp: match.groups.stamp,
        fullPath: path.join(releasesDir, name),
      };
    })
    .filter(Boolean);
}

function sortByNewest(entries) {
  return [...entries].sort((a, b) => b.stamp.localeCompare(a.stamp));
}

function cleanupReleases() {
  const entries = sortByNewest(readReleaseEntries());
  if (entries.length <= KEEP_VERSIONS) {
    console.log(`Release cleanup: nothing to remove (found ${entries.length}, keep ${KEEP_VERSIONS}).`);
    return;
  }

  const keep = [];
  const seenVersions = new Set();
  for (const entry of entries) {
    if (seenVersions.has(entry.version)) continue;
    seenVersions.add(entry.version);
    keep.push(entry);
    if (keep.length >= KEEP_VERSIONS) break;
  }

  const keepNames = new Set(keep.map((entry) => entry.name));
  const remove = entries.filter((entry) => !keepNames.has(entry.name));

  for (const entry of remove) {
    if (fs.existsSync(entry.fullPath)) {
      fs.unlinkSync(entry.fullPath);
      console.log(`Removed old release: ${entry.name}`);
    }
  }

  console.log(
    `Release cleanup complete. Keeping ${keep.length} APKs across the latest ${KEEP_VERSIONS} versions.`
  );
}

cleanupReleases();

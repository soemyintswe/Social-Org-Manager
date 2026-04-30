import * as Crypto from "expo-crypto";

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableNormalize(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    normalized[key] = stableNormalize(obj[key]);
  }
  return normalized;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableNormalize(value));
}

export async function computeSnapshotHash(snapshotData: Record<string, string>): Promise<string> {
  const canonical = stableStringify(snapshotData || {});
  return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical);
}

export async function verifySnapshotHash(input: {
  snapshotData: Record<string, string>;
  expectedHash?: string;
}): Promise<{ ok: boolean; computedHash: string; reason?: string }> {
  const computedHash = await computeSnapshotHash(input.snapshotData);
  const expected = String(input.expectedHash || "").trim();
  if (!expected) {
    return { ok: true, computedHash };
  }
  if (computedHash !== expected) {
    return { ok: false, computedHash, reason: "snapshot_hash_mismatch" };
  }
  return { ok: true, computedHash };
}

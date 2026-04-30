import * as Crypto from "expo-crypto";

let entropyCounter = 0;

function getSecureRandomBytes(byteLength: number): Uint8Array {
  const safeLength = Math.max(1, Math.floor(byteLength));
  const output = new Uint8Array(safeLength);
  const webCrypto = (globalThis as any)?.crypto;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(output);
    return output;
  }

  let fallbackSeed = "";
  try {
    fallbackSeed = String(Crypto.randomUUID() || "").replace(/-/g, "");
  } catch {
    fallbackSeed = "";
  }
  if (!fallbackSeed) {
    entropyCounter = (entropyCounter + 1) % 2147483647;
    fallbackSeed = `${Date.now().toString(16)}${entropyCounter.toString(16)}`;
  }
  for (let i = 0; i < output.length; i += 1) {
    const code = fallbackSeed.charCodeAt(i % fallbackSeed.length) || (i * 31);
    output[i] = code & 0xff;
  }
  return output;
}

export function secureRandomToken(size = 10): string {
  const bytes = getSecureRandomBytes(Math.ceil(size / 2));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, Math.max(1, size));
}

export function secureRandomInt(maxExclusive: number): number {
  const max = Math.floor(maxExclusive);
  if (!Number.isFinite(max) || max <= 1) return 0;
  const bytes = getSecureRandomBytes(4);
  const value =
    ((bytes[0] << 24) >>> 0) +
    ((bytes[1] << 16) >>> 0) +
    ((bytes[2] << 8) >>> 0) +
    (bytes[3] >>> 0);
  return value % max;
}

export function secureRandomId(prefix = "id"): string {
  return `${prefix}-${Date.now()}-${secureRandomToken(8)}`;
}

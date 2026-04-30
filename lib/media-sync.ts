import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";

export type MediaUploadInput = {
  base64DataUrl: string;
  fileName?: string;
  mimeType?: string;
};

export type MediaUploadResult = {
  url: string;
  provider?: "google_drive" | "firebase_storage" | "custom";
  fileId?: string;
};

export type MediaUploader = (input: MediaUploadInput) => Promise<MediaUploadResult>;

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const matched = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/i);
  if (!matched) return null;
  return { mimeType: matched[1], base64: matched[2] };
}

function inferExt(mimeType: string): string {
  const m = String(mimeType || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return "jpg";
}

export async function uploadImageAndReturnUrl(
  imageValue: string,
  uploader: MediaUploader
): Promise<string> {
  const raw = String(imageValue || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;

  const parsed = parseDataUrl(raw);
  if (!parsed) return raw;

  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, parsed.base64.slice(0, 5000));
  const fileName = `img_${Date.now()}_${hash.slice(0, 10)}.${inferExt(parsed.mimeType)}`;
  const result = await uploader({
    base64DataUrl: raw,
    fileName,
    mimeType: parsed.mimeType,
  });
  return String(result?.url || "").trim() || raw;
}

async function getCachePath(url: string): Promise<string> {
  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, url);
  return `${baseDir}media_cache_${hash}.img`;
}

export async function getCachedImageUri(url: string): Promise<string> {
  const normalized = String(url || "").trim();
  if (!normalized || !/^https?:\/\//i.test(normalized)) return normalized;

  try {
    const localPath = await getCachePath(normalized);
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) return localPath;

    const download = await FileSystem.downloadAsync(normalized, localPath);
    if (download?.status && download.status >= 200 && download.status < 300) {
      return localPath;
    }
    return normalized;
  } catch {
    return normalized;
  }
}

export async function warmImageCache(urls: string[]): Promise<void> {
  for (const url of urls) {
    const raw = String(url || "").trim();
    if (!raw) continue;
    try {
      await getCachedImageUri(raw);
    } catch {
      // best effort cache prefetch
    }
  }
}

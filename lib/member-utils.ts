export const MYANMAR_DIGITS = ["၀", "၁", "၂", "၃", "၄", "၅", "၆", "၇", "၈", "၉"] as const;

export function toEnglishDigits(input: string): string {
  return input.replace(/[၀-၉]/g, (digit) => {
    const idx = MYANMAR_DIGITS.findIndex((value) => value === digit);
    return idx >= 0 ? String(idx) : digit;
  });
}

export function formatDateDdMmYyyy(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function parseGregorianDate(input?: string | null): Date | null {
  const raw = toEnglishDigits((input || "").trim());
  if (!raw) return null;

  let day = 0;
  let month = 0;
  let year = 0;

  if (/^\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}$/.test(raw)) {
    const [y, m, d] = raw.split(/[\/.\-]/).map((part) => parseInt(part, 10));
    year = y;
    month = m;
    day = d;
  } else if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(raw)) {
    const [d, m, y] = raw.split(/[\/.\-]/).map((part) => parseInt(part, 10));
    day = d;
    month = m;
    year = y < 100 ? 2000 + y : y;
  } else {
    return null;
  }

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (year < 1900 || year > 9999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

export function normalizeDateText(input?: string | null): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  const parsed = parseGregorianDate(raw);
  if (!parsed) return raw;
  return formatDateDdMmYyyy(parsed);
}

function normalizeSinglePhone(rawValue: string): string {
  const raw = toEnglishDigits(rawValue).trim();
  if (!raw) return "";

  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";

  let normalized = digits;
  if (normalized.startsWith("0095")) {
    normalized = normalized.slice(4);
  } else if (normalized.startsWith("95")) {
    normalized = normalized.slice(2);
  }

  if (normalized.startsWith("9")) {
    normalized = `0${normalized}`;
  }

  return normalized;
}

function splitByCommonSeparators(raw: string): string[] {
  return raw
    .replace(/[၊။]/g, "/")
    .split(/[\/\\|,;\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function splitPhoneNumbers(primaryInput?: string | null, secondaryInput?: string | null): {
  primaryPhone: string;
  secondaryPhone: string;
} {
  const tokens = [
    ...splitByCommonSeparators(primaryInput || ""),
    ...splitByCommonSeparators(secondaryInput || ""),
  ];

  const normalizedUnique: string[] = [];
  for (const token of tokens) {
    const normalized = normalizeSinglePhone(token);
    if (!normalized) continue;
    if (!normalizedUnique.includes(normalized)) normalizedUnique.push(normalized);
  }

  return {
    primaryPhone: normalizedUnique[0] || "",
    secondaryPhone: normalizedUnique[1] || "",
  };
}

export function formatPhoneForDisplay(primary?: string | null, secondary?: string | null): string {
  const { primaryPhone, secondaryPhone } = splitPhoneNumbers(primary, secondary);
  const parts = [primaryPhone, secondaryPhone].filter(Boolean);
  return parts.join(" / ");
}

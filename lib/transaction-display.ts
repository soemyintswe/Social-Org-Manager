import { CATEGORY_LABELS } from "./types";

const CATEGORY_LABELS_MM: Record<string, string> = {
  member_fees: "လစဉ်ကြေးရငွေ",
  monthly_fee: "လစဉ်ကြေးရငွေ",
  donations: "အလှူငွေရရှိ",
  donation: "အလှူငွေရရှိ",
  bank_interest: "ဘဏ်တိုးရငွေ",
  other_income: "အခြားရငွေ",
  loan_repayment: "ချေးငွေပြန်ဆပ်ရရှိငွေ",
  interest_income: "အတိုးရငွေ",
  health_support: "ကျန်းမာရေးထောက်ပံ့ငွေ",
  education_support: "ပညာရေးထောက်ပံ့ငွေ",
  funeral_support: "နာရေးကူညီငွေ",
  loan_disbursement: "ချေးငွေထုတ်ပေးငွေ",
  bank_charges: "ဘဏ်စရိတ်ပေးငွေ",
  general_expenses: "အထွေထွေအသုံးစရိတ်",
  other_expenses: "အခြားအသုံးစရိတ်",
  bank_deposit: "ဘဏ်သို့ ငွေသွင်းခြင်း",
  bank_withdraw: "ဘဏ်မှ ငွေထုတ်ခြင်း",
  loan_issued: "ချေးငွေထုတ်ပေးခြင်း",
  general_expense: "အထွေထွေအသုံးစရိတ်",
  welfare_health: "ကျန်းမာရေးထောက်ပံ့မှု",
  welfare_education: "ပညာရေးထောက်ပံ့မှု",
  welfare_funeral: "နာရေးကူညီမှု",
  other: "အခြား",
};

const TECHNICAL_NOTE_KEYS = [
  "beneficiary_scope",
  "linked_member",
  "source_category",
  "linked_member_id",
  "beneficiary_member_id",
  "request_kind",
  "request_id",
  "source_type",
];

const TECHNICAL_NOTE_KEY_SET = new Set(TECHNICAL_NOTE_KEYS.map((key) => key.toLowerCase()));

function compactText(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForCompare(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s\u200b\u200c\u200d\ufeff]/g, "")
    .trim();
}

function looksLikeToken(value: string): boolean {
  return /^[a-z][a-z0-9_]*$/i.test(value);
}

function cleanNotePart(part: string): string {
  let cleaned = part;
  for (const key of TECHNICAL_NOTE_KEYS) {
    const keyPattern = new RegExp(`(?:^|\\s*[,:;\\-]?\\s*)${key}\\s*=\\s*[^|]+`, "gi");
    cleaned = cleaned.replace(keyPattern, " ");
  }
  if (/^[a-z_][a-z0-9_]*\s*=/i.test(cleaned.trim())) return "";
  return compactText(cleaned)
    .replace(/^[|,;:\-]+/, "")
    .replace(/[|,;:\-]+$/, "")
    .trim();
}

function formatMonthYear(dateValue: unknown): string {
  const d = new Date(String(dateValue || ""));
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getFullYear()}`;
}

function buildMemberFeePeriodText(txn: any): string {
  const category = String(txn?.category || "").trim();
  if (category !== "member_fees" && category !== "monthly_fee") return "";
  const start = formatMonthYear(txn?.feePeriodStart);
  const end = formatMonthYear(txn?.feePeriodEnd);
  if (start && end) return `${start} မှ ${end} ထိ လစဉ်ကြေးပေးသွင်းခြင်း`;
  if (start) return `${start} မှစတင် လစဉ်ကြေးပေးသွင်းခြင်း`;
  if (end) return `${end} အထိ လစဉ်ကြေးပေးသွင်းခြင်း`;
  return "";
}

export function getLocalizedTransactionCategoryLabel(category: unknown, categoryLabel?: unknown): string {
  const rawLabel = compactText(categoryLabel);
  if (rawLabel) {
    if (CATEGORY_LABELS_MM[rawLabel]) return CATEGORY_LABELS_MM[rawLabel];
    if (!looksLikeToken(rawLabel)) return rawLabel;
  }
  const key = compactText(category || rawLabel);
  if (!key) return "-";
  return CATEGORY_LABELS_MM[key] || CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS] || key;
}

export function stripTechnicalNoteText(value: unknown): string {
  const raw = compactText(value);
  if (!raw) return "";
  const parts = raw.split("|").map((part) => cleanNotePart(part)).filter(Boolean);
  if (!parts.length) return "";
  return parts.join(" | ");
}

function isTechnicalNotePart(part: string): boolean {
  const normalized = compactText(part);
  if (!normalized) return false;
  const matched = normalized.match(/^([a-z_][a-z0-9_]*)\s*=/i);
  if (!matched) return false;
  return TECHNICAL_NOTE_KEY_SET.has(String(matched[1] || "").toLowerCase());
}

export function splitTransactionNoteForEditing(value: unknown): {
  humanNote: string;
  technicalTokens: string[];
} {
  const raw = compactText(value);
  if (!raw) return { humanNote: "", technicalTokens: [] };
  const parts = raw.split("|").map((part) => compactText(part)).filter(Boolean);
  const technicalTokens: string[] = [];
  const humanParts: string[] = [];
  parts.forEach((part) => {
    if (isTechnicalNotePart(part)) {
      technicalTokens.push(part);
    } else {
      const cleaned = cleanNotePart(part);
      if (cleaned) humanParts.push(cleaned);
    }
  });
  return {
    humanNote: humanParts.join(" | "),
    technicalTokens,
  };
}

export function getHumanReadableTransactionNote(txn: any): string {
  const cleaned = stripTechnicalNoteText(txn?.notes || txn?.description || "");
  if (cleaned) return cleaned;
  const feePeriodText = buildMemberFeePeriodText(txn);
  if (feePeriodText) return feePeriodText;
  return compactText(txn?.receiptNumber);
}

export function getTransactionDisplayDescription(txn: any, memberName?: string): string {
  const name = compactText(memberName);
  const note = getHumanReadableTransactionNote(txn);
  if (!name) return note;
  if (!note) return name;
  if (normalizeForCompare(note).includes(normalizeForCompare(name))) return note;
  return `${name} - ${note}`;
}

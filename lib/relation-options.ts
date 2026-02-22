export const CUSTOM_RELATION_STORAGE_KEY = "@org_notice_custom_relations";

const BASE_RELATIONS = [
  "ဖခင်",
  "မိခင်",
  "သား",
  "သမီး",
  "သားမက်",
  "ချွေးမ",
  "မြေး",
  "အစ်ကို",
  "အစ်မ",
  "ညီ",
  "ညီမ",
  "မောင်",
  "တူ",
  "တူမ",
  "ဦးလေး",
  "အဒေါ်",
  "ဒေါ်လေး",
  "ယောက္ခထီး",
  "ယောက္ခမ",
  "အတူနေမိသားစုဝင်",
] as const;

export const DEFAULT_RELATION_OPTIONS_WITH_SELF = ["ကိုယ်တိုင်", ...BASE_RELATIONS] as const;
export const DEFAULT_FAMILY_RELATION_OPTIONS = [...BASE_RELATIONS] as const;

export function mergeRelationOptions(
  customRelations: string[] = [],
  includeSelf = true
): string[] {
  const base = includeSelf ? [...DEFAULT_RELATION_OPTIONS_WITH_SELF] : [...DEFAULT_FAMILY_RELATION_OPTIONS];
  const merged = [
    ...base,
    ...customRelations.map((x) => String(x || "").trim()).filter(Boolean),
  ];
  return Array.from(new Set(merged));
}

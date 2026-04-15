export type CategoryFilterOption = { id: string; label: string };

export const INCOME_CATEGORY_FILTERS: CategoryFilterOption[] = [
  { id: "member_fees", label: "လစဉ်ကြေးရငွေ" },
  { id: "donations", label: "အလှူငွေရရှိ" },
  { id: "other_income", label: "အခြားရငွေ" },
  { id: "loan_repayment", label: "ချေးငွေပြန်ဆပ်ရရှိငွေ" },
  { id: "interest_income", label: "အတိုးရငွေ" },
];

export const EXPENSE_CATEGORY_FILTERS: CategoryFilterOption[] = [
  { id: "health_support", label: "ကျန်းမာရေးထောက်ပံ့ငွေ" },
  { id: "education_support", label: "ပညာရေးထောက်ပံ့ငွေ" },
  { id: "funeral_support", label: "နာရေးကူညီငွေ" },
  { id: "loan_disbursement", label: "ချေးငွေထုတ်ပေးငွေ" },
  { id: "bank_charges", label: "ဘဏ်စရိတ်ပေးငွေ" },
  { id: "general_expenses", label: "အထွေထွေအသုံးစရိတ်" },
  { id: "other_expenses", label: "အခြားအသုံးစရိတ်" },
  { id: "entertaining_expense", label: "ဧည့်ခံစရိတ်" },
  { id: "donation", label: "လှူဒါန်းငွေ" },
];

export const TRANSFER_CATEGORY_FILTERS: CategoryFilterOption[] = [
  { id: "bank_deposit", label: "ဘဏ်သို့ ငွေသွင်းခြင်း (Deposit)" },
  { id: "bank_withdraw", label: "ဘဏ်မှ ငွေထုတ်ခြင်း (Withdraw)" },
  { id: "bank_interest", label: "ဘဏ်တိုးရငွေ (Bank Interest)" },
];

export function normalizeFinanceCategory(value: unknown, categoryLabel?: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  const label = String(categoryLabel || "").trim().toLowerCase();
  const merged = `${raw} ${label}`.trim();

  if (raw === "member_fees" || raw === "monthly_fee" || merged.includes("လစဉ်ကြေး")) return "member_fees";
  if (raw === "donations" || raw === "donation" || merged.includes("အလှူ")) return raw === "donations" ? "donations" : "donation";
  if (raw === "bank_interest" || merged.includes("ဘဏ်တိုး")) return "bank_interest";
  if (raw === "other_income" || (raw === "other" && merged.includes("ရငွေ"))) return "other_income";
  if (raw === "loan_repayment" || raw === "loan_repaid" || merged.includes("ပြန်ဆပ်")) return "loan_repayment";
  if (raw === "interest_income" || merged.includes("အတိုး")) return "interest_income";

  if (raw === "health_support" || raw === "welfare_health" || merged.includes("ကျန်းမာရေး")) return "health_support";
  if (raw === "education_support" || raw === "welfare_education" || merged.includes("ပညာရေး")) return "education_support";
  if (raw === "funeral_support" || raw === "welfare_funeral" || merged.includes("နာရေး")) return "funeral_support";
  if (raw === "loan_disbursement" || raw === "loan_issued" || merged.includes("ချေးငွေထုတ်")) return "loan_disbursement";
  if (raw === "bank_charges" || raw === "bank_fees" || merged.includes("ဘဏ်စရိတ်")) return "bank_charges";
  if (raw === "general_expenses" || raw === "general_expense" || merged.includes("အထွေထွေ")) return "general_expenses";
  if (raw === "other_expenses" || raw === "other_expense" || (raw === "other" && merged.includes("အသုံး"))) return "other_expenses";
  if (raw === "entertaining_expense" || raw === "entertainment" || raw === "entertainment_expense" || merged.includes("ဧည့်ခံ")) {
    return "entertaining_expense";
  }
  if (raw === "donation" || raw === "donation_expense" || merged.includes("လှူဒါန်း")) return "donation";

  if (raw === "bank_deposit" || merged.includes("ဘဏ်သို့ ငွေသွင်း")) return "bank_deposit";
  if (raw === "bank_withdraw" || merged.includes("ဘဏ်မှ ငွေထုတ်")) return "bank_withdraw";

  return raw;
}

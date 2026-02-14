// lib/types.ts

export const MEMBER_STATUS_VALUES = ["applicant", "active", "resigned", "deceased", "expelled", "suspended"] as const;

export type MemberStatus = (typeof MEMBER_STATUS_VALUES)[number];

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  applicant: "လျှောက်ထားသူ",
  active: "ပုံမှန်",
  resigned: "နှုတ်ထွက်",
  deceased: "ကွယ်လွန်",
  expelled: "ထုတ်ပယ်",
  suspended: "ဆိုင်းငံ့",
};

export const ORG_POSITION_VALUES = [
  "patron",
  "chairperson",
  "secretary",
  "treasurer",
  "auditor",
  "committee_member",
  "member",
  "applicant",
] as const;

export type OrgPosition = (typeof ORG_POSITION_VALUES)[number];

export const ORG_POSITION_LABELS: Record<OrgPosition, string> = {
  patron: "နာယက",
  chairperson: "ဥက္ကဋ္ဌ",
  secretary: "အတွင်းရေးမှူး",
  treasurer: "ဘဏ္ဍာရေးမှူး",
  auditor: "စာရင်းစစ်",
  committee_member: "ကော်မတီအဖွဲ့ဝင်",
  member: "သာမန်အသင်းဝင်",
  applicant: "လျှောက်ထားသူ",
};

export const SYSTEM_ROLE_VALUES = ["admin", "org_user"] as const;

export type SystemRole = (typeof SYSTEM_ROLE_VALUES)[number];

export function normalizeMemberStatus(value: unknown): MemberStatus {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "လျှောက်ထားသူ") return "applicant";
  if (raw === "ပုံမှန်") return "active";
  if (raw === "နှုတ်ထွက်") return "resigned";
  if (raw === "ကွယ်လွန်") return "deceased";
  if (raw === "ထုတ်ပယ်") return "expelled";
  if (raw === "ဆိုင်းငံ့") return "suspended";
  if (raw === "pending") return "applicant";
  if (raw === "applying") return "applicant";
  if (raw === "applicant") return "applicant";
  if (raw === "inactive") return "resigned";
  if (raw === "suspend") return "suspended";
  if (raw === "deactive") return "resigned";
  if ((MEMBER_STATUS_VALUES as readonly string[]).includes(raw)) {
    return raw as MemberStatus;
  }
  return "active";
}

export function normalizeOrgPosition(value: unknown): OrgPosition {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "နာယက") return "patron";
  if (raw === "ဥက္ကဋ္ဌ") return "chairperson";
  if (raw === "အတွင်းရေးမှူး") return "secretary";
  if (raw === "ဘဏ္ဍာရေးမှူး") return "treasurer";
  if (raw === "စာရင်းစစ်") return "auditor";
  if (raw === "ကော်မတီအဖွဲ့ဝင်") return "committee_member";
  if (raw === "သာမန်အသင်းဝင်") return "member";
  if (raw === "လျှောက်ထားသူ") return "applicant";
  if (raw === "member") return "member";
  if (raw === "committee") return "committee_member";
  if ((ORG_POSITION_VALUES as readonly string[]).includes(raw)) {
    return raw as OrgPosition;
  }
  return "member";
}

export interface Member {
  id: string;
  name: string;
  dob?: string;
  nrc?: string;
  phone: string;
  secondaryPhone?: string;
  email?: string;
  systemRole?: SystemRole;
  orgPosition?: OrgPosition;
  address?: string;
  joinDate: string;
  status: MemberStatus;
  statusDate?: string;
  statusReason?: string;
  resignDate?: string;
  avatarColor?: string;
  createdAt: string;
  color: string;
  role: string;
}

export interface OrgEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  attendeeIds: string[];
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  color: string;
  memberIds: string[];
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  eventId: string;
  memberId: string;
  date: string;
  status: "present" | "absent"; 
}

export interface AccountSettings {
  orgName: string;
  currency: string;
  openingBalanceCash: number;
  openingBalanceBank: number;
  asOfDate: string;
}

export type TransactionType = "income" | "expense";

export type TransactionCategory =
  | "monthly_fee"
  | "donation"
  | "welfare_health"
  | "welfare_education"
  | "welfare_funeral"
  | "loan_issued"
  | "loan_repayment"
  | "general_expense"
  | "other";

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  monthly_fee: "လစဉ်ကြေး",
  donation: "အလှူငွေ",
  welfare_health: "ကျန်းမာရေးထောက်ပံ့မှု",
  welfare_education: "ပညာရေးထောက်ပံ့မှု",
  welfare_funeral: "နာရေးကူညီမှု",
  loan_issued: "ချေးငွေထုတ်ပေးခြင်း",
  loan_repayment: "ချေးငွေပြန်ဆပ်ခြင်း",
  general_expense: "အထွေထွေအသုံးစရိတ်",
  other: "အခြား",
};

export const INCOME_CATEGORIES: TransactionCategory[] = [
  "monthly_fee",
  "donation",
  "loan_repayment",
  "other",
];

export const EXPENSE_CATEGORIES: TransactionCategory[] = [
  "welfare_health",
  "welfare_education",
  "welfare_funeral",
  "loan_issued",
  "general_expense",
  "other",
];

export type PaymentMethod = "cash" | "bank";

export interface Transaction {
  id: string;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  memberId?: string;
  description: string;
  date: string;
  paymentMethod: PaymentMethod;
  receiptNumber: string;
  loanId?: string;
  createdAt: string;
}

export interface Loan {
  id: string;
  memberId: string;
  principal: number;
  interestRate: number;
  issueDate: string;
  dueDate?: string;
  repaymentDate?: string;
  status: "active" | "paid";
  description: string;
  createdAt: string;
}

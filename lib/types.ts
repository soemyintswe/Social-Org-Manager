// lib/types.ts

export interface Member {
  id: string;
  name: string;
  dob?: string;
  nrc?: string;
  phone: string;
  email?: string;
  address?: string;
  joinDate: string;
  status: MemberStatus;
  avatarColor?: string;
  createdAt: string;
  color: string;
  role: string;
  orgPosition?: OrgPosition;
  resignDate?: string;
  statusDate?: string;
  statusNote?: string;
  profileImage?: string;
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

export type SystemRole = "admin" | "org_user";
export type OrgPosition = "patron" | "chairperson" | "secretary" | "treasurer" | "auditor" | "committee_member" | "member" | "applicant";
export type MemberStatus = "active" | "resigned" | "deceased" | "expelled" | "suspended" | "applicant";

export interface UserAccount {
  id: string;
  displayName: string;
  systemRole: SystemRole;
  memberId?: string;
  orgPosition?: OrgPosition;
  isActive: boolean;
  createdAt: string;
}

export const ORG_POSITION_LABELS: Record<OrgPosition, string> = {
  patron: "နာယက",
  chairperson: "ဥက္ကဋ္ဌ",
  secretary: "အတွင်းရေးမှူး",
  treasurer: "ဘဏ္ဍာရေးမှူး",
  auditor: "စာရင်းစစ်",
  committee_member: "ကော်မတီအဖွဲ့ဝင်",
  member: "အသင်းဝင်",
  applicant: "လျှောက်ထားသူ",
};

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active: "လက်ရှိ",
  resigned: "နုတ်ထွက်",
  deceased: "ကွယ်လွန်",
  expelled: "ထုတ်ပယ်",
  suspended: "ဆိုင်းငံ့",
  applicant: "လျှောက်ထားဆဲ",
};

export const MEMBER_STATUS_VALUES: MemberStatus[] = ["active", "resigned", "deceased", "expelled", "suspended", "applicant"];

export function normalizeMemberStatus(val: any): MemberStatus {
  const v = String(val || "").toLowerCase();
  if (v.includes("applicant") || v.includes("လျှောက်")) return "applicant";
  if (v.includes("resign") || v.includes("နုတ်ထွက်") || v.includes("inactive")) return "resigned";
  if (v.includes("decease") || v.includes("die") || v.includes("ကွယ်လွန်")) return "deceased";
  if (v.includes("expel") || v.includes("ထုတ်ပယ်")) return "expelled";
  if (v.includes("suspend") || v.includes("ဆိုင်းငံ့")) return "suspended";
  return "active";
}

export function normalizeOrgPosition(val: any): OrgPosition {
  const v = String(val || "").toLowerCase();
  if (v.includes("patron") || v.includes("နာယက")) return "patron";
  if (v.includes("chair") || v.includes("ဥက္ကဋ္ဌ")) return "chairperson";
  if (v.includes("sec") || v.includes("အတွင်း")) return "secretary";
  if (v.includes("treas") || v.includes("ဘဏ္ဍာ")) return "treasurer";
  if (v.includes("audit") || v.includes("စာရင်း")) return "auditor";
  if (v.includes("committee") || v.includes("ကော်မတီ")) return "committee_member";
  if (v.includes("appli") || v.includes("လျှောက်")) return "applicant";
  return "member";
}
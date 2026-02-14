// lib/types.ts

export interface Member {
  id: string;
  name: string;
  dob?: string;
  nrc?: string;
  phone: string;
  secondaryPhone?: string;
  email?: string;
  address?: string;
  joinDate: string;
  status: "active" | "inactive";
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

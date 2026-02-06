export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "admin" | "member" | "volunteer";
  status: "active" | "inactive";
  groupIds: string[];
  joinDate: string;
  avatarColor: string;
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
  eventId: string;
  memberId: string;
  present: boolean;
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
  | "other";

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  monthly_fee: "Monthly Fee",
  donation: "Donation",
  welfare_health: "Welfare - Health",
  welfare_education: "Welfare - Education",
  welfare_funeral: "Welfare - Funeral",
  loan_issued: "Loan Issued",
  loan_repayment: "Loan Repayment",
  other: "Other",
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
  principalAmount: number;
  interestRate: number;
  issueDate: string;
  status: "active" | "paid";
  description: string;
  createdAt: string;
}

export interface AccountSettings {
  openingBalanceCash: number;
  openingBalanceBank: number;
  asOfDate: string;
}

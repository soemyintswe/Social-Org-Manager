// lib/types.ts

export interface Member {
  id: string;
  name: string;
  gender?: MemberGender;
  occupation?: string;
  dob?: string;
  nrc?: string;
  phone: string;
  viberNumber?: string;
  telegramNumber?: string;
  messengerAccount?: string;
  email?: string;
  address?: string;
  addressMapUrl?: string;
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
  familyMembers?: MemberFamilyMember[];
}

export type MemberGender = "male" | "female" | "other";
export const MEMBER_GENDER_VALUES: MemberGender[] = ["male", "female", "other"];
export const MEMBER_GENDER_LABELS: Record<MemberGender, string> = {
  male: "ကျား",
  female: "မ",
  other: "အခြား",
};

export interface MemberFamilyMember {
  id?: string;
  name: string;
  gender?: MemberGender;
  relation?: string;
  dob?: string;
  nrc?: string;
  occupation?: string;
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
  createdByUserId?: string;
  createdByMemberId?: string;
}

export type ChatThreadType = "direct" | "group";

export interface ChatThread {
  id: string;
  type: ChatThreadType;
  name?: string;
  participantUserIds: string[];
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
  lastMessageText?: string;
  lastReadAtBy?: Record<string, string>;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderUserId: string;
  senderMemberId?: string;
  senderDisplayName?: string;
  text?: string;
  image?: string;
  createdAt: string;
  replyToMessageId?: string;
  replyToUserId?: string;
  replyToDisplayName?: string;
  mentionUserIds?: string[];
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
  syncServerUrl?: string;
  syncEnabled?: boolean;
  cloudSyncEnabled?: boolean;
  cloudSyncProvider?: "google_drive_apps_script";
  cloudSyncEndpoint?: string;
  cloudSyncApiKey?: string;
  cloudSyncGoogleAccountEmail?: string;
  cloudSyncFolderName?: string;
  receivingBankName?: string;
  receivingBankAccountNumber?: string;
  receivingBankAccountName?: string;
  receivingKbzPayPhone?: string;
  receivingKbzPayAccountName?: string;
  receivingWavePayPhone?: string;
  receivingWavePayAccountName?: string;
  receivingAyaPayPhone?: string;
  receivingAyaPayAccountName?: string;
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
  auditFlagged?: boolean;
  auditNote?: string;
  auditFlaggedByUserId?: string;
  auditFlaggedAt?: string;
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
export type OrgPosition =
  | "patron"
  | "chairperson"
  | "vice_chairperson"
  | "secretary"
  | "joint_secretary"
  | "treasurer"
  | "auditor"
  | "committee_member"
  | "member"
  | "applicant";
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

export type MemberChangeAction = "create" | "update" | "delete";
export type MemberChangeStatus = "pending" | "approved" | "rejected" | "cancelled";
export type MemberChangeAssignmentAction = "assign" | "unassign" | "reassign";

export interface MemberChangeAssignmentLog {
  action: MemberChangeAssignmentAction;
  byUserId: string;
  toUserId?: string;
  at: string;
}

export interface MemberChangeRequest {
  id: string;
  action: MemberChangeAction;
  targetMemberId?: string;
  payload: {
    member?: Partial<Member>;
    note?: string;
  };
  status: MemberChangeStatus;
  createdByUserId: string;
  createdByMemberId?: string;
  createdAt: string;
  assignedReviewerUserId?: string;
  assignedByUserId?: string;
  assignedAt?: string;
  assignmentHistory?: MemberChangeAssignmentLog[];
  reviewedByUserId?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export type ClaimantType = "SELF" | "BEHALF_MEMBER" | "BEHALF_FAMILY" | "OTHER";
export type ExpenseClaimStatus = "pending_approval" | "approved" | "rejected" | "disbursed";
export type DisbursementMethod = "cash" | "bank";
export type MobileWalletProvider = "kbz_pay" | "wave_pay" | "aya_pay";
export type MemberPaymentRequestStatus = "pending_treasurer_review" | "approved" | "rejected";

export type MemberPaymentRequestKind =
  | "member_fees"
  | "donations"
  | "loan_repayment"
  | "interest_income";

export const MEMBER_PAYMENT_REQUEST_KIND_LABELS: Record<MemberPaymentRequestKind, string> = {
  member_fees: "လစဉ်ကြေးပေးသွင်းရန်",
  donations: "လှူဒါန်းရန်",
  loan_repayment: "ချေးငွေဆပ်ရန်",
  interest_income: "အတိုးဆပ်ရန်",
};

export const MOBILE_WALLET_PROVIDER_LABELS: Record<MobileWalletProvider, string> = {
  kbz_pay: "KBZ Pay",
  wave_pay: "Wave Pay",
  aya_pay: "AYA Pay",
};

export interface MemberPaymentRequest {
  id: string;
  requestNumber: string;
  kind: MemberPaymentRequestKind;
  category: string;
  categoryLabel: string;
  amount: number;
  forMemberId?: string;
  forMemberName?: string;
  payerMemberId?: string;
  payerName: string;
  walletProvider: MobileWalletProvider;
  walletAccountName?: string;
  walletAccountNumber?: string;
  walletReference?: string;
  proofImage?: string;
  note?: string;
  status: MemberPaymentRequestStatus;
  requestedDate: string;
  requestedTime?: string;
  feePeriodStart?: string;
  feePeriodEnd?: string;
  createdByUserId: string;
  createdByMemberId?: string;
  createdAt: string;
  updatedAt: string;
  reviewedByUserId?: string;
  reviewNote?: string;
  reviewedAt?: string;
  linkedTransactionId?: string;
  acceptedDate?: string;
  acceptedTime?: string;
  notifiedRoles?: OrgPosition[];
}

export interface ExpenseClaim {
  id: string;
  claimNumber: string;
  claimDate: string;
  claimTime?: string;
  expenseCategory: string;
  expenseCategoryLabel: string;
  claimantType: ClaimantType;
  claimantMemberId?: string;
  relatedMemberId?: string;
  relatedMemberName?: string;
  claimantName: string;
  claimantAddress?: string;
  familyMemberName?: string;
  familyRelation?: string;
  relationDescription?: string;
  nrc?: string;
  phone?: string;
  reason: string;
  linkedEventId?: string;
  linkedEventTitle?: string;
  requestedAmount: number;
  approvedAmount?: number;
  status: ExpenseClaimStatus;
  createdByUserId: string;
  createdByMemberId?: string;
  approverUserId?: string;
  approvalNote?: string;
  approvedAt?: string;
  disburserUserId?: string;
  disbursementMethod?: DisbursementMethod;
  disbursementDate?: string;
  disbursementTime?: string;
  voucherNumber?: string;
  disbursementNote?: string;
  disbursedAt?: string;
  linkedTransactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StandardAmountRule {
  key: string;
  label: string;
  amount: number;
  enabled: boolean;
  updatedAt: string;
  updatedByUserId?: string;
}

export type StandardAmountRequestStatus = "pending_approval" | "approved" | "rejected";

export interface StandardAmountChangeRequest {
  id: string;
  ruleKey: string;
  ruleLabel: string;
  previousAmount: number;
  requestedAmount: number;
  reason: string;
  status: StandardAmountRequestStatus;
  createdByUserId: string;
  createdByMemberId?: string;
  createdAt: string;
  approverUserId?: string;
  approvalNote?: string;
  approvedAt?: string;
}

export const DEFAULT_STANDARD_AMOUNT_RULES: StandardAmountRule[] = [
  { key: "health_support", label: "ကျန်းမာရေးထောက်ပံ့ငွေ", amount: 50000, enabled: true, updatedAt: new Date().toISOString() },
  { key: "education_support", label: "ပညာရေးထောက်ပံ့ငွေ", amount: 50000, enabled: true, updatedAt: new Date().toISOString() },
  { key: "funeral_support_self", label: "နာရေးကူညီငွေ (ကိုယ်တိုင်)", amount: 200000, enabled: true, updatedAt: new Date().toISOString() },
  { key: "funeral_support_family", label: "နာရေးကူညီငွေ (မိသားစုဝင်)", amount: 100000, enabled: true, updatedAt: new Date().toISOString() },
  { key: "funeral_support_association_member", label: "နာရေးကူညီငွေ (ဆင်သေရွာအသင်းဝင်)", amount: 50000, enabled: true, updatedAt: new Date().toISOString() },
  { key: "loan_disbursement", label: "ချေးငွေထုတ်ပေးငွေ", amount: 0, enabled: false, updatedAt: new Date().toISOString() },
  { key: "bank_charges", label: "ဘဏ်စရိတ်ပေးငွေ", amount: 0, enabled: false, updatedAt: new Date().toISOString() },
  { key: "general_expenses", label: "အထွေထွေအသုံးစရိတ်", amount: 0, enabled: false, updatedAt: new Date().toISOString() },
  { key: "other_expenses", label: "အခြားအသုံးစရိတ်", amount: 0, enabled: false, updatedAt: new Date().toISOString() },
  { key: "monthly_fee_rate", label: "လစဉ်ကြေးနှုန်းထား", amount: 2500, enabled: true, updatedAt: new Date().toISOString() },
];

export const ORG_POSITION_LABELS: Record<OrgPosition, string> = {
  patron: "နာယက",
  chairperson: "ဥက္ကဋ္ဌ",
  vice_chairperson: "ဒုတိယဥက္ကဋ္ဌ",
  secretary: "အတွင်းရေးမှူး",
  joint_secretary: "တွဲဘက်အတွင်းရေးမှူး",
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
  if (
    v.includes("vice chair") ||
    v.includes("vice-chair") ||
    v.includes("vice_chair") ||
    v.includes("deputy chair") ||
    v.includes("ဒုတိယဥက္ကဋ္ဌ") ||
    v.includes("ဒုဥက္ကဋ္ဌ")
  ) return "vice_chairperson";
  if (v.includes("chair") || v.includes("ဥက္ကဋ္ဌ")) return "chairperson";
  if (
    v.includes("joint sec") ||
    v.includes("joint-secretary") ||
    v.includes("associate secretary") ||
    v.includes("တွဲဘက်အတွင်းရေးမှူး")
  ) return "joint_secretary";
  if (v.includes("sec") || v.includes("အတွင်း")) return "secretary";
  if (v.includes("treas") || v.includes("ဘဏ္ဍာ")) return "treasurer";
  if (v.includes("audit") || v.includes("စာရင်း")) return "auditor";
  if (v.includes("committee") || v.includes("ကော်မတီ")) return "committee_member";
  if (v.includes("appli") || v.includes("လျှောက်")) return "applicant";
  return "member";
}

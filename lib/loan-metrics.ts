import type { Loan, Transaction } from "./types";

export interface LoanComputedMetrics {
  principal: number;
  principalRepaid: number;
  principalOutstanding: number;
  baseRate: number;
  appliedRate: number;
  calcMonths: number;
  suspensionMonths: number;
  effectiveMonths: number;
  interestSuspended: boolean;
  baseInterest: number;
  discountPercent: number;
  discountAmount: number;
  waivedPercent: number;
  waivedAmount: number;
  interestRelief: number;
  interestPayable: number;
  interestPaid: number;
  interestOutstanding: number;
}

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const parseFlexibleDate = (value: unknown): Date | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split("/");
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const monthDiffInclusive = (startDate: Date | null, endDate: Date | null): number => {
  if (!startDate || !endDate) return 1;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end < start) return 0;
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return months + 1;
};

export const getLoanPrincipal = (loan: Partial<Loan> | any): number => {
  const principal = toNumber((loan as any)?.principal ?? (loan as any)?.amount ?? (loan as any)?.principalAmount ?? 0);
  return Math.max(0, principal);
};

export const getLoanPrincipalRepaid = (loanId: string, rows: Array<Transaction | any>): number => {
  return rows
    .filter((t: any) => String(t?.loanId || "") === String(loanId) && String(t?.type || "") === "income")
    .filter((t: any) => String(t?.category || "") === "loan_repayment")
    .reduce((sum: number, t: any) => sum + Math.max(0, toNumber(t?.amount)), 0);
};

export const getLoanInterestPaid = (loanId: string, rows: Array<Transaction | any>): number => {
  return rows
    .filter((t: any) => String(t?.loanId || "") === String(loanId) && String(t?.type || "") === "income")
    .filter((t: any) => {
      const cat = String(t?.category || "");
      return cat === "interest_income" || cat === "bank_interest";
    })
    .reduce((sum: number, t: any) => sum + Math.max(0, toNumber(t?.amount)), 0);
};

export const computeLoanMetrics = (
  loan: Partial<Loan> | any,
  rows: Array<Transaction | any>,
  asOfDate: Date = new Date()
): LoanComputedMetrics => {
  const principal = getLoanPrincipal(loan);
  const principalRepaid = getLoanPrincipalRepaid(String((loan as any)?.id || ""), rows);
  const principalOutstanding = Math.max(0, principal - principalRepaid);

  const baseRate = Math.max(0, toNumber((loan as any)?.interestRate));
  const overrideRate = toNumber((loan as any)?.interestRateOverride);
  const appliedRate = overrideRate >= 0 ? overrideRate : baseRate;

  const issueDate = parseFlexibleDate((loan as any)?.issueDate || (loan as any)?.date);
  const endDate =
    parseFlexibleDate((loan as any)?.repaymentDate) ||
    parseFlexibleDate((loan as any)?.dueDate) ||
    asOfDate;
  const calcFromDate = parseFlexibleDate((loan as any)?.interestCalcFromDate) || issueDate;
  const calcToDate = parseFlexibleDate((loan as any)?.interestCalcToDate) || endDate;
  const suspensionFromDate = parseFlexibleDate((loan as any)?.interestSuspensionFromDate);
  const suspensionToDate = parseFlexibleDate((loan as any)?.interestSuspensionToDate);

  const overrideMonths = toNumber((loan as any)?.interestCalcMonths);
  const calcMonthsFromDate = monthDiffInclusive(calcFromDate, calcToDate);
  const calcMonths = calcMonthsFromDate > 0 ? calcMonthsFromDate : (overrideMonths > 0 ? overrideMonths : monthDiffInclusive(issueDate, endDate));
  const suspensionMonthsFromDate = monthDiffInclusive(suspensionFromDate, suspensionToDate);
  const suspensionMonthsFallback = Math.max(0, toNumber((loan as any)?.interestSuspensionMonths));
  const suspensionMonths = suspensionMonthsFromDate > 0 ? suspensionMonthsFromDate : suspensionMonthsFallback;
  const interestSuspended = Boolean((loan as any)?.interestSuspended);
  const effectiveMonths = interestSuspended ? 0 : Math.max(0, calcMonths - suspensionMonths);

  const baseInterest = principalOutstanding * (Math.max(0, appliedRate) / 100) * Math.max(0, effectiveMonths);
  const discountPercent = clamp(toNumber((loan as any)?.interestDiscountPercent), 0, 100);
  const discountAmount = Math.max(0, toNumber((loan as any)?.interestDiscountAmount));
  const waivedPercent = clamp(toNumber((loan as any)?.interestWaivedPercent), 0, 100);
  const waivedAmount = Math.max(0, toNumber((loan as any)?.interestWaivedAmount));

  const afterPercent = Math.max(0, baseInterest * (1 - discountPercent / 100));
  const afterDiscountAmount = Math.max(0, afterPercent - discountAmount);
  const waiveByPercentAmount = Math.max(0, afterDiscountAmount * (waivedPercent / 100));
  const interestPayable = Math.max(0, afterDiscountAmount - waiveByPercentAmount - waivedAmount);
  const interestPaid = getLoanInterestPaid(String((loan as any)?.id || ""), rows);
  const interestOutstanding = Math.max(0, interestPayable - interestPaid);

  const interestRelief = Math.max(0, baseInterest - interestPayable);

  return {
    principal,
    principalRepaid,
    principalOutstanding,
    baseRate,
    appliedRate,
    calcMonths,
    suspensionMonths,
    effectiveMonths,
    interestSuspended,
    baseInterest,
    discountPercent,
    discountAmount,
    waivedPercent,
    waivedAmount,
    interestRelief,
    interestPayable,
    interestPaid,
    interestOutstanding,
  };
};

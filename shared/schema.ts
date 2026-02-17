import { sql } from "drizzle-orm";
import {
  boolean,
  numeric,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Schema for Expense Claims
export const expenseClaims = pgTable("expense_claims", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull().unique(),
  claimDate: timestamp("claim_date").notNull(),
  expenseType: text("expense_type").notNull(),
  claimantType: text("claimant_type").notNull(), // 'SELF', 'BEHALF_MEMBER', 'BEHALF_FAMILY', 'OTHER'
  claimantName: text("claimant_name").notNull(),
  claimantId: varchar("claimant_id").references(() => users.id), // Foreign key to users table
  familyMemberName: text("family_member_name"),
  relationship: text("relationship"),
  nrc: text("nrc"),
  phone: text("phone"),
  reason: text("reason"),
  requestedAmount: numeric("requested_amount", { precision: 10, scale: 2 }).notNull(),
  approvedAmount: numeric("approved_amount", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("PENDING_APPROVAL"), // 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DISBURSED'
  approverId: varchar("approver_id").references(() => users.id),
  approvalRemarks: text("approval_remarks"),
  disburserId: varchar("disburser_id").references(() => users.id),
  disbursementDate: timestamp("disbursement_date"),
  disbursementMethod: text("disbursement_method"), // 'CASH', 'BANK'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Schema for Standard Amounts (for both expenses and monthly fees)
export const standardAmounts = pgTable("standard_amounts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // e.g., 'HEALTH_SUPPORT', 'MONTHLY_FEE'
  description: text("description"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  isEditable: boolean("is_editable").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Schema for Standard Amount Change Requests
export const amountChangeRequests = pgTable("amount_change_requests", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  standardAmountId: varchar("standard_amount_id")
    .references(() => standardAmounts.id)
    .notNull(),
  requestedAmount: numeric("requested_amount", { precision: 10, scale: 2 }).notNull(),
  requesterId: varchar("requester_id")
    .references(() => users.id)
    .notNull(),
  status: text("status").notNull().default("PENDING_APPROVAL"), // 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'
  approverId: varchar("approver_id").references(() => users.id),
  approvalRemarks: text("approval_remarks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertExpenseClaimSchema = createInsertSchema(expenseClaims);
export const insertStandardAmountSchema = createInsertSchema(standardAmounts);
export const insertAmountChangeRequestSchema = createInsertSchema(
  amountChangeRequests
);

export type ExpenseClaim = typeof expenseClaims.$inferSelect;
export type StandardAmount = typeof standardAmounts.$inferSelect;
export type AmountChangeRequest = typeof amountChangeRequests.$inferSelect;

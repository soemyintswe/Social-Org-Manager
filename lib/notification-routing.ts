export type NotificationRouteTarget = {
  pathname: string;
  params?: Record<string, string>;
};

export function resolveNotificationRoute(item: any): NotificationRouteTarget {
  const relatedType = String(item?.relatedType || "").trim().toLowerCase();
  const relatedId = String(item?.relatedId || "").trim();
  const category = String(item?.category || "").trim().toLowerCase();

  if (relatedType === "audit_change_request" || category === "audit_change" || category === "delete_request") {
    return {
      pathname: "/audit-change-requests",
      params: relatedId ? { requestId: relatedId } : undefined,
    };
  }

  if (relatedType === "member_payment_request" || category === "payment_request") {
    return {
      pathname: "/member-payment-requests",
      params: relatedId ? { requestId: relatedId } : undefined,
    };
  }

  if (relatedType === "expense_claim" || category === "expense_claim") {
    return {
      pathname: "/expense-claims",
      params: relatedId ? { claimId: relatedId } : undefined,
    };
  }

  if (relatedType === "member_change_request") {
    return {
      pathname: "/member-change-approvals",
      params: relatedId ? { requestId: relatedId } : undefined,
    };
  }

  return { pathname: "/notifications" };
}

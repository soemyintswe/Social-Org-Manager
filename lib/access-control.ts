import {
  type MemberStatus,
  type OrgPosition,
  type SystemRole,
  normalizeMemberStatus,
  normalizeOrgPosition,
} from "./types";

export type AccessPermission =
  | "system.manage"
  | "users.manage"
  | "users.view"
  | "members.view_all"
  | "members.manage"
  | "members.view_self"
  | "members.apply"
  | "finance.view_all"
  | "finance.manage"
  | "finance.view_self"
  | "reports.view_all"
  | "events.manage"
  | "events.view_public"
  | "announcements.manage"
  | "announcements.view_public";

export interface AccessProfile {
  systemRole: SystemRole;
  orgPosition?: OrgPosition;
  memberStatus?: MemberStatus;
  memberId?: string;
}

const COMMITTEE_POSITIONS = new Set<OrgPosition>([
  "patron",
  "chairperson",
  "secretary",
  "treasurer",
  "auditor",
  "committee_member",
]);

export function isCommitteePosition(position?: unknown): boolean {
  return COMMITTEE_POSITIONS.has(normalizeOrgPosition(position));
}

function isApplicantProfile(profile: AccessProfile): boolean {
  return (
    normalizeOrgPosition(profile.orgPosition || "member") === "applicant" ||
    normalizeMemberStatus(profile.memberStatus || "active") === "applicant"
  );
}

function isCommitteeProfile(profile: AccessProfile): boolean {
  return isCommitteePosition(profile.orgPosition);
}

export function canAccess(
  profile: AccessProfile,
  permission: AccessPermission,
  options?: { targetMemberId?: string }
): boolean {
  const systemRole = profile.systemRole;

  if (systemRole === "admin") {
    // Admin only controls system/users, not organization operations.
    return permission === "system.manage" || permission === "users.manage" || permission === "users.view";
  }

  // org_user branch
  if (isCommitteeProfile(profile)) {
    if (permission === "system.manage" || permission === "users.manage") return false;
    return true;
  }

  if (isApplicantProfile(profile)) {
    return (
      permission === "members.apply" ||
      permission === "members.view_self" ||
      permission === "events.view_public" ||
      permission === "announcements.view_public"
    );
  }

  // Regular member
  switch (permission) {
    case "members.view_self":
    case "finance.view_self":
    case "events.view_public":
    case "announcements.view_public":
      return true;
    case "members.view_all":
    case "members.manage":
    case "finance.view_all":
    case "finance.manage":
    case "reports.view_all":
    case "events.manage":
    case "announcements.manage":
    case "system.manage":
    case "users.manage":
    case "users.view":
      return false;
    case "members.apply":
      return false;
    default:
      return false;
  }
}

export function canAccessMemberRecord(profile: AccessProfile, targetMemberId: string): boolean {
  if (canAccess(profile, "members.view_all")) return true;
  if (canAccess(profile, "members.view_self") && profile.memberId && profile.memberId === targetMemberId) return true;
  return false;
}

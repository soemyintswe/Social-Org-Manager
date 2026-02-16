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
  | "members.view_self"
  | "members.create"
  | "members.edit"
  | "members.delete"
  | "members.edit_self"
  | "members.propose_changes"
  | "members.approve_changes"
  | "members.manage"
  | "members.apply"
  | "finance.view_summary"
  | "finance.view_detail"
  | "finance.view_all"
  | "finance.view_self"
  | "finance.create"
  | "finance.edit"
  | "finance.delete"
  | "finance.manage"
  | "finance.audit_flag"
  | "reports.view_summary"
  | "reports.view_all"
  | "events.view_public"
  | "events.create_own"
  | "events.edit_own"
  | "events.delete_own"
  | "events.create_all"
  | "events.edit_all"
  | "events.delete_all"
  | "events.manage"
  | "announcements.view_public"
  | "announcements.create_own"
  | "announcements.edit_own"
  | "announcements.delete_own"
  | "announcements.create_all"
  | "announcements.edit_all"
  | "announcements.delete_all"
  | "announcements.manage";

export interface AccessProfile {
  systemRole: SystemRole;
  orgPosition?: OrgPosition;
  memberStatus?: MemberStatus;
  memberId?: string;
}

export interface AccessOptions {
  targetMemberId?: string;
  isOwnContent?: boolean;
}

type OrgAccessRole =
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

type PermissionChecklist = Record<AccessPermission, boolean>;

const ALL_PERMISSIONS: AccessPermission[] = [
  "system.manage",
  "users.manage",
  "users.view",
  "members.view_all",
  "members.view_self",
  "members.create",
  "members.edit",
  "members.delete",
  "members.edit_self",
  "members.propose_changes",
  "members.approve_changes",
  "members.manage",
  "members.apply",
  "finance.view_summary",
  "finance.view_detail",
  "finance.view_all",
  "finance.view_self",
  "finance.create",
  "finance.edit",
  "finance.delete",
  "finance.manage",
  "finance.audit_flag",
  "reports.view_summary",
  "reports.view_all",
  "events.view_public",
  "events.create_own",
  "events.edit_own",
  "events.delete_own",
  "events.create_all",
  "events.edit_all",
  "events.delete_all",
  "events.manage",
  "announcements.view_public",
  "announcements.create_own",
  "announcements.edit_own",
  "announcements.delete_own",
  "announcements.create_all",
  "announcements.edit_all",
  "announcements.delete_all",
  "announcements.manage",
];

function checklist(overrides: Partial<PermissionChecklist>): PermissionChecklist {
  const base = Object.fromEntries(ALL_PERMISSIONS.map((permission) => [permission, false])) as PermissionChecklist;
  return { ...base, ...overrides };
}

// Phase 1 permission checklist matrix (single source of truth, easy to edit later)
const ORG_ROLE_CHECKLIST: Record<OrgAccessRole, PermissionChecklist> = {
  patron: checklist({
    "members.view_all": true,
    "finance.view_summary": true,
    "finance.view_detail": true,
    "reports.view_summary": true,
    "reports.view_all": true,
    "events.view_public": true,
    "events.create_own": true,
    "events.edit_own": true,
    "events.delete_own": true,
    "announcements.view_public": true,
    "announcements.create_own": true,
    "announcements.edit_own": true,
    "announcements.delete_own": true,
  }),
  chairperson: checklist({
    "members.view_all": true,
    "members.view_self": true,
    "members.create": true,
    "members.edit": true,
    "members.delete": true,
    "members.approve_changes": true,
    "finance.view_summary": true,
    "finance.view_detail": true,
    "reports.view_summary": true,
    "reports.view_all": true,
    "events.view_public": true,
    "events.create_own": true,
    "events.edit_own": true,
    "events.delete_own": true,
    "events.create_all": true,
    "events.edit_all": true,
    "events.delete_all": true,
    "announcements.view_public": true,
    "announcements.create_own": true,
    "announcements.edit_own": true,
    "announcements.delete_own": true,
    "announcements.create_all": true,
    "announcements.edit_all": true,
    "announcements.delete_all": true,
  }),
  vice_chairperson: checklist({
    "members.view_all": true,
    "members.view_self": true,
    "members.create": true,
    "members.edit": true,
    "members.delete": true,
    "members.approve_changes": true,
    "finance.view_summary": true,
    "finance.view_detail": true,
    "reports.view_summary": true,
    "reports.view_all": true,
    "events.view_public": true,
    "events.create_own": true,
    "events.edit_own": true,
    "events.delete_own": true,
    "events.create_all": true,
    "events.edit_all": true,
    "events.delete_all": true,
    "announcements.view_public": true,
    "announcements.create_own": true,
    "announcements.edit_own": true,
    "announcements.delete_own": true,
    "announcements.create_all": true,
    "announcements.edit_all": true,
    "announcements.delete_all": true,
  }),
  secretary: checklist({
    "members.view_all": true,
    "members.propose_changes": true,
    "finance.view_summary": true,
    "finance.view_detail": true,
    "reports.view_summary": true,
    "reports.view_all": true,
    "events.view_public": true,
    "events.create_own": true,
    "events.edit_own": true,
    "events.delete_own": true,
    "events.create_all": true,
    "events.edit_all": true,
    "announcements.view_public": true,
    "announcements.create_own": true,
    "announcements.edit_own": true,
    "announcements.delete_own": true,
    "announcements.create_all": true,
    "announcements.edit_all": true,
  }),
  joint_secretary: checklist({
    "members.view_all": true,
    "members.propose_changes": true,
    "finance.view_summary": true,
    "finance.view_detail": true,
    "reports.view_summary": true,
    "reports.view_all": true,
    "events.view_public": true,
    "events.create_own": true,
    "events.edit_own": true,
    "events.delete_own": true,
    "events.create_all": true,
    "events.edit_all": true,
    "announcements.view_public": true,
    "announcements.create_own": true,
    "announcements.edit_own": true,
    "announcements.delete_own": true,
    "announcements.create_all": true,
    "announcements.edit_all": true,
  }),
  treasurer: checklist({
    "members.view_all": true,
    "finance.view_summary": true,
    "finance.view_detail": true,
    "finance.create": true,
    "finance.edit": true,
    "finance.delete": true,
    "reports.view_summary": true,
    "reports.view_all": true,
    "events.view_public": true,
    "events.create_own": true,
    "events.edit_own": true,
    "events.delete_own": true,
    "announcements.view_public": true,
    "announcements.create_own": true,
    "announcements.edit_own": true,
    "announcements.delete_own": true,
  }),
  auditor: checklist({
    "members.view_all": true,
    "finance.view_summary": true,
    "finance.view_detail": true,
    "finance.audit_flag": true,
    "reports.view_summary": true,
    "reports.view_all": true,
    "events.view_public": true,
    "events.create_own": true,
    "events.edit_own": true,
    "events.delete_own": true,
    "announcements.view_public": true,
    "announcements.create_own": true,
    "announcements.edit_own": true,
    "announcements.delete_own": true,
  }),
  committee_member: checklist({
    "members.view_all": true,
    "finance.view_summary": true,
    "reports.view_summary": true,
    "events.view_public": true,
    "events.create_own": true,
    "events.edit_own": true,
    "events.delete_own": true,
    "announcements.view_public": true,
    "announcements.create_own": true,
    "announcements.edit_own": true,
    "announcements.delete_own": true,
  }),
  member: checklist({
    "members.view_self": true,
    "members.edit_self": true,
    "finance.view_self": true,
    "reports.view_summary": true,
    "events.view_public": true,
    "events.create_own": true,
    "events.edit_own": true,
    "events.delete_own": true,
    "announcements.view_public": true,
    "announcements.create_own": true,
    "announcements.edit_own": true,
    "announcements.delete_own": true,
  }),
  applicant: checklist({
    "members.apply": true,
    "members.view_self": true,
    "events.view_public": true,
    "announcements.view_public": true,
  }),
};

const ADMIN_CHECKLIST = checklist({
  "system.manage": true,
  "users.manage": true,
  "users.view": true,
});

function resolveOrgAccessRole(profile: AccessProfile): OrgAccessRole {
  const position = normalizeOrgPosition(profile.orgPosition || "member");
  const status = normalizeMemberStatus(profile.memberStatus || "active");
  if (position === "applicant" || status === "applicant") return "applicant";
  return position;
}

function getChecklist(profile: AccessProfile): PermissionChecklist {
  if (profile.systemRole === "admin") return ADMIN_CHECKLIST;
  return {
    ...ORG_ROLE_CHECKLIST[resolveOrgAccessRole(profile)],
    // Non-admin users can view member directory; write actions remain role-restricted.
    "members.view_all": true,
  };
}

function canByOwnOrAll(
  checklistData: PermissionChecklist,
  ownPermission: AccessPermission,
  allPermission: AccessPermission,
  options?: AccessOptions
): boolean {
  if (checklistData[allPermission]) return true;
  if (checklistData[ownPermission] && options?.isOwnContent) return true;
  return false;
}

export function isCommitteePosition(position?: unknown): boolean {
  const p = normalizeOrgPosition(position || "member");
  return p !== "member" && p !== "applicant";
}

export function canAccess(profile: AccessProfile, permission: AccessPermission, options?: AccessOptions): boolean {
  const checklistData = getChecklist(profile);

  // Canonical permissions direct check
  if (
    permission === "system.manage" ||
    permission === "users.manage" ||
    permission === "users.view" ||
    permission === "members.view_all" ||
    permission === "members.view_self" ||
    permission === "members.create" ||
    permission === "members.edit" ||
    permission === "members.delete" ||
    permission === "members.edit_self" ||
    permission === "members.propose_changes" ||
    permission === "members.approve_changes" ||
    permission === "members.apply" ||
    permission === "finance.view_summary" ||
    permission === "finance.view_detail" ||
    permission === "finance.view_self" ||
    permission === "finance.create" ||
    permission === "finance.edit" ||
    permission === "finance.delete" ||
    permission === "finance.audit_flag" ||
    permission === "reports.view_summary" ||
    permission === "reports.view_all" ||
    permission === "events.view_public" ||
    permission === "events.create_own" ||
    permission === "events.edit_own" ||
    permission === "events.delete_own" ||
    permission === "events.create_all" ||
    permission === "events.edit_all" ||
    permission === "events.delete_all" ||
    permission === "announcements.view_public" ||
    permission === "announcements.create_own" ||
    permission === "announcements.edit_own" ||
    permission === "announcements.delete_own" ||
    permission === "announcements.create_all" ||
    permission === "announcements.edit_all" ||
    permission === "announcements.delete_all"
  ) {
    return checklistData[permission];
  }

  // Legacy aliases (backward compatibility for current screens)
  switch (permission) {
    case "members.manage":
      return checklistData["members.create"] || checklistData["members.edit"] || checklistData["members.delete"];
    case "finance.view_all":
      return checklistData["finance.view_summary"] || checklistData["finance.view_detail"];
    case "finance.manage":
      return checklistData["finance.create"] || checklistData["finance.edit"] || checklistData["finance.delete"];
    case "events.manage":
      return checklistData["events.create_all"] || checklistData["events.edit_all"] || checklistData["events.delete_all"];
    case "announcements.manage":
      return (
        checklistData["announcements.create_all"] ||
        checklistData["announcements.edit_all"] ||
        checklistData["announcements.delete_all"]
      );
    default:
      return false;
  }
}

export function canAccessMemberRecord(profile: AccessProfile, targetMemberId: string): boolean {
  const checklistData = getChecklist(profile);
  if (checklistData["members.view_all"]) return true;
  return Boolean(checklistData["members.view_self"] && profile.memberId && profile.memberId === targetMemberId);
}

export function canManageOwnEvent(profile: AccessProfile): boolean {
  const checklistData = getChecklist(profile);
  return checklistData["events.create_own"] || checklistData["events.edit_own"] || checklistData["events.delete_own"];
}

export function canManageOwnAnnouncement(profile: AccessProfile): boolean {
  const checklistData = getChecklist(profile);
  return (
    checklistData["announcements.create_own"] ||
    checklistData["announcements.edit_own"] ||
    checklistData["announcements.delete_own"]
  );
}

export function canManageEvent(profile: AccessProfile, options?: AccessOptions): boolean {
  const checklistData = getChecklist(profile);
  return canByOwnOrAll(checklistData, "events.edit_own", "events.edit_all", options);
}

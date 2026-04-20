import { AppState, Platform, type AppStateStatus } from "react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { canAccess, canAccessMemberRecord as canAccessMember, type AccessOptions, type AccessPermission, type AccessProfile } from "./access-control";
import { useData } from "./DataContext";
import { splitPhoneNumbers, toEnglishDigits } from "./member-utils";
import { MEMBER_STATUS_LABELS, normalizeMemberStatus, normalizeOrgPosition, type Member, type UserAccount } from "./types";
import { buildMemberUsername, changeUserPassword, getAccountSettings, resetUserPasswordByIdentifier, setSystemAdminPassword, verifyPassword, verifySystemAdminPassword } from "./storage-service";
import { getServerApiUrlForOrg, prewarmOrgScopedRemoteConfig, setActiveOrgId } from "./remote-config";
import orgStorage, { setOrgStorageContext, systemStorage } from "./org-storage";
import { ensureOrgLicenseActive } from "./org-registry";

const AUTH_SESSION_KEY = "@orghub_auth_session";
const AUTH_BACKGROUND_MARK_KEY = "@orghub_auth_background_marked";
const AUTH_WEB_FORCE_LOGOUT_KEY = "@orghub_auth_web_force_logout";
const RESTORE_SESSION_ON_LAUNCH = true;
const LOGIN_GUARD_KEY = "@orghub_login_guard";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 3 * 60 * 60 * 1000;
const AUTO_LOGOUT_MS = 5 * 60 * 1000; // 5 minutes inactivity
const ADMIN_SESSION_ID = "admin";

type PersistedSession = {
  userId: string;
  signedInAt: string;
  memberId?: string;
};

type LoginGuardState = {
  failedAttempts: number;
  lockedUntil: number;
};

type LoginResult = {
  ok: boolean;
  reason:
    | "success"
    | "locked"
    | "invalid_username"
    | "invalid_password"
    | "inactive_member"
    | "license_denied"
    | "admin_login_only";
  remainingMs?: number;
  failedAttempts?: number;
  memberName?: string;
  memberStatusLabel?: string;
  licenseStatus?: string;
  licenseExpiry?: string;
  licenseReason?: string;
};

type UsernameCheckResult = {
  exists: boolean;
  canLogin: boolean;
  memberName?: string;
  memberStatusLabel?: string;
};

interface AuthContextValue {
  loading: boolean;
  isAuthenticated: boolean;
  currentUser?: UserAccount;
  currentMember?: Member;
  profile?: AccessProfile;
  availableUsers: UserAccount[];
  signIn: (userId: string, memberId?: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  checkUsername: (username: string) => Promise<boolean>;
  checkUsernameStatus: (username: string) => Promise<UsernameCheckResult>;
  attemptLogin: (username: string, password: string) => Promise<LoginResult>;
  attemptAdminLogin: (username: string, password: string) => Promise<LoginResult>;
  getLoginLockInfo: () => Promise<{ locked: boolean; remainingMs: number; failedAttempts: number }>;
  login: (username: string, password: string) => Promise<boolean>;
  verifyCurrentPassword: (password: string) => Promise<boolean>;
  changePassword: (currentPassword: string, nextPassword: string) => Promise<boolean>;
  resetPassword: (identifier: string, nextPassword?: string) => Promise<{
    ok: boolean;
    userId?: string;
    reason?: string;
    displayName?: string;
    memberId?: string;
    phone?: string;
    email?: string;
    password?: string;
  }>;
  can: (permission: AccessPermission, options?: AccessOptions) => boolean;
  canAccessMemberRecord: (targetMemberId: string) => boolean;
  recordActivity: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function readLoginGuardState(storage = orgStorage): Promise<LoginGuardState> {
  try {
    const raw = await storage.getItem(LOGIN_GUARD_KEY);
    if (!raw) return { failedAttempts: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<LoginGuardState>;
    return {
      failedAttempts: Number.isFinite(parsed?.failedAttempts) ? Number(parsed?.failedAttempts) : 0,
      lockedUntil: Number.isFinite(parsed?.lockedUntil) ? Number(parsed?.lockedUntil) : 0,
    };
  } catch {
    return { failedAttempts: 0, lockedUntil: 0 };
  }
}

async function writeLoginGuardState(state: LoginGuardState, storage = orgStorage): Promise<void> {
  await storage.setItem(LOGIN_GUARD_KEY, JSON.stringify(state));
}

async function clearLoginGuardState(storage = orgStorage): Promise<void> {
  await storage.removeItem(LOGIN_GUARD_KEY);
}

function normalizeText(input: string): string {
  return toEnglishDigits(String(input || "")).trim();
}

function normalizeIdentifier(input: string): string {
  return normalizeText(input).toLowerCase();
}

function normalizePhoneForLookup(rawValue: string): string {
  return normalizeText(rawValue).replace(/[^\d]/g, "");
}

const NAME_PREFIXES = [
  "ဆရာတော်",
  "ဦးဇင်း",
  "ကိုရင်",
  "ဦး",
  "ဒေါ်",
  "ကို",
  "မောင်",
  "မိ",
  "မ",
  "သီလရှင်",
  "ဆရာလေး",
  "u ",
  "daw ",
  "ko ",
  "mg ",
  "ma ",
];

function normalizeNameForLookup(rawValue: string): string {
  let value = normalizeIdentifier(rawValue).replace(/\s+/g, " ").trim();
  if (!value) return "";

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of NAME_PREFIXES) {
      if (value.startsWith(prefix)) {
        value = value.slice(prefix.length).trim();
        changed = true;
      }
    }
  }
  return value.replace(/\s+/g, "");
}

function resolveUserByIdentifier(
  users: UserAccount[],
  members: Member[],
  identifier: string,
  options?: { includeInactive?: boolean }
): UserAccount | undefined {
  const includeInactive = options?.includeInactive === true;
  const needle = normalizeIdentifier(identifier);
  if (!needle) return undefined;
  const needleName = normalizeNameForLookup(identifier);

  const exactMatch = users.find((user) => {
    if (!includeInactive && !user.isActive) return false;
    if (user.systemRole === "admin") {
      return needle === "admin";
    }
    if (normalizeIdentifier(user.id) === needle) {
      return true;
    }

    const member = members.find((item) => item.id === user.memberId);
    if (!member) return false;

    const memberIdCandidate = normalizeIdentifier(member.id);
    const emailCandidate = normalizeIdentifier(member.email || "");
    const aliasCandidate = normalizeIdentifier(buildMemberUsername(member.id));
    const { primaryPhone, secondaryPhone } = splitPhoneNumbers(member.phone, (member as any).secondaryPhone);
    const phoneCandidates = [primaryPhone, secondaryPhone]
      .filter(Boolean)
      .map((phone) => normalizePhoneForLookup(phone));
    const needlePhone = normalizePhoneForLookup(needle);

    return (
      needle === memberIdCandidate ||
      (emailCandidate && needle === emailCandidate) ||
      (aliasCandidate && needle === aliasCandidate) ||
      (!!needlePhone && phoneCandidates.includes(needlePhone))
    );
  });
  if (exactMatch) return exactMatch;

  return users.find((user) => {
    if (!includeInactive && !user.isActive) return false;
    if (user.systemRole === "admin") {
      return needle === "admin";
    }
    const member = members.find((item) => item.id === user.memberId);
    if (!member) return false;
    const memberNameCandidate = normalizeNameForLookup(member.name || "");
    const userDisplayNameCandidate = normalizeNameForLookup(user.displayName || "");
    return (
      !!needleName &&
      (needleName === memberNameCandidate ||
        needleName === userDisplayNameCandidate ||
        needleName === normalizeNameForLookup(normalizeIdentifier(member.id)))
    );
  });
}

function evaluateUserLoginState(
  user: UserAccount | undefined,
  member: Member | undefined,
  rawIdentifier?: string
): UsernameCheckResult {
  if (!user) return { exists: false, canLogin: false };
  if (user.systemRole === "admin") {
    return { exists: true, canLogin: Boolean(user.isActive), memberName: "Admin" };
  }

  const normalizedStatus = normalizeMemberStatus(member?.status || user.orgPosition || "suspended");
  const statusLabel = MEMBER_STATUS_LABELS[normalizedStatus];
  const memberName = String(member?.name || user.displayName || rawIdentifier || "ဤအသင်းဝင်").trim();
  const canLogin = Boolean(user.isActive) && normalizedStatus === "active";
  return {
    exists: true,
    canLogin,
    memberName,
    memberStatusLabel: statusLabel,
  };
}

function parsePersistedSession(raw: string | null): PersistedSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    if (!parsed || typeof parsed.userId !== "string" || !parsed.userId.trim()) {
      return null;
    }
    return {
      userId: parsed.userId.trim(),
      memberId: typeof parsed.memberId === "string" && parsed.memberId.trim() ? parsed.memberId.trim() : undefined,
      signedInAt: typeof parsed.signedInAt === "string" ? parsed.signedInAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { users, members, loading: dataLoading } = useData();
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionMemberId, setSessionMemberId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [lastActivityAt, setLastActivityAt] = useState<number>(Date.now());

  useEffect(() => {
    let active = true;
    (async () => {
      if (!RESTORE_SESSION_ON_LAUNCH) {
        await orgStorage.removeItem(AUTH_SESSION_KEY);
        if (!active) return;
        setSessionUserId(null);
        setRestoring(false);
        return;
      }
      const shouldInvalidateOnBackground = Platform.OS !== "web";
      const backgroundMarked = shouldInvalidateOnBackground
        ? await orgStorage.getItem(AUTH_BACKGROUND_MARK_KEY)
        : null;
      if (shouldInvalidateOnBackground && backgroundMarked === "1") {
        await orgStorage.removeItem(AUTH_SESSION_KEY);
        await orgStorage.removeItem(AUTH_BACKGROUND_MARK_KEY);
        if (!active) return;
        setSessionUserId(null);
        setRestoring(false);
        return;
      }
      if (Platform.OS === "web") {
        try {
          const navEntries = performance.getEntriesByType?.("navigation") as any;
          const navType = Array.isArray(navEntries) && navEntries.length ? navEntries[0]?.type : "";
          const legacyType = (performance as any)?.navigation?.type;
          const isReload = navType === "reload" || legacyType === 1;
          if (sessionStorage.getItem(AUTH_WEB_FORCE_LOGOUT_KEY) === "1" && !isReload) {
            sessionStorage.removeItem(AUTH_WEB_FORCE_LOGOUT_KEY);
            await orgStorage.removeItem(AUTH_SESSION_KEY);
            if (!active) return;
            setSessionUserId(null);
            setRestoring(false);
            return;
          }
          if (isReload) {
            sessionStorage.removeItem(AUTH_WEB_FORCE_LOGOUT_KEY);
          }
        } catch {}
      }

      let restored: PersistedSession | null = null;
      try {
        const systemRaw = await systemStorage.getItem(AUTH_SESSION_KEY);
        restored = parsePersistedSession(systemRaw);
      } catch {}

      try {
        const settings = await getAccountSettings();
        setOrgStorageContext({ orgId: settings?.orgId, orgEmail: settings?.orgEmail });
        setActiveOrgId(settings?.orgId || null);
        prewarmOrgScopedRemoteConfig(settings?.orgId || null);
        getServerApiUrlForOrg(settings?.orgId || null);
      } catch {
        // Ignore org context/prewarm failures; allow session restore.
      }

      if (!restored) {
        const raw = await orgStorage.getItem(AUTH_SESSION_KEY);
        restored = parsePersistedSession(raw);
      }
      if (!active) return;
      setSessionUserId(restored?.userId ?? null);
      setSessionMemberId(restored?.memberId ?? null);
      setRestoring(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handler = () => {
      try {
        sessionStorage.setItem(AUTH_WEB_FORCE_LOGOUT_KEY, "1");
      } catch {}
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const clearSession = useCallback(async () => {
    setSessionUserId(null);
    setSessionMemberId(null);
    await orgStorage.multiRemove([AUTH_SESSION_KEY, AUTH_BACKGROUND_MARK_KEY]);
    await systemStorage.multiRemove([AUTH_SESSION_KEY, AUTH_BACKGROUND_MARK_KEY]);
  }, []);

  useEffect(() => {
    if (restoring || dataLoading || !sessionUserId) return;
    if (sessionUserId === ADMIN_SESSION_ID) return;
    const user = sessionMemberId
      ? users.find((item) => item.id === sessionUserId && item.memberId === sessionMemberId)
      : users.find((item) => item.id === sessionUserId);
    if (!user || !user.isActive) {
      void clearSession();
    }
  }, [restoring, dataLoading, sessionUserId, sessionMemberId, users, clearSession]);

  const currentUser = useMemo(() => {
    if (!sessionUserId) return undefined;
    if (sessionUserId === ADMIN_SESSION_ID) {
      return {
        id: ADMIN_SESSION_ID,
        displayName: "System Admin",
        systemRole: "admin",
        isActive: true,
        createdAt: new Date().toISOString(),
      } as UserAccount;
    }
    if (sessionMemberId) {
      const exact = users.find(
        (item) => item.id === sessionUserId && item.memberId === sessionMemberId && item.isActive
      );
      if (exact) return exact;
    }
    const candidates = users.filter((item) => item.id === sessionUserId && item.isActive);
    if (candidates.length <= 1) return candidates[0];
    return candidates.reduce((latest, item) => {
      const latestTime = Date.parse(latest.createdAt || "");
      const itemTime = Date.parse(item.createdAt || "");
      if (!Number.isNaN(itemTime) && (Number.isNaN(latestTime) || itemTime > latestTime)) {
        return item;
      }
      return latest;
    }, candidates[0]);
  }, [sessionUserId, sessionMemberId, users]);

  const currentMember = useMemo(() => {
    if (!currentUser?.memberId) return undefined;
    return members.find((member) => member.id === currentUser.memberId);
  }, [currentUser, members]);

  const profile = useMemo<AccessProfile | undefined>(() => {
    if (!currentUser) return undefined;
    if (currentUser.systemRole === "admin") {
      return {
        systemRole: "admin",
        memberId: currentUser.memberId,
      };
    }

    const rawPosition = currentUser.orgPosition || currentMember?.orgPosition || currentMember?.status || "member";
    const rawStatus = currentMember?.status || (rawPosition === "applicant" ? "applicant" : "active");

    return {
      systemRole: "org_user",
      orgPosition: normalizeOrgPosition(rawPosition),
      memberStatus: normalizeMemberStatus(rawStatus),
      memberId: currentUser.memberId || currentMember?.id,
    };
  }, [currentUser, currentMember]);

  const availableUsers = useMemo(() => {
    const activeUsers = users.filter((item) => item.isActive);
    return activeUsers
      .slice()
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [users]);

  const signIn = useCallback(
    async (userId: string, memberId?: string) => {
      if (userId === ADMIN_SESSION_ID) {
        setSessionUserId(ADMIN_SESSION_ID);
        setSessionMemberId(null);
        const nextSession: PersistedSession = {
          userId: ADMIN_SESSION_ID,
          signedInAt: new Date().toISOString(),
        };
        await systemStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(nextSession));
        await clearLoginGuardState(systemStorage);
        setLastActivityAt(Date.now());
        return true;
      }

      const user = memberId
        ? users.find((item) => item.id === userId && item.memberId === memberId && item.isActive)
        : users.find((item) => item.id === userId && item.isActive);
      if (!user) return false;
      setSessionUserId(user.id);
      setSessionMemberId(user.memberId || memberId || null);
      const nextSession: PersistedSession = {
        userId: user.id,
        memberId: user.memberId || memberId,
        signedInAt: new Date().toISOString(),
      };
      await orgStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(nextSession));
      await clearLoginGuardState();
      setLastActivityAt(Date.now());
      try {
        const settings = await getAccountSettings();
        const orgId = settings?.orgId || null;
        setOrgStorageContext({ orgId, orgEmail: settings?.orgEmail || null });
        setActiveOrgId(orgId);
        prewarmOrgScopedRemoteConfig(orgId);
        getServerApiUrlForOrg(orgId);
      } catch {
        // Ignore org prewarm failures; session remains valid.
      }
      return true;
    },
    [users]
  );

  const signOut = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const recordActivity = useCallback(() => {
    setLastActivityAt(Date.now());
  }, []);

  const checkUsernameStatus = useCallback(async (username: string): Promise<UsernameCheckResult> => {
    if (normalizeIdentifier(username) === "admin") {
      return { exists: true, canLogin: true, memberName: "System Admin" };
    }
    const user = resolveUserByIdentifier(users, members, username, { includeInactive: true });
    const member = user?.memberId ? members.find((item) => item.id === user.memberId) : undefined;
    return evaluateUserLoginState(user, member, username);
  }, [users, members]);

  const checkUsername = useCallback(async (username: string) => {
    const info = await checkUsernameStatus(username);
    return info.canLogin;
  }, [checkUsernameStatus]);

  const getLoginLockInfo = useCallback(async () => {
    const state = await readLoginGuardState();
    const now = Date.now();
    const remainingMs = Math.max(0, state.lockedUntil - now);
    if (remainingMs === 0 && (state.failedAttempts > 0 || state.lockedUntil > 0)) {
      await clearLoginGuardState();
      return { locked: false, remainingMs: 0, failedAttempts: 0 };
    }
    return { locked: remainingMs > 0, remainingMs, failedAttempts: state.failedAttempts };
  }, []);

  const attemptLogin = useCallback(async (username: string, passwordPlaintext: string): Promise<LoginResult> => {
    const normalizedUsername = normalizeIdentifier(username);
    if (normalizedUsername === "admin") {
      return { ok: false, reason: "admin_login_only" };
    }
    const guard = await readLoginGuardState();
    const now = Date.now();
    const lockRemaining = Math.max(0, guard.lockedUntil - now);
    if (lockRemaining > 0) {
      return {
        ok: false,
        reason: "locked",
        remainingMs: lockRemaining,
        failedAttempts: guard.failedAttempts,
      };
    }

    try {
      const settings = await getAccountSettings();
      const orgId = String(settings?.orgId || "").trim();
      const license = await ensureOrgLicenseActive({ orgId, forceOnlineCheck: true });
      if (!license.allowed) {
        return {
          ok: false,
          reason: "license_denied",
          licenseStatus: license.status,
          licenseExpiry: license.expiryDate,
          licenseReason: license.reason,
        };
      }
    } catch {
      return {
        ok: false,
        reason: "license_denied",
        licenseReason: "license_check_failed",
      };
    }

    const user = resolveUserByIdentifier(users, members, username, { includeInactive: true });
    const member = user?.memberId ? members.find((item) => item.id === user.memberId) : undefined;
    const loginState = evaluateUserLoginState(user, member, username);
    if (!loginState.exists) {
      const nextFailed = guard.failedAttempts + 1;
      if (nextFailed >= MAX_FAILED_ATTEMPTS) {
        await writeLoginGuardState({
          failedAttempts: nextFailed,
          lockedUntil: now + LOCKOUT_DURATION_MS,
        });
        return {
          ok: false,
          reason: "locked",
          remainingMs: LOCKOUT_DURATION_MS,
          failedAttempts: nextFailed,
        };
      }
      await writeLoginGuardState({ failedAttempts: nextFailed, lockedUntil: 0 });
      return {
        ok: false,
        reason: "invalid_username",
        failedAttempts: nextFailed,
      };
    }

    if (!loginState.canLogin) {
      return {
        ok: false,
        reason: "inactive_member",
        memberName: loginState.memberName,
        memberStatusLabel: loginState.memberStatusLabel,
      };
    }
    if (!user) {
      return {
        ok: false,
        reason: "invalid_username",
      };
    }
    const isValid = await verifyPassword(user.id, passwordPlaintext);
    if (isValid) {
      const success = await signIn(user.id, user.memberId);
      if (!success) return { ok: false, reason: "invalid_username" };
      await clearLoginGuardState();
      return { ok: true, reason: "success" };
    }
    const nextFailed = guard.failedAttempts + 1;
    if (nextFailed >= MAX_FAILED_ATTEMPTS) {
      await writeLoginGuardState({
        failedAttempts: nextFailed,
        lockedUntil: now + LOCKOUT_DURATION_MS,
      });
      return {
        ok: false,
        reason: "locked",
        remainingMs: LOCKOUT_DURATION_MS,
        failedAttempts: nextFailed,
      };
    }
    await writeLoginGuardState({ failedAttempts: nextFailed, lockedUntil: 0 });
    return {
      ok: false,
      reason: "invalid_password",
      failedAttempts: nextFailed,
    };
  }, [users, members, signIn]);

  const attemptAdminLogin = useCallback(async (username: string, passwordPlaintext: string): Promise<LoginResult> => {
    const normalizedUsername = normalizeIdentifier(username);
    if (normalizedUsername !== "admin") {
      return { ok: false, reason: "invalid_username" };
    }
    const guard = await readLoginGuardState(systemStorage);
    const now = Date.now();
    const lockRemaining = Math.max(0, guard.lockedUntil - now);
    if (lockRemaining > 0) {
      await clearLoginGuardState(systemStorage);
    }

    const adminOk = await verifySystemAdminPassword(passwordPlaintext);
    if (!adminOk) {
      const nextFailed = guard.failedAttempts + 1;
      await writeLoginGuardState(
        { failedAttempts: nextFailed, lockedUntil: nextFailed >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_DURATION_MS : 0 },
        systemStorage
      );
      return {
        ok: false,
        reason: "invalid_password",
        failedAttempts: nextFailed,
      };
    }

    const success = await signIn(ADMIN_SESSION_ID);
    if (!success) return { ok: false, reason: "invalid_username" };
    await clearLoginGuardState(systemStorage);
    return { ok: true, reason: "success" };
  }, [signIn]);

  const login = useCallback(async (username: string, passwordPlaintext: string) => {
    const normalizedUsername = normalizeIdentifier(username);
    const result =
      normalizedUsername === "admin"
        ? await attemptAdminLogin(username, passwordPlaintext)
        : await attemptLogin(username, passwordPlaintext);
    return result.ok;
  }, [attemptAdminLogin, attemptLogin]);

  const changePassword = useCallback(
    async (currentPassword: string, nextPassword: string) => {
      if (!currentUser) return false;
      let changed = false;
      if (currentUser.systemRole === "admin") {
        const ok = await verifySystemAdminPassword(currentPassword);
        if (!ok) return false;
        await setSystemAdminPassword(nextPassword);
        changed = true;
      } else {
        changed = await changeUserPassword(currentUser.id, currentPassword, nextPassword);
      }
      if (!changed) return false;
      await signOut();
      return true;
    },
    [currentUser, signOut]
  );

  const verifyCurrentPassword = useCallback(
    async (password: string) => {
      if (!currentUser) return false;
      if (currentUser.systemRole === "admin") {
        return verifySystemAdminPassword(password);
      }
      return verifyPassword(currentUser.id, password);
    },
    [currentUser]
  );

  const resetPassword = useCallback(
    async (identifier: string, nextPassword?: string) => {
      if (!currentUser) return { ok: false, reason: "forbidden" };
      const position = normalizeOrgPosition(currentUser.orgPosition || "");
      if (currentUser.systemRole === "admin") return { ok: false, reason: "forbidden" };
      if (position !== "chairperson") return { ok: false, reason: "forbidden" };
      return resetUserPasswordByIdentifier(identifier, nextPassword);
    },
    [currentUser]
  );

  const can = useCallback(
    (permission: AccessPermission, options?: AccessOptions) => {
      if (!profile) return false;
      return canAccess(profile, permission, options);
    },
    [profile]
  );

  const canAccessMemberRecord = useCallback(
    (targetMemberId: string) => {
      if (!profile) return false;
      return canAccessMember(profile, targetMemberId);
    },
    [profile]
  );

  useEffect(() => {
    if (!currentUser) return;
    const timer = setInterval(() => {
      const idleMs = Date.now() - lastActivityAt;
      if (idleMs >= AUTO_LOGOUT_MS) {
        void signOut();
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [currentUser, lastActivityAt, signOut]);

  useEffect(() => {
    if (!currentUser || Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        void orgStorage.removeItem(AUTH_BACKGROUND_MARK_KEY);
        setLastActivityAt(Date.now());
        return;
      }
      if (state === "background" || state === "inactive") {
        void orgStorage.setItem(AUTH_BACKGROUND_MARK_KEY, "1");
      }
    });
    return () => sub.remove();
  }, [currentUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading: dataLoading || restoring,
      isAuthenticated: Boolean(currentUser),
      currentUser,
      currentMember,
      profile,
      availableUsers,
      signIn,
      signOut,
      checkUsername,
      checkUsernameStatus,
      attemptLogin,
      attemptAdminLogin,
      getLoginLockInfo,
      login,
      verifyCurrentPassword,
      changePassword,
      resetPassword,
      can,
      canAccessMemberRecord,
      recordActivity,
    }),
    [dataLoading, restoring, currentUser, currentMember, profile, availableUsers, signIn, signOut, checkUsername, checkUsernameStatus, attemptLogin, attemptAdminLogin, getLoginLockInfo, login, verifyCurrentPassword, changePassword, resetPassword, can, canAccessMemberRecord, recordActivity]
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

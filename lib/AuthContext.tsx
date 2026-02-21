import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, type AppStateStatus } from "react-native";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { canAccess, canAccessMemberRecord as canAccessMember, type AccessOptions, type AccessPermission, type AccessProfile } from "./access-control";
import { useData } from "./DataContext";
import { splitPhoneNumbers, toEnglishDigits } from "./member-utils";
import { MEMBER_STATUS_LABELS, normalizeMemberStatus, normalizeOrgPosition, type Member, type UserAccount } from "./types";
import { buildMemberUsername, changeUserPassword, resetUserPasswordByIdentifier, verifyPassword } from "./storage";

const AUTH_SESSION_KEY = "@orghub_auth_session";
const RESTORE_SESSION_ON_LAUNCH = true;
const LOGIN_GUARD_KEY = "@orghub_login_guard";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 3 * 60 * 60 * 1000;
const AUTO_LOGOUT_MS = 10 * 60 * 1000; // 10 minutes inactivity

type PersistedSession = {
  userId: string;
  signedInAt: string;
};

type LoginGuardState = {
  failedAttempts: number;
  lockedUntil: number;
};

type LoginResult = {
  ok: boolean;
  reason: "success" | "locked" | "invalid_username" | "invalid_password" | "inactive_member";
  remainingMs?: number;
  failedAttempts?: number;
  memberName?: string;
  memberStatusLabel?: string;
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
  signIn: (userId: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  checkUsername: (username: string) => Promise<boolean>;
  checkUsernameStatus: (username: string) => Promise<UsernameCheckResult>;
  attemptLogin: (username: string, password: string) => Promise<LoginResult>;
  getLoginLockInfo: () => Promise<{ locked: boolean; remainingMs: number; failedAttempts: number }>;
  login: (username: string, password: string) => Promise<boolean>;
  verifyCurrentPassword: (password: string) => Promise<boolean>;
  changePassword: (currentPassword: string, nextPassword: string) => Promise<boolean>;
  resetPassword: (identifier: string) => Promise<boolean>;
  can: (permission: AccessPermission, options?: AccessOptions) => boolean;
  canAccessMemberRecord: (targetMemberId: string) => boolean;
  recordActivity: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function readLoginGuardState(): Promise<LoginGuardState> {
  try {
    const raw = await AsyncStorage.getItem(LOGIN_GUARD_KEY);
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

async function writeLoginGuardState(state: LoginGuardState): Promise<void> {
  await AsyncStorage.setItem(LOGIN_GUARD_KEY, JSON.stringify(state));
}

async function clearLoginGuardState(): Promise<void> {
  await AsyncStorage.removeItem(LOGIN_GUARD_KEY);
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

  return users.find((user) => {
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
    const memberNameCandidate = normalizeNameForLookup(member.name || "");
    const userDisplayNameCandidate = normalizeNameForLookup(user.displayName || "");
    const { primaryPhone, secondaryPhone } = splitPhoneNumbers(member.phone, (member as any).secondaryPhone);
    const phoneCandidates = [primaryPhone, secondaryPhone]
      .filter(Boolean)
      .map((phone) => normalizePhoneForLookup(phone));
    const needlePhone = normalizePhoneForLookup(needle);

    return (
      needle === memberIdCandidate ||
      (emailCandidate && needle === emailCandidate) ||
      (aliasCandidate && needle === aliasCandidate) ||
      (!!needleName && (
        needleName === memberNameCandidate ||
        needleName === userDisplayNameCandidate ||
        needleName === normalizeNameForLookup(memberIdCandidate)
      )) ||
      (!!needlePhone && phoneCandidates.includes(needlePhone))
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
      signedInAt: typeof parsed.signedInAt === "string" ? parsed.signedInAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { users, members, loading: dataLoading } = useData();
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [lastActivityAt, setLastActivityAt] = useState<number>(Date.now());

  useEffect(() => {
    let active = true;
    (async () => {
      if (!RESTORE_SESSION_ON_LAUNCH) {
        await AsyncStorage.removeItem(AUTH_SESSION_KEY);
        if (!active) return;
        setSessionUserId(null);
        setRestoring(false);
        return;
      }
      const raw = await AsyncStorage.getItem(AUTH_SESSION_KEY);
      const restored = parsePersistedSession(raw);
      if (!active) return;
      setSessionUserId(restored?.userId ?? null);
      setRestoring(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const clearSession = useCallback(async () => {
    setSessionUserId(null);
    await AsyncStorage.removeItem(AUTH_SESSION_KEY);
  }, []);

  useEffect(() => {
    if (restoring || dataLoading || !sessionUserId) return;
    const user = users.find((item) => item.id === sessionUserId);
    if (!user || !user.isActive) {
      void clearSession();
    }
  }, [restoring, dataLoading, sessionUserId, users, clearSession]);

  const currentUser = useMemo(() => {
    if (!sessionUserId) return undefined;
    return users.find((item) => item.id === sessionUserId && item.isActive);
  }, [sessionUserId, users]);

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
    return users
      .filter((item) => item.isActive)
      .slice()
      .sort((left, right) => {
        const leftPriority = left.systemRole === "admin" ? 0 : 1;
        const rightPriority = right.systemRole === "admin" ? 0 : 1;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return left.displayName.localeCompare(right.displayName);
      });
  }, [users]);

  const signIn = useCallback(
    async (userId: string) => {
      const user = users.find((item) => item.id === userId && item.isActive);
      if (!user) return false;
      setSessionUserId(user.id);
      const nextSession: PersistedSession = {
        userId: user.id,
        signedInAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(nextSession));
      await clearLoginGuardState();
      setLastActivityAt(Date.now());
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

    const isValid = await verifyPassword(user.id, passwordPlaintext);
    if (!isValid) {
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
    }

    const success = await signIn(user.id);
    if (!success) return { ok: false, reason: "invalid_username" };
    return { ok: true, reason: "success" };
  }, [users, members, signIn]);

  const login = useCallback(async (username: string, passwordPlaintext: string) => {
    const result = await attemptLogin(username, passwordPlaintext);
    return result.ok;
  }, [attemptLogin]);

  const changePassword = useCallback(
    async (currentPassword: string, nextPassword: string) => {
      if (!currentUser) return false;
      return changeUserPassword(currentUser.id, currentPassword, nextPassword);
    },
    [currentUser]
  );

  const verifyCurrentPassword = useCallback(
    async (password: string) => {
      if (!currentUser) return false;
      return verifyPassword(currentUser.id, password);
    },
    [currentUser]
  );

  const resetPassword = useCallback(
    async (identifier: string) => {
      if (!currentUser || currentUser.systemRole !== "admin") return false;
      const result = await resetUserPasswordByIdentifier(identifier);
      return result.ok;
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
    if (!currentUser) return;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        setLastActivityAt(Date.now());
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
      getLoginLockInfo,
      login,
      verifyCurrentPassword,
      changePassword,
      resetPassword,
      can,
      canAccessMemberRecord,
      recordActivity,
    }),
    [dataLoading, restoring, currentUser, currentMember, profile, availableUsers, signIn, signOut, checkUsername, checkUsernameStatus, attemptLogin, getLoginLockInfo, login, verifyCurrentPassword, changePassword, resetPassword, can, canAccessMemberRecord, recordActivity]
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

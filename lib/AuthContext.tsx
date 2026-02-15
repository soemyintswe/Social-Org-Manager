import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { canAccess, canAccessMemberRecord as canAccessMember, type AccessPermission, type AccessProfile } from "./access-control";
import { useData } from "./DataContext";
import { normalizeMemberStatus, normalizeOrgPosition, type Member, type UserAccount } from "./types";

const AUTH_SESSION_KEY = "@orghub_auth_session";

type PersistedSession = {
  userId: string;
  signedInAt: string;
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
  can: (permission: AccessPermission, options?: { targetMemberId?: string }) => boolean;
  canAccessMemberRecord: (targetMemberId: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

  useEffect(() => {
    let active = true;
    (async () => {
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
    if (restoring || !sessionUserId) return;
    const user = users.find((item) => item.id === sessionUserId);
    if (!user || !user.isActive) {
      void clearSession();
    }
  }, [restoring, sessionUserId, users, clearSession]);

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
      return true;
    },
    [users]
  );

  const signOut = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const can = useCallback(
    (permission: AccessPermission, options?: { targetMemberId?: string }) => {
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
      can,
      canAccessMemberRecord,
    }),
    [dataLoading, restoring, currentUser, currentMember, profile, availableUsers, signIn, signOut, can, canAccessMemberRecord]
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

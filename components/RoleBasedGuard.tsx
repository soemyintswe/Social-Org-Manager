import React from "react";
import { useAuth } from "../lib/AuthContext";
import { AccessPermission } from "../lib/access-control";
import AccessDenied from "./AccessDenied";

interface RoleBasedGuardProps {
  permission: AccessPermission;
  targetMemberId?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showAccessDenied?: boolean;
}

export default function RoleBasedGuard({
  permission,
  targetMemberId,
  children,
  fallback = null,
  showAccessDenied = false,
}: RoleBasedGuardProps) {
  const { can, loading } = useAuth();

  if (loading) {
    return null; // Or a loading spinner
  }

  const hasAccess = can(permission, { targetMemberId });

  if (!hasAccess) {
    if (showAccessDenied) {
      return <AccessDenied />;
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
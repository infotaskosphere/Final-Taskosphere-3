import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import GifLoader from "@/components/ui/GifLoader.jsx";

/**
 * RoleGuard — wrap any page that requires a specific permission.
 *
 * Usage:
 *   <RoleGuard permission="can_view_all_dsc">
 *     <DSCRegister />
 *   </RoleGuard>
 *
 * • Admin always passes.
 * • Non-admin without the flag → redirected to /dashboard.
 * • No permission prop → behaves like <Protected> (login required only).
 */
const RoleGuard = ({ children, permission }) => {
  const { user, loading, hasPermission } = useAuth();

  if (loading) return <GifLoader />;
  if (!user) return <Navigate to="/login" replace />;

  // Admin bypasses all permission checks
  if (user.role === "admin") return <>{children}</>;

  // No specific permission required — any authenticated user can access
  if (!permission) return <>{children}</>;

  const perms = Array.isArray(permission) ? permission : [permission];
  const hasAccess = perms.some((p) => hasPermission(p));

  if (!hasAccess) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

export default RoleGuard;

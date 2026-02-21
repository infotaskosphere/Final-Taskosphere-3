import React from "react";
import { useAuth } from "@/contexts/AuthContext";

const RoleGuard = ({ children, allowedRoles = ["Admin"] }) => {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return null;

  if (!allowedRoles.includes(user.role)) return null;

  return <>{children}</>;
};

export default RoleGuard;

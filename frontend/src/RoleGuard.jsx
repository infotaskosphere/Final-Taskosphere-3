import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

const RoleGuard = ({ children, permission }) => {
  const { user, loading, hasPermission } = useAuth();

  // While auth state is loading
  if (loading) return null;

  // If not logged in → redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If permission is provided and user does not have it → block access
  if (permission && !hasPermission(permission)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // If everything is fine → render page
  return <>{children}</>;
};

export default RoleGuard;

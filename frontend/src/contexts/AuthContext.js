import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  /* ============================================================
      Helpers: Ensure permissions are always a valid object
     ============================================================ */
  const normalizePermissions = (permissions) => {
    if (permissions && typeof permissions === "object" && !Array.isArray(permissions)) {
      return permissions;
    }
    return {};
  };

  const getStoredAuth = () => {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
    return { token, storedUser };
  };

  const persistAuth = (token, userData, rememberMe = false) => {
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem("token", token);
    storage.setItem("user", JSON.stringify(userData));
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  };

  const clearStorage = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    delete api.defaults.headers.common.Authorization;
  };

  /* ============================================================
      Restore Session On Mount
     ============================================================ */
  useEffect(() => {
    const restoreSession = async () => {
      const { token, storedUser } = getStoredAuth();

      if (!token || !storedUser) {
        setLoading(false);
        return;
      }

      try {
        const parsedUser = JSON.parse(storedUser);
        parsedUser.permissions = normalizePermissions(parsedUser.permissions);
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
        setUser(parsedUser);
      } catch (error) {
        console.error("Session restore failed:", error);
        clearStorage();
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  /* ============================================================
      Login Logic
     ============================================================ */
  const login = (responseData, rememberMe = false) => {
    const token = responseData?.access_token;
    const userData = responseData?.user;

    if (!token || !userData) {
      console.error("Invalid login response structure", responseData);
      return false;
    }

    userData.permissions = normalizePermissions(userData.permissions);
    persistAuth(token, userData, rememberMe);
    setUser(userData);
    return true;
  };

  const logout = () => {
    clearStorage();
    setUser(null);
  };

  /* ============================================================
      Refresh User: CRITICAL for solving the "Not able to update" bug
     ============================================================ */
  const refreshUser = useCallback(async () => {
    try {
      const response = await api.get("/auth/me");
      const updatedUser = response.data;

      updatedUser.permissions = normalizePermissions(updatedUser.permissions);

      // We update the existing storage (Local or Session) automatically
      const isLocal = !!localStorage.getItem("token");
      const storage = isLocal ? localStorage : sessionStorage;
      
      storage.setItem("user", JSON.stringify(updatedUser));
      setUser(updatedUser);
      
      console.log("User context synchronized with database.");
    } catch (error) {
      console.error("Failed to refresh user:", error);
    }
  }, []);

  /* ============================================================
      Permission Helpers (Used for Role Guards)
     ============================================================ */
  const hasPermission = (permission) => {
    if (!user) return false;

    // Admin always has full access
    if (user.role?.toLowerCase() === "admin") return true;

    const perms = user.permissions || {};
    
    // Check if key exists and is true
    if (perms[permission] === true) return true;

    // Support for list-based permissions
    if (Array.isArray(perms[permission])) {
      return perms[permission].length > 0;
    }

    return false;
  };

  const canAccessUser = (permissionKey, targetUserId) => {
    if (!user) return false;
    if (user.role?.toLowerCase() === "admin") return true;

    const perms = user.permissions || {};
    const allowedIds = perms[permissionKey];

    return Array.isArray(allowedIds) && allowedIds.includes(targetUserId);
  };

  const value = {
    user,
    loading,
    login,
    logout,
    refreshUser,
    hasPermission,
    canAccessUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

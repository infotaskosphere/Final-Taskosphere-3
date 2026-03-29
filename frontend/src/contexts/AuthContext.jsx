import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../lib/api";

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
  Helpers
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
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  };

  const clearStorage = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    delete api.defaults.headers.common["Authorization"];
  };

  /* ============================================================
  Restore Session
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

        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;

        // ✅ FIXED PATH
        await api.get("/api/auth/me");

        setUser(parsedUser);

      } catch (error) {
        if (error.message === "Network Error") {
          console.warn("Backend unreachable, keeping stored session.");

          const parsedUser = JSON.parse(storedUser);
          parsedUser.permissions = normalizePermissions(parsedUser.permissions);

          setUser(parsedUser);

        } else if (error.response && error.response.status === 401) {
          console.warn("Token expired.");
          clearStorage();
          setUser(null);

        } else {
          console.error("Session restore error:", error);
        }

      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  /* ============================================================
  Login
  ============================================================ */

  const login = (responseData, rememberMe = false) => {
    const token = responseData?.access_token || responseData?.token;
    const userData = responseData?.user || responseData?.data?.user;

    if (!token || !userData) {
      console.error("Invalid login response:", responseData);
      return false;
    }

    userData.permissions = normalizePermissions(userData.permissions);

    persistAuth(token, userData, rememberMe);
    setUser(userData);

    return true;
  };

  /* ============================================================
  Logout
  ============================================================ */

  const logout = async () => {
    const token =
      localStorage.getItem("token") ||
      sessionStorage.getItem("token");

    try {
      if (token) {
        await api.post("/activity/logout");
      }
    } catch (e) {
      console.error("Logout API failed", e);
    } finally {
      clearStorage();
      setUser(null);
    }
  };

  /* ============================================================
  Refresh User
  ============================================================ */

  const refreshUser = useCallback(async () => {
    try {
      // ✅ FIXED PATH
      const response = await api.get("/api/auth/me");
      const updatedUser = response.data;

      updatedUser.permissions = normalizePermissions(updatedUser.permissions);

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
  Permission Helpers
  ============================================================ */

  const hasPermission = (permission) => {
    if (!user) return false;

    if (user.role && user.role.toLowerCase() === "admin") {
      return true;
    }

    const perms = user.permissions || {};

    if (typeof perms[permission] === "boolean") {
      return perms[permission];
    }

    return false;
  };

  const hasAnyPermission = (...permissionList) => {
    if (!user) return false;

    if (user.role && user.role.toLowerCase() === "admin") {
      return true;
    }

    return permissionList.some(
      (p) => user.permissions && user.permissions[p] === true
    );
  };

  const canAccessUser = (permissionKey, targetUserId) => {
    if (!user) return false;

    if (user.role && user.role.toLowerCase() === "admin") {
      return true;
    }

    const perms = user.permissions || {};
    const allowedIds = perms[permissionKey];

    return Array.isArray(allowedIds) && allowedIds.includes(targetUserId);
  };

  const isOwner = (ownerId) => {
    if (!user) return false;
    return ownerId === user.id;
  };

  /* ============================================================
  Context Value
  ============================================================ */

  const value = {
    user,
    loading,
    login,
    logout,
    refreshUser,
    hasPermission,
    hasAnyPermission,
    canAccessUser,
    isOwner,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

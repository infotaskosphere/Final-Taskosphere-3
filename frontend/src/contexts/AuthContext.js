import React, { createContext, useContext, useState, useEffect } from "react";
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

  // Load persisted auth data on mount
  useEffect(() => {
    const loadUserFromStorage = () => {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token");
      const storedUserJson = localStorage.getItem("user") || sessionStorage.getItem("user");

      if (!token || !storedUserJson) {
        setLoading(false);
        return;
      }

      try {
        const parsedUser = JSON.parse(storedUserJson);

        // Normalize permissions to always be an object
        parsedUser.permissions = parsedUser.permissions &&
          typeof parsedUser.permissions === "object" &&
          !Array.isArray(parsedUser.permissions)
          ? parsedUser.permissions
          : {};

        // Set auth header for all future requests
        api.defaults.headers.common.Authorization = `Bearer ${token}`;

        setUser(parsedUser);
      } catch (err) {
        console.error("Failed to restore user from storage:", err);
        logout();
      } finally {
        setLoading(false);
      }
    };

    loadUserFromStorage();
  }, []);

  // Login handler
  const login = (responseData, rememberMe = false) => {
    const storage = rememberMe ? localStorage : sessionStorage;

    const token = responseData?.access_token;
    const userData = responseData?.user;

    if (!token || !userData) {
      console.error("Login failed: invalid response structure", { responseData });
      return false;
    }

    // Normalize permissions to object
    userData.permissions = userData.permissions &&
      typeof userData.permissions === "object" &&
      !Array.isArray(userData.permissions)
      ? userData.permissions
      : {};

    // Persist
    storage.setItem("token", token);
    storage.setItem("user", JSON.stringify(userData));

    // Update axios default header
    api.defaults.headers.common.Authorization = `Bearer ${token}`;

    setUser(userData);
    return true;
  };

  // Logout handler
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");

    delete api.defaults.headers.common.Authorization;
    setUser(null);
  };

  // Check if user has a certain permission
  // Supports:
  // - boolean flags:    "export_reports": true
  // - access lists:     "view_other_tasks": ["uuid-123", "uuid-456"]
  const hasPermission = (permission) => {
    if (!user) return false;

    // Admin always has full access
    if (user.role?.toLowerCase() === "admin") {
      return true;
    }

    const perms = user.permissions || {};

    // Boolean permission
    if (perms[permission] === true) {
      return true;
    }

    // List-based permission → true if list is non-empty
    if (Array.isArray(perms[permission])) {
      return perms[permission].length > 0;
    }

    return false;
  };

  // Check if user can access a specific target user's data
  // Example: canAccessUser("manage_other_attendance", "user-uuid-789")
  const canAccessUser = (permissionKey, targetUserId) => {
    if (!user) return false;

    if (user.role?.toLowerCase() === "admin") {
      return true;
    }

    const perms = user.permissions || {};
    const allowedIds = perms[permissionKey];

    return Array.isArray(allowedIds) && allowedIds.includes(targetUserId);
  };

  const value = {
    user,
    loading,
    login,
    logout,
    hasPermission,
    canAccessUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

import React, { createContext, useContext, useState, useEffect } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ===============================
  // Load user from storage on app start
  // ===============================
  useEffect(() => {
    const loadUser = () => {
      let token =
        localStorage.getItem("token") ||
        sessionStorage.getItem("token");

      let storedUser =
        localStorage.getItem("user") ||
        sessionStorage.getItem("user");

      if (!token || !storedUser) {
        setLoading(false);
        return;
      }

      try {
        const parsedUser = JSON.parse(storedUser);

        // Ensure permissions exist
        if (!parsedUser.permissions) {
          parsedUser.permissions = [];
        }

        // Set axios header
        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;

        setUser(parsedUser);
      } catch (error) {
        console.error("Failed to parse stored user:", error);
        logout();
      }

      setLoading(false);
    };

    loadUser();
  }, []);

  // ===============================
  // Login
  // ===============================
  const login = (responseData, rememberMe) => {
    const storage = rememberMe ? localStorage : sessionStorage;

    const token = responseData?.access_token;
    const userData = responseData?.user;

    if (!token || !userData) {
      console.error("Invalid login response structure");
      return;
    }

    // Ensure permissions exist
    if (!userData.permissions) {
      userData.permissions = [];
    }

    // Save token & user
    storage.setItem("token", token);
    storage.setItem("user", JSON.stringify(userData));

    // Set axios header
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;

    setUser(userData);
  };

  // ===============================
  // Logout
  // ===============================
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");

    delete api.defaults.headers.common["Authorization"];

    setUser(null);
  };

  // ===============================
  // Permission Checker
  // ===============================
  const hasPermission = (permission) => {
    if (!user) return false;

    // Admin override (case insensitive)
    if (user.role?.toLowerCase() === "admin") {
      return true;
    }

    const perms = user.permissions;

    // If permissions is an array
    if (Array.isArray(perms)) {
      return perms.includes(permission);
    }

    // If permissions is an object
    if (typeof perms === "object") {
      return perms?.[permission] === true;
    }

    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

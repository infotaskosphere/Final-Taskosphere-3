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
  useEffect(() => {
    // Check localStorage first (persistent), then sessionStorage
    let token = localStorage.getItem("token");
    let storedUser = localStorage.getItem("user");
    if (!token || !storedUser) {
      token = sessionStorage.getItem("token");
      storedUser = sessionStorage.getItem("user");
    }
    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);

// Ensure permissions object exists
if (!parsedUser.permissions) {
  parsedUser.permissions = {};
}

setUser(parsedUser);
      } catch (error) {
        console.error("Failed to parse stored user:", error);
        localStorage.removeItem("user");
        localStorage.removeItem("token");
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("token");
      }
    }
    if (token) {
      api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    }
    setLoading(false);
  }, []);
  const login = (newUser, rememberMe) => {
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem("user", JSON.stringify(newUser));
    if (newUser.token) {
      storage.setItem("token", newUser.token);
      api.defaults.headers.common["Authorization"] = `Bearer ${newUser.token}`;
    }
    if (!newUser.permissions) {
  newUser.permissions = {};
}

setUser(newUser);
  };
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    setUser(null);
    // Clear axios default headers
    if (api.defaults?.headers?.common?.Authorization) {
      delete api.defaults.headers.common["Authorization"];
    }
    window.location.href = "/login";
  };
  const hasPermission = (permission) => {
  if (!user) return false;

  // Admin override
  if (user.role === "admin") return true;

  return user.permissions?.[permission] === true;
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

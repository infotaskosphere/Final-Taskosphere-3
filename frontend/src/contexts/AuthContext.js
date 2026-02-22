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

  // 🔹 Load user from storage on app start
  useEffect(() => {
    let token = localStorage.getItem("token");
    let storedUser = localStorage.getItem("user");

    if (!token || !storedUser) {
      token = sessionStorage.getItem("token");
      storedUser = sessionStorage.getItem("user");
    }

    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);

        if (!parsedUser.permissions) {
          parsedUser.permissions = {};
        }

        // Set axios header
        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;

        setUser(parsedUser);
      } catch (error) {
        console.error("Failed to parse stored user:", error);
        localStorage.clear();
        sessionStorage.clear();
      }
    }

    setLoading(false);
  }, []);

  // 🔹 Login function (corrected for FastAPI response)
  const login = (responseData, rememberMe) => {
    const storage = rememberMe ? localStorage : sessionStorage;

    const token = responseData.access_token;
    const userData = responseData.user;

    if (!token || !userData) {
      console.error("Invalid login response structure");
      return;
    }

    if (!userData.permissions) {
      userData.permissions = {};
    }

    // Save token
    storage.setItem("token", token);

    // Save user
    storage.setItem("user", JSON.stringify(userData));

    // Set axios header
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;

    // Update state
    setUser(userData);
  };

  // 🔹 Logout function
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");

    delete api.defaults.headers.common["Authorization"];

    setUser(null);
  };

  // 🔹 Permission checker
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

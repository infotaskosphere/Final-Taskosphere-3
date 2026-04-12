import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../lib/api";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

/* ── Helper: is "Keep me signed in" active for this session? ────────── */
const isKeepSignedIn = () => localStorage.getItem('taskosphere_keep_signed_in') === 'true';

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
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
    const token      = localStorage.getItem("token")      || sessionStorage.getItem("token");
    const storedUser = localStorage.getItem("user")       || sessionStorage.getItem("user");
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
    localStorage.removeItem("taskosphere_last_active");
    localStorage.removeItem("taskosphere_tab_closed");
    localStorage.removeItem("taskosphere_keep_signed_in"); // ← clear flag on logout
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    delete api.defaults.headers.common["Authorization"];
  };

  /* ============================================================
  Auto-logout: inactivity + tab/browser CLOSE
  Both are SKIPPED when "Keep me signed in" is active.
  ============================================================ */

  const INACTIVITY_LIMIT_MS = 6 * 60 * 60 * 1000; // 6 hours
  const LAST_ACTIVE_KEY     = 'taskosphere_last_active';

  useEffect(() => {
    const handleBeforeUnload = () => {
      // Only mark tab-closed when NOT in keep-signed-in mode
      if (!isKeepSignedIn() && localStorage.getItem('token')) {
        localStorage.setItem('taskosphere_tab_closed', Date.now().toString());
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!user) return;

    // Skip inactivity timer entirely when keep-signed-in is active
    if (isKeepSignedIn()) return;

    const updateActivity = () => {
      localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, updateActivity, { passive: true }));
    updateActivity();

    const interval = setInterval(() => {
      const lastActive = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) || '0', 10);
      if (Date.now() - lastActive > INACTIVITY_LIMIT_MS) {
        logout();
      }
    }, 60 * 1000);

    return () => {
      events.forEach(e => window.removeEventListener(e, updateActivity));
      clearInterval(interval);
    };
  }, [user]);

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

      const navType =
        window.performance?.getEntriesByType?.('navigation')?.[0]?.type
        ?? (window.performance?.navigation?.type === 1 ? 'reload' : 'navigate');

      const isReload = navType === 'reload';

      const tabClosedAt = localStorage.getItem('taskosphere_tab_closed');
      if (tabClosedAt && localStorage.getItem('token')) {
        localStorage.removeItem('taskosphere_tab_closed');

        // If "keep signed in" is active → ignore the tab-closed flag entirely,
        // session should persist until punch-out.
        if (!isKeepSignedIn() && !isReload) {
          clearStorage();
          setLoading(false);
          return;
        }
        // Hard refresh OR keep-signed-in → keep the session
      }

      try {
        const parsedUser = JSON.parse(storedUser);
        parsedUser.permissions = normalizePermissions(parsedUser.permissions);

        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;

        const meRes = await api.get("/auth/me");
        const freshUser = meRes.data;
        freshUser.permissions = normalizePermissions(freshUser.permissions);

        const storage = localStorage.getItem("token") ? localStorage : sessionStorage;
        storage.setItem("user", JSON.stringify(freshUser));

        setUser(freshUser);

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
    const token    = responseData?.access_token || responseData?.token;
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
  NOTE: Call this from your Punch-Out handler too, so "keep signed in"
  sessions are properly terminated on punch-out:
    import { useAuth } from "@/contexts/AuthContext";
    const { logout } = useAuth();
    // inside punch-out handler:
    await recordPunchOut(); // your existing punch-out API call
    logout();
  ============================================================ */

  const logout = async () => {
    try {
      window.__STOP_ACTIVITY__ = true;
      clearStorage();
      setUser(null);
    } catch (e) {
      console.error("Logout error", e);
      // Ensure storage is always cleared even if something above throws
      clearStorage();
      setUser(null);
    }
  };

  /* ============================================================
  Refresh User
  ============================================================ */

  const refreshUser = useCallback(async () => {
    try {
      const response   = await api.get("/auth/me");
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
    if (user.role?.toLowerCase() === "admin") return true;
    const perms = user.permissions || {};
    return typeof perms[permission] === "boolean" ? perms[permission] : false;
  };

  const hasAnyPermission = (...permissionList) => {
    if (!user) return false;
    if (user.role?.toLowerCase() === "admin") return true;
    return permissionList.some(p => user.permissions?.[p] === true);
  };

  const canAccessUser = (permissionKey, targetUserId) => {
    if (!user) return false;
    if (user.role?.toLowerCase() === "admin") return true;
    const allowedIds = (user.permissions || {})[permissionKey];
    return Array.isArray(allowedIds) && allowedIds.includes(targetUserId);
  };

  const isOwner = (ownerId) => {
    if (!user) return false;
    return ownerId === user.id;
  };

  /* ============================================================
  Context Value
  ============================================================ */

  return (
    <AuthContext.Provider value={{
      user, loading,
      login, logout, refreshUser,
      hasPermission, hasAnyPermission, canAccessUser, isOwner,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

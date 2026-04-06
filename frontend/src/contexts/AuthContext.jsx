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

    // ✅ Ensure token is always attached
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  };

  const clearStorage = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("taskosphere_last_active");
    localStorage.removeItem("taskosphere_tab_closed");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");

    delete api.defaults.headers.common["Authorization"];
  };

  /* ============================================================
  Auto-logout: 20-minute inactivity + logout on tab/browser CLOSE
  (NOT on hard refresh — hard refresh is a reload, not a close)
  ============================================================ */

  const INACTIVITY_LIMIT_MS = 20 * 60 * 1000; // 20 minutes
  const LAST_ACTIVE_KEY = 'taskosphere_last_active';

  useEffect(() => {
    // On tab/browser close — mark a flag so next open forces re-login.
    // NOTE: beforeunload fires for BOTH tab close AND hard refresh.
    // We only want to honour the flag when the cause was an actual close,
    // NOT a reload.  We record the navigation type at mount time (before any
    // unload) so restoreSession can read it.
    const handleBeforeUnload = () => {
      if (localStorage.getItem('token')) {
        localStorage.setItem('taskosphere_tab_closed', Date.now().toString());
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!user) return;

    // Record last active time on any user interaction
    const updateActivity = () => {
      localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, updateActivity, { passive: true }));
    updateActivity(); // record now

    // Check inactivity every minute
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

      // Detect whether this page load is a RELOAD (hard refresh / F5) or a
      // genuine new navigation.  The Performance Navigation API is the most
      // reliable cross-browser way to do this.
      const navType =
        window.performance?.getEntriesByType?.('navigation')?.[0]?.type  // modern
        ?? (window.performance?.navigation?.type === 1 ? 'reload' : 'navigate'); // legacy

      const isReload = navType === 'reload';

      // Only honour the tab-closed flag when the page is NOT being reloaded.
      // Hard refresh sets the flag via beforeunload but immediately reloads —
      // without this guard it causes a spurious logout on every Ctrl+F5 / ⌘⇧R.
      const tabClosedAt = localStorage.getItem('taskosphere_tab_closed');
      if (tabClosedAt && localStorage.getItem('token')) {
        // Always remove the stale flag first
        localStorage.removeItem('taskosphere_tab_closed');

        if (!isReload) {
          // Genuine close → force re-login
          clearStorage();
          setLoading(false);
          return;
        }
        // It was a hard refresh → keep the session, just discard the flag
      }

      try {
        const parsedUser = JSON.parse(storedUser);
        parsedUser.permissions = normalizePermissions(parsedUser.permissions);

        // ✅ Attach token before API call
        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;

        // ✅ FIXED: Use the fresh response from /auth/me so that admin-revoked
        //    permissions are reflected immediately — no stale cache issue.
        const meRes = await api.get("/auth/me");
        const freshUser = meRes.data;
        freshUser.permissions = normalizePermissions(freshUser.permissions);

        // Persist the fresh user so next reload also starts clean
        const storage = localStorage.getItem("token") ? localStorage : sessionStorage;
        storage.setItem("user", JSON.stringify(freshUser));

        setUser(freshUser);

      } catch (error) {
        if (error.message === "Network Error") {
          // Backend unreachable (offline) — fall back to cached session
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
  Logout  ✅ FIXED (NO API CALL)
  ============================================================ */

  const logout = async () => {
    try {
      // 🚀 IMPORTANT: Stop activity tracking globally
      window.__STOP_ACTIVITY__ = true;

      // ❌ REMOVED: await api.post("/activity/logout")
      // Reason: This API does NOT exist → was causing 404

    } catch (e) {
      console.error("Logout error", e);
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
      const response = await api.get("/auth/me");
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

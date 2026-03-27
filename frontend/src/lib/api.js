import axios from "axios";
import { useState, useEffect } from "react";

/* ============================================================
   CONFIG
   ============================================================ */
const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  "https://final-taskosphere-backend.onrender.com";

// ⚠️ IMPORTANT: change only if backend does NOT use /api
const BASE_URL = `${BACKEND_URL.replace(/\/$/, "")}/api`;

const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

/* ============================================================
   GLOBAL LOADING STATE
   ============================================================ */
const listeners = new Set();
let activeRequests = 0;

export const onLoadingChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const setLoading = (isLoading) => {
  listeners.forEach((fn) => fn(isLoading));
};

/* ============================================================
   AXIOS INSTANCE
   ============================================================ */
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 120000,
  headers: { "Content-Type": "application/json" },
});

/* ============================================================
   REQUEST INTERCEPTOR (FIXED PROPERLY)
   ============================================================ */
api.interceptors.request.use(
  (config) => {
    const token = getToken();

    // ✅ PUBLIC ROUTES (NO TOKEN REQUIRED)
    const publicRoutes = [
      "/auth/login",
      "/auth/register",
      "/auth/signup",
      "/auth/forgot-password",
      "/auth/reset-password",
    ];

    const isPublic = publicRoutes.some((route) =>
      config.url?.includes(route)
    );

    // 🚫 BLOCK ONLY PROTECTED ROUTES
    if (!token && !isPublic) {
      return Promise.reject({
        message: "No auth token — request blocked",
        __CANCEL__: true,
      });
    }

    activeRequests++;
    if (activeRequests === 1) setLoading(true);

    // ✅ ATTACH TOKEN IF EXISTS
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // DEBUG LOGIN (optional)
    if (import.meta.env.DEV && config.url?.includes("/auth/login")) {
      console.log("LOGIN REQUEST:", config.data);
    }

    if (import.meta.env.DEV) {
      console.log(
        `API ${config.method?.toUpperCase()} -> ${config.baseURL}${config.url}`
      );
    }

    return config;
  },
  (error) => {
    activeRequests = Math.max(0, activeRequests - 1);
    if (activeRequests === 0) setLoading(false);
    return Promise.reject(error);
  }
);

/* ============================================================
   RESPONSE INTERCEPTOR
   ============================================================ */
api.interceptors.response.use(
  (response) => {
    activeRequests = Math.max(0, activeRequests - 1);
    if (activeRequests === 0) setLoading(false);
    return response;
  },
  (error) => {
    // ✅ IGNORE BLOCKED REQUESTS
    if (error.__CANCEL__) {
      return Promise.reject(error);
    }

    activeRequests = Math.max(0, activeRequests - 1);
    if (activeRequests === 0) setLoading(false);

    const status = error.response?.status;
    const contentType = error.response?.headers["content-type"];

    if (contentType?.includes("text/html")) {
      console.error("Received HTML instead of JSON. Check API URL.");
    }

    if (!error.response) {
      console.error("Network error or backend unreachable.");
      return Promise.reject(error);
    }

    // 🔐 AUTO LOGOUT ONLY ON 401
    if (status === 401) {
      console.warn("Session expired — logging out.");

      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("user");

      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

/* ============================================================
   HOOK — useLoading()
   ============================================================ */
export function useLoading() {
  const [loading, setLoadingState] = useState(false);

  useEffect(() => {
    const unsub = onLoadingChange(setLoadingState);
    return unsub;
  }, []);

  return loading;
}

/* ============================================================
   SKELETON COMPONENTS
   ============================================================ */
const shimmerKeyframe = `
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

const skBase = {
  borderRadius: "8px",
  background:
    "linear-gradient(90deg, #e0e0e0 25%, #f5f5f5 50%, #e0e0e0 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.4s infinite",
};

export function SkeletonLine({ width = "100%", height = "14px", style = {} }) {
  return (
    <>
      <style>{shimmerKeyframe}</style>
      <div style={{ width, height, ...skBase, ...style }} />
    </>
  );
}

export function SkeletonCard({ rows = 3, style = {} }) {
  return (
    <>
      <style>{shimmerKeyframe}</style>
      <div
        style={{
          background: "#fff",
          border: "0.5px solid #eee",
          borderRadius: "12px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          ...style,
        }}
      >
        <div style={{ width: "50%", height: "16px", ...skBase }} />
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === rows - 1 ? "70%" : "100%",
              height: "12px",
              ...skBase,
            }}
          />
        ))}
      </div>
    </>
  );
}

export function SkeletonPage({ cards = 4 }) {
  return (
    <>
      <style>{shimmerKeyframe}</style>
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ width: "180px", height: "24px", marginBottom: "8px", ...skBase }} />
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} rows={3} />
        ))}
      </div>
    </>
  );
}

/* ============================================================
   EXPORT
   ============================================================ */
export default api;

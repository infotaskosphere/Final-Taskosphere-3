import axios from "axios";
import { useState, useEffect } from "react";

/* ============================================================
   CONFIG
   ============================================================ */
const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  "https://final-taskosphere-backend.onrender.com";

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
   REQUEST INTERCEPTOR
   ============================================================ */
api.interceptors.request.use(
  (config) => {
    activeRequests++;
    if (activeRequests === 1) setLoading(true);

    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;

    if (import.meta.env.DEV) {
      console.log(`🚀 [API Request] ${config.method?.toUpperCase()} -> ${config.baseURL}${config.url}`);
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
    activeRequests = Math.max(0, activeRequests - 1);
    if (activeRequests === 0) setLoading(false);

    const status = error.response?.status;
    const contentType = error.response?.headers["content-type"];

    if (contentType?.includes("text/html")) {
      console.error("❌ CRITICAL: Received HTML instead of JSON. Check VITE_API_URL in Render.");
    }

    if (!error.response) {
      console.error("📡 Network Error: Backend is likely sleeping or CORS is blocked.");
      return Promise.reject(error);
    }

    if (status === 401) {
      console.warn("🔑 Session expired — Logging out.");
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("user");
      if (window.location.pathname !== "/login") window.location.href = "/login";
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
   SKELETON — inline styles only, no document.createElement
   ============================================================ */
const shimmerKeyframe = `
  @keyframes shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

const skBase = {
  borderRadius: "8px",
  background: "linear-gradient(90deg, #e0e0e0 25%, #f5f5f5 50%, #e0e0e0 75%)",
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
      <div style={{
        background: "#fff",
        border: "0.5px solid #eee",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        ...style
      }}>
        <div style={{ width: "50%", height: "16px", ...skBase }} />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{
            width: i === rows - 1 ? "70%" : "100%",
            height: "12px",
            ...skBase
          }} />
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
   EXPORTS
   ============================================================ */
export default api;

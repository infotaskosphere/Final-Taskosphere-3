import axios from "axios";
import { useState, useEffect } from "react";

// ✅ Normalise: always ensure the base ends with /api
let _raw =
  import.meta.env.VITE_API_URL ||
  "https://final-taskosphere-backend.onrender.com";

// Strip trailing slash(es), then append /api if missing
_raw = _raw.replace(/\/+$/, "");
if (!_raw.endsWith("/api")) {
  _raw += "/api";
}

const BASE_URL = _raw;

// ─── Token Helpers ───────────────────────────────────────────
// NOTE: Must match the key used by AuthContext ("token") so that
// clearToken() in the 401 interceptor actually removes the session.
const TOKEN_KEY = "token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (tok) => localStorage.setItem(TOKEN_KEY, tok);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// ─── Global Loading State ─────────────────────────────────────
let _activeRequests = 0;
const _subscribers = new Set();

function _setLoading(delta) {
  _activeRequests = Math.max(0, _activeRequests + delta);
  const isLoading = _activeRequests > 0;
  _subscribers.forEach((fn) => fn(isLoading));
}

export function useLoading() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    _subscribers.add(setLoading);
    return () => _subscribers.delete(setLoading);
  }, []);

  return loading;
}

// ─── Axios Instance ───────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: { "Content-Type": "application/json" },
});

// ─── Request Interceptor ──────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (!config._silent) {
      _setLoading(+1);
    }

    return config;
  },
  (error) => {
    _setLoading(-1);
    return Promise.reject(error);
  }
);

// ─── Response Interceptor ─────────────────────────────────────
api.interceptors.response.use(
  (response) => {
    if (!response.config._silent) _setLoading(-1);
    return response;
  },
  (error) => {
    if (!error.config?._silent) _setLoading(-1);

    // 🔐 401 → session expired, redirect to login
    if (error.response?.status === 401) {
      clearToken();
      localStorage.removeItem("user");
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("token");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }

    // 🚫 403 → permission denied
    // Per-page components handle 403s with toast messages — do NOT redirect
    // globally here. A blanket redirect was bouncing users to /dashboard
    // whenever any secondary call (e.g. GET /users for a dropdown) returned
    // 403, even if the primary page data loaded successfully.
    // The custom event lets AuthContext refresh permissions silently.
    if (error.response?.status === 403) {
      window.dispatchEvent(new CustomEvent("permission-denied"));
    }

    // ⚠️ 422 validation
    if (error.response?.status === 422) {
      const detail = error.response.data?.detail;
      if (Array.isArray(detail)) {
        const msg = detail
          .map((e) => {
            const field = e.loc?.slice(-1)[0] ?? "field";
            return `${field}: ${e.msg}`;
          })
          .join(" · ");
        error.response.data._normalised = msg;
      }
    }

    return Promise.reject(error);
  }
);

// ─── Helpers ─────────────────────────────────────────────────
export const silentGet = (url, config = {}) =>
  api.get(url, { ...config, _silent: true });

export const upload = (url, formData, config = {}) =>
  api.post(url, formData, {
    ...config,
    headers: { "Content-Type": "multipart/form-data", ...config.headers },
  });

// ─── Error Formatter ─────────────────────────────────────────
export function getErrorMessage(error) {
  if (!error) return "An unknown error occurred";

  const data = error.response?.data;

  if (!data) return error.message || "Network error";
  if (data._normalised) return data._normalised;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail))
    return data.detail.map((e) => e.msg).join(", ");
  if (typeof data.message === "string") return data.message;

  return "Request failed";
}

export default api;

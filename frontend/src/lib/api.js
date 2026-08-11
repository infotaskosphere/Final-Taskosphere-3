import axios from "axios";
import { useState, useEffect, useRef } from "react";

// ✅ Normalise: always ensure the base ends with /api
//
// Resolution order (highest priority first):
//   1. window.__TASKOSPHERE_API_URL__ — a runtime override you can set in
//      index.html or via your hosting provider's environment-variable
//      injection, WITHOUT needing a rebuild. This is the recommended way
//      to point a custom domain (e.g. taskosphere.com) at its backend.
//   2. VITE_API_URL — a build-time env var (baked into the bundle).
//   3. "" (same-origin) for known dev/preview hosts.
//   4. A hardcoded last-resort guess. If we ever get here on a real
//      deployment, something isn't configured — we log a loud warning so
//      it's easy to diagnose instead of silently 404-ing on every request.
const _isDevOrPreviewHost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname.includes(".run.app") ||
    window.location.hostname.includes("emergentagent.com"));

const _runtimeOverride =
  typeof window !== "undefined" ? window.__TASKOSPHERE_API_URL__ : undefined;

const _configuredApiUrl = _runtimeOverride || import.meta.env.VITE_API_URL || "";
const _defaultBackendUrl = "https://final-taskosphere-backend.onrender.com";

// Some older Render builds accidentally injected the frontend URL into
// VITE_API_URL. That makes every authenticated page request
// `frontend.onrender.com/api/...`, which is a frontend 404 rather than an API
// response. Correct that known deployment pairing while still honoring an
// explicit runtime override.
const _configuredUrlIsFrontendHost = (() => {
  if (!_configuredApiUrl || _runtimeOverride || typeof window === "undefined") {
    return false;
  }
  try {
    const configuredHost = new URL(_configuredApiUrl, window.location.origin).hostname;
    return configuredHost.endsWith("-frontend.onrender.com");
  } catch {
    return false;
  }
})();

let _raw =
  _runtimeOverride ||
  (_configuredUrlIsFrontendHost
    ? _configuredApiUrl.replace("-frontend.onrender.com", "-backend.onrender.com")
    : _configuredApiUrl) ||
  (_isDevOrPreviewHost ? "" : _defaultBackendUrl);

if (
  typeof window !== "undefined" &&
  !_runtimeOverride &&
  !_configuredApiUrl &&
  !_isDevOrPreviewHost
) {
  // eslint-disable-next-line no-console
  console.warn(
    "[api] No VITE_API_URL or window.__TASKOSPHERE_API_URL__ configured for host " +
      `"${window.location.hostname}". Falling back to a hardcoded guess (` +
      `${_raw}). If API calls are failing (404s across the board), this ` +
      "guessed backend URL is likely wrong or the service is down — set " +
      "window.__TASKOSPHERE_API_URL__ in index.html or VITE_API_URL at " +
      "build time to the real backend URL."
  );
}

// Strip trailing slash(es), then append /api if missing
_raw = _raw.replace(/\/+$/, "");
if (!_raw.endsWith("/api")) {
  _raw += "/api";
}

const BASE_URL = _raw;
export { BASE_URL };

// ─── Token Helpers ───────────────────────────────────────────
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

// ─── Request Deduplication Cache ──────────────────────────────
// Prevents identical GET requests fired within 300ms from hitting the network twice.
// Keyed by full URL string; values are in-flight Promise references.
const _inflight = new Map();
const DEDUP_WINDOW_MS = 300;

// ─── Axios Instance ───────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 300000,
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

// ─── Deduplicated GET ─────────────────────────────────────────
// Use this for any GET that might be called concurrently from multiple
// components (e.g. /tasks, /users on Dashboard load).
// If an identical request is already in-flight it returns the same promise
// instead of firing a second network request.
export const deduplicatedGet = (url, config = {}) => {
  const key = url + (config.params ? JSON.stringify(config.params) : "");
  if (_inflight.has(key)) return _inflight.get(key);
  const promise = api.get(url, config).finally(() => {
    // Remove from cache after short window so rapid re-fetches still dedup
    setTimeout(() => _inflight.delete(key), DEDUP_WINDOW_MS);
  });
  _inflight.set(key, promise);
  return promise;
};

// ─── Parallel Fetch Helper ────────────────────────────────────
// Fires multiple GET requests in parallel with automatic deduplication.
// Returns an object keyed by the supplied map keys.
// Usage: parallelGet({ tasks: '/tasks', users: '/users' })
export const parallelGet = async (urlMap, config = {}) => {
  const keys = Object.keys(urlMap);
  const results = await Promise.allSettled(
    keys.map((k) => deduplicatedGet(urlMap[k], config))
  );
  return Object.fromEntries(
    keys.map((k, i) => [
      k,
      results[i].status === "fulfilled" ? results[i].value : null,
    ])
  );
};

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

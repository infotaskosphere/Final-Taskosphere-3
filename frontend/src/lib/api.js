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
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.includes(".run.app") ||
    window.location.hostname.includes("emergentagent.com") ||
    window.location.hostname.includes(".replit.dev") ||
    window.location.hostname.includes(".replit.app") ||
    window.location.hostname.endsWith(".repl.co"));

const _runtimeOverride =
  typeof window !== "undefined" ? window.__TASKOSPHERE_API_URL__ : undefined;

const _configuredApiUrl = _runtimeOverride || import.meta.env.VITE_API_URL || "";
const _defaultBackendUrl = "https://api.taskosphere.com";

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

// ─── Backend Reachability State ────────────────────────────────
// Tracks consecutive network-level failures (DNS resolution failure like
// ERR_NAME_NOT_RESOLVED, connection refused, CORS-blocked, or timeout —
// i.e. requests that never got an HTTP response at all, as opposed to a
// normal 4xx/5xx). Used to surface a clear "can't reach the server" banner
// instead of leaving people staring at silent console errors when
// VITE_API_URL points at a backend host that is down, renamed, or deleted.
let _consecutiveNetworkFailures = 0;
let _backendUnreachable = false;
const _NETWORK_FAILURE_THRESHOLD = 2; // avoid flapping on a single blip
const _reachabilitySubscribers = new Set();

function _reportNetworkResult(ok) {
  if (ok) {
    _consecutiveNetworkFailures = 0;
    if (_backendUnreachable) {
      _backendUnreachable = false;
      _reachabilitySubscribers.forEach((fn) => fn(false));
    }
    return;
  }
  _consecutiveNetworkFailures += 1;
  if (
    !_backendUnreachable &&
    _consecutiveNetworkFailures >= _NETWORK_FAILURE_THRESHOLD
  ) {
    _backendUnreachable = true;
    _reachabilitySubscribers.forEach((fn) => fn(true));
  }
}

export function useBackendUnreachable() {
  const [unreachable, setUnreachable] = useState(_backendUnreachable);

  useEffect(() => {
    _reachabilitySubscribers.add(setUnreachable);
    return () => _reachabilitySubscribers.delete(setUnreachable);
  }, []);

  return unreachable;
}

// ─── Request Deduplication Cache ──────────────────────────────
// Prevents identical GET requests fired within 300ms from hitting the network twice.
// Keyed by full URL string; values are in-flight Promise references.
const _inflight = new Map();
const DEDUP_WINDOW_MS = 300;


// ─── Backend Readiness Gate (fixes cold-start 404 bursts) ─────
// Render puts free/standby web services to sleep. While the service is
// waking up (or mid-deploy) its edge answers EVERY /api/* request with a
// 404/502 even though the route exists. Pages that fetch on mount
// (Quotations -> /api/quotations + /api/companies) therefore rendered empty
// with a wall of console 404s.
//
// Fix: before the first API GET goes out, wait until the backend answers its
// unauthenticated /health probe. All requests queue behind one shared probe,
// so a cold start costs a single wait instead of dozens of failed calls.
const HEALTH_URL = `${BASE_URL.replace(/\/api$/, "")}/health`;
let _readyPromise = null;
let _isReady = false;

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function markBackendNotReady() {
  _isReady = false;
  _readyPromise = null;
}

export function ensureBackendReady() {
  if (_isReady) return Promise.resolve(true);
  if (_readyPromise) return _readyPromise;

  _readyPromise = (async () => {
    // ~75s total: comfortably covers a Render cold start.
    const backoffs = [0, 1000, 2000, 3000, 5000, 8000, 8000, 12000, 12000, 12000, 12000];
    for (const wait of backoffs) {
      if (wait) await _sleep(wait);
      try {
        await axios.get(HEALTH_URL, { timeout: 15000 });
        _isReady = true;
        _reportNetworkResult(true);
        return true;
      } catch (err) {
        // A 4xx/5xx still proves the host is reachable and serving; only keep
        // waiting while it is asleep / mid-deploy (404, 502, 503, 504, no response).
        const status = err?.response?.status;
        if (status && ![404, 500, 502, 503, 504].includes(status)) {
          _isReady = true;
          return true;
        }
      }
    }
    // Give up waiting — let the normal retry/degrade path handle it.
    _readyPromise = null;
    return false;
  })();

  return _readyPromise;
}

// ─── Axios Instance ───────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 300000,
  headers: { "Content-Type": "application/json" },
});

// ─── Request Interceptor ──────────────────────────────────────
api.interceptors.request.use(
  async (config) => {
    // Wait for a cold-started backend before firing the request.
    if (!config._skipReadyGate) {
      await ensureBackendReady();
    }

    // Some deployed collection routes are registered with a trailing slash.
    // Normalize them before the request reaches the server so the browser
    // does not log an avoidable 404 for the no-slash URL first.
    const [requestPath, requestQuery = ""] = (config.url || "").split("?");
    const trailingSlashCollections = new Set([
      "/notifications",
      "/visits",
      "/leads",
    ]);
    if (
      config.method?.toLowerCase() === "get" &&
      trailingSlashCollections.has(requestPath.replace(/\/+$/, ""))
    ) {
      config.url = `${requestPath.replace(/\/+$/, "")}/${requestQuery ? `?${requestQuery}` : ""}`;
    }

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
    _reportNetworkResult(true);
    return response;
  },
  (error) => {
    if (!error.config?._silent) _setLoading(-1);

    // No `error.response` means the request never got an HTTP response at
    // all (DNS failure, connection refused, CORS block, timeout) — a true
    // "can't reach the backend" condition, distinct from a normal 4xx/5xx
    // where the server did respond.
    _reportNetworkResult(Boolean(error.response));

    // Older Taskosphere backend deployments registered collection routes with
    // a trailing slash while the frontend requested the canonical no-slash
    // form. Retry only these known collection endpoints once so a rolling
    // frontend/backend deployment does not turn dashboard widgets into 404s.
    // Resource-specific 404s (for example /tasks/:id) are never rewritten.
    const requestUrl = error.config?.url || "";
    const [requestPath, requestQuery = ""] = requestUrl.split("?");
    const normalisedPath = requestPath.replace(/\/+$/, "");
    const slashCompatibleCollections = new Set([
      "/notifications",
      "/visits",
      "/leads",
      "/quotations",
      "/quotations/list",
      "/companies",
      "/companies/list",
      "/compliance",
      "/passwords",
      "/client-discussion",
    ]);
    const isCollectionGet =
      error.config?.method?.toLowerCase() === "get" &&
      slashCompatibleCollections.has(normalisedPath);

    // Render's edge answers /api/* with 404 (and sometimes 502/503) while the
    // backend service is cold-starting or mid-deploy, even though the route
    // exists in the live OpenAPI schema — this is what produces the bursts of
    // `GET /api/quotations 404` / `GET /api/companies 404` on Client Proposals
    // and Quotations. Treat those as transient and retry the SAME url with
    // backoff before doing anything else.
    const transientStatus =
      error.response?.status === 404 ||
      error.response?.status === 502 ||
      error.response?.status === 503 ||
      error.response?.status === 504;

    // Only flip the shared "not ready" flag on the FIRST sign of trouble for
    // a given request chain, not on every retry of the same request.
    //
    // BUG FIX (see incident notes above the safety net in server.py): this
    // used to fire unconditionally, so every one of the retries below
    // re-entered the request interceptor with _isReady=false and re-ran the
    // full up-to-75s ensureBackendReady() health probe BEFORE each retry even
    // fired. With 4+ parallel collection requests on page mount (companies,
    // quotations, quotations/services, etc.) each independently resetting
    // readiness on every attempt, the health probe kept restarting for
    // sibling requests too — producing the exploding, ever-deeper nested
    // retry/backoff console spam (visible as repeated
    // "setTimeout > api.request > ..." stack growth) instead of a single
    // clean wait-then-recover cycle. A 404 already proves the host answered
    // at the network level, so retries of *this* request no longer need to
    // re-wait on /health (see _skipReadyGate below); we still mark the app
    // "not ready" once so genuinely new requests queue behind one shared probe.
    if (transientStatus && !error.config?._coldStartAttempt) {
      markBackendNotReady();
    }

    if (isCollectionGet && transientStatus) {
      const attempt = error.config._coldStartAttempt || 0;
      // Render's free tier can take 30–60s to finish waking a sleeping
      // service (or to finish a rolling deploy). The old budget here was
      // only ~6.5s total, so the page gave up and showed "0 companies" /
      // "0 quotations" long before the backend was actually ready — this is
      // what was really causing the persistent-looking 404s. Extend the
      // budget to comfortably cover a full cold start (~50s across 9 tries).
      const backoffs = [1000, 2000, 3000, 5000, 6000, 7000, 8000, 8000, 8000];
      if (attempt < backoffs.length) {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            api
              .request({
                ...error.config,
                _coldStartAttempt: attempt + 1,
                // We already got an HTTP response (even if 404) from the
                // server for this request, so it's reachable — skip
                // re-probing /health on every retry of the same request.
                _skipReadyGate: true,
              })
              .then(resolve)
              .catch(reject);
          }, backoffs[attempt]);
        });
      }

      // Retries exhausted: try the legacy trailing-slash form once, in case an
      // older backend build really did register the route with a slash.
      if (error.response?.status === 404 && !error.config?._slashRetry) {
        return api
          .request({
            ...error.config,
            url: `${normalisedPath}/${requestQuery ? `?${requestQuery}` : ""}`,
            _slashRetry: true,
            _coldStartAttempt: backoffs.length,
            _skipReadyGate: true,
          })
          .catch(() =>
            Promise.resolve({
              data: [],
              status: 200,
              statusText: "OK (empty — collection endpoint unavailable)",
              headers: error.response?.headers || {},
              config: error.config,
              _degraded: true,
            })
          );
      }

      // Degrade to an empty collection so dashboard widgets render "0"
      // instead of breaking the whole page render.
      return Promise.resolve({
        data: [],
        status: 200,
        statusText: "OK (empty — collection endpoint unavailable)",
        headers: error.response?.headers || {},
        config: error.config,
        _degraded: true,
      });
    }

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

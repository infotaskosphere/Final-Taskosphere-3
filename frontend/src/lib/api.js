import axios from "axios";

/**
 * VITE ENVIRONMENT VARIABLE CONFIGURATION
 * ---------------------------------------
 * In Render (Frontend Service), you MUST set:
 * Key: VITE_API_URL
 * Value: https://final-taskosphere-backend.onrender.com
 */

const BACKEND_URL =
  import.meta.env.VITE_API_URL || 
  "https://final-taskosphere-backend.onrender.com";

// Ensures the URL always ends with /api and handles trailing slashes safely
const BASE_URL = `${BACKEND_URL.replace(/\/$/, "")}/api`;

const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 120000, // 2-minute timeout to handle Render "Cold Starts"
  headers: {
    "Content-Type": "application/json",
  },
});

/* ============================================================
   REQUEST INTERCEPTOR: Attach JWT Token
   ============================================================ */
api.interceptors.request.use(
  (config) => {
    const token = getToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Logging for development
    if (import.meta.env.DEV) {
      console.log(
        `🚀 [API Request] ${config.method?.toUpperCase()} -> ${config.baseURL}${config.url}`
      );
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/* ============================================================
   RESPONSE INTERCEPTOR: Global Error & Auth Handling
   ============================================================ */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const contentType = error.response?.headers["content-type"];

    // 1. Handle "Unexpected token <" (Received HTML instead of JSON)
    if (contentType && contentType.includes("text/html")) {
      console.error(
        "❌ CRITICAL ERROR: Received HTML instead of JSON. Check VITE_API_URL in Render."
      );
    }

    // 2. Handle Network Errors (Backend Sleeping/Down)
    if (!error.response) {
      console.error("📡 Network Error: Backend is likely sleeping or CORS is blocked.");
      return Promise.reject(error);
    }

    // 3. Handle Unauthorized (401) - Clear Session & Redirect
    if (status === 401) {
      console.warn("🔑 Session expired — Logging out.");
      
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

export default api;

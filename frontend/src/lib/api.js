import axios from "axios";

/**
 * Global API configuration for Taskosphere.
 * Handles base URL, JWT token injection, and global 403/401 error catching.
 */

const BASE_URL =
  process.env.REACT_APP_BACKEND_URL
    ? `${process.env.REACT_APP_BACKEND_URL}/api`
    : "https://final-taskosphere-backend.onrender.com";

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

/* ===============================
   Attach JWT Token Automatically
================================= */
api.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem("token");

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Debug outgoing requests
      console.log(
        `[API Outgoing] ${config.method?.toUpperCase()} ${config.url}`
      );

      return config;
    } catch (err) {
      console.error("Request interceptor error:", err);
      return config;
    }
  },
  (error) => Promise.reject(error)
);

/* ===============================
   Global Error Handling
================================= */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    // Handle 401 Unauthorized
    if (status === 401) {
      console.warn("401 Unauthorized detected.");

      const token = localStorage.getItem("token");

      // Only clear session if token actually exists
      if (token) {
        console.warn("Clearing invalid session...");

        localStorage.removeItem("token");
        localStorage.removeItem("user");

        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }

    // Optional: Handle 403 (Forbidden)
    if (status === 403) {
      console.warn("403 Forbidden: Insufficient permissions.");
    }

    return Promise.reject(error);
  }
);

export default api;

/* ===============================
   Optional Helper Functions
================================= */

export const fetchDashboardData = async () => {
  const response = await api.get("/dashboard/stats");
  return response.data;
};

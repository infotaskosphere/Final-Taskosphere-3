import axios from "axios";

/**
 * Global API configuration for Taskosphere.
 * Handles base URL, JWT token injection, and global 403/401 error catching.
 */
const BASE_URL =
  process.env.REACT_APP_BACKEND_URL
    ? `${process.env.REACT_APP_BACKEND_URL}/api`
    : "https://final-taskosphere-backend.onrender.com/api";

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
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Verifies outgoing requests in the browser console
    console.log(`[API Outgoing] ${config.method.toUpperCase()} ${config.url}`);
    return config;
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

    // 401/403: Session expired or insufficient permissions
    if (status === 401) {
      console.error(`${status}: Access denied. Clearing local session...`);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
export const fetchDashboardData = async () => {
  const response = await api.get("/dashboard/stats");
  return response.data;
};

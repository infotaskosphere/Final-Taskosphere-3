import axios from "axios";

const BACKEND =
  process.env.REACT_APP_BACKEND_URL ||
  "https://final-taskosphere-backend.onrender.com";

const BASE_URL = `${BACKEND.replace(/\/$/, "")}/api`;

const getToken = () =>
  localStorage.getItem("token") || sessionStorage.getItem("token");

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
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
      const token = getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[API Outgoing] ${config.method?.toUpperCase()} ${config.url}`
        );
      }
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

    // NETWORK ERROR
    if (!error.response) {
      console.error("Network error:", error.message);
      return Promise.reject(error);
    }

    // 401 Unauthorized
    if (status === 401) {
      console.warn("401 Unauthorized detected.");

      const token = getToken();

      if (token) {
        console.warn("Clearing invalid session...");

        localStorage.removeItem("token");
        localStorage.removeItem("user");
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");

        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }

    // 403 Forbidden
    if (status === 403) {
      console.warn("403 Forbidden: Insufficient permissions.");
    }

    return Promise.reject(error);
  }
);

/* ===============================
   Optional Helper Functions
================================= */
export const fetchDashboardData = async () => {
  const response = await api.get("/dashboard/stats");
  return response.data;
};

export const safeApiCall = async (requestFn) => {
  try {
    const response = await requestFn();
    return response.data;
  } catch (err) {
    console.error("API error:", err);
    throw err;
  }
};

export default api;
